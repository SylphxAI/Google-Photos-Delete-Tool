import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
// @ts-expect-error plain ESM build script without types
import { build, loadLocales } from '../scripts/site-build.mjs'

const root = new URL('..', import.meta.url).pathname
const read = (file: string) => readFileSync(join(root, file), 'utf8')
const policy = 'https://support.google.com/photos/answer/'
const answers = ['6128858', '9343482']
// No fixed recovery-window claims in rendered copy, metadata or JSON-LD,
// including the languages whose day unit has no separating space.
const fixedWindow = /(?:\b(?:30|60|sixty)[\s-]*(?:days?|Tage?|días?|jours?|giorni|dagen|dias)|(?:30|60)\s*[天日])/iu
const card = 'Restore only while items remain in Trash, within Google Photos’ current retention policy. Empty Trash is optional, asks first and cannot be undone.'
const faq = 'Only if the items are still in Trash and Google Photos’ current policy allows it. Open Google Photos Trash, select the items and choose Restore. Empty Trash and any permanent deletion cannot be undone. A full Trash may prompt permanent deletion instead. Check Google’s guidance before deleting.'
const guidance = ['Google Photos desktop delete guidance (checked 2026-10-29)', 'Google Photos desktop restore guidance (checked 2026-10-29)']

type Locale = { file: string; strings: Record<string, string> }
let out = ''

beforeAll(() => {
  out = mkdtempSync(join(tmpdir(), 'gpdt-recovery-'))
  build({ outDir: out })
})
afterAll(() => rmSync(out, { recursive: true, force: true }))

describe('public photo recovery copy', () => {
  it('renders conditional recovery, irreversible deletion and dated official desktop links in all ten languages', () => {
    const locales = loadLocales() as Locale[]
    expect(locales).toHaveLength(9)
    for (const loc of [{ file: 'en.json', strings: {} }, ...locales]) {
      const slug = loc.file.replace('.json', '')
      const html = readFileSync(join(out, slug === 'en' ? '' : slug, 'index.html'), 'utf8')
      for (const text of [card, faq, ...guidance]) {
        const translated = loc.strings[text] ?? text
        expect(html, `${slug}: ${text}`).toContain(`>${translated}<`)
        if (slug !== 'en') expect(loc.strings[text]).toBeTruthy()
      }
      for (const answer of answers) {
        expect(html).toContain(`href="${policy}${answer}?hl=en&amp;co=GENIE.Platform%3DDesktop"`)
      }
      expect(html, slug).not.toMatch(fixedWindow)
      expect(html).toContain('jiahfbbfpacpolomdjlpdpiljllcdenb')
      const data = JSON.parse(html.match(/<script type="application\/ld\+json">\s*([\s\S]*?)<\/script>/)![1])
      expect(data.offers.map((o: { price: string; priceCurrency: string }) => [o.price, o.priceCurrency])).toEqual([['0', 'USD'], ['9.99', 'USD']])
    }
  })

  it('keeps terms, README and all support templates consistent with the linked policy', () => {
    for (const file of ['site/terms.html', 'README.md', 'docs/REVIEWS.md']) {
      const copy = read(file)
      expect(copy, file).not.toMatch(fixedWindow)
      expect(copy, file).toContain('current')
      expect(copy, file).toContain('2026-10-29')
      for (const answer of answers) expect(copy, file).toContain(`${policy}${answer}?hl=en`)
    }
    expect(read('site/terms.html')).toContain('Empty Trash and any permanent deletion cannot be undone.')
    expect(read('README.md')).toContain('Empty Trash and any permanent deletion cannot be undone.')
    const replies = read('docs/REVIEWS.md').split('## B. Deleted the wrong photos')[1].split('## C.')[0]
    for (const code of ['en', 'de', 'es', 'fr', 'it', 'nl', 'pt_BR', 'zh_CN', 'zh_TW', 'ja']) {
      const reply = replies.split(`**${code}**`)[1].split('\n\n')[0]
      for (const answer of answers) expect(reply).toContain(`${policy}${answer}`)
    }
  })

  it.each(['60-day Trash', '60 Tage', '60 días', '60 jours', '60 giorni', '60 dagen', '60 dias', '60天', '60日間', 'sixty days', '30 days'])('detects a regressed fixed window: %s', (copy) => {
    expect(copy).toMatch(fixedWindow)
  })
})
