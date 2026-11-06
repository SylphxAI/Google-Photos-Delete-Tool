// Builds the deployable landing site into an output directory (default `_site`).
//
// One source of truth: `site/index.html` is the English page. Each file in
// `site-l10n/<slug>.json` maps an exact fragment of that English page (an
// element's inner HTML, or an attribute / JSON string value) to its translation.
// The build renders `<outDir>/<slug>/index.html` for every locale, copies the
// rest of `site/` unchanged, adds hreflang alternates and a language picker to
// every localised page and to the English page, and writes the sitemap.
//
// It fails when an English fragment a locale translates no longer exists (the
// English page changed), when English text on the page is not covered by any
// key, when a locale misses a key another locale has, or when a translation
// changes the markup (tags, quotes). Privacy and Terms stay English.
//
// Usage: node scripts/site-build.mjs [outDir]
import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
export const ORIGIN = 'https://sylphxai.github.io/Google-Photos-Delete-Tool/'

// English text nodes and attribute values that are names, numbers or contacts,
// not wording; they need no key.
const KEEP = new Set([
  'Google Photos Delete Tool', 'by Sylphx', 'Sylphx', 'MIT', 'GitHub', '4.7', '10,000+', 'hi@sylphx.com',
  '+44 7537 188 188', '1', '2', '3', '★★★★★', 'Chrome', 'Google Photos',
])

export function loadLocales(l10nDir = join(ROOT, 'site-l10n')) {
  return readdirSync(l10nDir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => ({ file: f, ...JSON.parse(readFileSync(join(l10nDir, f), 'utf8')) }))
}

const tagsOf = (s) => s.match(/<[^>]+>/g) ?? []

/** Text nodes and attribute values of the English page, outside script/style/comments. */
export function englishUnits(html) {
  const body = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<!--[\s\S]*?-->/g, '')
  const units = []
  for (const m of body.matchAll(/>([^<>]+)</g)) units.push(m[1])
  for (const m of body.matchAll(/\s(?:alt|aria-label|title)="([^"]+)"/g)) units.push(m[1])
  for (const m of body.matchAll(/<meta (?:name|property)="(?:description|og:title|og:description|og:image:alt|twitter:title|twitter:description)" content="([^"]+)"/g)) units.push(m[1])
  return units.map((u) => u.trim()).filter((u) => /\p{L}/u.test(u))
}

function translate(html, loc, errors) {
  let out = html
  // Longest first, so a fragment inside a longer one is not rewritten before the longer one matches.
  for (const [k, v] of Object.entries(loc.strings).sort((a, b) => b[0].length - a[0].length)) {
    if (tagsOf(k).join('') !== tagsOf(v).join('')) errors.push(`${loc.slug}: markup differs for "${k.slice(0, 50)}"`)
    let hits = 0
    for (const [a, b] of [['>', '<'], ['"', '"']]) {
      const from = a + k + b
      const n = out.split(from).length - 1
      if (n === 0) continue
      if (a === '"' && v.includes('"')) errors.push(`${loc.slug}: translation of "${k.slice(0, 50)}" has a double quote used in a quoted value`)
      hits += n
      out = out.split(from).join(a + v + b)
    }
    if (hits === 0) errors.push(`${loc.slug}: source text no longer on the English page: "${k.slice(0, 70)}"`)
  }
  return out
}

function localise(html, slug, locales, alt) {
  // English lives at the site root; localised pages one level down.
  const up = slug === 'en' ? '' : '../'
  let out = html
  if (up) {
    out = out
      .replace(/(href|src|srcset|imagesrcset)="(img\/)/g, `$1="${up}$2`)
      .replace(/(\s|,)(img\/[\w.-]+ \d+w)/g, `$1${up}$2`)
      .replace(/(href|src)="(style\.css|stats\.js|tracking\.js|privacy\.html|terms\.html)"/g, `$1="${up}$2"`)
  }
  const self = slug === 'en' ? ORIGIN : `${ORIGIN}${slug}/`
  out = out.split(`${ORIGIN}"`).join(`${self}"`)
  const l = locales.find((x) => x.slug === slug)
  if (l) out = out.replace('<html lang="en">', `<html lang="${l.htmlLang}">`).replace('<meta property="og:type"', `<meta property="og:locale" content="${l.ogLocale}">\n<meta property="og:type"`)
  const links = [...alt.map((a) => `<link rel="alternate" hreflang="${a.hreflang}" href="${a.slug === 'en' ? ORIGIN : ORIGIN + a.slug + '/'}">`), `<link rel="alternate" hreflang="x-default" href="${ORIGIN}">`].join('\n')
  out = out.replace(/(<link rel="canonical"[^>]*>)/, `$1\n${links}`)
  const here = alt.find((a) => a.slug === slug)
  const items = alt.map((a) => `<li><a href="${a.slug === 'en' ? up || './' : (up ? '../' : '') + a.slug + '/'}" hreflang="${a.hreflang}" lang="${a.htmlLang}"${a.slug === slug ? ' aria-current="true"' : ''}>${a.name}</a></li>`).join('')
  const picker = `<details class="lang"><summary aria-label="${here.pickerLabel}">${here.code}</summary><ul>${items}</ul></details>`
  return out.replace('</nav>\n    <a class="btn btn-sm"', `</nav>\n    ${picker}\n    <a class="btn btn-sm"`)
}

export function build({ outDir = join(ROOT, '_site'), siteDir = join(ROOT, 'site'), l10nDir = join(ROOT, 'site-l10n') } = {}) {
  const errors = []
  const locales = loadLocales(l10nDir)
  const source = readFileSync(join(siteDir, 'index.html'), 'utf8')
  const keys = new Set(locales.flatMap((l) => Object.keys(l.strings)))
  for (const l of locales) {
    l.slug = l.file.replace(/\.json$/, '')
    for (const k of keys) if (!(k in l.strings)) errors.push(`${l.slug}: missing translation for "${k.slice(0, 70)}"`)
    for (const k of Object.keys(l.strings)) if (!l.strings[k].trim()) errors.push(`${l.slug}: empty translation for "${k.slice(0, 70)}"`)
  }
  const allKeys = [...keys].join('\n')
  for (const u of new Set(englishUnits(source))) if (!KEEP.has(u) && !allKeys.includes(u)) errors.push(`English text with no translation key: "${u.slice(0, 80)}"`)

  const alt = [{ slug: 'en', hreflang: 'en', htmlLang: 'en', name: 'English', code: 'EN', pickerLabel: 'Language' }, ...locales.map((l) => ({ slug: l.slug, hreflang: l.hreflang, htmlLang: l.htmlLang, name: l.name, code: l.code, pickerLabel: l.pickerLabel }))]
  const pages = { en: localise(source, 'en', locales, alt) }
  for (const l of locales) pages[l.slug] = localise(translate(source, l, errors), l.slug, locales, alt)
  if (errors.length) throw new Error(`site build failed:\n${errors.map((e) => `  - ${e}`).join('\n')}`)

  rmSync(outDir, { recursive: true, force: true })
  cpSync(siteDir, outDir, { recursive: true })
  const { version } = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim()
  writeFileSync(join(outDir, 'build-info.json'), JSON.stringify({ version, commit }, null, 2) + '\n')
  writeFileSync(join(outDir, 'index.html'), pages.en)
  for (const l of locales) {
    mkdirSync(join(outDir, l.slug), { recursive: true })
    writeFileSync(join(outDir, l.slug, 'index.html'), pages[l.slug])
  }
  writeFileSync(join(outDir, 'sitemap.xml'), sitemap(siteDir, alt))
  return { outDir, slugs: locales.map((l) => l.slug) }
}

function sitemap(siteDir, alt) {
  const old = readFileSync(join(siteDir, 'sitemap.xml'), 'utf8')
  const lastmod = (old.match(/<lastmod>([^<]+)<\/lastmod>/) ?? [])[1]
  const lm = lastmod ? `<lastmod>${lastmod}</lastmod>` : ''
  const loc = (a) => (a.slug === 'en' ? ORIGIN : `${ORIGIN}${a.slug}/`)
  const xl = alt.map((a) => `<xhtml:link rel="alternate" hreflang="${a.hreflang}" href="${loc(a)}"/>`).join('') + `<xhtml:link rel="alternate" hreflang="x-default" href="${ORIGIN}"/>`
  const home = alt.map((a) => `<url><loc>${loc(a)}</loc>${lm}${xl}</url>`)
  const rest = [...old.matchAll(/<url>[\s\S]*?<\/url>/g)].map((m) => m[0]).filter((u) => !u.includes(`<loc>${ORIGIN}</loc>`))
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${[...home, ...rest].join('\n')}\n</urlset>\n`
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const r = build(process.argv[2] ? { outDir: resolve(process.argv[2]) } : {})
  console.log(`site built into ${r.outDir}: en + ${r.slugs.join(', ')}`)
}
