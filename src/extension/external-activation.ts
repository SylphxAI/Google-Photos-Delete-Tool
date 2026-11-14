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
  readPolicyConsent,
  recordPolicyConsent,
} from '../core/consent'
import { verifyLicense } from '../core/license'
import { WALLET_TOKEN_KEY } from '../core/restore/wallet'
import * as api from './api'

/**
 * Admit an activation only under a current Terms/Privacy acceptance: the one
 * the page sends with the message (recorded here, and synced to the account
 * when a wallet token is present), or one already stored in this browser.
 * A message without complete consent fields and no current stored acceptance
 * is refused, so nothing activates without a recorded agreement.
 */
async function validateAndPersistConsent(
  consentMeta: ActivationConsentMeta | null,
  authToken?: string,
): Promise<{ ok: true } | { ok: false; reason: 'consent_required' }> {
  const refuse = { ok: false, reason: 'consent_required' } as const
  if (consentMeta?.accepted === false) return refuse

  const inline =
    consentMeta !== null &&
    typeof consentMeta.terms_version === 'string' &&
    typeof consentMeta.privacy_version === 'string' &&
    typeof consentMeta.accepted_at === 'string'
  if (!inline) {
    const existing = await readPolicyConsent()
    return needsPolicyReconsent(existing, CURRENT_TERMS_VERSION, CURRENT_PRIVACY_VERSION) ? refuse : { ok: true }
  }

  const candidate = {
    terms_version: consentMeta.terms_version as string,
    privacy_version: consentMeta.privacy_version as string,
    accepted_at: consentMeta.accepted_at as string,
    surface: 'gpdt_web_activate' as const,
    ...(consentMeta.user_id ? { user_id: consentMeta.user_id } : {}),
  }
  if (needsPolicyReconsent(candidate, CURRENT_TERMS_VERSION, CURRENT_PRIVACY_VERSION)) return refuse
  try {
    await recordPolicyConsent({
      userId: consentMeta.user_id,
      surface: 'gpdt_web_activate',
      accepted: true,
      termsVersion: candidate.terms_version,
      privacyVersion: candidate.privacy_version,
      acceptedAt: candidate.accepted_at,
      token: authToken,
    })
  } catch {
    return refuse
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
