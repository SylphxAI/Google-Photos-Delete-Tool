/** Public Money trust, captured from its environment-scoped JWKS for offline use. */
import production from '../../config/licence-trust/production.json'
import preview from '../../config/licence-trust/preview.json'

export type LicenseEnvironment = 'production' | 'preview'

// Replaced by the packager. Unbundled/default clients always use production.
declare const __GPDT_LICENSE_ENVIRONMENT__: LicenseEnvironment | undefined
export const LICENSE_ENVIRONMENT: LicenseEnvironment =
  typeof __GPDT_LICENSE_ENVIRONMENT__ === 'undefined' ? 'production' : __GPDT_LICENSE_ENVIRONMENT__

export function parseLicenseEnvironment(value: string | undefined): LicenseEnvironment {
  if (value === undefined || value === 'production') return 'production'
  if (value === 'preview') return 'preview'
  throw new Error('Licence environment must be production or preview')
}

/** Only public Ed25519 verification keys are accepted. Never import private JWKs. */
export function parseLicenseJwks(value: unknown): readonly string[] {
  if (!value || typeof value !== 'object' || !('keys' in value) || !Array.isArray(value.keys) || value.keys.length === 0) {
    throw new Error('Invalid licence JWKS')
  }
  const keys = value.keys.map((key: unknown) => {
    if (!key || typeof key !== 'object') throw new Error('Invalid licence JWKS key')
    const k = key as Record<string, unknown>
    if (k.kty !== 'OKP' || k.crv !== 'Ed25519' || k.alg !== 'EdDSA' || k.use !== 'sig'
      || typeof k.kid !== 'string' || !k.kid || typeof k.x !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(k.x)
      || 'd' in k || Object.keys(k).some((field) => !['kty', 'crv', 'alg', 'use', 'kid', 'x'].includes(field))) {
      throw new Error('Invalid licence JWKS key')
    }
    return k.x
  })
  return [...new Set(keys)]
}

export function licenseTrust(environment: LicenseEnvironment = LICENSE_ENVIRONMENT) {
  const snapshot = environment === 'production' ? production : environment === 'preview' ? preview : null
  if (!snapshot || snapshot.environment !== environment) throw new Error('Invalid licence trust environment')
  return { ...snapshot, keys: parseLicenseJwks(snapshot.jwks) }
}
