/**
 * Find duplicates — in-page review for the extension and the userscript.
 *
 * Flow: scan this view (no clicks) → group look-alikes → the person
 * reviews which to keep → the chosen items go to the existing delete
 * flow, which keeps its consent gate, dry run, batches, and Stop.
 * Runs inside a shadow root so Google Photos styles cannot leak in.
 */
import { NOTHING_MOVED_TEXT, endedWithNothingMoved } from '../../core/nothing-moved'
import type { Progress } from '../../core/delete-engine'
import { ACTIVE_STATUSES } from '../../core/status'
import { DEFAULT_THRESHOLD, GroupingAborted, groupDuplicates, type DupGroup } from '../../core/dedup/group'
import { scanView, type ScanDeps, type ScannedItem } from '../../core/dedup/scan'
import { groupChoices, planDeletion, toggleChoice, type Overrides } from '../../core/dedup/selection'
import { harvestGridTiles, hashThumbnail, sizedThumbUrl } from '../../core/dedup/browser-grid'
import { browserDom } from '../../core/browser-dom'
import { sleep } from '../../core/utils'
import { proUrl, type ProVariant } from '../../core/pro-moments'
import { getLocale, t } from '../../extension/popup/i18n'
import {
  RESTORE_LABEL, TOKENS_CSS, openRestoreStudio, sparkleIcon,
  type PhotoQuality, type QualityVerdict, type RestoreBackend,
} from '../restore/studio'
import type { PolicyConsentStore, PolicySurface } from '../restore/policy-consent'
import {
  CONFIDENT_SIMILARITY, applyKeepRule, groupKey, groupsToCsv, planWithAutoAccept, splitByConfidence, trashedIds,
  type KeepRule,
} from '../../core/dedup/pro'

export interface FinderHost {
  /** Hand ids to the delete flow. The host enforces consent again. */
  runDelete(ids: string[], dryRun: boolean): Promise<{ ok: boolean; error?: string }>
  stopRun(): void
  consentAcknowledged(): Promise<boolean>
  acknowledgeConsent(): Promise<void>
  /** Subscribe to delete-run progress; returns an unsubscribe function. */
  onRunProgress(cb: (p: Progress) => void): () => void
  /** Pro state, verified on the device. Missing means free. */
  isPro?(): Promise<boolean>
  /** The install's copy A/B variant, carried as utm_content on Pro links. Missing means "a". */
  proVariant?(): Promise<ProVariant>
  scanDeps?: ScanDeps
  /** AI 4K Restore and the Blurry / Low-Res view. Missing hides both. */
  restore?: FinderRestore
}

export interface FinderRestore {
  backend: RestoreBackend
  policyStore: PolicyConsentStore
  surface?: PolicySurface
  /**
   * On-device sharpness and resolution check of the scanned thumbnails.
   * Missing hides the Blurry / Low-Res tab; the restore button stays.
   */
  classify?(items: ScannedItem[], opts: { signal: AbortSignal; onProgress?: (done: number, total: number) => void }): Promise<Map<string, QualityVerdict>>
}

export type FinderView = 'duplicates' | 'blurry'

export interface FinderOptions {
  /** Tab to show after the scan. 'blurry' needs `host.restore.classify`. */
  view?: FinderView
}

const HOST_ID = 'gpdt-dupes-host'
const PAGE = 40

export const browserScanDeps: ScanDeps = {
  harvest: () => harvestGridTiles(),
  findScrollTarget: () => browserDom.findScrollTarget(),
  hashThumb: hashThumbnail,
  sleep,
}

const CSS = `${TOKENS_CSS}
* { box-sizing: border-box; }
.panel { position: fixed; top: 0; right: 0; bottom: 0; width: min(560px, 100vw); z-index: 2147483647;
  display: flex; flex-direction: column; background: var(--gp-paper); color: var(--gp-ink);
  font: 400 14px/1.5 var(--gp-font); -webkit-font-smoothing: antialiased;
  box-shadow: var(--gp-shadow); border-left: 1px solid var(--gp-outline); }
header { display: flex; align-items: center; gap: 8px; min-height: 48px; padding: 8px 12px 8px 16px; border-bottom: 1px solid var(--gp-outline); }
header h1 { flex: 1; margin: 0; font-size: 15px; font-weight: 600; line-height: 1.3; }
main { flex: 1; overflow-y: auto; padding: 16px; }
main p { margin: 0 0 12px; }
footer { padding: 12px 16px; border-top: 1px solid var(--gp-outline); background: var(--gp-raised); display: grid; gap: 8px; }
button { cursor: pointer; border: 1px solid var(--gp-btn-border); border-radius: 8px; min-height: 40px; padding: 0 16px;
  font: 600 13px/1.2 var(--gp-font); display: inline-flex; align-items: center; justify-content: center; gap: 6px; }
button:disabled { opacity: .45; cursor: not-allowed; }
button:focus-visible, a:focus-visible, input:focus-visible, select:focus-visible { outline: 2px solid var(--gp-accent); outline-offset: 2px; }
.primary { background: var(--gp-accent); color: var(--gp-on-accent); border-color: var(--gp-accent); }
.danger { background: #C5281C; color: #FFFFFF; border-color: #C5281C; }
.ghost { background: var(--gp-sunken); color: var(--gp-ink); }
header .ghost { min-height: 32px; padding: 0 12px; }
.row { display: flex; gap: 8px; align-items: center; }
.row > button { flex: 1; }
.muted { color: var(--gp-muted); font-size: 12px; line-height: 1.45; }
.err { color: var(--gp-error); font-size: 12px; }
.bar { height: 6px; background: var(--gp-sunken); border-radius: 9999px; overflow: hidden; margin: 12px 0; }
.bar > div { height: 100%; width: 30%; border-radius: 9999px; background: var(--gp-accent); animation: slide 1.4s ease-in-out infinite; }
@keyframes slide { 0% { transform: translateX(-100%); } 100% { transform: translateX(333%); } }
@media (prefers-reduced-motion: reduce) { .bar > div { animation: none; width: 100%; opacity: .5; } }
.stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin: 12px 0; }
.stat { background: var(--gp-sunken); border-radius: 8px; padding: 12px; }
.stat b { display: block; font-size: 24px; font-weight: 650; line-height: 1; letter-spacing: -0.01em; font-variant-numeric: tabular-nums; }
.stat span { display: block; margin-top: 6px; font-size: 13px; font-weight: 600; line-height: 1.2; color: var(--gp-muted); }
input[type=range] { flex: 1; accent-color: var(--gp-accent); }
input[type=checkbox] { accent-color: var(--gp-accent); }
.group { background: var(--gp-raised); border: 1px solid var(--gp-outline); border-radius: 12px; padding: 16px; margin: 12px 0; }
.group h2 { margin: 0 0 12px; font-size: 15px; font-weight: 600; line-height: 1.3; font-variant-numeric: tabular-nums; }
.thumbs { display: grid; grid-template-columns: repeat(auto-fill, minmax(112px, 1fr)); gap: 8px; }
.qgrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 8px; }
.item, .qitem { position: relative; border-radius: 8px; overflow: hidden; background: var(--gp-raised); border: 1px solid var(--gp-outline); }
.item::after, .qitem::after { content: ''; position: absolute; inset: 0; border-radius: 8px; pointer-events: none; }
.item.keep::after { box-shadow: inset 0 0 0 2px var(--gp-keep); }
.item.delete::after, .qitem.delete::after { box-shadow: inset 0 0 0 2px var(--gp-trash-ink); }
.item.delete img, .qitem.delete img { opacity: .55; }
.item img, .qitem img { display: block; width: 100%; aspect-ratio: 1; object-fit: cover; background: var(--gp-sunken); }
.item img { cursor: pointer; }
.badge { position: absolute; top: 6px; left: 6px; z-index: 1; padding: 4px; border-radius: 4px; font-size: 12px; font-weight: 600; line-height: 1.2; }
.item.keep .badge { background: var(--gp-keep); color: var(--gp-on-keep); }
.item.delete .badge, .qitem.delete .badge { background: var(--gp-trash-ink); color: var(--gp-on-trash-ink); }
.item .meta, .qitem .meta { display: flex; justify-content: space-between; gap: 4px; padding: 6px 8px; font-size: 12px; color: var(--gp-muted); font-variant-numeric: tabular-nums; }
.meta a { color: var(--gp-accent); text-decoration: none; font-weight: 600; }
.quality { color: var(--gp-ink); font-weight: 600; }
.restore { width: calc(100% - 12px); margin: 0 6px 6px; min-height: 32px; padding: 0 8px; font-size: 12px;
  background: var(--gp-raised); color: var(--gp-accent); border-color: var(--gp-outline); }
.restore:hover { border-color: var(--gp-accent); }
.verdict { display: flex; gap: 4px; padding: 0 6px 6px; }
.verdict button { flex: 1; min-height: 32px; padding: 0 8px; font-size: 12px; background: var(--gp-sunken); color: var(--gp-ink); }
.verdict button.k[aria-pressed=true] { background: var(--gp-keep); color: var(--gp-on-keep); border-color: var(--gp-keep); }
.verdict button.t[aria-pressed=true] { background: var(--gp-trash-ink); color: var(--gp-on-trash-ink); border-color: var(--gp-trash-ink); }
.consent { display: flex; gap: 8px; align-items: flex-start; font-size: 12px; line-height: 1.45; padding: 12px; border-radius: 8px; background: var(--gp-caution-container); }
.tools { display: grid; gap: 8px; margin: 12px 0; padding: 12px; border-radius: 12px; background: var(--gp-raised); border: 1px solid var(--gp-outline); }
.tools select { flex: 1; height: 36px; background: var(--gp-raised); color: inherit; border: 1px solid var(--gp-outline); border-radius: 8px; padding: 0 10px; font: inherit; font-size: 13px; }
.tools select:disabled { opacity: .45; }
.tools label.opt { display: flex; gap: 8px; align-items: center; font-size: 13px; }
.pro-tag { color: var(--gp-on-accent-container); background: var(--gp-accent-container); font-size: 12px; font-weight: 600; text-decoration: none; border-radius: 4px; padding: 2px 6px; }
.tabs { display: flex; padding: 2px; margin: 0 0 16px; border-radius: 8px; background: var(--gp-sunken); border: 1px solid var(--gp-btn-border); }
.tabs button { flex: 1; min-height: 32px; border: 0; background: transparent; color: var(--gp-muted); border-radius: 6px; }
.tabs button[aria-selected=true] { background: var(--gp-raised); color: var(--gp-ink); box-shadow: 0 0 0 1px var(--gp-outline); }
.gp-sparkle { flex: none; }
.hidden { display: none !important; }
`

function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') el.className = v
    else el.setAttribute(k, v)
  }
  for (const c of children) el.append(c)
  return el
}

const pct = (x: number): string => `${Math.round(x * 100)}%`

export function openDuplicateFinder(host: FinderHost, options: FinderOptions = {}): void {
  document.getElementById(HOST_ID)?.remove()
  const mount = h('div', { id: HOST_ID })
  const shadow = mount.attachShadow({ mode: 'open' })
  shadow.append(h('style', {}, CSS))
  ;(document.body ?? document.documentElement).append(mount)

  const deps = host.scanDeps ?? browserScanDeps
  let scanAbort: AbortController | null = null
  let groupAbort: AbortController | null = null
  let items: ScannedItem[] = []
  let byId = new Map<string, ScannedItem>()
  let groups: DupGroup[] = []
  let shown = PAGE
  let threshold = DEFAULT_THRESHOLD
  let consented = false
  let runActive = false
  let runIsDryRun = false
  let pro = false
  let variant: ProVariant = 'a'
  let keepRule: KeepRule = 'default'
  /** Ids the user flipped by hand; regrouping must not re-apply the keep rule over them. */
  const manual = new Set<string>()
  let autoAccept = false
  let showConfident = false
  let toolsNote = ''
  const approved = new Set<string>()
  const overrides: Overrides = new Map()
  const restore = host.restore
  const canClassify = typeof restore?.classify === 'function'
  let tab: FinderView = options.view === 'blurry' && canClassify ? 'blurry' : 'duplicates'
  let verdicts: Map<string, QualityVerdict> | null = null
  let classifyAbort: AbortController | null = null
  /** Blurry-tab photos the person chose to trash. Nothing is chosen for them. */
  const blurTrash = new Set<string>()

  const main = h('main')
  const footer = h('footer')
  const closeBtn = h('button', { class: 'ghost', title: 'Close' }, 'Close')
  shadow.append(h('div', { class: 'panel', role: 'dialog', 'aria-label': 'Find duplicates' },
    h('header', {}, h('h1', {}, 'Find duplicates'), closeBtn), main, footer))

  const unsubscribe = host.onRunProgress((p) => renderRun(p))
  closeBtn.addEventListener('click', () => {
    scanAbort?.abort()
    groupAbort?.abort()
    classifyAbort?.abort()
    unsubscribe()
    mount.remove()
  })

  // ─── 1. Intro ───────────────────────────────────────────────
  function renderIntro(): void {
    if (tab === 'blurry') {
      main.replaceChildren(
        h('p', {}, 'Finds blurry and low-resolution photos in the view you are on, so you can move junk shots to Trash or restore the ones you care about.'),
        h('p', { class: 'muted' }, 'Sharpness is measured on your computer from small thumbnails. Nothing is uploaded and nothing is deleted until you choose.'),
      )
      const start = h('button', { class: 'primary' }, 'Scan this view')
      start.addEventListener('click', () => void runScan())
      footer.replaceChildren(start)
      return
    }
    main.replaceChildren(
      h('p', {}, 'Finds photos that look the same or almost the same in the view you are on (your library, an album, or a search).'),
      h('p', { class: 'muted' }, 'It scrolls the page and compares small thumbnails on your computer. Nothing is uploaded and nothing is deleted until you review the groups and confirm.'),
      h('p', { class: 'muted' }, 'Big libraries take a while: Google Photos loads the grid as you scroll. You can cancel at any time.'),
    )
    const start = h('button', { class: 'primary' }, 'Scan this view')
    start.addEventListener('click', () => void runScan())
    footer.replaceChildren(start)
  }

  // ─── 2. Scan ────────────────────────────────────────────────
  async function runScan(): Promise<void> {
    scanAbort = new AbortController()
    const found = h('b', {}, '0')
    const hashed = h('b', {}, '0')
    const failed = h('b', {}, '0')
    const note = h('p', { class: 'muted' }, 'Scrolling through this view…')
    main.replaceChildren(
      note,
      h('div', { class: 'bar' }, h('div')),
      h('div', { class: 'stats' },
        h('div', { class: 'stat' }, found, h('span', {}, 'Found')),
        h('div', { class: 'stat' }, hashed, h('span', {}, 'Compared')),
        h('div', { class: 'stat' }, failed, h('span', {}, 'Unreadable'))),
    )
    const cancel = h('button', { class: 'ghost' }, 'Cancel')
    cancel.addEventListener('click', () => scanAbort?.abort())
    footer.replaceChildren(cancel)

    const result = await scanView(deps, {
      signal: scanAbort.signal,
      onProgress: (p) => {
        found.textContent = p.found.toLocaleString()
        hashed.textContent = p.hashed.toLocaleString()
        failed.textContent = p.failed.toLocaleString()
        if (p.phase === 'hashing') note.textContent = 'Reached the end of the view. Finishing the comparison…'
      },
    })
    if (result.cancelled) { renderIntro(); return }
    items = result.items
    byId = new Map(items.map((i) => [i.id, i]))
    if (result.found === 0) {
      main.replaceChildren(h('p', { class: 'err' }, 'No photos were found in this view. Open your library, an album, or a search result and try again. If photos are visible, use "Report issue" so the page layout can be updated.'))
      renderRestart()
      return
    }
    await regroup()
  }

  // ─── 3. Group + review ──────────────────────────────────────
  async function regroup(): Promise<void> {
    groupAbort?.abort()
    const ctrl = new AbortController()
    groupAbort = ctrl
    main.replaceChildren(h('p', { class: 'muted' }, 'Grouping look-alikes…'), h('div', { class: 'bar' }, h('div')))
    try {
      groups = await groupDuplicates(items, { threshold, signal: ctrl.signal })
    } catch (err) {
      if (err instanceof GroupingAborted) return
      throw err
    }
    shown = PAGE
    consented = await host.consentAcknowledged()
    pro = await Promise.resolve(host.isPro?.()).then((v) => v === true, () => false)
    variant = await Promise.resolve(host.proVariant?.()).then((v) => (v === 'b' ? 'b' : 'a'), () => 'a' as ProVariant)
    if (!pro) { keepRule = 'default'; autoAccept = false }
    // The selected rule must govern the new groups too, so the dropdown and the
    // selection never disagree after the slider regroups.
    // Groups holding a manual flip keep it; only untouched groups get the rule.
    if (pro && keepRule !== 'default') applyRule(groups.filter((g) => !g.itemIds.some((id) => manual.has(id))))
    renderReview()
  }

  /** Apply the selected keep rule to the current groups (one keeper each) and set the note. */
  function applyRule(target: DupGroup[] = groups): void {
    const res = applyKeepRule(target, (id) => byId.get(id), keepRule, overrides)
    const n = res.applied.toLocaleString(getLocale())
    toolsNote = keepRule === 'default' ? t('finder.backDefault')
      : res.fellBack > 0
        ? t('finder.appliedPartial', { n, fb: res.fellBack.toLocaleString(getLocale()) })
        : t('finder.appliedAll', { n })
  }

  function renderTabs(): HTMLElement | string {
    if (!canClassify) return ''
    const tabs = h('div', { class: 'tabs', role: 'tablist', 'aria-label': 'What to review' })
    const views: [FinderView, string][] = [['duplicates', 'All Duplicates'], ['blurry', 'Blurry / Low-Res']]
    for (const [key, label] of views) {
      const b = h('button', { role: 'tab', 'aria-selected': String(tab === key), 'data-tab': key }, label)
      b.addEventListener('click', () => {
        if (tab === key) return
        tab = key
        renderReview()
      })
      tabs.append(b)
    }
    return tabs
  }

  /** Small "AI 4K Restore" button that opens the studio for one photo. */
  function restoreButton(item: ScannedItem, quality?: PhotoQuality): HTMLElement | string {
    if (!restore) return ''
    const b = h('button', { class: 'restore', 'data-restore': item.id, title: 'Restore this photo in 4K' }, sparkleIcon(document, 14), RESTORE_LABEL)
    b.addEventListener('click', (e) => {
      e.stopPropagation()
      const v = verdicts?.get(item.id)
      openRestoreStudio({
        photo: {
          id: item.id,
          label: item.label,
          previewUrl: sizedThumbUrl(item.thumbUrl, 1024),
          sourceUrl: sizedThumbUrl(item.thumbUrl, 2048),
          width: v?.width,
          height: v?.height,
          quality: quality ?? (v && v.kind !== 'sharp' ? v.kind : undefined),
        },
        backend: restore.backend,
        policyStore: restore.policyStore,
        surface: restore.surface,
        returnFocus: b,
      })
    })
    return b
  }

  function renderReview(): void {
    if (tab === 'blurry') { renderBlurry(); return }
    const slider = h('input', { type: 'range', min: '80', max: '100', step: '1', value: String(Math.round(threshold * 100)), 'aria-label': 'How similar photos must be' })
    const sliderValue = h('b', {}, pct(threshold))
    let debounce: ReturnType<typeof setTimeout> | undefined
    slider.addEventListener('input', () => {
      threshold = Number(slider.value) / 100
      sliderValue.textContent = pct(threshold)
      clearTimeout(debounce)
      debounce = setTimeout(() => void regroup(), 300)
    })

    const auto = pro && autoAccept
    const split = splitByConfidence(groups)
    const autoPlan = auto ? planWithAutoAccept(groups, overrides, approved) : null
    const plan = autoPlan ?? planDeletion(groups, overrides)
    const pending = autoPlan?.pending ?? 0
    // Free: every group, as before. Auto-accept: one combined list of the rest.
    const visible = auto ? (showConfident ? groups : split.review) : groups
    const list = h('div')
    for (const group of visible.slice(0, shown)) list.append(renderGroup(group, auto && !split.confident.includes(group)))
    const more = h('button', { class: 'ghost' }, `Show more groups (${Math.max(0, visible.length - shown)} left)`)
    more.classList.toggle('hidden', shown >= visible.length)
    more.addEventListener('click', () => { shown += PAGE; renderReview() })

    main.replaceChildren(
      renderTabs(),
      h('div', { class: 'row' }, h('span', {}, 'Similarity'), slider, sliderValue),
      h('p', { class: 'muted' }, 'Higher finds only near-identical copies. Lower also groups edits, bursts and similar shots, so check them.'),
      renderTools(split.confident.length, split.review.length, pending),
      h('div', { class: 'stats' },
        h('div', { class: 'stat' }, h('b', {}, groups.length.toLocaleString()), h('span', {}, 'Groups')),
        h('div', { class: 'stat' }, h('b', {}, plan.kept.toLocaleString()), h('span', {}, 'Keep')),
        h('div', { class: 'stat' }, h('b', {}, plan.ids.length.toLocaleString()), h('span', {}, 'To Trash'))),
      groups.length === 0
        ? h('p', {}, `No look-alikes at ${pct(threshold)} among ${items.length.toLocaleString()} photos. Try a lower similarity.`)
        : h('p', { class: 'muted' }, 'Green is kept, red goes to Trash. Click a photo to switch. The best copy is chosen for you: largest size when known, then the oldest. Each group always keeps at least one.'),
      list,
      more,
    )
    renderReviewFooter(plan.ids)
  }

  // ─── 3b. Blurry / Low-Res ───────────────────────────────────
  async function classifyView(): Promise<void> {
    if (!restore?.classify || classifyAbort) return
    const ctrl = new AbortController()
    classifyAbort = ctrl
    const done = h('b', {}, '0')
    const total = h('b', {}, items.length.toLocaleString())
    main.replaceChildren(
      renderTabs(),
      h('p', { class: 'muted' }, 'Measuring sharpness on your computer…'),
      h('div', { class: 'bar' }, h('div')),
      h('div', { class: 'stats' },
        h('div', { class: 'stat' }, done, h('span', {}, 'Checked')),
        h('div', { class: 'stat' }, total, h('span', {}, 'In view')),
        h('div', { class: 'stat' }, h('b', {}, '–'), h('span', {}, 'Flagged'))),
    )
    footer.replaceChildren()
    try {
      const result = await restore.classify(items, {
        signal: ctrl.signal,
        onProgress: (n) => { done.textContent = n.toLocaleString() },
      })
      if (ctrl.signal.aborted) return
      verdicts = result
    } catch {
      if (ctrl.signal.aborted) return
      verdicts = null
      classifyAbort = null
      main.replaceChildren(renderTabs(), h('p', { class: 'err' }, 'Sharpness could not be measured in this view. Nothing was changed. Try Scan again.'))
      renderRestart()
      return
    }
    classifyAbort = null
    if (tab === 'blurry') renderBlurry()
  }

  function renderBlurry(): void {
    if (!verdicts) { void classifyView(); return }
    const rank = (v: QualityVerdict): number => (v.kind === 'blurry' ? 0 : 1) + (v.sharpness ?? 0)
    const flagged = items
      .map((item) => ({ item, v: verdicts!.get(item.id) }))
      .filter((x): x is { item: ScannedItem; v: QualityVerdict & { kind: PhotoQuality } } => !!x.v && x.v.kind !== 'sharp')
      .sort((a, b) => rank(a.v) - rank(b.v))
    for (const id of blurTrash) if (!flagged.some((f) => f.item.id === id)) blurTrash.delete(id)
    const blurry = flagged.filter((f) => f.v.kind === 'blurry').length
    const grid = h('div', { class: 'qgrid' })
    for (const { item, v } of flagged.slice(0, shown)) grid.append(renderQualityTile(item, v))
    const more = h('button', { class: 'ghost' }, `Show more photos (${Math.max(0, flagged.length - shown)} left)`)
    more.classList.toggle('hidden', shown >= flagged.length)
    more.addEventListener('click', () => { shown += PAGE; renderReview() })
    main.replaceChildren(
      renderTabs(),
      h('div', { class: 'stats' },
        h('div', { class: 'stat' }, h('b', {}, blurry.toLocaleString()), h('span', {}, 'Blurry')),
        h('div', { class: 'stat' }, h('b', {}, (flagged.length - blurry).toLocaleString()), h('span', {}, 'Low-res')),
        h('div', { class: 'stat' }, h('b', {}, blurTrash.size.toLocaleString()), h('span', {}, 'To Trash'))),
      flagged.length === 0
        ? h('p', {}, `No blurry or low-resolution photos among ${items.length.toLocaleString()} in this view.`)
        : h('p', { class: 'muted' }, `Nothing is marked for Trash until you choose. Restore sends only the photo you confirm; everything else stays on your computer.`),
      grid,
      more,
    )
    renderReviewFooter([...blurTrash])
  }

  function renderQualityTile(item: ScannedItem, v: QualityVerdict & { kind: PhotoQuality }): HTMLElement {
    const trashed = blurTrash.has(item.id)
    const date = item.takenAt ? new Date(item.takenAt).toLocaleDateString() : ''
    const keep = h('button', { class: 'k', 'aria-pressed': String(!trashed) }, 'Keep')
    const trash = h('button', { class: 't', 'aria-pressed': String(trashed) }, 'Move to Trash')
    keep.addEventListener('click', () => { blurTrash.delete(item.id); renderReview() })
    trash.addEventListener('click', () => { blurTrash.add(item.id); renderReview() })
    const quality = v.kind === 'blurry' ? 'Blurry' : 'Low-res'
    const detail = v.kind === 'low-res' && v.width && v.height
      ? `${v.width.toLocaleString()} × ${v.height.toLocaleString()}`
      : v.sharpness !== undefined ? `${Math.round(v.sharpness * 100)}% sharp` : ''
    return h('div', { class: `qitem${trashed ? ' delete' : ''}`, 'data-quality': v.kind },
      h('img', { src: sizedThumbUrl(item.thumbUrl, 300), alt: item.label ?? 'Photo', loading: 'lazy', title: item.label ?? '' }),
      ...(trashed ? [h('span', { class: 'badge' }, 'Trash')] : []),
      h('div', { class: 'meta' },
        h('span', {}, h('span', { class: 'quality' }, quality), detail ? ` · ${detail}` : '', date ? ` · ${date}` : ''),
        h('a', { href: `https://photos.google.com/photo/${encodeURIComponent(item.id)}`, target: '_blank', rel: 'noopener' }, 'Open')),
      h('div', { class: 'verdict' }, keep, trash),
      restoreButton(item, v.kind))
  }

  /** Pro review tools. Free users see them disabled with a Get Pro link. */
  function renderTools(confidentCount: number, reviewCount: number, pending: number): HTMLElement {
    const select = h('select', { 'aria-label': t('finder.keepAria') })
    const labels: Record<KeepRule, string> = { default: t('finder.ruleDefault'), newest: t('finder.ruleNewest'), oldest: t('finder.ruleOldest') }
    for (const rule of Object.keys(labels) as KeepRule[]) select.append(h('option', { value: rule }, labels[rule]))
    select.value = keepRule
    select.disabled = !pro
    select.addEventListener('change', () => {
      if (!pro) return
      keepRule = select.value as KeepRule
      manual.clear()
      applyRule()
      renderReview()
    })

    const accept = h('input', { type: 'checkbox' })
    accept.checked = autoAccept
    accept.disabled = !pro
    accept.addEventListener('change', () => {
      if (!pro) return
      autoAccept = accept.checked
      shown = PAGE
      renderReview()
    })

    const exportBtn = h('button', { class: 'ghost' }, t('finder.exportCsv'))
    exportBtn.disabled = !pro || groups.length === 0
    exportBtn.addEventListener('click', () => {
      if (!pro) return
      const trashed = autoAccept
        ? new Set(planWithAutoAccept(groups, overrides, approved).ids)
        : trashedIds(groups, overrides)
      downloadCsv(groupsToCsv(groups, trashed))
    })

    const selectAll = h('button', { class: 'ghost' }, 'Select all duplicates, keep best copy')
    selectAll.disabled = !pro || groups.length === 0
    selectAll.addEventListener('click', () => {
      if (!pro) return
      overrides.clear()
      manual.clear()
      keepRule = 'default'
      autoAccept = false
      for (const group of groups) approved.add(groupKey(group))
      toolsNote = 'Best copy kept in every group. Review the selection below; nothing has been deleted.'
      renderReview()
    })

    const tag = (): HTMLElement => h('a', { class: 'pro-tag', href: proUrl('dupes', variant), target: '_blank', rel: 'noopener' }, t('finder.proTag'))
    const rows: HTMLElement[] = [
      h('div', { class: 'row' }, selectAll, ...(pro ? [] : [tag()])),
      h('div', { class: 'row' }, h('span', {}, t('finder.keep')), select, ...(pro ? [] : [tag()])),
      h('div', { class: 'row' },
        h('label', { class: 'opt' }, accept, h('span', {}, t('finder.autoAccept', { pct: Math.round(CONFIDENT_SIMILARITY * 100) }))),
        ...(pro ? [] : [tag()])),
      h('div', { class: 'row' }, exportBtn, ...(pro ? [] : [tag()])),
    ]
    if (pro && autoAccept) {
      const toggle = h('button', { class: 'ghost' }, t(`finder.auto${showConfident ? 'Hide' : 'Show'}${confidentCount === 1 ? 'One' : 'Many'}`, { n: confidentCount.toLocaleString(getLocale()) }))
      toggle.addEventListener('click', () => { showConfident = !showConfident; shown = PAGE; renderReview() })
      const approveAll = h('button', { class: 'ghost' }, t('finder.approveAll', { n: pending.toLocaleString(getLocale()) }))
      approveAll.disabled = pending === 0
      approveAll.addEventListener('click', () => {
        for (const g of splitByConfidence(groups).review) approved.add(groupKey(g))
        renderReview()
      })
      rows.push(
        h('p', { class: 'muted' }, t('finder.reviewNote', { n: reviewCount.toLocaleString(getLocale()) })),
        h('div', { class: 'row' }, toggle, approveAll))
    }
    if (pro && toolsNote) rows.push(h('p', { class: 'muted' }, toolsNote))
    if (!pro) rows.push(h('p', { class: 'muted' }, t('finder.proNote')))
    return h('div', { class: 'tools' }, ...rows)
  }

  function downloadCsv(csv: string): void {
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const a = h('a', { href: url, download: `gpdt-duplicate-groups-${new Date().toISOString().slice(0, 10)}.csv` })
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 0)
  }

  function renderGroup(group: DupGroup, needsApproval = false): HTMLElement {
    const choices = groupChoices(group, overrides)
    const thumbs = h('div', { class: 'thumbs' })
    group.itemIds.forEach((id, i) => {
      const item = byId.get(id)
      if (!item) return
      const choice = choices[i]
      const img = h('img', { src: sizedThumbUrl(item.thumbUrl, 224), alt: item.label ?? 'Photo', loading: 'lazy', title: item.label ?? '' })
      img.addEventListener('click', () => {
        const res = toggleChoice(group, id, overrides)
        if (!res.ok) {
          flash(card, 'Each group keeps at least one photo. Mark another one to keep first.')
          return
        }
        manual.add(id)
        renderReview()
      })
      const date = item.takenAt ? new Date(item.takenAt).toLocaleDateString() : ''
      thumbs.append(h('div', { class: `item ${choice}` },
        img,
        h('span', { class: 'badge' }, choice === 'keep' ? (id === group.bestItemId ? 'Keep · best' : 'Keep') : 'Trash'),
        h('div', { class: 'meta' },
          h('span', {}, date),
          h('a', { href: `https://photos.google.com/photo/${encodeURIComponent(id)}`, target: '_blank', rel: 'noopener' }, 'Open')),
        restoreButton(item)))
    })
    const card = h('section', { class: 'group' },
      h('h2', {}, `${group.itemIds.length} photos · ${pct(group.averageSimilarity)} similar`),
      thumbs)
    if (needsApproval) {
      const key = groupKey(group)
      const ok = approved.has(key)
      const btn = h('button', { class: ok ? 'primary' : 'ghost' }, ok ? t('finder.approved') : t('finder.approveGroup'))
      btn.addEventListener('click', () => { if (ok) approved.delete(key); else approved.add(key); renderReview() })
      card.append(h('div', { class: 'row', style: 'margin-top:8px' }, btn))
    }
    return card
  }

  function flash(card: HTMLElement, text: string): void {
    const p = h('p', { class: 'err' }, text)
    card.append(p)
    setTimeout(() => p.remove(), 3000)
  }

  function renderReviewFooter(ids: string[]): void {
    const error = h('p', { class: 'err hidden' })
    const check = h('input', { type: 'checkbox' })
    const consent = h('label', { class: 'consent' }, check,
      h('span', {}, 'I understand the red photos move to Google Photos Trash, where they stay for 60 days before Google deletes them.'))
    consent.classList.toggle('hidden', consented || ids.length === 0)

    const preview = h('button', { class: 'ghost' }, 'Preview (dry run)')
    const trash = h('button', { class: 'danger' }, `Move ${ids.length.toLocaleString()} to Trash`)
    preview.disabled = ids.length === 0
    trash.disabled = ids.length === 0

    const handoff = async (dryRun: boolean): Promise<void> => {
      error.classList.add('hidden')
      if (!dryRun && !consented) {
        if (!check.checked) {
          error.textContent = 'Tick the box above to confirm first.'
          error.classList.remove('hidden')
          return
        }
        await host.acknowledgeConsent()
        consented = true
      }
      runActive = true
      runIsDryRun = dryRun
      const res = await host.runDelete(ids, dryRun)
      if (!res.ok) {
        runActive = false
        error.textContent = res.error ?? 'Could not start.'
        error.classList.remove('hidden')
      }
    }
    preview.addEventListener('click', () => void handoff(true))
    trash.addEventListener('click', () => void handoff(false))
    footer.replaceChildren(consent, error, h('div', { class: 'row' }, preview, trash))
  }

  // ─── 4. Delete run (existing engine) ────────────────────────
  function renderRun(p: Progress): void {
    if (!runActive) return
    const active = ACTIVE_STATUSES.has(p.status) || p.status === 'paused'
    if (active) {
      main.replaceChildren(
        h('p', {}, p.total !== undefined && p.deleted === 0
          ? `Preview: found ${p.total.toLocaleString()} of the chosen photos so far…`
          : `Moving to Trash: ${p.deleted.toLocaleString()} done, ${p.selected.toLocaleString()} selected…`),
        h('div', { class: 'bar' }, h('div')),
        h('p', { class: 'muted' }, 'Keep this tab open. You can stop at any time; photos already moved stay in Trash.'),
      )
      const stop = h('button', { class: 'danger' }, 'Stop')
      stop.addEventListener('click', () => host.stopRun())
      footer.replaceChildren(stop)
      return
    }
    runActive = false
    const lines: HTMLElement[] = []
    if (p.status === 'error') lines.push(h('p', { class: 'err' }, p.error ?? 'The run stopped with an error.'))
    else if (p.status === 'idle') lines.push(h('p', {}, `Stopped. ${p.deleted.toLocaleString()} photos were moved to Trash before the stop.`))
    else if (p.total !== undefined && p.deleted === 0) lines.push(h('p', {}, `Preview done: ${p.total.toLocaleString()} of the chosen photos are in this view. Nothing was changed.`))
    else if (endedWithNothingMoved(p)) lines.push(h('p', { class: 'err' }, NOTHING_MOVED_TEXT))
    else lines.push(h('p', {}, `Done. ${p.deleted.toLocaleString()} photos moved to Trash. You can restore them from Trash for 60 days.`))
    // Moved items are gone from the view; the old groups are stale.
    if (!runIsDryRun && p.deleted > 0) { groups = []; verdicts = null; blurTrash.clear() }
    main.replaceChildren(...lines)
    renderRestart()
  }

  function renderRestart(): void {
    const again = h('button', { class: 'primary' }, 'Scan again')
    again.addEventListener('click', () => {
      overrides.clear(); manual.clear(); approved.clear(); toolsNote = ''; keepRule = 'default'
      classifyAbort?.abort(); classifyAbort = null; verdicts = null; blurTrash.clear()
      void runScan()
    })
    const back = h('button', { class: 'ghost' }, 'Back to review')
    back.classList.toggle('hidden', tab === 'blurry' ? !verdicts : groups.length === 0)
    back.addEventListener('click', () => renderReview())
    footer.replaceChildren(h('div', { class: 'row' }, back, again))
  }

  renderIntro()
}
