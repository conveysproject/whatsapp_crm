import type { SessionTokens } from "./session-store";

/** A raw API answer; `status: 0` means the request never reached the API. */
export interface AuthResponse {
  status: number;
  body: unknown;
}

export type AuthStep =
  | { kind: "signed_in"; tokens: SessionTokens }
  | { kind: "new_device"; challengeId: string }
  | { kind: "set_password"; challengeId: string }
  | { kind: "sent" }
  | { kind: "error"; code: string; message: string };

export const NETWORK_ERROR = "Something went wrong. Check your connection and try again.";
const GENERIC = "Something went wrong. Please try again.";

// Messages the app shows instead of the API's (the API wording assumes the web page).
const OVERRIDES: Record<string, string> = {
  BOT_CHECK_FAILED: "Email codes aren't available in the app right now. Sign in with your password, or use the web dashboard.",
  NOT_FOUND: "Sign-in is not available right now. Please try again later.",
  UPGRADE_REQUIRED: "Please update the WBMSG app to continue.",
};
const FALLBACK: Record<number, string> = {
  401: "Email or password is incorrect.",
  404: OVERRIDES["NOT_FOUND"] as string,
  426: OVERRIDES["UPGRADE_REQUIRED"] as string,
  429: "Too many attempts. Please wait a few minutes and try again.",
  503: "Sign-in is temporarily unavailable. Please try again shortly.",
};

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}
function str(v: unknown): string | null {
  return typeof v === "string" && v ? v : null;
}

/** Maps any /v1/auth answer to the next thing the sign-in screen does. */
export function stepFromResponse({ status, body }: AuthResponse): AuthStep {
  const b = asRecord(body);
  if (status >= 200 && status < 300) {
    const next = b?.["next"];
    if (next === "new_device" || next === "set_password") {
      const challengeId = str(b?.["challengeId"]);
      return challengeId ? { kind: next, challengeId } : { kind: "error", code: "BAD_RESPONSE", message: GENERIC };
    }
    const accessToken = str(b?.["accessToken"]);
    const refreshToken = str(b?.["refreshToken"]);
    if (accessToken && refreshToken) {
      const expiresIn = typeof b?.["expiresIn"] === "number" ? (b["expiresIn"] as number) : undefined;
      const deviceId = str(b?.["deviceId"]);
      return {
        kind: "signed_in",
        tokens: { accessToken, refreshToken, ...(expiresIn !== undefined ? { expiresIn } : {}), ...(deviceId ? { deviceId } : {}) },
      };
    }
    if (status === 202) return { kind: "sent" };
    return { kind: "error", code: "BAD_RESPONSE", message: GENERIC };
  }
  if (status === 0) return { kind: "error", code: "NETWORK", message: NETWORK_ERROR };
  const err = asRecord(b?.["error"]);
  const code = str(err?.["code"]) ?? (status === 426 ? "UPGRADE_REQUIRED" : "HTTP_ERROR");
  const message = OVERRIDES[code] ?? str(err?.["message"]) ?? FALLBACK[status] ?? GENERIC;
  return { kind: "error", code, message };
}

/**
 * Last step of every sign-in: super admins never use the mobile app, so their new session is revoked and never stored.
 * When the profile can't be read, the session is kept and the app's session gate decides (it also blocks super admins).
 */
export async function finishSignIn(
  tokens: SessionTokens,
  deps: {
    me: (accessToken: string) => Promise<AuthResponse>;
    signOutRemote: (accessToken: string) => Promise<void>;
    store: { signIn: (tokens: SessionTokens) => Promise<void> };
  },
): Promise<"ok" | "super_admin"> {
  const me = await deps.me(tokens.accessToken).catch((): AuthResponse => ({ status: 0, body: null }));
  const role = asRecord(asRecord(me.body)?.["data"])?.["role"];
  if (me.status === 200 && role === "superAdmin") {
    await deps.signOutRemote(tokens.accessToken).catch(() => undefined);
    return "super_admin";
  }
  await deps.store.signIn(tokens);
  return "ok";
}
