import { config } from "./config";

type Cfg = { apiUrl: string; webUrl: string };

/** Names of env values that are missing or unusable in this build. Localhost is only acceptable in dev. */
export function missingConfig(cfg: Cfg = config, isDev: boolean = __DEV__): string[] {
  const missing: string[] = [];
  if (!isDev && /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/i.test(cfg.apiUrl)) missing.push("EXPO_PUBLIC_API_URL");
  return missing;
}
