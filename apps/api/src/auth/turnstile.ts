const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export const BOT_CHECK_FAILED = {
  error: { code: "BOT_CHECK_FAILED", message: "Please complete the check and try again." },
};

/** Extra per-IP budget for mobile requests that cannot carry a Turnstile token (5 per 10 minutes). */
export const MOBILE_NO_TURNSTILE_LIMIT = { max: 5, windowSec: 600 } as const;

/**
 * Bot check for routes the mobile app also calls (email-code request, forgot password). The app has no
 * Turnstile widget, so a request marked `X-App-Client: mobile` skips Turnstile but gets a stricter per-IP
 * limit instead. The header is client-asserted, so this only swaps one protection for another; the route's
 * own per-IP and per-target limits still apply and responses stay enumeration-safe.
 */
export async function passesBotCheck(
  headers: Record<string, string | string[] | undefined>,
  token: string | undefined,
  ip: string,
  hit: (key: string, max: number, windowSec: number) => Promise<boolean>,
): Promise<boolean> {
  if (!process.env.TURNSTILE_SECRET_KEY) return true;
  const client = headers["x-app-client"];
  if (typeof client === "string" && client.toLowerCase() === "mobile") {
    const over = await hit(`auth:mobile-no-turnstile:${ip}`, MOBILE_NO_TURNSTILE_LIMIT.max, MOBILE_NO_TURNSTILE_LIMIT.windowSec);
    return !over;
  }
  return verifyTurnstile(token, ip);
}

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
