import { describe, it, expect } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadPrivateKey } from '../scripts/license-keys'
import { verifyLicense, encodeBase64Url } from '../src/core/license'
import { buildIssuePayload } from '../scripts/license-payload'
import { verifyBuyer } from '../scripts/license-buyer'

const toPem = (der: Uint8Array): string => {
  const b64 = Buffer.from(der).toString('base64')
  return `-----BEGIN PRIVATE KEY-----\n${(b64.match(/.{1,64}/g) ?? []).join('\n')}\n-----END PRIVATE KEY-----\n`
}

const issueWith = async (key: CryptoKey): Promise<string> => {
  const bytes = new TextEncoder().encode(JSON.stringify({ plan: 'pro', issuedAt: Date.now() }))
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'Ed25519' }, key, bytes))
  return `${encodeBase64Url(bytes)}.${encodeBase64Url(sig)}`
}

describe('seller private-key loading', () => {
  it('issues verifiable tokens from both the path form and the content form', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'gpdt-lic-'))
    try {
      const kp = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify'])
      const pem = toPem(new Uint8Array(await crypto.subtle.exportKey('pkcs8', kp.privateKey)))
      const pub = encodeBase64Url(new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey)))
      const file = join(dir, 'private.pem')
      writeFileSync(file, pem, { mode: 0o600 })

      const viaPath = await verifyLicense(await issueWith(await loadPrivateKey(file)), pub)
      const viaPem = await verifyLicense(await issueWith(await loadPrivateKey(pem)), pub)
      const der = Buffer.from(pem.replace(/-----[^-]+-----|\s+/g, ''), 'base64').toString('base64url')
      const viaB64 = await verifyLicense(await issueWith(await loadPrivateKey(der)), pub)
      expect(viaPath.ok).toBe(true)
      expect(viaPem.ok).toBe(true)
      expect(viaB64.ok).toBe(true)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('issue payload (email + order id)', () => {
  it('requires an email', () => {
    expect(() => buildIssuePayload(undefined, 'cs_live_1')).toThrow(/--email/)
    expect(() => buildIssuePayload('  ', undefined)).toThrow(/--email/)
    expect(() => buildIssuePayload('not-an-email', undefined)).toThrow(/--email/)
  })

  it('puts order in the payload only when given', () => {
    expect(buildIssuePayload('a@b.co', ' cs_live_1 ', 5)).toEqual({ plan: 'pro', email: 'a@b.co', issuedAt: 5, order: 'cs_live_1' })
    expect(buildIssuePayload('a@b.co', undefined, 5)).toEqual({ plan: 'pro', email: 'a@b.co', issuedAt: 5 })
  })

  it('a token carrying order verifies via verifyLicense and verify-buyer', async () => {
    const kp = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify'])
    const pub = encodeBase64Url(new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey)))
    const bytes = new TextEncoder().encode(JSON.stringify(buildIssuePayload('buyer@example.com', 'cs_live_abc')))
    const sig = new Uint8Array(await crypto.subtle.sign({ name: 'Ed25519' }, kp.privateKey, bytes))
    const token = `${encodeBase64Url(bytes)}.${encodeBase64Url(sig)}`
    const r = await verifyLicense(token, pub)
    expect(r.ok && r.payload.order).toBe('cs_live_abc')
    const report = await verifyBuyer(token, (value) => verifyLicense(value, pub), { email: 'Buyer@Example.com' })
    expect(report).toEqual({ verdict: 'existing', email: 'match' })
  })
})
