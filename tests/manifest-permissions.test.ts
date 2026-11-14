import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { SUPPORTED_MATCH_PATTERN } from '../src/core/surface'

// Install-time access shipped in 3.6.3. A new permission, host or
// content-script origin changes the permission warning, and Chrome disables
// the extension on update until each user approves it again.
const V3_6_3 = {
  permissions: ['storage'],
  host_permissions: ['https://photos.google.com/*'],
  contentScriptOrigins: ['https://photos.google.com/*'],
}

const manifest = JSON.parse(
  readFileSync(new URL('../src/extension/manifest.json', import.meta.url), 'utf8'),
)

describe('manifest access (hard zero-permission-escalation invariant)', () => {
  it('requests exactly permissions: ["storage"] and host_permissions: ["https://photos.google.com/*"]', () => {
    expect(SUPPORTED_MATCH_PATTERN).toBe('https://photos.google.com/*')
    expect(manifest.permissions).toEqual(['storage'])
    expect(manifest.host_permissions).toEqual(['https://photos.google.com/*'])
    expect(manifest.permissions).toEqual(V3_6_3.permissions)
    expect(manifest.host_permissions).toEqual(V3_6_3.host_permissions)
    expect(manifest.optional_permissions).toBeUndefined()
    expect(manifest.optional_host_permissions).toBeUndefined()
  })

  it('runs content scripts on no origin beyond https://photos.google.com/*', () => {
    expect(manifest.content_scripts).toHaveLength(1)
    expect(manifest.content_scripts[0].matches).toEqual(['https://photos.google.com/*'])
    const origins = manifest.content_scripts.flatMap((c: { matches: string[] }) => c.matches)
    expect(new Set(origins)).toEqual(new Set(V3_6_3.contentScriptOrigins))
    expect(manifest.content_scripts.flatMap((c: { js: string[] }) => c.js)).toEqual(['content.js'])
  })

  it('lets only the owned site origins message the extension, without other extensions or TLS ids', () => {
    expect(manifest.externally_connectable).toEqual({
      matches: ['https://gpd.sylphx.com/*', 'https://sylphxai.github.io/*'],
    })
  })
})
