/**
 * Pro license verification — zero-server by design.
 *
 * A Pro token is `${base64url(payload)}.${base64url(signature)}` where
 * payload is JSON `{ plan: "pro", email, issuedAt, order? }` (Money-minted
 * tokens add `product: "gpdt"`, `grant`, `seats`, `expiresAt`) and the signature
 * is an Ed25519 signature over the payload bytes, made with the seller's
 * private key. The public keys are embedded below; verification happens
 * entirely on the user's device (WebCrypto SubtleCrypto). No license
 * data ever leaves the browser.
 *
 * Seller tooling (private key holder): `bun run license:issue`.
 * Key regeneration: `bun run license:keygen` (see docs/PRO.md).
 */
export interface ProLicensePayload {
  plan: 'pro'
  email?: string
  /** Present on tokens from the seller CLI and from Money; a Money token may carry only expiresAt. */
  issuedAt?: number
  /** Money tokens: product slug ("gpdt"; legacy "gpdt-pro"), checked when present. */
  product?: string
  /** Money tokens: entitlement grant id, seats and expiry (ms); informational, expiry is not enforced (Pro does not expire). */
  grant?: string
  seats?: number
  expiresAt?: number
  /** Stripe payment or session id the token was issued for; informational, not checked on device. */
  order?: string
}

export type LicenseResult =
  | { ok: true; payload: ProLicensePayload }
  | { ok: false; reason: 'malformed' | 'bad-signature' | 'wrong-plan' }

/**
 * Accepted Ed25519 public keys (raw, base64url), embedded at build time.
 * A token verifies if ANY of them verifies it. Order: oldest first.
 *
 *  1. The original key. Its private key is lost, but every token ever
 *     issued under it must stay valid, so it is never removed.
 *  2. The current key (1Password item "GPDT Pro license private key",
 *     Sylphx vault). New tokens are signed with it.
 *
 * The private key is held OUTSIDE this repo (see docs/PRO.md); never
 * commit it. To rotate, append the new public key and release.
 */
export const PRO_PUBLIC_KEYS_BASE64URL: readonly string[] = [
  'BkfyaOx0U3p8-KeUbF2WE924czXvfAoBdQ-trkO_3Vk',
  '-LFAzRTKamgPJ57qEW8-XdOpzFZ50JhT6b7thTQe8GQ',
]

/**
 * Product slugs a token may carry. Money mints "gpdt"; "gpdt-pro" is the slug
 * an earlier local issuer used, kept so a token that carries it never stops
 * working. A token with no product (seller CLI) is accepted too. The signature
 * is still required in every case.
 */
const ACCEPTED_PRODUCTS: readonly string[] = ['gpdt', 'gpdt-pro']

/** The current (newest) public key; the one `license:issue` tokens verify under. */
export const PRO_PUBLIC_KEY_BASE64URL: string =
  PRO_PUBLIC_KEYS_BASE64URL[PRO_PUBLIC_KEYS_BASE64URL.length - 1]!


export function encodeBase64Url(bytes: Uint8Array): string {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

export function decodeBase64Url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/')
  const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4)
  const bin = atob(padded)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

/**
 * Import the Pro public key for verification.
 *
 * `publicKeyBase64Url` is injectable for tests; the default is the current
 * embedded {@link PRO_PUBLIC_KEY_BASE64URL}.
 */
export async function importProPublicKey(
  publicKeyBase64Url: string = PRO_PUBLIC_KEY_BASE64URL,
): Promise<CryptoKey> {
  const raw = decodeBase64Url(publicKeyBase64Url)
  return crypto.subtle.importKey('raw', raw as unknown as ArrayBuffer, { name: 'Ed25519' }, false, ['verify'])
}

/**
 * Verify a Pro license token locally. Returns the payload when valid.
 * By default the token may be signed by any key in
 * {@link PRO_PUBLIC_KEYS_BASE64URL}. An explicitly passed
 * `publicKeyBase64Url` (tests) verifies against only that key.
 */
export async function verifyLicense(
  token: string,
  publicKeyBase64Url?: string,
): Promise<LicenseResult> {
  const trimmed = token.trim()
  const dot = trimmed.lastIndexOf('.')
  if (dot <= 0 || dot === trimmed.length - 1) return { ok: false, reason: 'malformed' }

  let payloadBytes: Uint8Array
  let signatureBytes: Uint8Array
  try {
    payloadBytes = decodeBase64Url(trimmed.slice(0, dot))
    signatureBytes = decodeBase64Url(trimmed.slice(dot + 1))
  } catch {
    return { ok: false, reason: 'malformed' }
  }

  let payload: ProLicensePayload
  try {
    payload = JSON.parse(new TextDecoder().decode(payloadBytes)) as ProLicensePayload
  } catch {
    return { ok: false, reason: 'malformed' }
  }
  if (!payload || typeof payload !== 'object') return { ok: false, reason: 'malformed' }

  const hasTime = typeof payload.issuedAt === 'number' || typeof payload.expiresAt === 'number'
  if (payload.plan !== 'pro' || !hasTime || (payload.product !== undefined && !ACCEPTED_PRODUCTS.includes(payload.product))) {
    return { ok: false, reason: 'wrong-plan' }
  }

  const keys = publicKeyBase64Url === undefined ? PRO_PUBLIC_KEYS_BASE64URL : [publicKeyBase64Url]
  for (const k of keys) {
    try {
      const key = await importProPublicKey(k)
      const valid = await crypto.subtle.verify(
        { name: 'Ed25519' },
        key,
        signatureBytes as unknown as ArrayBuffer,
        payloadBytes as unknown as ArrayBuffer,
      )
      if (valid) return { ok: true, payload }
    } catch {
      // unusable key or signature shape: try the next key
    }
  }
  return { ok: false, reason: 'bad-signature' }
}
