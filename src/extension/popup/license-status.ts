import type { LicenseResult } from '../../core/license'
import { t } from './i18n'

const ERROR_KEYS: Record<Extract<LicenseResult, { ok: false }>['reason'], string> = {
  malformed: 'settings.license.malformed',
  'wrong-plan': 'settings.license.wrongPlan',
  'bad-signature': 'settings.license.badSignature',
}

/** One localized result for both activation and a stored token's refresh. */
export function licenseStatusText(result: LicenseResult): string {
  return t(result.ok ? 'settings.license.active' : ERROR_KEYS[result.reason])
}
