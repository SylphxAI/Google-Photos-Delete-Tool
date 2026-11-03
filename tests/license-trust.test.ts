import { afterEach, describe, expect, it, vi } from 'vitest'
import { encodeBase64Url } from '../src/core/license'
import { licenseTrust, parseLicenseEnvironment, parseLicenseJwks } from '../src/core/license-trust'

const keyPair = async () => {
  const pair = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify'])
  const x = encodeBase64Url(new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey)))
  return { ...pair, x }
}
const sign = async (key: CryptoKey, payload: unknown) => {
  const bytes = new TextEncoder().encode(JSON.stringify(payload))
  const sig = new Uint8Array(await crypto.subtle.sign('Ed25519', key, bytes))
  return `${encodeBase64Url(bytes)}.${encodeBase64Url(sig)}`
}

afterEach(() => { vi.doUnmock('../src/core/license-trust'); vi.resetModules(); vi.unstubAllGlobals() })

describe('published environment trust', () => {
  it('defaults to production, separates keys, and refuses unknown targets', () => {
    expect(parseLicenseEnvironment(undefined)).toBe('production')
    expect(() => parseLicenseEnvironment('development')).toThrow()
    expect(licenseTrust().environment).toBe('production')
    const prod = licenseTrust('production')
    const preview = licenseTrust('preview')
    expect(prod.url).toMatch(/^https:\/\/api\.sylphx\.com\/v1\/money\/orgs\/[^/]+\/projects\/[^/]+\/envs\/[^/]+\/licence_keys\/jwks\.json$/)
    expect(preview.url).not.toBe(prod.url)
    expect(prod.keys.some((key) => preview.keys.includes(key))).toBe(false)
  })

  it('refuses private, malformed, empty and non-Ed25519 JWKS', () => {
    const key = licenseTrust().jwks.keys[0]!
    for (const jwks of [null, [], {}, { keys: [] }, { keys: [null] }, { keys: [{ ...key, d: 'private' }] },
      { keys: [{ ...key, crv: 'P-256' }] }, { keys: [{ ...key, use: 'enc' }] }, { keys: [{ ...key, x: 'bad' }] }]) {
      expect(() => parseLicenseJwks(jwks)).toThrow()
    }
  })

  it('uses the same default verifier for Money, buyer readback, and isolated preview trust offline', async () => {
    const production = await keyPair()
    const preview = await keyPair()
    const legacy = await keyPair()
    const actual = await import('../src/core/license-trust')
    vi.doMock('../src/core/license-trust', () => ({
      ...actual,
      LICENSE_ENVIRONMENT: 'production',
      licenseTrust: (environment: string) => ({ keys: [environment === 'production' ? production.x : preview.x] }),
    }))
    const { verifyLicense, verifyLicenseForEnvironment } = await import('../src/core/license')
    const { verifyBuyer } = await import('../scripts/license-buyer')
    const noNetwork = vi.fn(() => { throw new Error('Offline') })
    vi.stubGlobal('fetch', noNetwork)
    const payload = { plan: 'pro', product: 'gpdt', seats: 1, expiresAt: 4_999_999_999_999 }
    const prodToken = await sign(production.privateKey, payload)
    const previewToken = await sign(preview.privateKey, payload)
    expect((await verifyLicense(prodToken)).ok).toBe(true)
    expect((await verifyBuyer(prodToken)).verdict).toBe('new')
    expect((await verifyLicense(previewToken)).ok).toBe(false)
    expect((await verifyLicenseForEnvironment(previewToken, 'preview')).ok).toBe(true)
    expect((await verifyLicenseForEnvironment(prodToken, 'preview')).ok).toBe(false)
    expect((await verifyLicense(await sign(legacy.privateKey, payload))).ok).toBe(false)
    for (const bad of [
      '', 'bad', 'a.b.c', `${prodToken}=`, `${prodToken.slice(0, -5)}_____`,
      await sign(production.privateKey, { ...payload, product: 'another-product' }),
      await sign(production.privateKey, { ...payload, product: undefined }),
      await sign(production.privateKey, { ...payload, product: 'gpdt-pro' }),
      await sign(production.privateKey, { ...payload, plan: 'free' }),
      await sign(production.privateKey, { ...payload, expiresAt: 'never' }),
      await sign(production.privateKey, null),
    ]) expect((await verifyLicense(bad)).ok).toBe(false)
    expect(noNetwork).not.toHaveBeenCalled()
  })
})
