/**
 * Unified Sylphx Money Credit Wallet & AI 4K Restore client for GPDT v3.7.0.
 *
 * Uses standard CORS `fetch` against `https://api.sylphx.com` with the project
 * publishable key and Bearer session token — requiring zero new Chrome
 * permissions or host_permissions.
 *
 * Security & privacy invariants:
 * - Never trusts client `localStorage` for credit balance or trial eligibility;
 *   all balance/trial state is read from `wallet:mine`.
 * - Enforces explicit single-photo transfer consent before any photo bytes
 *   leave the device (`single_photo_transfer_consent_required`).
 * - Calls `POST /v1/money/{parent}/images:restore` with `x-sylphx-key`,
 *   `Authorization: Bearer <token>`, and `Idempotency-Key`. Never sends
 *   `Sylphx-Data-Policy: zdr`; the restore route does not offer that policy.
 * - `wallet:spend` and `wallet:refund` are server-side only; the browser client
 *   only calls `wallet:mine`,
 *   `wallet:claimCheckout`, and `/v1/money/{parent}/images:restore`.
 *   (`/v1/apps/*` is hard-cut on the live API: 410 `surface_removed`.)
 */

export const API_ORIGIN = 'https://api.sylphx.com'
export const MONEY_PARENT =
  'orgs/org_fs01afbdccgn8xdk1ghj5y47w0vtph/projects/prj_fs01etb6sjwf33tcvmhf93jwppx8a0/envs/env_fs01kkyfapshabd01pdps7kf0f72cr'
export const PUBLISHABLE_KEY = 'sylphx_pk_live_fs011xLNiTif0SkaOCFx'
export const AI_RESTORE_ASSET = 'AI_RESTORE_CREDIT'
export const WALLET_TOKEN_KEY = 'gpdt_wallet_token'
export const TRIAL_CREDITS_GRANT = 3

export interface RestoreCatalogueOffer {
  key: 'gpdt_credits_30' | 'gpdt_credits_100' | 'gpdt_credits_300' | 'gpdt_restore_pass_monthly'
  productKey: 'gpdt_credits_30' | 'gpdt_credits_100' | 'gpdt_credits_300' | 'gpdt_restore_pass'
  priceKey: 'gpdt_credits_30' | 'gpdt_credits_100' | 'gpdt_credits_300' | 'gpdt_restore_pass_monthly'
  displayName: string
  credits: number
  usdCents: number
  priceUsd: number
  perPhotoUsd: number
  kind: 'pack' | 'subscription'
  recurringInterval?: 'month'
  unitAmounts: {
    USD: string
    GBP: string
    EUR: string
    HKD: string
  }
}

export const RESTORE_CREDIT_PACKS: readonly RestoreCatalogueOffer[] = [
  {
    key: 'gpdt_credits_30',
    productKey: 'gpdt_credits_30',
    priceKey: 'gpdt_credits_30',
    displayName: 'Google Photos AI 4K Restore — 30 Credits',
    credits: 30,
    usdCents: 500,
    priceUsd: 5,
    perPhotoUsd: 0.167,
    kind: 'pack',
    unitAmounts: { USD: '500', GBP: '399', EUR: '459', HKD: '3900' },
  },
  {
    key: 'gpdt_credits_100',
    productKey: 'gpdt_credits_100',
    priceKey: 'gpdt_credits_100',
    displayName: 'Google Photos AI 4K Restore — 100 Credits',
    credits: 100,
    usdCents: 1200,
    priceUsd: 12,
    perPhotoUsd: 0.12,
    kind: 'pack',
    unitAmounts: { USD: '1200', GBP: '949', EUR: '1099', HKD: '9400' },
  },
  {
    key: 'gpdt_credits_300',
    productKey: 'gpdt_credits_300',
    priceKey: 'gpdt_credits_300',
    displayName: 'Google Photos AI 4K Restore — 300 Credits',
    credits: 300,
    usdCents: 2900,
    priceUsd: 29,
    perPhotoUsd: 0.097,
    kind: 'pack',
    unitAmounts: { USD: '2900', GBP: '2299', EUR: '2699', HKD: '22600' },
  },
] as const

export const RESTORE_PASS_OFFER: RestoreCatalogueOffer = {
  key: 'gpdt_restore_pass_monthly',
  productKey: 'gpdt_restore_pass',
  priceKey: 'gpdt_restore_pass_monthly',
  displayName: 'Google Photos AI 4K Restore Pass',
  credits: 50,
  usdCents: 499,
  priceUsd: 4.99,
  perPhotoUsd: 0.1,
  kind: 'subscription',
  recurringInterval: 'month',
  unitAmounts: { USD: '499', GBP: '399', EUR: '459', HKD: '3900' },
}

export const RESTORE_CATALOGUE_OFFERS: Record<RestoreCatalogueOffer['key'], RestoreCatalogueOffer> = {
  gpdt_credits_30: RESTORE_CREDIT_PACKS[0],
  gpdt_credits_100: RESTORE_CREDIT_PACKS[1],
  gpdt_credits_300: RESTORE_CREDIT_PACKS[2],
  gpdt_restore_pass_monthly: RESTORE_PASS_OFFER,
}

export interface WalletBalance {
  balance: number
  trialGranted: boolean
  subscriptionActive: boolean
  subjectId: string
  asset?: string
}

export interface WalletClientOptions {
  authToken?: string
  token?: string
  apiOrigin?: string
  parent?: string
  publishableKey?: string
  asset?: string
  fetchImpl?: typeof fetch
}

function resolveFetch(fetchImpl?: typeof fetch): typeof fetch {
  const f = fetchImpl ?? (typeof fetch === 'function' ? fetch : undefined)
  if (!f) throw new Error('fetch is not available in this environment')
  return f
}

function buildAuthHeaders(
  authToken: string,
  publishableKey: string = PUBLISHABLE_KEY,
  extra: Record<string, string> = {},
): Record<string, string> {
  const token = authToken.trim()
  if (!token) throw new Error('wallet_auth_token_required')
  return {
    Authorization: `Bearer ${token}`,
    'x-sylphx-key': publishableKey,
    ...extra,
  }
}

/**
 * Fetch the authoritative wallet balance and trial/subscription state from
 * Sylphx Money (`GET /v1/money/{parent}/wallet:mine?asset=AI_RESTORE_CREDIT`).
 * Never reads or trusts client `localStorage`.
 */
export async function fetchWalletBalance(
  authTokenOrOpts: string | WalletClientOptions,
  fetchImpl?: typeof fetch,
): Promise<WalletBalance> {
  const opts: WalletClientOptions =
    typeof authTokenOrOpts === 'string'
      ? { authToken: authTokenOrOpts, fetchImpl }
      : { ...authTokenOrOpts, fetchImpl: fetchImpl ?? authTokenOrOpts.fetchImpl }

  const token = (opts.authToken ?? opts.token ?? '').trim()
  if (!token) throw new Error('wallet_auth_token_required')

  const apiOrigin = (opts.apiOrigin ?? API_ORIGIN).replace(/\/+$/, '')
  const parent = opts.parent ?? MONEY_PARENT
  const publishableKey = opts.publishableKey ?? PUBLISHABLE_KEY
  const asset = opts.asset ?? AI_RESTORE_ASSET
  const f = resolveFetch(opts.fetchImpl)

  const url = `${apiOrigin}/v1/money/${parent}/wallet:mine?asset=${encodeURIComponent(asset)}`
  const res = await f(url, {
    method: 'GET',
    headers: buildAuthHeaders(token, publishableKey),
  })
  if (!res.ok) {
    throw new Error(`wallet_balance_failed_${res.status}`)
  }
  const data = (await res.json()) as Record<string, unknown>
  const rawBalance = Number(data.balance ?? data.credits ?? data.available ?? 0)
  return {
    balance: Number.isFinite(rawBalance) ? Math.max(0, rawBalance) : 0,
    trialGranted: Boolean(data.trialGranted ?? data.trial_granted ?? false),
    subscriptionActive: Boolean(data.subscriptionActive ?? data.subscription_active ?? false),
    subjectId: String(data.subjectId ?? data.subject_id ?? data.user_id ?? ''),
  }
}

export const fetchRestoreWalletState = fetchWalletBalance

export interface ClaimCheckoutResult {
  ok: boolean
  balance: number
  grantedCredits: number
  checkoutSessionId: string
}

/**
 * Claim a completed Stripe/Money checkout session into the authenticated wallet
 * (`POST /v1/money/{parent}/wallet:claimCheckout`).
 */
export async function claimWalletCheckout(
  authTokenOrOpts:
    | string
    | (WalletClientOptions & { checkoutSessionId: string }),
  checkoutSessionIdOrFetch?: string | typeof fetch,
  fetchImpl?: typeof fetch,
): Promise<ClaimCheckoutResult> {
  let token: string
  let checkoutSessionId: string
  let opts: WalletClientOptions = {}

  if (typeof authTokenOrOpts === 'object' && authTokenOrOpts !== null) {
    opts = authTokenOrOpts
    token = (authTokenOrOpts.authToken ?? authTokenOrOpts.token ?? '').trim()
    checkoutSessionId = authTokenOrOpts.checkoutSessionId.trim()
    if (typeof checkoutSessionIdOrFetch === 'function') {
      opts = { ...opts, fetchImpl: checkoutSessionIdOrFetch }
    }
  } else {
    token = authTokenOrOpts.trim()
    checkoutSessionId = String(checkoutSessionIdOrFetch ?? '').trim()
    opts = { authToken: token, fetchImpl }
  }

  if (!token) throw new Error('wallet_auth_token_required')
  if (!checkoutSessionId) throw new Error('checkout_session_id_required')

  const apiOrigin = (opts.apiOrigin ?? API_ORIGIN).replace(/\/+$/, '')
  const parent = opts.parent ?? MONEY_PARENT
  const publishableKey = opts.publishableKey ?? PUBLISHABLE_KEY
  const asset = opts.asset ?? AI_RESTORE_ASSET
  const f = resolveFetch(opts.fetchImpl)

  const url = `${apiOrigin}/v1/money/${parent}/wallet:claimCheckout`
  const res = await f(url, {
    method: 'POST',
    headers: buildAuthHeaders(token, publishableKey, {
      'Content-Type': 'application/json',
    }),
    body: JSON.stringify({
      checkout_session_id: checkoutSessionId,
      asset,
    }),
  })
  if (!res.ok) {
    throw new Error(`wallet_claim_checkout_failed_${res.status}`)
  }
  const data = (await res.json()) as Record<string, unknown>
  const balance = Number(data.balance ?? data.credits ?? 0)
  const grantedCredits = Number(data.grantedCredits ?? data.granted_credits ?? data.granted ?? 0)
  return {
    ok: data.ok !== false,
    balance: Number.isFinite(balance) ? Math.max(0, balance) : 0,
    grantedCredits: Number.isFinite(grantedCredits) ? Math.max(0, grantedCredits) : 0,
    checkoutSessionId,
  }
}

export async function claimRestoreCheckout(
  checkoutSessionIdOrAuthToken: string | (WalletClientOptions & { checkoutSessionId: string }),
  authTokenOrCheckoutSessionId?: string | WalletClientOptions,
  fetchImpl?: typeof fetch,
): Promise<ClaimCheckoutResult> {
  if (typeof checkoutSessionIdOrAuthToken === 'object' && checkoutSessionIdOrAuthToken !== null) {
    return claimWalletCheckout(checkoutSessionIdOrAuthToken, fetchImpl)
  }
  if (typeof authTokenOrCheckoutSessionId === 'object' && authTokenOrCheckoutSessionId !== null) {
    return claimWalletCheckout(
      {
        ...authTokenOrCheckoutSessionId,
        checkoutSessionId: checkoutSessionIdOrAuthToken,
      },
      fetchImpl,
    )
  }
  if (typeof authTokenOrCheckoutSessionId === 'string') {
    if (checkoutSessionIdOrAuthToken.startsWith('cs_')) {
      return claimWalletCheckout(authTokenOrCheckoutSessionId, checkoutSessionIdOrAuthToken, fetchImpl)
    }
    return claimWalletCheckout(checkoutSessionIdOrAuthToken, authTokenOrCheckoutSessionId, fetchImpl)
  }
  throw new Error('wallet_auth_token_required')
}

export type RestoreMode = 'upscale_4k' | 'face_restore' | 'denoise' | 'restore_4k'

export interface ExecuteAiRestoreInput {
  authToken?: string
  token?: string
  imageBase64?: string
  imageBlob?: Blob | Uint8Array | ArrayBuffer
  mimeType?: string
  photoId?: string
  userConfirmedSinglePhotoTransfer: boolean
  mode?: RestoreMode
  scale?: 2 | 4
  idempotencyKey?: string
  apiOrigin?: string
  parent?: string
  publishableKey?: string
}

export type ExecuteAiRestoreResult =
  | {
      ok: true
      restoredImageB64: string
      mimeType: string
      width: number
      height: number
      remainingCredits: number
    }
  | {
      ok: false
      reason: string
      refunded: true
      status?: number
      code?: string
    }

async function blobOrBufferToBase64(
  input: Blob | Uint8Array | ArrayBuffer,
): Promise<{ base64: string; mimeType?: string }> {
  let bytes: Uint8Array
  let mimeType: string | undefined
  if (input instanceof Uint8Array) {
    bytes = input
  } else if (input instanceof ArrayBuffer) {
    bytes = new Uint8Array(input)
  } else {
    mimeType = input.type || undefined
    bytes = new Uint8Array(await input.arrayBuffer())
  }
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return { base64: btoa(binary), mimeType }
}

function defaultIdempotencyKey(photoId: string, mode: string, scale: number): string {
  const rand =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  return `gpdt-restore-${photoId || 'photo'}-${mode}-${scale}x-${rand}`
}

async function runRestoreRequest(
  input: ExecuteAiRestoreInput,
  endpoints: readonly string[],
  fetchImpl?: typeof fetch,
): Promise<ExecuteAiRestoreResult> {
  // HARD PRIVACY PRECONDITION (A4): Never touch fetch without explicit per-photo consent.
  if (input.userConfirmedSinglePhotoTransfer !== true) {
    throw new Error('single_photo_transfer_consent_required')
  }

  const token = (input.authToken ?? input.token ?? '').trim()
  if (!token) {
    return { ok: false, reason: 'wallet_auth_token_required', refunded: true }
  }

  let imageBase64 = input.imageBase64 ?? ''
  let mimeType = input.mimeType ?? 'image/jpeg'
  if (!imageBase64 && input.imageBlob) {
    const converted = await blobOrBufferToBase64(input.imageBlob)
    imageBase64 = converted.base64
    if (!input.mimeType && converted.mimeType) {
      mimeType = converted.mimeType
    }
  }
  if (!imageBase64) {
    return { ok: false, reason: 'image_payload_required', refunded: true }
  }

  const photoId = input.photoId ?? 'photo'
  const mode: RestoreMode = input.mode ?? 'upscale_4k'
  const scale = input.scale ?? 4
  const idempotencyKey = input.idempotencyKey ?? defaultIdempotencyKey(photoId, mode, scale)
  const publishableKey = input.publishableKey ?? PUBLISHABLE_KEY
  const f = resolveFetch(fetchImpl)

  // No Sylphx-Data-Policy: zdr header: the restore route does not offer that
  // policy and refuses requests that ask for it (its upstream never trains).
  const headers = buildAuthHeaders(token, publishableKey, {
    'Content-Type': 'application/json',
    'Idempotency-Key': idempotencyKey,
  })

  const payload = JSON.stringify({
    asset: AI_RESTORE_ASSET,
    idempotency_key: idempotencyKey,
    mode,
    scale,
    image_base64: imageBase64,
    mime_type: mimeType,
    photo_id: photoId,
    image_b64: imageBase64,
  })

  try {
    let res: Response | null = null
    for (let i = 0; i < endpoints.length; i++) {
      res = await f(endpoints[i], {
        method: 'POST',
        headers,
        body: payload,
      })
      if (res.status !== 404 || i === endpoints.length - 1) {
        break
      }
    }

    if (!res) {
      return { ok: false, reason: 'network_error', refunded: true }
    }

    if (!res.ok) {
      let errData: Record<string, unknown> = {}
      try {
        errData = (await res.json()) as Record<string, unknown>
      } catch {
        // non-JSON error body
      }
      const code = typeof errData.code === 'string' ? errData.code : undefined
      const reason =
        typeof errData.reason === 'string'
          ? errData.reason
          : typeof errData.error === 'string'
            ? errData.error
            : res.status === 402 || code === 'INSUFFICIENT_CREDITS'
              ? 'insufficient_credits'
              : `http_${res.status}`
      return {
        ok: false,
        reason,
        refunded: true,
        status: res.status,
        ...(code ? { code } : {}),
      }
    }

    const data = (await res.json()) as Record<string, unknown>
    return {
      ok: true,
      restoredImageB64: String(
        data.restoredImageB64 ??
          data.restored_image_b64 ??
          data.image_base64 ??
          data.image_b64 ??
          '',
      ),
      mimeType: String(data.mimeType ?? data.mime_type ?? mimeType),
      width: Number(data.width ?? 0),
      height: Number(data.height ?? 0),
      remainingCredits: Number(
        data.remainingCredits ?? data.remaining_credits ?? data.balance ?? 0,
      ),
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'network_error'
    return {
      ok: false,
      reason: message || 'network_error',
      refunded: true,
    }
  }
}

/**
 * Execute single-photo AI 4K restoration via `POST /v1/money/{parent}/images:restore`.
 */
export async function executePhotoRestore(
  input: ExecuteAiRestoreInput,
  fetchImpl?: typeof fetch,
): Promise<ExecuteAiRestoreResult> {
  const apiOrigin = (input.apiOrigin ?? API_ORIGIN).replace(/\/+$/, '')
  const parent = input.parent ?? MONEY_PARENT
  // Fail closed: runRestoreRequest refuses unless the caller passes an explicit
  // userConfirmedSinglePhotoTransfer: true for this one photo.
  return runRestoreRequest(input, [`${apiOrigin}/v1/money/${parent}/images:restore`], fetchImpl)
}

export async function executeAiRestore(
  input: ExecuteAiRestoreInput,
  fetchImpl?: typeof fetch,
): Promise<ExecuteAiRestoreResult> {
  const apiOrigin = (input.apiOrigin ?? API_ORIGIN).replace(/\/+$/, '')
  const parent = input.parent ?? MONEY_PARENT
  return runRestoreRequest(
    input,
    [
      `${apiOrigin}/v1/money/${parent}/images:restore`,
      `${apiOrigin}/v1/money/${parent}/ai_restore:execute`,
    ],
    fetchImpl,
  )
}
