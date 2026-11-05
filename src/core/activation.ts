import type { ProLicensePayload } from './license'

export const LICENCE_STORAGE_KEY = 'keel:money:licence:gpdt'

/** Only product-owned checkout/recovery pages may offer a local token. */
export function isActivationUrl(raw: string): boolean {
  try {
    const u = new URL(raw)
    if (u.protocol !== 'https:') return false
    const path = u.origin === 'https://gpd.sylphx.com'
      ? u.pathname : u.origin === 'https://sylphxai.github.io'
        ? u.pathname.replace(/^\/Google-Photos-Delete-Tool(?=\/)/, '') : ''
    return /^\/(pricing|recover)(\.html)?\/?$/.test(path)
  } catch { return false }
}

/** Storage and page content are untrusted; signature verification is mandatory next. */
export function activationToken(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.length > 16384) return null
  let token = raw.trim()
  if (token.startsWith('{')) {
    try { token = JSON.parse(token).token } catch { return null }
  }
  return typeof token === 'string' && /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token) ? token : null
}

/** Seat scope is informational, never a device lock or a restriction on legacy buyers. */
export function licenceScope(payload: ProLicensePayload): string {
  if (payload.seats === 1) return 'Personal · 1 account/profile'
  if (payload.seats === 3) return 'Family · 3 accounts/profiles'
  if (payload.seats === 10) return 'Team · 10 accounts/profiles'
  return 'Pro · existing licence'
}
