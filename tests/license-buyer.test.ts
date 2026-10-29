import { describe, it, expect } from 'vitest'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { verifyBuyer, formatBuyerReport, parseBuyerArgs, runVerifyBuyer, type BuyerIo } from '../scripts/license-buyer'
import { verifyLicense, type LicenseResult, encodeBase64Url } from '../src/core/license'

const verifierFor = (keys: readonly string[]) => async (token: string): Promise<LicenseResult> => {
  for (let i = 0; i < keys.length; i++) {
    const result = await verifyLicense(token, keys[i])
    if (result.ok) return { ...result, authority: i > 0 ? 'money' : 'legacy' }
  }
  return { ok: false, reason: 'bad-signature' }
}

const newKey = async () => {
  const kp = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify'])
  const pub = encodeBase64Url(new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey)))
  return { priv: kp.privateKey, pub }
}

const issue = async (priv: CryptoKey, payload: Record<string, unknown>): Promise<string> => {
  const bytes = new TextEncoder().encode(JSON.stringify(payload))
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'Ed25519' }, priv, bytes))
  return `${encodeBase64Url(bytes)}.${encodeBase64Url(sig)}`
}

/** A Money-shaped token: product and grant, no email. */
const moneyPayload = { plan: 'pro', product: 'gpdt', issuedAt: 1786300000000, grant: 'grant_1', seats: 1 }

const ioFor = (stdin: string | null, files: Record<string, string> = {}): BuyerIo => ({
  readStdin: () => stdin,
  readFile: (p) => {
    if (!(p in files)) throw new Error('ENOENT')
    return files[p]!
  },
})

describe('verifyBuyer verdicts', () => {
  it('verifies a Money token without an email as new (current key, product gpdt)', async () => {
    const oldK = await newKey()
    const curK = await newKey()
    const token = await issue(curK.priv, moneyPayload)
    expect(await verifyBuyer(token, verifierFor([oldK.pub, curK.pub]))).toEqual({ verdict: 'new', email: 'not-checked' })
    // an expected email the token cannot confirm is reported, not failed
    expect(await verifyBuyer(token, verifierFor([oldK.pub, curK.pub]), { email: 'a@example.com' })).toEqual({
      verdict: 'new',
      email: 'not-in-token',
    })
  })

  it('matches the email case-insensitively when the token carries one, and fails a mismatch', async () => {
    const oldK = await newKey()
    const curK = await newKey()
    const token = await issue(curK.priv, { ...moneyPayload, email: 'Buyer@Example.com' })
    expect(await verifyBuyer(token, verifierFor([oldK.pub, curK.pub]), { email: ' buyer@example.com ' })).toEqual({
      verdict: 'new',
      email: 'match',
    })
    expect(await verifyBuyer(token, verifierFor([oldK.pub, curK.pub]), { email: 'other@example.com' })).toEqual({
      verdict: 'invalid',
      email: 'mismatch',
    })
  })

  it('calls a token from the original key, or without a product, existing', async () => {
    const oldK = await newKey()
    const curK = await newKey()
    const fromOld = await issue(oldK.priv, { plan: 'pro', email: 'a@example.com', issuedAt: 1 })
    expect((await verifyBuyer(fromOld, verifierFor([oldK.pub, curK.pub]))).verdict).toBe('existing')
    const seller = await issue(curK.priv, { plan: 'pro', email: 'a@example.com', issuedAt: 1 })
    expect((await verifyBuyer(seller, verifierFor([oldK.pub, curK.pub]))).verdict).toBe('existing')
  })

  it('calls a tampered token, a foreign signature, another product, a wrong plan and garbage invalid', async () => {
    const k = await newKey()
    const other = await newKey()
    const good = await issue(k.priv, moneyPayload)
    const [payload, sig] = good.split('.') as [string, string]
    const forged = encodeBase64Url(new TextEncoder().encode(JSON.stringify({ ...moneyPayload, email: 'evil@example.com' })))
    const tampered = `${forged}.${sig}`
    expect(payload).not.toBe(forged)
    expect((await verifyBuyer(tampered, verifierFor([k.pub, k.pub]))).verdict).toBe('invalid')
    expect((await verifyBuyer(await issue(other.priv, moneyPayload), verifierFor([k.pub]))).verdict).toBe('invalid')
    expect((await verifyBuyer(await issue(k.priv, { ...moneyPayload, product: 'other-tool' }), verifierFor([k.pub]))).verdict).toBe('invalid')
    expect((await verifyBuyer(await issue(k.priv, { ...moneyPayload, plan: 'free' }), verifierFor([k.pub]))).verdict).toBe('invalid')
    expect((await verifyBuyer('not-a-token', verifierFor([k.pub]))).verdict).toBe('invalid')
    expect((await verifyBuyer('', verifierFor([k.pub]))).verdict).toBe('invalid')
  })

  it('formats verdict and email lines', () => {
    expect(formatBuyerReport({ verdict: 'new', email: 'not-in-token' })).toBe(
      'verdict: new\nemail: not in token (check the buyer in Money)',
    )
    expect(formatBuyerReport({ verdict: 'invalid', email: 'not-checked' })).toBe('verdict: invalid\nemail: not checked')
  })
})

describe('verify-buyer input', () => {
  it('refuses a token (or anything else) on argv without echoing it', async () => {
    const k = await newKey()
    const token = await issue(k.priv, moneyPayload)
    for (const args of [[token], [token, '--email=a@example.com'], [`--token=${token}`], ['--other']]) {
      expect(parseBuyerArgs(args).ok).toBe(false)
      const run = await runVerifyBuyer(args, verifierFor([k.pub]), ioFor(token))
      expect(run.code).toBe(2)
      expect(run.out).toBe('')
      expect(run.err).toContain('does not take the token on the command line')
      expect(run.err).not.toContain(token)
    }
  })

  it('reads the token from stdin or a file and never prints it', async () => {
    const oldK = await newKey()
    const curK = await newKey()
    const token = await issue(curK.priv, moneyPayload)
    const keys = [oldK.pub, curK.pub]
    const viaStdin = await runVerifyBuyer([], verifierFor(keys), ioFor(`${token}\n`))
    expect(viaStdin).toEqual({ code: 0, out: 'verdict: new\nemail: not checked', err: '' })
    const viaFile = await runVerifyBuyer(['--token-file=/t'], verifierFor(keys), ioFor(null, { '/t': token }))
    expect(viaFile.out).toBe(viaStdin.out)
    for (const run of [viaStdin, viaFile]) {
      expect(run.out + run.err).not.toContain(token)
      expect(run.out + run.err).not.toContain(token.split('.')[0]!)
    }
  })

  it('exits 1 on an invalid token without printing it, and 2 when nothing was piped', async () => {
    const k = await newKey()
    const other = await newKey()
    const token = await issue(other.priv, moneyPayload)
    const bad = await runVerifyBuyer([], verifierFor([k.pub]), ioFor(token))
    expect(bad.code).toBe(1)
    expect(bad.out).toBe('verdict: invalid\nemail: not checked')
    expect(bad.out + bad.err).not.toContain(token)
    expect((await runVerifyBuyer([], verifierFor([k.pub]), ioFor(null))).code).toBe(2)
    const missing = await runVerifyBuyer(['--token-file=/nope'], verifierFor([k.pub]), ioFor(null))
    expect(missing).toMatchObject({ code: 2, out: '' })
    expect(missing.err).not.toContain('/nope')
  })
})

describe('verify-buyer CLI', () => {
  const cli = join(__dirname, '..', 'scripts', 'license.ts')
  const run = (args: string[], input?: string) =>
    spawnSync('bun', ['run', cli, 'verify-buyer', ...args], { input, encoding: 'utf8' })

  it('refuses argv and reports invalid for a token that is not signed by the embedded keys', async () => {
    const k = await newKey()
    const token = await issue(k.priv, moneyPayload)
    const argv = run([token])
    expect(argv.status).toBe(2)
    expect(argv.stdout + argv.stderr).not.toContain(token)
    expect(argv.stderr).toContain('does not take the token on the command line')

    const stdin = run([], token)
    expect(stdin.status).toBe(1)
    expect(stdin.stdout.trim()).toBe('verdict: invalid\nemail: not checked')
    expect(stdin.stdout + stdin.stderr).not.toContain(token)
  })
})
