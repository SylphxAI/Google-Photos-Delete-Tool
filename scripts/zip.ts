/**
 * Cross-platform zip script — replaces the Unix `zip` command in package.json.
 * Bundles dist/extension/* → google-photos-delete-tool.zip and
 * dist/extension-edge/* → google-photos-delete-tool-edge.zip and
 * dist/extension-firefox/* → google-photos-delete-tool-firefox.zip at the
 * repo root.
 *
 * Works on Linux, macOS and Windows (no external `zip` binary required).
 */
import archiver from 'archiver'
import { fileURLToPath } from 'node:url'
import { createWriteStream, existsSync } from 'fs'
import { resolve } from 'path'
import { distDirectory, zipSuffix } from './lib/license-build'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))

const targets: Array<{ dir: string; zip: string }> = [
  { dir: 'dist/extension', zip: 'google-photos-delete-tool.zip' },
  { dir: 'dist/extension-edge', zip: 'google-photos-delete-tool-edge.zip' },
  { dir: 'dist/extension-firefox', zip: 'google-photos-delete-tool-firefox.zip' },
]

for (const { dir, zip } of targets) {
  const dirPath = resolve(root, dir.replace(/^dist\//, `${distDirectory}/`))
  if (!existsSync(dirPath)) {
    console.error(`[zip] ${dir} not found — run "bun run build" first`)
    process.exit(1)
  }
  const zipPath = resolve(root, zip.replace(/\.zip$/, `${zipSuffix}.zip`))
  const output = createWriteStream(zipPath)
  const archive = archiver('zip', { zlib: { level: 9 } })

  await new Promise<void>((resolvePromise, reject) => {
    output.on('close', () => {
      const kb = (archive.pointer() / 1024).toFixed(1)
      console.log(`[zip] wrote ${zipPath} (${kb} KB)`)
      resolvePromise()
    })
    archive.on('warning', (err) => {
      if (err.code === 'ENOENT') {
        console.warn('[zip] warning:', err)
      } else {
        reject(err)
      }
    })
    archive.on('error', reject)
    archive.pipe(output)
    // Identical built bytes produce the exact same downloadable artifact.
    archive.directory(dirPath, false, { date: new Date('1980-01-01T00:00:00Z') })
    void archive.finalize()
  })
}
