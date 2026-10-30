/**
 * Pro license seller tooling (zero-server).
 *
 *   bun run license:keygen            # generate a keypair; saves the private
 *                                     # key to ~/.gpdt/gpdt-license-private.pem
 *                                     # and prints the public key to embed.
 *   bun run license:issue --email=x [--order=pi_...]   # sign a Pro payload → token (email required)
 *   bun run license:verify < token-file # verify locally; never prints claims
 *   printf %s "$TOKEN" | bun run scripts/license.ts verify-buyer [--email=<expected>]
 *                                     # first-purchase readback; token on stdin
 *                                     # (or --token-file=<path>), never argv.
 *                                     # Prints verdict new | existing | invalid;
 *                                     # exit 0 unless invalid
 *
 * The private key NEVER enters this repository. Keep it out of git,
 * backups, and any machine that does not own the Pro business. Losing it
 * invalidates every issued token; regenerate and release a new key instead.
 */
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { loadPrivateKey, privateKeyWritePath } from './license-keys'
import { buildIssuePayload, type IssuePayload } from './license-payload'

/**
 * Seller private key. $GPDT_PRO_PRIVATE_KEY is either a file path or the
 * key content (PEM, or bare base64url PKCS8 DER); an existing file wins.
 * Defaults to ~/.gpdt/gpdt-license-private.pem (mode 600). `keygen` writes
 * to the same location (the env value must then be a file path).
 */
const PRIVATE_KEY_PATH = privateKeyWritePath()

function b64url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64url')
}

function derToPem(der: Uint8Array, label: string): string {
  const b64 = Buffer.from(der).toString('base64')
  const lines = b64.match(/.{1,64}/g) ?? []
  return `-----BEGIN ${label}-----\n${lines.join('\n')}\n-----END ${label}-----\n`
}

async function keygen(): Promise<void> {
  const kp = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify'])
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey('pkcs8', kp.privateKey))
  const rawPub = new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey))

  mkdirSync(dirname(PRIVATE_KEY_PATH), { recursive: true })
  writeFileSync(PRIVATE_KEY_PATH, derToPem(pkcs8, 'PRIVATE KEY'), { mode: 0o600 })

  console.log(`Private key  -> ${PRIVATE_KEY_PATH} (mode 600, keep out of git)`)
  console.log(`Public key   -> ${b64url(rawPub)}`)
  console.log('')
  console.log('Embed the public key into src/core/license.ts:')
  console.log(`  export const PRO_PUBLIC_KEY_BASE64URL = '${b64url(rawPub)}'`)
}

async function issue(email?: string, order?: string): Promise<void> {
  let payload: IssuePayload
  try {
    payload = buildIssuePayload(email, order)
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err))
    console.error('Usage: bun run license:issue --email=<email> [--order=<Stripe payment or session id>]')
    process.exit(1)
  }
  let key: CryptoKey
  try {
    key = await loadPrivateKey()
  } catch (err) {
    // Never echo key material: report only the failure class.
    console.error(err instanceof Error && err.message.startsWith('No private key') ? err.message : 'Could not load the private key (expected a file path, PEM, or base64url PKCS8).')
    process.exit(1)
  }
  const payloadBytes = new TextEncoder().encode(JSON.stringify(payload))
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'Ed25519' }, key, payloadBytes))
  const token = `${b64url(payloadBytes)}.${b64url(sig)}`
  console.log(token)
}

async function verifyCommand(args: string[], buyer: boolean): Promise<void> {
  const { verifyLicenseForEnvironment } = await import('../src/core/license')
  const { parseLicenseEnvironment } = await import('../src/core/license-trust')
  const { runVerifyBuyer, parseBuyerArgs } = await import('./license-buyer')
  const targetArgs = args.filter((a) => a.startsWith('--environment='))
  let environment
  try {
    if (targetArgs.length > 1) throw new Error('Duplicate environment')
    environment = parseLicenseEnvironment(targetArgs[0]?.slice('--environment='.length))
  } catch {
    console.error('Licence environment must be production or preview (at most once).')
    process.exit(2)
  }
  const inputArgs = args.filter((a) => !a.startsWith('--environment='))
  const verifier = (token: string) => verifyLicenseForEnvironment(token, environment)
  const io = {
    readStdin: () => (process.stdin.isTTY ? null : readFileSync(0, 'utf8')),
    readFile: (path: string) => readFileSync(path, 'utf8'),
  }
  if (buyer) {
    const run = await runVerifyBuyer(inputArgs, verifier, io)
    if (run.out) console.log(run.out)
    if (run.err) console.error(run.err)
    process.exit(run.code)
  }
  const parsed = parseBuyerArgs(inputArgs)
  if (!parsed.ok || parsed.email !== undefined) {
    console.error('verify takes the token only on stdin or --token-file=<path>; not argv.')
    process.exit(2)
  }
  let token: string | null
  try { token = parsed.tokenFile === undefined ? io.readStdin() : io.readFile(parsed.tokenFile) }
  catch { console.error('Could not read the token file.'); process.exit(2) }
  if (token === null) { console.error('No token on stdin.'); process.exit(2) }
  const result = await verifier(token)
  // Never print the token or any of its claims, including buyer email and order.
  if (result.ok) console.log('VALID Pro license')
  else console.error(`INVALID: ${result.reason}`)
  process.exit(result.ok ? 0 : 1)
}

const [command, ...rest] = process.argv.slice(2)

switch (command) {
  case 'keygen':
    await keygen()
    break
  case 'issue': {
    const emailArg = rest.find((a) => a.startsWith('--email='))
    const orderArg = rest.find((a) => a.startsWith('--order='))
    await issue(emailArg?.slice('--email='.length), orderArg?.slice('--order='.length))
    break
  }
  case 'verify': {
    await verifyCommand(rest, false)
    break
  }
  case 'verify-buyer':
    await verifyCommand(rest, true)
    break
  default:
    console.error('Unknown command. Use: keygen | issue | verify | verify-buyer')
    process.exit(1)
}
