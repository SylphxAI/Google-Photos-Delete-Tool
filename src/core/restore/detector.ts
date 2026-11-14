/**
 * Pure TypeScript offline sharpness and resolution analyzer for Google Photos
 * restore candidates.
 *
 * Computes 2D discrete Laplacian variance (kernel [[0,1,0],[1,-4,1],[0,1,0]]),
 * edge density, and resolution adequacy directly on an in-memory RGBA or
 * grayscale pixel buffer. Zero DOM or network calls occur here.
 */

export type RestoreReason = 'blurry' | 'low_res' | 'both' | 'sharp'

export interface RestoreDetectorOptions {
  /** Laplacian variance below this threshold classifies the image as blurry. Default: 100. */
  blurThreshold?: number
  /** Minimum shorter side (min(width, height)) in pixels before flagging low_res. Default: 720. */
  minDimensionThreshold?: number
  /** Optional minimum megapixels ((width * height) / 1_000_000) before flagging low_res. Default: 0.5. */
  minMegapixels?: number
  /** Absolute Laplacian response threshold to count an interior pixel as an edge. Default: 20. */
  edgeMagnitudeThreshold?: number
}

export interface RestoreAnalysis {
  laplacianVariance: number
  edgeDensity: number
  isBlurry: boolean
  isLowRes: boolean
  needsRestore: boolean
  reason: RestoreReason
  qualityScore: number
}

export interface DetectorImageInput extends RestoreDetectorOptions {
  pixels?: ArrayLike<number>
  data?: ArrayLike<number>
  width: number
  height: number
}

export const DEFAULT_BLUR_THRESHOLD = 100
export const DEFAULT_MIN_DIMENSION = 720
export const DEFAULT_MIN_MEGAPIXELS = 0.5
export const DEFAULT_EDGE_MAGNITUDE_THRESHOLD = 20

/**
 * Convert an RGBA (4 channels per pixel) or grayscale (1 channel per pixel)
 * buffer to a single-channel luminance Float32Array (ITU-R BT.601 weights).
 */
export function toGrayscaleBuffer(
  pixels: ArrayLike<number>,
  width: number,
  height: number,
): Float32Array {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error(`Invalid image dimensions: ${width}x${height}`)
  }
  const totalPixels = Math.floor(width) * Math.floor(height)
  if (pixels.length === totalPixels) {
    const gray = new Float32Array(totalPixels)
    for (let i = 0; i < totalPixels; i++) {
      gray[i] = pixels[i]
    }
    return gray
  }
  if (pixels.length === totalPixels * 4) {
    const gray = new Float32Array(totalPixels)
    for (let i = 0; i < totalPixels; i++) {
      const p = i << 2
      gray[i] = 0.299 * pixels[p] + 0.587 * pixels[p + 1] + 0.114 * pixels[p + 2]
    }
    return gray
  }
  throw new Error(
    `Pixel buffer length (${pixels.length}) does not match grayscale (${totalPixels}) or RGBA (${totalPixels * 4}) for ${width}x${height}`,
  )
}

/**
 * Convolve interior pixels with the 2D Laplacian kernel [[0,1,0],[1,-4,1],[0,1,0]]
 * and return the variance of the response along with the fraction of strong edge pixels.
 */
export function computeLaplacianMetrics(
  gray: ArrayLike<number>,
  width: number,
  height: number,
  edgeMagnitudeThreshold: number = DEFAULT_EDGE_MAGNITUDE_THRESHOLD,
): { laplacianVariance: number; edgeDensity: number } {
  const w = Math.floor(width)
  const h = Math.floor(height)
  if (w < 3 || h < 3) {
    return { laplacianVariance: 0, edgeDensity: 0 }
  }

  const interiorCount = (w - 2) * (h - 2)
  let sum = 0
  let sumSq = 0
  let edgePixels = 0

  for (let y = 1; y < h - 1; y++) {
    const row = y * w
    const rowAbove = (y - 1) * w
    const rowBelow = (y + 1) * w
    for (let x = 1; x < w - 1; x++) {
      const center = gray[row + x]
      const lap =
        gray[rowAbove + x] +
        gray[rowBelow + x] +
        gray[row + x - 1] +
        gray[row + x + 1] -
        4 * center
      sum += lap
      sumSq += lap * lap
      if (Math.abs(lap) >= edgeMagnitudeThreshold) {
        edgePixels++
      }
    }
  }

  const mean = sum / interiorCount
  const variance = Math.max(0, sumSq / interiorCount - mean * mean)
  const edgeDensity = edgePixels / interiorCount

  return {
    laplacianVariance: variance,
    edgeDensity,
  }
}

export function analyzeImageQuality(
  pixelsOrInput: ArrayLike<number> | DetectorImageInput,
  width?: number,
  height?: number,
  opts: RestoreDetectorOptions = {},
): RestoreAnalysis {
  let pixels: ArrayLike<number>
  let w: number
  let h: number
  let options: RestoreDetectorOptions = opts

  if (
    typeof pixelsOrInput === 'object' &&
    pixelsOrInput !== null &&
    !('length' in pixelsOrInput)
  ) {
    const input = pixelsOrInput as DetectorImageInput
    const buf = input.pixels ?? input.data
    if (!buf) throw new Error('DetectorImageInput requires pixels or data')
    pixels = buf
    w = input.width
    h = input.height
    options = input
  } else {
    pixels = pixelsOrInput as ArrayLike<number>
    w = width as number
    h = height as number
  }

  const blurThreshold = options.blurThreshold ?? DEFAULT_BLUR_THRESHOLD
  const minDimensionThreshold = options.minDimensionThreshold ?? DEFAULT_MIN_DIMENSION
  const minMegapixels = options.minMegapixels ?? DEFAULT_MIN_MEGAPIXELS
  const edgeMagnitudeThreshold =
    options.edgeMagnitudeThreshold ?? DEFAULT_EDGE_MAGNITUDE_THRESHOLD

  const gray = toGrayscaleBuffer(pixels, w, h)
  const { laplacianVariance, edgeDensity } = computeLaplacianMetrics(
    gray,
    w,
    h,
    edgeMagnitudeThreshold,
  )

  const minSide = Math.min(w, h)
  const megapixels = (w * h) / 1_000_000
  const isBlurry = laplacianVariance < blurThreshold
  const isLowRes = minSide < minDimensionThreshold || megapixels < minMegapixels
  const needsRestore = isBlurry || isLowRes

  let reason: RestoreReason
  if (isBlurry && isLowRes) {
    reason = 'both'
  } else if (isBlurry) {
    reason = 'blurry'
  } else if (isLowRes) {
    reason = 'low_res'
  } else {
    reason = 'sharp'
  }

  // Normalize quality score into [0, 100] combining sharpness, edge density, and resolution.
  const sharpnessNorm = Math.min(1, laplacianVariance / Math.max(1, blurThreshold * 3))
  const edgeNorm = Math.min(1, edgeDensity / 0.25)
  const resNorm = Math.min(1, minSide / Math.max(1, minDimensionThreshold * 1.5))
  const rawScore = (sharpnessNorm * 0.55 + edgeNorm * 0.15 + resNorm * 0.3) * 100
  const qualityScore = Math.round(Math.max(0, Math.min(100, rawScore)) * 100) / 100

  return {
    laplacianVariance,
    edgeDensity,
    isBlurry,
    isLowRes,
    needsRestore,
    reason,
    qualityScore,
  }
}

export const analyzePhotoQuality = analyzeImageQuality
export const detectPhotoQuality = analyzeImageQuality
export const detectBlurryOrLowRes = analyzeImageQuality
