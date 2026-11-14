import { readFileSync } from 'node:fs'
import { Window } from 'happy-dom'
import { describe, expect, it, vi } from 'vitest'
import { ACTIVATION_MESSAGE, CHROME_WEB_STORE_ID } from '../src/core/activation'
import { CURRENT_PRIVACY_VERSION, CURRENT_TERMS_VERSION, POLICY_CONSENT_KEY, PRIVACY_URL, TERMS_URL, policyAccepted } from '../src/ui/restore/policy-consent'
import { WALLET_ACTIVATION_MESSAGE } from '../src/ui/restore/studio'
import { fake } from './fixtures/fake-tokens'

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
  const walletToken = fake('wlt', '0123456789abcdefABCDEF')

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

describe('AI credits checkout on the pricing page', () => {
  const API = 'https://api.example.test'
  const PARENT = 'orgs/o/projects/p/envs/e'
  const PUBLISHABLE = fake('pk', 'test', 'page', 'config')
  const walletToken = fake('wlt', '0123456789abcdef', 'ABCDEF')
  const catalog = {
    spec: {
      products: [
        { key: 'gpdt_pro', prices: [{ key: 'gpdt_pro_1', default_currency: 'USD', unit_amounts: { USD: '1900' } }] },
        { key: 'gpdt_credits_30', prices: [{ key: 'gpdt_credits_30', default_currency: 'USD', unit_amounts: { USD: '500' } }] },
        { key: 'gpdt_credits_100', prices: [{ key: 'gpdt_credits_100', default_currency: 'USD', unit_amounts: { USD: '1200' } }] },
        { key: 'gpdt_credits_300', prices: [{ key: 'gpdt_credits_300', default_currency: 'USD', unit_amounts: { USD: '2900' } }] },
        { key: 'gpdt_restore_pass', prices: [{ key: 'gpdt_restore_pass_monthly', default_currency: 'USD', unit_amounts: { USD: '499' }, recurring_interval: 'month' }] },
      ],
    },
  }
  type Call = { url: string; init?: RequestInit }
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

  /** A pricing page carrying the Money config, with fetch answered by `routes`. */
  function creditsPage(search: string, opts: { consent?: unknown; routes?: Record<string, () => Response> } = {}) {
    win = new Window({ url: `https://sylphxai.github.io/Google-Photos-Delete-Tool/pricing${search}` })
    const consent = 'consent' in opts ? opts.consent : ACCEPTED
    if (consent !== undefined) win.localStorage.setItem(POLICY_CONSENT_KEY, JSON.stringify(consent))
    const calls: Call[] = []
    const routes: Record<string, () => Response> = { '/catalog': () => json(catalog), ...opts.routes }
    ;(win as unknown as { fetch: unknown }).fetch = vi.fn(async (input: string, init?: RequestInit) => {
      calls.push({ url: String(input), init })
      const hit = Object.keys(routes).find((k) => String(input).endsWith(k))
      return hit ? routes[hit]() : json({}, 404)
    })
    const assign = vi.fn()
    Object.defineProperty(win.location, 'assign', { value: assign, configurable: true })
    if (rt) (win as unknown as Record<string, unknown>).chrome = { runtime: rt }
    const config = { api_origin: API, parent: PARENT, publishable_key: PUBLISHABLE, product: 'gpdt_pro' }
    win.document.body.innerHTML = '<main><section id="money-checkout-pricing"></section><pre data-keel-money-licence-token hidden></pre></main>'
    win.document.getElementById('money-checkout-pricing')!.setAttribute('data-keel-money-checkout', JSON.stringify(config))
    const doc = new Proxy(win.document, {
      get: (t, k) => {
        if (k === 'currentScript') return null
        const v = Reflect.get(t, k, t)
        return typeof v === 'function' ? v.bind(t) : v
      },
    })
    new Function('window', 'document', 'MutationObserver', code)(win, doc, win.MutationObserver)
    return { calls, assign }
  }
  const $ = <T = HTMLElement>(id: string) => win.document.getElementById(id) as unknown as T
  async function fillAndSubmit() {
    await vi.waitFor(() => expect($('gpdt-credits')).not.toBeNull())
    await vi.waitFor(() => expect(win.document.querySelector('[data-credit-price="gpdt_credits_100"]')!.textContent).toBe('$12.00'))
    const email = $<HTMLInputElement>('gpdt-credits-email')
    email.value = 'buyer@example.com'
    email.dispatchEvent(new win.Event('input', { bubbles: true }) as unknown as Event)
    const waiver = $<HTMLInputElement>('gpdt-credits-waiver')
    waiver.checked = true
    waiver.dispatchEvent(new win.Event('change', { bubbles: true }) as unknown as Event)
    expect($<HTMLButtonElement>('gpdt-credits-submit').disabled).toBe(false)
    $<HTMLFormElement>('gpdt-credits-form').dispatchEvent(new win.Event('submit', { bubbles: true, cancelable: true }) as unknown as Event)
  }

  it('lists the four offers with live prices and pre-selects the requested pack', async () => {
    creditsPage('?offer=credits&pack=gpdt_restore_pass')
    await vi.waitFor(() => expect(win.document.querySelector('[data-credit-price="gpdt_restore_pass_monthly"]')!.textContent).toBe('$4.99/mo'))
    const labels = [...win.document.querySelectorAll('#gpdt-credits label[for^="gpdt-offer-"]')].map((l) => l.textContent)
    expect(labels).toEqual([
      expect.stringContaining('Starter Pack30 credits'), expect.stringContaining('Popular Pack100 credits'),
      expect.stringContaining('Archive Pack300 credits'), expect.stringContaining('Monthly Pass50 credits a month'),
    ])
    expect($<HTMLInputElement>('gpdt-offer-gpdt_restore_pass_monthly').checked).toBe(true)
    expect($<HTMLButtonElement>('gpdt-credits-submit').disabled).toBe(true)
  })

  it('starts an anonymous checkout with the page config after the clickwrap, then redirects', async () => {
    runtime(() => ({ ok: true }))
    const { calls, assign } = creditsPage('?offer=credits&pack=gpdt_credits_100', {
      consent: undefined,
      routes: { 'checkout_sessions:clientCreate': () => json({ url: 'https://checkout.stripe.com/c/pay/cs_test_1', claim_secret: 'claim-1', processor_session_id: 'cs_test_1' }) },
    })
    await fillAndSubmit()
    await vi.waitFor(() => expect($('gpdt-policy-gate')).not.toBeNull())
    expect(calls.some((c) => c.url.includes('checkout_sessions'))).toBe(false)
    const check = $<HTMLInputElement>('gpdt-policy-check')
    check.checked = true
    check.dispatchEvent(new win.Event('change') as unknown as Event)
    $<HTMLButtonElement>('gpdt-policy-agree').click()
    await vi.waitFor(() => expect(assign).toHaveBeenCalledWith('https://checkout.stripe.com/c/pay/cs_test_1'))
    const create = calls.find((c) => c.url.endsWith('checkout_sessions:clientCreate'))!
    expect(create.url).toBe(`${API}/v1/money/${PARENT}/checkout_sessions:clientCreate`)
    expect((create.init!.headers as Record<string, string>).Authorization).toBe(`Bearer ${PUBLISHABLE}`)
    const body = JSON.parse(String(create.init!.body))
    expect(body).toMatchObject({
      product: 'gpdt_credits_100', price: 'gpdt_credits_100', quantity: 1, currency_code: 'USD', buyer_email: 'buyer@example.com',
      success_url: 'https://sylphxai.github.io/Google-Photos-Delete-Tool/pricing?offer=credits&credit_session_id={CHECKOUT_SESSION_ID}',
      cancel_url: 'https://sylphxai.github.io/Google-Photos-Delete-Tool/pricing?offer=credits&checkout=cancelled',
    })
    expect(body.consent).toMatchObject({ terms_accepted: true })
    expect(win.sessionStorage.getItem('keel:money:claim:cs_test_1')).toBe('claim-1')
  })

  it('binds the checkout to the connected wallet when the page carries a wallet token', async () => {
    runtime(() => ({ ok: true }))
    const { calls } = creditsPage(`?offer=credits&pack=gpdt_credits_30&wallet_token=${walletToken}`, {
      routes: { 'checkout_sessions:userCreate': () => json({ checkout_url: 'https://checkout.stripe.com/c/pay/cs_test_2' }) },
    })
    await fillAndSubmit()
    await vi.waitFor(() => expect(calls.some((c) => c.url.endsWith('checkout_sessions:userCreate'))).toBe(true))
    const create = calls.find((c) => c.url.endsWith('checkout_sessions:userCreate'))!
    expect((create.init!.headers as Record<string, string>).Authorization).toBe(`Bearer ${walletToken}`)
    expect(JSON.parse(String(create.init!.body))).toMatchObject({ price: 'gpdt_credits_30', quantity: 1 })
  })

  it('keeps checkout closed when the live catalogue does not list the pack', async () => {
    const { calls } = creditsPage('?offer=credits&pack=gpdt_credits_300', { routes: { '/catalog': () => json({ spec: { products: [] } }) } })
    await vi.waitFor(() => expect($('gpdt-credits-status').textContent).toContain('not available'))
    expect($<HTMLButtonElement>('gpdt-credits-submit').disabled).toBe(true)
    expect(calls.every((c) => c.url.endsWith('/catalog'))).toBe(true)
  })

  it('confirms payment, claims the credits into the wallet and hands the wallet to the extension', async () => {
    const r = runtime(() => ({ ok: true }))!
    const { calls } = creditsPage(`?offer=credits&credit_session_id=cs_test_3&wallet_token=${walletToken}`, {
      routes: { 'checkout_sessions:redeem': () => json({ paid: true }), 'wallet:claimCheckout': () => json({ ok: true, balance: 103 }) },
    })
    await vi.waitFor(() => expect(status()).toContain('credits are in your Sylphx wallet'))
    const claim = calls.find((c) => c.url.endsWith('wallet:claimCheckout'))!
    expect(claim.url).toBe(`${API}/v1/money/${PARENT}/wallet:claimCheckout`)
    expect((claim.init!.headers as Record<string, string>).Authorization).toBe(`Bearer ${walletToken}`)
    expect(JSON.parse(String(claim.init!.body))).toEqual({ checkout_session_id: 'cs_test_3', asset: 'AI_RESTORE_CREDIT' })
    const walletSends = vi.mocked(r.sendMessage).mock.calls.filter((c) => c[1].type === WALLET_ACTIVATION_MESSAGE)
    expect(walletSends.length).toBe(2) // on arrival, and again once the credits are in
    expect($('gpdt-credits')).toBeNull()
  })

  it('never claims for an unpaid session or without a wallet', async () => {
    runtime(() => ({ ok: true }))
    let page = creditsPage(`?offer=credits&credit_session_id=cs_test_4&wallet_token=${walletToken}`, { routes: { 'checkout_sessions:redeem': () => json({ paid: false }) } })
    await vi.waitFor(() => expect(status()).toContain('not confirmed yet'))
    expect(page.calls.some((c) => c.url.endsWith('wallet:claimCheckout'))).toBe(false)

    page = creditsPage('?offer=credits&credit_session_id=cs_test_5', { routes: { 'checkout_sessions:redeem': () => json({ paid: true }) } })
    await vi.waitFor(() => expect(status()).toContain('Connect Sylphx Wallet'))
    expect(page.calls.some((c) => c.url.endsWith('wallet:claimCheckout'))).toBe(false)
  })

  it('reads every Money setting from the page instead of hardcoding a key', () => {
    expect(code).not.toMatch(/sylphx_pk_/)
    expect(code).not.toContain('api.sylphx.com')
  })
})
