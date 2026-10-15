export type SignInStep = "email" | "password" | "email_code" | "unsupported_2fa" | "done";

/** Maps Clerk's sign-in status after a password attempt to the next screen step. */
export function stepAfterAttempt(
  status: string | null | undefined,
  secondFactors: ReadonlyArray<{ strategy: string }> | null | undefined,
): SignInStep {
  if (status === "complete") return "done";
  if (status === "needs_client_trust" || status === "needs_second_factor") {
    return (secondFactors ?? []).some((f) => f.strategy === "email_code") ? "email_code" : "unsupported_2fa";
  }
  return "password";
}
