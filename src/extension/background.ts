/**
 * Service worker (Chromium MV3) / background script (Firefox MV3).
 *
 * Reflects the engine's deletion count on the action badge so users see
 * progress without opening the popup, and accepts Pro activation messages
 * from the owned pricing/recovery pages (external-activation.ts).
 *
 * All async chrome.* calls go through src/extension/api.ts promise
 * wrappers (callback-based) so this file is identical for both
 * browsers. Only event listeners use the raw API.
 *
 * NOTE: a `chrome.action.onClicked` handler is intentionally NOT
 * registered here — when `default_popup` is set in the manifest
 * (which it is), `onClicked` never fires, so the previous handler
 * was dead code masquerading as a fallback.
 */

const LOG = '[gpdt:background]'

/**
 * Per-tab debounce state. Badge writes are cheap individually but the
 * engine emits many progress events per second during scroll polling,
 * and `chrome.action.setBadgeText` forces a re-paint of the toolbar
 * icon. We coalesce updates per tab to at most one every BADGE_INTERVAL.
 */
const BADGE_INTERVAL_MS = 200
const lastBadgeAt = new Map<number, number>()
const pendingBadge = new Map<number, ReturnType<typeof setTimeout>>()

import { setBadgeBackgroundColor, setBadgeText } from './api'
import { registerLifecycle } from './lifecycle'
import { registerExternalActivation } from './external-activation'

registerLifecycle()
registerExternalActivation()

interface ProgressData {
  deleted: number
  status: string
}

chrome.runtime.onMessage.addListener((message, sender) => {
  if (message?.type !== 'progress' || !sender.tab?.id) return
  scheduleBadge(sender.tab.id, message.data as ProgressData)
})

function scheduleBadge(tabId: number, data: ProgressData): void {
  const now = Date.now()
  const last = lastBadgeAt.get(tabId) ?? 0
  const elapsed = now - last

  if (elapsed >= BADGE_INTERVAL_MS) {
    applyBadge(tabId, data)
    return
  }

  // Coalesce: cancel any pending update and replace with this one.
  const existing = pendingBadge.get(tabId)
  if (existing) clearTimeout(existing)
  const timer = setTimeout(() => {
    pendingBadge.delete(tabId)
    applyBadge(tabId, data)
  }, BADGE_INTERVAL_MS - elapsed)
  pendingBadge.set(tabId, timer)
}

function applyBadge(tabId: number, data: ProgressData): void {
  lastBadgeAt.set(tabId, Date.now())
  const text = data.status === 'idle' || data.status === 'done' ? '' : String(data.deleted)
  const color = data.status === 'error' ? '#ef4444' : '#22c55e'
  void setBadgeText({ text, tabId }).catch((err) => {
    // Tab may have closed between schedule and fire — non-fatal.
    console.warn(`${LOG} badge text update for tab ${tabId} failed:`, err)
  })
  void setBadgeBackgroundColor({ color, tabId }).catch((err) => {
    console.warn(`${LOG} badge color update for tab ${tabId} failed:`, err)
  })
}

// Cleanup when tabs close so the Maps don't accumulate stale entries.
chrome.tabs.onRemoved.addListener((tabId) => {
  const pending = pendingBadge.get(tabId)
  if (pending) clearTimeout(pending)
  pendingBadge.delete(tabId)
  lastBadgeAt.delete(tabId)
})
