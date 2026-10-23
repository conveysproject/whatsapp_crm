import { describe, it, expect, vi } from "vitest";
import { createElement as h, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BrandLogo } from "./BrandLogo";
import { brandOf, FORBIDDEN_LITERALS, HOSTILE_NAME, inBrand, inQuery } from "@/lib/brand-test-fixtures";
import { Sidebar } from "@/components/layout/Sidebar";
import { ConnectWhatsAppModal } from "@/components/whatsapp/ConnectWhatsAppModal";
import { ApiCredentialsSection, CredentialFormDialog } from "@/components/settings/ApiCredentialsSection";
import OnboardingLayout from "@/app/(onboarding)/layout";
import InviteTeamPage from "@/app/(onboarding)/invite-team/page";
import ChecklistPage from "@/app/(onboarding)/checklist/page";
import ApiUsagePage from "@/app/(dashboard)/settings/api-usage/page";
import WhatsAppAccountPage from "@/app/(dashboard)/settings/whatsapp-account/page";
import type { Brand } from "@/lib/brand";

let current: Brand;

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
  useRouter: () => ({ push: () => undefined, replace: () => undefined }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("next/link", () => ({ default: ({ children, href }: { children: ReactNode; href: string }) => h("a", { href }, children) }));
vi.mock("@/components/PermissionGate", () => ({ PermissionGate: ({ children }: { children: ReactNode }) => children }));
vi.mock("@/lib/auth/server", () => ({
  auth: Object.assign(async () => ({ userId: "u1", getToken: async () => "tok" }), {
    protect: async () => ({ userId: "u1", getToken: async () => "tok" }),
  }),
}));
vi.mock("@/lib/auth/client", () => ({ useAuth: () => ({ getToken: async () => "tok" }) }));
vi.mock("@/lib/brand-session", () => ({ loadSessionBrand: async () => current }));
vi.mock("@radix-ui/react-dialog", () => {
  const pass = ({ children }: { children?: ReactNode }): ReactNode => children ?? null;
  return { Root: pass, Portal: pass, Overlay: () => null, Content: pass, Title: pass, Description: pass, Close: pass };
});

const named = brandOf({ name: "Acme Cloud" });
const hostile = brandOf({ name: HOSTILE_NAME });
const emptyUsage = { totals: { requests: 0 }, byCredential: [] };

async function checklist(b: Brand): Promise<string> {
  vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ wabaConnected: false, numberProvisioned: false, onboardingStep: "x", provisioned: true }), { status: 200 }));
  try {
    return renderToStaticMarkup(inBrand(b, await ChecklistPage()));
  } finally {
    vi.unstubAllGlobals();
  }
}

const usage = (b: Brand, empty: boolean): string =>
  renderToStaticMarkup(inBrand(b, inQuery(h(ApiUsagePage), empty ? (qc) => qc.setQueryData(["api-usage", "summary", "7d", null], emptyUsage) : undefined)));

const cases: { label: string; render: (b: Brand) => Promise<string> }[] = [
  { label: "Sidebar", render: async (b) => renderToStaticMarkup(inBrand(b, inQuery(h(Sidebar)))) },
  { label: "ConnectWhatsAppModal", render: async (b) => renderToStaticMarkup(inBrand(b, h(ConnectWhatsAppModal, { flow: "onboarding", onSuccess: () => undefined, variant: "inline" }))) },
  { label: "ApiCredentialsSection (list)", render: async (b) => renderToStaticMarkup(inBrand(b, inQuery(h(ApiCredentialsSection), (qc) => qc.setQueryData(["api-credentials"], [])))) },
  { label: "CredentialFormDialog (create)", render: async (b) => renderToStaticMarkup(inBrand(b, inQuery(h(CredentialFormDialog, { mode: "create", onClose: () => undefined, onDone: () => undefined })))) },
  { label: "onboarding layout", render: async (b) => { current = b; return renderToStaticMarkup(await OnboardingLayout({ children: h("p", null, "c") })); } },
  { label: "invite-team", render: async (b) => renderToStaticMarkup(inBrand(b, h(InviteTeamPage))) },
  { label: "checklist", render: checklist },
  { label: "api-usage", render: async (b) => usage(b, false) },
  { label: "api-usage (empty state)", render: async (b) => usage(b, true) },
  { label: "whatsapp-account", render: async (b) => renderToStaticMarkup(inBrand(b, inQuery(h(WhatsAppAccountPage)))) },
];

describe("branded render of the authenticated app", () => {
  for (const c of cases) {
    describe(c.label, () => {
      it("shows the brand name and none of the WBMSG literals", async () => {
        const html = await c.render(brandOf({ name: "Acme Cloud", logoUrl: "https://cdn.example.com/l.png" }));
        for (const lit of FORBIDDEN_LITERALS) expect(html).not.toContain(lit);
        expect(html).toContain("Acme Cloud");
      });
      it("escapes a hostile brand name", async () => {
        const html = await c.render(hostile);
        expect(html).not.toContain("<img src=x");
        expect(html).not.toContain('"><img');
      });
    });
  }

  it("the create dialog describes the brand's API", async () => {
    const html = await cases[3]!.render(named);
    expect(html).toContain("generated for the Acme Cloud API.");
  });
  it("the api-usage empty state names the brand's API", () => {
    const html = usage(named, true);
    expect(html).toContain('data-testid="usage-empty"');
    expect(html).toContain("first request to the Acme Cloud API.");
  });
  it("the api-usage heading names the brand's API", () => {
    expect(usage(named, false)).toContain("sent through the Acme Cloud API.");
  });
});

describe("BrandLogo", () => {
  const logo = "https://cdn.example.com/logo.png";
  const small = "https://cdn.example.com/small.png";
  const render = (b: Brand, variant?: "full" | "small"): string => renderToStaticMarkup(inBrand(b, h(BrandLogo, { height: 36, variant })));

  it("default brand keeps the WBMSG logo file", () => {
    expect(renderToStaticMarkup(h(BrandLogo, { height: 36 }))).toContain("wbmsg_logo.png");
  });
  it("full variant uses logoUrl with the brand name as alt", () => {
    const html = render(brandOf({ logoUrl: logo, smallLogoUrl: small }));
    expect(html).toContain(`src="${logo}"`);
    expect(html).toContain('alt="Acme Cloud"');
    expect(html).not.toContain("wbmsg_logo");
  });
  it("small variant (collapsed sidebar) uses smallLogoUrl, else logoUrl", () => {
    expect(render(brandOf({ logoUrl: logo, smallLogoUrl: small }), "small")).toContain(`src="${small}"`);
    expect(render(brandOf({ logoUrl: logo }), "small")).toContain(`src="${logo}"`);
  });
  it("renders a text wordmark when the brand has no image", () => {
    const html = render(brandOf());
    expect(html).not.toContain("<img");
    expect(html).toContain(">Acme Cloud</span>");
    expect(html).not.toContain("wbmsg_logo");
  });
  it("adds the dark logo, hidden in light mode", () => {
    const html = render(brandOf({ logoUrl: logo, darkLogoUrl: "https://cdn.example.com/dark.png" }));
    expect(html).toContain("dark:hidden");
    expect(html).toContain('src="https://cdn.example.com/dark.png"');
  });
  it("escapes a hostile name in alt and title", () => {
    const withLogo = render(brandOf({ name: HOSTILE_NAME, logoUrl: logo }));
    expect(withLogo).toContain('alt="&quot;&gt;&lt;img src=x onerror=alert(1)&gt;"');
    const wordmark = render(brandOf({ name: HOSTILE_NAME }));
    expect(wordmark).toContain('title="&quot;&gt;&lt;img src=x onerror=alert(1)&gt;"');
    expect(wordmark).not.toContain("<img");
  });
});
