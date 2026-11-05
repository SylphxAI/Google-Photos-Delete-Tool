/** Isolated-world bridge. No messages, remote calls or delete controls. */
import { activationToken, isActivationUrl, LICENCE_STORAGE_KEY, licenceScope } from '../core/activation'
import { verifyLicense } from '../core/license'
import { writeProToken } from './api'

if (isActivationUrl(location.href)) {
  let last = ''
  let running = false
  const status = document.createElement('p')
  status.id = 'gpdt-activation-status'
  status.setAttribute('role', 'status')
  async function activate(): Promise<void> {
    if (running) return
    let stored: string | null = null
    try { stored = localStorage.getItem(LICENCE_STORAGE_KEY) } catch { /* DOM fallback */ }
    const node = document.querySelector('[data-keel-money-licence-token]')
    const token = activationToken(node?.textContent) ?? activationToken(stored)
    if (!token || token === last) return
    running = true
    try {
      const result = await verifyLicense(token)
      if (!result.ok) {
        last = token
        status.textContent = 'This licence could not be verified. Your existing activation has not changed.'
      } else {
        await writeProToken(token)
        last = token
        // Publish only verified owned claims; never infer ownership from page attributes.
        const claims = { product: 'gpdt', plan: 'pro', seats: result.payload.seats, expiresAt: result.payload.expiresAt }
        document.documentElement.setAttribute('data-keel-money-owned-claims', JSON.stringify(claims))
        try { localStorage.setItem(LICENCE_STORAGE_KEY, JSON.stringify({ token, claims })) } catch { /* activation still saved */ }
        status.textContent = `Pro activated in this browser — ${licenceScope(result.payload)}. Open Google Photos to use it. No photos were changed.`
      }
    } catch {
      status.textContent = 'Activation could not be saved. Use the licence box in the extension to retry.'
    } finally {
      running = false
      if (!status.isConnected) (node?.parentElement ?? document.body).append(status)
    }
  }
  new MutationObserver(() => { void activate() }).observe(document.documentElement, { childList: true, subtree: true, characterData: true })
  window.addEventListener('storage', () => { void activate() })
  void activate()
}
