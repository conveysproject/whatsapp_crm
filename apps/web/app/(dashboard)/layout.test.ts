import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createElement as h, isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/lib/auth/server", () => ({
  auth: Object.assign(async () => ({ userId: "u1", getToken: async () => "tok" }), {
    protect: async () => ({ userId: "u1", getToken: async () => "tok" }),
  }),
}));
vi.mock("@/lib/server-api", () => ({
  getImpersonationCookie: async () => impCookie,
  serverApiHeaders: async (t: string) => ({ Authorization: `Bearer ${t}`, ...(impCookie ? { "X-Impersonate-Token": impCookie } : {}) }),
}));
vi.mock("next/navigation", () => ({ redirect: (to: string) => { throw new Error(`redirect:${to}`); } }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("sonner", () => ({ Toaster: () => null }));
vi.mock("@/app/(dashboard)/onboarding-context", () => ({ OnboardingProvider: ({ children }: { children: ReactNode }) => children }));
vi.mock("@/components/layout/Sidebar", () => ({ Sidebar: () => null }));
vi.mock("@/components/layout/RoleRouteGuard", () => ({ RoleRouteGuard: () => null }));
vi.mock("@/components/layout/TopBar", () => ({ TopBar: () => null }));
vi.mock("@/components/SetupBanner", () => ({ SetupBanner: () => null }));
vi.mock("@/components/billing/BillingStandingBanner", () => ({ BillingStandingBanner: () => null }));
vi.mock("@/components/ImpersonationBanner", () => ({ ImpersonationBanner: () => null }));
vi.mock("@/components/ImpersonationProvider", () => ({ ImpersonationProvider: () => null }));
vi.mock("@/components/layout/BreadcrumbNav", () => ({ BreadcrumbNav: () => null }));

let impCookie: string | null = null;

const branded = {
  name: "Acme Cloud",
  logoUrl: null, smallLogoUrl: null, faviconUrl: "https://cdn.example.com/f.ico", darkLogoUrl: null, darkSmallLogoUrl: null, darkFaviconUrl: null,
  primaryColor: "#1a2b3c",
  palette: { 50: "#e8eaec", 100: "#d1d5d8", 200: "#a3aab0", 300: "#6a7a85", 400: "#3a4a58", 500: "#1a2b3c", 600: "#17263a", 700: "#142233", 800: "#10202d", 900: "#0c1a24" },
  supportEmail: null, hidePoweredBy: false, slug: "acme-cloud", isDefault: false,
};

function stubApi(brandRes: () => Response | Promise<Response>): ReturnType<typeof vi.fn> {
  const fn = vi.fn(async (url: string) => {
    if (url.endsWith("/v1/brand")) return brandRes();
    if (url.endsWith("/v1/organizations/me")) return new Response(JSON.stringify({ data: { name: "Org" } }), { status: 200 });
    if (url.endsWith("/v1/onboarding/status")) return new Response(JSON.stringify({ wabaConnected: true, numberProvisioned: true }), { status: 200 });
    return new Response("{}", { status: 404 });
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

const BRAND_KEY = "BrandProvider";
function children(el: ReactElement): ReactNode[] {
  return ([] as ReactNode[]).concat((el.props as { children?: ReactNode }).children ?? []);
}

beforeEach(() => { impCookie = null; vi.spyOn(console, "error").mockImplementation(() => undefined); });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("dashboard layout brand", () => {
  it("renders no <style> for the default brand", async () => {
    stubApi(() => new Response(JSON.stringify({ data: { ...branded, name: "WBMSG", isDefault: true } }), { status: 200 }));
    const { default: Layout } = await import("./layout");
    const root = (await Layout({ children: h("p", null, "x") })) as ReactElement;
    expect((root.type as { name: string }).name).toBe(BRAND_KEY);
    expect(children(root).some((c) => isValidElement(c) && c.type === "style")).toBe(false);
    expect(renderToStaticMarkup(root)).not.toContain("<style");
  });

  it("renders the brand variables as the first child for a branded org", async () => {
    stubApi(() => new Response(JSON.stringify({ data: branded }), { status: 200 }));
    const { default: Layout } = await import("./layout");
    const root = (await Layout({ children: h("p", null, "x") })) as ReactElement;
    const first = children(root)[0] as ReactElement;
    expect(first.type).toBe("style");
    const css = (first.props as { dangerouslySetInnerHTML: { __html: string } }).dangerouslySetInnerHTML.__html;
    expect(css).toContain("--brand-500:26 43 60;");
    expect((root.props as { brand: { name: string } }).brand.name).toBe("Acme Cloud");
  });

  it("falls back to the default brand (no style, page still renders) when the brand call fails", async () => {
    stubApi(() => new Response("boom", { status: 500 }));
    const { default: Layout } = await import("./layout");
    const root = (await Layout({ children: h("p", null, "x") })) as ReactElement;
    expect(renderToStaticMarkup(root)).not.toContain("<style");
  });

  it("asks for the brand with the impersonation header so an impersonating admin sees the target org's brand", async () => {
    impCookie = "imp-123";
    const fetchMock = stubApi(() => new Response(JSON.stringify({ data: branded }), { status: 200 }));
    const { default: Layout } = await import("./layout");
    await Layout({ children: null });
    const call = fetchMock.mock.calls.find((c) => String(c[0]).endsWith("/v1/brand"))!;
    expect((call[1] as RequestInit).headers).toMatchObject({ Authorization: "Bearer tok", "X-Impersonate-Token": "imp-123" });
  });

  it("fetches the brand in parallel with the org status, not after it", async () => {
    const order: string[] = [];
    let releaseOrg!: () => void;
    const orgGate = new Promise<void>((r) => { releaseOrg = r; });
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      order.push(url.replace(/^.*\/v1/, ""));
      if (url.endsWith("/v1/organizations/me")) { await orgGate; return new Response(JSON.stringify({ data: { name: "Org" } }), { status: 200 }); }
      if (url.endsWith("/v1/onboarding/status")) return new Response(JSON.stringify({ wabaConnected: true, numberProvisioned: true }), { status: 200 });
      return new Response(JSON.stringify({ data: branded }), { status: 200 });
    }));
    const { default: Layout } = await import("./layout");
    const p = Layout({ children: null });
    await vi.waitFor(() => expect(order).toContain("/brand"));
    expect(order).toContain("/organizations/me");
    releaseOrg();
    await p;
  });
});

describe("dashboard generateMetadata", () => {
  it("returns {} for the default brand", async () => {
    stubApi(() => new Response(JSON.stringify({ data: { ...branded, name: "WBMSG", isDefault: true } }), { status: 200 }));
    const { generateMetadata } = await import("./layout");
    expect(await generateMetadata()).toEqual({});
  });
  it("returns the title template and icons for a branded org", async () => {
    stubApi(() => new Response(JSON.stringify({ data: branded }), { status: 200 }));
    const { generateMetadata } = await import("./layout");
    expect(await generateMetadata()).toEqual({
      title: { template: "%s | Acme Cloud", default: "Acme Cloud" },
      icons: { icon: "https://cdn.example.com/f.ico", shortcut: "https://cdn.example.com/f.ico" },
    });
  });
  it("returns {} when the brand call fails", async () => {
    stubApi(() => { throw new Error("down"); });
    const { generateMetadata } = await import("./layout");
    expect(await generateMetadata()).toEqual({});
  });
});
