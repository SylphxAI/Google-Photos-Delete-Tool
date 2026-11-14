/**
 * Pro licence and AI Restore Wallet activation from the owned pricing/recovery
 * pages via `externally_connectable` messaging (Chromium). No content script
 * runs on those pages, so the extension asks for no host access beyond Google
 * Photos. The sender URL, token validity, and (when supplied/required) versioned
 * Terms & Privacy clickwrap consent are verified before storage changes.
 */
import {
  activationRequest,
  extractActivationConsent,
  isActivationUrl,
  licenceScope,
  walletActivationRequest,
  type ActivationConsentMeta,
  type ActivationReply,
} from '../core/activation'
import {
  CURRENT_PRIVACY_VERSION,
  CURRENT_TERMS_VERSION,
  needsPolicyReconsent,
  recordPolicyConsent,
} from '../core/consent'
import { verifyLicense } from '../core/license'
import { WALLET_TOKEN_KEY } from '../core/restore/wallet'
import * as api from './api'

async function validateAndPersistConsent(
  consentMeta: ActivationConsentMeta | null,
  authToken?: string,
): Promise<{ ok: true } | { ok: false; reason: 'consent_required' }> {
  if (!consentMeta) return { ok: true }
  if (consentMeta.accepted === false) {
    return { ok: false, reason: 'consent_required' }
  }
  const termsVersion = consentMeta.terms_version ?? ''
  const privacyVersion = consentMeta.privacy_version ?? ''
  const acceptedAt = consentMeta.accepted_at ?? new Date().toISOString()

  if (
    consentMeta.require_consent === true &&
    (!termsVersion || !privacyVersion)
  ) {
    return { ok: false, reason: 'consent_required' }
  }

  if (
    consentMeta.terms_version !== undefined ||
    consentMeta.privacy_version !== undefined ||
    consentMeta.accepted_at !== undefined
  ) {
    const candidate = {
      terms_version: termsVersion,
      privacy_version: privacyVersion,
      accepted_at: acceptedAt,
      surface: 'gpdt_web_activate' as const,
      ...(consentMeta.user_id ? { user_id: consentMeta.user_id } : {}),
    }
    if (needsPolicyReconsent(candidate, CURRENT_TERMS_VERSION, CURRENT_PRIVACY_VERSION)) {
      return { ok: false, reason: 'consent_required' }
    }
    try {
      await recordPolicyConsent({
        userId: consentMeta.user_id,
        surface: 'gpdt_web_activate',
        accepted: true,
        termsVersion,
        privacyVersion,
        acceptedAt,
        token: authToken,
      })
    } catch {
      return { ok: false, reason: 'consent_required' }
    }
  }

  return { ok: true }
}

async function persistWalletToken(walletToken: string): Promise<void> {
  if (typeof api.writeWalletToken === 'function') {
    await api.writeWalletToken(walletToken)
    return
  }
  await new Promise<void>((resolve, reject) => {
    const local = (globalThis as { chrome?: typeof chrome }).chrome?.storage?.local
    if (!local || typeof local.set !== 'function') {
      reject(new Error('chrome.storage.local unavailable'))
      return
    }
    local.set({ [WALLET_TOKEN_KEY]: walletToken }, () => {
      const err = (globalThis as { chrome?: typeof chrome }).chrome?.runtime?.lastError
      if (err) reject(new Error(err.message))
      else resolve()
    })
  })
}

export async function handleExternalActivation(
  message: unknown,
  sender: { url?: string },
): Promise<ActivationReply> {
  if (typeof sender.url !== 'string' || !isActivationUrl(sender.url)) {
    return { ok: false, reason: 'rejected' }
  }

  const consentMeta = extractActivationConsent(message)

  const walletToken = walletActivationRequest(message, sender.url)
  if (walletToken) {
    const consentCheck = await validateAndPersistConsent(consentMeta, walletToken)
    if (!consentCheck.ok) return consentCheck
    try {
      await persistWalletToken(walletToken)
    } catch {
      return { ok: false, reason: 'storage' }
    }
    return { ok: true, scope: 'AI Restore Wallet' }
  }

  const token = activationRequest(message, sender.url)
  if (!token) return { ok: false, reason: 'rejected' }

  const consentCheck = await validateAndPersistConsent(consentMeta)
  if (!consentCheck.ok) return consentCheck

  const result = await verifyLicense(token)
  if (!result.ok) return { ok: false, reason: 'invalid' }
  try {
    await api.writeProToken(token)
  } catch {
    return { ok: false, reason: 'storage' }
  }
  return { ok: true, scope: licenceScope(result.payload) }
}

/** Firefox has no `onMessageExternal` for web pages; manual paste remains its path. */
export function registerExternalActivation(): void {
  const external = chrome.runtime.onMessageExternal
  if (!external) return
  external.addListener((message, sender, sendResponse) => {
    void handleExternalActivation(message, sender).then(sendResponse)
    return true // keep the channel open for the async reply
  })
}
