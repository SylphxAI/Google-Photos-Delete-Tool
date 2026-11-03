import type { LicenseResult } from '../../core/license'

type FailureReason = Extract<LicenseResult, { ok: false }>['reason']
const FAILURE_KEYS = {
  malformed: 'settings.license.invalid',
  'bad-signature': 'settings.license.invalid',
  'wrong-plan': 'settings.license.invalid',
  expired: 'settings.license.expired',
} as const satisfies Record<FailureReason, string>

/** Activation and stored-token refresh must describe the same verifier result. */
export function licenseStatusKey(result: LicenseResult): string {
  return result.ok ? 'settings.license.active' : FAILURE_KEYS[result.reason]
}
