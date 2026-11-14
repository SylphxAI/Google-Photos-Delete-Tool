import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'

const tracking = readFileSync(new URL('../site/tracking.js', import.meta.url), 'utf8')
const config = { ga4MeasurementId: 'G-BQ1GKMWND2' }

/** The tracking script on a page with one AI-restore CTA and one credits CTA. */
async function page(initial: Record<string, string> = {}) {
  const storage = new Map(Object.entries(initial))
  const clicks: Record<string, () => void> = {}
  const cta = (name: string) => ({ href: '', addEventListener: (_: string, f: () => void) => { clicks[name] = f } })
  const buttons: Record<string, () => void> = {}
  const banner = {
    hidden: true,
    querySelector: (sel: string) => ({ setAttribute: () => undefined, addEventListener: (_: string, f: () => void) => { buttons[sel.match(/"(.+)"/)![1]] = f } }),
  }
  const ctx: Record<string, unknown> = {
    document: {
      currentScript: null,
      getElementById: (id: string) => (id === 'consent' ? banner : null),
      querySelectorAll: (sel: string) => (sel === '[data-cta="ai-restore"]' ? [cta('restore')] : sel === '[data-cta="credits"]' ? [cta('credits')] : []),
      createElement: () => ({}),
      head: { appendChild: () => undefined },
    },
    location: { search: '', origin: 'https://x.test', hostname: 'x.test', pathname: '/index.html', reload: () => undefined },
    addEventListener: () => undefined,
    localStorage: { getItem: (k: string) => storage.get(k) ?? null, setItem: (k: string, v: string) => { storage.set(k, v) }, removeItem: (k: string) => { storage.delete(k) } },
    fetch: () => Promise.resolve({ json: () => Promise.resolve(config) }),
    URL, URLSearchParams, Object, Date, encodeURIComponent,
  }
  ctx.window = ctx
  runInNewContext(tracking, ctx)
  await new Promise((r) => setTimeout(r, 10))
  const events = () => ((ctx.dataLayer as ArrayLike<unknown>[] | undefined) ?? [])
    .map((a) => Array.from(a))
    .filter((a) => a[0] === 'event')
    .map((a) => a[1])
  return { ctx, clicks, buttons, storage, events, track: (name: string) => (ctx.gpdtTrack as (n: string) => boolean)(name) }
}

describe('AI 4K Restore website events', () => {
  it('fire on the restore and credits CTAs only after an affirmative choice', async () => {
    for (const choice of ['all', 'analytics']) {
      const p = await page({ gpdt_consent: choice })
      p.clicks.restore(); p.clicks.credits()
      expect(p.track('ai_restore_complete')).toBe(true)
      expect(p.events()).toEqual(['ai_restore_start', 'ai_credit_checkout', 'ai_restore_complete'])
    }
  })

  it('never fire without consent, after a rejection, or for an unknown name', async () => {
    const initials: Record<string, string>[] = [{}, { gpdt_consent: 'none' }, { gpdt_consent: 'denied' }, { gpdt_consent: 'granted' }]
    for (const initial of initials) {
      const p = await page(initial)
      p.clicks.restore(); p.clicks.credits()
      expect(p.track('ai_restore_complete')).toBe(false)
      expect(p.events()).toEqual([])
      expect(p.ctx.dataLayer).toBeUndefined()
    }
    const p = await page({ gpdt_consent: 'all' })
    expect(p.track('purchase')).toBe(false)
    expect(p.events()).toEqual([])
  })

  it('stop as soon as the stored choice is withdrawn in another tab', async () => {
    const p = await page({ gpdt_consent: 'analytics' })
    p.storage.set('gpdt_consent', 'none')
    p.clicks.restore()
    expect(p.track('ai_restore_complete')).toBe(false)
    expect(p.events()).toEqual([])
  })

  it('carry no identifiers beyond the event name', async () => {
    const p = await page({ gpdt_consent: 'all' })
    p.clicks.restore()
    const sent = ((p.ctx.dataLayer as ArrayLike<unknown>[]).map((a) => Array.from(a))).find((a) => a[1] === 'ai_restore_start')!
    expect(sent[2]).toEqual({ send_to: 'G-BQ1GKMWND2', page_location: 'https://x.test/index.html', page_referrer: '', transport_type: 'beacon' })
  })
})
