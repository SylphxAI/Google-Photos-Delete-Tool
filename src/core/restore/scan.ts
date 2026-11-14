/**
 * Offline grid scan for blurry and low-resolution photo candidates in Google Photos.
 *
 * Reuses the versioned selector-pack tile harvester from `src/core/dedup/browser-grid.ts`
 * (`harvestGridTiles`, `isGooglePhotosThumbHost`).
 *
 * Privacy hard line: ZERO external network requests occur during scan. Only
 * Google Photos' own rendered thumbnail hosts (`*.googleusercontent.com`,
 * `*.usercontent.google.com`) over HTTPS may be read. Any other URL is
 * rejected before `fetch`.
 */
import type { ScrollTarget } from '../dom-adapter'
import {
  harvestGridTiles,
  isGoogleImageUrl,
  sizedThumbUrl,
} from '../dedup/browser-grid'
import { parseLabelDate, type GridTile } from '../dedup/scan'
import {
  analyzeImageQuality,
  type RestoreAnalysis,
  type RestoreDetectorOptions,
} from './detector'

export { harvestGridTiles, sizedThumbUrl }
export type { GridTile }

/** True only for Google Photos' own rendered thumbnail hosts over HTTPS. */
export function isGooglePhotosThumbHost(url: string): boolean {
  return isGoogleImageUrl(url)
}

export interface DecodedThumbnail {
  data: ArrayLike<number>
  width: number
  height: number
}

export interface RestoreCandidate {
  id: string
  label: string | null
  thumbUrl: string
  order: number
  takenAt: number | null
  width: number
  height: number
  analysis: RestoreAnalysis
}

export interface RestoreScanProgress {
  phase: 'scanning' | 'analyzing' | 'done' | 'cancelled'
  found: number
  analyzed: number
  candidates: number
  failed: number
}

export interface RestoreScanOptions extends RestoreDetectorOptions {
  signal?: AbortSignal
  onProgress?: (p: RestoreScanProgress) => void
  concurrency?: number
  scrollSettleMs?: number
  pollMs?: number
  endOfListAttempts?: number
  /** When true, include sharp items in `allItems` as well as `candidates`. */
  includeSharp?: boolean
}

export interface RestoreScanDeps {
  harvest(): GridTile[]
  findScrollTarget?: () => ScrollTarget | null
  /** Read and analyze one Google Photos thumbnail; returns null when unreadable or blocked. */
  analyzeThumb(
    url: string,
    signal: AbortSignal,
  ): Promise<{ width: number; height: number; analysis: RestoreAnalysis } | null>
  sleep?: (ms: number) => Promise<void>
}

export interface RestoreScanResult {
  candidates: RestoreCandidate[]
  items: RestoreCandidate[]
  found: number
  analyzed: number
  failed: number
  cancelled: boolean
}

/**
 * Parse original dimensions from a Google Photos thumbnail URL suffix when
 * present (e.g. `=w288-h192-no`), or fall back to decoded bitmap dimensions.
 */
export function parseThumbUrlDimensions(
  url: string,
): { width: number; height: number } | null {
  const m = /=w(\d+)-h(\d+)/.exec(url)
  if (!m) return null
  const width = Number(m[1])
  const height = Number(m[2])
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return null
  }
  return { width, height }
}

function pageFetch(): typeof fetch {
  const f = (globalThis as { content?: { fetch?: typeof fetch } }).content?.fetch
  return typeof f === 'function' ? f : fetch
}

/**
 * Read a single rendered thumbnail from Google Photos' own image host and
 * analyze its sharpness and resolution locally in memory.
 *
 * Refuses any URL that is not on `*.googleusercontent.com` or
 * `*.usercontent.google.com` over HTTPS before touching `fetch`.
 */
export async function analyzeGooglePhotosThumbnail(
  url: string,
  opts: RestoreDetectorOptions & {
    signal?: AbortSignal
    fetchImpl?: typeof fetch
    decodeImage?: (blob: Blob) => Promise<DecodedThumbnail>
     reportedWidth?: number
    reportedHeight?: number
  } = {},
): Promise<{ width: number; height: number; analysis: RestoreAnalysis } | null> {
  if (!isGooglePhotosThumbHost(url)) {
    return null
  }
  const f = opts.fetchImpl ?? pageFetch()
  const res = await f(url, {
    credentials: 'include',
    cache: 'force-cache',
    signal: opts.signal,
  })
  if (!res.ok) return null

  const blob = await res.blob()
  let decoded: DecodedThumbnail
  if (opts.decodeImage) {
    decoded = await opts.decodeImage(blob)
  } else {
    const bitmap = await createImageBitmap(blob)
    try {
      const w = bitmap.width
      const h = bitmap.height
      const canvas =
        typeof OffscreenCanvas !== 'undefined'
          ? new OffscreenCanvas(w, h)
          : Object.assign(document.createElement('canvas'), { width: w, height: h })
      const ctx = canvas.getContext('2d', { willReadFrequently: true }) as
        | OffscreenCanvasRenderingContext2D
        | CanvasRenderingContext2D
        | null
      if (!ctx) throw new Error('Canvas 2D is not available in this browser.')
      ctx.drawImage(bitmap, 0, 0, w, h)
      const imgData = ctx.getImageData(0, 0, w, h)
      decoded = { data: imgData.data, width: w, height: h }
    } finally {
      bitmap.close()
    }
  }

  const parsedDims = parseThumbUrlDimensions(url)
  const effectiveWidth = opts.reportedWidth ?? parsedDims?.width ?? decoded.width
  const effectiveHeight = opts.reportedHeight ?? parsedDims?.height ?? decoded.height

  // Compute sharpness on the decoded buffer and combine with effective resolution.
  const pixelAnalysis = analyzeImageQuality(decoded.data, decoded.width, decoded.height, {
    ...opts,
    minDimensionThreshold: 1,
    minMegapixels: 0,
  })
  const minDimensionThreshold = opts.minDimensionThreshold ?? 720
  const minMegapixels = opts.minMegapixels ?? 0.5
  const isLowRes =
    Math.min(effectiveWidth, effectiveHeight) < minDimensionThreshold ||
    (effectiveWidth * effectiveHeight) / 1_000_000 < minMegapixels
  const isBlurry = pixelAnalysis.isBlurry
  const needsRestore = isBlurry || isLowRes
  const reason =
    isBlurry && isLowRes
      ? 'both'
      : isBlurry
        ? 'blurry'
        : isLowRes
          ? 'low_res'
          : 'sharp'

  return {
    width: effectiveWidth,
    height: effectiveHeight,
    analysis: {
      ...pixelAnalysis,
      isLowRes,
      needsRestore,
      reason,
    },
  }
}

export async function scanForRestoreCandidates(
  deps: RestoreScanDeps,
  opts: RestoreScanOptions = {},
): Promise<RestoreScanResult> {
  const signal = opts.signal ?? new AbortController().signal
  const concurrency = Math.max(1, opts.concurrency ?? 6)
  const settleMs = opts.scrollSettleMs ?? 1500
  const pollMs = opts.pollMs ?? 150
  const endAttempts = opts.endOfListAttempts ?? 3
  const sleep = deps.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)))

  const seen = new Map<string, { tile: GridTile; order: number }>()
  const queue: string[] = []
  let head = 0
  const analyzedMap = new Map<
    string,
    { width: number; height: number; analysis: RestoreAnalysis }
  >()
  let failed = 0
  let candidateCount = 0
  let scanning = true

  const progress = (phase: RestoreScanProgress['phase']): void =>
    opts.onProgress?.({
      phase,
      found: seen.size,
      analyzed: analyzedMap.size,
      candidates: candidateCount,
      failed,
    })

  const harvest = (): number => {
    let added = 0
    for (const tile of deps.harvest()) {
      if (!tile.id || seen.has(tile.id)) continue
      // Enforce Google Photos thumbnail host invariant at harvest boundary too.
      if (!isGooglePhotosThumbHost(tile.thumbUrl)) {
        failed++
        continue
      }
      seen.set(tile.id, { tile, order: seen.size })
      queue.push(tile.id)
      added++
    }
    if (added > 0) wake()
    return added
  }

  let wakeWaiters: (() => void)[] = []
  const wake = (): void => {
    const w = wakeWaiters
    wakeWaiters = []
    w.forEach((f) => f())
  }
  const waitForWork = (): Promise<void> =>
    new Promise((resolve) => wakeWaiters.push(resolve))
  signal.addEventListener('abort', wake, { once: true })

  const worker = async (): Promise<void> => {
    while (!signal.aborted) {
      const id = head < queue.length ? queue[head++] : undefined
      if (id === undefined) {
        if (!scanning) return
        await waitForWork()
        continue
      }
      const entry = seen.get(id)
      if (!entry) continue
      if (!isGooglePhotosThumbHost(entry.tile.thumbUrl)) {
        failed++
        progress(scanning ? 'scanning' : 'analyzing')
        continue
      }
      let res: { width: number; height: number; analysis: RestoreAnalysis } | null = null
      try {
        res = await deps.analyzeThumb(entry.tile.thumbUrl, signal)
      } catch {
        res = null
      }
      if (signal.aborted) return
      if (res) {
        analyzedMap.set(id, res)
        if (res.analysis.needsRestore) candidateCount++
      } else {
        failed++
      }
      progress(scanning ? 'scanning' : 'analyzing')
    }
  }

  const workers = Array.from({ length: concurrency }, () => worker())

  try {
    const target = deps.findScrollTarget?.() ?? null
    if (target) {
      target.scrollTo({ top: 0, left: 0, behavior: 'auto' })
      await sleep(pollMs)
    }
    harvest()
    progress('scanning')

    let idle = 0
    while (!signal.aborted && target) {
      const beforeTop = target.scrollTop
      const beforeHeight = target.scrollHeight
      target.scrollBy({
        top: Math.max(200, Math.floor((target.clientHeight || 800) * 0.9)),
        left: 0,
        behavior: 'auto',
      })

      let gained = 0
      let quietPolls = 0
      for (let waited = 0; waited < settleMs && !signal.aborted; waited += pollMs) {
        await sleep(pollMs)
        const added = harvest()
        gained += added
        quietPolls = added > 0 ? 0 : quietPolls + 1
        if (gained > 0 && quietPolls >= 2) break
      }
      progress('scanning')

      const moved = target.scrollTop > beforeTop || target.scrollHeight > beforeHeight
      const atBottom = target.scrollTop + target.clientHeight + 4 >= target.scrollHeight
      if (gained === 0 && (!moved || atBottom)) {
        idle++
        if (idle >= endAttempts) break
      } else {
        idle = 0
      }
    }
  } finally {
    scanning = false
    wake()
  }

  if (!signal.aborted) progress('analyzing')
  await Promise.all(workers)

  const items: RestoreCandidate[] = []
  const candidates: RestoreCandidate[] = []
  for (const [id, { tile, order }] of seen) {
    const analyzed = analyzedMap.get(id)
    if (!analyzed) continue
    const item: RestoreCandidate = {
      id,
      label: tile.label,
      thumbUrl: tile.thumbUrl,
      order,
      takenAt: parseLabelDate(tile.label),
      width: analyzed.width,
      height: analyzed.height,
      analysis: analyzed.analysis,
    }
    items.push(item)
    if (analyzed.analysis.needsRestore) {
      candidates.push(item)
    }
  }

  const cancelled = signal.aborted
  opts.onProgress?.({
    phase: cancelled ? 'cancelled' : 'done',
    found: seen.size,
    analyzed: analyzedMap.size,
    candidates: candidates.length,
    failed,
  })
  return {
    candidates,
    items: opts.includeSharp ? items : candidates,
    found: seen.size,
    analyzed: analyzedMap.size,
    failed,
    cancelled,
  }
}

export const scanRestoreView = scanForRestoreCandidates
