/**
 * Terms and Privacy clickwrap with versioned re-consent.
 *
 * A paid action (Pro activation, credit checkout) or an AI restore is
 * admitted only when the stored acceptance names the current terms and
 * privacy versions. The gate is affirmative: an unchecked box, a button that
 * stays disabled until it is ticked, and a record that is written and read
 * back before the action proceeds. Anything unreadable counts as not
 * accepted, so a broken store re-prompts instead of skipping the gate.
 *
 * Versions, record shape and the acceptance rule belong to
 * `src/core/consent.ts`; this module is the store-agnostic gate and its UI.
 * The record stays on this device (chrome.storage.local in the extension,
 * localStorage in the userscript). `user_id` is a random local id unless the
 * caller passes a wallet account id.
 */
import {
  CURRENT_PRIVACY_VERSION, CURRENT_TERMS_VERSION, POLICY_CONSENT_KEY,
  isValidConsentRecord, needsPolicyReconsent,
  type ConsentRecord, type ConsentSurface,
} from '../../core/consent'

export { CURRENT_TERMS_VERSION, CURRENT_PRIVACY_VERSION, POLICY_CONSENT_KEY }
export const TERMS_URL = 'https://sylphxai.github.io/Google-Photos-Delete-Tool/terms.html'
export const PRIVACY_URL = 'https://sylphxai.github.io/Google-Photos-Delete-Tool/privacy.html'

export type PolicySurface = Extract<ConsentSurface, 'gpdt_extension' | 'gpdt_userscript' | 'gpdt_web_activate'>

/** What this gate writes: the core record, always with a local id. */
export type PolicyConsentRecord = ConsentRecord & { user_id: string }

/** Raw read and write; `read` returns whatever is stored (or undefined). */
export interface PolicyConsentStore {
  read(): Promise<unknown>
  write(record: PolicyConsentRecord): Promise<void>
}

/** True only for a well-formed record that covers the current versions (core rule). */
export function policyAccepted(raw: unknown): boolean {
  return isValidConsentRecord(raw) && !needsPolicyReconsent(raw)
}

export async function readPolicyAccepted(store: PolicyConsentStore): Promise<boolean> {
  try {
    return policyAccepted(await store.read())
  } catch {
    return false
  }
}

function localId(): string {
  const c = (globalThis as { crypto?: Crypto }).crypto
  if (c && typeof c.randomUUID === 'function') return c.randomUUID()
  const bytes = new Uint8Array(16)
  if (c && typeof c.getRandomValues === 'function') c.getRandomValues(bytes)
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Write the current acceptance and read it back. Resolves true only when the
 * stored record now passes {@link policyAccepted}; the caller must not
 * proceed otherwise.
 */
export async function savePolicyConsent(
  store: PolicyConsentStore,
  surface: PolicySurface,
  userId?: string,
  now: () => Date = () => new Date(),
): Promise<boolean> {
  try {
    const prev = await store.read().catch(() => undefined)
    const prevId = prev && typeof prev === 'object' ? (prev as { user_id?: unknown }).user_id : undefined
    const record: PolicyConsentRecord = {
      user_id: userId || (typeof prevId === 'string' && prevId ? prevId : localId()),
      terms_version: CURRENT_TERMS_VERSION,
      privacy_version: CURRENT_PRIVACY_VERSION,
      accepted_at: now().toISOString(),
      surface,
    }
    await store.write(record)
    return policyAccepted(await store.read())
  } catch {
    return false
  }
}

/** localStorage-backed store for the userscript panel and the site. */
export function localStoragePolicyStore(storage: Storage = window.localStorage): PolicyConsentStore {
  return {
    read: async () => {
      const raw = storage.getItem(POLICY_CONSENT_KEY)
      return raw ? (JSON.parse(raw) as unknown) : undefined
    },
    write: async (record) => storage.setItem(POLICY_CONSENT_KEY, JSON.stringify(record)),
  }
}

// ─── Gate UI ────────────────────────────────────────────────────

/**
 * Styles for the gate, scoped by class so the same markup works inside a
 * shadow root (studio, finder) and in the popup document.
 */
export const POLICY_GATE_CSS = `
.gpdt-policy { display: grid; gap: 12px; padding: 16px; border-radius: 12px; border: 1px solid var(--gp-outline, #D6D3CC);
  background: var(--gp-raised, #FFFFFF); color: var(--gp-ink, #1A1920); font: 400 14px/1.5 var(--gp-font, Inter, system-ui, sans-serif); text-align: left; }
.gpdt-policy h2 { margin: 0; font-size: 15px; font-weight: 600; line-height: 1.3; }
.gpdt-policy p, .gpdt-policy ul { margin: 0; }
.gpdt-policy ul { padding-left: 18px; display: grid; gap: 4px; }
.gpdt-policy .gpdt-policy-muted { color: var(--gp-muted, #5C5A66); font-size: 12px; line-height: 1.45; }
.gpdt-policy a { color: var(--gp-accent, #4B32C3); text-underline-offset: 2px; }
.gpdt-policy label { display: flex; gap: 8px; align-items: flex-start; font-size: 13px; cursor: pointer; }
.gpdt-policy input[type=checkbox] { margin: 2px 0 0; width: 16px; height: 16px; accent-color: var(--gp-accent, #4B32C3); flex: none; }
.gpdt-policy .gpdt-policy-actions { display: flex; gap: 8px; justify-content: flex-end; }
.gpdt-policy button { height: 40px; padding: 0 16px; border: 0; border-radius: 8px; font: 600 13px/1.2 inherit; font-family: inherit; cursor: pointer; }
.gpdt-policy button:disabled { opacity: .45; cursor: not-allowed; }
.gpdt-policy button:focus-visible, .gpdt-policy input:focus-visible, .gpdt-policy a:focus-visible { outline: 2px solid var(--gp-accent, #4B32C3); outline-offset: 2px; }
.gpdt-policy .gpdt-policy-agree { background: var(--gp-accent, #4B32C3); color: var(--gp-on-accent, #FFFFFF); }
.gpdt-policy .gpdt-policy-cancel { background: var(--gp-sunken, #EDEBE6); color: var(--gp-ink, #1A1920); }
.gpdt-policy .gpdt-policy-err { color: var(--gp-error, #B3261E); font-size: 12px; }
`

export interface PolicyGateOptions {
  store: PolicyConsentStore
  surface: PolicySurface
  userId?: string
  /** Called after the record is written and read back. */
  onAccepted: () => void
  onCancel: () => void
}

let gateSeq = 0

/** The clickwrap card. Mount it where the blocked action was. */
export function renderPolicyGate(doc: Document, opts: PolicyGateOptions): HTMLElement {
  const id = `gpdt-policy-${++gateSeq}`
  const el = (tag: string, attrs: Record<string, string> = {}, ...kids: (Node | string)[]): HTMLElement => {
    const n = doc.createElement(tag)
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v)
    n.append(...kids)
    return n
  }
  const link = (href: string, text: string): HTMLElement => el('a', { href, target: '_blank', rel: 'noopener' }, text)

  const check = el('input', { type: 'checkbox', id: `${id}-check` }) as HTMLInputElement
  const agree = el('button', { type: 'button', class: 'gpdt-policy-agree' }, 'Agree and Continue') as HTMLButtonElement
  const cancel = el('button', { type: 'button', class: 'gpdt-policy-cancel' }, 'Not now') as HTMLButtonElement
  const err = el('p', { class: 'gpdt-policy-err', role: 'alert', hidden: '' })
  agree.disabled = true
  check.addEventListener('change', () => { agree.disabled = !check.checked })

  agree.addEventListener('click', () => {
    if (!check.checked) return
    agree.disabled = true
    void savePolicyConsent(opts.store, opts.surface, opts.userId).then((ok) => {
      if (ok) { opts.onAccepted(); return }
      err.textContent = 'Your agreement could not be saved on this device, so nothing was started. Try again.'
      err.hidden = false
      agree.disabled = !check.checked
    })
  })
  cancel.addEventListener('click', () => opts.onCancel())

  return el('section', { class: 'gpdt-policy', role: 'group', 'aria-labelledby': `${id}-title` },
    el('h2', { id: `${id}-title` }, 'Terms of Service & Privacy Policy Update'),
    el('p', {}, 'Please review the updated terms before you buy credits, activate Pro or restore a photo.'),
    el('ul', {},
      el('li', {}, 'Finding duplicates, spotting blurry shots and deleting all run on your computer. Nothing is uploaded.'),
      el('li', {}, 'AI 4K Restore sends only the one photo you confirm, over HTTPS to Sylphx AI (sylphx.ai). Sylphx servers process it in memory and store nothing; the paid AI service behind it does not train on it.'),
      el('li', {}, 'Credits and Pro are sold by Sylphx Limited.')),
    el('p', { class: 'gpdt-policy-muted' }, 'Read the ', link(TERMS_URL, 'Terms of Service'), ' and the ', link(PRIVACY_URL, 'Privacy Policy'), ` (version ${CURRENT_TERMS_VERSION}).`),
    el('label', { for: `${id}-check` }, check, el('span', {}, 'I have read and agree to the Terms of Service and the Privacy Policy.')),
    err,
    el('div', { class: 'gpdt-policy-actions' }, cancel, agree))
}

/**
 * Resolve true when the current versions are already accepted, otherwise show
 * the gate inside `slot` and resolve with the person's choice.
 */
export async function ensurePolicyConsent(
  slot: HTMLElement,
  store: PolicyConsentStore,
  surface: PolicySurface,
  userId?: string,
): Promise<boolean> {
  if (await readPolicyAccepted(store)) return true
  return new Promise<boolean>((resolve) => {
    const doc = slot.ownerDocument
    const gate = renderPolicyGate(doc, {
      store, surface, userId,
      onAccepted: () => { gate.remove(); resolve(true) },
      onCancel: () => { gate.remove(); resolve(false) },
    })
    slot.replaceChildren(gate)
    gate.querySelector<HTMLInputElement>('input[type=checkbox]')?.focus()
  })
}
