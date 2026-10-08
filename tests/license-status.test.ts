import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it } from 'vitest'
import { encodeBase64Url, verifyLicense } from '../src/core/license'
import { LOCALES, setLocale } from '../src/extension/popup/i18n'
import { licenseStatusText } from '../src/extension/popup/license-status'

// No seller key or purchaser token is needed to exercise rejected inputs.
function token(payload: unknown): string {
  return `${encodeBase64Url(new TextEncoder().encode(JSON.stringify(payload)))}.${encodeBase64Url(new Uint8Array(64))}`
}

afterEach(() => { setLocale('en') })

describe('localized license failure reasons', () => {
  for (const locale of LOCALES) {
    it(`${locale.code}: explains malformed, wrong-product/plan and bad-signature separately`, async () => {
      setLocale(locale.code)
      const copy = locale.translations.settings.license
      const cases = [
        { input: 'not-a-token', reason: 'malformed', message: copy.malformed },
        { input: token({ plan: 'pro', product: 'another-product', expiresAt: 1 }), reason: 'wrong-plan', message: copy.wrongPlan },
        { input: token({ plan: 'free', issuedAt: 1 }), reason: 'wrong-plan', message: copy.wrongPlan },
        { input: token({ plan: 'pro', product: 'gpdt', issuedAt: 1 }), reason: 'bad-signature', message: copy.badSignature },
      ]
      for (const test of cases) {
        const result = await verifyLicense(test.input)
        expect(result).toEqual({ ok: false, reason: test.reason })
        expect(licenseStatusText(result)).toBe(test.message)
        expect(test.message.trim()).not.toBe('')
      }
      expect(new Set([copy.malformed, copy.wrongPlan, copy.badSignature]).size).toBe(3)
      expect(copy.wrongPlan).toContain('Google Photos Delete Tool Pro')
      expect(copy.wrongPlan).toContain('GPDT')
      expect(licenseStatusText({ ok: true, payload: { plan: 'pro', issuedAt: 1 } })).toBe(copy.active)
    })
  }

  it('both saved-token refresh and failed activation use the shared reason mapping', () => {
    const popup = readFileSync(new URL('../src/extension/popup/popup.ts', import.meta.url), 'utf8')
    const refresh = popup.slice(popup.indexOf('async function refreshProState'), popup.indexOf("licenseBtn.addEventListener"))
    const activation = popup.slice(popup.indexOf("licenseBtn.addEventListener"), popup.indexOf('// ─── Content-script communication'))
    for (const path of [refresh, activation]) {
      expect(path).toContain('licenseStatus.textContent = licenseStatusText(result)')
      expect(path).not.toContain('settings.license.invalid')
    }
    expect(activation.indexOf('if (!result.ok)')).toBeLessThan(activation.indexOf('await writeProToken(token)'))
  })
})
