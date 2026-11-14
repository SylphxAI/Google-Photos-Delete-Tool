/**
 * Shared floating control panel — ONE panel for userscript and
 * standalone. Mounted via {@link mountPanel}; all behavior lives in the
 * injected {@link PageRunner}. The Chrome extension popup is a separate,
 * i18n'd surface with the same controls (parity by contract, not code).
 */
import type { PageRunner, PanelRunOptions } from '../../core/page-runner'
import { admitDestructiveRun } from '../../core/consent'
import { admitSurface, describePhotosView } from '../../core/surface'
import { formatElapsed, formatEta } from '../../core/utils'
import { ACTIVE_STATUSES } from '../../core/status'
import type { Progress, RunStatus } from '../../core'
import { PHOTO_TYPES, buildFilterFromControls, type PhotoType } from '../../core/photo-filter'
import { openDuplicateFinder, type FinderRestore } from '../dupes/finder'
import { POLICY_GATE_CSS, ensurePolicyConsent, localStoragePolicyStore, type PolicyConsentStore } from '../restore/policy-consent'
import { RESTORE_LABEL, sparkleIcon } from '../restore/studio'
import { sleep } from '../../core/utils'
import { POST_RUN_PROMPT_KEY, claimPostRunPrompt, detectBrowser } from '../../core/post-run-prompt'
import { PRO_VARIANT_KEY, buildDryRunTeaser, dateReportLine, getProVariant, proUrl, type ProVariant } from '../../core/pro-moments'
import { createLocalStoragePresetStore, createPresetManager, presetViewHint, type CleanupPreset } from '../../core/presets'
import { renderProTeaser } from '../pro-teaser/teaser'
import { showPostRunPrompt } from '../post-run/prompt'
import { NOTHING_MOVED_TEXT, endedWithNothingMoved } from '../../core/nothing-moved'

const ROOT_ID = 'gpdt-panel-root'
const STYLE_ID = 'gpdt-panel-style'

const STATUS_TEXT: Record<RunStatus, string> = {
  idle: 'Ready',
  selecting: 'Selecting photos…',
  deleting: 'Deleting batch…',
  scrolling: 'Loading more photos…',
  paused: 'Paused',
  done: 'Done',
  error: 'Error',
  navigatingTrash: 'Opening trash…',
  emptyingTrash: 'Emptying trash…',
}

const FILTER_LABELS: Record<PhotoType, string> = {
  photo: 'Photos',
  video: 'Videos',
  screenshot: 'Screenshots',
  animation: 'Animations',
  collage: 'Collages',
  unknown: 'Unknown',
}

export interface PanelOptions {
  /** AI 4K Restore wiring. Missing hides the entry point. */
  restore?: FinderRestore
  /** Where the Terms/Privacy acceptance lives. Defaults to localStorage. */
  policyStore?: PolicyConsentStore
}

export function mountPanel(container: HTMLElement, runner: PageRunner, options: PanelOptions = {}): void {
  if (document.getElementById(ROOT_ID)) return

  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = `
#${ROOT_ID} {
  --gp-font: Inter, "Noto Sans JP", "Noto Sans SC", "Noto Sans TC", system-ui, -apple-system, "Segoe UI", "Hiragino Sans", "PingFang SC", "PingFang TC", "Microsoft YaHei", sans-serif;
  --gp-paper: #F7F6F3; --gp-raised: #FFFFFF; --gp-sunken: #EDEBE6; --gp-ink: #1A1920; --gp-muted: #5C5A66; --gp-outline: #D6D3CC;
  --gp-accent: #4B32C3; --gp-on-accent: #FFFFFF; --gp-caution: #8A5300; --gp-caution-container: #FDF1DC; --gp-error: #B3261E;
  --gp-trash-ink: #C5281C; --gp-btn-border: transparent; --gp-shadow: 0 8px 24px rgba(26,25,32,0.16);
}
@media (prefers-color-scheme: dark) { #${ROOT_ID} {
  --gp-paper: #141318; --gp-raised: #1F1E25; --gp-sunken: #1F1E25; --gp-ink: #EDEBF2; --gp-muted: #A7A4B3; --gp-outline: #38363F;
  --gp-accent: #B7A9FF; --gp-on-accent: #1E1259; --gp-caution: #F2B45C; --gp-caution-container: #1F1E25; --gp-error: #FF8A7E;
  --gp-trash-ink: #FF8A7E; --gp-btn-border: #38363F; --gp-shadow: none;
} }
#${ROOT_ID} * { box-sizing: border-box; }
#${ROOT_ID} {
  position: fixed; bottom: 20px; right: 20px; z-index: 2147483646;
  width: 320px; max-height: 90vh; overflow-y: auto;
  background: var(--gp-paper); color: var(--gp-ink); border-radius: 12px;
  box-shadow: var(--gp-shadow); padding: 16px;
  font-family: var(--gp-font); font-size: 13px; line-height: 1.45; user-select: none; border: 1px solid var(--gp-outline);
}
#${ROOT_ID} button { cursor: pointer; border: 1px solid var(--gp-btn-border); border-radius: 8px; font: 600 13px/1.2 var(--gp-font); padding: 9px 12px; }
#${ROOT_ID} button:disabled { opacity: 0.45; cursor: not-allowed; }
#${ROOT_ID} button:focus-visible, #${ROOT_ID} input:focus-visible, #${ROOT_ID} select:focus-visible, #${ROOT_ID} a:focus-visible { outline: 2px solid var(--gp-accent); outline-offset: 2px; }
#${ROOT_ID} input[type=number], #${ROOT_ID} input[type=text], #${ROOT_ID} input[type=date], #${ROOT_ID} select {
  width: 100%; padding: 6px 10px; border-radius: 8px; border: 1px solid var(--gp-outline);
  background: var(--gp-raised); color: var(--gp-ink); font: 400 13px var(--gp-font); outline: none;
}
#${ROOT_ID} input[type=checkbox] { accent-color: var(--gp-accent); }
#${ROOT_ID} .gpdt-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 8px; }
#${ROOT_ID} .gpdt-row label { font-size: 12px; color: var(--gp-ink); }
#${ROOT_ID} .gpdt-row a { color: var(--gp-accent) !important; }
#${ROOT_ID} .gpdt-stats { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin: 12px 0; }
#${ROOT_ID} .gpdt-stat { background: var(--gp-sunken); border-radius: 8px; padding: 10px 12px; }
#${ROOT_ID} .gpdt-stat b { display: block; font-size: 20px; font-weight: 650; line-height: 1; letter-spacing: -0.01em; font-variant-numeric: tabular-nums; }
#${ROOT_ID} .gpdt-stat span { display: block; margin-top: 4px; font-size: 12px; font-weight: 600; color: var(--gp-muted); }
#${ROOT_ID} .gpdt-bar { height: 6px; background: var(--gp-sunken); border-radius: 9999px; overflow: hidden; margin: 8px 0; }
#${ROOT_ID} .gpdt-bar-fill { height: 100%; width: 0%; background: var(--gp-accent); border-radius: 9999px; transition: width 0.3s; }
#${ROOT_ID} .gpdt-bar-fill.indeterminate { width: 30%; animation: gpdt-slide 1.4s ease-in-out infinite; }
@keyframes gpdt-slide { 0% { transform: translateX(-100%); } 100% { transform: translateX(333%); } }
#${ROOT_ID} .gpdt-actions { display: flex; gap: 8px; }
#${ROOT_ID} .gpdt-actions button { flex: 1; }
#${ROOT_ID} .gpdt-start { background: var(--gp-accent); color: var(--gp-on-accent); border-color: var(--gp-accent); }
#${ROOT_ID} .gpdt-pause { background: var(--gp-sunken); color: var(--gp-ink); }
#${ROOT_ID} .gpdt-stop { background: #C5281C; color: #FFFFFF; border-color: #C5281C; }
#${ROOT_ID} .gpdt-ghost { background: var(--gp-sunken); color: var(--gp-ink); }
#${ROOT_ID} .gpdt-restore { display: flex; align-items: center; justify-content: center; gap: 6px; color: var(--gp-accent); background: var(--gp-raised); border-color: var(--gp-outline); }
#${ROOT_ID} .gpdt-warn { color: var(--gp-caution); font-size: 12px; line-height: 1.45; }
#${ROOT_ID} .gpdt-danger { color: var(--gp-trash-ink); font-size: 12px; line-height: 1.45; }
#${ROOT_ID} .gpdt-consent { background: var(--gp-caution-container); border-radius: 8px; padding: 12px; margin: 8px 0; }
#${ROOT_ID} .gpdt-consent label { display: flex; gap: 8px; align-items: flex-start; font-size: 12px; color: var(--gp-ink); }
#${ROOT_ID} .gpdt-footer { display: flex; gap: 8px; margin-top: 12px; flex-wrap: wrap; }
#${ROOT_ID} .gpdt-err { color: var(--gp-error); font-size: 12px; margin: 6px 0; word-break: break-word; }
#${ROOT_ID} .gpdt-note { color: var(--gp-muted); font-size: 12px; margin-top: 6px; line-height: 1.45; }
#${ROOT_ID} .gpdt-policy { margin: 8px 0; user-select: text; }
#${ROOT_ID}.minimized { width: 48px; height: 48px; padding: 0; border-radius: 9999px; overflow: hidden; }
#${ROOT_ID}.minimized > * { display: none; }
#${ROOT_ID}.minimized::after { content: '🗑️'; display: flex; align-items: center; justify-content: center; height: 100%; font-size: 20px; cursor: pointer; }
${POLICY_GATE_CSS.replace(/(^|\n)\.gpdt-policy/g, `$1#${ROOT_ID} .gpdt-policy`)}
`

  container.appendChild(style)

  const root = document.createElement('div')
  root.id = ROOT_ID
  root.innerHTML = `
    <div class="gpdt-row">
      <b style="font-size:15px;font-weight:600;line-height:1.3">Google Photos Delete Tool – Duplicate Finder &amp; Bulk Delete</b>
      <span>
        <button class="gpdt-ghost" id="gpdt-min" title="Minimize">−</button>
        <button class="gpdt-ghost" id="gpdt-close" title="Close">✕</button>
      </span>
    </div>
    <div class="gpdt-note" id="gpdt-scope"></div>
    <div class="gpdt-row">
      <label for="gpdt-max">Photos per batch</label>
      <input type="number" id="gpdt-max" value="500" min="1" max="2000" step="50" style="width:110px" />
    </div>
    <div class="gpdt-row">
      <label for="gpdt-dryrun">Dry run (count this view, no clicks)</label>
      <input type="checkbox" id="gpdt-dryrun" />
    </div>
    <div class="gpdt-row">
      <label for="gpdt-empty" title="Permanent — no recovery">Empty trash afterwards</label>
      <input type="checkbox" id="gpdt-empty" style="accent-color:#C5281C" />
    </div>
    <div id="gpdt-empty-warning" class="gpdt-danger" style="display:none">"Empty trash afterwards" is PERMANENT with no recovery.</div>
    <div class="gpdt-row">
      <label for="gpdt-filter">Filter (Pro)</label>
      <select id="gpdt-filter" style="width:150px" disabled>
        <option value="all">All items</option>
        <option value="screenshot">Screenshots</option>
        <option value="video">Videos</option>
        <option value="photo">Photos</option>
        <option value="animation">Animations</option>
        <option value="collage">Collages</option>
      </select>
    </div>
    <div class="gpdt-row">
      <label for="gpdt-date-mode">Date filter (Pro)</label>
      <select id="gpdt-date-mode" style="width:150px" disabled>
        <option value="off">Any date</option>
        <option value="before">Before a date</option>
        <option value="after">After a date</option>
        <option value="between">Between two dates</option>
      </select>
    </div>
    <div class="gpdt-row" id="gpdt-date-row" style="display:none">
      <input type="date" id="gpdt-date-a" style="width:120px" disabled aria-label="Date" />
      <input type="date" id="gpdt-date-b" style="width:120px; display:none" disabled aria-label="End date" />
    </div>
    <div class="gpdt-row" id="gpdt-date-pro" style="display:none">
      <a id="gpdt-date-pro-link" href="" target="_blank" rel="noopener" style="font-size:12px; white-space:nowrap">Pro: Get Pro</a>
    </div>
    <div class="gpdt-row">
      <label for="gpdt-preset">Saved presets (Pro)</label>
      <select id="gpdt-preset" style="width:150px" disabled></select>
    </div>
    <div class="gpdt-row">
      <button class="gpdt-ghost" id="gpdt-preset-apply" style="padding:6px 8px" disabled>Apply</button>
      <button class="gpdt-ghost" id="gpdt-preset-rename" style="padding:6px 8px" disabled>Rename</button>
      <button class="gpdt-ghost" id="gpdt-preset-delete" style="padding:6px 8px" disabled>Delete</button>
    </div>
    <div class="gpdt-row">
      <input type="text" id="gpdt-preset-name" placeholder="Preset name" maxlength="40" style="flex:1" disabled />
      <button class="gpdt-ghost" id="gpdt-preset-save" style="padding:6px 8px" disabled>Save current</button>
    </div>
    <div id="gpdt-preset-hint" class="gpdt-note" style="display:none"></div>
    <div id="gpdt-preset-err" class="gpdt-note" style="display:none"></div>
    <div class="gpdt-row" id="gpdt-preset-pro" style="display:none">
      <a id="gpdt-preset-pro-link" href="" target="_blank" rel="noopener" style="font-size:12px; white-space:nowrap">Pro: Get Pro</a>
    </div>
    <div class="gpdt-row">
      <label for="gpdt-license">Pro license</label>
      <span style="display:flex; gap:6px; width:100%">
        <input type="text" id="gpdt-license" placeholder="paste token" style="flex:1" />
        <button class="gpdt-ghost" id="gpdt-license-btn" style="padding:6px 8px">Activate</button>
      </span>
      <a id="gpdt-license-get" href="" target="_blank" rel="noopener" style="font-size:12px; white-space:nowrap">Get Pro — from US$19, one-time</a>
    </div>
    <div id="gpdt-license-status" class="gpdt-note"></div>
    <div id="gpdt-policy-slot"></div>
    <div class="gpdt-stats">
      <div class="gpdt-stat"><b id="gpdt-deleted">0</b><span>Deleted</span></div>
      <div class="gpdt-stat"><b id="gpdt-rate">—</b><span>Per minute</span></div>
      <div class="gpdt-stat"><b id="gpdt-elapsed">0s</b><span>Elapsed</span></div>
      <div class="gpdt-stat"><b id="gpdt-eta">—</b><span>ETA</span></div>
    </div>
    <div class="gpdt-bar"><div class="gpdt-bar-fill" id="gpdt-bar"></div></div>
    <div id="gpdt-status" class="gpdt-note" style="font-size:12px">Ready</div>
    <div id="gpdt-err" class="gpdt-err" style="display:none"></div>
    <div class="gpdt-actions">
      <button class="gpdt-start" id="gpdt-start">▶ Start</button>
      <button class="gpdt-pause" id="gpdt-pause" style="display:none">⏸ Pause</button>
      <button class="gpdt-start" id="gpdt-resume" style="display:none">▶ Resume</button>
      <button class="gpdt-stop" id="gpdt-stop" style="display:none">■ Stop</button>
    </div>
    <div id="gpdt-consent" class="gpdt-consent" style="display:none">
      <p class="gpdt-warn">This will move photos to Trash (recoverable for 60 days).</p>
      <p class="gpdt-danger" id="gpdt-consent-permanent" style="display:none">"Empty trash afterwards" is PERMANENT with no recovery.</p>
      <label><input type="checkbox" id="gpdt-consent-check" /> I understand, and I am on the Google Photos view I intend to clean.</label>
      <div class="gpdt-actions" style="margin-top:8px">
        <button class="gpdt-stop" id="gpdt-consent-confirm">Confirm & Start</button>
        <button class="gpdt-ghost" id="gpdt-consent-cancel">Cancel</button>
      </div>
    </div>
    <button class="gpdt-ghost" id="gpdt-dupes" style="width:100%;margin-top:8px">Find duplicates</button>
    <button class="gpdt-restore" id="gpdt-restore" style="width:100%;margin-top:8px;display:none"></button>
    <div id="gpdt-pro-teaser" style="display:none"></div>
    <div class="gpdt-footer">
      <button class="gpdt-ghost" id="gpdt-report">Report issue</button>
      <button class="gpdt-ghost" id="gpdt-copy" style="display:none">Copy summary</button>
      <button class="gpdt-ghost" id="gpdt-export" style="display:none">Export CSV (Pro)</button>
    </div>
  `
  container.appendChild(root)

  const $ = <T extends HTMLElement>(id: string): T => root.querySelector<T>(`#${id}`)!

  const maxInput = $<HTMLInputElement>('gpdt-max')
  const dryRunInput = $<HTMLInputElement>('gpdt-dryrun')
  const emptyInput = $<HTMLInputElement>('gpdt-empty')
  const emptyWarning = $<HTMLElement>('gpdt-empty-warning')
  const filterSelect = $<HTMLSelectElement>('gpdt-filter')
  const dateModeSelect = $<HTMLSelectElement>('gpdt-date-mode')
  const dateRow = $<HTMLElement>('gpdt-date-row')
  const dateA = $<HTMLInputElement>('gpdt-date-a')
  const dateB = $<HTMLInputElement>('gpdt-date-b')
  const datePro = $<HTMLElement>('gpdt-date-pro')
  // Copy A/B variant: stable per install in localStorage, "a" on any failure.
  let proVariant: ProVariant = 'a'
  const dateProLink = $<HTMLAnchorElement>('gpdt-date-pro-link')
  const licenseGetLink = $<HTMLAnchorElement>('gpdt-license-get')
  const setProLinks = (): void => {
    dateProLink.href = proUrl('date_filter', proVariant)
    licenseGetLink.href = proUrl('license_box', proVariant)
    $<HTMLAnchorElement>('gpdt-preset-pro-link').href = proUrl('presets', proVariant)
  }
  setProLinks()
  const variantReady = getProVariant({
    get: async () => window.localStorage.getItem(PRO_VARIANT_KEY),
    set: async (v) => window.localStorage.setItem(PRO_VARIANT_KEY, v),
  }).then((v) => { proVariant = v; setProLinks(); return v })
  const syncDateControls = (locked: boolean): void => {
    const off = locked || !pro
    dateModeSelect.disabled = off
    dateA.disabled = off
    dateB.disabled = off
    datePro.style.display = pro ? 'none' : 'flex'
    dateRow.style.display = dateModeSelect.value === 'off' ? 'none' : 'flex'
    dateB.style.display = dateModeSelect.value === 'between' ? 'block' : 'none'
  }
  dateModeSelect.addEventListener('change', () => syncDateControls(runningNow()))
  const licenseInput = $<HTMLInputElement>('gpdt-license')
  const licenseStatus = $<HTMLElement>('gpdt-license-status')
  const deletedEl = $<HTMLElement>('gpdt-deleted')
  const rateEl = $<HTMLElement>('gpdt-rate')
  const elapsedEl = $<HTMLElement>('gpdt-elapsed')
  const etaEl = $<HTMLElement>('gpdt-eta')
  const bar = $<HTMLElement>('gpdt-bar')
  const statusEl = $<HTMLElement>('gpdt-status')
  const errEl = $<HTMLElement>('gpdt-err')
  const startBtn = $<HTMLButtonElement>('gpdt-start')
  const pauseBtn = $<HTMLButtonElement>('gpdt-pause')
  const resumeBtn = $<HTMLButtonElement>('gpdt-resume')
  const stopBtn = $<HTMLButtonElement>('gpdt-stop')
  const consentBox = $<HTMLElement>('gpdt-consent')
  const consentCheck = $<HTMLInputElement>('gpdt-consent-check')
  const consentPermanent = $<HTMLElement>('gpdt-consent-permanent')
  const copyBtn = $<HTMLButtonElement>('gpdt-copy')
  const exportBtn = $<HTMLButtonElement>('gpdt-export')
  const proTeaserEl = $<HTMLElement>('gpdt-pro-teaser')
  const scopeEl = $<HTMLElement>('gpdt-scope')

  const admission = admitSurface(window.location.href)
  scopeEl.textContent = admission.ok
    ? `Action scope: ${describePhotosView(admission.view)}`
    : 'Open photos.google.com first.'

  let pro = false
  let teaserFor: unknown = null
  let pendingStart: PanelRunOptions | null = null

  // ─── Saved presets (Pro) ──────────────────────────────────────
  // Applying a preset only fills the controls; it never starts a run, so the
  // consent gate and the dry run are untouched. Nothing here runs on a timer.
  const presetSelect = $<HTMLSelectElement>('gpdt-preset')
  const presetName = $<HTMLInputElement>('gpdt-preset-name')
  const presetSave = $<HTMLButtonElement>('gpdt-preset-save')
  const presetApply = $<HTMLButtonElement>('gpdt-preset-apply')
  const presetRename = $<HTMLButtonElement>('gpdt-preset-rename')
  const presetDelete = $<HTMLButtonElement>('gpdt-preset-delete')
  const presetHint = $<HTMLElement>('gpdt-preset-hint')
  const presetErr = $<HTMLElement>('gpdt-preset-err')
  const presetPro = $<HTMLElement>('gpdt-preset-pro')
  const presets = createPresetManager(createLocalStoragePresetStore(), () => pro)
  let presetList: CleanupPreset[] = []
  const showPresetErr = (msg: string | null): void => {
    presetErr.textContent = msg ?? ''
    presetErr.style.display = msg ? 'block' : 'none'
  }
  const syncPresetControls = (locked: boolean): void => {
    const off = locked || !pro
    presetSelect.disabled = off || presetList.length === 0
    presetApply.disabled = presetRename.disabled = presetDelete.disabled = presetSelect.disabled
    presetName.disabled = off
    presetSave.disabled = off
    presetPro.style.display = pro ? 'none' : 'flex'
  }
  const renderPresetHint = (): void => {
    const p = presetList.find(x => x.id === presetSelect.value)
    const url = p ? presetViewHint(p, window.location.href) : null
    presetHint.textContent = url ? `Saved on ${url}. Open it yourself if you want that view.` : ''
    presetHint.style.display = url ? 'block' : 'none'
  }
  const renderPresets = async (selectId?: string): Promise<void> => {
    presetList = await presets.list()
    presetSelect.replaceChildren()
    if (presetList.length === 0) {
      const none = document.createElement('option')
      none.textContent = 'No saved presets'
      presetSelect.append(none)
    }
    for (const p of presetList) {
      const o = document.createElement('option')
      o.value = p.id
      o.textContent = p.name
      presetSelect.append(o)
    }
    if (selectId && presetList.some(p => p.id === selectId)) presetSelect.value = selectId
    syncPresetControls(runningNow())
    renderPresetHint()
  }
  const presetFailed = (r: { ok: boolean; error?: string }): boolean => {
    if (r.ok) return false
    showPresetErr(r.error ?? null)
    return true
  }
  presetSelect.addEventListener('change', () => {
    presetName.value = presetList.find(x => x.id === presetSelect.value)?.name ?? ''
    renderPresetHint()
  })
  presetSave.addEventListener('click', async () => {
    showPresetErr(null)
    const r = await presets.save(
      presetName.value,
      { type: filterSelect.value, dateMode: dateModeSelect.value, dateA: dateA.value, dateB: dateB.value },
      window.location.href,
    )
    if (presetFailed(r)) return
    presetName.value = ''
    await renderPresets(r.ok ? r.preset.id : undefined)
  })
  presetApply.addEventListener('click', async () => {
    showPresetErr(null)
    const r = await presets.apply(presetSelect.value)
    if (presetFailed(r) || !r.ok) return
    filterSelect.value = r.preset.type
    dateModeSelect.value = r.preset.dateMode
    dateA.value = r.preset.dateA
    dateB.value = r.preset.dateB
    syncDateControls(runningNow())
  })
  presetRename.addEventListener('click', async () => {
    showPresetErr(null)
    const id = presetSelect.value
    if (presetFailed(await presets.rename(id, presetName.value))) return
    await renderPresets(id)
  })
  presetDelete.addEventListener('click', async () => {
    showPresetErr(null)
    if (presetFailed(await presets.remove(presetSelect.value))) return
    presetName.value = ''
    await renderPresets()
  })

  // ─── Pro license ──────────────────────────────────────────────

  const refreshProState = async (): Promise<void> => {
    pro = await runner.isPro()
    if (!runningNow()) filterSelect.disabled = !pro
    syncDateControls(runningNow())
    await renderPresets()
    licenseStatus.textContent = pro
      ? 'Pro active — filters enabled.'
      : 'Free: unfiltered cleanup + dry-run counts. Filters require Pro.'
    const summary = runner.getSummary()
    exportBtn.style.display = summary && pro ? 'block' : 'none'
  }

  licenseInput.value = runner.getLicenseToken() ?? ''
  const policyStore = options.policyStore ?? localStoragePolicyStore()
  const policySlot = $<HTMLElement>('gpdt-policy-slot')
  $<HTMLButtonElement>('gpdt-license-btn').addEventListener('click', async () => {
    const token = licenseInput.value.trim()
    if (!token) return
    // Clickwrap on Pro activation, again whenever the terms version changes.
    if (!(await ensurePolicyConsent(policySlot, policyStore, 'gpdt_userscript'))) {
      licenseStatus.textContent = 'Pro was not activated. Agree to the updated terms to continue.'
      return
    }
    const accepted = await runner.setLicenseToken(token)
    licenseStatus.textContent = accepted
      ? '✓ License accepted locally — filters enabled.'
      : '✗ Invalid license token.'
    if (accepted) void refreshProState()
  })

  // ─── Consent gate ─────────────────────────────────────────────

  // GPDT-CONSENT: the permanent-action warning is presented the moment
  // the option is selected, before any run is admitted — independently
  // of whether the general consent is already stored.
  emptyInput.addEventListener('change', () => {
    emptyWarning.style.display = emptyInput.checked ? 'block' : 'none'
  })

  const readOptions = (): PanelRunOptions | null => {
    const parsed = parseInt(maxInput.value, 10)
    const built = buildFilterFromControls(filterSelect.value, pro ? dateModeSelect.value : 'off', dateA.value, dateB.value)
    if (!built.ok) {
      errEl.textContent = built.error
      errEl.style.display = 'block'
      return null
    }
    const filter = built.filter
    return {
      maxCount: Number.isFinite(parsed) && parsed > 0 ? parsed : 500,
      dryRun: dryRunInput.checked,
      emptyTrashAfter: emptyInput.checked,
      filter,
    }
  }

  const runningNow = (): boolean => runner.getStatus().running

  startBtn.addEventListener('click', () => {
    const opts = readOptions()
    if (!opts) return
    const admission = admitDestructiveRun({
      dryRun: opts.dryRun,
      emptyTrashAfter: opts.emptyTrashAfter,
      consent: { readable: true, acknowledged: runner.consentAcknowledged() },
      emptyTrashAck: { readable: true, acknowledged: runner.emptyTrashAcknowledged() },
    })
    if (!admission.ok) {
      pendingStart = opts
      consentPermanent.style.display = opts.emptyTrashAfter ? 'block' : 'none'
      consentCheck.checked = false
      consentBox.style.display = 'block'
      return
    }
    void runner.start(opts).catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err)
      errEl.textContent = msg
      errEl.style.display = 'block'
    })
  })

  $<HTMLButtonElement>('gpdt-consent-confirm').addEventListener('click', () => {
    if (!consentCheck.checked) return
    runner.acknowledgeConsent()
    if (pendingStart?.emptyTrashAfter) runner.acknowledgeEmptyTrash()
    consentBox.style.display = 'none'
    if (pendingStart) {
      void runner.start(pendingStart).catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err)
        errEl.textContent = msg
        errEl.style.display = 'block'
      })
      pendingStart = null
    }
  })

  $<HTMLButtonElement>('gpdt-consent-cancel').addEventListener('click', () => {
    consentBox.style.display = 'none'
    pendingStart = null
  })

  pauseBtn.addEventListener('click', () => runner.pause())
  resumeBtn.addEventListener('click', () => runner.resume())
  stopBtn.addEventListener('click', () => runner.stop())

  // ─── Find duplicates (review → the same consent-gated runner) ──

  const openFinder = (view: 'duplicates' | 'blurry'): void => {
    openDuplicateFinder({
      runDelete: async (ids, dryRun) => {
        let error: string | undefined
        // start() refuses (consent, run in progress) before its first await,
        // so a refusal has surfaced by the next macrotask.
        const run = runner
          .start({ maxCount: 500, dryRun, emptyTrashAfter: false, filter: { kind: 'ids', ids } })
          .catch((err: unknown) => { error = err instanceof Error ? err.message : String(err) })
        await Promise.race([run, sleep(0)])
        return error ? { ok: false, error } : { ok: true }
      },
      stopRun: () => runner.stop(),
      isPro: () => runner.isPro(),
      proVariant: () => variantReady,
      consentAcknowledged: async () => runner.consentAcknowledged(),
      acknowledgeConsent: async () => runner.acknowledgeConsent(),
      onRunProgress: (cb) => runner.onUpdate((s) => { if (s.progress) cb(s.progress) }),
      ...(options.restore ? { restore: options.restore } : {}),
    }, { view })
  }
  $<HTMLButtonElement>('gpdt-dupes').addEventListener('click', () => openFinder('duplicates'))

  // ─── AI 4K Restore (opens the Blurry / Low-Res review) ────────
  const restoreBtn = $<HTMLButtonElement>('gpdt-restore')
  if (options.restore) {
    restoreBtn.append(sparkleIcon(document, 14), RESTORE_LABEL)
    restoreBtn.style.display = 'flex'
    restoreBtn.addEventListener('click', () => openFinder(options.restore?.classify ? 'blurry' : 'duplicates'))
  }

  // ─── Issue report / report export ─────────────────────────────

  $<HTMLButtonElement>('gpdt-report').addEventListener('click', () => {
    window.open(runner.buildIssueUrl(), '_blank', 'noopener')
  })

  copyBtn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(runner.copySummaryText())
      statusEl.textContent = 'Summary copied to clipboard.'
    } catch {
      statusEl.textContent = 'Clipboard unavailable — copy from console instead.'
    }
  })

  exportBtn.addEventListener('click', () => runner.exportCsv())

  // ─── Minimize / close ─────────────────────────────────────────

  $<HTMLButtonElement>('gpdt-min').addEventListener('click', () => {
    root.classList.toggle('minimized')
  })
  root.addEventListener('click', (e) => {
    if (root.classList.contains('minimized') && (e.target as HTMLElement).id === ROOT_ID) {
      root.classList.remove('minimized')
    }
  })
  $<HTMLButtonElement>('gpdt-close').addEventListener('click', () => {
    runner.stop()
    root.remove()
    style.remove()
  })

  // ─── Progress rendering ───────────────────────────────────────

  const updateUI = (): void => {
    const s = runner.getStatus()
    const p: Progress | null = s.progress
    const running = s.running || (p !== null && ACTIVE_STATUSES.has(p.status))

    startBtn.style.display = running || s.paused ? 'none' : 'block'
    pauseBtn.style.display = running && !s.paused ? 'block' : 'none'
    resumeBtn.style.display = s.paused ? 'block' : 'none'
    stopBtn.style.display = running || s.paused ? 'block' : 'none'
    maxInput.disabled = running
    dryRunInput.disabled = running
    emptyInput.disabled = running
    filterSelect.disabled = running || !pro
    syncDateControls(running)
    syncPresetControls(running)

    if (!p) {
      statusEl.textContent = STATUS_TEXT.idle
      errEl.style.display = 'none'
      bar.classList.remove('indeterminate')
      bar.style.width = '0%'
      return
    }

    deletedEl.textContent = p.deleted.toLocaleString()
    const rate = Math.round(s.rate)
    rateEl.textContent = rate > 0 ? rate.toLocaleString() : '—'
    const elapsed = Date.now() - p.startedAt
    elapsedEl.textContent = formatElapsed(elapsed)

    // ETA is only honest when a total is known (dry-run) AND the run is
    // still active. Otherwise '—'.
    if (running && p.total && p.total > p.deleted && rate > 0) {
      etaEl.textContent = formatEta(((p.total - p.deleted) / rate) * 60_000)
    } else {
      etaEl.textContent = '—'
    }

    if (ACTIVE_STATUSES.has(p.status) || p.status === 'paused') {
      bar.classList.add('indeterminate')
      bar.style.width = ''
    } else if (p.status === 'done') {
      bar.classList.remove('indeterminate')
      bar.style.width = '100%'
    } else {
      bar.classList.remove('indeterminate')
      bar.style.width = '0%'
    }

    statusEl.textContent = STATUS_TEXT[p.status] ?? p.status
    if (p.error || endedWithNothingMoved(p)) {
      errEl.textContent = p.error ?? NOTHING_MOVED_TEXT
      errEl.style.display = 'block'
    } else {
      errEl.style.display = 'none'
    }

    // Post-dry-run report buttons.
    const summary = runner.getSummary()
    copyBtn.style.display = summary ? 'block' : 'none'
    exportBtn.style.display = summary && pro ? 'block' : 'none'
    if (!summary && teaserFor) {
      teaserFor = null
      renderProTeaser(proTeaserEl, null)
    }
    if (summary) {
      const counts = PHOTO_TYPES
        .map((t) => ({ t, n: summary.counts[t] }))
        .filter(c => c.n > 0)
        .map(c => `${FILTER_LABELS[c.t]}: ${c.n.toLocaleString()}`)
        .join(' · ')
      if (teaserFor !== summary) {
        teaserFor = summary
        renderProTeaser(proTeaserEl, buildDryRunTeaser(summary.counts, summary.total, pro, proVariant))
      }
      statusEl.textContent = summary.dateReport
        ? dateReportLine(summary.dateReport)
        : `Counted ${summary.total.toLocaleString()} · ${counts || 'all items'}`
    }
  }

  runner.onUpdate(updateUI)

  // One-time rate/share prompt after a successful real run (userscript:
  // flag in localStorage; rating link is the Chrome Web Store review page, hidden on Firefox and Edge).
  runner.onRunSettled((result) => {
    void claimPostRunPrompt(result, {
      isShown: async () => window.localStorage.getItem(POST_RUN_PROMPT_KEY) === '1',
      markShown: async () => window.localStorage.setItem(POST_RUN_PROMPT_KEY, '1'),
    }, detectBrowser(navigator.userAgent), pro, proVariant).then((prompt) => { if (prompt) showPostRunPrompt(prompt, container) })
  })
  void refreshProState()
}
