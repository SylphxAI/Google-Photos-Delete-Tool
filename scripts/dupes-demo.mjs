/**
 * "Find duplicates" end to end on a local test page, and the README screenshot.
 *
 * No Google account and no real photos: every request to photos.google.com
 * and lh3.googleusercontent.com is answered locally with a generated grid,
 * generated images (12 of them near-copies), and a stand-in for Google's
 * selection counter, toolbar and Trash dialog. The built userscript runs
 * its real scan → group → review → delete-engine path offline.
 *
 *   bun run build && node scripts/dupes-demo.mjs           # screenshot → docs/images/find-duplicates.png
 *   bun run build && node scripts/dupes-demo.mjs --check   # also move the red copies and assert
 *   bun run build && node scripts/dupes-demo.mjs --read-only-check --no-screenshot
 *     # scan and verify review/consent; never select or move an item
 *
 * Browser: CHROMIUM_PATH, else /usr/bin/chromium.
 */
import { chromium } from 'playwright-core'
import { readFile, mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const out = resolve(root, 'docs/images/find-duplicates.png')
const userscript = await readFile(resolve(root, 'dist/userscript/google-photos-delete.user.js'), 'utf-8')
if (process.argv.includes('--check') && process.argv.includes('--read-only-check')) {
  throw new Error('Choose either --check or --read-only-check')
}

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium' })
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })

// 1. Generate 36 synthetic "photos" in the browser: 24 originals and 12 near-copies.
await page.goto('about:blank')
const images = await page.evaluate(async () => {
  const draw = (seed, tweak) => {
    const c = document.createElement('canvas')
    c.width = c.height = 256
    const g = c.getContext('2d')
    let s = seed * 9301 + 49297
    const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280)
    const hue = Math.floor(rnd() * 360)
    const grad = g.createLinearGradient(0, 0, 256, 256)
    grad.addColorStop(0, `hsl(${hue},70%,${55 + tweak * 6}%)`)
    grad.addColorStop(1, `hsl(${(hue + 80) % 360},60%,${25 + tweak * 6}%)`)
    g.fillStyle = grad
    g.fillRect(0, 0, 256, 256)
    for (let i = 0; i < 6; i++) {
      g.fillStyle = `hsla(${Math.floor(rnd() * 360)},80%,60%,0.85)`
      g.beginPath()
      g.arc(rnd() * 256, rnd() * 256, 20 + rnd() * 60, 0, Math.PI * 2)
      g.fill()
    }
    return c.toDataURL('image/jpeg', tweak ? 0.6 : 0.92).split(',')[1]
  }
  const list = []
  for (let i = 0; i < 24; i++) {
    list.push({ key: `o${i}`, data: draw(i + 1, 0) })
    if (i % 2 === 0) list.push({ key: `c${i}`, data: draw(i + 1, 1) })
  }
  return list
})

const tiles = images.map((img, i) => {
  const day = (i % 27) + 1
  return `<div class="t"><a href="./photo/AF1QipDemo${img.key}XYZ" aria-label="Photo - Landscape - Mar ${day}, 2024, 10:${String(i).padStart(2, '0')}:00 AM">` +
    `<div class="img" style="background-image:url(&quot;https://lh3.googleusercontent.com/pw/demo-${img.key}=w256-h256-no&quot;)"></div></a>` +
    `<div class="ckGgle" role="checkbox" aria-checked="false"></div></div>`
}).join('')
/**
 * The fake gallery. `selectionWorks: false` models what a Google Photos
 * markup change looks like from the tool's side: the checkbox elements are
 * still there and still receive clicks, but nothing ever becomes selected
 * and the counter never moves.
 */
const buildPage = ({ selectionWorks = true } = {}) => `<!doctype html><html><head><title>Photos - test page</title><style>
body{margin:0;background:#202124;font-family:sans-serif}
.yDSiEe.uGCjIb.zcLWac{height:100vh;overflow:auto;padding:16px;box-sizing:border-box}
.grid{display:grid;grid-template-columns:repeat(6,1fr);gap:4px;max-width:720px}
.Mfixef{position:absolute;left:-9999px}.t{position:relative}.img{aspect-ratio:1;background-size:cover}.ckGgle{display:none}
</style></head><body><div class="yDSiEe uGCjIb zcLWac" role="main"><div class="grid">${tiles}</div></div><div class="Mfixef"><span class="rtExYb">0</span><button aria-label="Move to trash" style="display:none" id="tb">Move to trash</button></div>
<script>
const upd=()=>{const n=document.querySelectorAll('.ckGgle[aria-checked=true]').length;document.querySelector('.rtExYb').textContent=String(n);document.getElementById('tb').style.display=n?'':'none'}
document.addEventListener('click',e=>{const c=e.target.closest&&e.target.closest('.ckGgle');if(c){${selectionWorks ? `c.setAttribute('aria-checked',c.getAttribute('aria-checked')==='true'?'false':'true');upd()` : '/* drifted page: the click is ignored */'}}},true)
document.getElementById('tb').addEventListener('click',()=>{const d=document.createElement('div');d.setAttribute('role','dialog');d.innerHTML='<button>Cancel</button><button id=cf>Move to trash</button>';document.body.append(d);d.querySelector('#cf').addEventListener('click',()=>{window.__trashed=(window.__trashed||[]).concat([...document.querySelectorAll('.ckGgle[aria-checked=true]')].map(c=>c.parentElement.querySelector('a').getAttribute('href')));document.querySelectorAll('.ckGgle[aria-checked=true]').forEach(c=>c.parentElement.remove());d.remove();upd()})})
</script></body></html>`

const html = buildPage()
/** Drifted page: same markup, clicks are ignored (see buildPage). */
const driftHtml = buildPage({ selectionWorks: false })

const byKey = new Map(images.map((i) => [i.key, Buffer.from(i.data, 'base64')]))
const wireRoutes = (p, body) => {
  p.route('https://photos.google.com/**', (route) => route.fulfill({ contentType: 'text/html', body }))
  p.route('https://lh3.googleusercontent.com/**', (route) => {
    const key = /demo-([a-z0-9]+)=/.exec(route.request().url())?.[1]
    const data = key && byKey.get(key)
    return data
      ? route.fulfill({ contentType: 'image/jpeg', body: data, headers: { 'access-control-allow-origin': 'https://photos.google.com', 'access-control-allow-credentials': 'true' } })
      : route.fulfill({ status: 404 })
  })
  p.route(/^(?!https:\/\/(photos\.google\.com|lh3\.googleusercontent\.com)\/).*/, (route) => route.abort())
}
await wireRoutes(page, html)

// 2. Load the grid, inject the built userscript, run Find duplicates.
await page.goto('https://photos.google.com/')
await page.evaluate((src) => new Function(src)(), userscript)
await page.locator('#gpdt-dupes').click()
await page.getByRole('button', { name: 'Scan this view' }).click()
await page.locator('#gpdt-dupes-host').getByText('To Trash', { exact: true }).waitFor({ timeout: 60_000 })
await page.waitForTimeout(800)
if (process.argv.includes('--read-only-check')) {
  const host = page.locator('#gpdt-dupes-host')
  const move = host.getByRole('button', { name: /^Move \d+ to Trash$/ })
  const planned = Number((await move.innerText()).match(/\d+/)[0])
  // The button stays enabled; its handler must refuse without consent.
  await move.click()
  const state = {
    planned,
    consent: await host.locator('.consent input[type=checkbox]').isChecked(),
    consentError: await host.locator('.err').innerText(),
    tiles: await page.locator('.ckGgle').count(),
    selected: await page.locator('.ckGgle[aria-checked=true]').count(),
    trashed: await page.evaluate(() => (window.__trashed ?? []).length),
  }
  console.log(`dupes-demo read-only: ${JSON.stringify(state)}`)
  if (planned <= 0 || state.consent || !state.consentError || state.tiles !== 36 || state.selected || state.trashed) {
    throw new Error('Read-only scan must show candidates with consent required and every tile untouched')
  }
}
if (!process.argv.includes('--no-screenshot')) {
  await mkdir(resolve(root, 'docs/images'), { recursive: true })
  await page.screenshot({ path: out })
  console.log(`dupes-demo: ${out}`)
}

if (process.argv.includes('--check')) {
  // Move the red copies through the real delete engine and check that
  // exactly those went to Trash and every original stayed.
  const host = page.locator('#gpdt-dupes-host')
  // Free users see the Pro review tools disabled, each with the Get Pro link.
  const tools = {
    selectOff: await host.locator('.tools select').isDisabled(),
    autoOff: await host.locator('.tools input[type=checkbox]').isDisabled(),
    csvOff: await host.getByRole('button', { name: 'Export CSV' }).isDisabled(),
    links: await host.locator('a.pro-tag').evaluateAll((as) => as.map((a) => `${a.textContent}|${new URL(a.href).searchParams.get('utm_medium')}`)),
  }
  const toolsOk = tools.selectOff && tools.autoOff && tools.csvOff && tools.links.length === 3 && tools.links.every((l) => l === 'Pro|dupes')
  console.log(`dupes-demo free gating: ${JSON.stringify(tools)}`)
  if (!toolsOk) {
    console.error('dupes-demo: FAILED — free users must see disabled Pro controls with the Get Pro link')
    process.exitCode = 1
  }
  const planned = Number((await host.getByRole('button', { name: /^Move \d+ to Trash$/ }).innerText()).match(/\d+/)[0])
  await host.locator('.consent input[type=checkbox]').check()
  await host.getByRole('button', { name: /^Move \d+ to Trash$/ }).click()
  await host.getByText(/^Done\./).waitFor({ timeout: 60_000 })
  const trashed = await page.evaluate(() => window.__trashed ?? [])
  const originalsLeft = await page.locator('a[href*="Demoo"]').count()
  const ok = planned > 0 && trashed.length === planned && trashed.every((h) => /Democ\d+/.test(h)) && originalsLeft === 24
  console.log(`dupes-demo: planned=${planned} trashed=${trashed.length} originalsLeft=${originalsLeft}`)
  if (!ok) {
    console.error(`dupes-demo: FAILED — trashed ${JSON.stringify(trashed)}`)
    process.exitCode = 1
  }

  // 3. Selection drift must fail closed. Same markup, but the page ignores
  // checkbox clicks (as a Google Photos change can): the run has to end in an
  // error that says nothing was deleted — never in a silent "Done." with an
  // unchanged gallery.
  const drift = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  await wireRoutes(drift, driftHtml)
  await drift.goto('https://photos.google.com/')
  await drift.evaluate((src) => new Function(src)(), userscript)
  await drift.locator('#gpdt-dupes').click()
  await drift.getByRole('button', { name: 'Scan this view' }).click()
  await drift.locator('#gpdt-dupes-host').getByText('To Trash', { exact: true }).waitFor({ timeout: 60_000 })
  const driftHost = drift.locator('#gpdt-dupes-host')
  await driftHost.locator('.consent input[type=checkbox]').check()
  await driftHost.getByRole('button', { name: /^Move \d+ to Trash$/ }).click()
  await driftHost.getByText(/never showed any of them as selected/).waitFor({ timeout: 60_000 })
  const driftTiles = await drift.locator('.ckGgle').count()
  const driftTrashed = await drift.evaluate(() => window.__trashed ?? [])
  const driftDone = await driftHost.getByText(/^Done\./).count()
  const driftOk = driftTiles === 36 && driftTrashed.length === 0 && driftDone === 0
  console.log(`dupes-demo drift: tiles=${driftTiles} trashed=${driftTrashed.length} doneShown=${driftDone} → error shown`)
  await drift.close()
  if (!driftOk) {
    console.error('dupes-demo drift: FAILED — a drifted page must fail closed, not report success')
    process.exitCode = 1
  }
}
await browser.close()
