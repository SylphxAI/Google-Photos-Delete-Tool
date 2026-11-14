import type { ProLicensePayload } from './license'

/** Message the owned pricing/recovery pages send to the installed extension. */
export const ACTIVATION_MESSAGE = 'gpdt:activate-licence'

/** Chrome Web Store id of the published extension (the pages' default message target). */
export const CHROME_WEB_STORE_ID = 'jiahfbbfpacpolomdjlpdpiljllcdenb'

/** Only product-owned checkout/recovery pages may offer a local token. */
export function isActivationUrl(raw: string): boolean {
  try {
    const u = new URL(raw)
    if (u.protocol !== 'https:') return false
    const path = u.origin === 'https://gpd.sylphx.com'
      ? u.pathname : u.origin === 'https://sylphxai.github.io'
        ? (u.pathname.startsWith('/Google-Photos-Delete-Tool/') ? u.pathname.slice('/Google-Photos-Delete-Tool'.length) : '') : ''
    return /^\/(pricing|recover)(\.html)?\/?$/.test(path)
  } catch { return false }
}

/** Page content is untrusted; signature verification is mandatory next. */
export function activationToken(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.length > 16384) return null
  const token = raw.trim()
  return /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token) ? token : null
}

/**
 * The token of an external activation message, or null when the sender is not
 * an owned pricing/recovery page or the message is not an activation request.
 * `senderUrl` is the browser-reported frame URL, never a page-supplied value.
 */
export function activationRequest(message: unknown, senderUrl: string | undefined): string | null {
  if (typeof senderUrl !== 'string' || !isActivationUrl(senderUrl)) return null
  if (typeof message !== 'object' || message === null) return null
  const m = message as { type?: unknown; token?: unknown }
  return m.type === ACTIVATION_MESSAGE ? activationToken(m.token) : null
}

export type ActivationReply =
  | { ok: true; scope: string }
  | { ok: false; reason: 'rejected' | 'invalid' | 'storage' }

/** Seat scope is informational, never a device lock or a restriction on legacy buyers. */
export function licenceScope(payload: ProLicensePayload): string {
  if (payload.seats === 1) return 'Personal · 1 account/profile'
  if (payload.seats === 3) return 'Family · 3 accounts/profiles'
  if (payload.seats === 10) return 'Team · 10 accounts/profiles'
  return 'Pro · existing licence'
}
