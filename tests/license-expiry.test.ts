import { afterEach, describe, expect, it, vi } from 'vitest'
import { encodeBase64Url } from '../src/core/license'

const NOW = Date.UTC(2026, 10, 2, 18, 0, 0)
// The native Money term is a calendar-century date, not a client-side duration.
const NATIVE_EXPIRY = Date.UTC(2126, 10, 2, 18, 0, 0)

const keyPair = async () => {
  const pair = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify'])
  return { ...pair, x: encodeBase64Url(new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey))) }
}
const signJson = async (key: CryptoKey, json: string) => {
  const bytes = new TextEncoder().encode(json)
  const sig = new Uint8Array(await crypto.subtle.sign('Ed25519', key, bytes))
  return `${encodeBase64Url(bytes)}.${encodeBase64Url(sig)}`
}
const sign = (key: CryptoKey, payload: unknown) => signJson(key, JSON.stringify(payload))

async function environmentVerifier() {
  vi.resetModules()
  const production = await keyPair()
  const preview = await keyPair()
  const actual = await import('../src/core/license-trust')
  vi.doMock('../src/core/license-trust', () => ({
    ...actual,
    LICENSE_ENVIRONMENT: 'production',
    licenseTrust: (environment: string) => ({ keys: [environment === 'production' ? production.x : preview.x] }),
  }))
  const verifier = await import('../src/core/license')
  return { ...verifier, production, preview }
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.doUnmock('../src/core/license-trust')
  vi.resetModules()
})

describe('signed Money expiry through ordinary environment trust', () => {
  it.each([
    ['production', NOW + 1234], ['preview', NOW + 1234],
    ['production', NATIVE_EXPIRY], ['preview', NATIVE_EXPIRY],
  ] as const)('honours before/equal/after expiration in %s at %s', async (environment, expiresAt) => {
    const verifier = await environmentVerifier()
    const token = await sign(verifier[environment].privateKey, {
      plan: 'pro', product: 'gpdt', grant: 'grant_test', seats: 1, expiresAt,
    })
    const now = vi.spyOn(Date, 'now')
    for (const timestamp of [NOW, expiresAt - 1]) {
      now.mockReturnValue(timestamp)
      const result = await verifier.verifyLicenseForEnvironment(token, environment)
      expect(result).toMatchObject({ ok: true, authority: 'money', payload: { expiresAt } })
      if (environment === 'production') expect((await verifier.verifyLicense(token)).ok).toBe(true)
    }
    for (const timestamp of [expiresAt, expiresAt + 1]) {
      now.mockReturnValue(timestamp)
      expect(await verifier.verifyLicenseForEnvironment(token, environment)).toEqual({ ok: false, reason: 'expired' })
      if (environment === 'production') expect(await verifier.verifyLicense(token)).toEqual({ ok: false, reason: 'expired' })
    }
    // Test Mode never falls through into production trust, even while unexpired.
    now.mockReturnValue(NOW)
    expect(await verifier.verifyLicenseForEnvironment(token, environment === 'production' ? 'preview' : 'production'))
      .toEqual({ ok: false, reason: 'bad-signature' })
  })

  it.each(['production', 'preview'] as const)('rejects missing, malformed and nonfinite Money expiry in %s even with issuedAt', async (environment) => {
    const verifier = await environmentVerifier()
    const payload = { plan: 'pro', product: 'gpdt', issuedAt: NOW }
    for (const expiresAt of [undefined, null, 'never', '4999999999999', true, {}, [], NaN, Infinity, -Infinity]) {
      expect(await verifier.verifyLicenseForEnvironment(await sign(verifier[environment].privateKey, { ...payload, expiresAt }), environment))
        .toEqual({ ok: false, reason: 'malformed' })
    }
    // JSON numeric overflow parses as Infinity; JSON.stringify would replace it with null.
    const overflow = '{"plan":"pro","product":"gpdt","issuedAt":1,"expiresAt":1e400}'
    expect(await verifier.verifyLicenseForEnvironment(await signJson(verifier[environment].privateKey, overflow), environment))
      .toEqual({ ok: false, reason: 'malformed' })
  })

  it('verifies the signature before making product, plan or expiry decisions', async () => {
    const verifier = await environmentVerifier()
    const foreign = await keyPair()
    for (const payload of [
      { plan: 'pro', product: 'gpdt', expiresAt: NOW - 1 },
      { plan: 'pro', product: 'gpdt', expiresAt: 'never' },
      { plan: 'pro', product: 'other', expiresAt: NATIVE_EXPIRY },
      { plan: 'free', product: 'gpdt', expiresAt: NATIVE_EXPIRY },
    ]) {
      expect(await verifier.verifyLicense(await sign(foreign.privateKey, payload))).toEqual({ ok: false, reason: 'bad-signature' })
    }
    const signedWrongProduct = await sign(verifier.production.privateKey, { plan: 'pro', product: 'other', expiresAt: NATIVE_EXPIRY })
    expect(await verifier.verifyLicense(signedWrongProduct)).toEqual({ ok: false, reason: 'wrong-plan' })
  })

  it('makes buyer readback invalid at expiry without exposing the token', async () => {
    const verifier = await environmentVerifier()
    const { runVerifyBuyer } = await import('../scripts/license-buyer')
    const token = await sign(verifier.preview.privateKey, { plan: 'pro', product: 'gpdt', expiresAt: NATIVE_EXPIRY })
    const verify = (value: string) => verifier.verifyLicenseForEnvironment(value, 'preview')
    const io = { readStdin: () => token, readFile: () => token }
    const now = vi.spyOn(Date, 'now').mockReturnValue(NATIVE_EXPIRY - 1)
    expect(await runVerifyBuyer([], verify, io)).toEqual({ code: 0, out: 'verdict: new\nemail: not checked', err: '' })
    now.mockReturnValue(NATIVE_EXPIRY)
    const expired = await runVerifyBuyer([], verify, io)
    expect(expired).toEqual({ code: 1, out: 'verdict: invalid\nemail: not checked', err: '' })
    expect(expired.out + expired.err).not.toContain(token)
  })
})

describe('perpetual seller compatibility', () => {
  it('retains no-expiry seller tokens, including historical product slugs, in the far future', async () => {
    const { verifyLicense, PRO_PUBLIC_KEYS_BASE64URL } = await import('../src/core/license')
    const seller = await keyPair()
    vi.spyOn(Date, 'now').mockReturnValue(NATIVE_EXPIRY + 1)
    for (const product of [undefined, 'gpdt-pro', 'gpdt']) {
      const token = await sign(seller.privateKey, { plan: 'pro', issuedAt: 1, product })
      expect((await verifyLicense(token, seller.x)).ok).toBe(true)
    }
    expect(PRO_PUBLIC_KEYS_BASE64URL).toEqual([
      'BkfyaOx0U3p8-KeUbF2WE924czXvfAoBdQ-trkO_3Vk',
      '-LFAzRTKamgPJ57qEW8-XdOpzFZ50JhT6b7thTQe8GQ',
    ])
  })

  it('enforces a present signed expiry even with a custom seller test key', async () => {
    const { verifyLicense } = await import('../src/core/license')
    const seller = await keyPair()
    const token = await sign(seller.privateKey, { plan: 'pro', issuedAt: 1, expiresAt: NATIVE_EXPIRY })
    const now = vi.spyOn(Date, 'now').mockReturnValue(NATIVE_EXPIRY - 1)
    expect((await verifyLicense(token, seller.x)).ok).toBe(true)
    now.mockReturnValue(NATIVE_EXPIRY)
    expect(await verifyLicense(token, seller.x)).toEqual({ ok: false, reason: 'expired' })
  })
})
