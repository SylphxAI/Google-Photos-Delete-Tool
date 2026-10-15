/**
 * Storefront listing — single source of truth guard.
 *
 * Reads storefront/listing.json and enforces every store's character
 * limits (source-level evidence: a listing that violates a limit can
 * never reach a store workflow).
 *
 *   bun run listing:check          # validate (CI)
 */
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { DEFAULT_LOCALE, MESSAGE_LIMITS, localeCodes, readMessages } from './lib/locales'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const read = (p: string) => readFileSync(resolve(root, p), 'utf-8')

const pkg = JSON.parse(read('package.json'))
const listing = JSON.parse(read('storefront/listing.json'))

const log = (msg: string) => console.log(msg)

let failures = 0
function check(ok: boolean, what: string): void {
  if (ok) {
    log(`  ✓ ${what}`)
  } else {
    failures++
    console.error(`  ✗ ${what}`)
  }
}

// ─── Applicability: listing must track the current release ───────
check(
  listing.appliesTo === pkg.version,
  `listing.appliesTo (${listing.appliesTo}) == package version (${pkg.version})`,
)

// ─── Character limits (live store policies) ──────────────────────
const LIMITS = {
  'cws.title': [listing.cws.title, 75],
  'cws.summary': [listing.cws.summary, 132],
  'cws.description': [listing.cws.description.join('\n\n'), 16000],
  'edge.name': [listing.edge.name, 45],
  'edge.shortDescription': [listing.edge.shortDescription, 132],
  'edge.description': [listing.edge.description.join('\n\n'), 10000],
  'amo.name': [listing.amo.name, 50],
  'amo.summary': [listing.amo.summary, 250],
  'amo.description': [listing.amo.description.join('\n\n'), 10000],
} as const

for (const [field, [text, max]] of Object.entries(LIMITS)) {
  check(typeof text === 'string' && text.length > 0 && text.length <= max, `${field}: ${text.length} chars (max ${max})`)
}

// ─── Per-language dashboard listing (cws.localized) ──────────────
// One entry per shipped _locales code; title and summary are the same text as
// the manifest's appName / appDescription, so store and manifest never drift.
{
  const localized: Record<string, { title?: string; summary?: string; description?: string[] }> = listing.cws.localized ?? {}
  const codes = localeCodes()
  check(
    codes.join() === Object.keys(localized).sort().join(),
    `cws.localized covers exactly the _locales codes (${codes.join(', ')})`,
  )
  for (const code of codes) {
    const entry = localized[code] ?? {}
    const msgs = readMessages(code)
    const t = entry.title ?? ''
    const s = entry.summary ?? ''
    check(t.length > 0 && t.length <= MESSAGE_LIMITS.appName, `cws.localized.${code}.title: ${t.length} chars (max ${MESSAGE_LIMITS.appName})`)
    check(s.length > 0 && s.length <= MESSAGE_LIMITS.appDescription, `cws.localized.${code}.summary: ${s.length} chars (max ${MESSAGE_LIMITS.appDescription})`)
    // Long description: en is cws.description; every other locale carries its own.
    const d = (code === DEFAULT_LOCALE ? listing.cws.description : entry.description) as string[] | undefined
    const dText = Array.isArray(d) && d.every((p) => typeof p === 'string' && p.length > 0) ? d.join('\n\n') : ''
    // Working cap 16,000 chars (the public CWS listing docs state no description limit: developer.chrome.com/docs/webstore/cws-dashboard-listing); keep localized copy near 2,500.
    check(dText.length >= 250 && dText.length <= 16000, `cws.localized.${code}.description: ${dText.length} chars (250-16000)`)
    if (code !== DEFAULT_LOCALE) {
      check(dText.includes('Sylphx') && dText.includes('https://sylphx.com'), `cws.localized.${code}.description carries the "by Sylphx" line`)
      check(dText.includes('9.99') || dText.includes('9,99'), `cws.localized.${code}.description states the Pro price`)
    }
    check(t === msgs.appName?.message && s === msgs.appDescription?.message, `cws.localized.${code} equals _locales/${code} appName/appDescription`)
  }
  check(listing.cws.locale === DEFAULT_LOCALE, `cws.locale == ${DEFAULT_LOCALE}`)
  check(listing.cws.localized?.[DEFAULT_LOCALE]?.title === listing.cws.title, 'cws.localized.en.title == cws.title')
}

// ─── Content sanity: Pro disclosure is required by store policy ──
for (const store of ['cws', 'edge', 'amo'] as const) {
  const text = listing[store].description.join('\n\n').toLowerCase()
  const summary = (listing[store].summary ?? '').toLowerCase()
  check(
    text.includes('free forever') && (text.includes('pro') || summary.includes('pro')),
    `${store}: free-forever + Pro disclosure present`,
  )
}

// ─── Required store fields ───────────────────────────────────────
const isHttps = (u: unknown): boolean => typeof u === 'string' && /^https:\/\/\S+$/.test(u)
check(isHttps(listing.shared.supportUrl), 'shared.supportUrl is an https URL (CWS/Edge/AMO support)')
check(isHttps(listing.shared.privacyUrl), 'shared.privacyUrl is an https URL (Edge and CWS require a privacy policy)')
check(existsSync(resolve(root, 'PRIVACY.md')), 'PRIVACY.md exists (target of shared.privacyUrl)')
// Edge Partner Center: description 250-10000 chars, up to 7 search terms of
// at most 30 characters, 21 words in total.
check(listing.edge.description.join('\n\n').length >= 250, 'edge.description is at least 250 chars')
const terms: unknown = listing.edge.searchTerms
check(
  Array.isArray(terms) &&
    terms.length >= 1 &&
    terms.length <= 7 &&
    terms.every((t) => typeof t === 'string' && t.length > 0 && t.length <= 30) &&
    terms.join(' ').split(/\s+/).length <= 21,
  'edge.searchTerms: 1-7 terms, each at most 30 chars, at most 21 words',
)
check(typeof listing.edge.category === 'string' && listing.edge.category.length > 0, 'edge.category present')
// AMO: 1-2 category slugs, up to 10 tags, a licence slug.
const cats: unknown = listing.amo.categories
check(Array.isArray(cats) && cats.length >= 1 && cats.length <= 2 && cats.every((c) => typeof c === 'string' && /^[a-z-]+$/.test(c)), 'amo.categories: 1-2 slugs')
const tags: unknown = listing.amo.tags
check(Array.isArray(tags) && tags.length <= 10 && tags.every((t) => typeof t === 'string' && t.length > 0 && t.length <= 20), 'amo.tags: at most 10, each at most 20 chars')
check(listing.amo.license === 'MIT', 'amo.license == MIT (matches LICENSE)')

// ─── Screenshot manifest present ─────────────────────────────────
check(Array.isArray(listing.screenshots) && listing.screenshots.length >= 3, `screenshots listed (${listing.screenshots.length})`)

if (failures > 0) {
  console.error(`\nlisting: ${failures} failure(s)`)
  process.exit(1)
}
log('listing: OK')
