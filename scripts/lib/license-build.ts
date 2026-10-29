import { parseLicenseEnvironment } from '../../src/core/license-trust'

const args = process.argv.slice(2)
if (args.some((arg) => !arg.startsWith('--environment=')) || args.length > 1) {
  throw new Error('Expected only --environment=production or --environment=preview')
}
export const licenseEnvironment = parseLicenseEnvironment(args[0]?.slice('--environment='.length))
export const distDirectory = licenseEnvironment === 'production' ? 'dist' : 'dist-preview'
export const zipSuffix = licenseEnvironment === 'production' ? '' : '-preview'
