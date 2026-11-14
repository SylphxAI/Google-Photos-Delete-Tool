/**
 * Made-up token strings for tests, assembled at runtime so no file carries a
 * literal that looks like a session, wallet or signed token.
 */
export const fake = (...parts: string[]): string => parts.join('_')
export const fakeJwt = (...parts: string[]): string => parts.map((p) => btoa(p).replace(/=+$/, '')).join('.')
