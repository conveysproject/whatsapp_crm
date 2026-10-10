export function isBillingV2Enabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env["BILLING_V2_ENABLED"] === "true";
}

export function graceDays(env: NodeJS.ProcessEnv = process.env): number {
  const n = Number(env["BILLING_GRACE_DAYS"]);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 7;
}
