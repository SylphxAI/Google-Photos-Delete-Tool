/**
 * Content script — wires the DeleteEngine to chrome.runtime messages
 * from the popup and owns the "empty-trash" post-deletion navigation
 * (unified storage baton, survives the page reload).
 *
 * Lifecycle rules (root-cause fixes for the v2 races):
 *  - `engine` stays non-null until the run promise settles, so a Stop
 *    followed by an eager Start can never create a second engine while
 *    the first may still be clicking a confirm button.
 *  - Start is refused without a stored consent acknowledgment for any
 *    real (non-dry) run.
 *  - Stop resolves the engine to 'idle', never 'error'.
 *
 * All async chrome.* calls go through src/extension/api.ts promise
 * wrappers (callback-based) so this file is identical for Chromium MV3
 * and Firefox MV3. Only event listeners (`chrome.runtime.onMessage`)
 * use the raw API — they are callback-based in both browsers.
 */
import { DEFAULT_CONFIG, DeleteEngine, type Progress } from '../core'
import { PRO_FILTER_ERROR, describeFilter, filterRequiresPro, type PhotoFilter } from '../core/photo-filter'
import { openDuplicateFinder, type FinderView } from '../ui/dupes/finder'
import { extensionFinderRestore } from './restore-backend'
import { browserDom } from '../core/browser-dom'
import { findConfirmButton, findConfirmDialog, findEmptyTrashButton, isTrashEmpty } from '../core/selectors'
import { sleep } from '../core/utils'
import { diagnostics } from '../core/diagnostics'
import { evaluatePendingEmptyTrash, TRASH_URL } from '../core/empty-trash-baton'
import { runEmptyTrashFlow, type EmptyTrashStatus } from '../core/empty-trash'
import type { RunStatus } from '../core/status'
import { isSupportedPhotosUrl } from '../core/surface'
import {
  CONSENT_KEY,
  EMPTY_TRASH_ACK_KEY,
  EXTENSION_ADMISSION_ERROR,
  RUN_IN_PROGRESS_ERROR,
  admitConcurrentStart,
  admitDestructiveRun,
  shouldNavigateToEmptyTrash,
  type Acknowledgement,
} from '../core/consent'
import {
  isRunOccupied,
  StopRequested,
  waitUntilAbortable,
} from '../core/run-occupancy'
import { POST_RUN_PROMPT_KEY, claimPostRunPrompt, detectBrowser } from '../core/post-run-prompt'
import { PRO_VARIANT_KEY, getProVariant } from '../core/pro-moments'
import { verifyLicense } from '../core/license'
import { showPostRunPrompt } from '../ui/post-run/prompt'
import { LOCALES, detectBrowserLocale, setLocale } from './popup/i18n'
import { createChromeBaton, runtimeSendMessage, readProToken, storageGet, storageRemove, storageSet } from './api'

const LOG = '[gpdt:content]'

const STORAGE_KEYS = {
  /** Set by the popup; observed once when the engine finishes. */
  emptyTrashAfter: 'gpdt_emptyAfter',
  consent: CONSENT_KEY,
  emptyTrashAck: EMPTY_TRASH_ACK_KEY,
} as const

async function readChromeAcknowledgement(key: string): Promise<Acknowledgement> {
  try {
    const data = await storageGet([key])
    return { readable: true, acknowledged: Boolean(data[key]) }
  } catch (err) {
    console.warn(`${LOG} acknowledgement read failed (${key}):`, err)
    return { readable: false, acknowledged: false }
  }
}

// ─── Engine lifecycle ───────────────────────────────────────────

let engine: DeleteEngine | null = null
let runPromise: Promise<void> | null = null
let starting = false
let emptying = false
let emptyTrashStopped = false

interface StartOptions {
  maxCount?: number
  dryRun?: boolean
  emptyTrashAfter?: boolean
  filter?: PhotoFilter
}

const start = async (opts: StartOptions): Promise<{ ok: boolean; error?: string }> => {
  if (!isSupportedPhotosUrl(window.location.href)) {
    return { ok: false, error: 'Not on photos.google.com.' }
  }
  if (!admitConcurrentStart(isRunOccupied({ engine, runPromise, starting, emptying })).ok) {
    return { ok: false, error: RUN_IN_PROGRESS_ERROR }
  }
  starting = true
  try {
    const maxCount = opts.maxCount ?? DEFAULT_CONFIG.maxCount
    const dryRun = opts.dryRun ?? false
    const emptyTrashAfter = opts.emptyTrashAfter ?? false
    const filter = opts.filter ?? { kind: 'all' as const }
    if (filterRequiresPro(filter) && !(await isProActive())) {
      return { ok: false, error: PRO_FILTER_ERROR }
    }

    let consent: Acknowledgement = { readable: true, acknowledged: false }
    let emptyTrashAck: Acknowledgement = { readable: true, acknowledged: false }
    if (!dryRun) {
      consent = await readChromeAcknowledgement(STORAGE_KEYS.consent)
      if (emptyTrashAfter) {
        emptyTrashAck = await readChromeAcknowledgement(STORAGE_KEYS.emptyTrashAck)
      }
    }
    const admission = admitDestructiveRun({ dryRun, emptyTrashAfter, consent, emptyTrashAck })
    if (!admission.ok) {
      return { ok: false, error: EXTENSION_ADMISSION_ERROR[admission.reason] }
    }

    try {
      await storageSet({ [STORAGE_KEYS.emptyTrashAfter]: emptyTrashAfter })
    } catch (err) {
      console.warn(`${LOG} emptyTrashAfter persist failed:`, err)
    }

    console.log(
      `${LOG} starting${dryRun ? ' (dry run)' : ''} — ` +
      `maxCount=${maxCount}, emptyTrashAfter=${emptyTrashAfter}, filter=${describeFilter(filter)}`,
    )

    const local = new DeleteEngine({
      dom: browserDom,
      config: { maxCount, dryRun },
      filter,
      onProgress: reportProgress,
    })
    engine = local
    diagnostics.reset()

    runPromise = (async () => {
      try {
        const result = await local.run()
        void maybeShowPostRunPrompt(local, dryRun, filter, emptyTrashAfter, result)
        await maybeChainEmptyTrash(local, dryRun, result)
      } finally {
        if (engine === local) engine = null
        runPromise = null
      }
    })()
    return { ok: true }
  } finally {
    starting = false
  }
}

const pause = (): void => {
  if (!engine || engine.isStopped) return
  engine.pause()
}

const resume = (): void => {
  if (!engine || engine.isStopped) return
  engine.resume()
}

const stop = (): void => {
  // Keep `engine` non-null until the run promise settles so a new Start
  // cannot race the tail of a stopped run. The engine resolves 'idle'.
  engine?.stop()
  emptyTrashStopped = true
}

const isRunning = (): boolean =>
  emptying || (engine !== null && !engine.isStopped)

// ─── One-time rate/share prompt (after a successful real run) ───

/** Pro state for the post-run card: the popup stores the token, verified locally. */
async function isProActive(): Promise<boolean> {
  try {
    const token = await readProToken()
    return token !== null && (await verifyLicense(token)).ok
  } catch {
    return false
  }
}

const proVariantStore = {
  get: async () => (await storageGet([PRO_VARIANT_KEY]))[PRO_VARIANT_KEY],
  set: (variant: 'a' | 'b') => storageSet({ [PRO_VARIANT_KEY]: variant }),
}

/**
 * Use the language the person picked in the popup (chrome.storage.local
 * "locale"), else the browser's, for the in-page cards. English on any failure.
 */
async function syncLocale(): Promise<void> {
  try {
    const stored = (await storageGet(['locale'])).locale
    const known = LOCALES.find((l) => l.code === stored)
    setLocale(known ? known.code : detectBrowserLocale())
  } catch {
    setLocale('en')
  }
}

async function maybeShowPostRunPrompt(
  local: DeleteEngine,
  dryRun: boolean,
  filter: PhotoFilter,
  emptyTrashAfter: boolean,
  result: Progress,
): Promise<void> {
  const prompt = await claimPostRunPrompt({
    dryRun,
    stopped: local.isStopped,
    status: result.status,
    deleted: result.deleted,
    filterKind: filter.kind,
    navigatingToTrash: shouldNavigateToEmptyTrash({
      dryRun,
      emptyTrashAfter,
      stopped: local.isStopped,
      status: result.status,
      deleted: result.deleted,
    }),
  }, {
    isShown: async () => Boolean((await storageGet([POST_RUN_PROMPT_KEY]))[POST_RUN_PROMPT_KEY]),
    markShown: () => storageSet({ [POST_RUN_PROMPT_KEY]: true }),
  }, detectBrowser(navigator.userAgent), await isProActive(), await getProVariant(proVariantStore))
  if (prompt) {
    await syncLocale()
    showPostRunPrompt(prompt)
  }
}

// ─── Empty-trash chain (after a clean real run) ─────────────────

const baton = createChromeBaton()

async function maybeChainEmptyTrash(
  local: DeleteEngine,
  dryRun: boolean,
  result: Progress,
): Promise<void> {
  let wantEmpty = false
  try {
    const data = await storageGet([STORAGE_KEYS.emptyTrashAfter])
    wantEmpty = !!data[STORAGE_KEYS.emptyTrashAfter]
  } catch (err) {
    console.warn(`${LOG} storage read failed; skipping empty-trash navigation:`, err)
  }
  await clearEmptyAfter()
  if (!shouldNavigateToEmptyTrash({
    dryRun,
    emptyTrashAfter: wantEmpty,
    stopped: local.isStopped,
    status: result.status,
    deleted: result.deleted,
  })) {
    if (wantEmpty) {
      console.warn(`${LOG} skipping empty-trash navigation — status=${result.status}, deleted=${result.deleted}`)
    }
    return
  }

  console.log(`${LOG} engine done — emptyTrashAfter set, navigating to /trash`)
  const ok = await baton.writePending()
  if (!ok) {
    console.warn(`${LOG} could not persist pending-empty flag; aborting navigation`)
    return
  }
  sendStatus('navigatingTrash')
  await sleep(100)
  window.location.href = TRASH_URL
}

async function clearEmptyAfter(): Promise<void> {
  try {
    await storageRemove([STORAGE_KEYS.emptyTrashAfter])
  } catch (err) {
    console.warn(`${LOG} emptyTrashAfter clear failed:`, err)
  }
}

/**
 * Consume the pending empty-trash flag if fresh AND on /trash. The flag
 * is ALWAYS cleared on first sight so a stale flag can never trigger an
 * accidental permanent empty later.
 */
async function maybeRunPendingEmptyTrash(): Promise<void> {
  const pending = await baton.readPending()
  await baton.clearPending()
  const evalResult = evaluatePendingEmptyTrash(pending, Date.now(), window.location.pathname)
  if (!evalResult.shouldRun) return
  if (emptyTrashStopped) return
  if (isRunOccupied({ engine, runPromise, starting, emptying })) return

  emptying = true
  sendStatus('emptyingTrash')
  try {
    await runEmptyTrashFlow({
      findEmptyTrashButton,
      findConfirmDialog,
      findConfirmButton,
      isTrashEmpty,
      waitFor: (cond, timeoutMs) =>
        waitUntilAbortable(cond, timeoutMs, 400, () => emptyTrashStopped),
      sleep,
      log: (msg) => console.log(`${LOG} ${msg}`),
      onStatus: (status: EmptyTrashStatus, extra?: { error?: string }) => {
        sendStatus(status, extra)
      },
    })
  } catch (err) {
    if (err instanceof StopRequested) {
      sendStatus('idle')
      return
    }
    /* already reported via onStatus */
  } finally {
    emptying = false
    emptyTrashStopped = false
  }
}

// ─── Progress reporting ─────────────────────────────────────────

/** In-page listeners (the duplicate review) — the popup gets messages. */
const progressListeners = new Set<(p: Progress) => void>()

let lastLoggedStatus: string | null = null
let lastProgress: Progress | null = null
let lastProgressAt = 0

const reportProgress = (progress: Progress): void => {
  lastProgress = { ...progress }
  lastProgressAt = Date.now()
  for (const cb of progressListeners) cb({ ...progress })
  runtimeSendMessage({ type: 'progress', data: progress })
    .catch(() => { /* popup not open */ })

  if (progress.status !== lastLoggedStatus) {
    lastLoggedStatus = progress.status
    console.log(
      `${LOG} ${progress.status} — ${progress.deleted} deleted, ` +
      `${progress.selected} selected`,
    )
  }
}

function sendStatus(status: RunStatus | string, extra: Partial<Progress> = {}): void {
  const snapshot: Progress = {
    deleted: 0,
    selected: 0,
    status: status as Progress['status'],
    startedAt: Date.now(),
    ...extra,
  }
  lastProgress = { ...snapshot }
  lastProgressAt = Date.now()
  for (const cb of progressListeners) cb({ ...snapshot })
  runtimeSendMessage({ type: 'progress', data: snapshot })
    .catch(() => { /* popup not open */ })
}

// ─── Find duplicates (in-page review → the same start() path) ───

function openFinder(view: FinderView): void {
  void syncLocale().then(() => openFinderLocalized(view))
}

function openFinderLocalized(view: FinderView): void {
  openDuplicateFinder({
    // Same consent-gated start() as the popup; emptying Trash is never chained.
    runDelete: (ids, dryRun) => start({ dryRun, emptyTrashAfter: false, filter: { kind: 'ids', ids } }),
    stopRun: stop,
    consentAcknowledged: async () => {
      const ack = await readChromeAcknowledgement(STORAGE_KEYS.consent)
      return ack.readable && ack.acknowledged
    },
    acknowledgeConsent: async () => {
      await storageSet({ [STORAGE_KEYS.consent]: true })
    },
    isPro: isProActive,
    proVariant: () => getProVariant(proVariantStore),
    onRunProgress: (cb) => {
      progressListeners.add(cb)
      return () => progressListeners.delete(cb)
    },
    // Blurry / Low-Res review (on-device) and AI 4K Restore (one confirmed photo).
    restore: extensionFinderRestore(),
  }, { view })
}

// ─── Message routing ────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.id && sender.id !== chrome.runtime.id) {
    console.warn(`${LOG} ignoring message from foreign sender:`, sender.id)
    return
  }
  if (!message || typeof message !== 'object') return

  switch (message.action) {
    case 'start':
      void start({
        maxCount: message.maxCount,
        dryRun: message.dryRun,
        emptyTrashAfter: message.emptyTrashAfter,
        filter: message.filter as PhotoFilter | undefined,
      }).then(sendResponse)
      return true // async response
    case 'pause':
      pause()
      sendResponse({ ok: true })
      break
    case 'resume':
      resume()
      sendResponse({ ok: true })
      break
    case 'stop':
      stop()
      sendResponse({ ok: true })
      break
    case 'status':
      sendResponse({
        running: isRunning(),
        paused: engine?.isPaused ?? false,
        progress: lastProgress,
        progressAsOf: lastProgressAt,
        // The page has the restore wiring, so the popup may offer AI 4K Restore.
        restore: true,
      })
      break
    case 'findDuplicates':
      openFinder(message.view === 'blurry' ? 'blurry' : 'duplicates')
      sendResponse({ ok: true })
      break
    case 'diagnostics':
      sendResponse({ blob: diagnostics.blob() })
      break
    case 'report': {
      // Dry-run report for the popup: summary + labels (Pro CSV export).
      const dryRunLabels = engine ? engine.getDryRunLabels() : []
      const labels = dryRunLabels.length > 0 ? [...dryRunLabels] : undefined
      const total = lastProgress?.total ?? (labels ? labels.length : undefined)
      sendResponse({
        summary: labels ? { total: total ?? labels.length, labels } : null,
        dateReport: engine ? engine.getDateReport() : null,
      })
      break
    }
    default:
      sendResponse({ ok: false, error: `unknown action: ${String(message.action)}` })
      break
  }
  return undefined
})

// ─── Bootstrap ──────────────────────────────────────────────────

console.log(`${LOG} loaded on ${window.location.pathname}`)
if (isSupportedPhotosUrl(window.location.href)) {
  void maybeRunPendingEmptyTrash()
}
