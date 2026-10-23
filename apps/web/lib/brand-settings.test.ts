import { describe, it, expect } from "vitest";
import {
  BRAND_SLOTS, HIDE_POWERED_BY_LABEL, bannerState, clientSignInUrl, formFromSettings, mapBrandError, BrandApiError,
  brandPreviewStyle, clearFieldErrors, isBrandBusy, startConfirm, finishConfirm, preCheckFile, previewBrand, validateBrandForm, validateColor, validateEmail, validateName, validateSlugInput, viewAsClient,
  type BrandSettings,
} from "./brand-settings";

const settings = (over: Partial<BrandSettings> = {}): BrandSettings => ({
  name: "Acme", color: "#3366cc", supportEmail: "help@acme.test", slug: "acme", hidePoweredBy: false,
  whiteLabelEnabled: false, brandRevision: 3,
  logoUrl: null, smallLogoUrl: null, faviconUrl: null, darkLogoUrl: null, darkSmallLogoUrl: null, darkFaviconUrl: null,
  ...over,
});

describe("field validation", () => {
  it("color must be #RRGGBB", () => {
    expect(validateColor("#3366cc")).toBeNull();
    expect(validateColor("#3366CC")).toBeNull();
    for (const bad of ["", "3366cc", "#36c", "#33666g", "red"]) expect(validateColor(bad)).toMatch(/#1a2b3c|#RRGGBB|color/i);
  });
  it("slug is lowercase letters, digits and single hyphens, 3 to 40", () => {
    expect(validateSlugInput("acme-co")).toBeNull();
    for (const bad of ["", "ab", "Acme", "-acme", "acme-", "ac--me", "ac me", "a".repeat(41), "acme_co"]) expect(validateSlugInput(bad)).not.toBeNull();
  });
  it("name is 2 to 40 characters without < >", () => {
    expect(validateName("Acme")).toBeNull();
    expect(validateName("A")).not.toBeNull();
    expect(validateName("x".repeat(41))).not.toBeNull();
    expect(validateName("<b>x</b>")).not.toBeNull();
    expect(validateName("   ")).not.toBeNull();
  });
  it("support email is optional but must be a plain address", () => {
    expect(validateEmail("")).toBeNull();
    expect(validateEmail("help@acme.test")).toBeNull();
    for (const bad of ["help", "a b@c.de", "a@b", "Name <a@b.co>", "a@b.co,c@d.ef"]) expect(validateEmail(bad)).not.toBeNull();
  });
  it("validateBrandForm collects one message per bad field", () => {
    const errs = validateBrandForm({ name: "A", color: "zz", supportEmail: "x", slug: "A", hidePoweredBy: false });
    expect(Object.keys(errs).sort()).toEqual(["color", "name", "slug", "supportEmail"]);
    expect(validateBrandForm(formFromSettings(settings()))).toEqual({});
  });
});

describe("error mapping", () => {
  it("maps VALIDATION_FAILED to its field and keeps the server message", () => {
    expect(mapBrandError(new BrandApiError(400, "VALIDATION_FAILED", "Color must look like #1a2b3c", "color"))).toEqual({ field: "color", message: "Color must look like #1a2b3c" });
  });
  it("maps SLUG_TAKEN to the slug field", () => {
    const m = mapBrandError(new BrandApiError(409, "SLUG_TAKEN", "x"));
    expect(m.field).toBe("slug");
    expect(m.message).toMatch(/already taken/i);
  });
  it("maps upload errors to readable text", () => {
    expect(mapBrandError(new BrandApiError(413, "FILE_TOO_LARGE", "x")).message).toMatch(/too large/i);
    expect(mapBrandError(new BrandApiError(415, "UNSUPPORTED_TYPE", "Use a PNG")).message).toMatch(/PNG/);
    expect(mapBrandError(new BrandApiError(503, "UPLOADS_UNAVAILABLE", "x")).message).toMatch(/not available/i);
    expect(mapBrandError(new BrandApiError(403, "FORBIDDEN", "x")).message).toMatch(/permission|not available/i);
  });
  it("falls back to a generic message and never echoes unknown errors", () => {
    expect(mapBrandError(new Error("boom token=abc")).message).toBe("Something went wrong. Please try again.");
  });
});

describe("file pre-check", () => {
  const file = (name: string, type: string, size: number) => ({ name, type, size });
  it("accepts png, jpeg, webp within 1 MB for logo slots", () => {
    for (const t of ["image/png", "image/jpeg", "image/webp"]) expect(preCheckFile("logo", file("a", t, 1024 * 1024))).toBeNull();
  });
  it("rejects logo files over 1 MB and favicon files over 256 KB", () => {
    expect(preCheckFile("logo", file("a.png", "image/png", 1024 * 1024 + 1))).toMatch(/1 MB/);
    expect(preCheckFile("favicon", file("a.png", "image/png", 256 * 1024 + 1))).toMatch(/256 KB/);
    expect(preCheckFile("darkFavicon", file("a.png", "image/png", 256 * 1024))).toBeNull();
  });
  it("rejects other types, and ico outside favicon slots", () => {
    expect(preCheckFile("logo", file("a.gif", "image/gif", 10))).toMatch(/PNG, JPEG or WebP/);
    expect(preCheckFile("logo", file("a.svg", "image/svg+xml", 10))).not.toBeNull();
    expect(preCheckFile("smallLogo", file("a.ico", "image/x-icon", 10))).not.toBeNull();
    expect(preCheckFile("favicon", file("a.ico", "image/x-icon", 10))).toBeNull();
    expect(preCheckFile("darkFavicon", file("a.ico", "image/vnd.microsoft.icon", 10))).toBeNull();
    expect(preCheckFile("favicon", file("a.ico", "", 10))).toBeNull();
  });
  it("rejects empty files", () => {
    expect(preCheckFile("logo", file("a.png", "image/png", 0))).not.toBeNull();
  });
  it("accept strings match the API", () => {
    expect(BRAND_SLOTS.find((s) => s.slot === "logo")!.accept).toBe("image/png,image/jpeg,image/webp");
    expect(BRAND_SLOTS.find((s) => s.slot === "favicon")!.accept).toContain(".ico");
    expect(BRAND_SLOTS).toHaveLength(6);
  });
});

describe("status and view as client", () => {
  it("banner: reapproval warning wins, then live, then pending", () => {
    expect(bannerState(settings(), true)).toBe("reapproval");
    expect(bannerState(settings({ whiteLabelEnabled: true }), false)).toBe("live");
    expect(bannerState(settings(), false)).toBe("pending");
  });
  it("view as client needs approval and a slug", () => {
    expect(viewAsClient(settings({ whiteLabelEnabled: true })).href).toBe("/c/acme/sign-in");
    const pending = viewAsClient(settings());
    expect(pending.href).toBeNull();
    expect(pending.reason).toMatch(/approved/i);
    expect(viewAsClient(settings({ whiteLabelEnabled: true, slug: null })).href).toBeNull();
  });
  it("sign-in address uses the origin when known and stays relative otherwise", () => {
    expect(clientSignInUrl("https://app.example", "acme")).toBe("https://app.example/c/acme/sign-in");
    expect(clientSignInUrl(null, "acme")).toBe("/c/acme/sign-in");
    expect(clientSignInUrl("https://app.example", "")).toBeNull();
  });
  it("the powered-by label names the product", () => {
    expect(HIDE_POWERED_BY_LABEL).toMatch(/^Hide 'Powered by .+'$/);
  });
  it("shows a placeholder when the typed slug would fail the API format check", () => {
    for (const bad of ["Acme", "-acme", "acme-", "a--b", "ab", "a".repeat(41), "ac me", "acme/../x", "a_b"]) {
      expect(clientSignInUrl("https://app.example", bad)).toBe("https://app.example/c/<your-address>/sign-in");
    }
    expect(clientSignInUrl("https://app.example", "a-b-c")).toBe("https://app.example/c/a-b-c/sign-in");
  });
});

describe("page helpers", () => {
  it("isBrandBusy is true while saving, uploading or removing", () => {
    expect(isBrandBusy({ saving: false, slotState: {}, removeState: "idle" })).toBe(false);
    expect(isBrandBusy({ saving: false, slotState: { logo: { busy: false, error: "x" } }, removeState: "confirming" })).toBe(false);
    expect(isBrandBusy({ saving: true, slotState: {}, removeState: "idle" })).toBe(true);
    expect(isBrandBusy({ saving: false, slotState: { favicon: { busy: true, error: null } }, removeState: "idle" })).toBe(true);
    expect(isBrandBusy({ saving: false, slotState: {}, removeState: "running" })).toBe(true);
  });
  it("clearFieldErrors clears only the edited field", () => {
    const e = { name: "a", slug: "b", color: "c" };
    expect(clearFieldErrors(e, { slug: "x" })).toEqual({ name: "a", color: "c" });
    expect(clearFieldErrors(e, {})).toEqual(e);
  });
  it("a repeated confirm click never restarts or re-runs the action", () => {
    expect(startConfirm("confirming")).toEqual({ proceed: true, next: "running" });
    expect(startConfirm("running")).toEqual({ proceed: false, next: "running" });
    expect(startConfirm("idle")).toEqual({ proceed: false, next: "idle" });
    expect(finishConfirm(true)).toBe("idle");
    expect(finishConfirm(false)).toBe("confirming");
  });
});

describe("previewBrand", () => {
  const values = { name: "Acme", color: "#3366cc", supportEmail: "", slug: "acme", hidePoweredBy: false };
  it("builds a non-default brand from the current form values with a derived palette", () => {
    const b = previewBrand(values, settings({ logoUrl: "https://cdn.test/logo.png" }));
    expect(b.isDefault).toBe(false);
    expect(b.name).toBe("Acme");
    expect(b.logoUrl).toBe("https://cdn.test/logo.png");
    expect(b.palette[700]).toBe("#264b97");
  });
  it("keeps a valid palette while the color is half typed", () => {
    const b = previewBrand({ ...values, color: "#33" }, settings());
    expect(b.primaryColor).toBe("#3366cc");
  });
  it("shows a placeholder name when the name is empty", () => {
    expect(previewBrand({ ...values, name: "  " }, settings()).name).toBe("Your brand");
  });
});

describe("brandPreviewStyle", () => {
  it("returns brand variables as decimal channels and no :root rule", () => {
    const style = brandPreviewStyle(previewBrand({ name: "Acme", color: "#3366cc", supportEmail: "", slug: "acme", hidePoweredBy: false }, settings()));
    expect(style["--brand-500"]).toBe("51 102 204");
    expect(style["--brand-700"]).toBe("38 75 151");
    expect(style["--color-brand"]).toBe("#3366cc");
    expect(Object.keys(style).every((k) => k.startsWith("--"))).toBe(true);
  });
});
