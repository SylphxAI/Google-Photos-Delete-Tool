/**
 * Pro activation from the owned pricing/recovery pages via
 * `externally_connectable` messaging (Chromium). No content script runs on
 * those pages, so the extension asks for no host access beyond Google Photos.
 * The sender URL and the token signature are both checked before storage
 * changes; a rejected or invalid request never replaces a saved licence.
 */
import { activationRequest, licenceScope, type ActivationReply } from '../core/activation'
import { verifyLicense } from '../core/license'
import { writeProToken } from './api'

export async function handleExternalActivation(message: unknown, sender: { url?: string }): Promise<ActivationReply> {
  const token = activationRequest(message, sender.url)
  if (!token) return { ok: false, reason: 'rejected' }
  const result = await verifyLicense(token)
  if (!result.ok) return { ok: false, reason: 'invalid' }
  try {
    await writeProToken(token)
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
