import { describe, expect, it } from "vitest";
import { SMTP_PRESETS, SMTP_PRESET_IDS, smtpPresetFor } from "./smtp-presets.js";

describe("SMTP presets", () => {
  it("has the five presets with label and help text", () => {
    expect([...SMTP_PRESET_IDS].sort()).toEqual(["gmail", "godaddy", "microsoft365", "ses", "zoho"]);
    for (const id of SMTP_PRESET_IDS) {
      expect(SMTP_PRESETS[id].label.length).toBeGreaterThan(3);
      expect(SMTP_PRESETS[id].help.length).toBeGreaterThan(10);
    }
  });
  it("resolves host, port and security", () => {
    expect(smtpPresetFor("gmail")).toEqual({ host: "smtp.gmail.com", port: 587, security: "starttls" });
    expect(smtpPresetFor("microsoft365")).toEqual({ host: "smtp.office365.com", port: 587, security: "starttls" });
    expect(smtpPresetFor("godaddy")).toEqual({ host: "smtpout.secureserver.net", port: 465, security: "ssl" });
    expect(smtpPresetFor("zoho")).toEqual({ host: "smtp.zoho.com", port: 465, security: "ssl" });
  });
  it("substitutes a valid region for SES and refuses a bad or missing one", () => {
    expect(smtpPresetFor("ses", "eu-west-1")).toEqual({ host: "email-smtp.eu-west-1.amazonaws.com", port: 587, security: "starttls" });
    for (const r of [undefined, "", "x", "us-east-1.evil.com", "us-east-1/../x", "US-EAST-1"]) {
      expect(smtpPresetFor("ses", r as string)).toBeNull();
    }
  });
  it("ignores a region for other presets", () => {
    expect(smtpPresetFor("gmail", "us-east-1")?.host).toBe("smtp.gmail.com");
  });
  it("uses own properties only", () => {
    for (const id of ["__proto__", "constructor", "toString", "hasOwnProperty", "nope"]) {
      expect(smtpPresetFor(id)).toBeNull();
    }
  });
});
