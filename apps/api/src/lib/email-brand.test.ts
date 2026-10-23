import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { DEFAULT_BRAND, type Brand } from "./brand.js";
import { activeBrand, brandedShell, brandForAccountEmail, brandForOrg, brandMailExtras, escapeHtml, subjectText } from "./email-brand.js";

const LOGO = "https://cdn.example.com/brand/logo.png";
const brand = (over: Partial<Brand> = {}): Brand => ({
  ...DEFAULT_BRAND,
  name: "Acme Msgs",
  supportEmail: "help@acme.test",
  isDefault: false,
  ...over,
});

beforeEach(() => {
  vi.stubEnv("R2_PUBLIC_URL", "https://cdn.example.com");
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("activeBrand / brandMailExtras / subjectText", () => {
  it("treats missing and default brands as not branded", () => {
    expect(activeBrand(undefined)).toBeUndefined();
    expect(activeBrand(DEFAULT_BRAND)).toBeUndefined();
    expect(activeBrand(brand())).toBeDefined();
    expect(brandMailExtras(undefined)).toEqual({});
    expect(brandMailExtras(DEFAULT_BRAND)).toEqual({});
  });
  it("gives fromName and replyTo only when a brand applies", () => {
    expect(brandMailExtras(brand())).toEqual({ fromName: "Acme Msgs", replyTo: "help@acme.test" });
    expect(brandMailExtras(brand({ supportEmail: null }))).toEqual({ fromName: "Acme Msgs" });
  });
  it("strips CR, LF and angle brackets from subject text", () => {
    expect(subjectText("Evil\r\nBcc: x@y.z<b>")).toBe("Evil Bcc: x@y.zb");
  });
});

describe("brandedShell", () => {
  it("shows an allowed logo as an img, escaped", () => {
    const html = brandedShell(brand({ logoUrl: LOGO }), "<p>hi</p>");
    expect(html).toContain(`<img src="${LOGO}"`);
    expect(html).toContain('alt="Acme Msgs"');
    expect(html).toContain("<p>hi</p>");
  });
  it("falls back to a text wordmark for a non-allowed logo url", () => {
    const html = brandedShell(brand({ logoUrl: "https://evil.example/x.png" }), "<p>hi</p>");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("evil.example");
    expect(html).toContain("Acme Msgs");
  });
  it("escapes the name and logo url", () => {
    const html = brandedShell(brand({ name: '"><script>x</script>', logoUrl: `${LOGO}?a="><script>` }), "<p>hi</p>");
    expect(html).not.toContain("<script>");
  });
  it("escapes a hostile name when there is no logo", () => {
    const html = brandedShell(brand({ name: '"><script>x</script>' }), "<p>hi</p>");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
  it("footer has name, support mailto and powered-by, but no wbmsg.com", () => {
    const html = brandedShell(brand(), "<p>hi</p>");
    expect(html).toContain('href="mailto:help@acme.test"');
    expect(html).toContain("Powered by WBMSG");
    expect(html).not.toContain("wbmsg.com");
  });
  it("omits powered-by when hidden, leaving no WBMSG at all", () => {
    const html = brandedShell(brand({ hidePoweredBy: true }), "<p>hi</p>");
    expect(html).not.toContain("WBMSG");
    expect(html).not.toContain("wbmsg");
  });
  it("omits the mailto without a support email", () => {
    expect(brandedShell(brand({ supportEmail: null }), "<p>x</p>")).not.toContain("mailto:");
  });
});

describe("escapeHtml", () => {
  it("escapes & < > and double quotes", () => {
    expect(escapeHtml(`&<>"`)).toBe("&amp;&lt;&gt;&quot;");
  });
});

describe("brandForOrg / brandForAccountEmail", () => {
  const orgRow = {
    isParent: true,
    whiteLabelEnabled: true,
    brandName: "Acme Msgs",
    brandColor: "#112233",
    brandSupportEmail: "help@acme.test",
    brandHidePoweredBy: false,
    slug: "acme",
    logoImage: null,
    smallLogoImage: null,
    favicon: null,
    darkLogoImage: null,
    darkSmallLogoImage: null,
    darkFavicon: null,
    parentOrganization: null,
  };
  const make = (over: { account?: unknown; user?: unknown; org?: unknown; throws?: boolean } = {}) => {
    const authAccount = { findUnique: vi.fn().mockResolvedValue("account" in over ? over.account : { id: "u1" }) };
    const user = { findUnique: vi.fn().mockResolvedValue("user" in over ? over.user : { organizationId: "o1" }) };
    const organization = { findUnique: vi.fn().mockResolvedValue("org" in over ? over.org : orgRow) };
    if (over.throws) authAccount.findUnique.mockRejectedValue(new Error("db down"));
    return { prisma: { authAccount, user, organization } as unknown as PrismaClient, authAccount, user, organization };
  };

  it("brandForOrg resolves the org brand", async () => {
    expect((await brandForOrg(make().prisma, "o1")).name).toBe("Acme Msgs");
  });
  it("finds the brand through account then user then org, with a normalized email", async () => {
    const m = make();
    const b = await brandForAccountEmail(m.prisma, "  Person@Example.COM ");
    expect(b.name).toBe("Acme Msgs");
    expect(m.authAccount.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { email: "person@example.com" } }));
    expect(m.user.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "u1" } }));
  });
  it("returns the default for an unknown email, a user without org, or a missing org/parent", async () => {
    expect(await brandForAccountEmail(make({ account: null }).prisma, "x@y.z")).toBe(DEFAULT_BRAND);
    expect(await brandForAccountEmail(make({ user: null }).prisma, "x@y.z")).toBe(DEFAULT_BRAND);
    expect(await brandForAccountEmail(make({ user: { organizationId: null } }).prisma, "x@y.z")).toBe(DEFAULT_BRAND);
    expect(await brandForAccountEmail(make({ org: null }).prisma, "x@y.z")).toEqual(DEFAULT_BRAND);
    expect(
      await brandForAccountEmail(make({ org: { ...orgRow, isParent: false, parentOrganization: null } }).prisma, "x@y.z"),
    ).toEqual(DEFAULT_BRAND);
  });
  it("never throws", async () => {
    expect(await brandForAccountEmail(make({ throws: true }).prisma, "x@y.z")).toBe(DEFAULT_BRAND);
    expect(await brandForAccountEmail(make().prisma, 42 as unknown as string)).toBe(DEFAULT_BRAND);
  });
});
