import { mkdtempSync, readFileSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
// @ts-expect-error plain ESM build script without types
import { ORIGIN, build, loadLocales } from '../scripts/site-build.mjs'

const root = new URL('..', import.meta.url).pathname
const shipped = readdirSync(join(root, '_locales')).filter((d) => d !== 'en')
const slugOf = (code: string) => code.toLowerCase().replace('_', '-')
let out = ''
const page = (slug: string) => readFileSync(join(out, slug, 'index.html'), 'utf8')

describe('site localisation', () => {
  beforeAll(() => {
    out = mkdtempSync(join(tmpdir(), 'gpdt-site-'))
    build({ outDir: out })
  })

  it('builds a page for every locale the extension ships', () => {
    expect(loadLocales().map((l: { file: string }) => l.file.replace('.json', '')).sort()).toEqual(shipped.map(slugOf).sort())
    for (const code of shipped) expect(readFileSync(join(out, slugOf(code), 'index.html'), 'utf8')).toContain('<main')
  })

  it('every page links every language and x-default, and canonicals itself', () => {
    const slugs = ['en', ...shipped.map(slugOf)]
    for (const slug of slugs) {
      const html = slug === 'en' ? readFileSync(join(out, 'index.html'), 'utf8') : page(slug)
      expect((html.match(/<link rel="alternate" hreflang=/g) ?? []).length).toBe(slugs.length + 1)
      expect(html).toContain('hreflang="x-default"')
      expect(html).toContain(`<link rel="canonical" href="${slug === 'en' ? ORIGIN : `${ORIGIN}${slug}/`}">`)
      expect(html).toContain('class="lang"')
    }
  })

  it('keeps the claims that must match the English page', () => {
    const en = readFileSync(join(root, 'site/index.html'), 'utf8')
    for (const slug of shipped.map(slugOf)) {
      const html = page(slug)
      for (const n of ['500', '20', '98', '10']) expect(html, `${slug} keeps ${n}`).toContain(n)
      expect(html, `${slug} price`).toMatch(/9[.,]99/)
      for (const fixed of ['16438428', '128 City Road', 'EC1V 2NX', '+44 333 335 7935', 'hi@sylphx.com', 'data-consent="all"', 'data-consent="analytics"', 'data-consent="none"', 'id="recover"', 'data-cta="pro"']) expect(html, `${slug} keeps ${fixed}`).toContain(fixed)
      // Every link target of the English page survives (translation changes text, never destinations).
      const hrefs = (h: string) => [...h.matchAll(/href="(https?:[^"]+|mailto:[^"]+|tel:[^"]+)"/g)].map((m) => m[1]).sort()
      expect(hrefs(html).filter((h) => !h.startsWith(ORIGIN))).toEqual(hrefs(en).filter((h) => !h.startsWith(ORIGIN)))
    }
  })

  it('points assets and legal pages at the root, and the sitemap lists every language with alternates', () => {
    const html = page('de')
    for (const a of ['href="../style.css"', 'src="../tracking.js"', 'src="../stats.js"', 'href="../privacy.html"', 'href="../terms.html"', 'src="../img/find-duplicates-480.webp"']) expect(html).toContain(a)
    expect(html).not.toMatch(/(href|src)="(style\.css|tracking\.js|img\/)/)
    const sm = readFileSync(join(out, 'sitemap.xml'), 'utf8')
    for (const code of shipped) expect(sm).toContain(`<loc>${ORIGIN}${slugOf(code)}/</loc>`)
    expect(sm).toContain(`<loc>${ORIGIN}privacy.html</loc>`)
    expect(sm).toContain('hreflang="x-default"')
  })

  it('fails the build when the English page and a locale drift apart', () => {
    expect(() => build({ outDir: out, l10nDir: join(root, 'tests/fixtures/site-l10n-drift') })).toThrow(/no longer on the English page/)
  })
})
