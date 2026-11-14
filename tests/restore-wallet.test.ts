import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import {
  AI_RESTORE_ASSET,
  API_ORIGIN,
  MONEY_PARENT,
  PUBLISHABLE_KEY,
  RESTORE_CATALOGUE_OFFERS,
  RESTORE_CREDIT_PACKS,
  RESTORE_PASS_OFFER,
  claimRestoreCheckout,
  claimWalletCheckout,
  executeAiRestore,
  executePhotoRestore,
  fetchRestoreWalletState,
  fetchWalletBalance,
} from '../src/core/restore/wallet'

const catalogue = JSON.parse(
  readFileSync(new URL('../config/money-catalogue.json', import.meta.url), 'utf8'),
)

describe('Sylphx Money catalogue & wallet offer alignment', () => {
  it('matches GPDT live environment constants, trial grant, and catalogue offers', () => {
    expect(API_ORIGIN).toBe('https://api.sylphx.com')
    expect(MONEY_PARENT).toBe(
      'orgs/org_fs01afbdccgn8xdk1ghj5y47w0vtph/projects/prj_fs01etb6sjwf33tcvmhf93jwppx8a0/envs/env_fs01kkyfapshabd01pdps7kf0f72cr',
    )
    expect(PUBLISHABLE_KEY).toBe('sylphx_pk_live_fs011xLNiTif0SkaOCFx')
    expect(AI_RESTORE_ASSET).toBe('AI_RESTORE_CREDIT')
    expect(catalogue.spec.application_data).toEqual({
      wallet_trial_grants: { AI_RESTORE_CREDIT: '3' },
    })

    expect(RESTORE_CREDIT_PACKS.map((p) => [p.key, p.priceUsd, p.credits, p.perPhotoUsd])).toEqual([
      ['gpdt_credits_30', 5, 30, 0.167],
      ['gpdt_credits_100', 12, 100, 0.12],
      ['gpdt_credits_300', 29, 300, 0.097],
    ])
    expect(RESTORE_PASS_OFFER).toMatchObject({
      key: 'gpdt_restore_pass_monthly',
      productKey: 'gpdt_restore_pass',
      priceUsd: 4.99,
      credits: 50,
      recurringInterval: 'month',
    })

    for (const offer of Object.values(RESTORE_CATALOGUE_OFFERS)) {
      const prod = catalogue.spec.products.find(
        (p: { key: string }) => p.key === offer.productKey,
      )
      expect(prod).toBeDefined()
      expect(prod.grants.AI_RESTORE_CREDIT).toBe(String(offer.credits))
      const price = prod.prices.find((pr: { key: string }) => pr.key === offer.priceKey)
      expect(price.unit_amounts).toEqual(offer.unitAmounts)
    }
  })
})

describe('fetchWalletBalance / fetchRestoreWalletState', () => {
  it('fetches authoritative wallet balance from Money and never trusts localStorage', async () => {
    const fakeStorage = {
      getItem: vi.fn(() => '999999'),
    }
    vi.stubGlobal('localStorage', fakeStorage)

    const fakeFetch = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe(
        `${API_ORIGIN}/v1/money/${MONEY_PARENT}/wallet:mine?asset=AI_RESTORE_CREDIT`,
      )
      expect(init?.method).toBe('GET')
      expect(init?.headers).toMatchObject({
        Authorization: 'Bearer sess_live_token_123',
        'x-sylphx-key': PUBLISHABLE_KEY,
      })
      return new Response(
        JSON.stringify({
          balance: 3,
          trial_granted: true,
          subscription_active: false,
          subject_id: 'usr_abc123',
        }),
        { status: 200 },
      )
    })

    const state = await fetchWalletBalance('sess_live_token_123', fakeFetch as unknown as typeof fetch)
    expect(state).toEqual({
      balance: 3,
      trialGranted: true,
      subscriptionActive: false,
      subjectId: 'usr_abc123',
    })
    expect(fakeStorage.getItem).not.toHaveBeenCalled()

    const state2 = await fetchRestoreWalletState(
      { token: 'sess_live_token_123' },
      fakeFetch as unknown as typeof fetch,
    )
    expect(state2.balance).toBe(3)
    vi.unstubAllGlobals()
  })
})

describe('claimWalletCheckout / claimRestoreCheckout', () => {
  it('claims a checkout session into the AI_RESTORE_CREDIT wallet', async () => {
    const fakeFetch = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe(`${API_ORIGIN}/v1/money/${MONEY_PARENT}/wallet:claimCheckout`)
      expect(init?.method).toBe('POST')
      expect(JSON.parse(String(init?.body))).toEqual({
        checkout_session_id: 'cs_live_12345',
        asset: 'AI_RESTORE_CREDIT',
      })
      return new Response(
        JSON.stringify({ ok: true, balance: 103, granted_credits: 100 }),
        { status: 200 },
      )
    })

    const res = await claimWalletCheckout(
      'sess_live_token_123',
      'cs_live_12345',
      fakeFetch as unknown as typeof fetch,
    )
    expect(res).toEqual({
      ok: true,
      balance: 103,
      grantedCredits: 100,
      checkoutSessionId: 'cs_live_12345',
    })

    const res2 = await claimRestoreCheckout(
      'cs_live_12345',
      'sess_live_token_123',
      fakeFetch as unknown as typeof fetch,
    )
    expect(res2.balance).toBe(103)
  })
})

describe('executeAiRestore & executePhotoRestore (hard privacy precondition + no zdr header + atomic refund)', () => {
  it('immediately throws single_photo_transfer_consent_required when userConfirmedSinglePhotoTransfer !== true', async () => {
    const fakeFetch = vi.fn()
    await expect(
      executeAiRestore(
        {
          authToken: 'sess_live_token_123',
          imageBase64: 'AAAA',
          mimeType: 'image/jpeg',
          photoId: 'AF1Qip123',
          userConfirmedSinglePhotoTransfer: false,
        },
        fakeFetch as unknown as typeof fetch,
      ),
    ).rejects.toThrow('single_photo_transfer_consent_required')
    expect(fakeFetch).not.toHaveBeenCalled()
  })

  it('calls POST /v1/money/{parent}/images:restore without Sylphx-Data-Policy: zdr header', async () => {
    const fakeFetch = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe(`${API_ORIGIN}/v1/money/${MONEY_PARENT}/images:restore`)
      const headers = init?.headers as Record<string, string>
      expect(headers.Authorization).toBe('Bearer sess_live_token_123')
      expect(headers['x-sylphx-key']).toBe(PUBLISHABLE_KEY)
      expect(headers['Idempotency-Key']).toMatch(/^gpdt-restore-AF1Qip123/)
      expect(headers['Sylphx-Data-Policy']).toBeUndefined()
      const body = JSON.parse(String(init?.body))
      expect(body).toMatchObject({
        asset: 'AI_RESTORE_CREDIT',
        photo_id: 'AF1Qip123',
        image_base64: 'QUFBQQ==',
        image_b64: 'QUFBQQ==',
        mime_type: 'image/jpeg',
        mode: 'upscale_4k',
        scale: 4,
      })
      return new Response(
        JSON.stringify({
          restored_image_b64: 'BBBB',
          mime_type: 'image/png',
          width: 3840,
          height: 2160,
          remaining_credits: 2,
        }),
        { status: 200 },
      )
    })

    const res = await executeAiRestore(
      {
        authToken: 'sess_live_token_123',
        imageBase64: 'QUFBQQ==',
        mimeType: 'image/jpeg',
        photoId: 'AF1Qip123',
        userConfirmedSinglePhotoTransfer: true,
        mode: 'upscale_4k',
      },
      fakeFetch as unknown as typeof fetch,
    )
    expect(res).toEqual({
      ok: true,
      restoredImageB64: 'BBBB',
      mimeType: 'image/png',
      width: 3840,
      height: 2160,
      remainingCredits: 2,
    })
  })

  it('returns structured { ok: false, reason, refunded: true } on 402, 500, or network error', async () => {
    const fetch402 = vi.fn(
      async () =>
        new Response(JSON.stringify({ code: 'INSUFFICIENT_CREDITS' }), { status: 402 }),
    )
    const r402 = await executePhotoRestore(
      {
        authToken: 'sess_live_token_123',
        imageBlob: new Uint8Array([1, 2, 3]),
        mode: 'upscale_4k',
        scale: 4,
        idempotencyKey: 'idem_1',
      },
      fetch402 as unknown as typeof fetch,
    )
    expect(r402).toEqual({
      ok: false,
      reason: 'insufficient_credits',
      refunded: true,
      status: 402,
      code: 'INSUFFICIENT_CREDITS',
    })

    const fetchTimeout = vi.fn(async () => {
      throw new Error('upstream_timeout')
    })
    const rTimeout = await executeAiRestore(
      {
        authToken: 'sess_live_token_123',
        imageBase64: 'QUFBQQ==',
        mimeType: 'image/jpeg',
        photoId: 'AF1Qip123',
        userConfirmedSinglePhotoTransfer: true,
      },
      fetchTimeout as unknown as typeof fetch,
    )
    expect(rTimeout).toEqual({
      ok: false,
      reason: 'upstream_timeout',
      refunded: true,
    })
  })
})
