// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'
import {
  analyzeImageQuality,
  computeLaplacianMetrics,
  toGrayscaleBuffer,
} from '../src/core/restore/detector'
import {
  analyzeGooglePhotosThumbnail,
  harvestGridTiles,
  isGooglePhotosThumbHost,
  scanForRestoreCandidates,
  type GridTile,
  type RestoreScanDeps,
} from '../src/core/restore/scan'

function makeFlatGray(width: number, height: number, value = 128): Uint8Array {
  const buf = new Uint8Array(width * height)
  buf.fill(value)
  return buf
}

function makeCheckerboardRgba(width: number, height: number): Uint8ClampedArray {
  const buf = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const v = (x + y) % 2 === 0 ? 240 : 15
      const idx = (y * width + x) * 4
      buf[idx] = v
      buf[idx + 1] = v
      buf[idx + 2] = v
      buf[idx + 3] = 255
    }
  }
  return buf
}

describe('restore detector (offline 2D Laplacian variance + edge density + resolution)', () => {
  it('classifies a high-resolution high-frequency image as sharp', () => {
    const rgba = makeCheckerboardRgba(1024, 1024)
    const res = analyzeImageQuality(rgba, 1024, 1024)
    expect(res.laplacianVariance).toBeGreaterThan(1000)
    expect(res.edgeDensity).toBeGreaterThan(0.8)
    expect(res.isBlurry).toBe(false)
    expect(res.isLowRes).toBe(false)
    expect(res.needsRestore).toBe(false)
    expect(res.reason).toBe('sharp')
    expect(res.qualityScore).toBeGreaterThanOrEqual(80)
  })

  it('classifies a high-resolution uniform/smooth image as blurry', () => {
    const gray = makeFlatGray(1200, 900, 120)
    const res = analyzeImageQuality(gray, 1200, 900)
    expect(res.laplacianVariance).toBe(0)
    expect(res.edgeDensity).toBe(0)
    expect(res.isBlurry).toBe(true)
    expect(res.isLowRes).toBe(false)
    expect(res.needsRestore).toBe(true)
    expect(res.reason).toBe('blurry')
  })

  it('classifies a sharp sub-720p image as low_res', () => {
    const rgba = makeCheckerboardRgba(480, 360)
    const res = analyzeImageQuality(rgba, 480, 360)
    expect(res.isBlurry).toBe(false)
    expect(res.isLowRes).toBe(true)
    expect(res.needsRestore).toBe(true)
    expect(res.reason).toBe('low_res')
  })

  it('classifies a blurry and low-resolution image as both', () => {
    const gray = makeFlatGray(320, 240, 100)
    const res = analyzeImageQuality(gray, 320, 240)
    expect(res.isBlurry).toBe(true)
    expect(res.isLowRes).toBe(true)
    expect(res.needsRestore).toBe(true)
    expect(res.reason).toBe('both')
    expect(res.qualityScore).toBeLessThan(20)
  })

  it('supports object input and rejects mismatched buffer lengths', () => {
    const gray = makeFlatGray(16, 16, 80)
    const res = analyzeImageQuality({ data: gray, width: 16, height: 16 })
    expect(res.reason).toBe('both')
    expect(() => toGrayscaleBuffer(new Uint8Array(10), 4, 4)).toThrow(/Pixel buffer length/)
    expect(computeLaplacianMetrics(new Uint8Array(4), 2, 2)).toEqual({
      laplacianVariance: 0,
      edgeDensity: 0,
    })
  })
})

describe('restore offline grid scan (zero external network requests)', () => {
  it('allows only Google Photos thumbnail hosts over HTTPS', () => {
    expect(isGooglePhotosThumbHost('https://lh3.googleusercontent.com/pw/AP1Gcz=w288-h192-no')).toBe(true)
    expect(isGooglePhotosThumbHost('https://photos.fife.usercontent.google.com/pw/AP1=w288-h192-no')).toBe(true)
    expect(isGooglePhotosThumbHost('http://lh3.googleusercontent.com/pw/AP1')).toBe(false)
    expect(isGooglePhotosThumbHost('https://evil.example.com/pw/AP1')).toBe(false)
    expect(isGooglePhotosThumbHost('https://api.sylphx.com/v1/test')).toBe(false)
  })

  it('never calls fetch during thumbnail analysis when host is not Google Photos', async () => {
    const fakeFetch = vi.fn()
    const result = await analyzeGooglePhotosThumbnail('https://evil.example.com/photo.jpg', {
      fetchImpl: fakeFetch as unknown as typeof fetch,
    })
    expect(result).toBeNull()
    expect(fakeFetch).not.toHaveBeenCalled()
  })

  it('harvests Google Photos grid tiles and scans blurry/low-res candidates offline', async () => {
    document.body.innerHTML = `
      <div role="main">
        <a href="./photo/AF1QipBLURRY0001" aria-label="Photo - Mar 1, 2024, 10:00:00 AM">
          <div class="RY3tic" style="background-image: url('https://lh3.googleusercontent.com/pw/BLUR=w400-h300-no')"></div>
        </a>
        <a href="./photo/AF1QipSHARP00002" aria-label="Photo - Mar 2, 2024, 10:00:00 AM">
          <div class="RY3tic" style="background-image: url('https://lh3.googleusercontent.com/pw/SHARP=w1600-h1200-no')"></div>
        </a>
        <a href="./photo/AF1QipFOREIGN003" aria-label="Photo - Foreign">
          <div class="RY3tic" style="background-image: url('https://foreign.example.com/x.jpg')"></div>
        </a>
      </div>
    `
    const harvested = harvestGridTiles(document)
    expect(harvested.map((t) => t.id)).toEqual(['AF1QipBLURRY0001', 'AF1QipSHARP00002'])

    const analyzeCalls: string[] = []
    const deps: RestoreScanDeps = {
      harvest: () => [
        ...harvested,
        // Inject a rogue non-Google tile to verify scanForRestoreCandidates blocks it before analyzeThumb
        {
          id: 'AF1QipROGUE99999',
          label: 'Rogue',
          thumbUrl: 'https://attacker.example.com/rogue.jpg',
        } satisfies GridTile,
      ],
      findScrollTarget: () => null,
      analyzeThumb: async (url) => {
        analyzeCalls.push(url)
        if (url.includes('BLUR')) {
          return {
            width: 400,
            height: 300,
            analysis: analyzeImageQuality(makeFlatGray(400, 300, 100), 400, 300),
          }
        }
        return {
          width: 1600,
          height: 1200,
          analysis: analyzeImageQuality(makeCheckerboardRgba(800, 800), 800, 800),
        }
      },
    }

    const scanRes = await scanForRestoreCandidates(deps, { pollMs: 1 })
    expect(analyzeCalls).toEqual([
      'https://lh3.googleusercontent.com/pw/BLUR=w400-h300-no',
      'https://lh3.googleusercontent.com/pw/SHARP=w1600-h1200-no',
    ])
    expect(scanRes.failed).toBe(1)
    expect(scanRes.candidates).toHaveLength(1)
    expect(scanRes.candidates[0].id).toBe('AF1QipBLURRY0001')
    expect(scanRes.candidates[0].analysis.needsRestore).toBe(true)
    expect(scanRes.candidates[0].analysis.reason).toBe('both')
  })
})