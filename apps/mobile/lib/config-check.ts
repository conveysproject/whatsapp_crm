import { parseAuthMode } from "./auth/provider";
import { config } from "./config";

type Cfg = { apiUrl: string; webUrl: string; clerkPublishableKey: string; authProvider?: string };

/** Names of env values that are missing or unusable in this build. Localhost is only acceptable in dev. */
export function missingConfig(cfg: Cfg = config, isDev: boolean = __DEV__): string[] {
  const missing: string[] = [];
  // WBMSG-only builds never load Clerk; `auto` can fall back to Clerk, so it still needs the key.
  if (!cfg.clerkPublishableKey && parseAuthMode(cfg.authProvider) !== "wbmsg") missing.push("EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY");
  if (!isDev && /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/i.test(cfg.apiUrl)) missing.push("EXPO_PUBLIC_API_URL");
  return missing;
}
