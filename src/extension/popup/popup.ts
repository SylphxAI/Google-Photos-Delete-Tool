import './popup.css'
import { setMarkup } from './set-markup'
import { formatElapsed } from '../../core/utils'
import { buildDiagnosticIssueUrl, type DiagnosticBlob } from '../../core/diagnostics'
import { verifyLicense } from '../../core/license'
import { licenseStatusText } from './license-status'
import { PRO_VARIANT_KEY, buildDryRunTeaser, countLabelTypes, getProVariant, proUrl, type ProVariant } from '../../core/pro-moments'
import { renderProTeaser } from '../../ui/pro-teaser/teaser'
import { TRASH_URL } from '../../core/empty-trash-baton'
import {
  admitSurface,
  isSupportedPhotosUrl,
  type PhotosView,
} from '../../core/surface'
import {
  CONSENT_KEY,
  EMPTY_TRASH_ACK_KEY,
  admitDestructiveRun,
  type Acknowledgement,
} from '../../core/consent'
import { createChromePresetStore, readProToken, writeProToken, storageGet, storageSet, tabsCreate, tabsQuery, tabsSendMessage } from '../api'
import { createPresetManager, presetViewHint, type CleanupPreset } from '../../core/presets'
import { buildFilterFromControls, type PhotoFilter } from '../../core/photo-filter'
import { ACTIVE_STATUSES, TERMINAL_STATUSES, type RunStatus } from '../../core/status'
import { endedWithNothingMoved } from '../../core/nothing-moved'
import {
  LOCALES,
  detectBrowserLocale,
  setLocale,
  getLocale,
  t,
  tHtml,
  applyTranslations,
  type LocaleCode,
  type I18nParams,
} from './i18n'
import { mountIcon } from './icons'

const LOG = '[gpdt:popup]'

// ─── DOM Elements ────────────────────────────────────────────────

const maxCountInput   = document.getElementById('max-count')      as HTMLInputElement
const dryRunInput     = document.getElementById('dry-run')        as HTMLInputElement
const emptyTrashInput = document.getElementById('empty-trash')    as HTMLInputElement
const emptyTrashWarning = document.getElementById('empty-trash-warning') as HTMLElement
const filterSelect    = document.getElementById('filter')         as HTMLSelectElement
const dateModeSelect  = document.getElementById('date-mode')      as HTMLSelectElement
const dateRow         = document.getElementById('date-row')       as HTMLElement
const dateAInput      = document.getElementById('date-a')         as HTMLInputElement
const dateBInput      = document.getElementById('date-b')         as HTMLInputElement
const dateProLink     = document.getElementById('date-pro')       as HTMLElement
const licenseGetLink  = document.getElementById('license-get')    as HTMLAnchorElement
const licenseInput    = document.getElementById('license-token')  as HTMLInputElement
const licenseBtn      = document.getElementById('license-btn')    as HTMLButtonElement
const licenseStatus   = document.getElementById('license-status') as HTMLElement
const consentBox      = document.getElementById('consent')        as HTMLElement
const consentCheck    = document.getElementById('consent-check')  as HTMLInputElement
const consentPermanent= document.getElementById('consent-permanent') as HTMLElement
const consentConfirm  = document.getElementById('consent-confirm') as HTMLButtonElement
const consentCancel   = document.getElementById('consent-cancel') as HTMLButtonElement
const startBtn        = document.getElementById('start-btn')      as HTMLButtonElement
const pauseBtn        = document.getElementById('pause-btn')      as HTMLButtonElement
const resumeBtn       = document.getElementById('resume-btn')     as HTMLButtonElement
const stopBtn         = document.getElementById('stop-btn')       as HTMLButtonElement
const statusDot       = document.getElementById('status-dot')     as HTMLElement
const statusText      = document.getElementById('status-text')    as HTMLElement
const scopeEl         = document.getElementById('scope')          as HTMLElement
const scopeLabel      = document.getElementById('scope-label')    as HTMLElement
const errorBar        = document.getElementById('error')          as HTMLElement
const errorText       = document.getElementById('error-text')     as HTMLElement
const progressFill    = document.getElementById('progress-fill')  as HTMLElement
const progressLabel   = document.getElementById('progress-label') as HTMLElement
const statDeleted     = document.getElementById('stat-deleted')   as HTMLElement
const statRate        = document.getElementById('stat-rate')      as HTMLElement
const statElapsed     = document.getElementById('stat-elapsed')   as HTMLElement
const statEta         = document.getElementById('stat-eta')       as HTMLElement
const settingsPanel   = document.getElementById('settings-panel') as HTMLElement
const noteEl          = document.getElementById('note')           as HTMLElement
const langTrigger     = document.getElementById('lang-trigger')   as HTMLButtonElement
const langMenu        = document.getElementById('lang-menu')      as HTMLUListElement
const langCodeLabel   = document.getElementById('lang-code')      as HTMLElement
const utilityRow      = document.getElementById('utility')        as HTMLElement
const copyBtn         = document.getElementById('copy-btn')       as HTMLButtonElement
const exportBtn       = document.getElementById('export-btn')     as HTMLButtonElement
const trashBtn        = document.getElementById('trash-btn')      as HTMLButtonElement
const reportBtn       = document.getElementById('report-btn')     as HTMLButtonElement
const dupesBtn        = document.getElementById('dupes-btn')      as HTMLButtonElement

// ─── Icon mounting (static set, attached once) ──────────────────

mountIcon('brand-icon',      'brand')
mountIcon('lang-icon',       'language')
mountIcon('lang-chevron',    'chevronDown')
mountIcon('error-icon',      'alertTriangle')
mountIcon('settings-icon',   'settings')
mountIcon('field-icon-max',  'hash')
mountIcon('field-icon-dry',  'flask')
mountIcon('field-icon-empty','trashX')
mountIcon('field-icon-filter','filter')
mountIcon('field-icon-date','filter')
mountIcon('field-icon-presets','filter')
mountIcon('field-icon-license','key')
mountIcon('start-icon',      'play')
mountIcon('pause-icon',      'pause')
mountIcon('resume-icon',     'play')
mountIcon('stop-icon',       'stop')

// ─── State ──────────────────────────────────────────────────────

type UIState = 'idle' | 'running' | 'paused'
let uiState: UIState = 'idle'
let startedAt = 0
let elapsedTimer: ReturnType<typeof setInterval> | null = null
let proActive = false
const proTeaserEl = document.getElementById('pro-teaser') as HTMLElement
const dateReportEl = document.getElementById('date-report') as HTMLElement
const showDateReport = (text: string | null): void => {
  dateReportEl.textContent = text ?? ''
  dateReportEl.classList.toggle('hidden', !text)
}
let lastReport: { total: number; labels: string[] } | null = null
let currentView: PhotosView | null = null
let currentTabUrl: string | null = null
let surfaceReady = false


// ─── Locale init ────────────────────────────────────────────────

function pickInitialLocale(stored: unknown): LocaleCode {
  if (typeof stored === 'string') {
    const known = LOCALES.find(l => l.code === stored)
    if (known) return known.code
  }
  return detectBrowserLocale()
}

function updateLangTriggerLabel(): void {
  langCodeLabel.textContent = getLocale().toUpperCase()
}

function renderLangMenu(): void {
  langMenu.replaceChildren(
    ...LOCALES.map((locale, idx) => {
      const li = document.createElement('li')
      li.className = 'lang-option'
      li.setAttribute('role', 'option')
      li.tabIndex = -1 // focus is moved programmatically
      li.dataset.code = locale.code
      li.dataset.idx = String(idx)
      if (locale.code === getLocale()) li.setAttribute('aria-selected', 'true')

      const label = document.createElement('span')
      label.className = 'lang-option-label'
      label.textContent = locale.label

      const code = document.createElement('span')
      code.className = 'lang-option-code'
      code.textContent = locale.code.toUpperCase()

      li.append(label, code)
      li.addEventListener('click', () => commitLocale(locale.code))
      return li
    }),
  )
}

function commitLocale(code: LocaleCode): void {
  applyLocale(code)
  closeLangMenu()
  langTrigger.focus()
}

function applyLocale(code: LocaleCode): void {
  setLocale(code)
  document.documentElement.lang = code
  applyTranslations(document, paramsFor)
  updateLangTriggerLabel()
  renderLangMenu()
  refreshStatusLabel()
  renderNote()
  renderScope()
  licenseInput.placeholder = t('settings.license.placeholder')
  storageSet({ locale: code }).catch(err =>
    console.warn(`${LOG} could not persist locale:`, err),
  )
}

// ─── Language menu (with keyboard a11y) ─────────────────────────

function getOptions(): HTMLElement[] {
  return [...langMenu.querySelectorAll<HTMLElement>('.lang-option')]
}

function focusOptionByIndex(idx: number): void {
  const opts = getOptions()
  if (opts.length === 0) return
  const wrapped = ((idx % opts.length) + opts.length) % opts.length
  opts[wrapped].focus()
}

function openLangMenu(): void {
  langMenu.classList.remove('hidden')
  langTrigger.setAttribute('aria-expanded', 'true')
  const opts = getOptions()
  const selectedIdx = opts.findIndex(o => o.getAttribute('aria-selected') === 'true')
  focusOptionByIndex(selectedIdx >= 0 ? selectedIdx : 0)
}

function closeLangMenu(): void {
  langMenu.classList.add('hidden')
  langTrigger.setAttribute('aria-expanded', 'false')
}

function toggleLangMenu(): void {
  if (langMenu.classList.contains('hidden')) openLangMenu()
  else closeLangMenu()
}

langTrigger.addEventListener('click', (e) => {
  e.stopPropagation()
  toggleLangMenu()
})

document.addEventListener('click', (e) => {
  if (langMenu.classList.contains('hidden')) return
  const target = e.target as Node
  if (!langMenu.contains(target) && !langTrigger.contains(target)) {
    closeLangMenu()
  }
})

langMenu.addEventListener('keydown', (e) => {
  const opts = getOptions()
  const focused = document.activeElement as HTMLElement | null
  const idx = focused ? opts.indexOf(focused) : -1

  switch (e.key) {
    case 'ArrowDown':
      e.preventDefault()
      focusOptionByIndex(idx + 1)
      break
    case 'ArrowUp':
      e.preventDefault()
      focusOptionByIndex(idx - 1)
      break
    case 'Home':
      e.preventDefault()
      focusOptionByIndex(0)
      break
    case 'End':
      e.preventDefault()
      focusOptionByIndex(opts.length - 1)
      break
    case 'Enter':
    case ' ': {
      e.preventDefault()
      const code = focused?.dataset.code as LocaleCode | undefined
      if (code) commitLocale(code)
      break
    }
    case 'Tab':
      closeLangMenu()
      break
  }
})

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !langMenu.classList.contains('hidden')) {
    e.preventDefault()
    closeLangMenu()
    langTrigger.focus()
  }
})

// ─── Settings persistence ───────────────────────────────────────

const readMaxCount = (): number => {
  const parsed = parseInt(maxCountInput.value, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 500
}

const saveSettings = (): void => {
  storageSet({
    maxCount: readMaxCount(),
    dryRun: dryRunInput.checked,
    emptyTrash: emptyTrashInput.checked,
    filter: filterSelect.value,
  }).catch(err => console.warn(`${LOG} settings persist failed:`, err))
}

maxCountInput.addEventListener('change', saveSettings)
dryRunInput.addEventListener('change', () => {
  saveSettings()
  refreshDryRunDependentFields()
})
emptyTrashInput.addEventListener('change', () => {
  saveSettings()
  refreshEmptyTrashWarning()
})
filterSelect.addEventListener('change', saveSettings)

// ─── Saved presets (Pro) ────────────────────────────────────────
// Applying a preset only fills the controls; it never starts a run, so the
// consent gate and the dry run are untouched. Nothing here runs on a timer.

const presetSelect   = document.getElementById('preset-select')    as HTMLSelectElement
const presetName     = document.getElementById('preset-name')      as HTMLInputElement
const presetSave     = document.getElementById('preset-save')      as HTMLButtonElement
const presetApply    = document.getElementById('preset-apply')     as HTMLButtonElement
const presetRename   = document.getElementById('preset-rename')    as HTMLButtonElement
const presetDelete   = document.getElementById('preset-delete')    as HTMLButtonElement
const presetViewHintEl = document.getElementById('preset-view-hint') as HTMLElement
const presetErrorEl  = document.getElementById('preset-error')     as HTMLElement
const presetProLink  = document.getElementById('preset-pro')       as HTMLElement
const presets = createPresetManager(createChromePresetStore(), () => proActive)
let presetList: CleanupPreset[] = []

function showPresetError(msg: string | null): void {
  presetErrorEl.textContent = msg ?? ''
  presetErrorEl.classList.toggle('hidden', !msg)
}

function renderPresetHint(): void {
  const preset = presetList.find(p => p.id === presetSelect.value)
  const url = preset ? presetViewHint(preset, currentTabUrl) : null
  presetViewHintEl.textContent = url ? tHtml('settings.presets.viewHint', { url }) : ''
  presetViewHintEl.classList.toggle('hidden', !url)
}

async function renderPresets(selectId?: string): Promise<void> {
  presetList = await presets.list()
  presetSelect.replaceChildren()
  if (presetList.length === 0) {
    const none = document.createElement('option')
    none.textContent = t('settings.presets.none')
    presetSelect.append(none)
  }
  for (const p of presetList) {
    const o = document.createElement('option')
    o.value = p.id
    o.textContent = p.name
    presetSelect.append(o)
  }
  if (selectId && presetList.some(p => p.id === selectId)) presetSelect.value = selectId
  refreshDryRunDependentFields()
  renderPresetHint()
}

const presetFailed = (r: { ok: boolean; error?: string }): boolean => {
  if (r.ok) return false
  showPresetError(r.error ?? null)
  return true
}

presetSelect.addEventListener('change', () => {
  const p = presetList.find(x => x.id === presetSelect.value)
  presetName.value = p?.name ?? ''
  renderPresetHint()
})
presetSave.addEventListener('click', async () => {
  showPresetError(null)
  const r = await presets.save(
    presetName.value,
    { type: filterSelect.value, dateMode: dateModeSelect.value, dateA: dateAInput.value, dateB: dateBInput.value },
    currentTabUrl,
  )
  if (presetFailed(r)) return
  presetName.value = ''
  await renderPresets(r.ok ? r.preset.id : undefined)
})
presetApply.addEventListener('click', async () => {
  showPresetError(null)
  const r = await presets.apply(presetSelect.value)
  if (presetFailed(r) || !r.ok) return
  const p = r.preset
  filterSelect.value = p.type
  dateModeSelect.value = p.dateMode
  dateAInput.value = p.dateA
  dateBInput.value = p.dateB
  saveSettings()
  refreshDryRunDependentFields()
})
presetRename.addEventListener('click', async () => {
  showPresetError(null)
  const id = presetSelect.value
  if (presetFailed(await presets.rename(id, presetName.value))) return
  await renderPresets(id)
})
presetDelete.addEventListener('click', async () => {
  showPresetError(null)
  if (presetFailed(await presets.remove(presetSelect.value))) return
  presetName.value = ''
  await renderPresets()
})

// ─── Pro license ────────────────────────────────────────────────

async function refreshProState(): Promise<void> {
  let token: string | null = null
  try {
    token = await readProToken()
  } catch (err) {
    console.warn(`${LOG} pro token read failed:`, err)
  }
  licenseInput.value = token ?? ''
  if (!token) {
    proActive = false
    licenseStatus.textContent = t('settings.license.hint')
    licenseStatus.className = 'license-status'
  } else {
    const result = await verifyLicense(token)
    proActive = result.ok
    licenseStatus.textContent = licenseStatusText(result)
    licenseStatus.className = result.ok ? 'license-status ok' : 'license-status bad'
  }
  refreshDryRunDependentFields()
  void renderPresets()
}

licenseBtn.addEventListener('click', async () => {
  const token = licenseInput.value.trim()
  if (!token) return
  const result = await verifyLicense(token)
  if (!result.ok) {
    licenseStatus.textContent = licenseStatusText(result)
    licenseStatus.className = 'license-status bad'
    return
  }
  try {
    await writeProToken(token)
  } catch (err) {
    console.warn(`${LOG} pro token persist failed:`, err)
  }
  licenseStatus.textContent = t('settings.license.active')
  licenseStatus.className = 'license-status ok'
  proActive = true
  refreshDryRunDependentFields()
  void renderPresets()
})

// ─── Content-script communication ───────────────────────────────

const sendToContent = async (message: Record<string, unknown>): Promise<unknown> => {
  const [tab] = await tabsQuery({ active: true, currentWindow: true })
  if (!tab?.id || !isSupportedPhotosUrl(tab.url)) {
    showNote('notes.navigateFirst')
    return null
  }
  try {
    const res = await tabsSendMessage(tab.id, message)
    hideNote()
    return res
  } catch (err) {
    console.warn(`${LOG} sendMessage rejected:`, err)
    showNote('notes.navigateFirst')
    return null
  }
}

// ─── UI state ───────────────────────────────────────────────────

const setUIState = (state: UIState): void => {
  uiState = state

  startBtn.classList.toggle('hidden',  state !== 'idle')
  pauseBtn.classList.toggle('hidden',  state !== 'running')
  resumeBtn.classList.toggle('hidden', state !== 'paused')
  stopBtn.classList.toggle('hidden',   state === 'idle')

  dryRunInput.disabled     = state !== 'idle'
  settingsPanel.classList.toggle('disabled', state !== 'idle')
  refreshDryRunDependentFields()

  if (state === 'running') startElapsedTimer()
  else if (state === 'idle') stopElapsedTimer()
}

/**
 * Fields that depend on dry-run / engine / Pro state.
 * maxCount + emptyTrash only matter for real runs; filter needs Pro.
 */
const refreshDryRunDependentFields = (): void => {
  const lockedByEngine = uiState !== 'idle'
  const lockedByDryRun = dryRunInput.checked
  maxCountInput.disabled   = lockedByEngine || lockedByDryRun
  emptyTrashInput.disabled = lockedByEngine || lockedByDryRun
  filterSelect.disabled    = lockedByEngine || !proActive
  dateModeSelect.disabled  = lockedByEngine || !proActive
  dateAInput.disabled      = lockedByEngine || !proActive
  dateBInput.disabled      = lockedByEngine || !proActive
  dateProLink.classList.toggle('hidden', proActive)
  const presetsLocked = lockedByEngine || !proActive
  presetSelect.disabled = presetsLocked || presetList.length === 0
  presetName.disabled = presetsLocked
  presetSave.disabled = presetsLocked
  presetApply.disabled = presetRename.disabled = presetDelete.disabled = presetSelect.disabled
  presetProLink.classList.toggle('hidden', proActive)
  const mode = dateModeSelect.value
  dateRow.classList.toggle('hidden', mode === 'off')
  dateBInput.classList.toggle('hidden', mode !== 'between')
}

dateModeSelect.addEventListener('change', refreshDryRunDependentFields)

// ─── Trusted HTML fragments for i18n ────────────────────────────

const I18N_HTML_PARAMS: Readonly<Record<string, I18nParams>> = {
  'notes.navigateFirst': {
    url: '<a href="https://photos.google.com/" target="_blank" rel="noopener">photos.google.com</a>',
  },
}

const paramsFor = (key: string): I18nParams | undefined => I18N_HTML_PARAMS[key]

const renderNote = (): void => {
  const key = noteEl.dataset.noteKey
  if (!key) return
  setMarkup(noteEl, tHtml(key, paramsFor(key)))
}

const showNote = (key: string): void => {
  noteEl.dataset.noteKey = key
  renderNote()
  noteEl.classList.remove('hidden')
}
const hideNote = (): void => { noteEl.classList.add('hidden') }

function viewLabel(view: PhotosView): string {
  if (view.kind === 'other') return t('scope.other', { path: view.path })
  const kind = t(`scope.${view.kind}`)
  return view.target ? `${kind} · ${view.target}` : kind
}

function renderScope(): void {
  if (!currentView) {
    scopeEl.classList.add('hidden')
    scopeLabel.textContent = ''
    return
  }
  scopeLabel.textContent = t('scope.actingOn', { view: viewLabel(currentView) })
  scopeEl.classList.remove('hidden')
}

async function refreshSurfaceAdmission(): Promise<void> {
  try {
    const [tab] = await tabsQuery({ active: true, currentWindow: true })
    const admission = admitSurface(tab?.url)
    currentTabUrl = tab?.url ?? null
    void renderPresets()
    if (!admission.ok) {
      surfaceReady = false
      currentView = null
      startBtn.disabled = true
      renderScope()
      showNote('notes.navigateFirst')
      return
    }
    surfaceReady = true
    currentView = admission.view
    if (uiState === 'idle') startBtn.disabled = false
    renderScope()
    hideNote()
  } catch (err) {
    console.warn(`${LOG} surface admission failed:`, err)
    surfaceReady = false
    currentView = null
    startBtn.disabled = true
    renderScope()
    showNote('notes.navigateFirst')
  }
}
const showError = (msg: string): void => { errorText.textContent = msg; errorBar.classList.remove('hidden') }
const hideError = (): void => { errorBar.classList.add('hidden') }

// ─── Elapsed timer ──────────────────────────────────────────────

const startElapsedTimer = (): void => {
  stopElapsedTimer()
  elapsedTimer = setInterval(() => {
    if (startedAt > 0) statElapsed.textContent = formatElapsed(Date.now() - startedAt)
  }, 1000)
}
const stopElapsedTimer = (): void => {
  if (elapsedTimer !== null) { clearInterval(elapsedTimer); elapsedTimer = null }
}

// ─── Consent gate ───────────────────────────────────────────────

/**
 * The permanent-action warning for "Empty trash afterwards" is shown
 * the moment the option is selected, before any run is admitted —
 * independently of whether the general consent is already stored.
 */
const refreshEmptyTrashWarning = (): void => {
  emptyTrashWarning.classList.toggle('hidden', !emptyTrashInput.checked)
}

async function readPopupAcknowledgement(key: string): Promise<Acknowledgement> {
  try {
    const data = await storageGet([key])
    return { readable: true, acknowledged: data[key] === true }
  } catch {
    return { readable: false, acknowledged: false }
  }
}

async function acknowledgeConsent(): Promise<void> {
  try {
    await storageSet({ [CONSENT_KEY]: true })
  } catch (err) {
    console.warn(`${LOG} consent persist failed:`, err)
  }
}

async function acknowledgeEmptyTrash(): Promise<void> {
  try {
    await storageSet({ [EMPTY_TRASH_ACK_KEY]: true })
  } catch (err) {
    console.warn(`${LOG} empty-trash consent persist failed:`, err)
  }
}

let pendingStart: { maxCount: number; dryRun: boolean; emptyTrashAfter: boolean; filter: PhotoFilter } | null = null

consentConfirm.addEventListener('click', async () => {
  if (!consentCheck.checked) return
  // Await the storage writes: the content-script gate reads these keys
  // again when it admits the run, so starting before the writes land
  // would spuriously refuse the run.
  await acknowledgeConsent()
  if (pendingStart?.emptyTrashAfter) await acknowledgeEmptyTrash()
  consentBox.classList.add('hidden')
  const start = pendingStart
  pendingStart = null
  if (start) {
    void doStart(start)
  }
})

consentCancel.addEventListener('click', () => {
  consentBox.classList.add('hidden')
  pendingStart = null
})

// ─── Button handlers ────────────────────────────────────────────

const readFilter = (): { ok: true; filter: PhotoFilter } | { ok: false; error: string } =>
  buildFilterFromControls(filterSelect.value, proActive ? dateModeSelect.value : 'off', dateAInput.value, dateBInput.value)

startBtn.addEventListener('click', async () => {
  if (uiState !== 'idle' || !surfaceReady) return
  startBtn.disabled = true
  try {
    const built = readFilter()
    if (!built.ok) {
      showError(built.error)
      return
    }
    const opts = {
      maxCount: readMaxCount(),
      dryRun: dryRunInput.checked,
      emptyTrashAfter: emptyTrashInput.checked,
      filter: built.filter,
    }
    saveSettings()
    hideError()

    const admission = admitDestructiveRun({
      dryRun: opts.dryRun,
      emptyTrashAfter: opts.emptyTrashAfter,
      consent: await readPopupAcknowledgement(CONSENT_KEY),
      emptyTrashAck: await readPopupAcknowledgement(EMPTY_TRASH_ACK_KEY),
    })
    if (!admission.ok) {
      pendingStart = opts
      consentPermanent.classList.toggle('hidden', !opts.emptyTrashAfter)
      consentCheck.checked = false
      consentBox.classList.remove('hidden')
      return
    }

    await doStart(opts)
  } finally {
    startBtn.disabled = !surfaceReady || uiState !== 'idle'
  }
})

const doStart = async (opts: { maxCount: number; dryRun: boolean; emptyTrashAfter: boolean; filter: PhotoFilter }): Promise<void> => {
  const res = await sendToContent({
    action: 'start',
    maxCount: opts.maxCount,
    dryRun: opts.dryRun,
    emptyTrashAfter: opts.emptyTrashAfter,
    filter: opts.filter,
  })
  if (res === null) return // not on photos.google.com; note already shown
  if (typeof res === 'object' && res !== null && (res as { ok?: boolean }).ok === false) {
    const msg = (res as { error?: string }).error ?? t('status.consentRequired')
    showError(msg)
    if (msg.toLowerCase().includes('consent')) {
      consentBox.classList.remove('hidden')
    }
    return
  }
  setUIState('running')
}

pauseBtn .addEventListener('click', async () => { await sendToContent({ action: 'pause' });  setUIState('paused')  })
resumeBtn.addEventListener('click', async () => { await sendToContent({ action: 'resume' }); setUIState('running') })
stopBtn  .addEventListener('click', async () => { await sendToContent({ action: 'stop' });   setUIState('idle')    })

// ─── Utility row ────────────────────────────────────────────────

// Find duplicates: the review runs in the Google Photos tab, so close the popup.
dupesBtn.addEventListener('click', async () => {
  const res = await sendToContent({ action: 'findDuplicates' })
  if ((res as { ok?: boolean } | null)?.ok) window.close()
})

reportBtn.addEventListener('click', async () => {
  const res = await sendToContent({ action: 'diagnostics' })
  if (!res || typeof res !== 'object') return
  const blob = (res as { blob?: unknown }).blob
  if (!blob) return
  // Merge popup-side info (license state is local to the popup).
  const merged = { ...(blob as object), pro: proActive }
  const url = buildDiagnosticIssueUrl(merged as unknown as DiagnosticBlob)
  void tabsCreate({ url })
})

copyBtn.addEventListener('click', async () => {
  if (!lastReport) return
  const lines = [
    `Google Photos Delete Tool — dry-run: ${lastReport.total} item(s) found`,
    ...Object.entries(countByType(lastReport.labels)).map(([k, v]) => `${k}: ${v}`),
  ]
  try {
    await navigator.clipboard.writeText(lines.join('\n'))
    showNote('')
    noteEl.textContent = 'Summary copied.'
    noteEl.classList.remove('hidden')
  } catch (err) {
    console.warn(`${LOG} clipboard failed:`, err)
  }
})

exportBtn.addEventListener('click', () => {
  if (!lastReport || !proActive) return
  const rows = ['label', ...lastReport.labels.map(l => `"${l.replace(/"/g, '""')}"`)].join('\n')
  const blob = new Blob([rows], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `gpdt-dry-run-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
})

trashBtn.addEventListener('click', () => {
  void tabsCreate({ url: TRASH_URL })
})

function countByType(labels: string[]): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const label of labels) {
    const key = label.split(/[-–—]/)[0]?.trim().toLowerCase() || 'unknown'
    counts[key] = (counts[key] ?? 0) + 1
  }
  return counts
}

// ─── Resume state from content script ───────────────────────────

async function queryInitialStatus(): Promise<void> {
  const res = await sendToContent({ action: 'status' })
  if (!res) return
  const status = res as {
    running: boolean
    paused: boolean
    progress?: ProgressMessageData | null
    progressAsOf?: number
  }

  if (status.progress) {
    if (typeof status.progressAsOf === 'number' && status.progressAsOf > 0) {
      progressAsOf = status.progressAsOf
    }
    applyProgressUpdate(status.progress)
  }

  if (uiState !== 'idle') return
  if (status.paused) setUIState('paused')
  else if (status.running) setUIState('running')
}

// ─── Progress updates ───────────────────────────────────────────

let lastStatus: string = 'idle'

const STATUS_DOT: Record<string, string> = {
  selecting:       'running',
  deleting:        'running',
  scrolling:       'running',
  navigatingTrash: 'running',
  emptyingTrash:   'running',
  paused:          'paused',
  done:            'done',
  error:           'error',
  idle:            '',
}

function refreshStatusLabel(): void {
  const key = `status.${lastStatus}` as const
  statusText.textContent = t(key)
}

interface ProgressMessageData {
  deleted: number
  status: string
  startedAt?: number
  total?: number
  nothingMoved?: boolean
  error?: string
}

let progressAsOf = 0

function applyProgressUpdate(data: ProgressMessageData): void {
  const { deleted, status, startedAt: msgStartedAt, error } = data

  if (typeof msgStartedAt === 'number' && msgStartedAt > 0) {
    startedAt = msgStartedAt
  }

  lastStatus = String(status)
  refreshStatusLabel()
  statusDot.className = `status-dot ${STATUS_DOT[status] ?? ''}`.trim()

  if (error) showError(String(error))
  else if (endedWithNothingMoved({ status: status as RunStatus, deleted, nothingMoved: data.nothingMoved })) showError(t('status.nothingMoved'))
  else hideError()

  // Indeterminate bar: maxCount is a *batch* size, not a deletion
  // target, so a percentage would be fabricated. Full on done, empty
  // otherwise. The deleted count is the meaningful number.
  if (status === 'done') {
    progressFill.classList.remove('indeterminate')
    progressFill.style.width = '100%'
  } else if (ACTIVE_STATUSES.has(status as RunStatus) || status === 'paused') {
    progressFill.classList.add('indeterminate')
    progressFill.style.width = ''
  } else {
    progressFill.classList.remove('indeterminate')
    progressFill.style.width = '0%'
  }
  progressLabel.textContent = Number(deleted).toLocaleString()

  statDeleted.textContent = Number(deleted).toLocaleString()

  if (deleted > 0 && startedAt > 0) {
    const useAsOf = TERMINAL_STATUSES.has(status as RunStatus) && progressAsOf > 0
    const elapsed = useAsOf ? progressAsOf - startedAt : Date.now() - startedAt
    const rate = Math.round(deleted / (elapsed / 60_000))
    statRate.textContent = rate.toLocaleString()
    statElapsed.textContent = formatElapsed(elapsed)
    // ETA is only honest with a known total (dry-run) — otherwise '—'.
    statEta.textContent = '—'
  }

  // Utility row: after a finished dry-run, offer summary/export/trash.
  if (status === 'done') {
    utilityRow.classList.remove('hidden')
    void refreshReport()
  } else if (TERMINAL_STATUSES.has(status as RunStatus)) {
    utilityRow.classList.add('hidden')
    lastReport = null
    showDateReport(null)
    renderProTeaser(proTeaserEl, null)
  } else {
    renderProTeaser(proTeaserEl, null)
  }

  // State transitions
  if (status === 'done' || status === 'error') setUIState('idle')
  else if (status === 'paused') setUIState('paused')
  else if (uiState !== 'running' && status !== 'idle') setUIState('running')
}

/** The date-filter result line in the popup's locale (core's dateReportLine stays English for the userscript). */
function localDateReportLine(report: { matched: number; skippedUnreadable: number; total: number }): string {
  const n = (v: number): number | string => v.toLocaleString(getLocale())
  const base = t('settings.dateFilter.report', { matched: n(report.matched), total: n(report.total) })
  return report.skippedUnreadable > 0
    ? `${base} ${t('settings.dateFilter.reportSkipped', { skipped: n(report.skippedUnreadable) })}`
    : base
}

async function refreshReport(): Promise<void> {
  const res = await sendToContent({ action: 'report' })
  if (!res || typeof res !== 'object') return
  const dateReport = (res as { dateReport?: { matched: number; skippedUnreadable: number; total: number } | null }).dateReport
  showDateReport(dateReport ? localDateReportLine(dateReport) : null)
  const summary = (res as { summary?: { total: number; labels: string[] } | null }).summary
  if (summary && summary.labels.length > 0) {
    lastReport = summary
    exportBtn.classList.toggle('hidden', !proActive)
    // Free users: show what a type filter would act on. Real runs have no
    // dry-run labels, so no summary and no teaser.
    renderProTeaser(proTeaserEl, buildDryRunTeaser(countLabelTypes(summary.labels), summary.labels.length, proActive, proVariant))
  } else {
    renderProTeaser(proTeaserEl, null)
  }
}

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type !== 'progress') return
  progressAsOf = 0
  applyProgressUpdate(message.data)
})

// ─── Bootstrap ──────────────────────────────────────────────────

// Copy A/B variant (stable per install, chrome.storage.local; "a" on any failure).
let proVariant: ProVariant = 'a'
void getProVariant({
  get: async () => (await storageGet([PRO_VARIANT_KEY]))[PRO_VARIANT_KEY],
  set: (v) => storageSet({ [PRO_VARIANT_KEY]: v }),
}).then((v) => {
  proVariant = v
  ;(dateProLink as HTMLAnchorElement).href = proUrl('date_filter', v)
  licenseGetLink.href = proUrl('license_box', v)
  ;(presetProLink as HTMLAnchorElement).href = proUrl('presets', v)
})

void (async () => {
  let data: Record<string, unknown> = {}
  try {
    data = await storageGet(['maxCount', 'dryRun', 'emptyTrash', 'filter', 'locale'])
  } catch (err) {
    console.warn(`${LOG} storage.get failed, applying defaults:`, err)
  }
  applyLocale(pickInitialLocale(data?.locale))
  if (typeof data?.maxCount === 'number' && data.maxCount > 0) {
    maxCountInput.value = String(data.maxCount)
  }
  if (data?.dryRun) dryRunInput.checked = true
  if (data?.emptyTrash) emptyTrashInput.checked = true
  if (typeof data?.filter === 'string' && ['all', 'screenshot', 'video', 'photo', 'animation', 'collage'].includes(data.filter)) {
    filterSelect.value = data.filter
  }
  refreshDryRunDependentFields()
  refreshEmptyTrashWarning()
  void refreshProState()
  void refreshSurfaceAdmission()
  void queryInitialStatus()
})()
