/**
 * AI 4K Restore studio — one photo at a time, in a shadow-root modal.
 *
 * Flow: terms clickwrap (only when the current version is not accepted) →
 * single-photo transfer notice → restore → before/after comparison →
 * download. Nothing leaves the browser until the person presses the send
 * button on the transfer notice; the transport itself lives behind
 * {@link RestoreBackend}, so this file makes no network call of its own.
 * The restored image exists only as an object URL that is revoked on close.
 */
import {
  POLICY_GATE_CSS, ensurePolicyConsent, readPolicyAccepted,
  type PolicyConsentStore, type PolicySurface,
} from './policy-consent'

// ─── Contract with the wallet/restore core ──────────────────────

export type CreditOfferKey = 'starter' | 'popular' | 'archive' | 'monthly'

export interface CreditOffer {
  key: CreditOfferKey
  name: string
  price: string
  credits: string
  /** Price per restore, for comparison only. */
  each: string
}

/** Credit packs and pass, as sold on the owned pricing page. */
export const CREDIT_OFFERS: readonly CreditOffer[] = [
  { key: 'starter', name: 'Starter Pack', price: 'US$5', credits: '30 credits', each: 'US$0.17 a photo' },
  { key: 'popular', name: 'Popular Pack', price: 'US$12', credits: '100 credits', each: 'US$0.12 a photo' },
  { key: 'archive', name: 'Archive Pack', price: 'US$29', credits: '300 credits', each: 'US$0.10 a photo' },
  { key: 'monthly', name: 'Monthly Pass', price: 'US$4.99/mo', credits: '50 credits a month', each: 'US$0.10 a photo' },
]

export const PRICING_URL = 'https://sylphxai.github.io/Google-Photos-Delete-Tool/pricing'
/** Page-to-extension message that carries a wallet token after checkout. */
export const WALLET_ACTIVATION_MESSAGE = 'gpdt:activate-wallet'

/** Owned checkout link for a pack, or the wallet connect flow. */
export function creditCheckoutUrl(offer: CreditOfferKey | 'connect', medium = 'restore_studio'): string {
  const u = new URL(PRICING_URL)
  u.searchParams.set('offer', 'credits')
  if (offer === 'connect') u.searchParams.set('connect', '1')
  else u.searchParams.set('pack', offer)
  u.searchParams.set('utm_source', 'extension')
  u.searchParams.set('utm_medium', medium)
  u.searchParams.set('utm_campaign', 'credits')
  return u.toString()
}

/** Server-verified wallet state. `unknown` means it could not be checked. */
export type WalletState =
  | { kind: 'unknown' }
  | { kind: 'disconnected' }
  | { kind: 'trial'; credits: number }
  | { kind: 'credits'; credits: number }
  | { kind: 'pass'; credits: number; monthly: number }

export type PhotoQuality = 'blurry' | 'low-res'

/** Local, on-device sharpness and resolution verdict for one photo. */
export interface QualityVerdict {
  kind: 'sharp' | PhotoQuality
  /** 0 (very soft) to 1 (crisp), when the detector reports it. */
  sharpness?: number
  width?: number
  height?: number
}

export interface RestorePhoto {
  id: string
  label?: string | null
  /** What the person sees as the original (a Google image-host URL). */
  previewUrl: string
  /** Largest available source for the backend to read. Defaults to previewUrl. */
  sourceUrl?: string
  width?: number
  height?: number
  quality?: PhotoQuality
}

export interface RestoreResult {
  image: Blob
  width: number
  height: number
  /** Wallet after the charge, when the server returns it. */
  wallet?: WalletState
}

export interface RestoreBackend {
  wallet(): Promise<WalletState>
  /** Sends exactly this photo. Called only after the transfer notice is confirmed. */
  restore(photo: RestorePhoto, opts: { signal: AbortSignal }): Promise<RestoreResult>
  /** Opens the owned checkout page. Defaults to a new tab. */
  openCheckout?(url: string, offer: CreditOfferKey | 'connect'): void
  /** Fires when a `gpdt:activate-wallet` handoff (or any top-up) lands. */
  onWalletChange?(cb: () => void): () => void
}

export function walletCredits(w: WalletState): number {
  return w.kind === 'trial' || w.kind === 'credits' || w.kind === 'pass' ? Math.max(0, Math.floor(w.credits)) : 0
}

const plural = (n: number, one: string, many: string): string => `${n.toLocaleString()} ${n === 1 ? one : many}`

/** Short chip text and the sentence beside it. */
export function walletCopy(w: WalletState | null): { chip: string; line: string } {
  if (!w) return { chip: 'Checking…', line: 'Checking your credit balance.' }
  switch (w.kind) {
    case 'unknown': return { chip: 'Not checked', line: 'Your balance could not be checked. Nothing was sent.' }
    case 'disconnected': return { chip: 'No wallet', line: 'Connect a Sylphx wallet or buy credits to restore photos.' }
    case 'trial': return { chip: `${plural(walletCredits(w), 'free trial credit', 'free trial credits')}`, line: 'Each restore uses 1 credit.' }
    case 'credits': return { chip: plural(walletCredits(w), 'credit', 'credits'), line: walletCredits(w) > 0 ? 'Each restore uses 1 credit.' : 'You are out of credits.' }
    case 'pass': return { chip: `Active ${w.monthly}/mo Pass`, line: `${plural(walletCredits(w), 'credit', 'credits')} left this month. Each restore uses 1.` }
  }
}

export function originalBadge(q?: PhotoQuality): string {
  return q === 'blurry' ? 'Original (Blurry)' : q === 'low-res' ? 'Original (Low-Res)' : 'Original'
}

export const dims = (w?: number, h?: number): string => (w && h ? `${w.toLocaleString()} × ${h.toLocaleString()}` : '–')

// ─── Shared look ────────────────────────────────────────────────

/** DESIGN.md tokens as custom properties on a shadow host; light and dark. */
export const TOKENS_CSS = `
:host { all: initial;
  --gp-font: Inter, "Noto Sans JP", "Noto Sans SC", "Noto Sans TC", system-ui, -apple-system, "Segoe UI", "Hiragino Sans", "PingFang SC", "PingFang TC", "Microsoft YaHei", sans-serif;
  --gp-paper: #F7F6F3; --gp-raised: #FFFFFF; --gp-sunken: #EDEBE6; --gp-ink: #1A1920; --gp-muted: #5C5A66; --gp-outline: #D6D3CC;
  --gp-accent: #4B32C3; --gp-on-accent: #FFFFFF; --gp-accent-container: #ECE8FB; --gp-on-accent-container: #2A1A7A;
  --gp-keep: #16794A; --gp-on-keep: #FFFFFF; --gp-keep-container: #E3F4EA;
  --gp-trash: #C5281C; --gp-on-trash: #FFFFFF; --gp-trash-container: #FBE7E4; --gp-trash-ink: #C5281C; --gp-on-trash-ink: #FFFFFF;
  --gp-caution: #8A5300; --gp-caution-container: #FDF1DC; --gp-error: #B3261E;
  --gp-btn-border: transparent; --gp-shadow: 0 8px 24px rgba(26,25,32,0.16); --gp-scrim: rgba(26,25,32,0.48); }
@media (prefers-color-scheme: dark) { :host {
  --gp-paper: #141318; --gp-raised: #1F1E25; --gp-sunken: #1F1E25; --gp-ink: #EDEBF2; --gp-muted: #A7A4B3; --gp-outline: #38363F;
  --gp-accent: #B7A9FF; --gp-on-accent: #1E1259; --gp-accent-container: #1F1E25; --gp-on-accent-container: #B7A9FF;
  --gp-keep: #5FD39A; --gp-on-keep: #141318; --gp-keep-container: #1F1E25;
  --gp-trash-ink: #FF8A7E; --gp-on-trash-ink: #141318; --gp-trash-container: #1F1E25;
  --gp-caution-container: #1F1E25; --gp-error: #FF8A7E;
  --gp-btn-border: #38363F; --gp-shadow: none; --gp-scrim: rgba(0,0,0,0.6); } }
`

/** Line-art sparkle used next to every "AI 4K Restore" label. */
export function sparkleIcon(doc: Document = document, size = 16): SVGSVGElement {
  const NS = 'http://www.w3.org/2000/svg'
  const svg = doc.createElementNS(NS, 'svg')
  for (const [k, v] of Object.entries({ viewBox: '0 0 24 24', width: String(size), height: String(size), fill: 'none', stroke: 'currentColor', 'stroke-width': '1.6', 'stroke-linejoin': 'round', 'aria-hidden': 'true', class: 'gp-sparkle' })) svg.setAttribute(k, v)
  for (const d of ['M11 3.5l1.8 5.2 5.2 1.8-5.2 1.8L11 17.5l-1.8-5.2L4 10.5l5.2-1.8z', 'M18.5 15.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z']) {
    const p = doc.createElementNS(NS, 'path')
    p.setAttribute('d', d)
    svg.append(p)
  }
  return svg
}

export const RESTORE_LABEL = 'AI 4K Restore'

/** The single-photo transfer notice. Keep in step with PRIVACY.md. */
export const TRANSFER_NOTICE = 'Only this single selected photo is sent over HTTPS to Sylphx AI (sylphx.ai) for 4K restoration. Sylphx servers process it in memory and keep no copy once the result is returned, and the paid AI service that renders it does not use it to train models.'

const CSS = `${TOKENS_CSS}
* { box-sizing: border-box; }
.scrim { position: fixed; inset: 0; z-index: 2147483647; display: grid; place-items: center; padding: 16px;
  background: var(--gp-scrim); font: 400 14px/1.5 var(--gp-font); color: var(--gp-ink); -webkit-font-smoothing: antialiased; }
.studio { width: min(880px, 100%); max-height: 100%; display: flex; flex-direction: column; overflow: hidden;
  background: var(--gp-paper); border: 1px solid var(--gp-outline); border-radius: 12px; box-shadow: var(--gp-shadow); }
.nav { display: flex; align-items: center; gap: 8px; height: 48px; padding: 0 8px 0 16px; border-bottom: 1px solid var(--gp-outline); }
.nav .gp-sparkle { color: var(--gp-accent); flex: none; }
.nav h1 { flex: 1; margin: 0; font-size: 15px; font-weight: 600; line-height: 1.3; }
.icon-btn { width: 32px; height: 32px; display: grid; place-items: center; border: 0; border-radius: 8px; background: transparent; color: var(--gp-muted); cursor: pointer; }
.icon-btn:hover { background: var(--gp-sunken); color: var(--gp-ink); }
.wallet { display: flex; align-items: center; gap: 12px; padding: 12px 16px; border-bottom: 1px solid var(--gp-outline); background: var(--gp-raised); }
.chip { flex: none; padding: 4px 8px; border-radius: 4px; background: var(--gp-accent-container); color: var(--gp-on-accent-container);
  font-size: 13px; font-weight: 600; line-height: 1.2; font-variant-numeric: tabular-nums; }
.wallet .line { flex: 1; min-width: 0; color: var(--gp-muted); font-size: 12px; line-height: 1.45; }
.drawer { padding: 16px; border-bottom: 1px solid var(--gp-outline); background: var(--gp-paper); display: grid; gap: 12px; }
.drawer[hidden] { display: none; }
.offers { display: grid; grid-template-columns: repeat(auto-fit, minmax(176px, 1fr)); gap: 8px; }
.offer { display: grid; gap: 2px; text-align: left; padding: 12px; border-radius: 8px; border: 1px solid var(--gp-outline);
  background: var(--gp-raised); color: var(--gp-ink); font: inherit; cursor: pointer; }
.offer:hover { border-color: var(--gp-accent); }
.offer .name { font-size: 13px; font-weight: 600; }
.offer .price { font-size: 20px; font-weight: 600; line-height: 1.25; letter-spacing: -0.01em; font-variant-numeric: tabular-nums; }
.offer .credits { font-size: 13px; font-variant-numeric: tabular-nums; }
.offer .each { color: var(--gp-muted); font-size: 12px; font-variant-numeric: tabular-nums; }
.body { flex: 1; min-height: 0; overflow-y: auto; padding: 16px; }
.actions { display: flex; justify-content: space-between; gap: 8px; padding: 12px 16px; border-top: 1px solid var(--gp-outline); background: var(--gp-raised); }
.actions .end { display: flex; gap: 8px; margin-left: auto; }
button.btn { height: 40px; padding: 0 16px; border: 1px solid var(--gp-btn-border); border-radius: 8px; font: 600 13px/1.2 var(--gp-font); cursor: pointer;
  display: inline-flex; align-items: center; justify-content: center; gap: 8px; white-space: nowrap; }
button.btn:disabled { opacity: .45; cursor: not-allowed; }
.primary { background: var(--gp-accent); color: var(--gp-on-accent); border-color: var(--gp-accent) !important; }
.secondary { background: var(--gp-sunken); color: var(--gp-ink); }
button:focus-visible, a:focus-visible, [role=slider]:focus-visible { outline: 2px solid var(--gp-accent); outline-offset: 2px; }
.muted { color: var(--gp-muted); font-size: 12px; line-height: 1.45; margin: 0; }
.err { color: var(--gp-error); font-size: 13px; margin: 0; }
h2 { margin: 0; font-size: 15px; font-weight: 600; line-height: 1.3; }
p { margin: 0; }
.confirm { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 16px; align-items: start; }
@media (max-width: 640px) { .confirm { grid-template-columns: 1fr; } }
.preview { position: relative; margin: 0; border-radius: 8px; overflow: hidden; background: var(--gp-sunken); aspect-ratio: 4 / 3; }
.preview img { display: block; width: 100%; height: 100%; object-fit: contain; }
.badge { position: absolute; top: 8px; padding: 4px 6px; border-radius: 4px; font-size: 12px; font-weight: 600; line-height: 1.2; pointer-events: none;
  background: rgba(26,25,32,0.72); color: #FFFFFF; }
.badge.left { left: 8px; }
.badge.right { right: 8px; background: var(--gp-accent); color: var(--gp-on-accent); }
.notice { display: grid; gap: 12px; padding: 16px; border-radius: 12px; border: 1px solid var(--gp-outline); background: var(--gp-raised); }
.notice .lock { display: flex; gap: 8px; align-items: center; color: var(--gp-accent); font-size: 13px; font-weight: 600; }
.facts { display: grid; grid-template-columns: auto 1fr; gap: 4px 12px; margin: 0; font-size: 13px; }
.facts dt { color: var(--gp-muted); }
.facts dd { margin: 0; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.progress { height: 6px; border-radius: 9999px; background: var(--gp-sunken); overflow: hidden; }
.progress > div { height: 100%; width: 30%; border-radius: 9999px; background: var(--gp-accent); animation: gp-slide 1.4s ease-in-out infinite; }
@keyframes gp-slide { 0% { transform: translateX(-100%); } 100% { transform: translateX(333%); } }
@media (prefers-reduced-motion: reduce) { .progress > div { animation: none; width: 100%; opacity: .5; } }
.working { display: grid; gap: 12px; max-width: 520px; margin: 0 auto; }
.compare { display: grid; gap: 12px; }
.stage { --pos: 50%; --zoom: 1; --ox: 50%; --oy: 50%; position: relative; aspect-ratio: 4 / 3; max-height: 62vh; width: 100%;
  border-radius: 8px; overflow: hidden; background: var(--gp-sunken); touch-action: pan-y; user-select: none; -webkit-user-select: none; cursor: ew-resize; }
.layer { position: absolute; inset: 0; }
.layer img { display: block; width: 100%; height: 100%; object-fit: contain; pointer-events: none;
  transform: scale(var(--zoom)); transform-origin: var(--ox) var(--oy); transition: transform .2s ease; }
.layer.after { clip-path: inset(0 0 0 var(--pos)); }
.divider { position: absolute; top: 0; bottom: 0; left: var(--pos); width: 0; }
.divider::before { content: ''; position: absolute; top: 0; bottom: 0; left: -1px; width: 2px; background: #FFFFFF; box-shadow: 0 0 0 1px rgba(26,25,32,0.24); }
.handle { position: absolute; top: 50%; left: 0; width: 36px; height: 36px; margin: -18px 0 0 -18px; border-radius: 9999px;
  display: grid; place-items: center; background: #FFFFFF; color: #1A1920; border: 1px solid rgba(26,25,32,0.24); cursor: ew-resize; }
.toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; }
.seg { display: inline-flex; padding: 2px; border-radius: 8px; background: var(--gp-sunken); border: 1px solid var(--gp-btn-border); }
.seg button { height: 28px; min-width: 40px; padding: 0 10px; border: 0; border-radius: 6px; background: transparent; color: var(--gp-muted);
  font: 600 13px/1.2 var(--gp-font); font-variant-numeric: tabular-nums; cursor: pointer; }
.seg button[aria-pressed=true] { background: var(--gp-raised); color: var(--gp-ink); box-shadow: 0 0 0 1px var(--gp-outline); }
.readout { font-size: 13px; color: var(--gp-muted); font-variant-numeric: tabular-nums; }
.readout b { color: var(--gp-ink); font-weight: 600; }
.sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
${POLICY_GATE_CSS}
`

const HOST_ID = 'gpdt-restore-host'

type El<K extends keyof HTMLElementTagNameMap> = HTMLElementTagNameMap[K]
function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, ...kids: (Node | string)[]): El<K> {
  const el = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') el.className = v
    else el.setAttribute(k, v)
  }
  el.append(...kids)
  return el
}

function closeIcon(): SVGSVGElement {
  const NS = 'http://www.w3.org/2000/svg'
  const svg = document.createElementNS(NS, 'svg')
  for (const [k, v] of Object.entries({ viewBox: '0 0 24 24', width: '18', height: '18', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.8', 'stroke-linecap': 'round', 'aria-hidden': 'true' })) svg.setAttribute(k, v)
  const p = document.createElementNS(NS, 'path')
  p.setAttribute('d', 'M6 6l12 12M18 6L6 18')
  svg.append(p)
  return svg
}

function gripIcon(): SVGSVGElement {
  const NS = 'http://www.w3.org/2000/svg'
  const svg = document.createElementNS(NS, 'svg')
  for (const [k, v] of Object.entries({ viewBox: '0 0 24 24', width: '18', height: '18', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.8', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' })) svg.setAttribute(k, v)
  const p = document.createElementNS(NS, 'path')
  p.setAttribute('d', 'M9 7l-5 5 5 5M15 7l5 5-5 5')
  svg.append(p)
  return svg
}

export interface RestoreStudioOptions {
  photo: RestorePhoto
  backend: RestoreBackend
  policyStore: PolicyConsentStore
  surface?: PolicySurface
  /** Wallet account id for the consent record, when known. */
  userId?: string
  onClose?: () => void
  /** Focus returns here on close. */
  returnFocus?: HTMLElement | null
}

export interface RestoreStudio {
  close(): void
  readonly root: ShadowRoot
}

export function openRestoreStudio(opts: RestoreStudioOptions): RestoreStudio {
  const { photo, backend, policyStore } = opts
  const surface = opts.surface ?? 'gpdt_extension'
  document.getElementById(HOST_ID)?.remove()
  const mount = h('div', { id: HOST_ID })
  const shadow = mount.attachShadow({ mode: 'open' })
  shadow.append(h('style', {}, CSS))
  ;(document.body ?? document.documentElement).append(mount)

  let wallet: WalletState | null = null
  let inflight: AbortController | null = null
  let restoredUrl: string | null = null
  let closed = false
  let view: 'gate' | 'confirm' | 'working' | 'result' | 'error' = 'confirm'

  // ─── Frame ──
  const title = h('h1', { id: 'gp-studio-title' }, RESTORE_LABEL)
  const closeBtn = h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Close' }, closeIcon())
  const chip = h('span', { class: 'chip', 'data-wallet': '' })
  const walletLine = h('span', { class: 'line' })
  const topUp = h('button', { class: 'btn secondary', type: 'button', 'aria-expanded': 'false', 'aria-controls': 'gp-drawer' })
  const drawer = h('div', { class: 'drawer', id: 'gp-drawer', hidden: '' })
  const body = h('div', { class: 'body' })
  const actions = h('footer', { class: 'actions' })
  const live = h('p', { class: 'sr', role: 'status', 'aria-live': 'polite' })
  const dialog = h('div', { class: 'studio', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'gp-studio-title' },
    h('header', { class: 'nav' }, sparkleIcon(document, 18), title, closeBtn),
    h('div', { class: 'wallet' }, chip, walletLine, topUp),
    drawer, body, actions, live)
  const scrim = h('div', { class: 'scrim' }, dialog)
  shadow.append(scrim)

  const offerButtons = CREDIT_OFFERS.map((o) => {
    const b = h('button', { class: 'offer', type: 'button', 'data-offer': o.key },
      h('span', { class: 'name' }, o.name),
      h('span', { class: 'price' }, o.price),
      h('span', { class: 'credits' }, o.credits),
      h('span', { class: 'each' }, o.each))
    b.addEventListener('click', () => void checkout(o.key))
    return b
  })
  drawer.append(
    h('div', { class: 'offers' }, ...offerButtons),
    h('p', { class: 'muted' }, 'Checkout opens on the Sylphx pricing page. Credits appear here once payment is confirmed. The Monthly Pass is billed every month.'))

  const close = (): void => {
    if (closed) return
    closed = true
    inflight?.abort()
    inflight = null
    if (restoredUrl) URL.revokeObjectURL(restoredUrl)
    restoredUrl = null
    unsubscribe?.()
    document.removeEventListener('keydown', onKey, true)
    mount.remove()
    opts.returnFocus?.focus?.()
    opts.onClose?.()
  }
  closeBtn.addEventListener('click', close)
  scrim.addEventListener('click', (e) => { if (e.target === scrim && view !== 'working') close() })
  const onKey = (e: KeyboardEvent): void => {
    if (closed) return
    if (e.key === 'Escape') { e.stopPropagation(); close() }
    else if (e.key === 'Tab') trapFocus(e)
  }
  document.addEventListener('keydown', onKey, true)

  function trapFocus(e: KeyboardEvent): void {
    const focusable = [...dialog.querySelectorAll<HTMLElement>('button, a[href], input, [tabindex="0"]')]
      .filter((el) => !(el as HTMLButtonElement).disabled && !el.closest('[hidden]'))
    if (focusable.length === 0) return
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    const active = shadow.activeElement
    if (e.shiftKey && active === first) { e.preventDefault(); last.focus() }
    else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus() }
  }

  // ─── Wallet ──
  const unsubscribe = backend.onWalletChange?.(() => void refreshWallet())
  function renderWallet(): void {
    const copy = walletCopy(wallet)
    chip.textContent = copy.chip
    walletLine.textContent = copy.line
    const connect = wallet?.kind === 'disconnected'
    topUp.replaceChildren(connect ? 'Connect Sylphx Wallet' : 'Top up')
    topUp.disabled = wallet === null
  }
  async function refreshWallet(): Promise<void> {
    try {
      wallet = await backend.wallet()
    } catch {
      wallet = { kind: 'unknown' }
    }
    if (closed) return
    renderWallet()
    if (view === 'confirm') renderConfirm()
  }
  topUp.addEventListener('click', () => {
    if (wallet?.kind === 'disconnected') { void checkout('connect'); return }
    const open = drawer.hidden
    drawer.hidden = !open
    topUp.setAttribute('aria-expanded', String(open))
  })

  async function checkout(offer: CreditOfferKey | 'connect'): Promise<void> {
    if (!(await gate())) return
    const url = creditCheckoutUrl(offer)
    if (backend.openCheckout) backend.openCheckout(url, offer)
    else window.open(url, '_blank', 'noopener')
    live.textContent = 'Checkout opened in a new tab. Your balance updates here after payment.'
  }

  /** Terms clickwrap; resolves true when the current version is accepted. */
  async function gate(): Promise<boolean> {
    if (await readPolicyAccepted(policyStore)) return true
    const back = view
    view = 'gate'
    actions.replaceChildren()
    const ok = await ensurePolicyConsent(body, policyStore, surface, opts.userId)
    if (closed) return false
    view = back
    rerender()
    return ok
  }

  function rerender(): void {
    if (view === 'confirm') renderConfirm()
    else if (view === 'result') renderResultAgain?.()
  }

  // ─── 1. Transfer notice ──
  function renderConfirm(): void {
    view = 'confirm'
    const credits = wallet ? walletCredits(wallet) : 0
    const img = h('img', { src: photo.previewUrl, alt: photo.label ?? 'Selected photo' })
    const size = h('dd', {}, dims(photo.width, photo.height))
    img.addEventListener('load', () => {
      if (!photo.width && img.naturalWidth) size.textContent = dims(img.naturalWidth, img.naturalHeight)
    })
    body.replaceChildren(h('div', { class: 'confirm' },
      h('figure', { class: 'preview' }, img, h('span', { class: 'badge left' }, originalBadge(photo.quality))),
      h('section', { class: 'notice', 'aria-labelledby': 'gp-transfer-title' },
        h('span', { class: 'lock' }, lockIcon(), 'Single-photo transfer'),
        h('h2', { id: 'gp-transfer-title' }, 'Send this one photo for restoration?'),
        h('p', { 'data-transfer-notice': '' }, TRANSFER_NOTICE),
        h('dl', { class: 'facts' },
          h('dt', {}, 'Photo'), h('dd', {}, photo.label || 'Selected photo'),
          h('dt', {}, 'Size now'), size,
          h('dt', {}, 'Cost'), h('dd', {}, '1 credit')),
        h('p', { class: 'muted' }, 'Nothing has been sent yet. Your other photos stay in your browser.'))))

    const cancel = h('button', { class: 'btn secondary', type: 'button' }, 'Cancel')
    cancel.addEventListener('click', close)
    const end = h('div', { class: 'end' })
    if (wallet && wallet.kind !== 'unknown' && credits < 1) {
      const buy = h('button', { class: 'btn primary', type: 'button' }, wallet.kind === 'disconnected' ? 'Connect Sylphx Wallet' : 'Top up to restore')
      buy.addEventListener('click', () => {
        if (wallet?.kind === 'disconnected') { void checkout('connect'); return }
        drawer.hidden = false
        topUp.setAttribute('aria-expanded', 'true')
        offerButtons[0].focus()
      })
      end.append(buy)
    } else {
      const send = h('button', { class: 'btn primary', type: 'button', 'data-send': '' }, sparkleIcon(document), 'Send 1 photo and restore')
      send.disabled = !wallet || wallet.kind === 'unknown'
      send.addEventListener('click', () => void startRestore())
      end.append(send)
    }
    actions.replaceChildren(cancel, end)
  }

  function lockIcon(): SVGSVGElement {
    const NS = 'http://www.w3.org/2000/svg'
    const svg = document.createElementNS(NS, 'svg')
    for (const [k, v] of Object.entries({ viewBox: '0 0 24 24', width: '16', height: '16', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.6', 'stroke-linejoin': 'round', 'aria-hidden': 'true' })) svg.setAttribute(k, v)
    for (const d of ['M6 11h12v9H6z', 'M9 11V8a3 3 0 0 1 6 0v3']) {
      const p = document.createElementNS(NS, 'path')
      p.setAttribute('d', d)
      svg.append(p)
    }
    return svg
  }

  // ─── 2. Restore ──
  async function startRestore(): Promise<void> {
    if (inflight) return
    // Versioned clickwrap again: the terms may have changed since the studio opened.
    if (!(await gate())) return
    view = 'working'
    const ctrl = new AbortController()
    inflight = ctrl
    body.replaceChildren(h('div', { class: 'working' },
      h('figure', { class: 'preview' }, h('img', { src: photo.previewUrl, alt: '' }), h('span', { class: 'badge left' }, originalBadge(photo.quality))),
      h('h2', {}, 'Restoring to 4K…'),
      h('div', { class: 'progress', role: 'progressbar', 'aria-label': 'Restoring' }, h('div')),
      h('p', { class: 'muted' }, 'Usually under a minute. Sylphx keeps no copy once the result is back.')))
    const cancel = h('button', { class: 'btn secondary', type: 'button' }, 'Cancel')
    cancel.addEventListener('click', () => { ctrl.abort(); inflight = null; renderConfirm() })
    actions.replaceChildren(cancel)
    live.textContent = 'Restoring the photo.'
    try {
      const result = await backend.restore(photo, { signal: ctrl.signal })
      if (closed || ctrl.signal.aborted) return
      inflight = null
      if (result.wallet) { wallet = result.wallet; renderWallet() } else void refreshWallet()
      renderResult(result)
    } catch (err) {
      if (closed || ctrl.signal.aborted) return
      inflight = null
      renderError(err instanceof Error && err.message ? err.message : 'The photo could not be restored.')
    }
  }

  function renderError(message: string): void {
    view = 'error'
    body.replaceChildren(h('div', { class: 'working' },
      h('p', { class: 'err', role: 'alert' }, message),
      h('p', { class: 'muted' }, 'Your other photos never left this browser. You can try this one again.')))
    const done = h('button', { class: 'btn secondary', type: 'button' }, 'Close')
    done.addEventListener('click', close)
    const retry = h('button', { class: 'btn primary', type: 'button' }, 'Try again')
    retry.addEventListener('click', () => renderConfirm())
    actions.replaceChildren(done, h('div', { class: 'end' }, retry))
  }

  // ─── 3. Compare ──
  let renderResultAgain: (() => void) | null = null
  function renderResult(result: RestoreResult): void {
    view = 'result'
    if (restoredUrl) URL.revokeObjectURL(restoredUrl)
    restoredUrl = URL.createObjectURL(result.image)
    const url = restoredUrl
    let pos = 50
    let zoom = 1
    let dragging = false

    const before = h('img', { src: photo.previewUrl, alt: `${originalBadge(photo.quality)} photo`, draggable: 'false' })
    const after = h('img', { src: url, alt: '4K restored photo', draggable: 'false' })
    const handle = h('div', {
      class: 'handle', role: 'slider', tabindex: '0', 'aria-label': 'Compare original and restored',
      'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': '50', 'aria-orientation': 'horizontal',
    }, gripIcon())
    const stage = h('div', { class: 'stage', 'data-compare': '' },
      h('div', { class: 'layer before' }, before),
      h('div', { class: 'layer after' }, after),
      h('span', { class: 'badge left' }, originalBadge(photo.quality)),
      h('span', { class: 'badge right' }, '4K Restored'),
      h('div', { class: 'divider' }, handle))

    const setPos = (p: number): void => {
      pos = Math.min(100, Math.max(0, Math.round(p)))
      stage.style.setProperty('--pos', `${pos}%`)
      handle.setAttribute('aria-valuenow', String(pos))
      handle.setAttribute('aria-valuetext', `${100 - pos}% restored shown`)
    }
    const fromClient = (clientX: number): void => {
      const r = stage.getBoundingClientRect()
      if (r.width > 0) setPos(((clientX - r.left) / r.width) * 100)
    }
    stage.addEventListener('pointerdown', (e) => {
      dragging = true
      stage.setPointerCapture?.(e.pointerId)
      fromClient(e.clientX)
      handle.focus({ preventScroll: true })
    })
    stage.addEventListener('pointermove', (e) => {
      if (dragging) { fromClient(e.clientX); return }
      if (zoom > 1) {
        // At 2x the zoom follows the pointer, like a loupe.
        const r = stage.getBoundingClientRect()
        if (r.width > 0 && r.height > 0) {
          stage.style.setProperty('--ox', `${Math.round(((e.clientX - r.left) / r.width) * 100)}%`)
          stage.style.setProperty('--oy', `${Math.round(((e.clientY - r.top) / r.height) * 100)}%`)
        }
      }
    })
    const end = (): void => { dragging = false }
    stage.addEventListener('pointerup', end)
    stage.addEventListener('pointercancel', end)
    handle.addEventListener('keydown', (e) => {
      const step = e.shiftKey ? 10 : 2
      const next = e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? pos - step
        : e.key === 'ArrowRight' || e.key === 'ArrowUp' ? pos + step
          : e.key === 'Home' ? 0 : e.key === 'End' ? 100 : null
      if (next === null) return
      e.preventDefault()
      setPos(next)
    })
    setPos(50)

    const zoomBtns = ([1, 2] as const).map((z) => {
      const b = h('button', { type: 'button', 'aria-pressed': String(z === zoom), 'data-zoom': String(z) }, `${z}x`)
      b.addEventListener('click', () => {
        zoom = z
        stage.style.setProperty('--zoom', String(z))
        if (z === 1) { stage.style.setProperty('--ox', '50%'); stage.style.setProperty('--oy', '50%') }
        for (const other of zoomBtns) other.setAttribute('aria-pressed', String(other === b))
      })
      return b
    })
    const beforeDims = h('b', {}, dims(photo.width, photo.height))
    before.addEventListener('load', () => {
      if (!photo.width && before.naturalWidth) beforeDims.textContent = dims(before.naturalWidth, before.naturalHeight)
    })
    const readout = h('span', { class: 'readout', 'data-dims': '' }, beforeDims, ' → ', h('b', {}, dims(result.width, result.height)))

    body.replaceChildren(h('div', { class: 'compare' },
      stage,
      h('div', { class: 'toolbar' },
        h('div', { class: 'seg', role: 'group', 'aria-label': 'Zoom' }, ...zoomBtns),
        readout,
        h('p', { class: 'muted' }, 'Drag the line or use the arrow keys to compare.'))))

    const done = h('button', { class: 'btn secondary', type: 'button' }, 'Close')
    done.addEventListener('click', close)
    const download = h('button', { class: 'btn primary', type: 'button', 'data-download': '' }, 'Download 4K Photo')
    download.addEventListener('click', () => {
      const a = h('a', { href: url, download: restoredFileName(photo.id, result.image.type) })
      a.click()
    })
    actions.replaceChildren(done, h('div', { class: 'end' }, download))
    live.textContent = `Restored to ${dims(result.width, result.height)}.`
    renderResultAgain = () => renderResult(result)
  }

  // ─── Start ──
  renderWallet()
  renderConfirm()
  void (async () => {
    await refreshWallet()
    if (closed) return
    // Clickwrap first when the current terms version is not accepted yet.
    if (!(await readPolicyAccepted(policyStore))) {
      const ok = await gate()
      if (!ok) close()
    }
  })()
  closeBtn.focus()

  return { close, root: shadow }
}

export function restoredFileName(id: string, type: string): string {
  const ext = type === 'image/jpeg' ? 'jpg' : type === 'image/webp' ? 'webp' : 'png'
  const safe = id.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40) || 'photo'
  return `restored-4k-${safe}.${ext}`
}
