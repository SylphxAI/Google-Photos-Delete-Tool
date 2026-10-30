import { describe, expect, it } from 'vitest'
import { groupDuplicates, GroupingAborted, type DupItem } from '../src/core/dedup/group'

describe('duplicate grouping responsiveness', () => {
  it('rejects a pre-aborted signal before reading any item, including an empty input', async () => {
    const ctrl = new AbortController()
    ctrl.abort()
    const items = [{ id: 'unread', get hash(): DupItem['hash'] { throw new Error('item was read') } }]
    await expect(groupDuplicates(items, { signal: ctrl.signal })).rejects.toBeInstanceOf(GroupingAborted)
    await expect(groupDuplicates([], { signal: ctrl.signal })).rejects.toBeInstanceOf(GroupingAborted)
  })

  it('lets Stop interrupt index construction before every item is read', async () => {
    const ctrl = new AbortController()
    let reads = 0
    let clock = 0
    const items: DupItem[] = Array.from({ length: 10_000 }, (_, i) => ({
      id: String(i),
      get hash() { reads++; return { lo: i, hi: i * 7 } },
    }))
    await expect(groupDuplicates(items, {
      signal: ctrl.signal,
      now: () => clock++,
      sliceMs: 3,
      yieldToHost: async () => { ctrl.abort() },
    })).rejects.toBeInstanceOf(GroupingAborted)
    expect(reads).toBeGreaterThan(0)
    expect(reads).toBeLessThan(items.length)
  })

  it('lets Stop interrupt a dense candidate bucket inside the first seed', async () => {
    const ctrl = new AbortController()
    const n = 10_000
    let reads = 0
    let clock = 0
    const items: DupItem[] = Array.from({ length: n }, (_, i) => ({
      id: String(i),
      get hash() {
        // Default threshold builds four bands before looking up the seed.
        if (++reads > 4 * n) clock = 1
        return { lo: 0, hi: 0 }
      },
    }))
    const progress: number[] = []
    await expect(groupDuplicates(items, {
      signal: ctrl.signal,
      now: () => clock,
      sliceMs: 1,
      yieldToHost: async () => { ctrl.abort() },
      onProgress: done => progress.push(done),
    })).rejects.toBeInstanceOf(GroupingAborted)
    expect(reads).toBeGreaterThan(4 * n)
    expect(reads).toBeLessThan(5 * n)
    expect(progress).toEqual([0])
  })

  it('preserves a large group, best-item ties, and monotonic progress across yields', async () => {
    const items: DupItem[] = Array.from({ length: 5000 }, (_, i) => ({
      id: String(i), hash: { lo: 0, hi: 0 }, width: i >= 2500 ? 20 : 10, height: 10,
      takenAt: i >= 3000 ? 1 : 2,
    }))
    let clock = 0
    let yields = 0
    const progress: number[] = []
    const groups = await groupDuplicates(items, {
      now: () => clock++, sliceMs: 2,
      yieldToHost: async () => { yields++ },
      onProgress: done => progress.push(done),
    })
    expect(groups).toEqual([{
      itemIds: items.map(item => item.id), similarities: new Array(items.length).fill(1),
      bestItemId: '3000', averageSimilarity: 1,
    }])
    expect(yields).toBeGreaterThan(0)
    expect(progress.at(-1)).toBe(items.length)
    expect(progress).toEqual([...progress].sort((a, b) => a - b))
  })
})
