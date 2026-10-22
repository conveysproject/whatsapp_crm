import { describe, expect, it, vi } from "vitest";
import { createElement as h, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AcceptInvitation } from "./AcceptInvitation";
import { ClientAcceptView } from "@/components/parent/ClientAcceptView";
import AcceptClientInvitationPage from "@/app/client-invitations/[token]/accept/page";
import { DEFAULT_PALETTE } from "@/lib/brand";
import { FULL_READ_ACCESS_SENTENCE } from "@/lib/parent-orgs";
import { brandOf, HOSTILE_NAME, inBrand } from "@/lib/brand-test-fixtures";

const signedIn = vi.hoisted(() => ({ value: false }));
vi.mock("next/navigation", () => ({ useParams: () => ({ token: "tok-1" }) }));
vi.mock("next/link", () => ({ default: ({ children, href }: { children: ReactNode; href: string }) => h("a", { href }, children) }));
vi.mock("@/lib/auth/client", () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: signedIn.value, getToken: async () => "tok" }),
}));

const apiBrand = (over: Record<string, unknown> = {}) => ({
  name: "Acme Cloud",
  logoUrl: "https://cdn.test/acme/logo.png",
  smallLogoUrl: null,
  faviconUrl: null,
  darkLogoUrl: null,
  darkSmallLogoUrl: null,
  darkFaviconUrl: null,
  primaryColor: "#0055ff",
  palette: DEFAULT_PALETTE,
  supportEmail: null,
  hidePoweredBy: false,
  slug: "acme",
  isDefault: false,
  ...over,
});

describe("team invite page", () => {
  it("shows a neutral skeleton until the preview arrives (no logo, no product name)", () => {
    for (const isSignedIn of [false, true]) {
      signedIn.value = isSignedIn;
      const out = renderToStaticMarkup(h(AcceptInvitation, { token: "tok-1" }));
      expect(out).toContain('aria-busy="true"');
      expect(out.toLowerCase()).not.toContain("wbmsg");
      expect(out).not.toContain("<img");
      expect(out).not.toContain("<form");
    }
  });

  it("renders the inviter's brand: logo, brand name in the text, brand accent classes, brand colors", () => {
    signedIn.value = false;
    const out = renderToStaticMarkup(h(AcceptInvitation, { token: "tok-1", initialMeta: { email: "a@b.com", role: "agent", brand: apiBrand() } }));
    expect(out).toContain("Create your account to join your team on Acme Cloud.");
    expect(out).toContain('src="https://cdn.test/acme/logo.png"');
    expect(out).toContain("--color-brand:#0055ff");
    expect(out).toContain("bg-brand-600");
    expect(out.toLowerCase()).not.toContain("wbmsg");
    expect(out).not.toContain("green-");
  });

  it("signed-in variant is branded too", () => {
    signedIn.value = true;
    const out = renderToStaticMarkup(h(AcceptInvitation, { token: "tok-1", initialMeta: { email: "a@b.com", role: "agent", brand: apiBrand() } }));
    expect(out).toContain('src="https://cdn.test/acme/logo.png"');
    expect(out.toLowerCase()).not.toContain("wbmsg");
  });

  it("sign-in links go to the brand's own route with the redirect_url, or /sign-in without a slug", () => {
    signedIn.value = false;
    const redirect = encodeURIComponent("/invitations/tok-1/accept");
    const branded = renderToStaticMarkup(h(AcceptInvitation, { token: "tok-1", initialMeta: { email: "a@b.com", role: "agent", brand: apiBrand() } }));
    expect(branded).toContain(`href="/c/acme/sign-in?redirect_url=${redirect}"`);
    expect(branded).not.toContain('href="/sign-in?');
    const noSlug = renderToStaticMarkup(h(AcceptInvitation, { token: "tok-1", initialMeta: { email: "a@b.com", role: "agent", brand: apiBrand({ slug: null }) } }));
    expect(noSlug).toContain(`href="/sign-in?redirect_url=${redirect}"`);
    const dflt = renderToStaticMarkup(h(AcceptInvitation, { token: "tok-1", initialMeta: { email: "a@b.com", role: "agent" } }));
    expect(dflt).toContain(`href="/sign-in?redirect_url=${redirect}"`);
  });

  it("default brand, missing brand and malformed brand all keep today's text", () => {
    signedIn.value = false;
    for (const brand of [undefined, apiBrand({ isDefault: true }), { name: 5 }, "junk"]) {
      const out = renderToStaticMarkup(h(AcceptInvitation, { token: "tok-1", initialMeta: { email: "a@b.com", role: "agent", brand } }));
      expect(out).toContain("Create your account to join your team on WBMSG.");
      expect(out).not.toContain("<style");
      expect(out).not.toContain("<img");
    }
  });

  it("escapes a brand name with markup-significant characters", () => {
    signedIn.value = false;
    const out = renderToStaticMarkup(
      h(AcceptInvitation, { token: "tok-1", initialMeta: { email: "a@b.com", role: "agent", brand: apiBrand({ name: "Tom & \"Jerry\" Co", logoUrl: null }) } }),
    );
    expect(out).toContain("Tom &amp; &quot;Jerry&quot; Co");
    expect(out).not.toContain("Tom & \"Jerry\"");
  });
});

describe("client invite page", () => {
  const meta = { parentName: "Acme Agency", email: "client@example.com", accountExists: false };
  const props = { meta, busy: false, error: null, redirectPath: "/client-invitations/t/accept", onSubmit: () => undefined, onCreateAccount: () => undefined };

  it("shows a neutral loading state until the preview arrives (no logo, no product name)", () => {
    const out = renderToStaticMarkup(h(AcceptClientInvitationPage));
    expect(out).toContain("Loading invitation...");
    expect(out.toLowerCase()).not.toContain("wbmsg");
    expect(out).not.toContain("<img");
  });

  it("uses the brand name in the heading and shows its logo, in every mode, and keeps the full-read-access sentence", () => {
    for (const mode of ["signedIn", "newAccount", "signIn"] as const) {
      const out = renderToStaticMarkup(inBrand(brandOf({ logoUrl: "https://cdn.test/acme/logo.png" }), h(ClientAcceptView, { ...props, mode })));
      expect(out, mode).toContain("Acme Agency invited you to Acme Cloud");
      expect(out, mode).toContain('src="https://cdn.test/acme/logo.png"');
      expect(out, mode).toContain(FULL_READ_ACCESS_SENTENCE.replace(/'/g, "&#x27;"));
      expect(out.toLowerCase(), mode).not.toContain("wbmsg");
      expect(out, mode).not.toContain("green-");
    }
  });

  it("sign-in links use /c/<slug>/sign-in for a brand with a slug and /sign-in otherwise", () => {
    const next = encodeURIComponent(props.redirectPath);
    for (const mode of ["newAccount", "signIn"] as const) {
      const branded = renderToStaticMarkup(inBrand(brandOf({ slug: "acme" }), h(ClientAcceptView, { ...props, mode })));
      expect(branded, mode).toContain(`href="/c/acme/sign-in?redirect_url=${next}"`);
      const noSlug = renderToStaticMarkup(inBrand(brandOf({ slug: null }), h(ClientAcceptView, { ...props, mode })));
      expect(noSlug, mode).toContain(`href="/sign-in?redirect_url=${next}"`);
      const dflt = renderToStaticMarkup(h(ClientAcceptView, { ...props, mode }));
      expect(dflt, mode).toContain(`href="/sign-in?redirect_url=${next}"`);
    }
  });

  it("the default brand keeps 'invited you to WBMSG' and the green classes", () => {
    const out = renderToStaticMarkup(h(ClientAcceptView, { ...props, mode: "newAccount" }));
    expect(out).toContain("Acme Agency invited you to WBMSG");
    expect(out).toContain("bg-green-600");
    expect(out).not.toContain("<img");
  });

  it("escapes a hostile brand name", () => {
    const out = renderToStaticMarkup(inBrand(brandOf({ name: HOSTILE_NAME, logoUrl: null }), h(ClientAcceptView, { ...props, mode: "signIn" })));
    expect(out).not.toContain("<img src=x");
    expect(out).toContain("&lt;img src=x");
  });
});
