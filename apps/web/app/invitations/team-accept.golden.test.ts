import { describe, it, expect, vi } from "vitest";
import { createElement as h, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const signedIn = vi.hoisted(() => ({ value: false }));
vi.mock("next/navigation", () => ({ useParams: () => ({ token: "tok-1" }) }));
vi.mock("next/link", () => ({ default: ({ children, href }: { children: ReactNode; href: string }) => h("a", { href }, children) }));
vi.mock("@/lib/auth/client", () => ({ useAuth: () => ({ isSignedIn: signedIn.value, getToken: async () => "tok" }) }));

import { AcceptInvitation } from "@/components/invitations/AcceptInvitation";

// The loaded default-brand page must stay byte-identical to what the page rendered before branding.
describe("team accept default markup (loaded)", () => {
  const meta = { email: "a@b.com", role: "agent" };
  it("sign-up form", async () => {
    signedIn.value = false;
    await expect(renderToStaticMarkup(h(AcceptInvitation, { token: "tok-1", initialMeta: meta }))).toMatchFileSnapshot("./__golden__/team-accept.signup.default.html");
  });
  it("signed in", async () => {
    signedIn.value = true;
    await expect(renderToStaticMarkup(h(AcceptInvitation, { token: "tok-1", initialMeta: meta }))).toMatchFileSnapshot("./__golden__/team-accept.signedin.default.html");
  });
});
