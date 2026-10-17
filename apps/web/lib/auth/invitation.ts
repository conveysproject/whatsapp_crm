// Pure helpers for the invitation page: map responses to UI steps.
export type InvitationStep =
  | { kind: "done" }
  | { kind: "account_exists" }
  | { kind: "error"; message: string };

const GENERIC = "Something went wrong. Please try again.";

const BY_CODE: Record<string, string> = {
  INVALID_INVITATION: "This invitation link is invalid or has expired.",
  SEAT_LIMIT: "This organization has no free seats left. Ask an admin to add more.",
  EMAIL_MISMATCH: "You are signed in with a different email than the one invited. Sign out and use the invited email.",
  ALREADY_MEMBER: "You are already a member of this organization.",
};

function errorOf(body: unknown): { code?: string; message?: string } {
  if (!body || typeof body !== "object") return {};
  const e = (body as Record<string, unknown>)["error"];
  if (!e || typeof e !== "object") return {};
  const r = e as Record<string, unknown>;
  return {
    code: typeof r["code"] === "string" ? r["code"] : undefined,
    message: typeof r["message"] === "string" && r["message"] ? r["message"] : undefined,
  };
}

function failure(body: unknown): InvitationStep {
  const { code, message } = errorOf(body);
  if (code === "WEAK_PASSWORD" && message) return { kind: "error", message };
  const known = code ? BY_CODE[code] : undefined;
  if (known) return { kind: "error", message: known };
  return { kind: "error", message: message ?? GENERIC };
}

/** New-account accept via the BFF. */
export function invitationNextStep(status: number, body: unknown): InvitationStep {
  if (status >= 200 && status < 300) return { kind: "done" };
  if (status === 409 && errorOf(body).code === "ACCOUNT_EXISTS") return { kind: "account_exists" };
  return failure(body);
}

/** Accept while already signed in (API call with Bearer token). */
export function signedInAcceptStep(status: number, body: unknown): InvitationStep {
  if (status >= 200 && status < 300) return { kind: "done" };
  return failure(body);
}
