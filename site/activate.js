/* Pro and AI-credit activation handoff on the pricing and recovery pages.
   When checkout or a recovery link shows the licence, or the page address
   carries a wallet_token, send it to the installed extension (Chrome
   externally_connectable messaging). The extension checks this page's address
   and the token before saving it. Without the extension, or in a browser
   without page-to-extension messaging, the licence stays on the page for
   manual paste. Tokens are never stored by this page.

   Before the first handoff, and again whenever the terms change, the person
   ticks a box to agree to the Terms of Service and the Privacy Policy. The
   acceptance record stays in this browser (localStorage). Nothing is sent to
   the extension until it is saved and read back. */
(function () {
  'use strict'
  if (window.__gpdtActivate) return
  window.__gpdtActivate = true
  // Keep in sync with ACTIVATION_MESSAGE and CHROME_WEB_STORE_ID in src/core/activation.ts,
  // and WALLET_ACTIVATION_MESSAGE in src/ui/restore/studio.ts.
  var MESSAGE = 'gpdt:activate-licence'
  var WALLET_MESSAGE = 'gpdt:activate-wallet'
  // Keep in sync with src/ui/restore/policy-consent.ts.
  var TERMS_VERSION = '2026-11-14'
  var PRIVACY_VERSION = '2026-11-14'
  var POLICY_KEY = 'gpdt_policy_consent'
  var TERMS_URL = 'https://sylphxai.github.io/Google-Photos-Delete-Tool/terms.html'
  var PRIVACY_URL = 'https://sylphxai.github.io/Google-Photos-Delete-Tool/privacy.html'
  var script = document.currentScript
  var configured = script && script.getAttribute('data-extension-ids')
  var ids = (configured || 'jiahfbbfpacpolomdjlpdpiljllcdenb').split(',').filter(Boolean)
  var MANUAL = 'To use Pro, copy this licence and paste it into the Pro licence box in the extension.'
  var TEXT = {
    invalid: 'This licence could not be verified. Your existing activation has not changed.',
    storage: 'Activation could not be saved. Paste the licence into the extension to retry.',
  }
  var WALLET_TEXT = {
    ok: 'AI credits are connected in this browser. Open Google Photos and choose AI 4K Restore on a photo. No photos were changed.',
    manual: 'Install the extension, then open AI 4K Restore and choose Connect Sylphx Wallet to use your credits.',
    invalid: 'This wallet link could not be verified. Your existing wallet has not changed.',
  }
  var last = ''
  var lastWallet = ''
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

  function walletTokenOf(raw) {
    if (typeof raw !== 'string' || raw.length < 16 || raw.length > 4096) return null
    return /^[A-Za-z0-9._~-]+$/.test(raw) ? raw : null
  }

  // ─── Terms and Privacy clickwrap ────────────────────────────
  function storage() { try { return window.localStorage } catch (e) { return null } }
  var VERSION = /^\d{4}-\d{2}-\d{2}$/
  function accepted() {
    var s = storage()
    if (!s) return false
    try {
      var r = JSON.parse(s.getItem(POLICY_KEY) || 'null')
      return !!r && typeof r.user_id === 'string' && r.user_id.length > 0 &&
        VERSION.test(r.terms_version) && VERSION.test(r.privacy_version) &&
        typeof r.accepted_at === 'string' && !isNaN(Date.parse(r.accepted_at)) &&
        r.terms_version >= TERMS_VERSION && r.privacy_version >= PRIVACY_VERSION
    } catch (e) { return false }
  }
  function localId() {
    var c = window.crypto
    if (c && typeof c.randomUUID === 'function') return c.randomUUID()
    var out = ''
    for (var i = 0; i < 32; i++) out += Math.floor(Math.random() * 16).toString(16)
    return out
  }
  function record() {
    var s = storage()
    if (!s) return false
    try {
      var prev = null
      try { prev = JSON.parse(s.getItem(POLICY_KEY) || 'null') } catch (e) { prev = null }
      s.setItem(POLICY_KEY, JSON.stringify({
        user_id: prev && typeof prev.user_id === 'string' && prev.user_id ? prev.user_id : localId(),
        terms_version: TERMS_VERSION,
        privacy_version: PRIVACY_VERSION,
        accepted_at: new Date().toISOString(),
        surface: 'gpdt_site',
      }))
    } catch (e) { return false }
    return accepted()
  }

  var waiting = []
  var gate = null
  function el(tag, attrs, kids) {
    var n = document.createElement(tag)
    for (var k in attrs) if (Object.prototype.hasOwnProperty.call(attrs, k)) n.setAttribute(k, attrs[k])
    for (var i = 0; kids && i < kids.length; i++) n.append(kids[i])
    return n
  }
  /** Run `go` now when the current terms are accepted, otherwise after the person agrees. */
  function withConsent(node, go) {
    if (accepted()) return go()
    waiting.push(go)
    if (gate) return
    var check = el('input', { type: 'checkbox', id: 'gpdt-policy-check' })
    var agree = el('button', { type: 'button', id: 'gpdt-policy-agree', style: 'height:40px;padding:0 16px;border:0;border-radius:8px;background:#4B32C3;color:#FFFFFF;font:600 13px/1.2 inherit;cursor:pointer' }, ['Agree and Continue'])
    var err = el('p', { role: 'alert', hidden: '', style: 'margin:0;color:#B3261E;font-size:12px' })
    agree.disabled = true
    check.addEventListener('change', function () { agree.disabled = !check.checked })
    agree.addEventListener('click', function () {
      if (!check.checked) return
      if (!record()) {
        err.textContent = 'Your agreement could not be saved in this browser, so nothing was activated.'
        err.hidden = false
        show(gate, MANUAL)
        return
      }
      gate.remove()
      gate = null
      var run = waiting
      waiting = []
      for (var i = 0; i < run.length; i++) run[i]()
    })
    function link(href, text) { return el('a', { href: href, target: '_blank', rel: 'noopener' }, [text]) }
    gate = el('section', { id: 'gpdt-policy-gate', role: 'group', 'aria-labelledby': 'gpdt-policy-title', style: 'display:grid;gap:12px;margin:16px 0;padding:16px;border:1px solid #D6D3CC;border-radius:12px;background:#FFFFFF;color:#1A1920;font:400 14px/1.5 Inter,system-ui,sans-serif;text-align:left' }, [
      el('h2', { id: 'gpdt-policy-title', style: 'margin:0;font-size:15px;font-weight:600' }, ['Terms of Service & Privacy Policy Update']),
      el('p', { style: 'margin:0' }, ['Before this browser activates Pro or AI credits, please agree to the current terms. Scanning and deleting stay on your computer. AI 4K Restore sends only the one photo you confirm to Sylphx AI, which processes it in memory and keeps no copy.']),
      el('p', { style: 'margin:0;font-size:12px;color:#5C5A66' }, ['Read the ', link(TERMS_URL, 'Terms of Service'), ' and the ', link(PRIVACY_URL, 'Privacy Policy'), ' (version ' + TERMS_VERSION + ').']),
      el('label', { for: 'gpdt-policy-check', style: 'display:flex;gap:8px;align-items:flex-start;font-size:13px;cursor:pointer' }, [check, el('span', {}, ['I have read and agree to the Terms of Service and the Privacy Policy.'])]),
      err,
      el('div', { style: 'display:flex;justify-content:flex-end' }, [agree]),
    ])
    var host = node && node.parentElement ? node.parentElement : document.body
    host.appendChild(gate)
  }

  // ─── Licence handoff ───────────────────────────────────────
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

  // ─── Wallet handoff ────────────────────────────────────────
  function sendWallet(token, i) {
    var runtime = window.chrome && window.chrome.runtime
    if (i >= ids.length || !runtime || typeof runtime.sendMessage !== 'function') return show(null, WALLET_TEXT.manual)
    try {
      runtime.sendMessage(ids[i], { type: WALLET_MESSAGE, token: token }, function (reply) {
        if (runtime.lastError || !reply || typeof reply.ok !== 'boolean' || reply.reason === 'rejected') return sendWallet(token, i + 1)
        show(null, reply.ok ? WALLET_TEXT.ok : WALLET_TEXT.invalid)
      })
    } catch (e) {
      sendWallet(token, i + 1)
    }
  }

  /** Read wallet_token from the address once, then drop it from the address bar. */
  function takeWalletToken() {
    var loc = window.location
    var params
    try { params = new URLSearchParams(loc.search) } catch (e) { return null }
    if (!params.has('wallet_token')) return null
    var token = walletTokenOf(params.get('wallet_token'))
    params.delete('wallet_token')
    try {
      var q = params.toString()
      window.history.replaceState(window.history.state, '', loc.pathname + (q ? '?' + q : '') + loc.hash)
    } catch (e) { /* the token stays in this tab's address only */ }
    if (!token) show(null, WALLET_TEXT.invalid)
    return token
  }

  function check() {
    var node = document.querySelector('[data-keel-money-licence-token]')
    var token = tokenOf(node && node.textContent)
    if (!token || token === last) return
    last = token
    withConsent(node, function () { send(token, node, 0) })
  }

  var wallet = takeWalletToken()
  if (wallet && wallet !== lastWallet) {
    lastWallet = wallet
    withConsent(null, function () { sendWallet(wallet, 0) })
  }

  new MutationObserver(check).observe(document.documentElement, { childList: true, subtree: true, characterData: true })
  check()
})()
