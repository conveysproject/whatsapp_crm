import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement as h, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DEFAULT_PALETTE } from "@/lib/brand";
import { clearPublicBrandCache, setPublicBrandClock } from "@/lib/public-brand";
import BrandedSignIn, { generateMetadata as signInMeta } from "./[slug]/sign-in/[[...sign-in]]/page";
import BrandedForgot, { generateMetadata as forgotMeta } from "./[slug]/forgot-password/page";

vi.mock("next/font/google", () => ({
  DM_Sans: () => ({ variable: "dm-var" }),
  Bricolage_Grotesque: () => ({ variable: "br-var" }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => undefined }),
  useSearchParams: () => new URLSearchParams(),
  redirect: (to: string) => {
    throw new Error(`REDIRECT:${to}`);
  },
}));
vi.mock("next/link", () => ({ default: ({ children, href }: { children: ReactNode; href: string }) => h("a", { href }, children) }));

const payload = (over: Record<string, unknown> = {}) => ({
  name: "Acme Cloud",
  logoUrl: "https://cdn.test/acme/logo.png",
  smallLogoUrl: null,
  faviconUrl: null,
  darkLogoUrl: null,
  darkSmallLogoUrl: null,
  darkFaviconUrl: null,
  primaryColor: "#0055ff",
  palette: DEFAULT_PALETTE,
  supportEmail: "help@acme.test",
  hidePoweredBy: false,
  slug: "acme",
  isDefault: false,
  ...over,
});
const ok = (data: unknown) => new Response(JSON.stringify({ data }), { status: 200 });
const fetchMock = vi.fn();

beforeEach(() => {
  // The module caches results for 60 s; every test starts empty and moves the clock past the TTL between lookups.
  clearPublicBrandCache();
  let t = 0;
  setPublicBrandClock(() => (t += 61_000));
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  setPublicBrandClock(null);
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const params = (slug: string) => ({ params: Promise.resolve({ slug }) });
async function redirectOf(run: () => Promise<unknown>): Promise<string | null> {
  try {
    await run();
    return null;
  } catch (e) {
    const m = /^REDIRECT:(.*)$/.exec((e as Error).message);
    if (!m) throw e;
    return m[1]!;
  }
}
const html = async (slug = "acme") => renderToStaticMarkup(await BrandedSignIn(params(slug)));

describe("branded sign-in", () => {
  it("renders the brand name, logo and colors and nothing of WBMSG", async () => {
    fetchMock.mockResolvedValue(ok(payload()));
    const out = await html();
    expect(out).toContain('src="https://cdn.test/acme/logo.png"');
    expect(out).toContain('alt="Acme Cloud"');
    expect(out).toContain("--color-brand:#0055ff");
    expect(out).toContain("Sign in");
    expect(out.toLowerCase()).not.toContain("wbmsg");
  });

  it("calls the public endpoint uncached (the module keeps its own 60 s cache)", async () => {
    fetchMock.mockResolvedValue(ok(payload()));
    await html();
    const [url, init] = fetchMock.mock.calls[0] as [string, { cache: string }];
    expect(url).toMatch(/\/v1\/public\/brand\/acme$/);
    expect(init.cache).toBe("no-store");
  });

  it("shows a wordmark of the name when there is no logo", async () => {
    fetchMock.mockResolvedValue(ok(payload({ logoUrl: null })));
    const out = await html();
    expect(out).toContain('title="Acme Cloud"');
    expect(out.toLowerCase()).not.toContain("wbmsg");
  });

  it("escapes a brand name with markup-significant characters", async () => {
    fetchMock.mockResolvedValue(ok(payload({ name: "Tom & \"Jerry\" Co", logoUrl: null })));
    const out = await html();
    expect(out).toContain("Tom &amp; &quot;Jerry&quot; Co");
    expect(out).not.toContain("Tom & \"Jerry\"");
  });

  it("a name with angle brackets is refused by the parser: same redirect as any other failure", async () => {
    fetchMock.mockResolvedValue(ok(payload({ name: "\"><img src=x onerror=alert(1)>" })));
    expect(await redirectOf(() => html())).toBe("/sign-in");
  });

  it("has no sign-up link and no 'New to' text; the forgot link stays on the branded route", async () => {
    fetchMock.mockResolvedValue(ok(payload()));
    const out = await html();
    expect(out).not.toContain('href="/sign-up"');
    expect(out).not.toContain("New to");
    expect(out).not.toContain("Create a free account");
    expect(out).toContain('href="/c/acme/forgot-password"');
    expect(out).not.toContain('href="/forgot-password"');
  });

  it("shows 'Need access? Contact <email>' only when the brand has a support email", async () => {
    fetchMock.mockResolvedValue(ok(payload()));
    const withMail = await html();
    expect(withMail).toContain("Need access?");
    expect(withMail).toContain('href="mailto:help@acme.test"');
    fetchMock.mockResolvedValue(ok(payload({ supportEmail: null })));
    const without = await html();
    expect(without).not.toContain("Need access?");
    expect(without).not.toContain("mailto:");
  });

  it("uses the same form as /sign-in (the form component is unchanged)", async () => {
    fetchMock.mockResolvedValue(ok(payload()));
    const out = await html();
    expect(out).toContain("Email me a code instead");
    expect(out).toContain('id="password"');
  });

  it("unknown, disabled, invalid, failed and default brands all redirect identically", async () => {
    const cases: Array<[string, () => void]> = [
      ["unknown 404", () => fetchMock.mockResolvedValue(new Response("{}", { status: 404 }))],
      ["rate limited 429", () => fetchMock.mockResolvedValue(new Response("{}", { status: 429 }))],
      ["server error 500", () => fetchMock.mockResolvedValue(new Response("{}", { status: 500 }))],
      ["garbage body", () => fetchMock.mockResolvedValue(new Response("<html>nope", { status: 200 }))],
      ["malformed payload", () => fetchMock.mockResolvedValue(ok({ name: 5 }))],
      ["default payload", () => fetchMock.mockResolvedValue(ok(payload({ isDefault: true })))],
      ["slug mismatch", () => fetchMock.mockResolvedValue(ok(payload({ slug: "other" })))],
      ["network error", () => fetchMock.mockRejectedValue(new Error("boom"))],
    ];
    for (const [name, arrange] of cases) {
      arrange();
      expect(await redirectOf(() => html()), name).toBe("/sign-in");
    }
  });

  it("the fallback redirect carries a valid redirect_url and drops an unsafe one", async () => {
    fetchMock.mockResolvedValue(new Response("{}", { status: 404 }));
    const withQuery = (q: unknown) => async () =>
      renderToStaticMarkup(await BrandedSignIn({ ...params("acme"), searchParams: Promise.resolve({ redirect_url: q as string }) }));
    expect(await redirectOf(withQuery("/invitations/t/accept"))).toBe("/sign-in?redirect_url=%2Finvitations%2Ft%2Faccept");
    expect(await redirectOf(withQuery("//evil.com"))).toBe("/sign-in");
    expect(await redirectOf(withQuery("https://evil.com"))).toBe("/sign-in");
    expect(await redirectOf(withQuery(["/a", "/b"]))).toBe("/sign-in");
  });

  it("uses the brand color instead of the WBMSG green", async () => {
    fetchMock.mockResolvedValue(ok(payload()));
    const out = await html();
    expect(out).not.toContain("0BBF77");
    expect(out).toContain("bg-brand-600");
    expect(out).toContain("text-brand-600");
  });

  it("never turns a support email into mailto parameters", async () => {
    fetchMock.mockResolvedValue(ok(payload({ supportEmail: "a@b.co?cc=x@evil&body=x" })));
    const out = await html();
    expect(out).not.toContain("mailto:");
    expect(out).not.toContain("Need access?");
  });

  it("an invalid slug redirects the same way without calling the API", async () => {
    for (const slug of ["ab", "A-b-c", "a_b_c", "-abc", "abc-", "a--bc", "x".repeat(41), "..%2f..", "a b c", ""]) {
      expect(await redirectOf(() => html(slug)), slug).toBe("/sign-in");
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("a request that hangs past 3 s redirects", async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(
      (_u: string, init: { signal: AbortSignal }) =>
        new Promise((_res, rej) => init.signal.addEventListener("abort", () => rej(new Error("aborted")))),
    );
    const pending = redirectOf(() => html());
    await vi.advanceTimersByTimeAsync(3100);
    expect(await pending).toBe("/sign-in");
  });

  it("metadata: brand title and icons, never indexed; no brand gives only noindex", async () => {
    fetchMock.mockResolvedValue(ok(payload({ faviconUrl: "https://cdn.test/acme/fav.png" })));
    const m = await signInMeta(params("acme"));
    expect(m.title).toEqual({ absolute: "Sign in | Acme Cloud" });
    expect(m.robots).toEqual({ index: false, follow: false });
    expect((m.icons as { icon: string }).icon).toBe("https://cdn.test/acme/fav.png");
    expect(m.alternates).toEqual({ canonical: null });
    expect(JSON.stringify(m).toLowerCase()).not.toContain("wbmsg");
    fetchMock.mockResolvedValue(new Response("{}", { status: 404 }));
    expect(await signInMeta(params("nope"))).toEqual({ robots: { index: false, follow: false } });
  });
});

describe("branded forgot password", () => {
  const page = async (slug = "acme") => renderToStaticMarkup(await BrandedForgot(params(slug)));

  it("renders the existing form inside the brand and links back to the branded sign-in", async () => {
    fetchMock.mockResolvedValue(ok(payload()));
    const out = await page();
    expect(out).toContain("Forgot your password?");
    expect(out).toContain('src="https://cdn.test/acme/logo.png"');
    expect(out).toContain('href="/c/acme/sign-in"');
    expect(out).not.toContain('href="/sign-in"');
    expect(out.toLowerCase()).not.toContain("wbmsg");
  });

  it("every non-brandable slug redirects to /forgot-password", async () => {
    fetchMock.mockResolvedValue(new Response("{}", { status: 404 }));
    expect(await redirectOf(() => page())).toBe("/forgot-password");
    expect(await redirectOf(() => page("A"))).toBe("/forgot-password");
    fetchMock.mockResolvedValue(new Response("{}", { status: 429 }));
    expect(await redirectOf(() => page())).toBe("/forgot-password");
  });

  it("metadata is noindex", async () => {
    fetchMock.mockResolvedValue(ok(payload()));
    const m = await forgotMeta(params("acme"));
    expect(m.robots).toEqual({ index: false, follow: false });
    expect(m.title).toEqual({ absolute: "Forgot password | Acme Cloud" });
    expect(JSON.stringify(m).toLowerCase()).not.toContain("wbmsg");
  });
});
