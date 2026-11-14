/* Pro activation handoff on the pricing and recovery pages: when checkout or a
   recovery link shows the licence, send it to the installed extension
   (Chrome externally_connectable messaging). The extension checks this page's
   address and the licence signature before saving it. Without the extension,
   or in a browser without page-to-extension messaging, the licence stays on
   the page for manual paste. The licence is never stored by this page. */
(function () {
  'use strict'
  if (window.__gpdtActivate) return
  window.__gpdtActivate = true
  // Keep in sync with ACTIVATION_MESSAGE and CHROME_WEB_STORE_ID in src/core/activation.ts.
  var MESSAGE = 'gpdt:activate-licence'
  var script = document.currentScript
  var configured = script && script.getAttribute('data-extension-ids')
  var ids = (configured || 'jiahfbbfpacpolomdjlpdpiljllcdenb').split(',').filter(Boolean)
  var MANUAL = 'To use Pro, copy this licence and paste it into the Pro licence box in the extension.'
  var TEXT = {
    invalid: 'This licence could not be verified. Your existing activation has not changed.',
    storage: 'Activation could not be saved. Paste the licence into the extension to retry.',
  }
  var last = ''
  var status = document.createElement('p')
  status.id = 'gpdt-activation-status'
  status.setAttribute('role', 'status')

  function show(node, text) {
    status.textContent = text
    if (!status.isConnected) (node && node.parentElement ? node.parentElement : document.body).appendChild(status)
  }

  function tokenOf(raw) {
    if (typeof raw !== 'string' || raw.length > 16384) return null
    var t = raw.trim()
    return /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(t) ? t : null
  }

  function send(token, node, i) {
    var runtime = window.chrome && window.chrome.runtime
    if (i >= ids.length || !runtime || typeof runtime.sendMessage !== 'function') return show(node, MANUAL)
    try {
      runtime.sendMessage(ids[i], { type: MESSAGE, token: token }, function (reply) {
        // lastError: no extension with this id is installed (or it predates this handoff).
        if (runtime.lastError || !reply || typeof reply.ok !== 'boolean' || reply.reason === 'rejected') return send(token, node, i + 1)
        if (reply.ok) return show(node, 'Pro activated in this browser — ' + reply.scope + '. Open Google Photos to use it. No photos were changed.')
        show(node, TEXT[reply.reason] || TEXT.invalid)
      })
    } catch (e) {
      send(token, node, i + 1)
    }
  }

  function check() {
    var node = document.querySelector('[data-keel-money-licence-token]')
    var token = tokenOf(node && node.textContent)
    if (!token || token === last) return
    last = token
    send(token, node, 0)
  }

  new MutationObserver(check).observe(document.documentElement, { childList: true, subtree: true, characterData: true })
  check()
})()
