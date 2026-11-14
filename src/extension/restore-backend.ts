/**
 * AI 4K Restore and the Blurry / Low-Res review, wired for the extension's
 * content script: the studio's {@link RestoreBackend} on top of the Sylphx
 * wallet client, and the finder's on-device quality check on top of the
 * detector. Photos are read only from Google's own image hosts; the one photo
 * the person confirms is the only thing sent anywhere.
 */
import { analyzeImageQuality } from '../core/restore/detector'
import { isGooglePhotosThumbHost, sizedThumbUrl } from '../core/restore/scan'
import {
  RESTORE_PASS_OFFER, WALLET_TOKEN_KEY, executeAiRestore, fetchWalletBalance,
  type ExecuteAiRestoreResult, type WalletBalance,
} from '../core/restore/wallet'
import type { ScannedItem } from '../core/dedup/scan'
import type { FinderRestore } from '../ui/dupes/finder'
import type { QualityVerdict, RestoreBackend, RestorePhoto, WalletState } from '../ui/restore/studio'
import { chromePolicyStore, readWalletToken } from './api'

/** Thumbnail edge used for the sharpness check. */
export const PROBE_PX = 512

/** Firefox content scripts use `content.fetch` for page-context requests. */
function pageFetch(): typeof fetch {
  const f = (globalThis as { content?: { fetch?: typeof fetch } }).content?.fetch
  return typeof f === 'function' ? f : fetch
}

export function walletStateOf(b: WalletBalance): WalletState {
  if (b.subscriptionActive) return { kind: 'pass', credits: b.balance, monthly: RESTORE_PASS_OFFER.credits }
  return { kind: 'credits', credits: b.balance }
}

export function restoreFailureText(r: Extract<ExecuteAiRestoreResult, { ok: false }>): string {
  if (r.reason === 'insufficient_credits' || r.status === 402) return 'You are out of credits, so the photo was not restored. Top up to try again.'
  if (r.reason === 'wallet_auth_token_required' || r.status === 401) return 'Your Sylphx wallet needs to be connected again. Nothing was restored.'
  return 'The photo could not be restored. You were not charged for this attempt.'
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

export interface RestoreBackendDeps {
  readToken(): Promise<string | null>
  fetchImpl?: typeof fetch
  /** Subscribe to wallet-token changes (the `gpdt:activate-wallet` handoff). */
  onTokenChange?(cb: () => void): () => void
}

export function createRestoreBackend(deps: RestoreBackendDeps): RestoreBackend {
  return {
    async wallet() {
      const token = await deps.readToken()
      if (!token) return { kind: 'disconnected' }
      return walletStateOf(await fetchWalletBalance({ authToken: token, fetchImpl: deps.fetchImpl }))
    },
    async restore(photo: RestorePhoto, { signal }) {
      const token = await deps.readToken()
      if (!token) throw new Error('Connect a Sylphx wallet to restore photos. Nothing was sent.')
      const src = photo.sourceUrl ?? photo.previewUrl
      if (!isGooglePhotosThumbHost(src)) throw new Error('This photo could not be read from Google Photos. Nothing was sent.')
      const read = await (deps.fetchImpl ?? pageFetch())(src, { credentials: 'include', signal })
      if (!read.ok) throw new Error('This photo could not be read from Google Photos. Nothing was sent.')
      const image = await read.blob()
      signal.throwIfAborted()
      const r = await executeAiRestore({
        authToken: token,
        imageBlob: image,
        mimeType: image.type || 'image/jpeg',
        photoId: photo.id,
        // The studio calls restore() only after the transfer notice is confirmed.
        userConfirmedSinglePhotoTransfer: true,
      }, deps.fetchImpl)
      if (!r.ok) throw new Error(restoreFailureText(r))
      const bytes = r.restoredImageB64 ? base64ToBytes(r.restoredImageB64) : new Uint8Array()
      if (bytes.length === 0) throw new Error('The photo could not be restored. You were not charged for this attempt.')
      return { image: new Blob([bytes as BlobPart], { type: r.mimeType }), width: r.width, height: r.height }
    },
    onWalletChange: deps.onTokenChange,
  }
}

/**
 * On-device sharpness and size verdict for one decoded thumbnail. The image
 * host never returns more pixels than the photo has, so a thumbnail smaller
 * than the requested edge means the photo itself is that small. When the host
 * returns the full edge nothing is claimed about size.
 */
export function verdictOf(data: ArrayLike<number>, width: number, height: number, probePx = PROBE_PX): QualityVerdict {
  const a = analyzeImageQuality(data, width, height, { minDimensionThreshold: 1, minMegapixels: 0 })
  const lowRes = Math.max(width, height) < probePx
  return {
    kind: a.isBlurry ? 'blurry' : lowRes ? 'low-res' : 'sharp',
    sharpness: Math.min(1, Math.max(0, a.qualityScore / 100)),
    ...(lowRes ? { width, height } : {}),
  }
}

async function decode(blob: Blob): Promise<{ data: Uint8ClampedArray; width: number; height: number }> {
  const bitmap = await createImageBitmap(blob)
  try {
    const { width, height } = bitmap
    const canvas = typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(width, height)
      : Object.assign(document.createElement('canvas'), { width, height })
    const ctx = canvas.getContext('2d', { willReadFrequently: true }) as OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null
    if (!ctx) throw new Error('Canvas 2D is not available in this browser.')
    ctx.drawImage(bitmap, 0, 0)
    return { data: ctx.getImageData(0, 0, width, height).data, width, height }
  } finally {
    bitmap.close()
  }
}

/** Check every scanned thumbnail locally, a few at a time. */
export async function classifyThumbnails(
  items: ScannedItem[],
  opts: { signal: AbortSignal; onProgress?: (done: number, total: number) => void },
  fetchImpl: typeof fetch = pageFetch(),
  decodeImage: typeof decode = decode,
): Promise<Map<string, QualityVerdict>> {
  const out = new Map<string, QualityVerdict>()
  const queue = [...items]
  let done = 0
  const worker = async (): Promise<void> => {
    for (let item = queue.shift(); item && !opts.signal.aborted; item = queue.shift()) {
      const url = sizedThumbUrl(item.thumbUrl, PROBE_PX)
      try {
        if (isGooglePhotosThumbHost(url)) {
          const res = await fetchImpl(url, { credentials: 'include', cache: 'force-cache', signal: opts.signal })
          if (res.ok) {
            const img = await decodeImage(await res.blob())
            out.set(item.id, verdictOf(img.data, img.width, img.height))
          }
        }
      } catch {
        // An unreadable thumbnail gets no verdict; it is never flagged.
      }
      opts.onProgress?.(++done, items.length)
    }
  }
  await Promise.all(Array.from({ length: Math.min(4, items.length) }, worker))
  opts.signal.throwIfAborted()
  return out
}

function onWalletTokenChange(cb: () => void): () => void {
  const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string): void => {
    if (area === 'local' && WALLET_TOKEN_KEY in changes) cb()
  }
  chrome.storage.onChanged.addListener(listener)
  return () => chrome.storage.onChanged.removeListener(listener)
}

export function extensionFinderRestore(): FinderRestore {
  return {
    backend: createRestoreBackend({ readToken: readWalletToken, onTokenChange: onWalletTokenChange }),
    policyStore: chromePolicyStore,
    surface: 'gpdt_extension',
    classify: (items, opts) => classifyThumbnails(items, opts),
  }
}
