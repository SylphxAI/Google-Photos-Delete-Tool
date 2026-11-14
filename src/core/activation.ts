import type { ProLicensePayload } from './license'

/** Message the owned pricing/recovery pages send to the installed extension for Pro licences. */
export const ACTIVATION_MESSAGE = 'gpdt:activate-licence'

/** Message the owned pricing/recovery pages send to hand off a verified Sylphx Auth wallet session token. */
export const WALLET_ACTIVATION_MESSAGE = 'gpdt:activate-wallet'

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

/** Validate a Sylphx Auth session / JWT token before storing in `gpdt_wallet_token`. */
export function walletActivationToken(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.length > 16384) return null
  const token = raw.trim()
  if (token.length < 8) return null
  return /^[A-Za-z0-9._-]+$/.test(token) ? token : null
}

/**
 * The token of an external Pro licence activation message, or null when the sender
 * is not an owned pricing/recovery page or the message is not an activation request.
 * `senderUrl` is the browser-reported frame URL, never a page-supplied value.
 */
export function activationRequest(message: unknown, senderUrl: string | undefined): string | null {
  if (typeof senderUrl !== 'string' || !isActivationUrl(senderUrl)) return null
  if (typeof message !== 'object' || message === null) return null
  const m = message as { type?: unknown; token?: unknown }
  return m.type === ACTIVATION_MESSAGE ? activationToken(m.token) : null
}

/**
 * The session token of an external Sylphx Money wallet activation message, or null
 * when the sender is not an owned pricing/recovery page or the token is malformed.
 */
export function walletActivationRequest(message: unknown, senderUrl: string | undefined): string | null {
  if (typeof senderUrl !== 'string' || !isActivationUrl(senderUrl)) return null
  if (typeof message !== 'object' || message === null) return null
  const m = message as {
    type?: unknown
    wallet_token?: unknown
    walletToken?: unknown
    token?: unknown
  }
  if (m.type !== WALLET_ACTIVATION_MESSAGE) return null
  return walletActivationToken(m.wallet_token ?? m.walletToken ?? m.token)
}

export interface ActivationConsentMeta {
  terms_version?: string
  privacy_version?: string
  accepted_at?: string
  accepted?: boolean
  require_consent?: boolean
  user_id?: string
}

export function extractActivationConsent(message: unknown): ActivationConsentMeta | null {
  if (typeof message !== 'object' || message === null) return null
  const m = message as Record<string, unknown>
  const hasAny =
    m.terms_version !== undefined ||
    m.privacy_version !== undefined ||
    m.accepted_at !== undefined ||
    m.accepted !== undefined ||
    m.require_consent !== undefined
  if (!hasAny) return null
  return {
    terms_version: typeof m.terms_version === 'string' ? m.terms_version : undefined,
    privacy_version: typeof m.privacy_version === 'string' ? m.privacy_version : undefined,
    accepted_at: typeof m.accepted_at === 'string' ? m.accepted_at : undefined,
    accepted: typeof m.accepted === 'boolean' ? m.accepted : undefined,
    require_consent: typeof m.require_consent === 'boolean' ? m.require_consent : undefined,
    user_id: typeof m.user_id === 'string' ? m.user_id : undefined,
  }
}

export type ActivationReply =
  | { ok: true; scope: string }
  | { ok: false; reason: 'rejected' | 'invalid' | 'storage' | 'consent_required' }

/** Seat scope is informational, never a device lock or a restriction on legacy buyers. */
export function licenceScope(payload: ProLicensePayload): string {
  if (payload.seats === 1) return 'Personal · 1 account/profile'
  if (payload.seats === 3) return 'Family · 3 accounts/profiles'
  if (payload.seats === 10) return 'Team · 10 accounts/profiles'
  return 'Pro · existing licence'
}
