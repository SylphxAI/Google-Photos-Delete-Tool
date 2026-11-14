/* Pro licence and AI Credit Wallet activation handoff on the pricing and
   recovery pages: when checkout or a recovery link shows the licence or wallet
   session token, send it to the installed extension (Chrome
   externally_connectable messaging). Includes affirmative clickwrap and
   versioned Terms/Privacy re-consent gating (Chairman #3751-#3753).
   The licence is never stored by this page. */
(function () {
  'use strict'
  if (window.__gpdtActivate) return
  window.__gpdtActivate = true
  // Keep in sync with ACTIVATION_MESSAGE, WALLET_ACTIVATION_MESSAGE and CHROME_WEB_STORE_ID in src/core/activation.ts.
  var MESSAGE = 'gpdt:activate-licence'
  var WALLET_MESSAGE = 'gpdt:activate-wallet'
  var CURRENT_TERMS_VERSION = '2026-11-14'
  var CURRENT_PRIVACY_VERSION = '2026-11-14'
  var POLICY_CONSENT_KEY = 'gpdt_policy_consent'
  var script = document.currentScript
  var configured = script && script.getAttribute('data-extension-ids')
  var ids = (configured || 'jiahfbbfpacpolomdjlpdpiljllcdenb').split(',').filter(Boolean)
  var MANUAL = 'To use Pro, copy this licence and paste it into the Pro licence box in the extension.'
  var CONSENT_PROMPT = 'Please accept the Terms of Service and Privacy Policy checkbox before activating.'
  var TEXT = {
    invalid: 'This licence could not be verified. Your existing activation has not changed.',
    storage: 'Activation could not be saved. Paste the licence into the extension to retry.',
    consent_required: CONSENT_PROMPT,
  }
  var last = ''
  var lastWallet = ''
  var status = document.createElement('p')
  status.id = 'gpdt-activation-status'
  status.setAttribute('role', 'status')

  function show(node, text) {
    if (status.textContent !== text) status.textContent = text
    if (!status.isConnected) (node && node.parentElement ? node.parentElement : document.body).appendChild(status)
  }

  function needsPolicyReconsent(record) {
    if (!record || typeof record !== 'object') return true
    if (typeof record.terms_version !== 'string' || typeof record.privacy_version !== 'string') return true
    if (typeof record.accepted_at !== 'string' || !record.accepted_at) return true
    return record.terms_version < CURRENT_TERMS_VERSION || record.privacy_version < CURRENT_PRIVACY_VERSION
  }

  function readStoredConsent() {
    try {
      var raw = window.localStorage && window.localStorage.getItem(POLICY_CONSENT_KEY)
      if (!raw) return null
      return JSON.parse(raw)
    } catch (e) {
      return null
    }
  }

  function ensureConsentGate(anchor) {
    var existing = document.getElementById('gpdt-policy-consent-checkbox')
    if (existing) return existing
    if (!document.body) return null
    var wrap = document.createElement('div')
    wrap.id = 'gpdt-consent-gate'
    var label = document.createElement('label')
    label.setAttribute('for', 'gpdt-policy-consent-checkbox')
    var checkbox = document.createElement('input')
    checkbox.type = 'checkbox'
    checkbox.id = 'gpdt-policy-consent-checkbox'
    checkbox.checked = false
    checkbox.defaultChecked = false
    var text1 = document.createTextNode(' I agree to the ')
    var termsLink = document.createElement('a')
    termsLink.href = '/Google-Photos-Delete-Tool/terms.html'
    termsLink.setAttribute('data-policy-link', 'terms')
    termsLink.textContent = 'Terms of Service'
    var text2 = document.createTextNode(' and ')
    var privacyLink = document.createElement('a')
    privacyLink.href = '/Google-Photos-Delete-Tool/privacy.html'
    privacyLink.setAttribute('data-policy-link', 'privacy')
    privacyLink.textContent = 'Privacy Policy (/privacy)'
    label.appendChild(checkbox)
    label.appendChild(text1)
    label.appendChild(termsLink)
    label.appendChild(text2)
    label.appendChild(privacyLink)
    wrap.appendChild(label)
    var target = (anchor && anchor.parentElement) || document.body
    target.appendChild(wrap)
    checkbox.addEventListener('change', function () {
      if (checkbox.checked) {
        last = ''
        lastWallet = ''
        check()
      }
    })
    return checkbox
  }

  function requiresClickwrapGate(node, isWallet) {
    if (isWallet) return true
    if (window.__gpdtRequireClickwrap === true) return true
    if (script && script.hasAttribute && script.hasAttribute('data-require-clickwrap')) return true
    if (node && node.hasAttribute && (node.hasAttribute('data-gpdt-require-clickwrap') || node.hasAttribute('data-require-consent'))) return true
    if (document.body && document.body.hasAttribute && document.body.hasAttribute('data-gpdt-require-clickwrap')) return true
    var stored = readStoredConsent()
    if (stored && needsPolicyReconsent(stored)) return true
    return false
  }

  function tokenOf(raw) {
    if (typeof raw !== 'string' || raw.length > 16384) return null
    var t = raw.trim()
    return /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(t) ? t : null
  }

  function walletTokenOf(raw) {
    if (typeof raw !== 'string' || raw.length > 16384) return null
    var t = raw.trim()
    if (t.length < 8) return null
    return /^[A-Za-z0-9._-]+$/.test(t) ? t : null
  }

  function buildMessage(type, token, isWallet, checkbox) {
    var payload = isWallet ? { type: type, wallet_token: token } : { type: type, token: token }
    if (checkbox && checkbox.checked) {
      payload.terms_version = CURRENT_TERMS_VERSION
      payload.privacy_version = CURRENT_PRIVACY_VERSION
      payload.accepted_at = new Date().toISOString()
    }
    return payload
  }

  function send(payload, node, i, isWallet) {
    var runtime = window.chrome && window.chrome.runtime
    if (i >= ids.length || !runtime || typeof runtime.sendMessage !== 'function') return show(node, MANUAL)
    try {
      runtime.sendMessage(ids[i], payload, function (reply) {
        // lastError: no extension with this id is installed (or it predates this handoff).
        if (runtime.lastError || !reply || typeof reply.ok !== 'boolean' || reply.reason === 'rejected') return send(payload, node, i + 1, isWallet)
        if (reply.ok) {
          if (isWallet) return show(node, 'AI Restore Wallet connected in this browser — ' + reply.scope + '. Open Google Photos to use it.')
          return show(node, 'Pro activated in this browser — ' + reply.scope + '. Open Google Photos to use it. No photos were changed.')
        }
        show(node, TEXT[reply.reason] || TEXT.invalid)
      })
    } catch (e) {
      send(payload, node, i + 1, isWallet)
    }
  }

  function check() {
    var node = document.querySelector('[data-keel-money-licence-token]')
    var walletNode = document.querySelector('[data-keel-money-wallet-token]')
    var checkbox = ensureConsentGate(node || walletNode)

    var token = tokenOf(node && node.textContent)
    if (token && token !== last) {
      if (requiresClickwrapGate(node, false) && (!checkbox || !checkbox.checked)) {
        show(node, CONSENT_PROMPT)
      } else {
        last = token
        send(buildMessage(MESSAGE, token, false, checkbox), node, 0, false)
      }
    }

    var walletToken = walletTokenOf(walletNode && walletNode.textContent)
    if (walletToken && walletToken !== lastWallet) {
      if (!checkbox || !checkbox.checked) {
        show(walletNode, CONSENT_PROMPT)
      } else {
        lastWallet = walletToken
        send(buildMessage(WALLET_MESSAGE, walletToken, true, checkbox), walletNode, 0, true)
      }
    }
  }

  window.__gpdtActivateApi = {
    CURRENT_TERMS_VERSION: CURRENT_TERMS_VERSION,
    CURRENT_PRIVACY_VERSION: CURRENT_PRIVACY_VERSION,
    needsPolicyReconsent: needsPolicyReconsent,
    ensureConsentGate: ensureConsentGate,
    check: check,
  }

  new MutationObserver(check).observe(document.documentElement, { childList: true, subtree: true, characterData: true })
  check()
})()