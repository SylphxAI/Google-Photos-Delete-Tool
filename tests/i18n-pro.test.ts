import { describe, it, expect } from 'vitest'
import { LOCALES } from '../src/extension/popup/i18n'

/** Flatten a translations tree to { "a.b.c": "text" }. */
function flatten(node: unknown, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
    if (typeof v === 'string') out[prefix + k] = v
    else Object.assign(out, flatten(v, `${prefix}${k}.`))
  }
  return out
}

const en = flatten(LOCALES.find((l) => l.code === 'en')!.translations)
const others = LOCALES.filter((l) => l.code !== 'en')

/** Keys that carry Pro and paywall copy; they must be translated in every locale. */
const PRO_KEY = /^(settings\.dateFilter\.|settings\.presets\.|settings\.license\.getPro$|pro\.|postRun\.|finder\.)/

/**
 * A value may equal the English one only when it is a brand term ("Pro"), a
 * separator, or a real word spelled the same in that language. Add a case here
 * deliberately, never to silence an untranslated string.
 */
const SAME_AS_ENGLISH: Record<string, string[]> = {
  '*': ['finder.proTag'], // the brand term "Pro"
  // Separators and nouns spelled the same in that language ("{n} collage", "{n} video").
  de: ['pro.teaser.sep'],
  es: ['pro.teaser.sep', 'pro.types.collageOne', 'pro.types.collageMany'],
  fr: ['pro.teaser.sep', 'pro.types.photoOne', 'pro.types.photoMany', 'pro.types.animationOne', 'pro.types.animationMany', 'pro.types.collageOne', 'pro.types.collageMany'],
  it: ['pro.teaser.sep', 'pro.types.videoOne', 'pro.types.screenshotOne', 'pro.types.collageOne'],
  nl: ['pro.teaser.sep', 'pro.types.videoOne', 'pro.types.screenshotOne', 'pro.types.screenshotMany', 'pro.types.collageOne', 'pro.types.collageMany'],
  pt: ['pro.teaser.sep'],
}

describe('Pro and paywall copy is translated', () => {
  const proKeys = Object.keys(en).filter((k) => PRO_KEY.test(k))

  it('covers a meaningful set of keys', () => {
    expect(proKeys.length).toBeGreaterThanOrEqual(60)
  })

  for (const locale of others) {
    it(`${locale.code}: no Pro key still holds the English text`, () => {
      const f = flatten(locale.translations)
      const allowed = new Set([...(SAME_AS_ENGLISH['*'] ?? []), ...(SAME_AS_ENGLISH[locale.code] ?? [])])
      expect(proKeys.filter((k) => f[k] === en[k] && !allowed.has(k))).toEqual([])
    })

    it(`${locale.code}: placeholders, tags and the price survive translation`, () => {
      const f = flatten(locale.translations)
      const pick = (s: string, re: RegExp): string[] => (s.match(re) ?? []).sort()
      for (const k of proKeys) {
        expect(pick(f[k], /\{\w+\}/g), `${locale.code}:${k}`).toEqual(pick(en[k], /\{\w+\}/g))
        expect(pick(f[k], /<\/?\w+[^>]*>/g), `${locale.code}:${k}`).toEqual(pick(en[k], /<\/?\w+[^>]*>/g))
        if (en[k].includes('from US$19')) expect(f[k], `${locale.code}:${k}`).toMatch(/19/)
      }
    })
  }

  it('the exceptions list names only keys that really equal English', () => {
    for (const [code, keys] of Object.entries(SAME_AS_ENGLISH)) {
      const locales = code === '*' ? others : others.filter((l) => l.code === code)
      for (const l of locales) {
        const f = flatten(l.translations)
        for (const k of keys) expect(f[k], `${l.code}:${k}`).toBe(en[k])
      }
    }
  })
})

describe('no other string is left in English by accident', () => {
  // Same-spelling words that are correct in the language; everything else must differ.
  const COGNATES: Record<string, string[]> = {
    de: ['settings.filter.label', 'settings.filter.screenshot', 'settings.filter.video', 'actions.pause', 'scope.album'],
    es: ['status.error', 'settings.filter.collage'],
    fr: ['actions.pause', 'scope.album', 'scope.albums', 'scope.photo', 'scope.collections', 'settings.filter.collage', 'settings.filter.photo', 'settings.filter.animation'],
    it: ['scope.album'],
    nl: ['settings.filter.label', 'scope.album', 'scope.albums', 'settings.filter.collage'],
  }
  for (const locale of others) {
    it(`${locale.code}: every string differs from English or is a listed cognate`, () => {
      const f = flatten(locale.translations)
      const allowed = new Set([...(COGNATES[locale.code] ?? []), ...(SAME_AS_ENGLISH['*'] ?? []), ...(SAME_AS_ENGLISH[locale.code] ?? [])])
      expect(Object.keys(en).filter((k) => f[k] === en[k] && !allowed.has(k))).toEqual([])
    })
  }
})
