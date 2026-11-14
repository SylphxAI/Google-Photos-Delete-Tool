import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ACTIVATION_MESSAGE,
  WALLET_ACTIVATION_MESSAGE,
  activationRequest,
  walletActivationRequest,
} from '../src/core/activation'
import {
  CURRENT_PRIVACY_VERSION,
  CURRENT_TERMS_VERSION,
} from '../src/core/consent'
import { fake, fakeJwt } from './fixtures/fake-tokens'

const verify = vi.hoisted(() => vi.fn())
const write = vi.hoisted(() => vi.fn())
const writeWallet = vi.hoisted(() => vi.fn())
vi.mock('../src/core/license', () => ({ verifyLicense: verify }))
vi.mock('../src/extension/api', () => ({
  writeProToken: write,
  writeWalletToken: writeWallet,
}))

const { handleExternalActivation, registerExternalActivation } = await import(
  '../src/extension/external-activation'
)

const PRICING = 'https://sylphxai.github.io/Google-Photos-Delete-Tool/pricing?session_id=cs_1'
const msg = (token: unknown) => ({ type: ACTIVATION_MESSAGE, token })
const walletMsg = (wallet_token: unknown, extra: Record<string, unknown> = {}) => ({
  type: WALLET_ACTIVATION_MESSAGE,
  wallet_token,
  ...extra,
})

const CURRENT_CONSENT = {
  user_id: 'local-1',
  terms_version: CURRENT_TERMS_VERSION,
  privacy_version: CURRENT_PRIVACY_VERSION,
  accepted_at: '2026-11-14T17:00:00.000Z',
  surface: 'gpdt_web_activate',
}
const INLINE_CONSENT = {
  terms_version: CURRENT_TERMS_VERSION,
  privacy_version: CURRENT_PRIVACY_VERSION,
  accepted_at: '2026-11-14T17:00:00.000Z',
}

/** chrome.storage.local holding `stored` under gpdt_policy_consent (or nothing). */
function storedConsent(stored: unknown) {
  const area: Record<string, unknown> = stored === undefined ? {} : { gpdt_policy_consent: stored }
  vi.stubGlobal('chrome', {
    runtime: {},
    storage: {
      local: {
        get: (keys: string[], cb: (d: Record<string, unknown>) => void) => cb(Object.fromEntries(keys.filter((k) => k in area).map((k) => [k, area[k]]))),
        set: (items: Record<string, unknown>, cb: () => void) => { Object.assign(area, items); cb() },
      },
    },
  })
  return area
}

beforeEach(() => {
  verify.mockReset()
  write.mockReset()
  writeWallet.mockReset()
  vi.unstubAllGlobals()
  storedConsent(CURRENT_CONSENT)
})

describe('activationRequest & walletActivationRequest (sender URL and message shape)', () => {
  it('accepts a Pro licence activation message from the owned pricing and recovery pages', () => {
    expect(activationRequest(msg('a.b'), PRICING)).toBe('a.b')
    expect(
      activationRequest(msg(' a.b '), 'https://sylphxai.github.io/Google-Photos-Delete-Tool/recover'),
    ).toBe('a.b')
    expect(activationRequest(msg('a.b'), 'https://gpd.sylphx.com/recover.html')).toBe('a.b')
  })

  it('accepts a Sylphx Money wallet activation message from the owned pricing and recovery pages', () => {
    expect(walletActivationRequest(walletMsg(fake('sess', 'live', 'abcdef123456')), PRICING)).toBe(
      fake('sess', 'live', 'abcdef123456'),
    )
    expect(
      walletActivationRequest(
        walletMsg(` ${fakeJwt('{"alg":"EdDSA"}', '{"sub":"usr_1"}', 'sig')} `),
        'https://gpd.sylphx.com/pricing',
      ),
    ).toBe(fakeJwt('{"alg":"EdDSA"}', '{"sub":"usr_1"}', 'sig'))
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
    ]) {
      expect(activationRequest(msg('a.b'), url)).toBeNull()
      expect(walletActivationRequest(walletMsg(fake('sess', 'live', 'abcdef123456')), url)).toBeNull()
    }
  })

  it('rejects other message types and malformed tokens', () => {
    for (const m of [
      null,
      'a.b',
      {},
      { type: 'other', token: 'a.b' },
      msg(1),
      msg('a.b.c'),
      msg('x'.repeat(17000)),
    ]) {
      expect(activationRequest(m, PRICING)).toBeNull()
    }
    for (const m of [
      null,
      {},
      walletMsg(123),
      walletMsg('short'),
      walletMsg('has spaces inside'),
      walletMsg('x'.repeat(17000)),
    ]) {
      expect(walletActivationRequest(m, PRICING)).toBeNull()
    }
  })
})

describe('handleExternalActivation', () => {
  it('saves a verified licence and replies with its scope', async () => {
    verify.mockResolvedValue({ ok: true, payload: { plan: 'pro', seats: 3 }, authority: 'money' })
    write.mockResolvedValue(undefined)
    await expect(handleExternalActivation(msg('signed.valid'), { url: PRICING })).resolves.toEqual({
      ok: true,
      scope: 'Family · 3 accounts/profiles',
    })
    expect(write).toHaveBeenCalledWith('signed.valid')
  })

  it('saves a verified wallet token into gpdt_wallet_token via writeWalletToken', async () => {
    writeWallet.mockResolvedValue(undefined)
    await expect(
      handleExternalActivation(
        walletMsg(fake('sess', 'live', 'wallet', 'token', '123'), {
          terms_version: CURRENT_TERMS_VERSION,
          privacy_version: CURRENT_PRIVACY_VERSION,
          accepted_at: '2026-11-14T17:00:00.000Z',
        }),
        { url: PRICING },
      ),
    ).resolves.toEqual({
      ok: true,
      scope: 'AI Restore Wallet',
    })
    expect(writeWallet).toHaveBeenCalledWith(fake('sess', 'live', 'wallet', 'token', '123'))
  })

  it('refuses a bare activation when no current acceptance is stored, and admits it once one is', async () => {
    verify.mockResolvedValue({ ok: true, payload: { plan: 'pro', seats: 1 }, authority: 'money' })
    write.mockResolvedValue(undefined)
    writeWallet.mockResolvedValue(undefined)
    for (const stored of [undefined, { ...CURRENT_CONSENT, terms_version: '2025-01-01' }, 'not a record']) {
      storedConsent(stored)
      await expect(handleExternalActivation(msg('signed.valid'), { url: PRICING })).resolves.toEqual({ ok: false, reason: 'consent_required' })
      await expect(handleExternalActivation(walletMsg(fake('sess', 'live', 'wallet', 'token', '123')), { url: PRICING })).resolves.toEqual({ ok: false, reason: 'consent_required' })
    }
    expect(verify).not.toHaveBeenCalled()
    expect(write).not.toHaveBeenCalled()
    expect(writeWallet).not.toHaveBeenCalled()

    storedConsent(CURRENT_CONSENT)
    await expect(handleExternalActivation(msg('signed.valid'), { url: PRICING })).resolves.toMatchObject({ ok: true })
  })

  it('records inline consent from the page and then activates, even with nothing stored yet', async () => {
    const area = storedConsent(undefined)
    verify.mockResolvedValue({ ok: true, payload: { plan: 'pro', seats: 1 }, authority: 'money' })
    write.mockResolvedValue(undefined)
    await expect(handleExternalActivation({ ...msg('signed.valid'), ...INLINE_CONSENT }, { url: PRICING })).resolves.toMatchObject({ ok: true })
    expect(area.gpdt_policy_consent).toMatchObject({ ...INLINE_CONSENT, surface: 'gpdt_web_activate' })
    expect(write).toHaveBeenCalledWith('signed.valid')
  })

  it('rejects wallet activation when policy consent versions are outdated or unaccepted', async () => {
    await expect(
      handleExternalActivation(
        walletMsg(fake('sess', 'live', 'wallet', 'token', '123'), {
          terms_version: '2025-01-01',
          privacy_version: CURRENT_PRIVACY_VERSION,
          accepted_at: '2026-11-14T17:00:00.000Z',
        }),
        { url: PRICING },
      ),
    ).resolves.toEqual({
      ok: false,
      reason: 'consent_required',
    })
    expect(writeWallet).not.toHaveBeenCalled()
  })

  it('never verifies or saves for a disallowed sender', async () => {
    await expect(
      handleExternalActivation(msg('signed.valid'), {
        url: 'https://sylphxai.github.io/other/pricing',
      }),
    ).resolves.toEqual({ ok: false, reason: 'rejected' })
    expect(verify).not.toHaveBeenCalled()
    expect(write).not.toHaveBeenCalled()
    expect(writeWallet).not.toHaveBeenCalled()
  })

  it('keeps the saved licence when the new one fails verification', async () => {
    verify.mockResolvedValue({ ok: false, reason: 'bad-signature' })
    await expect(
      handleExternalActivation(msg('forged.invalid'), { url: PRICING }),
    ).resolves.toEqual({ ok: false, reason: 'invalid' })
    expect(write).not.toHaveBeenCalled()
  })

  it('reports a storage failure instead of claiming activation', async () => {
    verify.mockResolvedValue({ ok: true, payload: { plan: 'pro' }, authority: 'legacy' })
    write.mockRejectedValue(new Error('quota'))
    await expect(handleExternalActivation(msg('signed.valid'), { url: PRICING })).resolves.toEqual({
      ok: false,
      reason: 'storage',
    })
  })
})

describe('registerExternalActivation', () => {
  it('answers onMessageExternal asynchronously with the activation reply', async () => {
    let listener:
      | ((m: unknown, s: { url?: string }, r: (x: unknown) => void) => boolean)
      | undefined
    vi.stubGlobal('chrome', {
      runtime: {
        onMessageExternal: {
          addListener: (f: typeof listener) => {
            listener = f
          },
        },
      },
    })
    registerExternalActivation()
    verify.mockResolvedValue({ ok: true, payload: { plan: 'pro', seats: 1 }, authority: 'money' })
    write.mockResolvedValue(undefined)
    const reply = vi.fn()
    expect(listener!({ ...msg('signed.valid'), ...INLINE_CONSENT }, { url: PRICING }, reply)).toBe(true)
    await vi.waitFor(() =>
      expect(reply).toHaveBeenCalledWith({ ok: true, scope: 'Personal · 1 account/profile' }),
    )
    vi.unstubAllGlobals()
  })

  it('is a no-op where page-to-extension messaging does not exist', () => {
    vi.stubGlobal('chrome', { runtime: {} })
    expect(() => registerExternalActivation()).not.toThrow()
    vi.unstubAllGlobals()
  })
})
