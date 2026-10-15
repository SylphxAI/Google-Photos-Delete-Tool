// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import { PRO_COPY, PRO_URL, SELF_SERVE_CHECKOUT, SELF_SERVE_CHECKOUT_URL, buildDryRunTeaser, countLabelTypes, dateReportLine, getProVariant, proUrl } from '../src/core/pro-moments'
import { renderProTeaser } from '../src/ui/pro-teaser/teaser'
import { showPostRunPrompt } from '../src/ui/post-run/prompt'
import { claimPostRunPrompt } from '../src/core/post-run-prompt'

const labels = [
  'Screenshot - 10 Mar 2012, 10:19:24',
  'Screenshot - 11 Mar 2012, 10:19:24',
  'Video - 1 Jan 2020, 09:00:00',
  'Photo - 2 Jan 2020, 09:00:00',
]
const counts = countLabelTypes(labels)

describe('dry-run teaser', () => {
  it('shows per-type counts and the CTA for free users', () => {
    const t = buildDryRunTeaser(counts, labels.length, false)
    expect(t).not.toBeNull()
    expect(t!.countsLine).toBe('This view has 1 photo, 1 video, 2 screenshots.')
    expect(t!.ctaLine).toBe('Delete only the types you choose with Pro — US$9.99 once')
    const u = new URL(t!.url)
    expect(u.origin + u.pathname).toBe('https://buy.sylphx.com/buy/gpdt')
    expect(u.searchParams.get('utm_source')).toBe('extension')
    expect(u.searchParams.get('utm_medium')).toBe('dryrun_teaser')
    expect(u.searchParams.get('utm_campaign')).toBe('pro')
    expect(u.searchParams.get('utm_content')).toBe('a')
  })
  it('never shows for Pro users or an empty scan', () => {
    expect(buildDryRunTeaser(counts, labels.length, true)).toBeNull()
    expect(buildDryRunTeaser(countLabelTypes([]), 0, false)).toBeNull()
  })
  it('falls back to a total when no label is classifiable', () => {
    const c = countLabelTypes(['???'])
    expect(buildDryRunTeaser(c, 1, false)!.countsLine).toBe('This view has 1 items.')
  })
  it('renders a dismissable link and nothing for null', () => {
    const host = document.createElement('div')
    renderProTeaser(host, buildDryRunTeaser(counts, labels.length, false))
    const a = host.querySelector('a')!
    expect(a.getAttribute('href')).toBe(proUrl('dryrun_teaser'))
    host.querySelector('button')!.click()
    expect(host.children.length).toBe(0)
    renderProTeaser(host, null)
    expect(host.style.display).toBe('none')
  })
})

describe('post-run card button', () => {
  const result = { dryRun: false, stopped: false, status: 'done' as const, deleted: 5, filterKind: 'all' as const }
  const mem = () => ({ isShown: async () => false, markShown: async () => {} })
  const buttons = (): string[] =>
    [...document.querySelectorAll('#gpdt-post-run-prompt button')].map(b => b.textContent ?? '')

  it('shows Get Pro for free users and not for Pro users', async () => {
    document.body.replaceChildren()
    showPostRunPrompt((await claimPostRunPrompt(result, mem(), 'chrome', false))!)
    expect(buttons()).toContain('Get Pro')
    document.body.replaceChildren()
    showPostRunPrompt((await claimPostRunPrompt(result, mem(), 'chrome', true))!)
    expect(buttons()).not.toContain('Get Pro')
    expect(buttons()).toContain('Dismiss')
  })
})

describe('teaser dismissal', () => {
  it('stays dismissed for the same result and shows again for a new one', () => {
    const host = document.createElement('div')
    const teaser = buildDryRunTeaser(counts, labels.length, false)!
    renderProTeaser(host, teaser)
    expect(host.style.display).toBe('block')
    ;(host.querySelector('button') as HTMLButtonElement).click()
    expect(host.style.display).toBe('none')
    renderProTeaser(host, teaser)
    expect(host.style.display).toBe('none')
    const other = buildDryRunTeaser(countLabelTypes([...labels, 'Video - 2 Jan 2020, 09:00:00']), labels.length + 1, false)!
    renderProTeaser(host, other)
    expect(host.style.display).toBe('block')
  })
})

describe('date filter report line and link', () => {
  it('names the skipped-unreadable count exactly', () => {
    expect(dateReportLine({ matched: 3, skippedUnreadable: 2, total: 9 }))
      .toBe('3 of 9 items match the date filter. 2 items skipped: date not readable.')
    expect(dateReportLine({ matched: 3, skippedUnreadable: 0, total: 9 })).toBe('3 of 9 items match the date filter.')
  })
  it('the Get Pro link carries utm_medium=date_filter and the checkout URL', () => {
    const u = new URL(proUrl('date_filter'))
    expect(u.searchParams.get('utm_medium')).toBe('date_filter')
    expect(u.origin + u.pathname).toBe('https://buy.sylphx.com/buy/gpdt')
  })
})

describe('presets Pro link', () => {
  it('carries utm_medium=presets', () => {
    expect(new URL(proUrl('presets')).searchParams.get('utm_medium')).toBe('presets')
  })
})

describe('copy A/B variant', () => {
  const memStore = (initial?: unknown) => {
    let v: unknown = initial
    return { get: async () => v, set: async (x: 'a' | 'b') => { v = x }, peek: () => v }
  }

  it('picks once at random, stores it and stays stable', async () => {
    const s = memStore()
    expect(await getProVariant(s, () => 0.9)).toBe('b')
    expect(s.peek()).toBe('b')
    expect(await getProVariant(s, () => 0.1)).toBe('b')
    const s2 = memStore()
    expect(await getProVariant(s2, () => 0.1)).toBe('a')
  })
  it('ignores an invalid stored value', async () => {
    expect(await getProVariant(memStore('zzz'), () => 0.9)).toBe('b')
  })
  it('falls back to a on a read or write error', async () => {
    const bad = (): Promise<never> => Promise.reject(new Error('storage down'))
    expect(await getProVariant({ get: bad, set: bad }, () => 0.9)).toBe('a')
    expect(await getProVariant({ get: async () => null, set: bad }, () => 0.9)).toBe('a')
  })
  it('renders both teaser copies and link labels', () => {
    for (const v of ['a', 'b'] as const) {
      const host = document.createElement('div')
      renderProTeaser(host, buildDryRunTeaser(counts, labels.length, false, v))
      expect(host.textContent).toContain(PRO_COPY[v].ctaLine)
      expect(host.querySelector('a')!.textContent).toBe(PRO_COPY[v].linkLabel)
    }
    expect(PRO_COPY.a.ctaLine).toBe('Delete only the types you choose with Pro — US$9.99 once')
    expect(PRO_COPY.b.linkLabel).toBe('Unlock Pro')
  })
  it('renders both post-run button labels', async () => {
    const result = { dryRun: false, stopped: false, status: 'done' as const, deleted: 5, filterKind: 'all' as const }
    const mem = { isShown: async () => false, markShown: async () => {} }
    for (const v of ['a', 'b'] as const) {
      document.body.replaceChildren()
      showPostRunPrompt((await claimPostRunPrompt(result, mem, 'chrome', false, v))!)
      const labelsNow = [...document.querySelectorAll('#gpdt-post-run-prompt button')].map(b => b.textContent)
      expect(labelsNow).toContain(PRO_COPY[v].linkLabel)
    }
  })
  it('puts utm_content on every Pro link, from the one checkout URL', async () => {
    const result = { dryRun: false, stopped: false, status: 'done' as const, deleted: 5, filterKind: 'all' as const }
    for (const v of ['a', 'b'] as const) {
      const urls = [
        buildDryRunTeaser(counts, labels.length, false, v)!.url,
        (await claimPostRunPrompt(result, { isShown: async () => false, markShown: async () => {} }, 'chrome', false, v))!.proUrl!,
        proUrl('date_filter', v),
        proUrl('license_box', v),
      ]
      for (const url of urls) {
        const u = new URL(url)
        expect(u.searchParams.get('utm_content')).toBe(v)
        expect(u.searchParams.get('utm_source')).toBe('extension')
        expect(u.searchParams.get('utm_campaign')).toBe('pro')
        expect(url.startsWith(SELF_SERVE_CHECKOUT_URL)).toBe(true)
      }
    }
  })
  it('ships with self-serve checkout on and routes every link to it; off keeps the README path', () => {
    expect(SELF_SERVE_CHECKOUT).toBe(true)
    expect(proUrl('license_box', 'a', false).startsWith(PRO_URL.split('#')[0]!)).toBe(true)
    const on = new URL(proUrl('license_box', 'b'))
    expect(on.origin + on.pathname).toBe(SELF_SERVE_CHECKOUT_URL)
    expect(on.searchParams.get('utm_content')).toBe('b')
  })
  it('keeps static popup links tagged with utm_content', async () => {
    const { readFileSync } = await import('node:fs')
    const html = readFileSync('src/extension/popup/popup.html', 'utf8')
    for (const id of ['date-pro', 'preset-pro', 'license-get']) {
      const tag = html.match(new RegExp(`<a[^>]*id="${id}"[^>]*>`))![0]
      expect(tag).toContain('utm_content=a')
    }
  })
})
