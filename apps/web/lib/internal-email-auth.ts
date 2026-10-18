/**
 * Authorizes callers of the transactional email bridge.
 *
 * Server-to-server only: the caller must present INTERNAL_EMAIL_SECRET
 * (the Railway API). Signed-in user tokens (Clerk JWT or our own access
 * token) are deliberately NOT accepted — the bridge sends arbitrary HTML to
 * arbitrary recipients, so any user token would turn it into a spam relay.
 * Browser features that need an email must have the API send it instead.
 */
export async function isAuthorized(token: string): Promise<boolean> {
  if (!token) return false;
  const secret = process.env["INTERNAL_EMAIL_SECRET"];
  if (secret && secret.length >= 32) return timingSafeEqual(token, secret);
  return false;
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    let diff = 0;
    for (let i = 0; i < b.length; i++) diff |= (a.charCodeAt(i % a.length) ^ b.charCodeAt(i));
    return false;
  }
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= (a.charCodeAt(i) ^ b.charCodeAt(i));
  return diff === 0;
}
