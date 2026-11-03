/**
 * Read-only duplicate-grouping responsiveness in Chromium; no Google account,
 * photos, or network. Random hashes cover 10x/100x growth; dense buckets and
 * one large identical group exercise work hidden inside a single seed.
 *
 * DESK_BUN_REMOTE=0 bun scripts/bench/grouping.ts --out grouping.json
 * --source /path/to/group.ts measures another revision with the same fixture.
 * --trials 3 (default). Times are instrument-specific, not production RUM.
 */
import { chromium } from 'playwright-core'
import { build } from 'vite'
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { groupDuplicates } from '../../src/core/dedup/group'

const root = fileURLToPath(new URL('../..', import.meta.url))
const arg = (name: string): string | undefined => {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}
const source = resolve(arg('source') ?? resolve(root, 'src/core/dedup/group.ts'))
const trials = Number(arg('trials') ?? 3)
if (!Number.isInteger(trials) || trials < 1) throw new Error('--trials must be a positive integer')
const bundled = await build({
  configFile: false, root, logLevel: 'warn',
  build: { write: false, target: 'es2022', minify: false,
    lib: { entry: source, formats: ['iife'], name: '__gpdtGrouping' } },
})
const output = (Array.isArray(bundled) ? bundled[0] : bundled) as { output: { type: string; code?: string }[] }
const code = output.output.find(o => o.type === 'chunk')?.code
if (!code) throw new Error('No grouping bundle')
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox'] })
const version = browser.version()
const rows = []
try {
  for (const [kind, n] of [['random', 3000], ['random', 30_000], ['random', 300_000], ['dense', 5000], ['identical', 300_000]] as const) {
    for (let trial = 0; trial < trials; trial++) {
      const page = await browser.newPage()
      try {
        await page.route('**/*', route => route.abort())
        await page.setContent('<button>Stop</button>')
        await page.addScriptTag({ content: code })
        const row = await page.evaluate(async ({ kind, n, trial }) => {
          const api = (window as unknown as { __gpdtGrouping: { groupDuplicates: typeof groupDuplicates } }).__gpdtGrouping
          let state = 7
          const rand = (): number => { state ^= state << 13; state ^= state >>> 17; state ^= state << 5; return state >>> 0 }
          const items = Array.from({ length: n }, (_, i) => ({ id: String(i),
            hash: kind === 'identical' ? { lo: 0, hi: 0 } : { lo: rand(), hi: kind === 'dense' ? 0 : rand() } }))
          const start = performance.now()
          let last = start, maxSliceMs = 0, firstYieldMs: number | null = null, yields = 0
          const groups = await api.groupDuplicates(items, { yieldToHost: async () => {
            const t = performance.now()
            firstYieldMs ??= t - start
            maxSliceMs = Math.max(maxSliceMs, t - last)
            yields++
            await new Promise<void>(resolve => setTimeout(resolve, 0))
            last = performance.now()
          } })
          maxSliceMs = Math.max(maxSliceMs, performance.now() - last)
          const elapsedMs = performance.now() - start
          const ctrl = new AbortController()
          const cancelStart = performance.now()
          const timer = setTimeout(() => ctrl.abort(), 0)
          let cancelled = false
          try { await api.groupDuplicates(items, { signal: ctrl.signal }) }
          catch (e) { if (!(e instanceof Error) || e.name !== 'GroupingAborted') throw e; cancelled = true }
          finally { clearTimeout(timer) }
          return { kind, n, trial, elapsedMs, firstYieldMs, maxSliceMs, yields, cancelled,
            cancelMs: performance.now() - cancelStart,
            groups: groups.map(g => ({ count: g.itemIds.length, best: g.bestItemId,
              first: g.itemIds[0], last: g.itemIds.at(-1), similarity: g.averageSimilarity })) }
        }, { kind, n, trial })
        rows.push(row)
        console.error(JSON.stringify(row))
      } finally { await page.close() }
    }
  }
} finally { await browser.close() }
const json = JSON.stringify({ generatedAt: new Date().toISOString(), browser: version, source, trials, rows }, null, 2) + '\n'
if (arg('out')) writeFileSync(arg('out')!, json)
else process.stdout.write(json)
