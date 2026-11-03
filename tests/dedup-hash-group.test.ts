/**
 * Duplicate finding core: perceptual hash, similarity, grouping, and the
 * keep/Trash choices. Golden vectors come from SylphxAI/photo-dedup
 * (fixtures/phash and fixtures/duplicate-groups at 6304ec8), so these
 * tests prove the port gives the same answers as the source crate.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  fromHex,
  hammingDistance,
  maxDistanceFor,
  pack,
  perceptualHash,
  popcount32,
  rgbaToGray,
  similarityFromDistance,
  toHex,
} from '../src/core/dedup/phash'
import { groupDuplicates, GroupingAborted, selectBestItem, type DupItem } from '../src/core/dedup/group'
import { keepOnly, planDeletion, toggleChoice, groupChoices, type Overrides } from '../src/core/dedup/selection'

const here = dirname(fileURLToPath(import.meta.url))
const fixture = (name: string): unknown => JSON.parse(readFileSync(resolve(here, 'fixtures', name), 'utf-8'))

const size = 32
const corpus: Record<string, () => number[]> = {
  gradient: () => Array.from({ length: size * size }, (_, i) => ((i % size) + Math.floor(i / size)) % 256),
  checker: () => Array.from({ length: size * size }, (_, i) => (((i % size) ^ Math.floor(i / size)) & 8 ? 255 : 0)),
  solid128: () => new Array(size * size).fill(128),
  solid0: () => new Array(size * size).fill(0),
}

const hex = (h: string): DupItem['hash'] => pack(fromHex(h)!)

describe('perceptual hash (parity with photo-dedup)', () => {
  const golden = fixture('photo-dedup-phash.json') as {
    fixtures: { name: string; hashHex: string }[]
    similarityPairs: { hash1: string; hash2: string; distance: number; similarity: number }[]
  }

  for (const f of golden.fixtures) {
    it(`hashes the ${f.name} fixture to ${f.hashHex}`, () => {
      expect(toHex(perceptualHash(corpus[f.name]()))).toBe(f.hashHex)
    })
  }

  for (const p of golden.similarityPairs) {
    it(`distance ${p.hash1} vs ${p.hash2} is ${p.distance}`, () => {
      const d = hammingDistance(hex(p.hash1), hex(p.hash2))
      expect(d).toBe(p.distance)
      expect(similarityFromDistance(d)).toBeCloseTo(p.similarity, 12)
    })
  }

  it('refuses a buffer that is not 32x32', () => {
    expect(() => perceptualHash(new Array(100).fill(0))).toThrow(/expected 1024/)
  })

  it('hex round-trips and rejects malformed input', () => {
    expect(toHex(fromHex('0102a8020b02200a')!)).toBe('0102a8020b02200a')
    expect(fromHex('xyz')).toBeNull()
    expect(fromHex('0102')).toBeNull()
  })

  it('counts bits and converts RGBA to gray', () => {
    expect(popcount32(0)).toBe(0)
    expect(popcount32(0xffffffff)).toBe(32)
    expect(popcount32(0b1011)).toBe(3)
    expect([...rgbaToGray([255, 255, 255, 255, 0, 0, 0, 255, 255, 0, 0, 255])]).toEqual([255, 0, 76])
  })

  it('a brighter copy hashes within a few bits of the original', () => {
    const base = corpus.gradient().map((v, i) => (v * 7 + (i % 13) * 3) % 256)
    const brighter = base.map((v) => Math.min(255, Math.round(v * 1.05 + 4)))
    const d = hammingDistance(pack(perceptualHash(base)), pack(perceptualHash(brighter)))
    expect(d).toBeLessThanOrEqual(maxDistanceFor(0.9))
  })

  it('maps a similarity threshold to the largest allowed distance', () => {
    expect(maxDistanceFor(1)).toBe(0)
    expect(maxDistanceFor(0.95)).toBe(3)
    expect(maxDistanceFor(0.9)).toBe(6)
    expect(maxDistanceFor(0.8)).toBe(12)
  })
})

describe('grouping (parity with photo-dedup group_duplicates)', () => {
  const golden = fixture('photo-dedup-duplicate-groups.json') as {
    scenarios: {
      name: string
      frames: unknown[]
      items: { id: string; phash: string; width?: number; height?: number; googleCreatedAtMs?: number }[]
      expectedGroups: { itemIds: string[]; bestItemId: string; averageSimilarity: number }[]
    }[]
  }
  // Video-frame matching has no counterpart in the grid (a video tile is
  // hashed from its thumbnail like a photo), so only image scenarios apply.
  for (const s of golden.scenarios.filter((x) => x.frames.length === 0)) {
    it(`matches the ${s.name} scenario`, async () => {
      const items: DupItem[] = s.items.map((i) => ({
        id: i.id,
        hash: hex(i.phash),
        width: i.width,
        height: i.height,
        takenAt: i.googleCreatedAtMs,
      }))
      const groups = await groupDuplicates(items, { threshold: 0.95 })
      expect(groups.map((g) => ({ itemIds: g.itemIds, bestItemId: g.bestItemId, averageSimilarity: g.averageSimilarity })))
        .toEqual(s.expectedGroups.map((g) => ({ itemIds: g.itemIds, bestItemId: g.bestItemId, averageSimilarity: g.averageSimilarity })))
    })
  }

  it('picks the best item: most pixels, then oldest, then first', () => {
    const base = { hash: hex('0000000000000000') }
    expect(selectBestItem([
      { ...base, id: 'small', width: 10, height: 10 },
      { ...base, id: 'big', width: 20, height: 20 },
    ])?.id).toBe('big')
    expect(selectBestItem([
      { ...base, id: 'new', takenAt: 2000 },
      { ...base, id: 'old', takenAt: 1000 },
      { ...base, id: 'unknown' },
    ])?.id).toBe('old')
    expect(selectBestItem([{ ...base, id: 'first' }, { ...base, id: 'second' }])?.id).toBe('first')
    expect(selectBestItem([])).toBeNull()
  })

  it('a lower threshold groups looser matches', async () => {
    const items: DupItem[] = [
      { id: 'a', hash: hex('0000000000000000') },
      { id: 'b', hash: hex('000000000000001f') }, // 5 bits away
    ]
    expect(await groupDuplicates(items, { threshold: 0.95 })).toEqual([])
    const loose = await groupDuplicates(items, { threshold: 0.9 })
    expect(loose.map((g) => g.itemIds)).toEqual([['a', 'b']])
  })

  it('finds exactly the pairs a brute-force scan finds, at every threshold', async () => {
    // Random hashes plus planted near-copies, checked against O(n^2).
    let seed = 42
    const rand = (): number => { seed = (seed * 1103515245 + 12345) >>> 0; return seed }
    const items: DupItem[] = []
    for (let i = 0; i < 400; i++) {
      const h = { lo: rand(), hi: rand() }
      items.push({ id: `r${i}`, hash: h })
      if (i % 5 === 0) {
        const flips = i % 11
        let lo = h.lo, hi = h.hi
        for (let f = 0; f < flips; f++) {
          const bit = rand() % 64
          if (bit < 32) lo = (lo ^ (1 << bit)) >>> 0
          else hi = (hi ^ (1 << (bit - 32))) >>> 0
        }
        items.push({ id: `c${i}`, hash: { lo, hi } })
      }
    }
    for (const threshold of Array.from({ length: 65 }, (_, distance) => 1 - distance / 64)) {
      const maxD = maxDistanceFor(threshold)
      const grouped = new Set<number>()
      const expected: string[][] = []
      for (let i = 0; i < items.length; i++) {
        if (grouped.has(i)) continue
        const found: { j: number; d: number }[] = []
        for (let j = i + 1; j < items.length; j++) {
          if (grouped.has(j)) continue
          const d = hammingDistance(items[i].hash, items[j].hash)
          if (d <= maxD) found.push({ j, d })
        }
        if (found.length === 0) continue
        found.sort((a, b) => a.d - b.d || a.j - b.j)
        grouped.add(i)
        found.forEach((f) => grouped.add(f.j))
        expected.push([items[i].id, ...found.map((f) => items[f.j].id)])
      }
      const groups = await groupDuplicates(items, { threshold })
      expect(groups.map((g) => g.itemIds)).toEqual(expected)
    }
  })

  it('yields to the page, reports progress, and stops when cancelled', async () => {
    const items: DupItem[] = Array.from({ length: 5000 }, (_, i) => ({ id: `x${i}`, hash: { lo: i, hi: i * 7 } }))
    let clock = 0
    let yields = 0
    const progress: number[] = []
    await groupDuplicates(items, {
      threshold: 0.9,
      now: () => (clock += 1),
      sliceMs: 5,
      yieldToHost: async () => { yields++ },
      onProgress: (done) => progress.push(done),
    })
    expect(yields).toBeGreaterThan(0)
    expect(progress.at(-1)).toBe(5000)

    const ctrl = new AbortController()
    const run = groupDuplicates(items, {
      now: () => (clock += 1),
      sliceMs: 5,
      yieldToHost: async () => { ctrl.abort() },
      signal: ctrl.signal,
    })
    await expect(run).rejects.toBeInstanceOf(GroupingAborted)
  })

  it('groups 30,000 items with planted copies correctly', async () => {
    let seed = 7
    const rand = (): number => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed }
    const items: DupItem[] = []
    for (let i = 0; i < 30_000; i++) {
      const h = { lo: rand(), hi: rand() }
      items.push({ id: `p${i}`, hash: h })
      if (i % 100 === 0) items.push({ id: `copy${i}`, hash: { lo: (h.lo ^ 1) >>> 0, hi: h.hi } })
    }
    const groups = await groupDuplicates(items.slice(0, 30_000), { threshold: 0.95 })
    const pairs = groups.filter((g) => g.itemIds.some((id) => id.startsWith('copy')))
    expect(pairs.length).toBe(groups.length)
    expect(pairs.length).toBeGreaterThan(290)
  })
})

describe('keep / Trash choices', () => {
  const group = { itemIds: ['a', 'b', 'c'], similarities: [1, 1, 1], bestItemId: 'b', averageSimilarity: 1 }

  it('keeps the best item and trashes the rest by default', () => {
    const o: Overrides = new Map()
    expect(groupChoices(group, o)).toEqual(['delete', 'keep', 'delete'])
    expect(planDeletion([group], o)).toEqual({ ids: ['a', 'c'], kept: 1, groups: 1 })
  })

  it('lets the person switch items but never empties a group', () => {
    const o: Overrides = new Map()
    expect(toggleChoice(group, 'b', o)).toEqual({ ok: false, reason: 'last-kept' })
    expect(toggleChoice(group, 'a', o)).toEqual({ ok: true })
    expect(toggleChoice(group, 'b', o)).toEqual({ ok: true })
    expect(groupChoices(group, o)).toEqual(['keep', 'delete', 'delete'])
    expect(toggleChoice(group, 'zzz', o)).toEqual({ ok: false, reason: 'not-in-group' })
  })

  it('keepOnly makes one item the sole keeper', () => {
    const o: Overrides = new Map()
    keepOnly(group, 'c', o)
    expect(planDeletion([group], o).ids).toEqual(['a', 'b'])
  })

  it('falls back to keeping the best item if old choices would keep nothing', () => {
    // e.g. the threshold changed and the kept item left the group.
    const o: Overrides = new Map([['a', 'delete'], ['b', 'delete'], ['c', 'delete']])
    expect(groupChoices(group, o)).toEqual(['delete', 'keep', 'delete'])
  })
})
