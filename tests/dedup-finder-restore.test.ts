// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { openDuplicateFinder, type FinderHost, type FinderRestore } from '../src/ui/dupes/finder'
import type { GridTile, ScanDeps } from '../src/core/dedup/scan'
import type { QualityVerdict } from '../src/ui/restore/studio'
import { CURRENT_PRIVACY_VERSION, CURRENT_TERMS_VERSION } from '../src/ui/restore/policy-consent'

// a0/a1 identical; s0 sharp; b0 blurry; l0 low-res.
const bytes: Record<string, number[]> = {
  a0: [1, 2, 3, 4, 5, 6, 7, 8], a1: [1, 2, 3, 4, 5, 6, 7, 8],
  s0: [9, 9, 9, 9, 0, 0, 0, 0], b0: [200, 3, 90, 7, 40, 1, 66, 250], l0: [17, 170, 34, 68, 136, 85, 51, 102],
}
const tiles: GridTile[] = Object.keys(bytes).map((k, i) => ({
  id: k,
  label: `Photo - Mar ${i + 1}, 2024, 10:00:00 AM`,
  thumbUrl: `https://lh3.googleusercontent.com/pw/${k}=w256-h256-no`,
}))
const scanDeps: ScanDeps = {
  harvest: () => tiles,
  findScrollTarget: () => ({ scrollTop: 0, scrollHeight: 100, clientHeight: 400, scrollBy: () => undefined, scrollTo: () => undefined }),
  hashThumb: async (url) => new Uint8Array(bytes[url.split('/').pop()!.split('=')[0]]),
  sleep: async () => undefined,
}
const verdicts = new Map<string, QualityVerdict>([
  ['a0', { kind: 'sharp' }], ['a1', { kind: 'sharp' }], ['s0', { kind: 'sharp', sharpness: 0.9 }],
  ['b0', { kind: 'blurry', sharpness: 0.12 }], ['l0', { kind: 'low-res', width: 320, height: 240 }],
])

const waitFor = async (fn: () => boolean): Promise<void> => {
  for (let i = 0; i < 400 && !fn(); i++) await new Promise((r) => setTimeout(r, 5))
  expect(fn()).toBe(true)
}
const btn = (root: ShadowRoot, text: RegExp): HTMLButtonElement | undefined =>
  [...root.querySelectorAll('button')].find((b) => text.test(b.textContent ?? ''))

let calls: { ids: string[]; dryRun: boolean }[]
let classify: ReturnType<typeof vi.fn<NonNullable<FinderRestore['classify']>>>
function restoreHooks(withClassify = true): FinderRestore {
  classify = vi.fn<NonNullable<FinderRestore['classify']>>(async (_items, opts) => { opts.onProgress?.(5, 5); return verdicts })
  return {
    backend: { wallet: async () => ({ kind: 'trial', credits: 3 }), restore: vi.fn<FinderRestore['backend']['restore']>() },
    policyStore: { read: async () => ({ user_id: 'x', terms_version: CURRENT_TERMS_VERSION, privacy_version: CURRENT_PRIVACY_VERSION, accepted_at: '2026-11-14T00:00:00Z', surface: 'gpdt_extension' }), write: async () => undefined },
    ...(withClassify ? { classify } : {}),
  }
}
function host(restore?: FinderRestore): FinderHost {
  return {
    runDelete: async (ids, dryRun) => { calls.push({ ids, dryRun }); return { ok: true } },
    stopRun: () => undefined,
    consentAcknowledged: async () => true,
    acknowledgeConsent: async () => undefined,
    onRunProgress: () => () => undefined,
    scanDeps,
    ...(restore ? { restore } : {}),
  }
}
const root = (): ShadowRoot => document.getElementById('gpdt-dupes-host')!.shadowRoot!
const scan = async (): Promise<ShadowRoot> => {
  btn(root(), /^Scan this view$/)!.click()
  await waitFor(() => /to Trash$/.test(root().querySelector('.danger')?.textContent ?? ''))
  return root()
}

beforeEach(() => { document.body.innerHTML = ''; calls = [] })

describe('without restore wiring', () => {
  it('shows no tabs and no restore buttons (unchanged review)', async () => {
    openDuplicateFinder(host())
    const r = await scan()
    expect(r.querySelector('[role=tablist]')).toBeNull()
    expect(r.querySelector('[data-restore]')).toBeNull()
    expect(r.textContent).not.toContain('AI 4K Restore')
    expect(r.querySelector('.danger')!.textContent).toBe('Move 1 to Trash')
  })
})

describe('with restore wiring', () => {
  it('puts AI 4K Restore on every duplicate tile without toggling keep/trash', async () => {
    openDuplicateFinder(host(restoreHooks()))
    const r = await scan()
    const buttons = [...r.querySelectorAll<HTMLButtonElement>('.item [data-restore]')]
    expect(buttons.map((b) => b.textContent)).toEqual(['AI 4K Restore', 'AI 4K Restore'])
    const before = r.querySelectorAll('.item.delete').length
    buttons[0].click()
    await waitFor(() => !!document.getElementById('gpdt-restore-host'))
    expect(root().querySelectorAll('.item.delete').length).toBe(before)
  })

  it('opens on the Blurry / Low-Res tab, lists only flagged photos, and marks nothing for Trash', async () => {
    openDuplicateFinder(host(restoreHooks()), { view: 'blurry' })
    expect(root().textContent).toContain('blurry and low-resolution photos')
    btn(root(), /^Scan this view$/)!.click()
    await waitFor(() => root().querySelectorAll('.qitem').length === 2)
    const r = root()
    expect(r.querySelector('[data-tab="blurry"]')!.getAttribute('aria-selected')).toBe('true')
    expect([...r.querySelectorAll('.qitem')].map((q) => q.getAttribute('data-quality'))).toEqual(['blurry', 'low-res'])
    expect(r.querySelector('.qitem .meta')!.textContent).toContain('Blurry · 12% sharp')
    expect(r.querySelectorAll('.qitem')[1].textContent).toContain('Low-res · 320 × 240')
    expect(r.querySelectorAll('.qitem.delete')).toHaveLength(0)
    expect(r.querySelector('.danger')!.textContent).toBe('Move 0 to Trash')
    expect(r.querySelector<HTMLButtonElement>('.danger')!.disabled).toBe(true)
    expect(r.querySelectorAll('.qitem [data-restore]')).toHaveLength(2)
    expect(classify).toHaveBeenCalledTimes(1)
  })

  it('moves a chosen blurry photo through the same consent-gated delete flow', async () => {
    openDuplicateFinder(host(restoreHooks()), { view: 'blurry' })
    btn(root(), /^Scan this view$/)!.click()
    await waitFor(() => root().querySelectorAll('.qitem').length === 2)
    btn(root(), /^Move to Trash$/)!.click()
    expect(root().querySelectorAll('.qitem.delete')).toHaveLength(1)
    expect(root().querySelector('.qitem.delete .badge')!.textContent).toBe('Trash')
    root().querySelector<HTMLButtonElement>('.danger')!.click()
    await waitFor(() => calls.length === 1)
    expect(calls[0]).toEqual({ ids: ['b0'], dryRun: false })
  })

  it('switches between tabs without rescanning', async () => {
    openDuplicateFinder(host(restoreHooks()))
    await scan()
    root().querySelector<HTMLButtonElement>('[data-tab="blurry"]')!.click()
    await waitFor(() => root().querySelectorAll('.qitem').length === 2)
    root().querySelector<HTMLButtonElement>('[data-tab="duplicates"]')!.click()
    expect(root().querySelectorAll('.group')).toHaveLength(1)
    root().querySelector<HTMLButtonElement>('[data-tab="blurry"]')!.click()
    expect(classify).toHaveBeenCalledTimes(1)
  })

  it('hides the tab when no on-device detector is wired', async () => {
    openDuplicateFinder(host(restoreHooks(false)), { view: 'blurry' })
    const r = await scan()
    expect(r.querySelector('[role=tablist]')).toBeNull()
    expect(r.querySelectorAll('.item [data-restore]')).toHaveLength(2)
  })
})
