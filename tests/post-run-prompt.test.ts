import { describe, it, expect } from 'vitest'
import {
  claimPostRunPrompt,
  detectBrowser,
  ratingUrlFor,
  shouldShowPostRunPrompt,
  withUtm,
  type PostRunResult,
  type PromptStorage,
} from '../src/core/post-run-prompt'

const ok: PostRunResult = { dryRun: false, stopped: false, status: 'done', deleted: 12, filterKind: 'all' }

function memStorage(initial = false): PromptStorage & { shown: boolean } {
  const s = {
    shown: initial,
    isShown: async () => s.shown,
    markShown: async () => { s.shown = true },
  }
  return s
}

describe('shouldShowPostRunPrompt', () => {
  it('shows for a successful real run with N >= 1', () => {
    expect(shouldShowPostRunPrompt(ok, false)).toBe(true)
    expect(shouldShowPostRunPrompt({ ...ok, deleted: 1 }, false)).toBe(true)
  })
  it('never shows for dry run, failure, stop, N=0, or a trash navigation', () => {
    expect(shouldShowPostRunPrompt({ ...ok, dryRun: true }, false)).toBe(false)
    expect(shouldShowPostRunPrompt({ ...ok, status: 'error' }, false)).toBe(false)
    expect(shouldShowPostRunPrompt({ ...ok, status: 'idle', stopped: true }, false)).toBe(false)
    expect(shouldShowPostRunPrompt({ ...ok, stopped: true }, false)).toBe(false)
    expect(shouldShowPostRunPrompt({ ...ok, deleted: 0 }, false)).toBe(false)
    expect(shouldShowPostRunPrompt({ ...ok, navigatingToTrash: true }, false)).toBe(false)
  })
  it('never shows once already shown', () => {
    expect(shouldShowPostRunPrompt(ok, true)).toBe(false)
  })
})

describe('claimPostRunPrompt', () => {
  it('shows once and persists the flag', async () => {
    const st = memStorage()
    expect(await claimPostRunPrompt(ok, st, 'chrome', false)).not.toBeNull()
    expect(st.shown).toBe(true)
    expect(await claimPostRunPrompt(ok, st, 'chrome', false)).toBeNull()
  })
  it('does not set the flag when conditions fail', async () => {
    const st = memStorage()
    for (const r of [{ ...ok, dryRun: true }, { ...ok, status: 'error' as const }, { ...ok, stopped: true }, { ...ok, deleted: 0 }]) {
      expect(await claimPostRunPrompt(r, st, 'chrome', false)).toBeNull()
    }
    expect(st.shown).toBe(false)
  })
  it('shows nothing when storage fails', async () => {
    const broken: PromptStorage = {
      isShown: async () => { throw new Error('unreadable') },
      markShown: async () => {},
    }
    expect(await claimPostRunPrompt(ok, broken, 'chrome', false)).toBeNull()
  })
  it('uses the real count, singular/plural and duplicate wording', async () => {
    const p = await claimPostRunPrompt(ok, memStorage(), 'chrome', false)
    expect(p?.shareText).toMatch(/^I just cleared 12 photos from Google Photos with this free extension: https:\/\//)
    const d = await claimPostRunPrompt({ ...ok, deleted: 1, filterKind: 'ids' }, memStorage(), 'chrome', false)
    expect(d?.kind).toBe('duplicates')
    expect(d?.shareText).toContain('1 duplicate from')
  })
})

describe('links', () => {
  it('adds UTM parameters', () => {
    const u = new URL(withUtm('https://example.com/x', 'share'))
    expect(u.searchParams.get('utm_source')).toBe('extension')
    expect(u.searchParams.get('utm_medium')).toBe('share')
    expect(u.searchParams.get('utm_campaign')).toBe('post_run')
  })
  it('rating link is the CWS reviews page with rating medium; hidden on Firefox/Edge', () => {
    const u = new URL(ratingUrlFor('chrome')!)
    expect(u.origin + u.pathname).toBe('https://chromewebstore.google.com/detail/jiahfbbfpacpolomdjlpdpiljllcdenb/reviews')
    expect(u.searchParams.get('utm_medium')).toBe('rating')
    expect(ratingUrlFor('firefox')).toBeNull()
    expect(ratingUrlFor('edge')).toBeNull()
  })
  it('share link carries the share medium', async () => {
    const p = await claimPostRunPrompt(ok, memStorage(), 'chrome', false)
    expect(new URL(p!.shareUrl).searchParams.get('utm_medium')).toBe('share')
  })
  it('detects browsers', () => {
    expect(detectBrowser('Mozilla/5.0 Chrome/120 Safari/537 Edg/120')).toBe('edge')
    expect(detectBrowser('Mozilla/5.0 Gecko/20100101 Firefox/121.0')).toBe('firefox')
    expect(detectBrowser('Mozilla/5.0 Chrome/120 Safari/537')).toBe('chrome')
  })
})

describe('post-run Get Pro button', () => {
  it('carries a utm_medium=post_run Pro link for free users only', async () => {
    const free = await claimPostRunPrompt(ok, memStorage(), 'chrome', false)
    expect(free?.proUrl).toBeTruthy()
    const u = new URL(free!.proUrl!)
    expect(u.origin + u.pathname).toBe('https://buy.sylphx.com/buy/gpdt')
    expect(u.searchParams.get('utm_medium')).toBe('post_run')
    expect(u.searchParams.get('utm_source')).toBe('extension')
    const pro = await claimPostRunPrompt(ok, memStorage(), 'chrome', true)
    expect(pro).not.toBeNull()
    expect(pro?.proUrl).toBeNull()
  })
  it('keeps the show-once rule', async () => {
    const st = memStorage()
    expect(await claimPostRunPrompt(ok, st, 'chrome', false)).not.toBeNull()
    expect(await claimPostRunPrompt(ok, st, 'chrome', false)).toBeNull()
  })
})
