import { describe, expect, it } from 'vitest'
import { activationToken, isActivationUrl, licenceScope } from '../src/core/activation'
import { storageSaverPreset, STORAGE_ESTIMATE_NOTE } from '../src/core/storage-saver'

describe('local activation boundary', () => {
  it('accepts only owned pricing and recovery paths', () => {
    for (const path of ['pricing', 'recover.html', 'recover/']) {
      expect(isActivationUrl(`https://gpd.sylphx.com/${path}?session_id=x`)).toBe(true)
      expect(isActivationUrl(`https://sylphxai.github.io/Google-Photos-Delete-Tool/${path}`)).toBe(true)
    }
    for (const url of ['http://gpd.sylphx.com/pricing', 'https://gpd.sylphx.com.evil.test/pricing', 'https://sylphxai.github.io/other/pricing', 'https://gpd.sylphx.com/pricing/other', 'garbage']) expect(isActivationUrl(url)).toBe(false)
  })
  it('normalizes untrusted tokens without trusting claims', () => {
    expect(activationToken(' abc.def ')).toBe('abc.def')
    for (const raw of [null, {}, '{', '{"token":"abc.def"}', 'x'.repeat(17000), 'a.b.c', '<script>']) expect(activationToken(raw)).toBeNull()
  })
  it('labels signed scope and leaves legacy licences unrestricted', () => {
    for (const [seats, name] of [[1, 'Personal'], [3, 'Family'], [10, 'Team']] as const) expect(licenceScope({ plan: 'pro', seats })).toContain(name)
    expect(licenceScope({ plan: 'pro' })).toBe('Pro · existing licence')
  })
})

describe('Storage Saver', () => {
  it('uses supported filters, not guessed file sizes or destructive actions', () => {
    expect(storageSaverPreset('videos')?.type).toBe('video')
    expect(storageSaverPreset('screenshots')?.type).toBe('screenshot')
    expect(storageSaverPreset('old-screenshots', new Date(2026, 10, 5))).toEqual({ type: 'screenshot', dateMode: 'before', dateA: '2025-11-05', dateB: '' })
    expect(storageSaverPreset('unknown')).toBeNull()
    expect(STORAGE_ESTIMATE_NOTE).toContain('unavailable')
    expect(STORAGE_ESTIMATE_NOTE).toContain('not freed immediately')
  })
})
