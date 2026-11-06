// @vitest-environment happy-dom
import { expect, it, vi } from 'vitest'

const verify = vi.hoisted(() => vi.fn())
const write = vi.hoisted(() => vi.fn())
vi.mock('../src/core/license', () => ({ verifyLicense: verify }))
vi.mock('../src/extension/api', () => ({ writeProToken: write }))

it('automatically activates a verified checkout token and never replaces it with an invalid one', async () => {
  window.happyDOM.setURL('https://sylphxai.github.io/Google-Photos-Delete-Tool/pricing')
  document.body.innerHTML = '<section><pre data-keel-money-licence-token></pre></section>'
  localStorage.clear()
  verify.mockResolvedValueOnce({ ok: true, payload: { plan: 'pro', product: 'gpdt', seats: 3 } })
  write.mockResolvedValue(undefined)
  await import('../src/extension/activation')
  const node = document.querySelector('pre')!
  node.textContent = 'signed.valid'
  await vi.waitFor(() => expect(write).toHaveBeenCalledWith('signed.valid'))
  expect(document.getElementById('gpdt-activation-status')?.textContent).toContain('Family')
  expect(JSON.parse(document.documentElement.getAttribute('data-keel-money-owned-claims')!).seats).toBe(3)
  verify.mockResolvedValueOnce({ ok: false, reason: 'bad-signature' })
  node.textContent = 'forged.invalid'
  await vi.waitFor(() => expect(verify).toHaveBeenCalledWith('forged.invalid'))
  await vi.waitFor(() => expect(document.getElementById('gpdt-activation-status')?.textContent).toContain('has not changed'))
  expect(write).toHaveBeenCalledTimes(1)
})
