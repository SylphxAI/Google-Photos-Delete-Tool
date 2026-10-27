// Build every localized landing and measure its real header in Chromium.
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { extname, join, resolve, sep } from 'node:path'
import { chromium } from 'playwright-core'
import { build } from './site-build.mjs'

const temporary = await mkdtemp(join(tmpdir(), 'gpdt-responsive-'))
const out = join(temporary, 'site')
const { slugs } = build({ outDir: out })
const types = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp',
  '.gif': 'image/gif', '.ico': 'image/x-icon',
}
const server = createServer(async (req, res) => {
  try {
    let relative = decodeURIComponent(new URL(req.url, 'http://local').pathname).replace(/^\//, '')
    if (!relative || relative.endsWith('/')) relative += 'index.html'
    const file = resolve(out, relative)
    if (file !== out && !file.startsWith(out + sep)) {
      res.writeHead(403).end('refused')
      return
    }
    const bytes = await readFile(file)
    res.writeHead(200, { 'content-type': types[extname(file)] || 'application/octet-stream' })
    res.end(bytes)
  } catch (error) {
    res.writeHead(error.code === 'ENOENT' ? 404 : 500).end('not found')
  }
})
await new Promise((resolveListen) => server.listen(0, '127.0.0.1', resolveListen))
const origin = `http://127.0.0.1:${server.address().port}`
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
  args: ['--no-sandbox'],
})
const results = []

try {
  for (const viewport of [{ name: 'mobile', width: 390, height: 844 }, { name: 'desktop', width: 1440, height: 1000 }]) {
    const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } })
    for (const slug of ['en', ...slugs]) {
      const page = await context.newPage()
      const errors = []
      page.on('pageerror', (error) => errors.push(String(error)))
      await page.goto(`${origin}/${slug === 'en' ? '' : `${slug}/`}`, { waitUntil: 'networkidle' })
      const measurement = await page.evaluate(() => {
        const root = document.documentElement
        const header = document.querySelector('.top-in')
        const rect = (selector) => {
          const element = document.querySelector(selector)
          if (!element) return null
          const { x, y, width, height, right, bottom } = element.getBoundingClientRect()
          return { x, y, width, height, right, bottom }
        }
        return {
          clientWidth: root.clientWidth,
          scrollWidth: root.scrollWidth,
          brand: rect('.top-in .brand'),
          language: rect('.top-in .lang'),
          store: rect('.top-in > .btn-sm'),
          storeHref: document.querySelector('.top-in > .btn-sm')?.href,
          navVisible: getComputedStyle(document.querySelector('.top nav')).display !== 'none',
        }
      })
      const path = slug === 'en' ? '/' : `/${slug}/`
      assert(measurement.scrollWidth <= measurement.clientWidth, `${path} ${viewport.name} overflows: ${JSON.stringify(measurement)}`)
      for (const [control, rect] of Object.entries({ brand: measurement.brand, language: measurement.language, store: measurement.store })) {
        assert(rect && rect.width > 0 && rect.height > 0, `${path} ${viewport.name} ${control} is missing`)
        assert(rect.x >= 0 && rect.right <= measurement.clientWidth + 0.5, `${path} ${viewport.name} ${control} is clipped: ${JSON.stringify({ rect, measurement })}`)
        assert(rect.y >= 0 && rect.bottom <= viewport.height, `${path} ${viewport.name} ${control} is vertically unreachable`)
      }
      assert(measurement.storeHref.includes('jiahfbbfpacpolomdjlpdpiljllcdenb'), `${path} changed the original store identity`)
      assert.equal(measurement.navVisible, viewport.name === 'desktop', `${path} changed desktop navigation visibility`)
      assert.deepEqual(errors, [], `${path} ${viewport.name} browser errors`)
      results.push({ slug, viewport: viewport.name, ...measurement })
      await page.close()
    }

    if (viewport.name === 'mobile') {
      const page = await context.newPage()
      await page.goto(`${origin}/`, { waitUntil: 'networkidle' })
      await page.locator('.lang summary').click()
      await page.locator('.lang a[hreflang="de"]').click()
      await page.waitForURL(`${origin}/de/`)
      assert.equal(await page.locator('html').getAttribute('lang'), 'de')
      results.push({ languagePicker: 'en -> de' })
      await page.close()
    }
    await context.close()
  }
  console.log(`Responsive storefront PASS: ${slugs.length + 1} locales × 2 viewports (${results.length - 1} pages), language picker en -> de`)
} finally {
  await browser.close()
  await new Promise((resolveClose) => server.close(resolveClose))
  await rm(temporary, { recursive: true, force: true })
}
