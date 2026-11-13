import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'

const read = (f: string) => readFileSync(new URL(`../site/${f}`, import.meta.url), 'utf8')
const tracking = read('tracking.js')

type Call = unknown[]

async function run(page: 'index' | 'thanks' | 'privacy' | 'terms', config: object, search = '', initial: Record<string, string> = {}, storageFails = false) {
  let reloads = 0
  let writesFail = storageFails
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
    location: { search, origin: 'https://x.test', hostname: 'x.test', pathname: `/${page}.html`, reload: () => { reloads++ } },
    addEventListener: (name: string, fn: () => void) => { listeners[name] = fn },
    localStorage: { getItem: (k: string) => storage.get(k) ?? null, setItem: (k: string, v: string) => { if (writesFail) throw new Error('Storage unavailable'); storage.set(k, v) }, removeItem: (k: string) => { storage.delete(k) } },
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
  return { ctx, failWrites: () => { writesFail = true }, restore: (value: string) => { storage.set('gpdt_consent', value); listeners.pageshow() }, repeat: () => runInNewContext(tracking, ctx), reloads: () => reloads, externalChoice: (value: string) => { storage.set('gpdt_consent', value); (listeners.storage as (event: unknown) => void)({ key: 'gpdt_consent' }) }, calls: snapshot(), snapshot, appended, link, link2, stripe, click: listeners.click, click2: listeners.click2, buttons, banner, storage, pressed, reopen: listeners.settings }
}

const real = { ga4MeasurementId: 'G-ABC123', adsConversionId: 'AW-123456', addToChromeSendTo: 'AW-123456/aaa' }
const PAGES = ['index.html', 'thanks.html', 'bye.html', 'privacy.html', 'terms.html']
const accepted = { gpdt_consent: 'analytics' }
const events = (r: Awaited<ReturnType<typeof run>>) => r.snapshot().filter(c => c[0] === 'event')

describe('global opt-in analytics', () => {
  it.each<Record<string, string>>([{}, { gpdt_consent: 'none' }, { gpdt_consent: 'denied' }, { gpdt_consent: 'granted' }, { gpdt_consent: 'unexpected' }])('never loads or queues tags before affirmative consent: %j', async initial => {
    const r = await run('index', real, '?gclid=secret&session_id=cs_secret', initial)
    r.click(); r.click2()
    expect(r.appended).toHaveLength(0)
    expect(r.snapshot()).toHaveLength(0)
    expect(r.ctx.gtag).toBeUndefined()
  })

  it('Accept initializes once with global denied defaults before consent and config', async () => {
    const r = await run('index', real)
    expect(r.banner.hidden).toBe(false)
    r.buttons.all()
    expect(r.appended).toHaveLength(1)
    const calls = r.snapshot()
    expect(calls[0]).toEqual(['consent', 'default', { ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied', analytics_storage: 'denied' }])
    expect(calls[1]).toEqual(['consent', 'update', { ad_storage: 'granted', ad_user_data: 'granted', ad_personalization: 'granted', analytics_storage: 'granted' }])
    expect(calls.filter(c => c[0] === 'config').map(c => c[1])).toEqual(['G-ABC123', 'AW-123456'])
    r.buttons.all(); r.repeat()
    await new Promise(resolve => setTimeout(resolve, 10))
    expect(r.appended).toHaveLength(1)
    r.click()
    expect(events(r).filter(c => c[1] === 'add_to_chrome_click')).toHaveLength(1)
    expect(events(r).filter(c => c[1] === 'conversion')).toHaveLength(1)
  })

  it('Analytics only loads GA4, not Ads; saved explicit consent remains usable', async () => {
    const r = await run('index', real, '', accepted)
    expect(r.banner.hidden).toBe(true)
    expect(r.appended).toHaveLength(1)
    expect(r.snapshot().filter(c => c[0] === 'config').map(c => c[1])).toEqual(['G-ABC123'])
    r.click()
    expect(events(r).map(c => c[1])).toEqual(['add_to_chrome_click'])
    expect(r.snapshot().find(c => c[0] === 'consent' && c[1] === 'update')?.[2]).toMatchObject({ analytics_storage: 'granted', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' })
  })

  it('withdrawal disables collection before reloading; rejection survives reload', async () => {
    const r = await run('index', real)
    r.buttons.all(); r.reopen(); r.buttons.none()
    expect(r.storage.get('gpdt_consent')).toBe('none')
    expect(r.ctx['ga-disable-G-ABC123']).toBe(true)
    expect(r.ctx['ga-disable-AW-123456']).toBe(true)
    expect(r.reloads()).toBe(1)
    r.click(); r.click2()
    expect(r.snapshot()).toHaveLength(0)
    const reloaded = await run('index', real, '', Object.fromEntries(r.storage))
    expect(reloaded.appended).toHaveLength(0)
    expect(reloaded.banner.hidden).toBe(true)
    reloaded.reopen(); expect(reloaded.banner.hidden).toBe(false)
    reloaded.buttons.analytics(); expect(reloaded.appended).toHaveLength(1)
  })

  it('fails closed when storage cannot persist consent, even with an old grant', async () => {
    for (const initial of [{}, accepted, { gpdt_consent: 'all' }] as Record<string, string>[]) {
      const r = await run('index', real, '', initial, true)
      r.buttons.all(); r.click()
      expect(r.appended).toHaveLength(0)
      expect(r.snapshot()).toHaveLength(0)
    }
  })

  it('withdrawal fails closed if storage stops accepting writes after consent', async () => {
    const r = await run('index', real, '', accepted)
    expect(r.appended).toHaveLength(1)
    r.failWrites(); r.buttons.none(); r.click()
    expect(r.ctx['ga-disable-G-ABC123']).toBe(true)
    expect(r.reloads()).toBe(1)
    expect(r.snapshot()).toEqual([])
    const reloaded = await run('index', real, '', Object.fromEntries(r.storage))
    expect(reloaded.appended).toHaveLength(0)
  })

  it('rechecks consent when a page is restored from the back-forward cache', async () => {
    const r = await run('index', real, '', accepted)
    r.restore('none'); r.click()
    expect(r.ctx['ga-disable-G-ABC123']).toBe(true)
    expect(r.reloads()).toBe(1)
    expect(r.snapshot()).toEqual([])
  })

  it('clears queued initialization if withdrawal precedes Google script execution', async () => {
    const r = await run('index', real)
    r.buttons.all()
    expect(r.appended).toHaveLength(1)
    r.buttons.none()
    expect(r.snapshot()).toEqual([])
    expect(r.ctx['ga-disable-G-ABC123']).toBe(true)
    expect(r.reloads()).toBe(1)
  })

  it('a downgrade or cross-tab revocation unloads the active tag', async () => {
    const r = await run('index', real, '', { gpdt_consent: 'all' })
    r.buttons.analytics()
    expect(r.reloads()).toBe(1)
    r.click(); expect(events(r)).toHaveLength(0)
    const tab = await run('index', real, '', accepted)
    tab.externalChoice('none')
    expect(tab.reloads()).toBe(1)
    tab.click(); expect(events(tab)).toHaveLength(0)
  })

  it.each(['index', 'thanks', 'privacy', 'terms'] as const)('sanitizes every measured %s URL and never infers a purchase', async page => {
    const r = await run(page, real, '?session_id=cs_live_abcdefgh12&email=secret&token=secret&gclid=secret#private', accepted)
    r.click()
    expect(JSON.stringify(r.snapshot())).not.toMatch(/secret|session_id|purchase/)
    expect(r.snapshot().find(c => c[0] === 'config')?.[2]).toMatchObject({ page_location: `https://x.test/${page}.html`, page_referrer: '' })
    expect([...r.storage.keys()]).toEqual(['gpdt_consent'])
    expect(r.stripe.href).not.toContain('client_reference_id')
  })

  it('with missing or placeholder destinations, no tag loads even after consent', async () => {
    for (const cfg of [{}, { ga4MeasurementId: 'G-XXXX', adsConversionId: 'AW-XXXX' }]) {
      const r = await run('index', cfg)
      r.reopen(); r.buttons.all(); r.click()
      expect(r.appended).toHaveLength(0)
      expect(r.snapshot()).toHaveLength(0)
    }
  })

  it('a placeholder Ads destination cannot produce a conversion', async () => {
    const r = await run('index', { ...real, adsConversionId: 'AW-XXXX', addToChromeSendTo: 'AW-XXXX/LABEL' }, '', { gpdt_consent: 'all' })
    r.click()
    expect(events(r).map(c => c[1])).toEqual(['add_to_chrome_click'])
  })

  it('all Chrome CTAs keep navigation and UTM independently of consent', async () => {
    const r = await run('index', real, '?utm_source=google&gclid=private')
    expect(r.link.href).toContain('utm_source=google')
    expect(r.link2.href).toContain('utm_source=google')
    expect(r.link.href).not.toContain('gclid')
    r.click2(); expect(events(r)).toHaveLength(0)
    r.buttons.analytics(); r.click2()
    expect(events(r).map(c => c[1])).toEqual(['add_to_chrome_click'])
  })
})

describe('website configuration and copy', () => {
  it('ships the real GA4 ID with no fabricated Ads configuration', () => {
    const cfg = JSON.parse(read('config.json'))
    expect(cfg.ga4MeasurementId).toBe('G-BQ1GKMWND2')
    for (const key of ['adsConversionId', 'addToChromeSendTo', 'purchaseSendTo']) expect(cfg[key]).toBe('')
    expect(cfg.selfServeCheckout).toBe(true)
    expect(cfg.checkoutUrl).toBe('https://sylphxai.github.io/Google-Photos-Delete-Tool/pricing')
    expect(cfg.recoverUrl).toBe('https://sylphxai.github.io/Google-Photos-Delete-Tool/recover')
  })

  it('all standalone pages include consent settings and legal details', () => {
    for (const file of PAGES) {
      const html = read(file)
      for (const value of ['tracking.js', 'id="cookie-settings"', 'id="consent"', '16438428', '128 City Road', 'EC1V 2NX', '+44 7537 188 188', 'hi@sylphx.com', 'privacy.html', 'terms.html']) expect(html).toContain(value)
      for (const choice of ['all', 'analytics', 'none']) expect(html).toContain(`data-consent="${choice}"`)
      expect(html).not.toContain('googletagmanager')
    }
    expect(read('privacy.html')).toContain('default everywhere')
    expect(read('privacy.html')).not.toContain('this is the default until you choose')
  })

  it('keeps checkout and recovery links and existing offer totals', () => {
    expect(read('index.html')).toContain('Buy Pro')
    expect(read('index.html')).toContain('US$19')
    expect(read('thanks.html')).toContain('https://sylphxai.github.io/Google-Photos-Delete-Tool/recover')
    expect(read('thanks.html')).not.toMatch(/by hand|few hours/)
    const pricing = readFileSync(new URL('../docs/storefront/pricing.md', import.meta.url), 'utf8')
    expect(pricing).toContain('money_checkout: pro')
    const catalogue = JSON.parse(readFileSync(new URL('../config/money-catalogue.json', import.meta.url), 'utf8'))
    const offers = readFileSync(new URL('../docs/storefront/docs.toml', import.meta.url), 'utf8')
    const prices = catalogue.spec.products.find((p: { key: string }) => p.key === 'gpdt_pro').prices
    for (const [seat, label] of [[1, 'Personal'], [3, 'Family'], [10, 'Team']] as const) {
      const key = `gpdt_pro_${seat}`
      const unit = prices.find((p: { key: string }) => p.key === key).unit_amounts.USD
      const total = Number(unit) * seat / 100
      expect(offers).toContain(`key = "${key}"\nlabel = "${label} (${seat} ${seat === 1 ? 'seat' : 'seats'})"\nquantity = ${seat}`)
      expect(read('index.html')).toContain(`${label} US$${total}`)
    }
  })
})
