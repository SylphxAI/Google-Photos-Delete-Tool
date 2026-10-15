import { describe, expect, it, vi } from 'vitest'
import { generateKeyPairSync, createVerify } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
// @ts-expect-error plain .mjs script, no type declarations
import { selectAuthMode, signServiceAccountJwt, mintAccessToken, mintOAuthAccessToken, publishV2, readStatus, formatStatus, invalidModeMessage, API_BASE, SCOPE } from '../scripts/cws-v2.mjs'

const wf = (n: string) => readFileSync(fileURLToPath(new URL(`../.github/workflows/${n}`, import.meta.url)), 'utf8')
const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
})
const key = { client_email: 'cws-publisher@p.iam.gserviceaccount.com', private_key: privateKey, token_uri: 'https://oauth2.googleapis.com/token' }
const OAUTH_SECRETS = { CHROME_EXTENSION_ID: 'e', CHROME_CLIENT_ID: 'c', CHROME_CLIENT_SECRET: 's', CHROME_REFRESH_TOKEN: 'r' }
const OAUTH = { ...OAUTH_SECRETS, CWS_PUBLISHER_ID: 'p' }

describe('selectAuthMode', () => {
  it('prefers the service account when its secret is set', () => {
    expect(selectAuthMode({ ...OAUTH, CWS_SERVICE_ACCOUNT_JSON: '{}', CWS_PUBLISHER_ID: 'p' }).mode).toBe('sa')
  })
  it('fails closed on a partial service-account config instead of silently using OAuth', () => {
    expect(selectAuthMode({ ...OAUTH_SECRETS, CWS_SERVICE_ACCOUNT_JSON: '{}' })).toEqual({ mode: 'invalid', via: 'CWS_SERVICE_ACCOUNT_JSON', missing: ['CWS_PUBLISHER_ID'] })
  })
  it('refuses the OAuth secrets without a publisher id instead of sending them to the v1.1 API', () => {
    const sel = selectAuthMode(OAUTH_SECRETS)
    expect(sel).toEqual({ mode: 'invalid', via: 'the CHROME_* OAuth secrets', missing: ['CWS_PUBLISHER_ID'] })
    expect(selectAuthMode({ ...OAUTH_SECRETS, CWS_PUBLISHER_ID: '  ' }).mode).toBe('invalid')
    const msg = invalidModeMessage(sel)
    expect(msg).toContain('CWS_PUBLISHER_ID is missing')
    expect(msg).toContain('2026-10-15')
    expect(msg).toContain('repo variable')
  })
  it('keeps the OAuth fallback when no service account is set', () => {
    expect(selectAuthMode(OAUTH).mode).toBe('oauth')
    expect(selectAuthMode({ ...OAUTH, CWS_SERVICE_ACCOUNT_JSON: '  ' }).mode).toBe('oauth')
  })
  it('is none without credentials', () => {
    expect(selectAuthMode({}).mode).toBe('none')
    expect(selectAuthMode({ CHROME_EXTENSION_ID: 'e' }).mode).toBe('none')
    expect(selectAuthMode({ CWS_PUBLISHER_ID: 'p' }).mode).toBe('none')
  })
})

describe('service-account token', () => {
  it('signs a verifiable RS256 JWT with the CWS scope', () => {
    const jwt = signServiceAccountJwt(key, 1000)
    const [h, c, s] = jwt.split('.')
    expect(JSON.parse(Buffer.from(h, 'base64url').toString())).toEqual({ alg: 'RS256', typ: 'JWT' })
    expect(JSON.parse(Buffer.from(c, 'base64url').toString())).toMatchObject({ iss: key.client_email, scope: SCOPE, aud: key.token_uri, iat: 1000, exp: 4600 })
    expect(createVerify('RSA-SHA256').update(`${h}.${c}`).verify(publicKey, s, 'base64url')).toBe(true)
  })
  it('exchanges the assertion for an access token', async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ access_token: 'tok' })))
    expect(await mintAccessToken(JSON.stringify(key), f)).toBe('tok')
    const [url, init] = f.mock.calls[0] as unknown as [string, { body: string }]
    expect(url).toBe(key.token_uri)
    expect(init.body).toContain('grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer')
  })
  it('fails on auth errors without leaking the key', async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 400 }))
    const err = await mintAccessToken(JSON.stringify(key), f).catch((e: Error) => e)
    expect((err as Error).message).toContain('HTTP 400 invalid_grant')
    expect((err as Error).message).not.toContain('PRIVATE KEY')
    await expect(mintAccessToken('not json', f)).rejects.toThrow('not valid JSON')
    await expect(mintAccessToken('{}', f)).rejects.toThrow('missing')
  })
})

type Step = { match: string; status?: number; body?: unknown }
function fakeApi(steps: Step[]) {
  const calls: string[] = []
  const fetchImpl = async (url: string, init: { method: string }) => {
    const label = `${init.method} ${url.replace(API_BASE, '')}`
    calls.push(label)
    const i = steps.findIndex((s) => label.endsWith(s.match))
    if (i < 0) throw new Error(`unexpected call ${label}`)
    const [s] = steps.splice(i, 1)
    return new Response(JSON.stringify(s.body ?? {}), { status: s.status ?? 200 })
  }
  return { calls, fetchImpl }
}
const base = { token: 't', publisherId: 'P', itemId: 'E', zip: Buffer.from('z'), sleep: async () => {} }
const N = 'publishers/P/items/E'
const pending = { submittedItemRevisionStatus: { state: 'PENDING_REVIEW' } }
const accepted = { submittedItemRevisionStatus: { state: 'PENDING_REVIEW' } }

describe('publishV2', () => {
  it('uploads, publishes and reads back', async () => {
    const api = fakeApi([
      { match: `${N}:fetchStatus`, body: {} },
      { match: `/upload/v2/${N}:upload`, body: { uploadState: 'SUCCEEDED', crxVersion: '1.2.3' } },
      { match: `/v2/${N}:publish`, body: { state: 'PENDING_REVIEW' } },
      { match: `${N}:fetchStatus`, body: accepted },
    ])
    const r = await publishV2({ ...base, fetchImpl: api.fetchImpl })
    expect(r).toMatchObject({ outcome: 'published', itemState: 'PENDING_REVIEW', crxVersion: '1.2.3', cancelled: false })
  })
  it('stays blocked on a pending review without cancel_pending, never uploading', async () => {
    const api = fakeApi([{ match: `${N}:fetchStatus`, body: pending }])
    const r = await publishV2({ ...base, fetchImpl: api.fetchImpl })
    expect(r.outcome).toBe('blocked')
    expect(api.calls).toHaveLength(1)
  })
  it('cancels the pending submission first when cancel_pending is set', async () => {
    const api = fakeApi([
      { match: `${N}:fetchStatus`, body: pending },
      { match: `/v2/${N}:cancelSubmission` },
      { match: `/upload/v2/${N}:upload`, body: { uploadState: 'SUCCEEDED', crxVersion: '2.0.0' } },
      { match: `/v2/${N}:publish`, body: {} },
      { match: `${N}:fetchStatus`, body: accepted },
    ])
    const r = await publishV2({ ...base, cancelPending: true, fetchImpl: api.fetchImpl })
    expect(r).toMatchObject({ outcome: 'published', cancelled: true })
    expect(api.calls.map((c) => c.split(':').pop())).toEqual(['fetchStatus', 'cancelSubmission', 'upload', 'publish', 'fetchStatus'])
  })
  it('polls an in-progress upload via fetchStatus', async () => {
    const api = fakeApi([
      { match: `${N}:fetchStatus`, body: {} },
      { match: `/upload/v2/${N}:upload`, body: { uploadState: 'IN_PROGRESS' } },
      { match: `${N}:fetchStatus`, body: { lastAsyncUploadState: 'SUCCEEDED' } },
      { match: `/v2/${N}:publish`, body: {} },
      { match: `${N}:fetchStatus`, body: { publishedItemRevisionStatus: { distributionChannels: [{ crxVersion: '' }] }, submittedItemRevisionStatus: { state: 'STAGED' } } },
    ])
    expect((await publishV2({ ...base, fetchImpl: api.fetchImpl })).outcome).toBe('published')
  })
  it('fails closed on upload, publish and readback errors', async () => {
    const up = fakeApi([{ match: `${N}:fetchStatus` }, { match: `:upload`, status: 403, body: { error: 'x' } }])
    await expect(publishV2({ ...base, fetchImpl: up.fetchImpl })).rejects.toThrow('upload failed (HTTP 403)')
    const rb = fakeApi([
      { match: `${N}:fetchStatus` },
      { match: `:upload`, body: { uploadState: 'SUCCEEDED' } },
      { match: `:publish` },
      { match: `${N}:fetchStatus`, body: { submittedItemRevisionStatus: { state: 'REJECTED' } } },
    ])
    await expect(publishV2({ ...base, fetchImpl: rb.fetchImpl })).rejects.toThrow('readback')
  })
})

describe('publish retry on transient reachability errors', () => {
  const notReachable = { error: { message: 'Publish condition not met: Support URL is not reachable.; Privacy policy link is not reachable. Timeout while connecting.' } }
  const head = [
    { match: `${N}:fetchStatus` },
    { match: `:upload`, body: { uploadState: 'SUCCEEDED', crxVersion: '1.2.3' } },
  ]
  it('retries once after 10 min and succeeds', async () => {
    const api = fakeApi([...head, { match: `:publish`, status: 400, body: notReachable }, { match: `:publish`, body: {} }, { match: `${N}:fetchStatus`, body: accepted }])
    const sleep = vi.fn(async () => {})
    const log = vi.fn()
    const r = await publishV2({ ...base, sleep, log, fetchImpl: api.fetchImpl })
    expect(r.outcome).toBe('published')
    expect(sleep).toHaveBeenCalledWith(600000)
    expect(api.calls.filter((c) => c.endsWith(':publish'))).toHaveLength(2)
    expect(api.calls.filter((c) => c.includes(':upload'))).toHaveLength(1)
    expect(log).toHaveBeenCalledWith(expect.stringContaining('::notice::'))
  })
  it('fails after a second reachability error, naming the retry', async () => {
    const api = fakeApi([...head, { match: `:publish`, status: 400, body: notReachable }, { match: `:publish`, status: 400, body: notReachable }])
    await expect(publishV2({ ...base, fetchImpl: api.fetchImpl })).rejects.toThrow('publish failed (HTTP 400); retried once after 10 min')
  })
  it('does not retry any other publish error', async () => {
    const api = fakeApi([...head, { match: `:publish`, status: 403, body: { error: 'forbidden' } }])
    const sleep = vi.fn(async () => {})
    const err = await publishV2({ ...base, sleep, fetchImpl: api.fetchImpl }).catch((e: Error) => e)
    expect((err as Error).message).toBe('publish failed (HTTP 403)')
    expect(sleep).not.toHaveBeenCalled()
  })
})

describe('workflow wiring', () => {
  const engine = wf('store-publish.yml')
  const cws = engine.slice(engine.indexOf('\n  cws:'), engine.indexOf('\n  edge:'))
  it('selects the path in the credential guard and publishes only through the v2 script', () => {
    expect(cws).toContain('node scripts/cws-v2.mjs mode')
    expect(cws).toContain("id: v2")
    expect(cws).toContain("if: steps.creds.outputs.ready == 'yes' && steps.state.outputs.status == 'pending'")
    expect(cws).toContain('node scripts/cws-v2.mjs "${ARGS[@]}"')
    expect(cws).toContain('--cancel-pending')
    expect(cws).toContain("if: steps.v2.outputs.published == 'yes'")
  })
  it('no longer calls the v1.1 upload CLI anywhere', () => {
    expect(engine).not.toContain('chrome-webstore-upload')
    expect(cws).not.toContain('bun x')
    expect(cws).not.toContain("auth == 'oauth'")
    expect(cws).not.toContain('steps.publish.outputs')
    expect(cws).not.toContain('steps.upload.outputs')
  })
  it('passes the OAuth secrets and the publisher id (repo variable or secret) to the guard and the publish step', () => {
    for (const name of ['Credential guard', 'Publish via Chrome Web Store API v2']) {
      const step = cws.slice(cws.indexOf(`- name: ${name}`), cws.indexOf('run: ', cws.indexOf(`- name: ${name}`)))
      for (const k of ['CHROME_CLIENT_ID', 'CHROME_CLIENT_SECRET', 'CHROME_REFRESH_TOKEN', 'CHROME_EXTENSION_ID']) expect(step).toContain(`${k}: \${{ secrets.${k} }}`)
      expect(step).toContain('CWS_PUBLISHER_ID: ${{ secrets.CWS_PUBLISHER_ID || vars.CWS_PUBLISHER_ID }}')
    }
  })
  it('keeps the store-state branch logic: skip when recorded, record only after a v2 readback', () => {
    expect(cws).toContain('node scripts/store-state.mjs pending cws')
    expect(cws).toContain("steps.state.outputs.status != 'pending'")
    expect(cws).toContain('node scripts/store-state.mjs set cws')
    expect(cws.indexOf("steps.v2.outputs.published == 'yes'")).toBeGreaterThan(cws.indexOf('id: v2'))
  })
  it('exposes cancel_pending only through the manual CWS dispatch, default off', () => {
    expect(engine).toMatch(/cancel_pending:[\s\S]*?type: boolean\n\s+default: false/)
    expect(wf('publish-cws.yml')).toMatch(/cancel_pending:[\s\S]*?type: boolean\n\s+default: false/)
    expect(wf('publish-cws.yml')).toContain('cancel_pending: ${{ inputs.cancel_pending }}')
    expect(wf('store-retry.yml')).not.toContain('cancel_pending')
    expect(wf('publish-stores.yml')).not.toContain('cancel_pending')
  })
})

describe('default publish on the OAuth path (v2 API)', () => {
  type Seen = { label: string; headers: Record<string, string>; body?: unknown }
  it('mints a token from the refresh token and sends the v2 requests with it', async () => {
    const seen: Seen[] = []
    const fetchImpl = async (url: string, init: { method: string; body?: unknown; headers?: Record<string, string> }) => {
      if (url === 'https://oauth2.googleapis.com/token') {
        seen.push({ label: `${init.method} token`, headers: init.headers ?? {}, body: init.body })
        return new Response(JSON.stringify({ access_token: 'AT' }))
      }
      const label = `${init.method} ${url.replace(API_BASE, '')}`
      seen.push({ label, headers: init.headers ?? {}, body: init.body })
      if (label.endsWith(':upload')) return new Response(JSON.stringify({ uploadState: 'SUCCEEDED', crxVersion: '3.6.0' }))
      if (label.endsWith(':fetchStatus') && seen.filter((x) => x.label.endsWith(':fetchStatus')).length > 1) {
        return new Response(JSON.stringify({ submittedItemRevisionStatus: { state: 'PENDING_REVIEW' } }))
      }
      return new Response('{}')
    }
    const token = await mintOAuthAccessToken({ clientId: 'cid', clientSecret: 'sec', refreshToken: 'ref' }, fetchImpl as never)
    const r = await publishV2({ ...base, token, fetchImpl: fetchImpl as never })
    expect(r).toMatchObject({ outcome: 'published', itemState: 'PENDING_REVIEW', crxVersion: '3.6.0', staged: false })
    expect(seen.map((x) => x.label)).toEqual([
      'POST token',
      `GET /v2/${N}:fetchStatus`,
      `POST /upload/v2/${N}:upload`,
      `POST /v2/${N}:publish`,
      `GET /v2/${N}:fetchStatus`,
    ])
    expect(new URLSearchParams(seen[0].body as string).get('grant_type')).toBe('refresh_token')
    for (const x of seen.slice(1)) expect(x.headers.Authorization).toBe('Bearer AT')
    expect(seen[2].headers['Content-Type']).toBe('application/zip')
    expect(seen[3].body).toBeUndefined()
  })
})

describe('cws-v2.mjs command line', () => {
  const script = fileURLToPath(new URL('../scripts/cws-v2.mjs', import.meta.url))
  const run = (args: string[], env: Record<string, string>) =>
    spawnSync(process.execPath, [script, ...args], { env: { PATH: process.env.PATH ?? '', ...env }, encoding: 'utf8' })
  it('prints oauth when the publisher id is present', () => {
    const r = run(['mode'], OAUTH)
    expect(r.status).toBe(0)
    expect(r.stdout.trim()).toBe('oauth')
  })
  it('fails with a clear message when only the OAuth secrets are set, echoing no secret', () => {
    const r = run(['mode'], OAUTH_SECRETS)
    expect(r.status).toBe(1)
    expect(r.stderr).toContain('::error::')
    expect(r.stderr).toContain('CWS_PUBLISHER_ID is missing')
    expect(r.stderr).not.toContain('"c"')
    expect(r.stdout.trim()).toBe('')
  })
  it('prints none without credentials, so the job skips as before', () => {
    const r = run(['mode'], {})
    expect(r.status).toBe(0)
    expect(r.stdout.trim()).toBe('none')
  })
  it('publish refuses a missing publisher id before any request', () => {
    const r = run(['publish', '--zip', script], OAUTH_SECRETS)
    expect(r.status).toBe(1)
    expect(r.stderr).toContain('CWS_PUBLISHER_ID is missing')
  })
})

describe('staged publish (publishType STAGED_PUBLISH)', () => {
  type Seen = { label: string; body?: string; contentType?: string }
  function recordingApi(steps: Step[]) {
    const seen: Seen[] = []
    const fetchImpl = async (url: string, init: { method: string; body?: unknown; headers?: Record<string, string> }) => {
      const label = `${init.method} ${url.replace(API_BASE, '')}`
      seen.push({ label, body: typeof init.body === 'string' ? init.body : undefined, contentType: init.headers?.['Content-Type'] })
      const i = steps.findIndex((st) => label.endsWith(st.match))
      if (i < 0) throw new Error(`unexpected call ${label}`)
      const [st] = steps.splice(i, 1)
      return new Response(JSON.stringify(st.body ?? {}), { status: st.status ?? 200 })
    }
    return { seen, fetchImpl }
  }
  const flow = (readback: unknown) => [
    { match: `${N}:fetchStatus`, body: {} },
    { match: `/upload/v2/${N}:upload`, body: { uploadState: 'SUCCEEDED', crxVersion: '3.6.1' } },
    { match: `/v2/${N}:publish`, body: {} },
    { match: `${N}:fetchStatus`, body: readback },
  ]

  it('sends publishType STAGED_PUBLISH as JSON and accepts a PENDING_REVIEW readback', async () => {
    const api = recordingApi(flow({ submittedItemRevisionStatus: { state: 'PENDING_REVIEW' } }))
    const r = await publishV2({ ...base, publishType: 'STAGED_PUBLISH', fetchImpl: api.fetchImpl })
    expect(r).toMatchObject({ outcome: 'published', itemState: 'PENDING_REVIEW', crxVersion: '3.6.1', staged: true })
    const pub = api.seen.find((x) => x.label.endsWith(':publish'))!
    expect(JSON.parse(pub.body!)).toEqual({ publishType: 'STAGED_PUBLISH' })
    expect(pub.contentType).toBe('application/json')
  })
  it('accepts a STAGED readback', async () => {
    const api = recordingApi(flow({ submittedItemRevisionStatus: { state: 'STAGED' } }))
    expect((await publishV2({ ...base, publishType: 'STAGED_PUBLISH', fetchImpl: api.fetchImpl })).itemState).toBe('STAGED')
  })
  it('fails when the staged version reads back as live or in any other state', async () => {
    const live = recordingApi(flow({ publishedItemRevisionStatus: { state: 'PUBLISHED', distributionChannels: [{ crxVersion: '3.6.1' }] } }))
    await expect(publishV2({ ...base, publishType: 'STAGED_PUBLISH', fetchImpl: live.fetchImpl })).rejects.toThrow('reads back as published')
    const other = recordingApi(flow({ submittedItemRevisionStatus: { state: 'PUBLISHED' } }))
    await expect(publishV2({ ...base, publishType: 'STAGED_PUBLISH', fetchImpl: other.fetchImpl })).rejects.toThrow('staged submission')
  })
  it('keeps the default publish request without a body', async () => {
    const api = recordingApi(flow({ submittedItemRevisionStatus: { state: 'PENDING_REVIEW' } }))
    const r = await publishV2({ ...base, fetchImpl: api.fetchImpl })
    expect(r.staged).toBe(false)
    const pub = api.seen.find((x) => x.label.endsWith(':publish'))!
    expect(pub.body).toBeUndefined()
    expect(pub.contentType).toBeUndefined()
  })
  it('refuses an unknown publishType before any call', async () => {
    const api = recordingApi([])
    await expect(publishV2({ ...base, publishType: 'IMMEDIATE', fetchImpl: api.fetchImpl })).rejects.toThrow('unknown publishType')
    expect(api.seen).toHaveLength(0)
  })
})

describe('OAuth access token for the v2 calls', () => {
  it('exchanges the refresh token', async () => {
    let sent = ''
    const f = vi.fn(async (_u: string, init: { body: string }) => { sent = init.body; return new Response(JSON.stringify({ access_token: 'at' })) })
    expect(await mintOAuthAccessToken({ clientId: 'c', clientSecret: 's', refreshToken: 'r' }, f)).toBe('at')
    expect(Object.fromEntries(new URLSearchParams(sent))).toEqual({ grant_type: 'refresh_token', client_id: 'c', client_secret: 's', refresh_token: 'r' })
  })
  it('fails without echoing the secrets', async () => {
    const f = async () => new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 400 })
    const err = await mintOAuthAccessToken({ clientId: 'cid-x', clientSecret: 'sec-x', refreshToken: 'ref-x' }, f).catch((e: Error) => e.message)
    expect(err).toBe('OAuth token refresh failed (HTTP 400 invalid_grant)')
    await expect(mintOAuthAccessToken({ clientId: 'c', clientSecret: '', refreshToken: 'r' }, f)).rejects.toThrow('missing')
  })
})

describe('staged workflow wiring', () => {
  const engine = wf('store-publish.yml')
  const staged = engine.slice(engine.indexOf('\n  cws-staged:'))
  it('forwards the staged inputs from the manual CWS dispatch to the shared engine', () => {
    const caller = wf('publish-cws.yml')
    for (const k of ['staged_ref', 'content_digest', 'publisher_id']) expect(caller).toContain(`${k}: \${{ inputs.${k} }}`)
    expect(wf('store-retry.yml')).not.toContain('staged_ref')
    expect(wf('publish-stores.yml')).not.toContain('staged_ref')
  })
  it('skips every tag job when staged_ref is set and runs the staged job only then', () => {
    expect(engine).toContain("name: Resolve target tag & pending stores\n    if: inputs.staged_ref == ''")
    expect(staged).toContain("if: inputs.staged_ref != ''")
  })
  it('pins the package by content digest before any upload and submits only with --staged', () => {
    expect(staged).toContain('tool/scripts/zip-content-digest.sh')
    expect(staged.indexOf('content digest $GOT differs')).toBeGreaterThan(0)
    expect(staged.indexOf('content digest $GOT differs')).toBeLessThan(staged.indexOf('cws-v2.mjs publish'))
    expect(staged).toContain('cws-v2.mjs publish --zip build/google-photos-delete-tool.zip --staged')
    expect(staged).not.toContain('cancel-pending')
    expect(staged).not.toContain('store-state')
    expect(staged).toContain('permissions:\n      contents: read')
  })
})

describe('read-only status', () => {
  const json = (body: unknown, status = 200) => ({ ok: status < 400, status, text: async () => JSON.stringify(body) })
  const fake = (routes: Record<string, unknown>) => {
    const calls: { method: string; url: string }[] = []
    const fetchImpl = async (url: string, init: { method: string }) => {
      calls.push({ method: init.method, url })
      const hit = Object.entries(routes).find(([k]) => url.includes(k))
      return hit ? (hit[1] as ReturnType<typeof json>) : json({}, 404)
    }
    return { fetchImpl, calls }
  }
  const draft = { kind: 'chromewebstore#item', id: 'e', publicKey: 'SECRET-LOOKING-KEY', uploadState: 'FAILURE', crxVersion: '3.0.2', itemError: [{ error_code: 'PKG_UNKNOWN_ERROR', error_detail: 'bad zip' }] }
  const v2 = {
    name: 'publishers/p/items/e', itemId: 'e', publicKey: 'ANOTHER-KEY', lastAsyncUploadState: 'SUCCEEDED',
    submittedItemRevisionStatus: { state: 'PENDING_REVIEW', distributionChannels: [{ crxVersion: '3.0.2' }] },
    publishedItemRevisionStatus: { state: 'PUBLISHED', distributionChannels: [{ crxVersion: '3.0.1', deployPercentage: 100 }] },
  }
  it('reads items.get with projection DRAFT and v2 fetchStatus, GET only', async () => {
    const { fetchImpl, calls } = fake({ 'v1.1/items/e?projection=DRAFT': json(draft), ':fetchStatus': json(v2) })
    const r = await readStatus({ token: 't', publisherId: 'p', itemId: 'e', fetchImpl })
    expect(calls.every((c) => c.method === 'GET')).toBe(true)
    expect(calls.map((c) => c.url)).toEqual([
      'https://www.googleapis.com/chromewebstore/v1.1/items/e?projection=DRAFT',
      `${API_BASE}/v2/publishers/p/items/e:fetchStatus`,
    ])
    expect(r.draft).toEqual({ uploadState: 'FAILURE', crxVersion: '3.0.2', itemError: [{ code: 'PKG_UNKNOWN_ERROR', detail: 'bad zip' }] })
    expect(r.v2.submitted).toEqual({ state: 'PENDING_REVIEW', versions: ['3.0.2'] })
    expect(r.v2.published).toEqual({ state: 'PUBLISHED', versions: ['3.0.1'] })
    const text = formatStatus(r).join('\n')
    expect(text).toContain('uploadState: FAILURE')
    expect(text).toContain('itemError: PKG_UNKNOWN_ERROR (bad zip)')
    expect(text).toContain('submitted revision: PENDING_REVIEW version 3.0.2')
    expect(text).not.toContain('KEY')
  })
  it('keeps the other read when one fails, and notes the failure', async () => {
    const { fetchImpl } = fake({ ':fetchStatus': json(v2) })
    const r = await readStatus({ token: 't', publisherId: 'p', itemId: 'e', fetchImpl })
    expect(r.draft).toBeNull()
    expect(r.errors[0]).toContain('items.get (v1.1, projection DRAFT) failed (HTTP 404)')
    expect(formatStatus(r).join('\n')).toContain('PENDING_REVIEW')
  })
  it('skips v2 without a publisher id and fails when nothing could be read', async () => {
    const ok = fake({ 'v1.1/items/e': json({ uploadState: 'SUCCESS', crxVersion: '3.0.1' }) })
    const r = await readStatus({ token: 't', publisherId: '', itemId: 'e', fetchImpl: ok.fetchImpl })
    expect(r.draft?.itemError).toEqual([])
    expect(formatStatus(r).join('\n')).toContain('itemError: none')
    expect(ok.calls).toHaveLength(1)
    await expect(readStatus({ token: 't', publisherId: 'p', itemId: 'e', fetchImpl: fake({}).fetchImpl })).rejects.toThrow(/failed \(HTTP 404\)/)
  })
  it('workflow is manual, read-only, self-hosted and passes only the existing credentials', () => {
    const w = wf('cws-status.yml')
    expect(w).toMatch(/on:\n  workflow_dispatch:\n/)
    expect(w).toContain('contents: read')
    expect(w).toContain('runs-on: sylphx-linux-standard')
    expect(w).not.toMatch(/ubuntu|macos|windows/)
    expect(w).toContain('node scripts/cws-v2.mjs status')
    expect(w).toContain('CWS_PUBLISHER_ID: ${{ secrets.CWS_PUBLISHER_ID || vars.CWS_PUBLISHER_ID }}')
    for (const k of ['CHROME_CLIENT_ID', 'CHROME_CLIENT_SECRET', 'CHROME_REFRESH_TOKEN', 'CHROME_EXTENSION_ID', 'CWS_SERVICE_ACCOUNT_JSON']) expect(w).toContain(`${k}: \${{ secrets.${k} }}`)
    expect(w).not.toContain("cws-v2.mjs publish")
  })
})
