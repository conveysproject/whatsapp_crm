export type AuthMode = "clerk" | "wbmsg";
export type ConfiguredAuthMode = AuthMode | "auto";

/** EXPO_PUBLIC_AUTH_PROVIDER: `clerk` (default), `wbmsg`, or `auto` (ask the API at launch). Anything else means clerk. */
export function parseAuthMode(raw: string | undefined): ConfiguredAuthMode {
  const v = (raw ?? "").trim().toLowerCase();
  return v === "wbmsg" || v === "auto" ? v : "clerk";
}

/**
 * `auto` lets one store build work before and after the login cutover: the API's public key endpoint answers 200 only
 * when it runs WBMSG login (every /v1/auth route 404s in Clerk mode). Offline or unclear answers reuse the last result.
 */
export async function resolveAuthMode(
  configured: ConfiguredAuthMode,
  deps: { probe: () => Promise<number>; lastKnown: () => Promise<string | null>; remember: (mode: AuthMode) => Promise<void> },
): Promise<AuthMode> {
  if (configured !== "auto") return configured;
  let status = 0;
  try {
    status = await deps.probe();
  } catch {
    status = 0;
  }
  const decided: AuthMode | null = status === 200 ? "wbmsg" : status === 404 ? "clerk" : null;
  if (decided) {
    await deps.remember(decided).catch(() => undefined);
    return decided;
  }
  const last = await deps.lastKnown().catch(() => null);
  return last === "wbmsg" ? "wbmsg" : "clerk";
}
