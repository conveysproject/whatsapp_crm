import { describe, it, expect, vi } from "vitest";
import { createElement as h, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

// TEMP hack for capturing the loaded state of the current page: the first useState (meta) is preset.
const signedIn = vi.hoisted(() => ({ value: false }));
vi.mock("react", async (orig) => {
  const real = await orig<typeof import("react")>();
  let calls = 0;
  return {
    ...real,
    default: real,
    useState: (init: unknown) => {
      calls += 1;
      if (calls % 9 === 1) return [{ email: "a@b.com", role: "agent" }, () => undefined];
      return (real.useState as (i: unknown) => unknown)(init);
    },
  };
});
vi.mock("next/navigation", () => ({ useParams: () => ({ token: "tok-1" }) }));
vi.mock("next/link", () => ({ default: ({ children, href }: { children: ReactNode; href: string }) => h("a", { href }, children) }));
vi.mock("@/lib/auth/client", () => ({ useAuth: () => ({ isSignedIn: signedIn.value, getToken: async () => "tok" }) }));

import Page from "./[token]/accept/page";

describe("team accept default markup (loaded)", () => {
  it("sign-up form", async () => {
    signedIn.value = false;
    await expect(renderToStaticMarkup(h(Page))).toMatchFileSnapshot("./__golden__/team-accept.signup.default.html");
  });
  it("signed in", async () => {
    signedIn.value = true;
    await expect(renderToStaticMarkup(h(Page))).toMatchFileSnapshot("./__golden__/team-accept.signedin.default.html");
  });
});
