/** Where the owner's billing emails (daily summary, cancellation requests) go. BILLING_OWNER_EMAIL overrides the default. */
export function ownerEmail(): string {
  return process.env["BILLING_OWNER_EMAIL"] ?? "info@conveys.in";
}
