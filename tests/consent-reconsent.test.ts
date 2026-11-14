import { readFileSync } from 'node:fs'
import { Window } from 'happy-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  ACTIVATION_MESSAGE,
  CHROME_WEB_STORE_ID,
  WALLET_ACTIVATION_MESSAGE,
} from '../src/core/activation'
import {
  CURRENT_PRIVACY_VERSION,
  CURRENT_TERMS_VERSION,
  POLICY_CONSENT_KEY,
  fetchServerConsentStatus,
  needsPolicyReconsent,
  readPolicyConsent,
  recordPolicyConsent,
  type ConsentRecord,
} from '../src/core/restore'
import { fake } from './fixtures/fake-tokens'

const siteActivateCode = readFileSync(new URL('../site/activate.js', import.meta.url), 'utf8')
const manifest = JSON.parse(
  readFileSync(new URL('../src/extension/manifest.json', import.meta.url), 'utf8'),
)

type InputLike = {
  checked: boolean
  dispatchEvent: (e: unknown) => boolean
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('affirmative clickwrap & versioned policy re-consent', () => {
  it('requires affirmative clickwrap and rejects unaccepted or outdated consent', async () => {
    expect(CURRENT_TERMS_VERSION).toBe('2026-11-14')
    expect(CURRENT_PRIVACY_VERSION).toBe('2026-11-14')

    await expect(
      recordPolicyConsent({
        surface: 'gpdt_extension',
        accepted: false,
      }),
    ).rejects.toThrow('affirmative_consent_required')

    await expect(
      recordPolicyConsent({
        surface: 'gpdt_web_activate',
        termsVersion: '2025-12-31',
        privacyVersion: CURRENT_PRIVACY_VERSION,
      }),
    ).rejects.toThrow('affirmative_consent_required')
  })

  it('returns needsPolicyReconsent === false once CURRENT_TERMS_VERSION and CURRENT_PRIVACY_VERSION are accepted', async () => {
    const store = new Map<string, unknown>()
    vi.stubGlobal('chrome', {
      storage: {
        local: {
          set: (items: Record<string, unknown>, cb: () => void) => {
            for (const [k, v] of Object.entries(items)) store.set(k, v)
            cb()
          },
          get: (keys: string[], cb: (d: Record<string, unknown>) => void) => {
            cb(Object.fromEntries(keys.map((k) => [k, store.get(k)])))
          },
        },
      },
      runtime: {},
    })

    const calls: { url: string; init?: RequestInit }[] = []
    const fakeFetch: typeof fetch = async (input, init) => {
      calls.push({ url: String(input), init })
      return new Response('{}', { status: 200 })
    }
    expect(needsPolicyReconsent(null)).toBe(true)
    expect(needsPolicyReconsent(undefined)).toBe(true)

    const saved = await recordPolicyConsent({
      userId: 'usr_123',
      surface: 'gpdt_extension',
      token: fake('sess', 'live', 'abc12345'),
      fetchImpl: fakeFetch,
    })

    expect(saved).toMatchObject({
      user_id: 'usr_123',
      terms_version: CURRENT_TERMS_VERSION,
      privacy_version: CURRENT_PRIVACY_VERSION,
      surface: 'gpdt_extension',
    })
    expect(needsPolicyReconsent(saved)).toBe(false)
    expect(await readPolicyConsent()).toEqual(saved)
    expect(calls).toHaveLength(1)
    expect(calls[0].url).toContain('/consent:accept')
    expect((calls[0].init?.headers as Record<string, string>)['x-sylphx-organization']).toBe(
      'org_fs01afbdccgn8xdk1ghj5y47w0vtph',
    )
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({
      terms_accepted: true,
      terms_version: CURRENT_TERMS_VERSION,
      privacy_version: CURRENT_PRIVACY_VERSION,
      surface: 'gpdt_extension',
    })

    const status = await fetchServerConsentStatus({
      token: fake('sess', 'live', 'abc12345'),
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            user_id: 'usr_123',
            current_terms_version: CURRENT_TERMS_VERSION,
            current_privacy_version: CURRENT_PRIVACY_VERSION,
            accepted_terms_version: CURRENT_TERMS_VERSION,
            accepted_privacy_version: CURRENT_PRIVACY_VERSION,
            accepted_at: '2026-11-14T18:00:00.000Z',
            needs_reconsent: false,
          }),
          { status: 200 },
        ),
    })
    expect(status).toEqual({
      user_id: 'usr_123',
      terms_version: CURRENT_TERMS_VERSION,
      privacy_version: CURRENT_PRIVACY_VERSION,
      accepted_at: '2026-11-14T18:00:00.000Z',
      surface: 'sylphx_cloud',
    })
  })

  it('triggers needsPolicyReconsent() === true when CURRENT_TERMS_VERSION or CURRENT_PRIVACY_VERSION is bumped', () => {
    const acceptedRecord: ConsentRecord = {
      user_id: 'usr_123',
      terms_version: CURRENT_TERMS_VERSION,
      privacy_version: CURRENT_PRIVACY_VERSION,
      accepted_at: '2026-11-14T17:00:00.000Z',
      surface: 'gpdt_web_activate',
    }
    expect(needsPolicyReconsent(acceptedRecord)).toBe(false)

    // Bumping required Terms version triggers re-consent
    expect(needsPolicyReconsent(acceptedRecord, '2026-12-01', CURRENT_PRIVACY_VERSION)).toBe(true)
    // Bumping required Privacy version triggers re-consent
    expect(needsPolicyReconsent(acceptedRecord, CURRENT_TERMS_VERSION, '2026-12-01')).toBe(true)

    // Older stored record triggers re-consent against current versions
    expect(
      needsPolicyReconsent({
        ...acceptedRecord,
        terms_version: '2026-01-01',
      }),
    ).toBe(true)
    expect(
      needsPolicyReconsent({
        ...acceptedRecord,
        privacy_version: '2026-01-01',
      }),
    ).toBe(true)
  })

  it('holds a wallet handoff in site/activate.js behind an unticked clickwrap, then sends the versioned acceptance', async () => {
    const win = new Window({
      url: 'https://sylphxai.github.io/Google-Photos-Delete-Tool/pricing?session_id=cs_1',
    })
    const sendMessage = vi.fn((_id: string, _msg: unknown, cb: (r: unknown) => void) => {
      queueMicrotask(() => cb({ ok: true, scope: 'AI Restore Wallet' }))
    })
    ;(win as unknown as Record<string, unknown>).chrome = { runtime: { sendMessage } }
    win.document.body.innerHTML =
      '<section><pre data-keel-money-wallet-token hidden></pre></section>'

    new Function('window', 'document', 'MutationObserver', siteActivateCode)(
      win,
      win.document,
      win.MutationObserver,
    )

    const walletPre = win.document.querySelector('[data-keel-money-wallet-token]')!
    walletPre.textContent = fake('sess', 'live', 'wallet', 'token', '999')
    await vi.waitFor(() => expect(win.document.getElementById('gpdt-policy-gate')).not.toBeNull())
    const gateHtml = win.document.getElementById('gpdt-policy-gate')!.innerHTML
    expect(gateHtml).toContain('privacy.html')
    expect(gateHtml).toContain('terms.html')
    const checkbox = win.document.getElementById('gpdt-policy-check') as unknown as InputLike
    const agree = win.document.getElementById('gpdt-policy-agree') as unknown as { disabled: boolean; click: () => void }
    expect(checkbox.checked).toBe(false)
    expect(agree.disabled).toBe(true)
    expect(sendMessage).not.toHaveBeenCalled()

    checkbox.checked = true
    checkbox.dispatchEvent(new win.Event('change'))
    expect(sendMessage).not.toHaveBeenCalled()
    agree.click()
    await vi.waitFor(() => expect(sendMessage).toHaveBeenCalledTimes(1))
    expect(sendMessage.mock.calls[0][0]).toBe(CHROME_WEB_STORE_ID)
    expect(sendMessage.mock.calls[0][1]).toMatchObject({
      type: WALLET_ACTIVATION_MESSAGE,
      wallet_token: fake('sess', 'live', 'wallet', 'token', '999'),
      terms_version: CURRENT_TERMS_VERSION,
      privacy_version: CURRENT_PRIVACY_VERSION,
    })
    const stored = JSON.parse(win.localStorage.getItem(POLICY_CONSENT_KEY) ?? 'null') as ConsentRecord
    expect(stored.surface).toBe('gpdt_web_activate')
    expect(needsPolicyReconsent(stored)).toBe(false)
  })

  it('requires re-consent in site/activate.js when stored gpdt_policy_consent has an older version', async () => {
    const win = new Window({
      url: 'https://sylphxai.github.io/Google-Photos-Delete-Tool/pricing?session_id=cs_1',
    })
    win.localStorage.setItem(
      POLICY_CONSENT_KEY,
      JSON.stringify({
        terms_version: '2025-01-01',
        privacy_version: '2025-01-01',
        accepted_at: '2025-01-01T00:00:00.000Z',
        surface: 'gpdt_web_activate',
      }),
    )
    const sendMessage = vi.fn((_id: string, _msg: unknown, cb: (r: unknown) => void) => {
      queueMicrotask(() => cb({ ok: true, scope: 'Personal · 1 account/profile' }))
    })
    ;(win as unknown as Record<string, unknown>).chrome = { runtime: { sendMessage } }
    win.document.body.innerHTML =
      '<section><pre data-keel-money-licence-token hidden></pre></section>'

    new Function('window', 'document', 'MutationObserver', siteActivateCode)(
      win,
      win.document,
      win.MutationObserver,
    )

    const pre = win.document.querySelector('[data-keel-money-licence-token]')!
    pre.textContent = 'signed.valid'
    await vi.waitFor(() => expect(win.document.getElementById('gpdt-policy-gate')).not.toBeNull())
    expect(sendMessage).not.toHaveBeenCalled()

    const checkbox = win.document.getElementById('gpdt-policy-check') as unknown as InputLike
    checkbox.checked = true
    checkbox.dispatchEvent(new win.Event('change'))
    ;(win.document.getElementById('gpdt-policy-agree') as unknown as { click: () => void }).click()
    await vi.waitFor(() => expect(sendMessage).toHaveBeenCalledTimes(1))
    expect(sendMessage.mock.calls[0][1]).toMatchObject({
      type: ACTIVATION_MESSAGE,
      token: 'signed.valid',
      terms_version: CURRENT_TERMS_VERSION,
      privacy_version: CURRENT_PRIVACY_VERSION,
    })
  })

  it('adds zero permissions or host_permissions to src/extension/manifest.json', () => {
    expect(manifest.permissions).toEqual(['storage'])
    expect(manifest.host_permissions).toEqual(['https://photos.google.com/*'])
    expect(manifest.content_scripts[0].matches).toEqual(['https://photos.google.com/*'])
  })
})
