// Pure helpers for the own-auth pages: map BFF responses to UI steps.
export type Step =
  | { kind: "done" }
  | { kind: "new_device"; challengeId: string }
  | { kind: "set_password"; challengeId: string }
  | { kind: "error"; message: string };

const FALLBACK: Record<number, string> = {
  401: "Incorrect email or password.",
  429: "Too many attempts. Please wait a few minutes and try again.",
  503: "Sign-in is temporarily unavailable. Please try again shortly.",
};

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : null;
}

export function nextStep(response: { status: number; body: unknown }): Step {
  const { status } = response;
  const body = asRecord(response.body);
  if (status >= 200 && status < 300) {
    const next = body?.["next"];
    if (next === "new_device" || next === "set_password") {
      const challengeId = body?.["challengeId"];
      if (typeof challengeId === "string" && challengeId) return { kind: next, challengeId };
      return { kind: "error", message: "Something went wrong. Please try again." };
    }
    return { kind: "done" };
  }
  const err = asRecord(body?.["error"]);
  const message = err?.["message"];
  if (typeof message === "string" && message) return { kind: "error", message };
  return { kind: "error", message: FALLBACK[status] ?? "Something went wrong. Please try again." };
}

export interface BffResult {
  status: number;
  body: unknown;
}

/** POST JSON to the BFF. Network failures become a 503-shaped result. */
export async function postAuth(action: string, payload: Record<string, unknown>): Promise<BffResult> {
  try {
    const res = await fetch(`/api/auth/${action}`, {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }
    return { status: res.status, body };
  } catch {
    return { status: 503, body: null };
  }
}

/** Where to send the browser after a successful sign-in. `redirectTarget` is already safe (see safeRedirect). */
export function postSignInDestination(o: {
  variant: "vendor" | "admin";
  mustSetPassword: boolean;
  email: string;
  redirectTarget: string;
}): string {
  if (o.mustSetPassword) {
    return o.variant === "admin"
      ? `/forgot-password?email=${encodeURIComponent(o.email)}`
      : "/settings/security?set=1";
  }
  return o.variant === "admin" ? "/admin/sign-in" : o.redirectTarget;
}
