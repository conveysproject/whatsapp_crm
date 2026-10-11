/** Per-organization usage-alert preferences, kept in organizations.settings.billingAlerts. Default: everything on. */
export interface AlertPrefs {
  step50: boolean;
  step80: boolean;
  step95: boolean;
  step100: boolean;
  newBand: boolean;
  email: boolean;
  inApp: boolean;
}

export const DEFAULT_ALERT_PREFS: AlertPrefs = { step50: true, step80: true, step95: true, step100: true, newBand: true, email: true, inApp: true };
const KEYS = Object.keys(DEFAULT_ALERT_PREFS) as Array<keyof AlertPrefs>;

/** Validates a submitted update: every key must be present and boolean. */
export function parseAlertPrefs(raw: unknown): { ok: true; prefs: AlertPrefs } | { ok: false; error: string } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, error: "preferences must be an object" };
  const o = raw as Record<string, unknown>;
  const out = { ...DEFAULT_ALERT_PREFS };
  for (const k of KEYS) {
    if (typeof o[k] !== "boolean") return { ok: false, error: `${k} must be true or false` };
    out[k] = o[k] as boolean;
  }
  return { ok: true, prefs: out };
}

/** Reads stored preferences; anything missing or malformed falls back to "on" so a bad value never silences a warning. */
export function readAlertPrefs(settings: unknown): AlertPrefs {
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) return DEFAULT_ALERT_PREFS;
  const b = (settings as Record<string, unknown>)["billingAlerts"];
  if (!b || typeof b !== "object" || Array.isArray(b)) return DEFAULT_ALERT_PREFS;
  const r = b as Record<string, unknown>;
  const out = { ...DEFAULT_ALERT_PREFS };
  for (const k of KEYS) if (typeof r[k] === "boolean") out[k] = r[k] as boolean;
  return out;
}

/** Whether the organization wants this kind of alert at all (channel aside). */
export function kindWanted(prefs: AlertPrefs, kind: string): boolean {
  if (kind === "free_50") return prefs.step50;
  if (kind === "free_80") return prefs.step80;
  if (kind === "free_95") return prefs.step95;
  if (kind === "free_100") return prefs.step100;
  if (/^band_\d+$/.test(kind) || kind === "above") return prefs.newBand;
  return true;
}
