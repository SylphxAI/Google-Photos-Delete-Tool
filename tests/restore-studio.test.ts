// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  CREDIT_OFFERS, TRANSFER_NOTICE, creditCheckoutUrl, openRestoreStudio, restoredFileName, walletCopy,
  type RestoreBackend, type RestorePhoto, type RestoreResult, type WalletState,
} from '../src/ui/restore/studio'
import {
  CURRENT_PRIVACY_VERSION, CURRENT_TERMS_VERSION, policyAccepted, savePolicyConsent,
  type PolicyConsentRecord, type PolicyConsentStore,
} from '../src/ui/restore/policy-consent'

const waitFor = async (fn: () => boolean): Promise<void> => {
  for (let i = 0; i < 400 && !fn(); i++) await new Promise((r) => setTimeout(r, 5))
  expect(fn()).toBe(true)
}

const photo: RestorePhoto = { id: 'AF1Qip-abc', label: 'Photo - Mar 1, 2004', previewUrl: 'https://lh3.googleusercontent.com/pw/a=w1024-h1024-no', width: 640, height: 480, quality: 'blurry' }
const current = (): PolicyConsentRecord => ({ user_id: 'local', terms_version: CURRENT_TERMS_VERSION, privacy_version: CURRENT_PRIVACY_VERSION, accepted_at: '2026-11-14T00:00:00.000Z', surface: 'gpdt_extension' })

function memoryStore(initial?: unknown, failWrites = false): PolicyConsentStore & { value: unknown; writes: number } {
  const s = {
    value: initial,
    writes: 0,
    read: async () => s.value,
    write: async (r: PolicyConsentRecord) => { s.writes++; if (failWrites) throw new Error('quota'); s.value = r },
  }
  return s
}

function backend(wallet: WalletState, result?: Partial<RestoreResult>) {
  return {
    wallet: async (): Promise<WalletState> => wallet,
    restore: vi.fn<RestoreBackend['restore']>(async () => ({ image: new Blob(['x'], { type: 'image/png' }), width: 2560, height: 1920, ...result })),
    openCheckout: vi.fn<(url: string, offer: string) => void>(),
  } satisfies RestoreBackend
}

const btn = (root: ShadowRoot, text: RegExp): HTMLButtonElement | undefined =>
  [...root.querySelectorAll('button')].find((b) => text.test(b.textContent ?? ''))

beforeEach(() => {
  document.body.innerHTML = ''
  URL.createObjectURL = vi.fn(() => 'blob:restored')
  URL.revokeObjectURL = vi.fn()
})

describe('single-photo transfer consent', () => {
  it('sends nothing until the transfer notice is confirmed, then exactly the one photo', async () => {
    const be = backend({ kind: 'trial', credits: 3 })
    const { root } = openRestoreStudio({ photo, backend: be, policyStore: memoryStore(current()) })
    await waitFor(() => root.querySelector('[data-wallet]')?.textContent === '3 free trial credits')
    expect(root.querySelector('[data-transfer-notice]')!.textContent).toBe(TRANSFER_NOTICE)
    expect(TRANSFER_NOTICE).toContain('Only this single selected photo')
    expect(TRANSFER_NOTICE).toContain('sylphx.ai')
    expect(root.textContent).toContain('Original (Blurry)')
    expect(root.textContent).toContain('640 × 480')
    await new Promise((r) => setTimeout(r, 20))
    expect(be.restore).not.toHaveBeenCalled()

    btn(root, /Send 1 photo and restore/)!.click()
    await waitFor(() => !!root.querySelector('[data-compare]'))
    expect(be.restore).toHaveBeenCalledTimes(1)
    expect(be.restore.mock.calls[0][0]).toEqual(photo)
  })

  it('cancel closes without sending', async () => {
    const be = backend({ kind: 'credits', credits: 12 })
    const onClose = vi.fn()
    const { root } = openRestoreStudio({ photo, backend: be, policyStore: memoryStore(current()), onClose })
    await waitFor(() => root.querySelector('[data-wallet]')?.textContent === '12 credits')
    btn(root, /^Cancel$/)!.click()
    expect(onClose).toHaveBeenCalled()
    expect(document.getElementById('gpdt-restore-host')).toBeNull()
    expect(be.restore).not.toHaveBeenCalled()
  })

  it('offers a top-up instead of sending when there are no credits', async () => {
    const be = backend({ kind: 'credits', credits: 0 })
    const { root } = openRestoreStudio({ photo, backend: be, policyStore: memoryStore(current()) })
    await waitFor(() => !!btn(root, /Top up to restore/))
    expect(btn(root, /Send 1 photo/)).toBeUndefined()
    btn(root, /Top up to restore/)!.click()
    expect(root.querySelector<HTMLElement>('.drawer')!.hidden).toBe(false)
  })

  it('cannot send while the balance is unverified', async () => {
    const be = backend({ kind: 'unknown' })
    const { root } = openRestoreStudio({ photo, backend: be, policyStore: memoryStore(current()) })
    await waitFor(() => root.querySelector('[data-wallet]')?.textContent === 'Not checked')
    expect(btn(root, /Send 1 photo/)!.disabled).toBe(true)
  })
})

describe('before/after comparison', () => {
  async function result(): Promise<ShadowRoot> {
    const { root } = openRestoreStudio({ photo, backend: backend({ kind: 'pass', credits: 41, monthly: 50 }), policyStore: memoryStore(current()) })
    await waitFor(() => root.querySelector('[data-wallet]')?.textContent === 'Active 50/mo Pass')
    btn(root, /Send 1 photo and restore/)!.click()
    await waitFor(() => !!root.querySelector('[data-compare]'))
    return root
  }

  it('shows both badges, the dimensions and a keyboard slider', async () => {
    const root = await result()
    expect(root.textContent).toContain('Original (Blurry)')
    expect(root.textContent).toContain('4K Restored')
    expect(root.querySelector('[data-dims]')!.textContent).toBe('640 × 480 → 2,560 × 1,920')
    const slider = root.querySelector<HTMLElement>('[role=slider]')!
    const stage = root.querySelector<HTMLElement>('[data-compare]')!
    expect(slider.getAttribute('aria-valuenow')).toBe('50')
    slider.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }))
    expect(slider.getAttribute('aria-valuenow')).toBe('48')
    slider.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', shiftKey: true, bubbles: true }))
    expect(slider.getAttribute('aria-valuenow')).toBe('58')
    slider.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }))
    expect(stage.style.getPropertyValue('--pos')).toBe('100%')
    slider.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    expect(slider.getAttribute('aria-valuenow')).toBe('100')
  })

  it('toggles 1x / 2x zoom', async () => {
    const root = await result()
    const stage = root.querySelector<HTMLElement>('[data-compare]')!
    const two = root.querySelector<HTMLButtonElement>('[data-zoom="2"]')!
    two.click()
    expect(stage.style.getPropertyValue('--zoom')).toBe('2')
    expect(two.getAttribute('aria-pressed')).toBe('true')
    expect(root.querySelector('[data-zoom="1"]')!.getAttribute('aria-pressed')).toBe('false')
  })

  it('downloads the 4K photo and releases it on close', async () => {
    const root = await result()
    const clicks: string[] = []
    const orig = HTMLAnchorElement.prototype.click
    HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) { clicks.push(this.download) }
    try {
      btn(root, /Download 4K Photo/)!.click()
    } finally {
      HTMLAnchorElement.prototype.click = orig
    }
    expect(clicks).toEqual(['restored-4k-AF1Qip-abc.png'])
    btn(root, /^Close$/)!.click()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:restored')
  })

  it('reports a failed restore without claiming success', async () => {
    const be = backend({ kind: 'credits', credits: 5 })
    be.restore.mockRejectedValueOnce(new Error('The restore service is busy. Try again in a minute.'))
    const { root } = openRestoreStudio({ photo, backend: be, policyStore: memoryStore(current()) })
    await waitFor(() => !!btn(root, /Send 1 photo/) && !btn(root, /Send 1 photo/)!.disabled)
    btn(root, /Send 1 photo/)!.click()
    await waitFor(() => root.querySelector('[role=alert]')?.textContent === 'The restore service is busy. Try again in a minute.')
    expect(root.querySelector('[data-compare]')).toBeNull()
    btn(root, /Try again/)!.click()
    expect(btn(root, /Send 1 photo/)).toBeDefined()
  })
})

describe('credit wallet', () => {
  it('lists the four offers with their prices', async () => {
    expect(CREDIT_OFFERS.map((o) => `${o.name} ${o.price} ${o.credits}`)).toEqual([
      'Starter Pack US$5 30 credits',
      'Popular Pack US$12 100 credits',
      'Archive Pack US$29 300 credits',
      'Monthly Pass US$4.99/mo 50 credits a month',
    ])
  })

  it('wallet chip copy for each state', () => {
    expect(walletCopy({ kind: 'trial', credits: 1 }).chip).toBe('1 free trial credit')
    expect(walletCopy({ kind: 'credits', credits: 100 }).chip).toBe('100 credits')
    expect(walletCopy({ kind: 'pass', credits: 50, monthly: 50 }).chip).toBe('Active 50/mo Pass')
    expect(walletCopy({ kind: 'disconnected' }).chip).toBe('No wallet')
  })

  it('opens the owned checkout for a pack, after the terms are accepted', async () => {
    const be = backend({ kind: 'credits', credits: 2 })
    const { root } = openRestoreStudio({ photo, backend: be, policyStore: memoryStore(current()) })
    await waitFor(() => root.querySelector('[data-wallet]')?.textContent === '2 credits')
    btn(root, /^Top up$/)!.click()
    root.querySelector<HTMLButtonElement>('[data-offer="gpdt_credits_100"]')!.click()
    await waitFor(() => be.openCheckout.mock.calls.length === 1)
    const [url, offer] = be.openCheckout.mock.calls[0]
    expect(offer).toBe('gpdt_credits_100')
    const u = new URL(url)
    expect(u.origin + u.pathname).toBe('https://sylphxai.github.io/Google-Photos-Delete-Tool/pricing')
    expect(u.searchParams.get('offer')).toBe('credits')
    expect(u.searchParams.get('pack')).toBe('gpdt_credits_100')
  })

  it('connects a wallet when none is linked and refreshes on the activation handoff', async () => {
    let state: WalletState = { kind: 'disconnected' }
    let notify: () => void = () => undefined
    const be = { ...backend(state), wallet: async () => state, onWalletChange: (cb: () => void) => { notify = cb; return () => undefined } }
    const { root } = openRestoreStudio({ photo, backend: be, policyStore: memoryStore(current()) })
    await waitFor(() => !!btn(root, /Connect Sylphx Wallet/))
    btn(root, /Connect Sylphx Wallet/)!.click()
    await waitFor(() => be.openCheckout.mock.calls.length === 1)
    expect(new URL(be.openCheckout.mock.calls[0][0]).searchParams.get('connect')).toBe('1')
    state = { kind: 'trial', credits: 3 }
    notify()
    await waitFor(() => root.querySelector('[data-wallet]')?.textContent === '3 free trial credits')
    expect(btn(root, /Send 1 photo/)!.disabled).toBe(false)
  })

  it('builds checkout links with campaign tags', () => {
    expect(creditCheckoutUrl('gpdt_credits_30')).toBe('https://sylphxai.github.io/Google-Photos-Delete-Tool/pricing?offer=credits&pack=gpdt_credits_30&utm_source=extension&utm_medium=restore_studio&utm_campaign=credits')
    expect(restoredFileName('a/b?c', 'image/jpeg')).toBe('restored-4k-abc.jpg')
  })
})

describe('terms clickwrap', () => {
  const gate = (root: ShadowRoot) => root.querySelector('.gpdt-policy')
  const box = (root: ShadowRoot) => root.querySelector<HTMLInputElement>('.gpdt-policy input[type=checkbox]')!
  const agree = (root: ShadowRoot) => btn(root, /Agree and Continue/)!

  for (const [label, initial] of [
    ['no record', undefined],
    ['an older terms version', { ...current(), terms_version: '2026-06-01' }],
    ['an older privacy version', { ...current(), privacy_version: '2026-06-01' }],
    ['a malformed record', { terms_version: 'latest', privacy_version: 'latest' }],
  ] as const) {
    it(`blocks restore and checkout until agreed (${label})`, async () => {
      const store = memoryStore(initial)
      const be = backend({ kind: 'trial', credits: 3 })
      const { root } = openRestoreStudio({ photo, backend: be, policyStore: store })
      await waitFor(() => !!gate(root))
      expect(gate(root)!.textContent).toContain('Terms of Service & Privacy Policy Update')
      expect(root.querySelector('[data-transfer-notice]')).toBeNull()
      expect(box(root).checked).toBe(false)
      expect(agree(root).disabled).toBe(true)
      agree(root).click()
      await new Promise((r) => setTimeout(r, 10))
      expect(store.writes).toBe(0)

      box(root).checked = true
      box(root).dispatchEvent(new Event('change'))
      agree(root).click()
      await waitFor(() => !!root.querySelector('[data-transfer-notice]'))
      expect(policyAccepted(store.value)).toBe(true)
      expect(store.value).toMatchObject({ terms_version: '2026-11-14', privacy_version: '2026-11-14', surface: 'gpdt_extension' })
      expect(be.restore).not.toHaveBeenCalled()
    })
  }

  it('declining closes the studio without sending', async () => {
    const be = backend({ kind: 'trial', credits: 3 })
    const { root } = openRestoreStudio({ photo, backend: be, policyStore: memoryStore(undefined) })
    await waitFor(() => !!gate(root))
    btn(root, /Not now/)!.click()
    await waitFor(() => document.getElementById('gpdt-restore-host') === null)
    expect(be.restore).not.toHaveBeenCalled()
  })

  it('fails closed when the acceptance cannot be saved', async () => {
    const store = memoryStore(undefined, true)
    const { root } = openRestoreStudio({ photo, backend: backend({ kind: 'trial', credits: 3 }), policyStore: store })
    await waitFor(() => !!gate(root))
    box(root).checked = true
    box(root).dispatchEvent(new Event('change'))
    agree(root).click()
    await waitFor(() => /could not be saved/.test(root.querySelector('.gpdt-policy-err')?.textContent ?? ''))
    expect(root.querySelector('[data-transfer-notice]')).toBeNull()
  })

  it('never re-prompts once the current version is accepted', async () => {
    const store = memoryStore(current())
    const { root } = openRestoreStudio({ photo, backend: backend({ kind: 'trial', credits: 3 }), policyStore: store })
    await waitFor(() => root.querySelector('[data-wallet]')?.textContent === '3 free trial credits')
    await new Promise((r) => setTimeout(r, 10))
    expect(gate(root)).toBeNull()
    expect(store.writes).toBe(0)
  })

  it('keeps the local id across re-consent and records the time', async () => {
    const store = memoryStore({ ...current(), user_id: 'keep-me', terms_version: '2025-01-01' })
    expect(await savePolicyConsent(store, 'gpdt_userscript', undefined, () => new Date('2026-11-14T10:00:00Z'))).toBe(true)
    expect(store.value).toEqual({ user_id: 'keep-me', terms_version: '2026-11-14', privacy_version: '2026-11-14', accepted_at: '2026-11-14T10:00:00.000Z', surface: 'gpdt_userscript' })
  })
})
