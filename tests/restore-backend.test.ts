import { describe, expect, it, vi } from 'vitest'
import { API_ORIGIN, MONEY_PARENT } from '../src/core/restore/wallet'
import type { ScannedItem } from '../src/core/dedup/scan'
import {
  PROBE_PX, classifyThumbnails, createRestoreBackend, verdictOf, walletStateOf,
} from '../src/extension/restore-backend'
import { fake } from './fixtures/fake-tokens'

const GOOGLE = 'https://lh3.googleusercontent.com/pw/AP1Gcz=w2048-h2048-no'
const photo = { id: 'AF1Qip', previewUrl: GOOGLE, sourceUrl: GOOGLE }
const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const signal = () => new AbortController().signal

describe('wallet state', () => {
  it('shows disconnected without a stored token and never calls the wallet', async () => {
    const fetchImpl = vi.fn<typeof fetch>()
    const backend = createRestoreBackend({ readToken: async () => null, fetchImpl })
    expect(await backend.wallet()).toEqual({ kind: 'disconnected' })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('maps the server balance, with the pass when a subscription is active', () => {
    expect(walletStateOf({ balance: 12, trialGranted: true, subscriptionActive: false, subjectId: 'u' })).toEqual({ kind: 'credits', credits: 12 })
    expect(walletStateOf({ balance: 41, trialGranted: true, subscriptionActive: true, subjectId: 'u' })).toEqual({ kind: 'pass', credits: 41, monthly: 50 })
  })

  it('fails the wallet check instead of guessing a balance', async () => {
    const backend = createRestoreBackend({ readToken: async () => fake('sess', 'token', '123'), fetchImpl: async () => json({}, 500) })
    await expect(backend.wallet()).rejects.toThrow()
  })
})

describe('restore', () => {
  it('reads the photo from Google, sends exactly that photo once, and returns the 4K image', async () => {
    const calls: { url: string; init?: RequestInit }[] = []
    const fetchImpl = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input)
      calls.push({ url, init })
      if (url === GOOGLE) return new Response(new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' }))
      return json({ restoredImageB64: btoa('restored'), mimeType: 'image/png', width: 3840, height: 2880, remainingCredits: 9 })
    })
    const backend = createRestoreBackend({ readToken: async () => fake('sess', 'token', '123'), fetchImpl })
    const result = await backend.restore(photo, { signal: signal() })
    expect(result).toMatchObject({ width: 3840, height: 2880 })
    expect(result.image.type).toBe('image/png')
    expect(calls.map((c) => c.url)).toEqual([GOOGLE, `${API_ORIGIN}/v1/money/${MONEY_PARENT}/images:restore`])
    const headers = calls[1].init!.headers as Record<string, string>
    expect(Object.keys(headers).map((k) => k.toLowerCase())).not.toContain('sylphx-data-policy')
    expect(JSON.parse(String(calls[1].init!.body))).toMatchObject({ photo_id: 'AF1Qip', image_base64: btoa('\u0001\u0002\u0003') })
  })

  it('never reads or sends a photo from a non-Google address', async () => {
    const fetchImpl = vi.fn<typeof fetch>()
    const backend = createRestoreBackend({ readToken: async () => fake('sess', 'token', '123'), fetchImpl })
    await expect(backend.restore({ ...photo, sourceUrl: 'https://evil.example/p.jpg' }, { signal: signal() })).rejects.toThrow('Nothing was sent')
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('sends nothing without a connected wallet', async () => {
    const fetchImpl = vi.fn<typeof fetch>()
    const backend = createRestoreBackend({ readToken: async () => null, fetchImpl })
    await expect(backend.restore(photo, { signal: signal() })).rejects.toThrow('Nothing was sent')
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('explains an empty wallet and a failed restore without claiming success', async () => {
    const run = (res: Response) => createRestoreBackend({
      readToken: async () => fake('sess', 'token', '123'),
      fetchImpl: async (input) => (String(input) === GOOGLE ? new Response(new Blob([new Uint8Array([1])])) : res),
    }).restore(photo, { signal: signal() })
    await expect(run(json({ code: 'INSUFFICIENT_CREDITS' }, 402))).rejects.toThrow('out of credits')
    await expect(run(json({ error: 'upstream_timeout' }, 504))).rejects.toThrow('not charged')
    await expect(run(json({ restoredImageB64: '' }))).rejects.toThrow('could not be restored')
  })
})

describe('on-device quality check', () => {
  const flat = (w: number, h: number) => new Uint8ClampedArray(w * h * 4).fill(128)
  const sharp = (w: number, h: number) => {
    const d = new Uint8ClampedArray(w * h * 4)
    for (let i = 0; i < w * h; i++) d.fill(((i % w) + Math.floor(i / w)) % 2 ? 255 : 0, i * 4, i * 4 + 3)
    for (let i = 3; i < d.length; i += 4) d[i] = 255
    return d
  }

  it('flags a featureless image as blurry and a crisp one as sharp', () => {
    expect(verdictOf(flat(PROBE_PX, PROBE_PX), PROBE_PX, PROBE_PX).kind).toBe('blurry')
    expect(verdictOf(sharp(PROBE_PX, PROBE_PX), PROBE_PX, PROBE_PX).kind).toBe('sharp')
  })

  it('calls a photo low-res only when the host returns fewer pixels than asked for', () => {
    expect(verdictOf(sharp(320, 240), 320, 240)).toMatchObject({ kind: 'low-res', width: 320, height: 240 })
    expect(verdictOf(sharp(PROBE_PX, 384), PROBE_PX, 384).kind).toBe('sharp')
  })

  it('reads only Google thumbnails and gives no verdict for unreadable ones', async () => {
    const items = [
      { id: 'a', thumbUrl: 'https://lh3.googleusercontent.com/pw/A=w200-h200-no' },
      { id: 'b', thumbUrl: 'https://evil.example/b=w200-h200' },
      { id: 'c', thumbUrl: 'https://lh3.googleusercontent.com/pw/C=w200-h200-no' },
    ] as ScannedItem[]
    const fetchImpl = vi.fn<typeof fetch>(async (input) =>
      String(input).includes('/C=') ? new Response('', { status: 404 }) : new Response(new Blob([new Uint8Array([0])])))
    const progress: number[] = []
    const out = await classifyThumbnails(items, { signal: signal(), onProgress: (n) => progress.push(n) }, fetchImpl,
      async () => ({ data: flat(PROBE_PX, PROBE_PX), width: PROBE_PX, height: PROBE_PX }))
    expect([...out.keys()]).toEqual(['a'])
    expect(fetchImpl.mock.calls.map((c) => String(c[0]))).toEqual([
      `https://lh3.googleusercontent.com/pw/A=w${PROBE_PX}-h${PROBE_PX}-no`,
      `https://lh3.googleusercontent.com/pw/C=w${PROBE_PX}-h${PROBE_PX}-no`,
    ])
    expect(progress.sort()).toEqual([1, 2, 3])
  })
})
