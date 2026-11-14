/**
 * Cross-surface wiring contracts whose text *is* the postcondition:
 * published popup/panel DOM ids, and the popup↔content message-action
 * set. Implementation source greps are not oracles.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const read = (p: string): string => readFileSync(resolve(root, p), 'utf-8')

describe('popup DOM id binding', () => {
  const popupTs = read('src/extension/popup/popup.ts')
  const popupHtml = read('src/extension/popup/popup.html')

  it('every getElementById target exists in popup.html', () => {
    const refs = [...popupTs.matchAll(/getElementById\('([^']+)'\)/g)].map(m => m[1])
    const ids = new Set([...popupHtml.matchAll(/id="([^"]+)"/g)].map(m => m[1]))
    const missing = refs.filter(id => !ids.has(id))
    expect(missing).toEqual([])
  })

  it('every mountIcon target exists in popup.html', () => {
    const refs = [...popupTs.matchAll(/mountIcon\('([^']+)'/g)].map(m => m[1])
    const ids = new Set([...popupHtml.matchAll(/id="([^"]+)"/g)].map(m => m[1]))
    const missing = refs.filter(id => !ids.has(id))
    expect(missing).toEqual([])
  })
})

describe('panel DOM id binding', () => {
  const panelTs = read('src/ui/panel/panel.ts')

  it('every $() target exists in the panel template', () => {
    const refs = [...panelTs.matchAll(/\$\s*<[^>]+>\s*\('([^']+)'\)/g)].map(m => m[1])
    const ids = new Set([...panelTs.matchAll(/id="([^"]+)"/g)].map(m => m[1]))
    const missing = refs.filter(id => !ids.has(id))
    expect(missing).toEqual([])
  })
})

describe('content <-> popup message contract', () => {
  const popupTs = read('src/extension/popup/popup.ts')
  const contentTs = read('src/extension/content.ts')

  it('every action the popup sends is handled by content, and vice versa', () => {
    const sent = new Set([...popupTs.matchAll(/action:\s*'([^']+)'/g)].map(m => m[1]))
    const handled = new Set([...contentTs.matchAll(/case '([^']+)':/g)].map(m => m[1]))
    expect([...sent].sort()).toEqual([...handled].sort())
  })
})

describe('published permanent empty-trash warning copy', () => {
  it('popup HTML presents the permanent-action warning', () => {
    const popupHtml = read('src/extension/popup/popup.html')
    expect(popupHtml).toContain('id="empty-trash-warning"')
    expect(popupHtml).toContain('"Empty trash afterwards" is PERMANENT — no recovery.')
  })

  it('panel template presents the permanent-action warning', () => {
    const panelTs = read('src/ui/panel/panel.ts')
    expect(panelTs).toContain('id="gpdt-empty-warning"')
    expect(panelTs).toContain('"Empty trash afterwards" is PERMANENT with no recovery.')
  })
})

describe('AI 4K Restore popup entry', () => {
  it('ships hidden until the page reports restore support', () => {
    const popupHtml = read('src/extension/popup/popup.html')
    expect(popupHtml).toMatch(/<button[^>]*id="restore-btn"[^>]*\shidden[\s>]/)
  })
})
