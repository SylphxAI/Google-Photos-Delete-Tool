import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'

const read = (f: string) => readFileSync(new URL(`../site/${f}`, import.meta.url), 'utf8')
const tracking = read('tracking.js')

type Call = unknown[]

async function run(page: 'index' | 'thanks' | 'privacy' | 'terms', config: object, search = '', initial: Record<string, string> = {}) {
  const storage = new Map<string, string>(Object.entries(initial))
  const appended: { src?: string }[] = []
  const listeners: Record<string, () => void> = {}
  const link = { href: '', addEventListener: (_: string, f: () => void) => { listeners.click = f } }
  const link2 = { href: '', addEventListener: (_: string, f: () => void) => { listeners.click2 = f } }
  const stripe = { href: 'https://buy.stripe.com/test_abc', addEventListener: () => {} }
  const buttons: Record<string, () => void> = {}
  const pressed: Record<string, string> = {}
  const settings = { addEventListener: (_: string, f: () => void) => { listeners.settings = f } }
  const banner = {
    hidden: true,
    querySelector: (sel: string) => ({ setAttribute: (k: string, v: string) => { if (k === 'aria-pressed') pressed[sel.match(/"(.+)"/)![1]] = v }, addEventListener: (_: string, f: () => void) => { buttons[sel.match(/"(.+)"/)![1]] = f } }),
  }
  const ctx: Record<string, unknown> = {
    document: {
      currentScript: { getAttribute: () => page },
      getElementById: (id: string) => (id === 'add-to-chrome' ? link : id === 'consent' ? banner : id === 'cookie-settings' ? settings : null),
      querySelectorAll: (sel: string) => (sel === '[data-cta="add-to-chrome"]' ? [link, link2] : sel === '[data-cookie-settings]' ? [settings] : sel === 'a[href^="https://buy.stripe.com/"]' ? [stripe] : []),
      createElement: () => ({}),
      head: { appendChild: (e: { src?: string }) => appended.push(e) },
    },
    location: { search, origin: 'https://x.test', pathname: '/thanks.html' },
    localStorage: { getItem: (k: string) => storage.get(k) ?? null, setItem: (k: string, v: string) => storage.set(k, v) },
    fetch: () => Promise.resolve({ json: () => Promise.resolve(config) }),
    URL,
    URLSearchParams,
    Object,
    Date,
    encodeURIComponent,
    window: {} as Record<string, unknown>,
  }
  ctx.window = ctx
  runInNewContext(tracking, ctx)
  await new Promise((r) => setTimeout(r, 10))
  const snapshot = () => ((ctx.dataLayer as unknown[]) ?? []).map((a) => Array.from(a as ArrayLike<unknown>)) as Call[]
  return { calls: snapshot(), snapshot, appended, link, link2, stripe, click: listeners.click, click2: listeners.click2, buttons, banner, storage, pressed, reopen: listeners.settings }
}

const real = {
  ga4MeasurementId: 'G-ABC123',
  adsConversionId: 'AW-123456',
  addToChromeSendTo: 'AW-123456/aaa',
  purchaseSendTo: 'AW-123456/bbb',
}

const PAGES = ['index.html', 'thanks.html', 'bye.html', 'privacy.html', 'terms.html']
const SIGNALS = ['ad_storage', 'ad_user_data', 'ad_personalization', 'analytics_storage']
const lastUpdate = (calls: Call[]) => calls.filter((c) => c[0] === 'consent' && c[1] === 'update').pop()?.[2] as Record<string, string> | undefined

describe('site tracking', () => {
  it('ships placeholder ids and loads no tags with them', async () => {
    const placeholders = { ga4MeasurementId: 'G-XXXX', adsConversionId: 'AW-XXXX', addToChromeSendTo: 'AW-XXXX/LABEL', purchaseSendTo: 'AW-XXXX/LABEL' }
    for (const page of ['index', 'thanks'] as const) {
      const r = await run(page, placeholders, '?session_id=cs_live_abcdefgh12')
      expect(r.appended).toHaveLength(0)
      expect(r.calls).toHaveLength(0)
    }
    expect(read('index.html')).not.toMatch(/googletagmanager/)
    expect(read('thanks.html')).not.toMatch(/googletagmanager/)
  })

  it('sets consent defaults (denied in EEA/UK/CH, granted elsewhere) before config', async () => {
    const { calls, appended } = await run('index', real)
    expect(appended).toHaveLength(1)
    const firstConfig = calls.findIndex((c) => c[0] === 'config')
    const defaults = calls.map((c, i) => [c, i] as const).filter(([c]) => c[0] === 'consent' && c[1] === 'default')
    expect(defaults).toHaveLength(2)
    for (const [, i] of defaults) expect(i).toBeLessThan(firstConfig)
    const denied = defaults[0][0][2] as Record<string, unknown>
    for (const k of ['ad_storage', 'ad_user_data', 'ad_personalization', 'analytics_storage']) expect(denied[k]).toBe('denied')
    expect(denied.region).toEqual(expect.arrayContaining(['DE', 'GB', 'CH', 'FR']))
    expect((defaults[1][0][2] as Record<string, unknown>).ad_storage).toBe('granted')
  })

  it('records add_to_chrome_click and an Ads conversion, carrying UTM', async () => {
    const r = await run('index', real, '?utm_source=google&utm_campaign=c1&email=a@b.c')
    expect(r.link.href).toContain('utm_source=google')
    expect(r.link.href).not.toContain('email')
    r.click()
    const ev = r.snapshot().filter((c) => c[0] === 'event')
    expect(ev.map((c) => c[1])).toEqual(expect.arrayContaining(['add_to_chrome_click', 'conversion']))
  })

  it('thanks page sends purchase once with transaction_id and no personal data', async () => {
    const r = await run('thanks', real, '?session_id=cs_live_abcdefgh12')
    const purchase = r.calls.find((c) => c[0] === 'event' && c[1] === 'purchase')
    expect(purchase?.[2]).toEqual({ page_location: 'https://x.test/thanks.html', transaction_id: 'cs_live_abcdefgh12', value: 9.99, currency: 'USD' })
  })

  it('does not fire purchase for the unreplaced template or a missing id', async () => {
    for (const q of ['', '?session_id={CHECKOUT_SESSION_ID}']) {
      const r = await run('thanks', real, q)
      expect(r.calls.find((c) => c[1] === 'purchase')).toBeUndefined()
    }
  })

  it('renders the public stats from stats.json', () => {
    const s = JSON.parse(read('stats.json'))
    expect(s.users).toBe('10,000+')
    expect(s.rating).toBe(4.7)
    expect(s.ratingCount).toBe(134)
    expect(s.source).toBeTruthy()
    expect(read('index.html')).toContain('Google Photos is a trademark of Google LLC')
  })

  it.each([
    ['all', { ad_storage: 'granted', ad_user_data: 'granted', ad_personalization: 'granted', analytics_storage: 'granted' }],
    ['analytics', { ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied', analytics_storage: 'granted' }],
    ['none', { ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied', analytics_storage: 'denied' }],
  ])('button %s sets the right consent update and stores the choice', async (choice, expected) => {
    const r = await run('index', real)
    expect(r.banner.hidden).toBe(false)
    expect(Object.keys(r.buttons).sort()).toEqual(['all', 'analytics', 'none'])
    r.buttons[choice]()
    expect(lastUpdate(r.snapshot())).toEqual(expected)
    expect(r.storage.get('gpdt_consent')).toBe(choice)
    expect(r.banner.hidden).toBe(true)
  })

  it('re-applies a stored choice on load without showing the banner', async () => {
    const r = await run('index', real, '', { gpdt_consent: 'analytics' })
    expect(lastUpdate(r.calls)).toEqual({ ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied', analytics_storage: 'granted' })
    expect(r.banner.hidden).toBe(true)
  })

  it('migrates old granted/denied values', async () => {
    const g = await run('index', real, '', { gpdt_consent: 'granted' })
    expect(g.storage.get('gpdt_consent')).toBe('all')
    for (const k of SIGNALS) expect(lastUpdate(g.calls)?.[k]).toBe('granted')
    const d = await run('index', real, '', { gpdt_consent: 'denied' })
    expect(d.storage.get('gpdt_consent')).toBe('none')
    for (const k of SIGNALS) expect(lastUpdate(d.calls)?.[k]).toBe('denied')
  })

  it('banner markup has three equal buttons, no checkboxes, no false claim', () => {
    for (const f of PAGES) {
      const html = read(f)
      const b = html.match(/<div id="consent".*?<\/div>/s)![0]
      expect(b).not.toMatch(/No personal data|checkbox|checked/)
      expect(b.match(/<button/g)).toHaveLength(3)
      for (const c of ['all', 'analytics', 'none']) expect(b).toContain(`data-consent="${c}"`)
      expect(b).toContain('privacy.html')
    }
  })

  it('Cookie settings reopens the banner with the current choice and a new choice applies at once', async () => {
    const r = await run('index', real, '', { gpdt_consent: 'all' })
    expect(r.banner.hidden).toBe(true)
    r.reopen()
    expect(r.banner.hidden).toBe(false)
    expect(r.pressed).toEqual({ all: 'true', analytics: 'false', none: 'false' })
    r.buttons.none()
    expect(lastUpdate(r.snapshot())).toEqual({ ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied', analytics_storage: 'denied' })
    expect(r.storage.get('gpdt_consent')).toBe('none')
    expect(r.banner.hidden).toBe(true)
    r.reopen()
    expect(r.pressed.none).toBe('true')
  })

  it('both pages have a Cookie settings link', () => {
    for (const f of PAGES) expect(read(f)).toContain('id="cookie-settings"')
  })

  it('every Add to Chrome CTA carries UTM and fires the event', async () => {
    const r = await run('index', real, '?utm_source=google')
    expect(r.link2.href).toContain('utm_source=google')
    r.click2()
    expect(r.snapshot().some((c) => c[0] === 'event' && c[1] === 'add_to_chrome_click')).toBe(true)
  })

  it('Cookie settings opens the banner even with placeholder ids', async () => {
    const r = await run('index', { ga4MeasurementId: 'G-XXXX', adsConversionId: 'AW-XXXX' })
    expect(r.banner.hidden).toBe(true)
    r.reopen()
    expect(r.banner.hidden).toBe(false)
    expect(r.calls).toHaveLength(0)
    expect(r.appended).toHaveLength(0)
  })

  it('legal pages carry company details', () => {
    for (const f of PAGES) {
      const html = read(f)
      for (const v of ['16438428', '128 City Road', 'EC1V 2NX', '+44 333 335 7935', 'hi@sylphx.com', 'privacy.html', 'terms.html']) expect(html).toContain(v)
    }
  })

  it('no placeholder checkout ships', () => {
    expect(read('index.html')).not.toContain('PRO_CHECKOUT_URL')
  })

  it('purchase fires once per session id, never for a bad id, and Google never gets session_id', async () => {
    const r = await run('thanks', real, '?session_id=cs_live_abcdefgh12')
    expect(r.calls.filter((c) => c[1] === 'purchase')).toHaveLength(1)
    const again = await run('thanks', real, '?session_id=cs_live_abcdefgh12', { gpdt_purchase_cs_live_abcdefgh12: '1' })
    expect(again.calls.find((c) => c[1] === 'purchase')).toBeUndefined()
    for (const q of ['?session_id=abc', '?session_id=cs_live_<x>', '?session_id=cs_']) {
      expect((await run('thanks', real, q)).calls.find((c) => c[1] === 'purchase')).toBeUndefined()
    }
    for (const c of r.calls.filter((c) => c[0] === 'config')) expect((c[2] as { page_location: string }).page_location).toBe('https://x.test/thanks.html')
    expect(JSON.stringify(r.calls)).not.toContain('?session_id')
  })

  it('gclid rides on Stripe links only after Accept all, and only when well formed', async () => {
    const none = await run('index', real, '?gclid=Cj0KCQ_abc-1')
    expect(none.stripe.href).not.toContain('client_reference_id')
    none.buttons.analytics()
    expect(none.stripe.href).not.toContain('client_reference_id')
    none.buttons.all()
    expect(none.stripe.href).toContain('client_reference_id=Cj0KCQ_abc-1')
    none.buttons.none()
    expect(none.stripe.href).not.toContain('client_reference_id')
    const saved = await run('index', real, '?gclid=Cj0KCQ_abc-1', { gpdt_consent: 'all' })
    expect(saved.stripe.href).toContain('client_reference_id=Cj0KCQ_abc-1')
    const bad = await run('index', real, '?gclid=a%20b%26x', { gpdt_consent: 'all' })
    expect(bad.stripe.href).not.toContain('client_reference_id')
  })

  it('banner names the controller and links the site privacy page', () => {
    for (const f of PAGES) expect(read(f).match(/<div id="consent".*?<\/div>/s)![0]).toMatch(/Sylphx Limited, the controller.*privacy\.html/)
  })
})

describe('site live truth', () => {
  it('ships self-serve on: Pro button buys at checkout, thanks no longer says manual delivery', () => {
    const cfg = JSON.parse(read('config.json'))
    expect(cfg.selfServeCheckout).toBe(true)
    expect(read('index.html')).toMatch(/data-cta="pro" href="https:\/\/buy\.sylphx\.com\/buy\/gpdt">Buy Pro</)
    expect(read('index.html')).not.toContain('See Pro details')
    expect(read('thanks.html')).not.toMatch(/by hand|few hours/)
    expect(read('thanks.html')).toContain('buy.sylphx.com/recover?product=gpdt')
  })

  it('with the switch off the recover link stays hidden and unlinked', async () => {
    expect(read('index.html')).toMatch(/id="recover" hidden/)
    const r = await run('index', { selfServeCheckout: false, checkoutUrl: 'https://buy.sylphx.com/buy/gpdt', recoverUrl: 'https://buy.sylphx.com/recover?product=gpdt' })
    expect(r.calls).toHaveLength(0)
  })

  it('a real GA4 id with a placeholder Ads id loads GA4 only and sends no Ads conversion', async () => {
    const r = await run('index', { ga4MeasurementId: 'G-ABC123', adsConversionId: 'AW-XXXX', addToChromeSendTo: 'AW-XXXX/LABEL' })
    expect(r.appended).toHaveLength(1)
    expect(r.appended[0].src).toContain('id=G-ABC123')
    expect(r.calls.filter((c) => c[0] === 'config').map((c) => c[1])).toEqual(['G-ABC123'])
    r.click()
    expect(r.snapshot().some((c) => c[0] === 'event' && c[1] === 'conversion')).toBe(false)
  })

  it('docs and README do not claim a Firefox or Edge store listing', () => {
    const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8')
    expect(readme).toMatch(/no Firefox Add-ons \(AMO\) listing/)
    expect(readme).not.toMatch(/addons\.mozilla\.org\/[^\s)]*firefox\/addon/)
  })
})
