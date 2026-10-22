import { describe, it, expect, vi } from "vitest";
import { createElement as h, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import OnboardingLayout from "./layout";
import InviteTeamPage from "./invite-team/page";
import ChecklistPage from "./checklist/page";

vi.mock("@/lib/auth/server", () => ({
  auth: Object.assign(async () => ({ userId: "u1", getToken: async () => "tok" }), {
    protect: async () => ({ userId: "u1", getToken: async () => "tok" }),
  }),
}));
vi.mock("@/lib/brand-session", async () => ({ loadSessionBrand: async () => (await import("@/lib/brand")).DEFAULT_BRAND }));
vi.mock("@/lib/auth/client", () => ({ useAuth: () => ({ getToken: async () => "tok" }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => undefined }) }));
vi.mock("next/link", () => ({ default: ({ children, href }: { children: ReactNode; href: string }) => h("a", { href }, children) }));

describe("onboarding default markup", () => {
  it("layout", async () => {
    const out = await Promise.resolve(OnboardingLayout({ children: h("p", null, "child") }));
    await expect(renderToStaticMarkup(out)).toMatchFileSnapshot("./__golden__/layout.default.html");
  });
  it("invite-team", async () => {
    await expect(renderToStaticMarkup(h(InviteTeamPage))).toMatchFileSnapshot("./__golden__/invite-team.default.html");
  });
  it("checklist", async () => {
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ wabaConnected: false, numberProvisioned: false, onboardingStep: "x", provisioned: true }), { status: 200 }));
    const out = await ChecklistPage();
    await expect(renderToStaticMarkup(out)).toMatchFileSnapshot("./__golden__/checklist.default.html");
    vi.unstubAllGlobals();
  });
});
