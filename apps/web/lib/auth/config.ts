// Edge-safe: no Node-only imports. Used by server code and Next middleware.
export const COOKIE = { refresh: "wb_rt", device: "wb_dev", access: "wb_at" } as const;
export const ACCESS_MAX_AGE = 600;
export const REFRESH_MAX_AGE = 2_592_000;
export const DEVICE_MAX_AGE = 7_776_000;

export function apiBaseUrl(): string {
  const raw = process.env["API_URL"] || process.env["NEXT_PUBLIC_API_URL"] || "http://localhost:4000";
  return raw.replace(/\/+$/, "");
}

export function jwksUrl(): string {
  return process.env["AUTH_JWKS_URL"] || `${apiBaseUrl()}/v1/auth/.well-known/jwks.json`;
}
