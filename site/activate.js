/* Pro and AI-credit activation handoff on the pricing and recovery pages.
   When checkout or a recovery link shows the licence, or the page address
   carries a wallet_token, send it to the installed extension (Chrome
   externally_connectable messaging). The extension checks this page's address
   and the token before saving it. Without the extension, or in a browser
   without page-to-extension messaging, the licence stays on the page for
   manual paste. Tokens are never stored by this page.

   Before the first handoff, and again whenever the terms change, the person
   ticks a box and presses Agree and Continue (Terms of Service and Privacy
   Policy). The acceptance record is kept in this browser (localStorage) and
   read back before anything is sent; the handoff carries its versions so the
   extension records the same acceptance (src/extension/external-activation.ts). */
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
    consent_required: 'The extension needs the current Terms of Service and Privacy Policy accepted. Nothing was activated.',
  }
  var WALLET_TEXT = {
    ok: 'AI credits are connected in this browser. Open Google Photos and choose AI 4K Restore on a photo. No photos were changed.',
    manual: 'Install the extension, then open AI 4K Restore and choose Connect Sylphx Wallet to use your credits.',
    invalid: 'This wallet link could not be verified. Your existing wallet has not changed.',
    storage: 'The wallet could not be saved in the extension. Reload this page to retry.',
    consent_required: TEXT.consent_required,
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

  function tokenOf(raw) {
    if (typeof raw !== 'string' || raw.length > 16384) return null
    var t = raw.trim()
    return /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(t) ? t : null
  }

  // Same shape as walletActivationToken in src/core/activation.ts.
  function walletTokenOf(raw) {
    if (typeof raw !== 'string' || raw.length > 16384) return null
    var t = raw.trim()
    return t.length >= 8 && /^[A-Za-z0-9._-]+$/.test(t) ? t : null
  }

  // ─── Terms and Privacy clickwrap ────────────────────────────
  function storage() { try { return window.localStorage } catch (e) { return null } }
  var VERSION = /^\d{4}-\d{2}-\d{2}$/
  /** The stored acceptance when it covers the current versions, else null. */
  function current() {
    var s = storage()
    if (!s) return null
    try {
      var r = JSON.parse(s.getItem(POLICY_KEY) || 'null')
      var ok = !!r && (r.user_id === undefined || typeof r.user_id === 'string') &&
        VERSION.test(r.terms_version) && VERSION.test(r.privacy_version) &&
        typeof r.accepted_at === 'string' && !isNaN(Date.parse(r.accepted_at)) &&
        r.terms_version >= TERMS_VERSION && r.privacy_version >= PRIVACY_VERSION
      return ok ? r : null
    } catch (e) { return null }
  }
  function accepted() { return current() !== null }
  /** Versioned acceptance carried with every handoff. */
  function consentFields(payload) {
    var r = current()
    if (!r) return payload
    payload.terms_version = r.terms_version
    payload.privacy_version = r.privacy_version
    payload.accepted_at = r.accepted_at
    if (r.user_id) payload.user_id = r.user_id
    return payload
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
        surface: 'gpdt_web_activate',
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
      runtime.sendMessage(ids[i], consentFields({ type: MESSAGE, token: token }), function (reply) {
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
  function sendWallet(token, i, okText) {
    var runtime = window.chrome && window.chrome.runtime
    if (i >= ids.length || !runtime || typeof runtime.sendMessage !== 'function') return show(null, WALLET_TEXT.manual)
    try {
      runtime.sendMessage(ids[i], consentFields({ type: WALLET_MESSAGE, wallet_token: token }), function (reply) {
        if (runtime.lastError || !reply || typeof reply.ok !== 'boolean' || reply.reason === 'rejected') return sendWallet(token, i + 1, okText)
        show(null, reply.ok ? okText || WALLET_TEXT.ok : WALLET_TEXT[reply.reason] || WALLET_TEXT.invalid)
      })
    } catch (e) {
      sendWallet(token, i + 1, okText)
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

  function relayWallet(token, okText) {
    if (!token || token === lastWallet) return
    lastWallet = token
    withConsent(null, function () { sendWallet(token, 0, okText) })
  }

  function check() {
    var node = document.querySelector('[data-keel-money-licence-token]')
    var token = tokenOf(node && node.textContent)
    if (token && token !== last) {
      last = token
      withConsent(node, function () { send(token, node, 0) })
    }
    // Checkout pages may also print a wallet session token in the page.
    var walletNode = document.querySelector('[data-keel-money-wallet-token]')
    if (walletNode) relayWallet(walletTokenOf(walletNode.textContent))
  }

  // ─── AI 4K Restore credits checkout (pricing page, ?offer=credits) ───
  // The Money settings (API origin, parent, publishable key) come from the
  // page's own [data-keel-money-checkout] config; nothing is hardcoded here.
  // Keep the keys in step with RESTORE_CATALOGUE_OFFERS in src/core/restore/wallet.ts.
  var CREDIT_OFFERS = [
    { price: 'gpdt_credits_30', product: 'gpdt_credits_30', name: 'Starter Pack', credits: '30 credits' },
    { price: 'gpdt_credits_100', product: 'gpdt_credits_100', name: 'Popular Pack', credits: '100 credits' },
    { price: 'gpdt_credits_300', product: 'gpdt_credits_300', name: 'Archive Pack', credits: '300 credits' },
    { price: 'gpdt_restore_pass_monthly', product: 'gpdt_restore_pass', name: 'Monthly Pass', credits: '50 credits a month', recurring: true },
  ]
  var CREDIT_ASSET = 'AI_RESTORE_CREDIT'
  var CREDIT_CONSENT_VERSION = 'credits-waiver-v1'
  var CREDIT_CONSENT_TEXT = 'I ask for my credits to be added immediately after I pay. I understand that once they are added I lose my right to cancel this purchase.'
  var CLAIM_PREFIX = 'keel:money:claim:' // same sessionStorage prefix as the Keel checkout
  var CREDIT_TEXT = {
    unavailable: 'AI credit packs are not available to buy right now. Nothing was charged.',
    refused: 'Checkout could not be started. Nothing was charged. Try again in a moment.',
    pending: 'Payment is not confirmed yet. Refresh this page in a minute.',
    added: 'Payment received and your credits are in your Sylphx wallet. Open Google Photos and choose AI 4K Restore on a photo.',
    connect: 'Payment received. To use the credits, open AI 4K Restore in the extension and choose Connect Sylphx Wallet.',
    claimFailed: 'Payment received, but the credits could not be added to your wallet yet. Email hi@sylphx.com with your receipt and we will add them.',
    cancelled: 'Checkout was cancelled. Nothing was charged.',
  }

  function moneyConfig() {
    var node = document.querySelector('[data-keel-money-checkout]')
    if (!node) return null
    try {
      var c = JSON.parse(node.getAttribute('data-keel-money-checkout') || '{}')
      if (typeof c.api_origin !== 'string' || !/^https:\/\//.test(c.api_origin)) return null
      if (typeof c.parent !== 'string' || !c.parent || typeof c.publishable_key !== 'string' || !c.publishable_key) return null
      return { origin: c.api_origin.replace(/\/+$/, ''), parent: c.parent, key: c.publishable_key, anchor: node }
    } catch (e) { return null }
  }
  function offerFor(pack) {
    for (var i = 0; i < CREDIT_OFFERS.length; i++) if (CREDIT_OFFERS[i].price === pack || CREDIT_OFFERS[i].product === pack) return CREDIT_OFFERS[i]
    return CREDIT_OFFERS[1]
  }
  function pageUrl(query) { return window.location.origin + window.location.pathname + query }
  function randomKey() {
    var c = window.crypto
    return c && typeof c.randomUUID === 'function' ? c.randomUUID() : localId()
  }
  function money(minor, currency) {
    var n = Number(minor)
    if (!isFinite(n)) return '–'
    try { return new Intl.NumberFormat('en', { style: 'currency', currency: currency }).format(n / 100) } catch (e) { return currency + ' ' + (n / 100).toFixed(2) }
  }
  function postJson(url, headers, body) {
    headers['Content-Type'] = 'application/json'
    headers.Accept = 'application/json'
    return window.fetch(url, { method: 'POST', headers: headers, body: JSON.stringify(body) })
  }

  /** Live prices for the four offers, keyed by price key; null when the catalogue cannot be read. */
  function loadCreditPrices(cfg) {
    return window.fetch(cfg.origin + '/v1/money/' + cfg.parent + '/catalog', {
      method: 'GET', headers: { Authorization: 'Bearer ' + cfg.key, Accept: 'application/json' },
    }).then(function (res) { return res.ok ? res.json() : null }).then(function (cat) {
      if (!cat) return null
      var products = (cat.spec && cat.spec.products) || cat.products || []
      var out = {}
      for (var i = 0; i < products.length; i++) {
        var prices = products[i].prices || []
        for (var j = 0; j < prices.length; j++) {
          var p = prices[j]
          var currency = p.default_currency || Object.keys(p.unit_amounts || {})[0]
          if (p.key && currency && p.unit_amounts && p.unit_amounts[currency] !== undefined) out[p.key] = { currency: currency, minor: p.unit_amounts[currency], product: products[i].key }
        }
      }
      return out
    }).catch(function () { return null })
  }

  function renderCreditCheckout(cfg, selected) {
    var card = 'display:grid;gap:12px;margin:0 0 24px;padding:16px;border:1px solid #D6D3CC;border-radius:12px;background:#FFFFFF;color:#1A1920;font:400 14px/1.5 Inter,system-ui,sans-serif;text-align:left'
    var section = el('section', { id: 'gpdt-credits', 'aria-labelledby': 'gpdt-credits-title', style: card })
    var form = el('form', { id: 'gpdt-credits-form', novalidate: '', style: 'display:grid;gap:12px' })
    var options = el('fieldset', { style: 'display:grid;gap:8px;margin:0;padding:0;border:0' }, [el('legend', { style: 'margin:0 0 8px;font-size:13px;font-weight:600' }, ['Choose credits'])])
    var priceNodes = {}
    for (var i = 0; i < CREDIT_OFFERS.length; i++) {
      var o = CREDIT_OFFERS[i]
      var radio = el('input', { type: 'radio', name: 'gpdt-credit-offer', value: o.price, id: 'gpdt-offer-' + o.price, style: 'margin:3px 0 0;accent-color:#4B32C3' })
      if (o === selected) radio.checked = true
      priceNodes[o.price] = el('span', { 'data-credit-price': o.price, style: 'margin-left:auto;font-weight:600;font-variant-numeric:tabular-nums' }, ['–'])
      options.append(el('label', { for: 'gpdt-offer-' + o.price, style: 'display:flex;gap:10px;align-items:flex-start;padding:12px;border:1px solid #D6D3CC;border-radius:8px;cursor:pointer' }, [
        radio,
        el('span', { style: 'display:grid' }, [el('span', { style: 'font-weight:600' }, [o.name]), el('span', { style: 'font-size:13px;color:#5C5A66;font-variant-numeric:tabular-nums' }, [o.credits + (o.recurring ? ' · renews monthly until you cancel' : '')])]),
        priceNodes[o.price],
      ]))
    }
    var email = el('input', { type: 'email', id: 'gpdt-credits-email', autocomplete: 'email', required: '', style: 'height:40px;padding:0 12px;border:1px solid #D6D3CC;border-radius:8px;font:inherit' })
    var waiver = el('input', { type: 'checkbox', id: 'gpdt-credits-waiver', style: 'margin:2px 0 0;width:16px;height:16px;accent-color:#4B32C3;flex:none' })
    var submit = el('button', { type: 'submit', id: 'gpdt-credits-submit', style: 'height:40px;padding:0 16px;border:0;border-radius:8px;background:#4B32C3;color:#FFFFFF;font:600 13px/1.2 inherit;cursor:pointer' }, ['Continue to secure checkout'])
    var note = el('p', { id: 'gpdt-credits-status', role: 'status', style: 'margin:0;font-size:13px;color:#5C5A66' })
    submit.disabled = true
    form.append(options,
      el('label', { for: 'gpdt-credits-email', style: 'display:grid;gap:4px;font-size:13px;font-weight:600' }, ['Email for your receipt', email]),
      el('label', { for: 'gpdt-credits-waiver', style: 'display:flex;gap:8px;align-items:flex-start;font-size:13px;cursor:pointer' }, [waiver, el('span', {}, [CREDIT_CONSENT_TEXT])]),
      el('div', { style: 'display:flex;justify-content:flex-end' }, [submit]), note)
    section.append(
      el('h2', { id: 'gpdt-credits-title', style: 'margin:0;font-size:20px;font-weight:600;line-height:1.25' }, ['AI 4K Restore credits']),
      el('p', { style: 'margin:0;color:#5C5A66' }, ['Each restore uses 1 credit, and a failed restore uses none. Prices come from the live catalogue and include tax where it applies.']),
      form)
    cfg.anchor.parentNode.insertBefore(section, cfg.anchor)
    return { section: section, form: form, email: email, waiver: waiver, submit: submit, note: note, priceNodes: priceNodes }
  }

  function startCreditCheckout(cfg, ui, prices, offer, token) {
    var price = prices[offer.price]
    if (!price) { ui.note.textContent = CREDIT_TEXT.unavailable; return }
    ui.submit.disabled = true
    ui.note.textContent = 'Starting secure checkout…'
    if (typeof window.gpdtTrack === 'function') window.gpdtTrack('ai_credit_checkout')
    var headers = { Authorization: 'Bearer ' + (token || cfg.key), 'Idempotency-Key': randomKey() }
    if (token) headers['x-sylphx-key'] = cfg.key
    var endpoint = token ? 'checkout_sessions:userCreate' : 'checkout_sessions:clientCreate'
    postJson(cfg.origin + '/v1/money/' + cfg.parent + '/' + endpoint, headers, {
      product: price.product || offer.product,
      price: offer.price,
      quantity: 1,
      currency_code: price.currency,
      buyer_email: ui.email.value.trim(),
      consent: { terms_accepted: true, terms_version: CREDIT_CONSENT_VERSION, terms_text: CREDIT_CONSENT_TEXT },
      success_url: pageUrl('?offer=credits&credit_session_id={CHECKOUT_SESSION_ID}'),
      cancel_url: pageUrl('?offer=credits&checkout=cancelled'),
    }).then(function (res) { return res.ok ? res.json() : null }).then(function (session) {
      var url = session && (session.url || session.checkout_url)
      if (typeof url !== 'string' || !/^https:\/\//.test(url)) throw new Error('no checkout url')
      try {
        if (session.claim_secret && session.processor_session_id) window.sessionStorage.setItem(CLAIM_PREFIX + session.processor_session_id, String(session.claim_secret))
      } catch (e) { /* the claim still works with the wallet token */ }
      ui.note.textContent = 'Redirecting to checkout…'
      window.location.assign(url)
    }).catch(function () {
      ui.note.textContent = CREDIT_TEXT.refused
      ui.submit.disabled = false
    })
  }

  /** After checkout: confirm the payment, add the credits to the wallet, then hand the wallet to the extension. */
  function finishCreditCheckout(cfg, sessionId, token) {
    var claim = null
    try { claim = window.sessionStorage.getItem(CLAIM_PREFIX + sessionId) } catch (e) { claim = null }
    var redeem = { checkout_session: sessionId }
    if (claim) redeem.claim_secret = claim
    show(cfg.anchor, 'Checking your payment…')
    return postJson(cfg.origin + '/v1/money/checkout_sessions:redeem', {}, redeem).then(function (res) { return res.ok ? res.json() : null }).then(function (result) {
      if (!result || result.paid !== true) return show(cfg.anchor, CREDIT_TEXT.pending)
      if (!token) return show(cfg.anchor, CREDIT_TEXT.connect)
      return postJson(cfg.origin + '/v1/money/' + cfg.parent + '/wallet:claimCheckout', { Authorization: 'Bearer ' + token, 'x-sylphx-key': cfg.key }, {
        checkout_session_id: sessionId, asset: CREDIT_ASSET,
      }).then(function (res) {
        if (!res.ok) return show(cfg.anchor, CREDIT_TEXT.claimFailed)
        show(cfg.anchor, CREDIT_TEXT.added)
        lastWallet = '' // hand the wallet over again now that it holds the new credits
        relayWallet(token, CREDIT_TEXT.added)
      })
    }).catch(function () { show(cfg.anchor, CREDIT_TEXT.pending) })
  }

  function creditCheckout(token) {
    var params
    try { params = new URLSearchParams(window.location.search) } catch (e) { return }
    if (params.get('offer') !== 'credits') return
    var cfg = moneyConfig()
    if (!cfg) return
    var sessionId = params.get('credit_session_id')
    if (sessionId && /^cs_[A-Za-z0-9_]+$/.test(sessionId)) { finishCreditCheckout(cfg, sessionId, token); return }
    var ui = renderCreditCheckout(cfg, offerFor(params.get('pack')))
    if (params.get('checkout') === 'cancelled') ui.note.textContent = CREDIT_TEXT.cancelled
    var prices = {}
    function ready() {
      var picked = ui.form.querySelector('input[name="gpdt-credit-offer"]:checked')
      var offer = offerFor(picked ? picked.value : '')
      ui.submit.disabled = !prices[offer.price] || !ui.waiver.checked || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(ui.email.value.trim())
      return offer
    }
    ui.form.addEventListener('input', ready)
    ui.form.addEventListener('change', ready)
    ui.form.addEventListener('submit', function (e) {
      e.preventDefault()
      var offer = ready()
      if (ui.submit.disabled) return
      withConsent(ui.form, function () { startCreditCheckout(cfg, ui, prices, offer, token) })
    })
    loadCreditPrices(cfg).then(function (live) {
      prices = live || {}
      for (var i = 0; i < CREDIT_OFFERS.length; i++) {
        var p = prices[CREDIT_OFFERS[i].price]
        ui.priceNodes[CREDIT_OFFERS[i].price].textContent = p ? money(p.minor, p.currency) + (CREDIT_OFFERS[i].recurring ? '/mo' : '') : '–'
      }
      if (!prices[offerFor(params.get('pack')).price]) ui.note.textContent = CREDIT_TEXT.unavailable
      ready()
    })
  }

  var walletToken = takeWalletToken()
  relayWallet(walletToken)
  creditCheckout(walletToken)

  new MutationObserver(check).observe(document.documentElement, { childList: true, subtree: true, characterData: true })
  check()
})()
