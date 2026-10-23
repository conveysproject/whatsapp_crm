import { describe, it, expect } from "vitest";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BrandingSettingsView, type BrandingSettingsViewProps } from "./BrandingSettingsView";
import { BrandPreview } from "./BrandPreview";
import { BrandImageSlot } from "./BrandImageSlot";
import { BrandForm } from "./BrandForm";
import { BRAND_SLOTS, REAPPROVAL_WARNING, formFromSettings, previewBrand, type BrandSettings } from "@/lib/brand-settings";
import { confirmReducer, runConfirmed } from "@/lib/parent-orgs";

const noop = () => undefined;
const settings = (over: Partial<BrandSettings> = {}): BrandSettings => ({
  name: "Acme", color: "#3366cc", supportEmail: "help@acme.test", slug: "acme", hidePoweredBy: false,
  whiteLabelEnabled: false, brandRevision: 3,
  logoUrl: "https://cdn.test/brand/logo.png", smallLogoUrl: null, faviconUrl: null, darkLogoUrl: null, darkSmallLogoUrl: null, darkFaviconUrl: null,
  ...over,
});

function view(over: Partial<BrandingSettingsViewProps> = {}, s: BrandSettings = settings()) {
  return renderToStaticMarkup(
    h(BrandingSettingsView, {
      settings: s, values: formFromSettings(s), errors: {}, formError: null, saving: false, reapprovalRequired: false,
      origin: "https://app.example", slotState: {}, removeSlot: null, removeState: "idle", removeError: null,
      onChange: noop, onSave: noop, onFile: noop, onRequestRemove: noop, onCancelRemove: noop, onConfirmRemove: noop,
      ...over,
    }),
  );
}

describe("Branding page states", () => {
  it("pending: explains a super admin must approve, and View as client is disabled with the reason", () => {
    const html = view();
    expect(html).toContain('data-status="pending"');
    expect(html).toContain("A super admin must approve your brand");
    expect(html).toMatch(/<button type="button" disabled=""[^>]*>View as client<\/button>/);
    expect(html).toContain("Available once your brand is approved.");
    expect(html).not.toContain("/c/acme/sign-in\" target");
  });
  it("live: shows Live and View as client opens /c/<slug>/sign-in in a new tab", () => {
    const html = view({}, settings({ whiteLabelEnabled: true }));
    expect(html).toContain('data-status="live"');
    expect(html).toContain('href="/c/acme/sign-in"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
  });
  it("re-approval warning appears after a change switched the brand off", () => {
    const html = view({ reapprovalRequired: true });
    expect(html).toContain('data-status="reapproval"');
    expect(html).toContain(REAPPROVAL_WARNING.replace(/'/g, "&#x27;"));
  });
  it("shows the resulting sign-in address using the page origin", () => {
    expect(view()).toContain("https://app.example/c/acme/sign-in");
  });
  it("has the six slots, the dark ones inside a collapsed details", () => {
    const html = view();
    for (const s of BRAND_SLOTS) expect(html).toContain(`data-slot="${s.slot}"`);
    const details = html.slice(html.indexOf("<details"));
    expect(details.startsWith('<details class="')).toBe(true);
    expect(html).not.toContain("<details open");
    expect(details).toContain('data-slot="darkLogo"');
    expect(html.slice(0, html.indexOf("<details"))).not.toContain('data-slot="darkLogo"');
  });
  it("disables Save while saving", () => {
    expect(view({ saving: true })).toMatch(/disabled=""[^>]*>Saving\.\.\.<\/button>/);
  });
  it("shows field errors from the server next to their field", () => {
    const html = view({ errors: { slug: "That web address is already taken. Choose another one." } });
    expect(html).toContain("already taken");
    expect(html).toContain('aria-invalid="true"');
  });
  it("renders no ids, tokens or revision numbers", () => {
    const html = view();
    expect(html).not.toMatch(/brandRevision|revision|token|organizationId|cuid/i);
  });
});

describe("Image slot", () => {
  const logo = BRAND_SLOTS.find((s) => s.slot === "logo")!;
  const favicon = BRAND_SLOTS.find((s) => s.slot === "favicon")!;
  const render = (def: typeof logo, url: string | null, extra: { busy?: boolean; error?: string | null } = {}) =>
    renderToStaticMarkup(h(BrandImageSlot, { def, url, busy: false, error: null, onFile: noop, onRemove: noop, ...extra }));
  it("previews only the URL it was given, and offers Remove when there is an image", () => {
    const html = render(logo, "https://cdn.test/brand/logo.png");
    expect(html).toContain('<img src="https://cdn.test/brand/logo.png"');
    expect(html).toContain("Remove");
    expect(html).toContain("Replace");
  });
  it("without an image: Upload and no Remove", () => {
    const html = render(logo, null);
    expect(html).toContain("Upload");
    expect(html).not.toContain("Remove");
    expect(html).not.toContain("<img");
  });
  it("accept matches the API; ico only on favicon slots", () => {
    expect(render(logo, null)).toContain('accept="image/png,image/jpeg,image/webp"');
    expect(render(favicon, null)).toContain(".ico");
  });
  it("is disabled while uploading and shows a readable error", () => {
    const html = render(logo, null, { busy: true, error: "That file is too large." });
    expect(html).toContain("Uploading...");
    expect(html).toContain('disabled=""');
    expect(html).toContain("That file is too large.");
  });
});

describe("Remove confirmation", () => {
  it("shows the dialog only for the slot waiting for confirmation", () => {
    expect(view()).not.toContain('role="dialog"');
    const html = view({ removeSlot: "logo", removeState: "confirming" });
    expect(html).toContain('role="dialog"');
    expect(html).toContain("Remove logo?");
  });
  it("warns that a live brand is switched off", () => {
    const html = view({ removeSlot: "logo", removeState: "confirming" }, settings({ whiteLabelEnabled: true }));
    expect(html).toContain("switched off until a super admin approves it again");
  });
  it("the remove action never runs without a prior request", async () => {
    let calls = 0;
    expect(await runConfirmed("idle", async () => { calls++; })).toBe(false);
    expect(calls).toBe(0);
    expect(await runConfirmed(confirmReducer("idle", "request"), async () => { calls++; })).toBe(true);
    expect(calls).toBe(1);
  });
});

describe("Preview", () => {
  const values = { name: "Acme", color: "#3366cc", supportEmail: "", slug: "acme", hidePoweredBy: false };
  const html = renderToStaticMarkup(h(BrandPreview, { brand: previewBrand(values, settings()) }));
  it("scopes the brand colors as inline CSS variables on its own container", () => {
    expect(html).toContain('data-testid="brand-preview"');
    expect(html).toContain("--brand-600:45 90 180");
    expect(html).toContain("--color-brand:#3366cc");
  });
  it("adds no <style> element and never targets :root", () => {
    expect(html).not.toContain("<style");
    expect(html).not.toContain(":root");
  });
  it("shows the brand name and the stored logo", () => {
    expect(html).toContain("Welcome to Acme");
    expect(html).toContain('src="https://cdn.test/brand/logo.png"');
  });
  it("follows the form values, not the stored ones", () => {
    const other = renderToStaticMarkup(h(BrandPreview, { brand: previewBrand({ ...values, name: "Zed", color: "#e11d48" }, settings()) }));
    expect(other).toContain("Welcome to Zed");
    expect(other).toContain("--brand-500:225 29 72");
  });
});

describe("BrandForm", () => {
  const s = settings();
  const render = (over = {}) =>
    renderToStaticMarkup(h(BrandForm, { values: formFromSettings(s), errors: {}, formError: null, saving: false, origin: null, onChange: noop, onSubmit: noop, ...over }));
  it("says the support email is shown to clients", () => {
    expect(render()).toContain("Shown to your clients");
  });
  it("keeps the color picker and hex field in sync from the same value", () => {
    const html = render();
    expect(html).toContain('type="color"');
    expect(html.match(/#3366cc/g)!.length).toBeGreaterThanOrEqual(2);
  });
  it("has the Hide powered-by checkbox and a Save button", () => {
    const html = render();
    expect(html).toContain("Hide &#x27;Powered by");
    expect(html).toContain(">Save</button>");
  });
  it("falls back to a relative address while the origin is unknown", () => {
    expect(render()).toContain(">/c/acme/sign-in<");
  });
});

describe("Background refresh failure and locking", () => {
  it("keeps the form and shows a small notice when a refresh failed", () => {
    const html = view({ refreshFailed: true });
    expect(html).toContain("Could not refresh");
    expect(html).toContain('id="brand-name"');
    expect(view()).not.toContain("Could not refresh");
  });
  it("disables upload, remove and save while another action runs", () => {
    const html = view({ locked: true }, settings({ logoUrl: "https://cdn.example/l.png" }));
    expect(html).not.toMatch(/<button type="submit"(?![^>]*disabled)/);
    expect(html).toMatch(/aria-label="Upload Logo"[^>]*/);
    expect(html.match(/disabled=""/g)!.length).toBeGreaterThanOrEqual(8);
  });
});
