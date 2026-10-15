/**
 * Chrome Web Store publishing through the CWS API v2 with a Google service
 * account (zero-dependency, node:crypto RS256 JWT).
 *
 * Contract (read 2026-10-01 from developer.chrome.com):
 *   docs/webstore/api, docs/webstore/using-api, docs/webstore/service-accounts,
 *   docs/webstore/api/reference/rest (+ /v2/ItemState, /v2/UploadState)
 *
 *   base                https://chromewebstore.googleapis.com
 *   scope               https://www.googleapis.com/auth/chromewebstore
 *                       (fetchStatus also accepts .../chromewebstore.readonly)
 *   token               service-account JWT (RS256, scope claim above) POSTed to
 *                       the key's token_uri with
 *                       grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer
 *   upload              POST /upload/v2/publishers/{publisherId}/items/{itemId}:upload
 *                       (zip as the request body; manifest version must be raised;
 *                       response uploadState SUCCEEDED | IN_PROGRESS | FAILED)
 *   fetchStatus         GET  /v2/publishers/{publisherId}/items/{itemId}:fetchStatus
 *                       (submittedItemRevisionStatus, publishedItemRevisionStatus,
 *                       lastAsyncUploadState)
 *   publish             POST /v2/publishers/{publisherId}/items/{itemId}:publish
 *                       (no body = DEFAULT_PUBLISH: live as soon as review passes;
 *                       body {"publishType":"STAGED_PUBLISH"}: after review the
 *                       revision is STAGED and goes live only on a later publish
 *                       call or a dashboard click)
 *   cancelSubmission    POST /v2/publishers/{publisherId}/items/{itemId}:cancelSubmission
 *                       ("Cancel the current active submission of an item if present")
 *   ItemState           PENDING_REVIEW | STAGED | PUBLISHED | PUBLISHED_TO_TESTERS |
 *                       REJECTED | CANCELLED
 *
 * v2 has no documented "pending review" error code (v1 used ITEM_NOT_UPDATABLE),
 * so a pending submission is detected by reading fetchStatus before upload,
 * with the v1 wording kept only as a fallback on a failed upload.
 *
 * Commands (all read the environment; nothing secret is ever printed):
 *   node scripts/cws-v2.mjs mode                  # prints sa | oauth | none, exit 1 if the config is partial
 *   node scripts/cws-v2.mjs publish --zip <file> [--cancel-pending] [--staged]
 *   node scripts/cws-v2.mjs status                # read-only: v1.1 items.get (projection DRAFT) + v2 fetchStatus
 *
 * --staged submits with publishType STAGED_PUBLISH and accepts only a
 * PENDING_REVIEW or STAGED readback, so the run can never make a version live.
 *
 * Environment: CWS_SERVICE_ACCOUNT_JSON, CWS_PUBLISHER_ID, CHROME_EXTENSION_ID
 * (service-account path), or CHROME_CLIENT_ID / CHROME_CLIENT_SECRET /
 * CHROME_REFRESH_TOKEN plus CWS_PUBLISHER_ID and CHROME_EXTENSION_ID (the same
 * v2 calls with an OAuth access token minted from the refresh token). The v1.1
 * API shuts down on 2026-10-15 and v2 addresses items by publisher id, so the
 * OAuth secrets without CWS_PUBLISHER_ID are refused, never sent to v1.
 *
 * Exit codes: 0 = published or blocked by a pending review (outputs say which),
 * 1 = any failure (auth, validation, readback). State must only advance on
 * `published=yes`.
 */
import { createSign } from 'node:crypto'
import { appendFileSync, readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

export const API_BASE = 'https://chromewebstore.googleapis.com'
export const SCOPE = 'https://www.googleapis.com/auth/chromewebstore'
const DEFAULT_TOKEN_URI = 'https://oauth2.googleapis.com/token'
const ACCEPTED_STATES = ['PENDING_REVIEW', 'STAGED', 'PUBLISHED', 'PUBLISHED_TO_TESTERS']
/** A staged submission must read back as waiting, never as live. */
const STAGED_ACCEPTED_STATES = ['PENDING_REVIEW', 'STAGED']
export const PUBLISH_TYPES = ['DEFAULT_PUBLISH', 'STAGED_PUBLISH']

/**
 * Choose the auth path. Service account wins when its secret is set. Both paths
 * need the publisher id: the v2 API has no publisher-less form.
 */
export function selectAuthMode(env) {
  const has = (k) => typeof env[k] === 'string' && env[k].trim() !== ''
  if (has('CWS_SERVICE_ACCOUNT_JSON')) {
    const missing = ['CWS_PUBLISHER_ID', 'CHROME_EXTENSION_ID'].filter((k) => !has(k))
    return missing.length ? { mode: 'invalid', via: 'CWS_SERVICE_ACCOUNT_JSON', missing } : { mode: 'sa' }
  }
  if (['CHROME_EXTENSION_ID', 'CHROME_CLIENT_ID', 'CHROME_CLIENT_SECRET', 'CHROME_REFRESH_TOKEN'].every(has)) {
    return has('CWS_PUBLISHER_ID') ? { mode: 'oauth' } : { mode: 'invalid', via: 'the CHROME_* OAuth secrets', missing: ['CWS_PUBLISHER_ID'] }
  }
  return { mode: 'none' }
}

/** The error line for a refused configuration (names what to set, never a value). */
export const invalidModeMessage = (sel) =>
  sel.missing.includes('CWS_PUBLISHER_ID') && sel.via !== 'CWS_SERVICE_ACCOUNT_JSON'
    ? `${sel.via} are set but CWS_PUBLISHER_ID is missing; the Chrome Web Store API v1.1 shuts down on 2026-10-15 and v2 needs the publisher id. Set the CWS_PUBLISHER_ID repo variable (developer dashboard, Account page; not a secret).`
    : `${sel.via} is set but ${sel.missing.join(', ')} is missing; refusing to fall back silently`

const b64url = (v) => Buffer.from(v).toString('base64url')

/** Build a signed service-account JWT assertion. */
export function signServiceAccountJwt(key, now = Math.floor(Date.now() / 1000)) {
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const claims = b64url(JSON.stringify({
    iss: key.client_email,
    scope: SCOPE,
    aud: key.token_uri || DEFAULT_TOKEN_URI,
    iat: now,
    exp: now + 3600,
  }))
  const signature = createSign('RSA-SHA256').update(`${header}.${claims}`).sign(key.private_key, 'base64url')
  return `${header}.${claims}.${signature}`
}

/** Exchange the service-account JWT for an access token. Throws without echoing secrets. */
export async function mintAccessToken(keyJson, fetchImpl = fetch) {
  let key
  try {
    key = JSON.parse(keyJson)
  } catch {
    throw new Error('CWS_SERVICE_ACCOUNT_JSON is not valid JSON')
  }
  if (!key || !key.client_email || !key.private_key) {
    throw new Error('CWS_SERVICE_ACCOUNT_JSON is missing client_email or private_key')
  }
  let assertion
  try {
    assertion = signServiceAccountJwt(key)
  } catch {
    throw new Error('could not sign the service-account JWT (bad private_key)')
  }
  const res = await fetchImpl(key.token_uri || DEFAULT_TOKEN_URI, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }).toString(),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    const code = (() => { try { return JSON.parse(body).error } catch { return '' } })()
    throw new Error(`token exchange failed (HTTP ${res.status}${code ? ` ${code}` : ''})`)
  }
  const data = await res.json()
  if (!data.access_token) throw new Error('token exchange returned no access_token')
  return data.access_token
}

/** Exchange the OAuth refresh token for an access token. Throws without echoing secrets. */
export async function mintOAuthAccessToken({ clientId, clientSecret, refreshToken }, fetchImpl = fetch) {
  if (!clientId || !clientSecret || !refreshToken) throw new Error('OAuth client id, secret or refresh token missing')
  const res = await fetchImpl(DEFAULT_TOKEN_URI, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken }).toString(),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    const code = (() => { try { return JSON.parse(body).error } catch { return '' } })()
    throw new Error(`OAuth token refresh failed (HTTP ${res.status}${code ? ` ${code}` : ''})`)
  }
  const data = await res.json()
  if (!data.access_token) throw new Error('OAuth token refresh returned no access_token')
  return data.access_token
}

export const PUBLISH_RETRY_MS = 600000
/** CWS reachability checks on the support URL / privacy policy are transient. */
export const isTransientPublishError = (text) => /not reachable|Timeout while connecting/i.test(text ?? '')

const itemName = (publisherId, itemId) => `publishers/${publisherId}/items/${itemId}`

async function call(fetchImpl, token, method, url, body, contentType = 'application/zip') {
  const res = await fetchImpl(url, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': contentType } : {}) },
    ...(body ? { body } : {}),
  })
  const text = await res.text()
  let json = null
  try { json = text ? JSON.parse(text) : null } catch { /* non-JSON error page */ }
  return { ok: res.ok, status: res.status, json, text }
}

/**
 * Upload (optionally cancelling a pending review first), publish, read back.
 * Returns { outcome: 'published' | 'blocked', ... }; throws on any failure.
 */
export async function publishV2(opts) {
  const { token, publisherId, itemId, zip, cancelPending = false, publishType, fetchImpl = fetch, log = () => {}, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = opts
  if (publishType !== undefined && !PUBLISH_TYPES.includes(publishType)) throw new Error(`unknown publishType ${publishType}`)
  const staged = publishType === 'STAGED_PUBLISH'
  const name = itemName(publisherId, itemId)
  const status = () => call(fetchImpl, token, 'GET', `${API_BASE}/v2/${name}:fetchStatus`)

  const first = await status()
  if (!first.ok) throw new Error(`fetchStatus failed (HTTP ${first.status})`)
  log(`status before: submitted=${first.json?.submittedItemRevisionStatus?.state ?? 'none'} published=${first.json?.publishedItemRevisionStatus?.state ?? 'none'}`)

  const cancel = async () => {
    const c = await call(fetchImpl, token, 'POST', `${API_BASE}/v2/${name}:cancelSubmission`)
    if (!c.ok) throw new Error(`cancelSubmission failed (HTTP ${c.status})`)
    log('pending submission cancelled')
  }

  let cancelled = false
  if (first.json?.submittedItemRevisionStatus?.state === 'PENDING_REVIEW') {
    if (!cancelPending) return { outcome: 'blocked', reason: 'pending review (cancel_pending not set)' }
    await cancel()
    cancelled = true
  }

  const doUpload = () => call(fetchImpl, token, 'POST', `${API_BASE}/upload/v2/${name}:upload`, zip)
  let up = await doUpload()
  if (!up.ok && /ITEM_NOT_UPDATABLE|pending review|not updatable/i.test(up.text)) {
    if (!cancelPending || cancelled) return { outcome: 'blocked', reason: 'upload refused while a submission is active' }
    await cancel()
    cancelled = true
    up = await doUpload()
  }
  if (!up.ok) throw new Error(`upload failed (HTTP ${up.status})`)

  let uploadState = up.json?.uploadState
  let crxVersion = up.json?.crxVersion
  for (let i = 0; uploadState === 'IN_PROGRESS' && i < 30; i++) {
    await sleep(10000)
    const s = await status()
    if (!s.ok) throw new Error(`fetchStatus failed (HTTP ${s.status})`)
    uploadState = s.json?.lastAsyncUploadState
  }
  if (uploadState !== 'SUCCEEDED') throw new Error(`upload did not succeed (uploadState=${uploadState ?? 'unset'})`)

  // No body keeps the historical DEFAULT_PUBLISH request byte for byte.
  const publishBody = publishType ? JSON.stringify({ publishType }) : undefined
  const doPublish = () => call(fetchImpl, token, 'POST', `${API_BASE}/v2/${name}:publish`, publishBody, 'application/json')
  let pub = await doPublish()
  if (!pub.ok && isTransientPublishError(pub.text)) {
    log(`::notice::CWS publish hit a transient reachability error (HTTP ${pub.status}); retrying once after 10 min`)
    await sleep(PUBLISH_RETRY_MS)
    pub = await doPublish()
    if (!pub.ok) throw new Error(`publish failed (HTTP ${pub.status}); retried once after 10 min`)
  } else if (!pub.ok) {
    throw new Error(`publish failed (HTTP ${pub.status})`)
  }

  const after = await status()
  if (!after.ok) throw new Error(`readback fetchStatus failed (HTTP ${after.status})`)
  const submitted = after.json?.submittedItemRevisionStatus
  const published = after.json?.publishedItemRevisionStatus
  const publishedVersions = (published?.distributionChannels ?? []).map((c) => c.crxVersion)
  const itemState = submitted?.state ?? published?.state ?? 'UNKNOWN'
  if (staged) {
    if (crxVersion && publishedVersions.includes(crxVersion)) throw new Error(`staged submission ${crxVersion} reads back as published`)
    if (!STAGED_ACCEPTED_STATES.includes(submitted?.state ?? '')) throw new Error(`readback does not show the staged submission (state=${itemState})`)
    return { outcome: 'published', itemState, crxVersion: crxVersion ?? '', cancelled, staged, readback: after.json }
  }
  const accepted = ACCEPTED_STATES.includes(submitted?.state ?? '') || (crxVersion && publishedVersions.includes(crxVersion))
  if (!accepted) throw new Error(`readback does not show the submission (state=${itemState})`)
  return { outcome: 'published', itemState, crxVersion: crxVersion ?? '', cancelled, staged, readback: after.json }
}

export const V1_ITEMS_BASE = 'https://www.googleapis.com/chromewebstore/v1.1/items'

/**
 * Read-only status: the v1.1 items.get draft (uploadState, crxVersion, itemError;
 * the v1.1 API shuts down on 2026-10-15) and the v2 fetchStatus (review state of
 * the submitted and published revisions). The two reads are independent: one
 * failing does not hide the other. Only whitelisted fields are returned, never
 * the whole body. Throws only when neither read produced data.
 */
export async function readStatus({ token, publisherId, itemId, fetchImpl = fetch }) {
  const out = { draft: null, v2: null, errors: [] }
  const d = await call(fetchImpl, token, 'GET', `${V1_ITEMS_BASE}/${encodeURIComponent(itemId)}?projection=DRAFT`).catch((e) => ({ ok: false, status: 0, error: e }))
  if (d.ok && d.json) {
    out.draft = {
      uploadState: d.json.uploadState ?? 'UNKNOWN',
      crxVersion: d.json.crxVersion ?? '',
      itemError: (d.json.itemError ?? []).map((e) => ({ code: e.error_code ?? '', detail: e.error_detail ?? '' })),
    }
  } else {
    out.errors.push(`items.get (v1.1, projection DRAFT) failed (HTTP ${d.status})`)
  }
  if (!publisherId) {
    out.errors.push('v2 fetchStatus skipped: CWS_PUBLISHER_ID is not set')
  } else {
    const v = await call(fetchImpl, token, 'GET', `${API_BASE}/v2/${itemName(publisherId, itemId)}:fetchStatus`).catch((e) => ({ ok: false, status: 0, error: e }))
    if (v.ok && v.json) {
      const rev = (r) => (r ? { state: r.state ?? 'UNKNOWN', versions: (r.distributionChannels ?? []).map((c) => c.crxVersion).filter(Boolean) } : null)
      out.v2 = {
        submitted: rev(v.json.submittedItemRevisionStatus),
        published: rev(v.json.publishedItemRevisionStatus),
        lastAsyncUploadState: v.json.lastAsyncUploadState ?? 'UNKNOWN',
        takenDown: v.json.takenDown === true,
        warned: v.json.warned === true,
      }
    } else {
      out.errors.push(`fetchStatus (v2) failed (HTTP ${v.status})`)
    }
  }
  if (!out.draft && !out.v2) throw new Error(out.errors.join('; '))
  return out
}

/** One-per-line summary of readStatus() for the log and the job summary. */
export function formatStatus(r) {
  const lines = []
  if (r.draft) {
    lines.push(`uploadState: ${r.draft.uploadState}`)
    lines.push(`version (draft crxVersion): ${r.draft.crxVersion || 'none'}`)
    lines.push(r.draft.itemError.length
      ? `itemError: ${r.draft.itemError.map((e) => `${e.code}${e.detail ? ` (${e.detail})` : ''}`).join('; ')}`
      : 'itemError: none')
  }
  if (r.v2) {
    const fmt = (x) => (x ? `${x.state}${x.versions.length ? ` version ${x.versions.join(', ')}` : ''}` : 'none')
    lines.push(`item status, submitted revision: ${fmt(r.v2.submitted)}`)
    lines.push(`item status, published revision: ${fmt(r.v2.published)}`)
    lines.push(`lastAsyncUploadState: ${r.v2.lastAsyncUploadState}`)
    lines.push(`takenDown: ${r.v2.takenDown}  warned: ${r.v2.warned}`)
  }
  for (const e of r.errors) lines.push(`note: ${e}`)
  return lines
}

function writeOutputs(pairs) {
  if (!process.env.GITHUB_OUTPUT) return
  appendFileSync(process.env.GITHUB_OUTPUT, Object.entries(pairs).map(([k, v]) => `${k}=${v}\n`).join(''))
}

async function main(argv, env) {
  const [cmd, ...rest] = argv
  if (cmd === 'mode') {
    const sel = selectAuthMode(env)
    if (sel.mode === 'invalid') {
      console.error(`::error::${invalidModeMessage(sel)}`)
      return 1
    }
    console.log(sel.mode)
    return 0
  }
  if (cmd === 'status') return statusCommand(env)
  if (cmd !== 'publish') {
    console.error('usage: cws-v2.mjs mode | status | publish --zip <file> [--cancel-pending] [--staged]')
    return 2
  }
  const zipIdx = rest.indexOf('--zip')
  const zipPath = zipIdx >= 0 ? rest[zipIdx + 1] : ''
  if (!zipPath) { console.error('::error::--zip <file> required'); return 2 }
  const sel = selectAuthMode(env)
  const publisherId = (env.CWS_PUBLISHER_ID ?? '').trim()
  if (sel.mode === 'invalid') {
    console.error(`::error::${invalidModeMessage(sel)}`)
    return 1
  }
  if (sel.mode !== 'sa' && sel.mode !== 'oauth') {
    console.error('::error::v2 needs the service account, or the OAuth secrets plus CWS_PUBLISHER_ID')
    return 1
  }
  const staged = rest.includes('--staged')
  try {
    const token = sel.mode === 'sa'
      ? await mintAccessToken(env.CWS_SERVICE_ACCOUNT_JSON)
      : await mintOAuthAccessToken({ clientId: env.CHROME_CLIENT_ID.trim(), clientSecret: env.CHROME_CLIENT_SECRET.trim(), refreshToken: env.CHROME_REFRESH_TOKEN.trim() })
    console.log(`::add-mask::${token}`)
    const result = await publishV2({
      token,
      publisherId,
      itemId: env.CHROME_EXTENSION_ID.trim(),
      zip: readFileSync(zipPath),
      cancelPending: rest.includes('--cancel-pending'),
      ...(staged ? { publishType: 'STAGED_PUBLISH' } : {}),
      log: (m) => console.log(m),
    })
    if (result.outcome === 'blocked') {
      console.log(`::notice::CWS blocked: ${result.reason}. The retry loop tries again after review clears; a manual publish-cws.yml dispatch with cancel_pending=true cancels it.`)
      writeOutputs({ blocked: 'yes' })
      return 0
    }
    console.log(`::notice::CWS v2 submission accepted: state=${result.itemState} version=${result.crxVersion} staged=${result.staged} cancelled_pending=${result.cancelled}`)
    console.log(JSON.stringify(result.readback))
    writeOutputs({ uploaded: 'yes', published: 'yes', item_state: result.itemState, crx_version: result.crxVersion, staged: result.staged ? 'yes' : 'no' })
    if (process.env.GITHUB_STEP_SUMMARY) {
      appendFileSync(process.env.GITHUB_STEP_SUMMARY, `CWS v2 readback: state \`${result.itemState}\`, version \`${result.crxVersion}\`, pending submission cancelled: ${result.cancelled}\n`)
    }
    return 0
  } catch (err) {
    console.error(`::error::CWS v2 failed: ${err instanceof Error ? err.message : 'unknown error'}; state not advanced`)
    return 1
  }
}

async function statusCommand(env) {
  const sel = selectAuthMode(env)
  if (sel.mode === 'invalid') {
    console.error(`::error::${invalidModeMessage(sel)}`)
    return 1
  }
  if (sel.mode === 'none') {
    console.error('::error::no service account or CHROME_* OAuth secrets configured')
    return 1
  }
  try {
    const token = sel.mode === 'sa'
      ? await mintAccessToken(env.CWS_SERVICE_ACCOUNT_JSON)
      : await mintOAuthAccessToken({ clientId: env.CHROME_CLIENT_ID.trim(), clientSecret: env.CHROME_CLIENT_SECRET.trim(), refreshToken: env.CHROME_REFRESH_TOKEN.trim() })
    console.log(`::add-mask::${token}`)
    const result = await readStatus({ token, publisherId: (env.CWS_PUBLISHER_ID ?? '').trim(), itemId: env.CHROME_EXTENSION_ID.trim() })
    const lines = formatStatus(result)
    lines.unshift(`read at: ${new Date().toISOString()}`)
    console.log(`Chrome Web Store status (auth: ${sel.mode})`)
    for (const l of lines) console.log(l)
    if (env.GITHUB_STEP_SUMMARY) {
      appendFileSync(env.GITHUB_STEP_SUMMARY, `### Chrome Web Store status\n\n${lines.map((l) => `- ${l}`).join('\n')}\n`)
    }
    return 0
  } catch (err) {
    console.error(`::error::CWS status failed: ${err instanceof Error ? err.message : 'unknown error'}`)
    return 1
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(await main(process.argv.slice(2), process.env))
}
