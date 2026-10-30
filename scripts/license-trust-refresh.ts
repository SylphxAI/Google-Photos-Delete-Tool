/** Refresh public keys only. No token, buyer, claim, or credential is an input. */
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { licenseTrust, parseLicenseJwks } from '../src/core/license-trust'

const root = resolve(import.meta.dirname, '..')
for (const environment of ['production', 'preview'] as const) {
  const current = licenseTrust(environment)
  const response = await fetch(current.url, {
    method: 'GET', credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer',
    signal: AbortSignal.timeout(15_000),
  })
  if (!response.ok) throw new Error(`Public ${environment} JWKS unavailable: ${response.status}`)
  const jwks: unknown = await response.json()
  const keys = parseLicenseJwks(jwks)
  if (current.keys.some((key) => !keys.includes(key))) {
    throw new Error(`Public ${environment} JWKS removed an existing verification key; refusing to break licences`)
  }
  const path = resolve(root, `config/licence-trust/${environment}.json`)
  const before = JSON.parse(readFileSync(path, 'utf8'))
  if (JSON.stringify(before.jwks) === JSON.stringify(jwks)) {
    console.log(`${environment}: public JWKS unchanged`)
    continue
  }
  writeFileSync(path, JSON.stringify({ environment, url: current.url, fetchedAt: new Date().toISOString(), jwks }, null, 2) + '\n')
  console.log(`${environment}: updated public JWKS snapshot`)
}
