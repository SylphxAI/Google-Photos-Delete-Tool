import { describe, it, expect, beforeAll } from 'vitest'
import {
  verifyLicense,
  encodeBase64Url,
  decodeBase64Url,
  PRO_PUBLIC_KEY_BASE64URL,
  type ProLicensePayload,
} from '../src/core/license'

/**
 * The license path is verified end-to-end with a throwaway keypair:
 * generate → sign → verify against the test public key. This proves the
 * token format, signature check, and payload validation without needing
 * the seller's private key in the repo.
 */

let testKeys: { publicKey: CryptoKey; privateKey: CryptoKey; publicRaw: string }

beforeAll(async () => {
  testKeys = await (async () => {
    const kp = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify'])
    const raw = new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey))
    return { publicKey: kp.publicKey, privateKey: kp.privateKey, publicRaw: encodeBase64Url(raw) }
  })()
})

const signPayload = async (payload: unknown): Promise<string> => {
  const bytes = new TextEncoder().encode(JSON.stringify(payload))
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'Ed25519' }, testKeys.privateKey, bytes))
  return `${encodeBase64Url(bytes)}.${encodeBase64Url(sig)}`
}

describe('base64url helpers', () => {
  it('round-trips arbitrary bytes', () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 251, 252, 253])
    expect([...decodeBase64Url(encodeBase64Url(bytes))]).toEqual([...bytes])
  })

  it('is URL-safe (no +, /, or padding)', () => {
    const bytes = new Uint8Array(64).fill(0xff)
    const encoded = encodeBase64Url(bytes)
    expect(encoded).not.toMatch(/[+/=]/)
  })
})

describe('verifyLicense', () => {
  it('accepts a valid token signed by the matching key', async () => {
    const payload: ProLicensePayload = { plan: 'pro', email: 'buyer@example.com', issuedAt: Date.now() }
    const token = await signPayload(payload)
    const result = await verifyLicense(token, testKeys.publicRaw)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.payload.plan).toBe('pro')
      expect(result.payload.email).toBe('buyer@example.com')
    }
  })

  it('accepts a Money-shaped token (product gpdt, grant, seats, expiresAt, no issuedAt)', async () => {
    const token = await signPayload({
      plan: 'pro',
      product: 'gpdt',
      order: 'pi_test_123',
      grant: 'checkouts/abc/line_items/0',
      seats: 1,
      expiresAt: Date.now() + 100 * 365 * 24 * 3600 * 1000,
    })
    const result = await verifyLicense(token, testKeys.publicRaw)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.payload.order).toBe('pi_test_123')
  })

  it('accepts the exact Money token shape from the licence design (fixed key order, product, order, grant)', async () => {
    const token = await signPayload({
      plan: 'pro',
      email: 'buyer@example.com',
      issuedAt: 1790000000000,
      product: 'gpdt',
      order: 'pi_3Qexample',
      grant: 'orgs/o/projects/p/envs/e/checkout_sessions/lic-abc/line_items/0',
    })
    const result = await verifyLicense(token, testKeys.publicRaw)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.payload.product).toBe('gpdt')
  })

  it('keeps accepting the legacy "gpdt-pro" product slug so no issued token breaks', async () => {
    const token = await signPayload({ plan: 'pro', email: 'old@example.com', issuedAt: 1, product: 'gpdt-pro' })
    expect((await verifyLicense(token, testKeys.publicRaw)).ok).toBe(true)
  })

  it('a gpdt token with a bad signature is still rejected', async () => {
    const good = await signPayload({ plan: 'pro', product: 'gpdt', issuedAt: 1 })
    const other = await signPayload({ plan: 'pro', product: 'gpdt', issuedAt: 2 })
    const forged = `${good.split('.')[0]}.${other.split('.')[1]}`
    expect(await verifyLicense(forged, testKeys.publicRaw)).toEqual({ ok: false, reason: 'bad-signature' })
  })

  it('rejects a Money token for another product', async () => {
    const token = await signPayload({ plan: 'pro', product: 'other', order: 'pi_x', seats: 1, expiresAt: Date.now() + 1e12 })
    expect(await verifyLicense(token, testKeys.publicRaw)).toEqual({ ok: false, reason: 'wrong-plan' })
  })

  it('rejects a token signed by a different key', async () => {
    const other = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify'])
    const bytes = new TextEncoder().encode(JSON.stringify({ plan: 'pro', issuedAt: 1 }))
    const sig = new Uint8Array(await crypto.subtle.sign({ name: 'Ed25519' }, other.privateKey, bytes))
    const token = `${encodeBase64Url(bytes)}.${encodeBase64Url(sig)}`
    const result = await verifyLicense(token, testKeys.publicRaw)
    expect(result).toEqual({ ok: false, reason: 'bad-signature' })
  })

  it('rejects malformed tokens', async () => {
    expect(await verifyLicense('', testKeys.publicRaw)).toEqual({ ok: false, reason: 'malformed' })
    expect(await verifyLicense('nodot', testKeys.publicRaw)).toEqual({ ok: false, reason: 'malformed' })
    expect(await verifyLicense('.', testKeys.publicRaw)).toEqual({ ok: false, reason: 'malformed' })
    expect(await verifyLicense('!!!.!!!', testKeys.publicRaw)).toEqual({ ok: false, reason: 'malformed' })
  })

  it('rejects a signed payload that is JSON null or a non-object as malformed', async () => {
    expect(await verifyLicense(await signPayload(null), testKeys.publicRaw)).toEqual({ ok: false, reason: 'malformed' })
    expect(await verifyLicense(await signPayload('pro'), testKeys.publicRaw)).toEqual({ ok: false, reason: 'malformed' })
  })

  it('treats an array payload as a wrong plan, never a throw', async () => {
    expect(await verifyLicense(await signPayload([]), testKeys.publicRaw)).toEqual({ ok: false, reason: 'wrong-plan' })
  })

  it('rejects a well-formed token with a wrong payload plan', async () => {
    const token = await signPayload({ plan: 'free', issuedAt: 1 })
    const result = await verifyLicense(token, testKeys.publicRaw)
    expect(result).toEqual({ ok: false, reason: 'wrong-plan' })
  })

  it('rejects a valid-looking token whose payload is not an object', async () => {
    const token = await signPayload('just-a-string')
    const result = await verifyLicense(token, testKeys.publicRaw)
    expect(result.ok).toBe(false)
  })

  it('trims surrounding whitespace', async () => {
    const payload: ProLicensePayload = { plan: 'pro', issuedAt: 1 }
    const token = await signPayload(payload)
    const result = await verifyLicense(`  ${token}  `, testKeys.publicRaw)
    expect(result.ok).toBe(true)
  })

  it('embeds a 32-byte production public key', () => {
    expect(decodeBase64Url(PRO_PUBLIC_KEY_BASE64URL).length).toBe(32)
  })
})

describe('verifyLicense with the embedded key list', () => {
  it('lists the original key first, then the current key', async () => {
    const { PRO_PUBLIC_KEYS_BASE64URL } = await import('../src/core/license')
    expect(PRO_PUBLIC_KEYS_BASE64URL).toEqual([
      'BkfyaOx0U3p8-KeUbF2WE924czXvfAoBdQ-trkO_3Vk',
      '-LFAzRTKamgPJ57qEW8-XdOpzFZ50JhT6b7thTQe8GQ',
    ])
    expect(PRO_PUBLIC_KEY_BASE64URL).toBe(PRO_PUBLIC_KEYS_BASE64URL[1])
  })

  it('rejects a token from an unknown key when no key is passed', async () => {
    const token = await signPayload({ plan: 'pro', issuedAt: 1 })
    expect(await verifyLicense(token)).toEqual({ ok: false, reason: 'bad-signature' })
  })

  it('an explicitly passed key verifies against only that key', async () => {
    const token = await signPayload({ plan: 'pro', issuedAt: 1 })
    const other = encodeBase64Url(new Uint8Array(32).fill(7))
    expect(await verifyLicense(token, other)).toEqual({ ok: false, reason: 'bad-signature' })
  })
})
