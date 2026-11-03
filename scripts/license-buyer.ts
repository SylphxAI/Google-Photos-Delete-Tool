/**
 * First-purchase readback: decide whether an issued token is a genuine Pro
 * token for this product. Pure (verification and input are injected) so tests can use
 * throwaway keys; the CLI uses the same target-environment verifier as the popup. The token
 * is read from stdin or a file, never from argv (it would land in shell
 * history and process lists), and is never part of the output.
 *
 * What a token carries decides what is checked: the Ed25519 signature against
 * the target-environment Money trust and production legacy keys, `plan` and `product`. `email` is optional (a Money token
 * carries it only when the buyer subject is an email address), so it is
 * compared only when the token has one and an expected email was given.
 */
import { verifyLicense, type LicenseResult } from '../src/core/license'

/**
 * `new`: signed by the target environment’s published Money key
 * and names product `gpdt`, i.e. a token minted for a fresh purchase.
 * `existing`: valid, but signed by a production legacy key or carrying no product /
 * the legacy product slug, i.e. a token from before the self-serve checkout.
 * `invalid`: anything else, including an email that belongs to someone else.
 */
export type BuyerVerdict = 'new' | 'existing' | 'invalid'

/** `not-in-token`: an email was expected but the token carries none (not a failure). */
export type EmailCheck = 'match' | 'mismatch' | 'not-in-token' | 'not-checked'

export interface BuyerReport {
  verdict: BuyerVerdict
  email: EmailCheck
}

export interface BuyerOptions {
  /** Expected buyer email; compared (case-insensitively) only when the token carries one. */
  email?: string
}

const PRODUCT = 'gpdt'

export async function verifyBuyer(
  token: string,
  verify: (token: string) => Promise<LicenseResult> = verifyLicense,
  options: BuyerOptions = {},
): Promise<BuyerReport> {
  const expected = options.email?.trim().toLowerCase()
  const result = await verify(token)
  if (!result.ok) return { verdict: 'invalid', email: 'not-checked' }
  const { product, email } = result.payload
  let emailCheck: EmailCheck = 'not-checked'
  if (expected) {
    if (typeof email !== 'string' || email.trim() === '') emailCheck = 'not-in-token'
    else emailCheck = email.trim().toLowerCase() === expected ? 'match' : 'mismatch'
  }
  if (emailCheck === 'mismatch') return { verdict: 'invalid', email: emailCheck }
  const fresh = result.authority === 'money' && product === PRODUCT
  return { verdict: fresh ? 'new' : 'existing', email: emailCheck }
}

const EMAIL_LINE: Record<EmailCheck, string> = {
  match: 'match',
  mismatch: 'mismatch',
  'not-in-token': 'not in token (check the buyer in Money)',
  'not-checked': 'not checked',
}

export function formatBuyerReport(r: BuyerReport): string {
  return `verdict: ${r.verdict}\nemail: ${EMAIL_LINE[r.email]}`
}

export const ARGV_REFUSAL =
  'verify-buyer does not take the token on the command line: it would land in shell history and process lists.\n' +
  'Pipe it on stdin, e.g. `read -rs T; printf %s "$T" | bun run scripts/license.ts verify-buyer [--email=<buyer email>]`,\n' +
  'or pass `--token-file=<path>` (a file or a process substitution).'

const NO_INPUT = 'No token on stdin. Pipe it in (see: verify-buyer takes no token argument) or pass --token-file=<path>.'

export type ParsedArgs = { ok: true; email?: string; tokenFile?: string } | { ok: false; message: string }

/** Only `--email=` and `--token-file=` are accepted; anything else (a bare token included) is refused without echoing it. */
export function parseBuyerArgs(args: readonly string[]): ParsedArgs {
  let email: string | undefined
  let tokenFile: string | undefined
  for (const a of args) {
    if (a.startsWith('--email=')) email = a.slice('--email='.length)
    else if (a.startsWith('--token-file=')) tokenFile = a.slice('--token-file='.length)
    else return { ok: false, message: ARGV_REFUSAL }
  }
  return { ok: true, email, tokenFile }
}

export interface BuyerIo {
  /** All of stdin, or null when stdin is a terminal (nothing was piped). */
  readStdin(): string | null
  readFile(path: string): string
}

export interface BuyerRun {
  code: number
  out: string
  err: string
}

/** Exit codes: 0 new or existing, 1 invalid, 2 usage. */
export async function runVerifyBuyer(args: readonly string[], verify: (token: string) => Promise<LicenseResult>, io: BuyerIo): Promise<BuyerRun> {
  const parsed = parseBuyerArgs(args)
  if (!parsed.ok) return { code: 2, out: '', err: parsed.message }
  let token: string | null
  try {
    token = parsed.tokenFile !== undefined ? io.readFile(parsed.tokenFile) : io.readStdin()
  } catch {
    // Report the failure class only; never a path or content.
    return { code: 2, out: '', err: 'Could not read the token file.' }
  }
  if (token === null) return { code: 2, out: '', err: NO_INPUT }
  const report = await verifyBuyer(token, verify, { email: parsed.email })
  return { code: report.verdict === 'invalid' ? 1 : 0, out: formatBuyerReport(report), err: '' }
}
