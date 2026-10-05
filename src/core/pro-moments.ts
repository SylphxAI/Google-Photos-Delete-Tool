/**
 * Pro conversion moments for free users: the dry-run teaser and the post-run
 * "Get Pro" button. Both are plain, dismissable text and a link; no network
 * call, no telemetry. Measurement is the UTM parameters on the link only.
 * Pro users never see either. Deleting, dry run, duplicates and empty trash
 * stay free (docs/vision.md); Pro only adds review power tools on top.
 */
import { PHOTO_TYPES, classifyLabel, type PhotoType } from './photo-filter'

/** chrome.storage key (extension) where the popup saves the Pro token. */
export const PRO_TOKEN_KEY = 'proToken'

/**
 * The single place the Pro target URL lives. Every Pro link is built from it by
 * proUrl(), so pointing it straight at the Stripe Payment Link later is a
 * one-line change here (Stripe records the UTM parameters on each checkout).
 */
export const PRO_URL = 'https://github.com/SylphxAI/Google-Photos-Delete-Tool#pro'

/**
 * Self-serve checkout switch. false: every Buy link keeps the current purchase
 * path (PRO_URL above). true: every Buy link goes to SELF_SERVE_CHECKOUT_URL,
 * where Money mints the offline licence and the success page shows the token.
 * Shipped true (live since the checkout went live). The site has the same
 * switch as `selfServeCheckout` in site/config.json (docs/PRO.md).
 */
export const SELF_SERVE_CHECKOUT = true
export const SELF_SERVE_CHECKOUT_URL = 'https://buy.sylphx.com/buy/gpdt'
export const SELF_SERVE_RECOVER_URL = 'https://buy.sylphx.com/recover?product=gpdt'

/**
 * Copy A/B test, measured without telemetry: each install gets a stable random
 * variant, kept in local storage only, and it travels only as utm_content on
 * the Pro link the user chooses to click. Read results in docs/PRO.md.
 */
export type ProVariant = 'a' | 'b'

/** Storage key (chrome.storage.local / localStorage) of the install's variant. */
export const PRO_VARIANT_KEY = 'proVariant'

export interface ProVariantStore {
  get(): Promise<unknown>
  set(variant: ProVariant): Promise<void>
}

/**
 * The install's variant: the stored one, else a random pick that is stored
 * first. Any storage failure yields "a", so a broken store never changes copy
 * between calls.
 */
export async function getProVariant(store: ProVariantStore, random: () => number = Math.random): Promise<ProVariant> {
  try {
    const saved = await store.get()
    if (saved === 'a' || saved === 'b') return saved
    const picked: ProVariant = random() < 0.5 ? 'a' : 'b'
    await store.set(picked)
    return picked
  } catch {
    return 'a'
  }
}

/** Copy per variant; "a" is the original wording. */
export const PRO_COPY: Record<ProVariant, { ctaLine: string; linkLabel: string }> = {
  a: { ctaLine: 'Delete only the types you choose with Pro — US$9.99 once', linkLabel: 'Get Pro' },
  b: { ctaLine: 'Clean up faster with Pro: type and date filters, presets — US$9.99 once, yours for life', linkLabel: 'Unlock Pro' },
}

export type ProMedium = 'dryrun_teaser' | 'post_run' | 'date_filter' | 'presets' | 'dupes' | 'license_box'

/** PRO_URL with UTM parameters (before the anchor); utm_content is the copy variant. */
export function proUrl(medium: ProMedium, variant: ProVariant = 'a', selfServe: boolean = SELF_SERVE_CHECKOUT): string {
  if (selfServe) return `${SELF_SERVE_CHECKOUT_URL}?utm_source=extension&utm_medium=${medium}&utm_campaign=pro&utm_content=${variant}`
  const [base, hash] = PRO_URL.split('#')
  return `${base}?utm_source=extension&utm_medium=${medium}&utm_campaign=pro&utm_content=${variant}#${hash}`
}

const PLURAL: Record<Exclude<PhotoType, 'unknown'>, [string, string]> = {
  photo: ['photo', 'photos'],
  video: ['video', 'videos'],
  screenshot: ['screenshot', 'screenshots'],
  animation: ['animation', 'animations'],
  collage: ['collage', 'collages'],
}

export interface DryRunTeaser {
  /** "This view has 12 screenshots, 40 videos." */
  countsLine: string
  ctaLine: string
  linkLabel: string
  url: string
  /** Structured form of the teaser so a surface with locale support can re-render the copy. */
  variant: ProVariant
  parts: { type: Exclude<PhotoType, 'unknown'>; n: number }[]
  total: number
}

export type TypeCounts = Record<PhotoType, number>

/** Per-type counts of the labels a dry run observed (same rule as the Pro filter). */
export function countLabelTypes(labels: readonly string[]): TypeCounts {
  const counts: TypeCounts = { photo: 0, video: 0, screenshot: 0, animation: 0, collage: 0, unknown: 0 }
  for (const l of labels) counts[classifyLabel(l)] += 1
  return counts
}

/**
 * Teaser for a finished dry run. Counts come only from what the free scan
 * already observed; unclassifiable labels are left out of the per-type list.
 * Null for Pro users or when the scan saw nothing.
 */
export function buildDryRunTeaser(counts: TypeCounts, total: number, isPro: boolean, variant: ProVariant = 'a'): DryRunTeaser | null {
  if (isPro || total <= 0) return null
  const typed = PHOTO_TYPES.filter(t => counts[t] > 0)
  const parts = typed.map(t => `${counts[t].toLocaleString('en-US')} ${PLURAL[t][counts[t] === 1 ? 0 : 1]}`)
  const countsLine = parts.length > 0
    ? `This view has ${parts.join(', ')}.`
    : `This view has ${total.toLocaleString('en-US')} items.`
  return {
    countsLine,
    ctaLine: PRO_COPY[variant].ctaLine,
    linkLabel: PRO_COPY[variant].linkLabel,
    url: proUrl('dryrun_teaser', variant),
    variant,
    parts: typed.map(type => ({ type, n: counts[type] })),
    total,
  }
}

/** The date-filter wording shared by the popup and the userscript panel. */
export function dateReportLine(report: { matched: number; skippedUnreadable: number; total: number }): string {
  const n = (v: number): string => v.toLocaleString('en-US')
  const base = `${n(report.matched)} of ${n(report.total)} items match the date filter.`
  return report.skippedUnreadable > 0
    ? `${base} ${n(report.skippedUnreadable)} items skipped: date not readable.`
    : base
}
