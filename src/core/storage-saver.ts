import type { PresetControls } from './presets'

/** Safe built-ins use only positively classified type and supported calendar dates. */
export function storageSaverPreset(key: string, today = new Date()): PresetControls | null {
  if (key === 'screenshots' || key === 'videos') {
    return { type: key === 'videos' ? 'video' : 'screenshot', dateMode: 'off', dateA: '', dateB: '' }
  }
  if (key !== 'old-screenshots') return null
  const cutoff = new Date(today.getFullYear() - 1, today.getMonth(), today.getDate())
  const date = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, '0')}-${String(cutoff.getDate()).padStart(2, '0')}`
  return { type: 'screenshot', dateMode: 'before', dateA: date, dateB: '' }
}

export const STORAGE_ESTIMATE_NOTE = 'GB freed: unavailable — Google Photos tiles do not expose original file sizes. Moving items to Trash is recoverable; storage is not freed immediately.'
