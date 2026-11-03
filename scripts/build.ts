/**
 * Build script — one source of truth for every shipped artifact:
 *   - Chrome extension (MV3, dist/extension/)          → google-photos-delete-tool.zip
 *   - Firefox extension (MV3, dist/extension-firefox/) → google-photos-delete-tool-firefox.zip
 *   - Standalone inject script (console paste)
 *   - Userscript (Tampermonkey/Violentmonkey with metadata header)
 *
 * The two extension manifests are derived from ONE source
 * (src/extension/manifest.json); the Firefox variant swaps
 * `background.service_worker` for `background.scripts` (Firefox MV3 does
 * not support service_worker) and adds browser_specific_settings.
 */
import { build } from 'vite'
import { SUPPORTED_MATCH_PATTERN } from '../src/core/surface'
import { licenseTrust } from '../src/core/license-trust'
import { licenseEnvironment, distDirectory } from './lib/license-build'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { resolve } from 'path'
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  copyFileSync,
  cpSync,
  existsSync,
  rmSync,
  renameSync,
} from 'fs'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf-8'))
const define = { __GPDT_LICENSE_ENVIRONMENT__: JSON.stringify(licenseEnvironment) }
const trust = licenseTrust(licenseEnvironment)
const buildInfo = {
  version: pkg.version,
  commit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  licenseEnvironment,
  publicJwks: trust.url,
  trustCapturedAt: trust.fetchedAt,
}
console.log(`Building ${licenseEnvironment} licence trust into ${distDirectory}/`)

// ─── Extension build (shared entries) ───────────────────────────

const extensionEntries = [
  { name: 'content', input: 'src/extension/content.ts' },
  { name: 'background', input: 'src/extension/background.ts' },
  { name: 'popup', input: 'src/extension/popup/popup.ts' },
]

async function buildExtension(outDir: string): Promise<void> {
  rmSync(outDir, { recursive: true, force: true })
  mkdirSync(outDir, { recursive: true })

  for (const entry of extensionEntries) {
    console.log(`[extension:${outDir.split('/').pop()}] Building ${entry.name}...`)
    await build({
      configFile: false,
      root,
      define,
      build: {
        outDir,
        emptyOutDir: false, // we already wiped it; reuse the same dir across entries
        target: 'es2022',
        sourcemap: false, // shipped artifact — no maps
        lib: {
          entry: resolve(root, entry.input),
          formats: ['iife'],
          name: `__gpdt_${entry.name}`,
          fileName: () => `${entry.name}.js`,
          cssFileName: 'popup',
        },
        rollupOptions: {
          output: { inlineDynamicImports: true },
        },
        minify: true,
      },
      logLevel: 'warn',
    })
  }

  // popup.html
  writeFileSync(
    resolve(outDir, 'popup.html'),
    readFileSync(resolve(root, 'src/extension/popup/popup.html'), 'utf-8').replace('<body>', licenseEnvironment === 'preview' ? '<body><p role="note" style="margin:8px;color:#b45309">Preview build — Test Mode licences only</p>' : '<body>'),
  )
  writeFileSync(resolve(outDir, 'build-info.json'), JSON.stringify(buildInfo, null, 2) + '\n')

  // Localized store name/description (manifest __MSG_*__ keys)
  cpSync(resolve(root, '_locales'), resolve(outDir, '_locales'), { recursive: true })

  // Icons
  const iconsOut = resolve(outDir, 'icons')
  mkdirSync(iconsOut, { recursive: true })
  for (const size of [16, 32, 48, 128]) {
    const name = `icon-${size}.png`
    const src = resolve(root, `src/extension/icons/${name}`)
    if (existsSync(src)) copyFileSync(src, resolve(iconsOut, name))
  }

  // Fallback for environments where `cssFileName` isn't honoured yet
  // (older Vite). Always run the rename — overwrite any stale popup.css
  // from a previous build instead of silently keeping it.
  const wrongCss = resolve(outDir, 'google-photos-delete-tool.css')
  const correctCss = resolve(outDir, 'popup.css')
  if (existsSync(wrongCss)) {
    if (existsSync(correctCss)) rmSync(correctCss)
    renameSync(wrongCss, correctCss)
  }
}

// ─── Manifests ──────────────────────────────────────────────────

const baseManifest = JSON.parse(
  readFileSync(resolve(root, 'src/extension/manifest.json'), 'utf-8'),
)

function chromeManifest(): Record<string, unknown> {
  return { ...baseManifest, version: pkg.version }
}

/**
 * Firefox MV3 manifest: `background.scripts` instead of
 * `service_worker` (Firefox bug 1573659 — service_worker is unsupported
 * in Firefox MV3; background.scripts is the supported shape).
 */
function firefoxManifest(): Record<string, unknown> {
  const m: Record<string, unknown> = { ...baseManifest, version: pkg.version }
  delete (m.background as { service_worker?: string })?.service_worker
  m.background = { scripts: ['background.js'] }
  // AMO limits add-on names to 50 characters; the 75-character Chrome store
  // title would be rejected, so Firefox uses the short localized name
  // (appNameEdge, at most 45 characters in every locale).
  m.name = '__MSG_appNameEdge__'
  m.browser_specific_settings = {
    gecko: {
      id: 'google-photos-delete-tool@shtse8.github.io',
      // data_collection_permissions is only understood from Firefox 140
      // (desktop) and 142 (Android); AMO's linter warns when the minimum is
      // lower than the version that introduced a manifest key we use.
      strict_min_version: '140.0',
      // AMO rejects new add-ons without this key. The extension collects and
      // transmits nothing.
      data_collection_permissions: { required: ['none'] },
    },
    gecko_android: { strict_min_version: '142.0' },
  }
  return m
}

// ─── Chrome extension ───────────────────────────────────────────

const chromeDir = resolve(root, `${distDirectory}/extension`)
await buildExtension(chromeDir)
writeFileSync(
  resolve(chromeDir, 'manifest.json'),
  JSON.stringify(chromeManifest(), null, 2),
)
console.log('✅ Chrome extension → dist/extension/')

// ─── Edge extension ─────────────────────────────────────────────
// Edge reads the extension name from the manifest and caps it at 45
// characters per locale, so the Edge package is the Chrome build with the
// short localized name (appNameEdge in _locales/*/messages.json).
const edgeDir = resolve(root, `${distDirectory}/extension-edge`)
rmSync(edgeDir, { recursive: true, force: true })
cpSync(chromeDir, edgeDir, { recursive: true })
writeFileSync(
  resolve(edgeDir, 'manifest.json'),
  JSON.stringify({ ...chromeManifest(), name: '__MSG_appNameEdge__' }, null, 2),
)
console.log('✅ Edge extension → dist/extension-edge/')

// ─── Firefox extension ──────────────────────────────────────────

const firefoxDir = resolve(root, `${distDirectory}/extension-firefox`)
await buildExtension(firefoxDir)
writeFileSync(
  resolve(firefoxDir, 'manifest.json'),
  JSON.stringify(firefoxManifest(), null, 2),
)
console.log('✅ Firefox extension → dist/extension-firefox/')

// ─── Standalone Inject ──────────────────────────────────────────

console.log('[standalone] Building inject.js...')
await build({
  configFile: false,
  root,
  define,
  build: {
    outDir: resolve(root, `${distDirectory}/standalone`),
    emptyOutDir: true,
    target: 'es2022',
    lib: {
      entry: resolve(root, 'src/standalone/inject.ts'),
      formats: ['iife'],
      name: 'GooglePhotosDeleteTool',
      fileName: () => 'inject.js',
    },
    rollupOptions: { output: { inlineDynamicImports: true } },
    minify: false, // Keep readable for console paste
  },
  logLevel: 'warn',
})
console.log('✅ Standalone → dist/standalone/inject.js')

// ─── Userscript ─────────────────────────────────────────────────

console.log('[userscript] Building...')
const userscriptDir = resolve(root, `${distDirectory}/userscript`)
mkdirSync(userscriptDir, { recursive: true })

await build({
  configFile: false,
  root,
  define,
  build: {
    outDir: userscriptDir,
    emptyOutDir: true,
    target: 'es2022',
    lib: {
      entry: resolve(root, 'src/userscript/google-photos-delete.user.ts'),
      formats: ['iife'],
      name: 'GooglePhotosDeleteUserscript',
      fileName: () => 'google-photos-delete.user.js',
    },
    rollupOptions: { output: { inlineDynamicImports: true } },
    minify: false,
  },
  logLevel: 'warn',
})

// Prepend userscript metadata header
const userscriptHeader = `// ==UserScript==
// @name         Google Photos Delete Tool
// @namespace    https://github.com/shtse8/Google-Photos-Delete-Tool
// @version      ${pkg.version}
// @description  Find and delete duplicate photos in Google Photos, and bulk delete with batch select, dry-run, and empty-trash (consent-gated)
// @author       Kyle Tse
// @match        ${SUPPORTED_MATCH_PATTERN}
// @grant        none
// @homepage     https://github.com/SylphxAI/Google-Photos-Delete-Tool
// @supportURL   https://github.com/SylphxAI/Google-Photos-Delete-Tool/issues
// @license      MIT
// @downloadURL  https://github.com/SylphxAI/Google-Photos-Delete-Tool/releases/latest/download/google-photos-delete.user.js
// @updateURL    https://github.com/SylphxAI/Google-Photos-Delete-Tool/releases/latest/download/google-photos-delete.user.js
// ==/UserScript==
`

const userscriptPath = resolve(userscriptDir, 'google-photos-delete.user.js')
const userscriptCode = readFileSync(userscriptPath, 'utf-8')
writeFileSync(userscriptPath, userscriptHeader + '\n' + userscriptCode)

console.log('✅ Userscript → dist/userscript/google-photos-delete.user.js')

writeFileSync(resolve(root, distDirectory, 'build-info.json'), JSON.stringify(buildInfo, null, 2) + '\n')

// ─── Summary ────────────────────────────────────────────────────

console.log('\n📦 Build complete!')
console.log('   dist/extension/                  Chrome extension (MV3)')
console.log('   dist/extension-firefox/          Firefox extension (MV3)')
console.log('   dist/standalone/inject.js        Console paste')
console.log('   dist/userscript/*.user.js        Tampermonkey/Violentmonkey')
