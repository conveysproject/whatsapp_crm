const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export const BOT_CHECK_FAILED = {
  error: { code: "BOT_CHECK_FAILED", message: "Please complete the check and try again." },
};

/** Verifies a Cloudflare Turnstile token. Always true when TURNSTILE_SECRET_KEY is unset; fails closed. */
export async function verifyTurnstile(token: string | undefined, ip: string): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return true;
  if (!token) return false;
  try {
    const res = await fetch(VERIFY_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret, response: token, remoteip: ip }).toString(),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { success?: unknown };
    return data.success === true;
  } catch {
    return false;
  }
}
