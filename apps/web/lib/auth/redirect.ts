// Edge-safe. Only same-origin absolute paths are returned; everything else yields the fallback.
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f]/;

function bad(s: string): boolean {
  return CONTROL.test(s) || s.includes("\\") || !s.startsWith("/") || s.startsWith("//");
}

export function safeRedirect(raw: string | null, fallback = "/dashboard"): string {
  if (!raw || bad(raw)) return fallback;
  let decoded: string;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return fallback;
  }
  if (bad(decoded)) return fallback;
  // A second decode catches double-encoded tricks such as %252F%252F.
  try {
    if (bad(decodeURIComponent(decoded))) return fallback;
  } catch {
    return fallback;
  }
  return raw;
}
