/* Website analytics: global opt-in (basic consent mode), never a payment authority.
   No Google script or collection until an affirmative choice. No purchase inference. */
(function () {
  'use strict'
  var CWS = 'https://chromewebstore.google.com/detail/google-photos-delete-tool/jiahfbbfpacpolomdjlpdpiljllcdenb'
  if (window.__gpdtTracking) return
  window.__gpdtTracking = true
  var STORE_KEY = 'gpdt_consent'
  var script = document.currentScript

  // Resolve a data file next to this script, so localised pages in /<lang>/ read the shared root files.
  function sibling(name) { return script && script.src ? new URL(name, script.src).href : name }

  function placeholder(v) { return !v || /X{4}/.test(String(v)) }
  function read() { try { return localStorage.getItem(STORE_KEY) } catch (e) { return null } }
  function write(k, v) { try { localStorage.setItem(k, v); return localStorage.getItem(k) === v } catch (e) { return false } }
  // Only affirmative stored choices enable collection; ambiguous legacy values do not.
  function normalize(v) {
    if (v === 'denied') return 'none'
    return v === 'all' || v === 'analytics' || v === 'none' ? v : null
  }
  function state(choice) {
    var ad = choice === 'all' ? 'granted' : 'denied'
    return { ad_storage: ad, ad_user_data: ad, ad_personalization: ad, analytics_storage: choice === 'all' || choice === 'analytics' ? 'granted' : 'denied' }
  }

  // UTM carry-through: the Add to Chrome link keeps this page's utm_* values.
  function carryUtm() {
    var links = document.querySelectorAll ? document.querySelectorAll('[data-cta="add-to-chrome"]') : []
    var params = []
    new URLSearchParams(location.search).forEach(function (val, key) {
      if (/^utm_[a-z_]+$/.test(key)) params.push([key, val.slice(0, 100)])
    })
    var all = Array.prototype.slice.call(links)
    var hero = document.getElementById('add-to-chrome')
    if (hero && all.indexOf(hero) < 0) all.push(hero)
    all.forEach(function (link) {
      var out = new URL(CWS)
      params.forEach(function (p) { out.searchParams.set(p[0], p[1]) })
      link.href = out.toString()
    })
  }

  // The banner shows when no choice is stored, and reopens from the footer "Cookie settings" link.
  // Reopening marks the current choice (aria-pressed); a new choice updates consent at once.
  function banner(update, current, autoOpen) {
    var el = document.getElementById('consent')
    if (!el) return
    var cur = current
    function mark() {
      ;['all', 'analytics', 'none'].forEach(function (choice) {
        el.querySelector('[data-consent="' + choice + '"]').setAttribute('aria-pressed', choice === cur ? 'true' : 'false')
      })
    }
    ;['all', 'analytics', 'none'].forEach(function (choice) {
      el.querySelector('[data-consent="' + choice + '"]').addEventListener('click', function () {
        var saved = write(STORE_KEY, choice)
        // A failed change is not consent. Remove a stale grant where storage permits.
        if (!saved) { try { localStorage.removeItem(STORE_KEY) } catch (e) { /* enable also fails closed */ } }
        cur = saved ? choice : 'none'
        update(cur); mark(); el.hidden = true
      })
    })
    var open = function () { mark(); el.hidden = false }
    var links = document.querySelectorAll ? Array.prototype.slice.call(document.querySelectorAll('[data-cookie-settings]')) : []
    var byId = document.getElementById('cookie-settings')
    if (byId && links.indexOf(byId) < 0) links.push(byId)
    links.forEach(function (l) { l.addEventListener('click', function (e) { if (e && e.preventDefault) e.preventDefault(); open() }) })
    if (!cur && autoOpen !== false) open()
  }

  function start(cfg) {
    var ga4 = /^G-[A-Z0-9]+$/.test(cfg.ga4MeasurementId || '') && !placeholder(cfg.ga4MeasurementId) ? cfg.ga4MeasurementId : null
    var ads = /^AW-[0-9]+$/.test(cfg.adsConversionId || '') ? cfg.adsConversionId : null
    var choice = normalize(read())
    var loaded = false
    var activeAds = false
    var cleanLocation = location.origin + location.pathname

    function gtag() { window.dataLayer.push(arguments) }
    function enable() {
      if (loaded || (choice !== 'all' && choice !== 'analytics') || (!ga4 && !(ads && choice === 'all'))) return
      // Fail closed when consent cannot be saved (including a read-only stored grant).
      if (!write(STORE_KEY, choice)) return
      loaded = true
      activeAds = !!ads && choice === 'all'
      window.dataLayer = window.dataLayer || []
      window.gtag = gtag
      // Basic consent mode: these commands exist only AFTER affirmative consent.
      gtag('consent', 'default', state('none'))
      gtag('consent', 'update', state(choice))
      gtag('set', 'ads_data_redaction', true)
      // Never send session IDs, tokens, email, click IDs or query/hash values to Google.
      gtag('set', { page_location: cleanLocation, page_referrer: '', url_passthrough: false })
      gtag('js', new Date())
      if (ga4) gtag('config', ga4, { page_location: cleanLocation, page_referrer: '', send_page_view: true, allow_google_signals: false, allow_ad_personalization_signals: false })
      if (activeAds) gtag('config', ads, { page_location: cleanLocation, page_referrer: '' })
      var s = document.createElement('script')
      s.async = true
      s.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(ga4 || ads)
      document.head.appendChild(s)
    }
    function clearCookies() {
      // Only analytics/ad cookies; never touch checkout, licence or recovery state.
      String(document.cookie || '').split(';').forEach(function (part) {
        var name = part.split('=')[0].trim()
        if (!/^(_ga($|_)|_gid$|_gat($|_)|_gcl_)/.test(name)) return
        var paths = ['/']
        var segments = location.pathname.split('/')
        for (var i = 1; i < segments.length; i++) {
          var path = segments.slice(0, i + 1).join('/')
          paths.push(path, path + '/')
        }
        paths.forEach(function (path) {
          var expiry = name + '=; Max-Age=0; path=' + path
          document.cookie = expiry
          var host = location.hostname.split('.')
          while (host.length > 1) { document.cookie = expiry + '; domain=.' + host.join('.'); host.shift() }
        })
      })
    }
    function update(next) {
      if (choice === next) return
      choice = next
      if (loaded) {
        // Consent-update pings are not sufficient withdrawal. Disable collection first,
        // then unload the Google runtime by reloading with the newly saved choice.
        if (ga4) window['ga-disable-' + ga4] = true
        if (ads) window['ga-disable-' + ads] = true
        clearCookies()
        window.dataLayer.length = 0
        location.reload()
        return
      }
      if (choice === 'none') clearCookies()
      enable()
    }
    banner(update, choice)
    if (choice === 'none') clearCookies()
    enable()
    window.addEventListener('storage', function (event) {
      if (event.key === STORE_KEY || event.key === null) update(normalize(read()))
    })

    // A restored page may have missed storage events while it was frozen.
    window.addEventListener('pageshow', function () { update(normalize(read())) })

    function event(name, conversion) {
      if (!loaded || (choice !== 'all' && choice !== 'analytics') || (ga4 && window['ga-disable-' + ga4])) return
      if (ga4) gtag('event', name, { send_to: ga4, page_location: cleanLocation, page_referrer: '', transport_type: 'beacon' })
      if (activeAds && choice === 'all' && conversion && new RegExp('^' + ads + '/[A-Za-z0-9_-]+$').test(conversion)) {
        gtag('event', 'conversion', { send_to: conversion, page_location: cleanLocation, page_referrer: '', transport_type: 'beacon' })
      }
    }
    var ctas = Array.prototype.slice.call(document.querySelectorAll('[data-cta="add-to-chrome"]'))
    var hero = document.getElementById('add-to-chrome')
    if (hero && ctas.indexOf(hero) < 0) ctas.push(hero)
    ctas.forEach(function (el) { el.addEventListener('click', function () { event('add_to_chrome_click', cfg.addToChromeSendTo) }) })
    Array.prototype.slice.call(document.querySelectorAll('[data-cta="pro"]')).forEach(function (el) {
      el.addEventListener('click', function () { event('pro_click') })
    })

    // AI 4K Restore funnel. These are website events only: the extension and
    // userscript send no analytics. Each call re-reads the stored choice, so an
    // event fires only after an affirmative grant ('all' or 'analytics') and
    // only while the tag is loaded and not disabled. Never carries photo,
    // wallet or checkout identifiers; the name is the whole payload.
    var AI_EVENTS = { ai_restore_start: true, ai_credit_checkout: true, ai_restore_complete: true }
    function aiEvent(name) {
      if (!Object.prototype.hasOwnProperty.call(AI_EVENTS, name)) return false
      var now = normalize(read())
      if (now !== 'all' && now !== 'analytics') return false
      if (!loaded || (ga4 && window['ga-disable-' + ga4])) return false
      event(name)
      return true
    }
    window.gpdtTrack = aiEvent
    Array.prototype.slice.call(document.querySelectorAll('[data-cta="ai-restore"]')).forEach(function (el) {
      el.addEventListener('click', function () { aiEvent('ai_restore_start') })
    })
    Array.prototype.slice.call(document.querySelectorAll('[data-cta="credits"]')).forEach(function (el) {
      el.addEventListener('click', function () { aiEvent('ai_credit_checkout') })
    })
    // This website has no verified paid-order receipt. A return URL, entitlement or
    // access token is never a purchase signal; purchase measurement stays absent.
  }

  // Self-serve checkout switch (config.json selfServeCheckout): when true every Pro buy
  // link goes to checkoutUrl and the "Lost your licence?" link (recoverUrl) shows. Hrefs only.
  function checkout(cfg) {
    if (!cfg || cfg.selfServeCheckout !== true || !cfg.checkoutUrl) return
    var pros = document.querySelectorAll ? Array.prototype.slice.call(document.querySelectorAll('[data-cta="pro"]')) : []
    pros.forEach(function (el) { el.href = cfg.checkoutUrl })
    var rec = document.getElementById ? document.getElementById('recover') : null
    if (rec && cfg.recoverUrl) {
      var a = rec.querySelector('a')
      if (a) a.href = cfg.recoverUrl
      rec.hidden = false
    }
  }

  carryUtm()
  fetch(sibling('config.json'), { cache: 'no-cache' }).then(function (r) { return r.json() }).then(function (cfg) { try { checkout(cfg) } catch (e) { /* keep the current links */ } return start(cfg) }).catch(function () { start({}) /* no config: no tags; settings remain available */ })
})()
