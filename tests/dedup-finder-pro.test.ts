// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { openDuplicateFinder, type FinderHost } from '../src/ui/dupes/finder'
import type { GridTile, ScanDeps } from '../src/core/dedup/scan'

// a0/a1 identical (100%, confident). b0/b1 differ by 3 bits (95.3%, needs review).
const bytes: Record<string, number[]> = {
  a0: [1, 2, 3, 4, 5, 6, 7, 8], a1: [1, 2, 3, 4, 5, 6, 7, 8],
  b0: [255, 0, 255, 0, 255, 0, 255, 0], b1: [254, 1, 255, 0, 255, 0, 255, 0],
}
const tiles: GridTile[] = Object.keys(bytes).map((k, i) => ({
  id: k,
  label: `Photo - Mar ${i + 1}, 2024, 10:00:00 AM`,
  thumbUrl: `https://lh3.googleusercontent.com/pw/${k}`,
}))
const scanDeps: ScanDeps = {
  harvest: () => tiles,
  findScrollTarget: () => ({
    scrollTop: 0, scrollHeight: 100, clientHeight: 400,
    scrollBy: () => undefined, scrollTo: () => undefined,
  }),
  hashThumb: async (url) => new Uint8Array(bytes[url.split('/').pop()!]),
  sleep: async () => undefined,
}

const waitFor = async (fn: () => boolean): Promise<void> => {
  for (let i = 0; i < 400 && !fn(); i++) await new Promise((r) => setTimeout(r, 5))
  expect(fn()).toBe(true)
}

let calls: { ids: string[]; dryRun: boolean }[]
const open = async (isPro?: boolean): Promise<ShadowRoot> => {
  const host: FinderHost = {
    runDelete: async (ids, dryRun) => { calls.push({ ids, dryRun }); return { ok: true } },
    stopRun: () => undefined,
    consentAcknowledged: async () => true,
    acknowledgeConsent: async () => undefined,
    onRunProgress: () => () => undefined,
    scanDeps,
    ...(isPro === undefined ? {} : { isPro: async () => isPro }),
  }
  openDuplicateFinder(host)
  const root = document.getElementById('gpdt-dupes-host')!.shadowRoot!
  ;[...root.querySelectorAll('button')].find((b) => b.textContent === 'Scan this view')!.click()
  await waitFor(() => /to Trash$/.test(root.querySelector('.danger')?.textContent ?? ''))
  return root
}
const trashLabel = (root: ShadowRoot): string => root.querySelector('.danger')!.textContent!
const btn = (root: ShadowRoot, text: RegExp): HTMLButtonElement =>
  [...root.querySelectorAll('button')].find((b) => text.test(b.textContent ?? '')) as HTMLButtonElement
const select = (root: ShadowRoot): HTMLSelectElement => root.querySelector('select')!
const autoBox = (root: ShadowRoot): HTMLInputElement => root.querySelector('.tools input[type=checkbox]')!

beforeEach(() => { document.body.innerHTML = ''; calls = [] })

describe('free users', () => {
  for (const label of ['no isPro on the host', 'isPro false']) {
    it(`keep today's behaviour and see disabled Pro controls (${label})`, async () => {
      const root = await open(label === 'isPro false' ? false : undefined)
      expect(trashLabel(root)).toBe('Move 2 to Trash')
      expect(select(root).disabled).toBe(true)
      expect(autoBox(root).disabled).toBe(true)
      expect(btn(root, /^Export CSV$/).disabled).toBe(true)
      const links = [...root.querySelectorAll<HTMLAnchorElement>('a.pro-tag')]
      expect(links).toHaveLength(3)
      for (const a of links) {
        expect(a.textContent).toBe('Pro')
        const u = new URL(a.href)
        expect(u.origin + u.pathname).toBe('https://buy.sylphx.com/buy/gpdt')
        expect(u.searchParams.get('utm_medium')).toBe('dupes')
      }
      // Forced events change nothing.
      select(root).value = 'newest'
      select(root).dispatchEvent(new Event('change'))
      autoBox(root).checked = true
      autoBox(root).dispatchEvent(new Event('change'))
      expect(trashLabel(root)).toBe('Move 2 to Trash')
      expect(root.querySelectorAll('.item.delete')).toHaveLength(2)
      expect(root.textContent).not.toMatch(/Approve this group/)
    })
  }
  it('a failing isPro check counts as free', async () => {
    const host: FinderHost = {
      runDelete: async () => ({ ok: true }), stopRun: () => undefined, consentAcknowledged: async () => true,
      acknowledgeConsent: async () => undefined, onRunProgress: () => () => undefined, scanDeps,
      isPro: async () => { throw new Error('storage') },
    }
    openDuplicateFinder(host)
    const root = document.getElementById('gpdt-dupes-host')!.shadowRoot!
    btn(root, /Scan this view/).click()
    await waitFor(() => !!root.querySelector('.danger'))
    expect(select(root).disabled).toBe(true)
  })
})

describe('Pro users', () => {
  it('apply a keep rule to all groups, still one keeper each', async () => {
    const root = await open(true)
    expect(select(root).disabled).toBe(false)
    expect(root.querySelector('a.pro-tag')).toBeNull()
    select(root).value = 'newest'
    select(root).dispatchEvent(new Event('change'))
    expect(trashLabel(root)).toBe('Move 2 to Trash')
    const trashed = [...root.querySelectorAll('.group')].map((g) => g.querySelectorAll('.item.keep').length)
    expect(trashed).toEqual([1, 1])
    expect(root.textContent).toMatch(/had no date data|Applied to 2 groups/)
  })

  it('auto-accept pre-approves confident groups; the rest need approval; the user still confirms', async () => {
    const root = await open(true)
    autoBox(root).checked = true
    autoBox(root).dispatchEvent(new Event('change'))
    expect(trashLabel(root)).toBe('Move 1 to Trash')
    expect(root.querySelectorAll('.group')).toHaveLength(1) // one combined review list
    btn(root, /^Approve this group$/).click()
    expect(trashLabel(root)).toBe('Move 2 to Trash')
    expect(calls).toHaveLength(0) // nothing moved without pressing the button
    btn(root, /^Move 2 to Trash$/).click()
    await waitFor(() => calls.length === 1)
    expect(calls[0].ids).toHaveLength(2)
    expect(calls[0].dryRun).toBe(false)
  })

  it('exports the groups as a local CSV with no network call', async () => {
    const root = await open(true)
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    let blob: Blob | undefined
    URL.createObjectURL = ((b: Blob) => { blob = b; return 'blob:test' }) as typeof URL.createObjectURL
    URL.revokeObjectURL = () => undefined
    btn(root, /^Export CSV$/).click()
    expect(blob).toBeDefined()
    const text = await blob!.text()
    const lines = text.trim().split('\n')
    expect(lines[0]).toBe('group_id,item_id,decision,similarity')
    expect(lines).toHaveLength(5)
    expect(lines.filter((l) => l.includes(',trashed,'))).toHaveLength(2)
    expect(fetchSpy).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })
})

describe('auto-accept count and keep rule after regroup', () => {
  const slider = (root: ShadowRoot): HTMLInputElement => root.querySelector('input[type=range]')!
  const setSlider = async (root: ShadowRoot, value: number, groupCount: number): Promise<void> => {
    slider(root).value = String(value)
    slider(root).dispatchEvent(new Event('input'))
    // The debounce plus the async regroup replace the whole review.
    await waitFor(() => root.querySelectorAll('.group').length === groupCount && !!root.querySelector('.danger'))
  }
  const keepers = (root: ShadowRoot): string[] =>
    [...root.querySelectorAll('.group')].map((g) => g.querySelectorAll('.item.keep').length + ':' + g.querySelectorAll('.item').length)

  it('shows the auto-accepted count next to the show control and counts them in the Trash total', async () => {
    const root = await open(true)
    autoBox(root).checked = true
    autoBox(root).dispatchEvent(new Event('change'))
    const show = btn(root, /auto-accepted/)
    expect(show.textContent).toBe('1 group auto-accepted (show)')
    expect(trashLabel(root)).toBe('Move 1 to Trash') // the auto-accepted group is already in the total
    show.click()
    expect(btn(root, /auto-accepted/).textContent).toBe('1 group auto-accepted (hide)')
    expect(root.querySelectorAll('.group')).toHaveLength(2)
  })

  it('re-applies the selected keep rule to groups created by the similarity slider', async () => {
    const root = await open(true)
    await setSlider(root, 100, 1) // only the identical pair groups now (the other pair is not identical)
    expect(root.querySelectorAll('.group')).toHaveLength(1)
    select(root).value = 'newest'
    select(root).dispatchEvent(new Event('change'))
    await setSlider(root, 95, 2) // the 95.3% pair joins as a new group
    expect(select(root).value).toBe('newest')
    // One keeper per group, and it is the newest photo (a1, b1) in both.
    expect(keepers(root)).toEqual(['1:2', '1:2'])
    const keptIds = [...root.querySelectorAll('.item.keep a')].map((a) => (a as HTMLAnchorElement).href)
    expect(keptIds.some((u) => u.endsWith('/a1'))).toBe(true)
    expect(keptIds.some((u) => u.endsWith('/b1'))).toBe(true)
    expect(trashLabel(root)).toBe('Move 2 to Trash')
  })

  it('keeps a manual Keep flip when the similarity slider regroups', async () => {
    const root = await open(true)
    select(root).value = 'newest'
    select(root).dispatchEvent(new Event('change'))
    expect(trashLabel(root)).toBe('Move 2 to Trash')
    // Flip one red photo to Keep by hand.
    ;(root.querySelector('.item.delete img') as HTMLElement).click()
    expect(trashLabel(root)).toBe('Move 1 to Trash')
    // Only the identical pair groups at 100%: it holds the flip, so it is not re-ruled.
    await setSlider(root, 100, 1)
    expect(select(root).value).toBe('newest')
    expect(root.querySelectorAll('.item.keep')).toHaveLength(2) // the flip survived
    expect(trashLabel(root)).toBe('Move 0 to Trash') // the Trash count did not rise
    // Choosing a rule on purpose replaces the flip.
    select(root).value = 'oldest'
    select(root).dispatchEvent(new Event('change'))
    expect(trashLabel(root)).toBe('Move 1 to Trash')
  })
})
