import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { SELF_SERVE_CHECKOUT_URL, SELF_SERVE_RECOVER_URL } from '../src/core/pro-moments'

// Every released extension's Pro link opens README#pro (PRO_URL in
// src/core/pro-moments.ts, unchanged since 3.5.x), so that section is the buy
// entry for installs that predate the in-extension checkout switch.
const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8')
const site = JSON.parse(readFileSync(new URL('../site/config.json', import.meta.url), 'utf8')) as {
  checkoutUrl: string
  recoverUrl: string
}

function proSection(): string {
  const start = readme.indexOf('\n## Pro\n')
  expect(start).toBeGreaterThan(-1)
  const end = readme.indexOf('\n## ', start + 1)
  return readme.slice(start, end === -1 ? undefined : end)
}

describe('README #pro buy entry', () => {
  it('links the self-serve checkout and the licence recovery page', () => {
    const pro = proSection()
    expect(pro).toContain(`**[Buy Pro for US$9.99](${SELF_SERVE_CHECKOUT_URL})**`)
    expect(pro).toContain(`<${SELF_SERVE_RECOVER_URL}>`)
  })

  it('uses the same checkout URLs as the extension and the landing page', () => {
    expect(SELF_SERVE_CHECKOUT_URL).toBe(site.checkoutUrl)
    expect(SELF_SERVE_RECOVER_URL).toBe(site.recoverUrl)
  })

  it('has no checkout placeholder or Stripe Payment Link left', () => {
    const pro = proSection()
    expect(pro).not.toContain('PRO_CHECKOUT_URL')
    expect(pro).not.toContain('buy.stripe.com')
  })
})
