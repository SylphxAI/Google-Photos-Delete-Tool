import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ACTIVATION_MESSAGE, activationRequest } from '../src/core/activation'

const verify = vi.hoisted(() => vi.fn())
const write = vi.hoisted(() => vi.fn())
vi.mock('../src/core/license', () => ({ verifyLicense: verify }))
vi.mock('../src/extension/api', () => ({ writeProToken: write }))

const { handleExternalActivation, registerExternalActivation } = await import('../src/extension/external-activation')

const PRICING = 'https://sylphxai.github.io/Google-Photos-Delete-Tool/pricing?session_id=cs_1'
const msg = (token: unknown) => ({ type: ACTIVATION_MESSAGE, token })

beforeEach(() => {
  verify.mockReset()
  write.mockReset()
})

describe('activationRequest (sender URL and message shape)', () => {
  it('accepts an activation message from the owned pricing and recovery pages', () => {
    expect(activationRequest(msg('a.b'), PRICING)).toBe('a.b')
    expect(activationRequest(msg(' a.b '), 'https://sylphxai.github.io/Google-Photos-Delete-Tool/recover')).toBe('a.b')
    expect(activationRequest(msg('a.b'), 'https://gpd.sylphx.com/recover.html')).toBe('a.b')
  })

  it('rejects other pages on the allowed origins, lookalike hosts and missing sender URLs', () => {
    for (const url of [
      'https://sylphxai.github.io/other-repo/pricing',
      'https://sylphxai.github.io/Google-Photos-Delete-Tool/',
      'https://sylphxai.github.io/Google-Photos-Delete-Tool/pricing/evil',
      'https://gpd.sylphx.com/',
      'http://gpd.sylphx.com/pricing',
      'https://gpd.sylphx.com.evil.test/pricing',
      'https://evil.test/Google-Photos-Delete-Tool/pricing',
      undefined,
    ]) expect(activationRequest(msg('a.b'), url)).toBeNull()
  })

  it('rejects other message types and malformed tokens', () => {
    for (const m of [null, 'a.b', {}, { type: 'other', token: 'a.b' }, msg(1), msg('a.b.c'), msg('x'.repeat(17000))]) expect(activationRequest(m, PRICING)).toBeNull()
  })
})

describe('handleExternalActivation', () => {
  it('saves a verified licence and replies with its scope', async () => {
    verify.mockResolvedValue({ ok: true, payload: { plan: 'pro', seats: 3 }, authority: 'money' })
    write.mockResolvedValue(undefined)
    await expect(handleExternalActivation(msg('signed.valid'), { url: PRICING })).resolves.toEqual({ ok: true, scope: 'Family · 3 accounts/profiles' })
    expect(write).toHaveBeenCalledWith('signed.valid')
  })

  it('never verifies or saves for a disallowed sender', async () => {
    await expect(handleExternalActivation(msg('signed.valid'), { url: 'https://sylphxai.github.io/other/pricing' })).resolves.toEqual({ ok: false, reason: 'rejected' })
    expect(verify).not.toHaveBeenCalled()
    expect(write).not.toHaveBeenCalled()
  })

  it('keeps the saved licence when the new one fails verification', async () => {
    verify.mockResolvedValue({ ok: false, reason: 'bad-signature' })
    await expect(handleExternalActivation(msg('forged.invalid'), { url: PRICING })).resolves.toEqual({ ok: false, reason: 'invalid' })
    expect(write).not.toHaveBeenCalled()
  })

  it('reports a storage failure instead of claiming activation', async () => {
    verify.mockResolvedValue({ ok: true, payload: { plan: 'pro' }, authority: 'legacy' })
    write.mockRejectedValue(new Error('quota'))
    await expect(handleExternalActivation(msg('signed.valid'), { url: PRICING })).resolves.toEqual({ ok: false, reason: 'storage' })
  })
})

describe('registerExternalActivation', () => {
  it('answers onMessageExternal asynchronously with the activation reply', async () => {
    let listener: ((m: unknown, s: { url?: string }, r: (x: unknown) => void) => boolean) | undefined
    vi.stubGlobal('chrome', { runtime: { onMessageExternal: { addListener: (f: typeof listener) => { listener = f } } } })
    registerExternalActivation()
    verify.mockResolvedValue({ ok: true, payload: { plan: 'pro', seats: 1 }, authority: 'money' })
    write.mockResolvedValue(undefined)
    const reply = vi.fn()
    expect(listener!(msg('signed.valid'), { url: PRICING }, reply)).toBe(true)
    await vi.waitFor(() => expect(reply).toHaveBeenCalledWith({ ok: true, scope: 'Personal · 1 account/profile' }))
    vi.unstubAllGlobals()
  })

  it('is a no-op where page-to-extension messaging does not exist', () => {
    vi.stubGlobal('chrome', { runtime: {} })
    expect(() => registerExternalActivation()).not.toThrow()
    vi.unstubAllGlobals()
  })
})
