import { describe, it, expect } from "vitest";
import { DEFAULT_ALERT_PREFS, parseAlertPrefs, readAlertPrefs, kindWanted } from "./alert-prefs.js";

describe("parseAlertPrefs", () => {
  it("accepts a complete set of booleans", () => {
    const p = { ...DEFAULT_ALERT_PREFS, step50: false, email: false };
    expect(parseAlertPrefs(p)).toEqual({ ok: true, prefs: p });
  });
  it("rejects missing keys, non-booleans and non-objects", () => {
    const missing: Record<string, boolean> = { ...DEFAULT_ALERT_PREFS };
    delete missing["step95"];
    for (const bad of [null, [], "x", missing, { ...DEFAULT_ALERT_PREFS, email: "yes" }, { ...DEFAULT_ALERT_PREFS, inApp: 1 }]) {
      expect(parseAlertPrefs(bad).ok, JSON.stringify(bad)).toBe(false);
    }
  });
  it("ignores unknown extra keys instead of storing them", () => {
    const r = parseAlertPrefs({ ...DEFAULT_ALERT_PREFS, admin: true });
    expect(r.ok && Object.keys(r.prefs).sort()).toEqual(Object.keys(DEFAULT_ALERT_PREFS).sort());
  });
});

describe("readAlertPrefs", () => {
  it("defaults to everything on when nothing valid is stored", () => {
    for (const s of [null, undefined, "x", [], {}, { billingAlerts: null }, { billingAlerts: [] }]) expect(readAlertPrefs(s)).toEqual(DEFAULT_ALERT_PREFS);
  });
  it("reads stored booleans and keeps the default for malformed ones", () => {
    expect(readAlertPrefs({ billingAlerts: { step80: false, email: "no", inApp: false } })).toEqual({ ...DEFAULT_ALERT_PREFS, step80: false, inApp: false });
  });
});

describe("kindWanted", () => {
  it("maps each alert kind to its preference", () => {
    const off = { ...DEFAULT_ALERT_PREFS, step50: false, newBand: false };
    expect(kindWanted(off, "free_50")).toBe(false);
    expect(kindWanted(off, "free_80")).toBe(true);
    expect(kindWanted(off, "band_2")).toBe(false);
    expect(kindWanted(DEFAULT_ALERT_PREFS, "band_2")).toBe(true);
    expect(kindWanted(off, "something_new")).toBe(true);
  });
});
