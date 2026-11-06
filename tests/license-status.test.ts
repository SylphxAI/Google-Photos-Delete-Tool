import { afterEach, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { licenseStatusKey } from '../src/extension/popup/license-status'
import { LOCALES, setLocale, t } from '../src/extension/popup/i18n'

afterEach(() => { setLocale('en') })

describe('licence status in every popup locale', () => {
  it('distinguishes expiry from an invalid token, and keeps valid tokens active', () => {
    for (const { code } of LOCALES) {
      setLocale(code)
      const expired = licenseStatusKey({ ok: false, reason: 'expired' })
      expect(expired).toBe('settings.license.expired')
      expect(t(expired)).not.toBe(expired)
      expect(t(expired).length).toBeGreaterThan(10)
      for (const reason of ['malformed', 'bad-signature', 'wrong-plan'] as const) {
        const invalid = licenseStatusKey({ ok: false, reason })
        expect(invalid).toBe('settings.license.invalid')
        expect(t(invalid)).not.toBe(t(expired))
      }
      expect(licenseStatusKey({ ok: true, payload: { plan: 'pro', issuedAt: 1 }, authority: 'legacy' }))
        .toBe('settings.license.active')
    }
  })

  it('uses the shared status mapping for both activation and stored-token refresh', () => {
    const popup = readFileSync(new URL('../src/extension/popup/popup.ts', import.meta.url), 'utf8')
    expect(popup.match(/t\(licenseStatusKey\(result\)\)/g)).toHaveLength(3)
  })
})
