/**
 * Promise wrappers over the extension API, built on CALLBACKS.
 *
 * Chrome MV3 supports promises on chrome.*; Firefox's chrome.* is
 * callback-based (promises live on browser.*). Callbacks are supported
 * in BOTH (Chrome MV3 keeps callbacks for backward compatibility), so a
 * single promise wrapper keeps one codebase for Chromium + Firefox with
 * no polyfill and no dual namespaces.
 */
import type { EmptyTrashBaton } from '../core/empty-trash-baton'
import { PRESETS_KEY, type PresetStore } from '../core/presets'
import { PRO_TOKEN_KEY } from '../core/pro-moments'
import { WALLET_TOKEN_KEY } from '../core/restore/wallet'
import { POLICY_CONSENT_KEY } from '../core/consent'
import type { PolicyConsentStore } from '../ui/restore/policy-consent'

export { WALLET_TOKEN_KEY }

export function storageGet(keys: string | string[]): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(keys, (data) => {
      const err = chrome.runtime.lastError
      if (err) reject(new Error(err.message))
      else resolve(data as Record<string, unknown>)
    })
  })
}

export function storageSet(items: Record<string, unknown>): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set(items, () => {
      const err = chrome.runtime.lastError
      if (err) reject(new Error(err.message))
      else resolve()
    })
  })
}

export function storageRemove(keys: string | string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.remove(keys, () => {
      const err = chrome.runtime.lastError
      if (err) reject(new Error(err.message))
      else resolve()
    })
  })
}

/**
 * chrome.storage.sync wrappers. Sync is best-effort: it can be absent or
 * disabled (signed-out Chrome, enterprise policy), so callers treat a
 * rejection as "no sync" and fall back to local.
 */
function syncArea(): chrome.storage.SyncStorageArea {
  const area = chrome.storage.sync
  if (!area) throw new Error('chrome.storage.sync unavailable')
  return area
}

export function syncGet(keys: string | string[]): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    try {
      syncArea().get(keys, (data) => {
        const err = chrome.runtime.lastError
        if (err) reject(new Error(err.message))
        else resolve(data as Record<string, unknown>)
      })
    } catch (e) {
      reject(e)
    }
  })
}

export function syncSet(items: Record<string, unknown>): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      syncArea().set(items, () => {
        const err = chrome.runtime.lastError
        if (err) reject(new Error(err.message))
        else resolve()
      })
    } catch (e) {
      reject(e)
    }
  })
}

export function syncRemove(keys: string | string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      syncArea().remove(keys, () => {
        const err = chrome.runtime.lastError
        if (err) reject(new Error(err.message))
        else resolve()
      })
    } catch (e) {
      reject(e)
    }
  })
}

/**
 * The Pro token follows the user's browser sign-in: it is kept in
 * chrome.storage.sync AND chrome.storage.local. A token is ~200 bytes, far
 * under the sync per-item (8 KB) and total (100 KB) quotas. Read order: local
 * first, then sync. When local exists and differs from sync (missing or
 * stale), it is pushed up to sync, best effort, so installs that predate sync
 * migrate on first read. The local copy is always kept, so Pro keeps working
 * when sync is off.
 */
async function pushLocalToSync(local: string): Promise<void> {
  try {
    const synced = (await syncGet([PRO_TOKEN_KEY]))[PRO_TOKEN_KEY]
    if (synced === local) return
    await syncSet({ [PRO_TOKEN_KEY]: local })
  } catch (err) {
    console.warn('[gpdt:license] sync push failed:', err)
  }
}

export async function readProToken(): Promise<string | null> {
  try {
    const local = (await storageGet([PRO_TOKEN_KEY]))[PRO_TOKEN_KEY]
    if (typeof local === 'string' && local) {
      await pushLocalToSync(local)
      return local
    }
  } catch {
    /* local unavailable: fall through to sync */
  }
  try {
    const synced = (await syncGet([PRO_TOKEN_KEY]))[PRO_TOKEN_KEY]
    if (typeof synced === 'string' && synced) return synced
  } catch {
    /* sync unavailable */
  }
  return null
}

/** Local write must succeed (it throws); the sync write is best-effort. */
export async function writeProToken(token: string): Promise<void> {
  await storageSet({ [PRO_TOKEN_KEY]: token })
  try {
    await syncSet({ [PRO_TOKEN_KEY]: token })
  } catch (err) {
    console.warn('[gpdt:license] sync write failed:', err)
  }
}

/** Read the Sylphx Auth session token for the AI Restore Credit wallet from chrome.storage.local. */
export async function readWalletToken(): Promise<string | null> {
  try {
    const local = (await storageGet([WALLET_TOKEN_KEY]))[WALLET_TOKEN_KEY]
    return typeof local === 'string' && local ? local : null
  } catch {
    return null
  }
}

/** Save the Sylphx Auth session token for the AI Restore Credit wallet in chrome.storage.local. */
export async function writeWalletToken(token: string): Promise<void> {
  await storageSet({ [WALLET_TOKEN_KEY]: token })
}

export async function clearWalletToken(): Promise<void> {
  await storageRemove([WALLET_TOKEN_KEY])
}

/** Terms/Privacy acceptance record (`gpdt_policy_consent`) in chrome.storage.local. */
export const chromePolicyStore: PolicyConsentStore = {
  read: async () => (await storageGet([POLICY_CONSENT_KEY]))[POLICY_CONSENT_KEY],
  write: (record) => storageSet({ [POLICY_CONSENT_KEY]: record }),
}

export function runtimeSendMessage(message: unknown): Promise<unknown> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      const err = chrome.runtime.lastError
      if (err) reject(new Error(err.message))
      else resolve(response)
    })
  })
}

export function tabsQuery(query: chrome.tabs.QueryInfo): Promise<chrome.tabs.Tab[]> {
  return new Promise((resolve, reject) => {
    chrome.tabs.query(query, (tabs) => {
      const err = chrome.runtime.lastError
      if (err) reject(new Error(err.message))
      else resolve(tabs)
    })
  })
}

export function tabsSendMessage(tabId: number, message: unknown): Promise<unknown> {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      const err = chrome.runtime.lastError
      if (err) reject(err)
      else resolve(response)
    })
  })
}

export function tabsCreate(createProperties: chrome.tabs.CreateProperties): Promise<chrome.tabs.Tab> {
  return new Promise((resolve, reject) => {
    chrome.tabs.create(createProperties, (tab) => {
      const err = chrome.runtime.lastError
      if (err) reject(new Error(err.message))
      else resolve(tab)
    })
  })
}

export function setBadgeText(details: chrome.action.BadgeTextDetails): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.action.setBadgeText(details, () => {
      const err = chrome.runtime.lastError
      if (err) reject(new Error(err.message))
      else resolve()
    })
  })
}

export function setBadgeBackgroundColor(details: chrome.action.BadgeBackgroundColorDetails): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.action.setBadgeBackgroundColor(details, () => {
      const err = chrome.runtime.lastError
      if (err) reject(new Error(err.message))
      else resolve()
    })
  })
}

/**
 * chrome.storage-backed empty-trash baton (extension flavor). Moved here
 * from core so core stays free of any chrome.* references.
 */
const PENDING_KEY = 'gpdt_pendingEmpty'

export function createChromeBaton(): EmptyTrashBaton {
  return {
    async readPending() {
      try {
        const data = await storageGet([PENDING_KEY])
        const pending = data[PENDING_KEY] as { at?: number } | undefined
        if (pending && typeof pending.at === 'number') return { at: pending.at }
        return null
      } catch (err) {
        console.warn('[gpdt:baton] pending read failed:', err)
        return null
      }
    },
    async writePending(at = Date.now()) {
      try {
        await storageSet({ [PENDING_KEY]: { at } })
        return true
      } catch (err) {
        console.warn('[gpdt:baton] pending write failed:', err)
        return false
      }
    },
    async clearPending() {
      try {
        await storageRemove([PENDING_KEY])
      } catch (err) {
        console.warn('[gpdt:baton] pending clear failed:', err)
      }
    },
  }
}

/** Saved presets in chrome.storage.local; unreadable storage reads as empty. */
export function createChromePresetStore(): PresetStore {
  return {
    async read() {
      try {
        return (await storageGet([PRESETS_KEY]))[PRESETS_KEY] ?? null
      } catch (err) {
        console.warn('[gpdt:presets] read failed:', err)
        return null
      }
    },
    async write(presets) {
      try {
        await storageSet({ [PRESETS_KEY]: presets })
        return true
      } catch (err) {
        console.warn('[gpdt:presets] write failed:', err)
        return false
      }
    },
  }
}
