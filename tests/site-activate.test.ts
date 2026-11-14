import { readFileSync } from 'node:fs'
import { Window } from 'happy-dom'
import { describe, expect, it, vi } from 'vitest'
import { ACTIVATION_MESSAGE, CHROME_WEB_STORE_ID } from '../src/core/activation'

const code = readFileSync(new URL('../site/activate.js', import.meta.url), 'utf8')
type Reply = { ok: boolean; scope?: string; reason?: string } | undefined
type Send = (id: string, message: { type: string; token: string }, cb: (reply: Reply) => void) => void

let win: Window
let rt: { lastError?: { message: string }; sendMessage: Send } | undefined
const status = () => win.document.getElementById('gpdt-activation-status')?.textContent ?? ''

/** A fresh pricing page; `rt` is chrome.runtime as Chrome exposes it when an installed extension lists this origin. */
function page(ids?: string) {
  win = new Window({ url: 'https://sylphxai.github.io/Google-Photos-Delete-Tool/pricing?session_id=cs_1' })
  const w = win as unknown as Record<string, unknown>
  if (rt) w.chrome = { runtime: rt }
  win.document.body.innerHTML = '<section><pre data-keel-money-licence-token hidden></pre></section>'
  const script = ids ? { getAttribute: () => ids } : null
  const doc = new Proxy(win.document, {
    get: (t, k) => {
      if (k === 'currentScript') return script
      const v = Reflect.get(t, k, t)
      return typeof v === 'function' ? v.bind(t) : v
    },
  })
  new Function('window', 'document', 'MutationObserver', code)(win, doc, win.MutationObserver)
  return win.document.querySelector('pre')!
}

function runtime(handler: ((id: string, token: string) => Reply) | null) {
  if (!handler) return (rt = undefined)
  const r: NonNullable<typeof rt> = {
    sendMessage: vi.fn<Send>((id, message, cb) => {
      queueMicrotask(() => {
        const reply = handler(id, message.token)
        r.lastError = reply === undefined ? { message: 'Could not establish connection. Receiving end does not exist.' } : undefined
        cb(reply)
        r.lastError = undefined
      })
    }),
  }
  return (rt = r)
}

describe('site activation handoff', () => {
  it('sends a checkout licence to the store extension and shows the verified scope', async () => {
    const rt = runtime(() => ({ ok: true, scope: 'Family · 3 accounts/profiles' }))!
    page().textContent = ' signed.valid '
    await vi.waitFor(() => expect(status()).toContain('Pro activated in this browser — Family'))
    expect(rt.sendMessage).toHaveBeenCalledTimes(1)
    expect(vi.mocked(rt.sendMessage).mock.calls[0].slice(0, 2)).toEqual([CHROME_WEB_STORE_ID, { type: ACTIVATION_MESSAGE, token: 'signed.valid' }])
  })

  it('reports an invalid licence without claiming activation', async () => {
    runtime(() => ({ ok: false, reason: 'invalid' }))
    page().textContent = 'forged.invalid'
    await vi.waitFor(() => expect(status()).toContain('has not changed'))
  })

  it('falls back to manual paste when no extension answers', async () => {
    runtime(() => undefined)
    page().textContent = 'signed.valid'
    await vi.waitFor(() => expect(status()).toContain('paste it into the Pro licence box'))
  })

  it('falls back to manual paste when the browser exposes no page-to-extension messaging', async () => {
    runtime(null)
    page().textContent = 'signed.valid'
    await vi.waitFor(() => expect(status()).toContain('paste it into the Pro licence box'))
  })

  it('tries configured extension ids in order (unpacked or test builds)', async () => {
    const rt = runtime((id) => (id === 'dev2' ? { ok: true, scope: 'Personal · 1 account/profile' } : undefined))!
    page('dev1,dev2').textContent = 'signed.valid'
    await vi.waitFor(() => expect(status()).toContain('Personal'))
    expect(vi.mocked(rt.sendMessage).mock.calls.map((c) => c[0])).toEqual(['dev1', 'dev2'])
  })

  it('sends nothing for a malformed token and never stores the licence in the page', async () => {
    const rt = runtime(() => ({ ok: true, scope: 'x' }))!
    page().textContent = 'a.b.c'
    await new Promise((r) => setTimeout(r, 10))
    expect(rt.sendMessage).not.toHaveBeenCalled()
    win.document.querySelector('pre')!.textContent = 'signed.valid'
    await vi.waitFor(() => expect(status()).toContain('Pro activated'))
    expect(win.localStorage.length).toBe(0)
  })
})
