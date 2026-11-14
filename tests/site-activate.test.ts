import { readFileSync } from 'node:fs'
import { Window } from 'happy-dom'
import { describe, expect, it, vi } from 'vitest'
import { ACTIVATION_MESSAGE, CHROME_WEB_STORE_ID } from '../src/core/activation'
import { CURRENT_PRIVACY_VERSION, CURRENT_TERMS_VERSION, POLICY_CONSENT_KEY, PRIVACY_URL, TERMS_URL, policyAccepted } from '../src/ui/restore/policy-consent'
import { WALLET_ACTIVATION_MESSAGE } from '../src/ui/restore/studio'

const code = readFileSync(new URL('../site/activate.js', import.meta.url), 'utf8')
type Reply = { ok: boolean; scope?: string; reason?: string } | undefined
type Send = (id: string, message: { type: string; token: string }, cb: (reply: Reply) => void) => void
const ACCEPTED = { user_id: 'local-1', terms_version: CURRENT_TERMS_VERSION, privacy_version: CURRENT_PRIVACY_VERSION, accepted_at: '2026-11-14T00:00:00.000Z', surface: 'gpdt_web_activate' }

let win: Window
let rt: { lastError?: { message: string }; sendMessage: Send } | undefined
const status = () => win.document.getElementById('gpdt-activation-status')?.textContent ?? ''

/** A fresh pricing page; `rt` is chrome.runtime as Chrome exposes it when an installed extension lists this origin. */
function page(ids?: string, opts: { consent?: unknown; search?: string } = {}) {
  win = new Window({ url: `https://sylphxai.github.io/Google-Photos-Delete-Tool/pricing${opts.search ?? '?session_id=cs_1'}` })
  const consent = 'consent' in opts ? opts.consent : ACCEPTED
  if (consent !== undefined) win.localStorage.setItem(POLICY_CONSENT_KEY, typeof consent === 'string' ? consent : JSON.stringify(consent))
  const w = win as unknown as Record<string, unknown>
  if (rt) w.chrome = { runtime: rt }
  win.document.body.innerHTML = '<section><pre data-keel-money-licence-token hidden></pre></section>'
  const script = ids ? { getAttribute: () => ids } : null
  const doc = new Proxy(win.document, {
    get: (t, k) => {
      if (k === 'currentScript') return script
      const v = Reflect.get(t, k, t)
      return typeof v === 'function' ? v.bind(t) : v
    },
  })
  new Function('window', 'document', 'MutationObserver', code)(win, doc, win.MutationObserver)
  return win.document.querySelector('pre')!
}

function runtime(handler: ((id: string, token: string) => Reply) | null) {
  if (!handler) return (rt = undefined)
  const r: NonNullable<typeof rt> = {
    sendMessage: vi.fn<Send>((id, message, cb) => {
      queueMicrotask(() => {
        const reply = handler(id, message.token)
        r.lastError = reply === undefined ? { message: 'Could not establish connection. Receiving end does not exist.' } : undefined
        cb(reply)
        r.lastError = undefined
      })
    }),
  }
  return (rt = r)
}

describe('site activation handoff', () => {
  it('sends a checkout licence to the store extension and shows the verified scope', async () => {
    const rt = runtime(() => ({ ok: true, scope: 'Family · 3 accounts/profiles' }))!
    page().textContent = ' signed.valid '
    await vi.waitFor(() => expect(status()).toContain('Pro activated in this browser — Family'))
    expect(rt.sendMessage).toHaveBeenCalledTimes(1)
    expect(vi.mocked(rt.sendMessage).mock.calls[0][0]).toBe(CHROME_WEB_STORE_ID)
    // The handoff carries the stored acceptance so the extension records the same versions.
    expect(vi.mocked(rt.sendMessage).mock.calls[0][1]).toEqual({
      type: ACTIVATION_MESSAGE, token: 'signed.valid', terms_version: CURRENT_TERMS_VERSION,
      privacy_version: CURRENT_PRIVACY_VERSION, accepted_at: ACCEPTED.accepted_at, user_id: ACCEPTED.user_id,
    })
  })

  it('reports an invalid licence without claiming activation', async () => {
    runtime(() => ({ ok: false, reason: 'invalid' }))
    page().textContent = 'forged.invalid'
    await vi.waitFor(() => expect(status()).toContain('has not changed'))
  })

  it('falls back to manual paste when no extension answers', async () => {
    runtime(() => undefined)
    page().textContent = 'signed.valid'
    await vi.waitFor(() => expect(status()).toContain('paste it into the Pro licence box'))
  })

  it('falls back to manual paste when the browser exposes no page-to-extension messaging', async () => {
    runtime(null)
    page().textContent = 'signed.valid'
    await vi.waitFor(() => expect(status()).toContain('paste it into the Pro licence box'))
  })

  it('tries configured extension ids in order (unpacked or test builds)', async () => {
    const rt = runtime((id) => (id === 'dev2' ? { ok: true, scope: 'Personal · 1 account/profile' } : undefined))!
    page('dev1,dev2').textContent = 'signed.valid'
    await vi.waitFor(() => expect(status()).toContain('Personal'))
    expect(vi.mocked(rt.sendMessage).mock.calls.map((c) => c[0])).toEqual(['dev1', 'dev2'])
  })

  it('sends nothing for a malformed token and never stores the licence in the page', async () => {
    const rt = runtime(() => ({ ok: true, scope: 'x' }))!
    page().textContent = 'a.b.c'
    await new Promise((r) => setTimeout(r, 10))
    expect(rt.sendMessage).not.toHaveBeenCalled()
    win.document.querySelector('pre')!.textContent = 'signed.valid'
    await vi.waitFor(() => expect(status()).toContain('Pro activated'))
    for (let i = 0; i < win.localStorage.length; i++) {
      expect(win.localStorage.getItem(win.localStorage.key(i)!)).not.toContain('signed.valid')
    }
  })
})

describe('terms clickwrap before activation', () => {
  const gate = () => win.document.getElementById('gpdt-policy-gate')
  const box = () => win.document.getElementById('gpdt-policy-check') as unknown as HTMLInputElement
  const agree = () => win.document.getElementById('gpdt-policy-agree') as unknown as HTMLButtonElement

  it('keeps the site and extension on the same versions and legal pages', () => {
    expect(code).toContain(`var TERMS_VERSION = '${CURRENT_TERMS_VERSION}'`)
    expect(code).toContain(`var PRIVACY_VERSION = '${CURRENT_PRIVACY_VERSION}'`)
    expect(code).toContain(`var POLICY_KEY = '${POLICY_CONSENT_KEY}'`)
    expect(code).toContain(TERMS_URL)
    expect(code).toContain(PRIVACY_URL)
  })

  for (const [label, consent] of [
    ['no acceptance', undefined],
    ['an older terms version', { ...ACCEPTED, terms_version: '2026-01-01' }],
    ['an older privacy version', { ...ACCEPTED, privacy_version: '2026-01-01' }],
    ['an unreadable record', '{not json'],
  ] as const) {
    it(`holds the licence until the box is ticked and agreed (${label})`, async () => {
      const rt = runtime(() => ({ ok: true, scope: 'Personal · 1 account/profile' }))!
      page(undefined, { consent }).textContent = 'signed.valid'
      await vi.waitFor(() => expect(gate()).not.toBeNull())
      expect(gate()!.textContent).toContain('Terms of Service & Privacy Policy Update')
      expect(box().checked).toBe(false)
      expect(agree().disabled).toBe(true)
      agree().click()
      await new Promise((r) => setTimeout(r, 10))
      expect(rt.sendMessage).not.toHaveBeenCalled()

      box().checked = true
      box().dispatchEvent(new win.Event('change') as unknown as Event)
      expect(agree().disabled).toBe(false)
      agree().click()
      await vi.waitFor(() => expect(status()).toContain('Pro activated'))
      expect(gate()).toBeNull()
      const saved = JSON.parse(win.localStorage.getItem(POLICY_CONSENT_KEY)!)
      expect(policyAccepted(saved)).toBe(true)
      expect(saved).toMatchObject({ terms_version: CURRENT_TERMS_VERSION, privacy_version: CURRENT_PRIVACY_VERSION, surface: 'gpdt_web_activate' })
    })
  }

  it('does not prompt again once the current version is accepted', async () => {
    const rt = runtime(() => ({ ok: true, scope: 'x' }))!
    page().textContent = 'signed.valid'
    await vi.waitFor(() => expect(status()).toContain('Pro activated'))
    expect(gate()).toBeNull()
    expect(rt.sendMessage).toHaveBeenCalledTimes(1)
  })
})

describe('wallet handoff', () => {
  const walletToken = 'wlt_0123456789abcdefABCDEF'

  it('relays wallet_token from the pricing page and drops it from the address bar', async () => {
    const rt = runtime(() => ({ ok: true }))!
    page(undefined, { search: `?offer=credits&wallet_token=${walletToken}` })
    await vi.waitFor(() => expect(status()).toContain('AI credits are connected'))
    expect(vi.mocked(rt.sendMessage).mock.calls[0][0]).toBe(CHROME_WEB_STORE_ID)
    expect(vi.mocked(rt.sendMessage).mock.calls[0][1]).toMatchObject({
      type: WALLET_ACTIVATION_MESSAGE, wallet_token: walletToken, terms_version: CURRENT_TERMS_VERSION, privacy_version: CURRENT_PRIVACY_VERSION,
    })
    expect(win.location.search).toBe('?offer=credits')
  })

  it('waits for the clickwrap before relaying a wallet', async () => {
    const rt = runtime(() => ({ ok: true }))!
    page(undefined, { search: `?wallet_token=${walletToken}`, consent: undefined })
    await vi.waitFor(() => expect(win.document.getElementById('gpdt-policy-gate')).not.toBeNull())
    expect(rt.sendMessage).not.toHaveBeenCalled()
  })

  it('rejects a malformed wallet token without messaging the extension', async () => {
    const rt = runtime(() => ({ ok: true }))!
    page(undefined, { search: '?wallet_token=short' })
    await vi.waitFor(() => expect(status()).toContain('could not be verified'))
    expect(rt.sendMessage).not.toHaveBeenCalled()
  })

  it('points to manual connect when no extension answers', async () => {
    runtime(() => undefined)
    page(undefined, { search: `?wallet_token=${walletToken}` })
    await vi.waitFor(() => expect(status()).toContain('Connect Sylphx Wallet'))
  })
})
