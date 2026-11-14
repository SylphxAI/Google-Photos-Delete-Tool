/**
 * Sole writer for destructive-run admission, empty-trash chain
 * admission, single-run occupancy, and versioned Terms/Privacy
 * clickwrap + re-consent admission.
 *
 * Identities: GPDT-CONSENT, GPDT-TRASH-HANDOFF (chain predicate),
 * GPDT-CONTROL (no second engine while the first is settling),
 * GPDT-POLICY-CONSENT (affirmative clickwrap & versioned re-consent).
 *
 * Surfaces read their own storage backends and pass interpreted
 * acknowledgements here.
 */
import type { RunStatus } from './status'

export const CONSENT_KEY = 'gpdt_consent_v3'
export const EMPTY_TRASH_ACK_KEY = 'gpdt_emptyTrashAck_v3'

/** Userscript / panel localStorage acknowledgement token. */
export const LOCAL_ACK_VALUE = '1'

/** Versioned Terms of Service and Privacy Policy identifiers. */
export const CURRENT_TERMS_VERSION = '2026-11-14'
export const CURRENT_PRIVACY_VERSION = '2026-11-14'
export const POLICY_CONSENT_KEY = 'gpdt_policy_consent'

export const DEFAULT_CONSENT_API_ORIGIN = 'https://api.sylphx.com'
export const DEFAULT_CONSENT_PARENT =
  'orgs/org_fs01afbdccgn8xdk1ghj5y47w0vtph/projects/prj_fs01etb6sjwf33tcvmhf93jwppx8a0/envs/env_fs01kkyfapshabd01pdps7kf0f72cr'
export const DEFAULT_CONSENT_PUBLISHABLE_KEY = 'sylphx_pk_live_fs011xLNiTif0SkaOCFx'

export type ConsentSurface =
  | 'gpdt_extension'
  | 'gpdt_userscript'
  | 'gpdt_web_activate'
  | 'sylphx_account'
  | 'sylphx_cloud'

export interface ConsentRecord {
  user_id?: string
  terms_version: string
  privacy_version: string
  accepted_at: string
  surface: ConsentSurface
}

const VALID_SURFACES: readonly ConsentSurface[] = [
  'gpdt_extension',
  'gpdt_userscript',
  'gpdt_web_activate',
  'sylphx_account',
  'sylphx_cloud',
]

export function isValidConsentSurface(value: unknown): value is ConsentSurface {
  return typeof value === 'string' && (VALID_SURFACES as readonly string[]).includes(value)
}

/** Policy versions are ISO dates, so same-shape strings order correctly. */
const POLICY_VERSION = /^\d{4}-\d{2}-\d{2}$/

export function isValidConsentRecord(raw: unknown): raw is ConsentRecord {
  if (!raw || typeof raw !== 'object') return false
  const r = raw as Record<string, unknown>
  if (typeof r.terms_version !== 'string' || !POLICY_VERSION.test(r.terms_version)) return false
  if (typeof r.privacy_version !== 'string' || !POLICY_VERSION.test(r.privacy_version)) return false
  if (typeof r.accepted_at !== 'string' || !Number.isFinite(Date.parse(r.accepted_at))) return false
  if (!isValidConsentSurface(r.surface)) return false
  if (r.user_id !== undefined && typeof r.user_id !== 'string') return false
  return true
}

/**
 * Returns true whenever consent is missing, malformed, or accepted against an
 * older Terms or Privacy Policy version than required.
 */
export function needsPolicyReconsent(
  record: ConsentRecord | null | undefined,
  requiredTermsVersion: string = CURRENT_TERMS_VERSION,
  requiredPrivacyVersion: string = CURRENT_PRIVACY_VERSION,
): boolean {
  if (!record || !isValidConsentRecord(record)) return true
  return (
    record.terms_version < requiredTermsVersion ||
    record.privacy_version < requiredPrivacyVersion
  )
}

function writeChromeOrLocalPolicyConsent(record: ConsentRecord): Promise<void> {
  return new Promise((resolve, reject) => {
    const g = globalThis as {
      chrome?: {
        storage?: {
          local?: {
            set?: (items: Record<string, unknown>, cb: () => void) => void
          }
        }
        runtime?: { lastError?: { message?: string } }
      }
      window?: { localStorage?: Storage }
      localStorage?: Storage
    }
    const localArea = g.chrome?.storage?.local
    if (localArea && typeof localArea.set === 'function') {
      localArea.set({ [POLICY_CONSENT_KEY]: record }, () => {
        const err = g.chrome?.runtime?.lastError
        if (err) reject(new Error(err.message ?? 'Failed to persist policy consent'))
        else resolve()
      })
      return
    }
    try {
      const ls = g.window?.localStorage ?? g.localStorage
      if (ls && typeof ls.setItem === 'function') {
        ls.setItem(POLICY_CONSENT_KEY, JSON.stringify(record))
      }
      resolve()
    } catch (err) {
      reject(err instanceof Error ? err : new Error('Failed to persist policy consent'))
    }
  })
}

export function readPolicyConsent(): Promise<ConsentRecord | null> {
  return new Promise((resolve) => {
    const g = globalThis as {
      chrome?: {
        storage?: {
          local?: {
            get?: (keys: string[], cb: (data: Record<string, unknown>) => void) => void
          }
        }
        runtime?: { lastError?: { message?: string } }
      }
      window?: { localStorage?: Storage }
      localStorage?: Storage
    }
    const localArea = g.chrome?.storage?.local
    if (localArea && typeof localArea.get === 'function') {
      localArea.get([POLICY_CONSENT_KEY], (data) => {
        if (g.chrome?.runtime?.lastError) {
          resolve(null)
          return
        }
        const raw = data?.[POLICY_CONSENT_KEY]
        resolve(isValidConsentRecord(raw) ? raw : null)
      })
      return
    }
    try {
      const ls = g.window?.localStorage ?? g.localStorage
      const raw = ls?.getItem(POLICY_CONSENT_KEY)
      if (!raw) {
        resolve(null)
        return
      }
      const parsed: unknown = JSON.parse(raw)
      resolve(isValidConsentRecord(parsed) ? parsed : null)
    } catch {
      resolve(null)
    }
  })
}

export interface RecordPolicyConsentInput {
  userId?: string
  user_id?: string
  surface: ConsentSurface
  accepted?: boolean
  termsVersion?: string
  privacyVersion?: string
  acceptedAt?: string
  token?: string
  apiOrigin?: string
  parent?: string
  publishableKey?: string
  fetchImpl?: typeof fetch
  requiredTermsVersion?: string
  requiredPrivacyVersion?: string
}

/**
 * Validates affirmative clickwrap consent, persists `gpdt_policy_consent` in
 * `chrome.storage.local`, and when authenticated (`token` provided) posts the
 * immutable acceptance record to the cloud consent endpoint.
 */
export async function recordPolicyConsent(input: RecordPolicyConsentInput): Promise<ConsentRecord> {
  if (input.accepted === false) {
    throw new Error('affirmative_consent_required')
  }
  if (!isValidConsentSurface(input.surface)) {
    throw new Error('invalid_consent_surface')
  }
  const userId = (input.userId ?? input.user_id)?.trim()
  const record: ConsentRecord = {
    ...(userId ? { user_id: userId } : {}),
    terms_version: input.termsVersion ?? CURRENT_TERMS_VERSION,
    privacy_version: input.privacyVersion ?? CURRENT_PRIVACY_VERSION,
    accepted_at: input.acceptedAt ?? new Date().toISOString(),
    surface: input.surface,
  }
  if (
    needsPolicyReconsent(
      record,
      input.requiredTermsVersion ?? CURRENT_TERMS_VERSION,
      input.requiredPrivacyVersion ?? CURRENT_PRIVACY_VERSION,
    )
  ) {
    throw new Error('affirmative_consent_required')
  }

  await writeChromeOrLocalPolicyConsent(record)

  await syncPolicyConsentToServer(record, input)

  return record
}

export interface ServerConsentSyncOptions {
  token?: string
  apiOrigin?: string
  parent?: string
  publishableKey?: string
  fetchImpl?: typeof fetch
}

export async function syncPolicyConsentToServer(
  record: ConsentRecord,
  input: ServerConsentSyncOptions,
): Promise<void> {
  const token = input.token?.trim()
  if (!token) return
  const apiOrigin = (input.apiOrigin ?? DEFAULT_CONSENT_API_ORIGIN).replace(/\/+$/, '')
  const parent = input.parent ?? DEFAULT_CONSENT_PARENT
  const publishableKey = input.publishableKey ?? DEFAULT_CONSENT_PUBLISHABLE_KEY
  const defaultFetch =
    typeof fetch === 'function' &&
    ('mock' in fetch || !(globalThis as { process?: { env?: { VITEST?: string } } }).process?.env?.VITEST)
      ? fetch
      : undefined
  const f = input.fetchImpl ?? defaultFetch
  if (!f) return
  const orgId = /^orgs\/([^/]+)/.exec(parent)?.[1]
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    'x-sylphx-key': publishableKey,
    ...(orgId ? { 'x-sylphx-organization': orgId } : {}),
    'Content-Type': 'application/json',
  }
  const body = JSON.stringify({
    terms_accepted: true,
    terms_version: record.terms_version,
    privacy_version: record.privacy_version,
    surface: record.surface,
  })
  const endpoints = [
    `${apiOrigin}/v1/auth/${parent}/consent:accept`,
    `${apiOrigin}/v1/auth/consent:accept`,
    `${apiOrigin}/account/consent`,
  ]
  try {
    for (const url of endpoints) {
      const res = await f(url, {
        method: 'POST',
        headers,
        body,
      })
      if (!res || res.status !== 404) break
    }
  } catch {
    // Local consent record is authoritative offline; cloud sync retries on next auth call
  }
}

export async function fetchServerConsentStatus(
  input: ServerConsentSyncOptions,
): Promise<ConsentRecord | null> {
  const token = input.token?.trim()
  if (!token) return null
  const apiOrigin = (input.apiOrigin ?? DEFAULT_CONSENT_API_ORIGIN).replace(/\/+$/, '')
  const parent = input.parent ?? DEFAULT_CONSENT_PARENT
  const publishableKey = input.publishableKey ?? DEFAULT_CONSENT_PUBLISHABLE_KEY
  const f = input.fetchImpl ?? (typeof fetch === 'function' ? fetch : undefined)
  if (!f) return null
  const orgId = /^orgs\/([^/]+)/.exec(parent)?.[1]
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    'x-sylphx-key': publishableKey,
    ...(orgId ? { 'x-sylphx-organization': orgId } : {}),
  }
  const endpoints = [
    `${apiOrigin}/v1/auth/${parent}/consent:status`,
    `${apiOrigin}/v1/auth/consent:status`,
  ]
  for (const url of endpoints) {
    try {
      const res = await f(url, { method: 'GET', headers })
      if (res && res.status === 404) continue
      if (!res || !res.ok) return null
      const data = (await res.json()) as Record<string, unknown>
      const candidate = (data.consent ?? data) as Record<string, unknown>
      if (isValidConsentRecord(candidate)) return candidate
      if (
        typeof candidate.accepted_terms_version === 'string' &&
        typeof candidate.accepted_privacy_version === 'string'
      ) {
        const normalized = {
          ...(typeof candidate.user_id === 'string' && candidate.user_id
            ? { user_id: candidate.user_id }
            : {}),
          terms_version: candidate.accepted_terms_version,
          privacy_version: candidate.accepted_privacy_version,
          accepted_at:
            typeof candidate.accepted_at === 'string' && candidate.accepted_at
              ? candidate.accepted_at
              : new Date(0).toISOString(),
          surface:
            typeof candidate.surface === 'string' && candidate.surface
              ? candidate.surface
              : 'sylphx_cloud',
        }
        return isValidConsentRecord(normalized) ? normalized : null
      }
      return null
    } catch {
      return null
    }
  }
  return null
}

export type Acknowledgement = {
  readable: boolean
  acknowledged: boolean
}

export type DestructiveRefuseReason =
  | 'consent-missing'
  | 'consent-unreadable'
  | 'empty-trash-ack-missing'
  | 'empty-trash-ack-unreadable'

export type DestructiveAdmission =
  | { ok: true }
  | { ok: false; reason: DestructiveRefuseReason }

export type OccupancyAdmission =
  | { ok: true }
  | { ok: false; reason: 'run-in-progress' }

export class ConsentRequiredError extends Error {
  constructor() {
    super('consent required before a destructive run')
    this.name = 'ConsentRequiredError'
  }
}

export class PermanentActionRequiredError extends Error {
  constructor() {
    super('permanent empty-trash acknowledgement required before an empty-trash run')
    this.name = 'PermanentActionRequiredError'
  }
}

/** Public extension IPC error tokens for a refused destructive start. */
export const EXTENSION_ADMISSION_ERROR: Record<DestructiveRefuseReason, string> = {
  'consent-missing':
    'Consent required — confirm the safety notice in the popup first.',
  'consent-unreadable': 'Could not read consent state.',
  'empty-trash-ack-missing':
    'Permanent empty-trash consent required — confirm the permanent-action warning in the popup first.',
  'empty-trash-ack-unreadable':
    'Could not read permanent empty-trash consent state.',
}

export const RUN_IN_PROGRESS_ERROR = 'A run is already in progress — stop it first.'

export function admitDestructiveRun(input: {
  dryRun: boolean
  emptyTrashAfter: boolean
  consent: Acknowledgement
  emptyTrashAck: Acknowledgement
}): DestructiveAdmission {
  if (input.dryRun) return { ok: true }

  if (!input.consent.readable) {
    return { ok: false, reason: 'consent-unreadable' }
  }
  if (!input.consent.acknowledged) {
    return { ok: false, reason: 'consent-missing' }
  }

  if (input.emptyTrashAfter) {
    if (!input.emptyTrashAck.readable) {
      return { ok: false, reason: 'empty-trash-ack-unreadable' }
    }
    if (!input.emptyTrashAck.acknowledged) {
      return { ok: false, reason: 'empty-trash-ack-missing' }
    }
  }

  return { ok: true }
}

/**
 * Empty-trash navigation is admitted only after a clean real run that
 * deleted at least one item. A dry-run, a stop, a zero-delete finish,
 * or a non-done status must not chain.
 */
export function shouldNavigateToEmptyTrash(input: {
  dryRun: boolean
  emptyTrashAfter: boolean
  stopped: boolean
  status: RunStatus
  deleted: number
}): boolean {
  return (
    !input.dryRun &&
    input.emptyTrashAfter &&
    !input.stopped &&
    input.status === 'done' &&
    input.deleted > 0
  )
}

export function admitConcurrentStart(occupied: boolean): OccupancyAdmission {
  return occupied ? { ok: false, reason: 'run-in-progress' } : { ok: true }
}

export function readLocalAcknowledgement(key: string): Acknowledgement {
  try {
    return {
      readable: true,
      acknowledged: window.localStorage.getItem(key) === LOCAL_ACK_VALUE,
    }
  } catch {
    return { readable: false, acknowledged: false }
  }
}

export function writeLocalAcknowledgement(key: string): void {
  try {
    window.localStorage.setItem(key, LOCAL_ACK_VALUE)
  } catch {
    /* storage unavailable — acknowledgement re-asked next start */
  }
}

export function throwForDestructiveRefusal(reason: DestructiveRefuseReason): never {
  switch (reason) {
    case 'consent-missing':
    case 'consent-unreadable':
      throw new ConsentRequiredError()
    case 'empty-trash-ack-missing':
    case 'empty-trash-ack-unreadable':
      throw new PermanentActionRequiredError()
  }
}
