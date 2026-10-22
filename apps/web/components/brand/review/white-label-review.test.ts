import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { WhiteLabelReviewCardView } from "./WhiteLabelReviewCardView";
import {
  BRAND_CHANGED_MESSAGE, WhiteLabelError, approvalBlockers, reviewErrorText, setWhiteLabel, type BrandReview,
} from "@/lib/brand-review";

const noop = () => undefined;
const review = (over: Partial<BrandReview> = {}): BrandReview => ({
  brandName: "Acme", brandColor: "#3366cc", brandSupportEmail: "help@acme.test", slug: "acme", hidePoweredBy: true,
  logoUrl: "https://cdn.test/brand/logo.png", smallLogoUrl: null, faviconUrl: null, darkLogoUrl: null, darkSmallLogoUrl: null, darkFaviconUrl: null,
  brandRevision: 7, whiteLabelEnabled: false, ...over,
});
const render = (r: BrandReview, over: Record<string, unknown> = {}) =>
  renderToStaticMarkup(h(WhiteLabelReviewCardView, {
    review: r, busy: false, error: null, revokeState: "idle", onApprove: noop, onRequestRevoke: noop, onCancelRevoke: noop, onConfirmRevoke: noop, ...over,
  } as never));

describe("WhiteLabelReviewCardView", () => {
  it("shows the brand details, revision and status", () => {
    const html = render(review());
    expect(html).toContain("Acme");
    expect(html).toContain("help@acme.test");
    expect(html).toContain("#3366cc");
    expect(html).toContain('data-testid="color-swatch"');
    expect(html).toContain('data-testid="brand-revision">7<');
    expect(html).toContain("Not approved");
    expect(html).toContain('<img src="https://cdn.test/brand/logo.png"');
    expect(html.match(/data-image=/g)).toHaveLength(6);
    expect(html).toContain("Before approving, check");
  });
  it("the sign-in path is not clickable until approved", () => {
    expect(render(review())).not.toContain('href="/c/acme/sign-in"');
    expect(render(review())).toContain("/c/acme/sign-in");
    expect(render(review({ whiteLabelEnabled: true }))).toContain('href="/c/acme/sign-in"');
  });
  it("Approve is enabled when complete and disabled with reasons when not", () => {
    expect(render(review())).toMatch(/<button type="button"[^>]*class="[^"]*bg-green-600[^"]*">Approve<\/button>/);
    const html = render(review({ brandName: null, brandColor: null, slug: null, brandSupportEmail: null }));
    expect(html).toMatch(/disabled=""[^>]*>Approve<\/button>|disabled="" title="[^"]*"[^>]*>Approve/);
    for (const m of ["Brand name is missing", "Primary color is missing", "Web address is missing", "Support email is missing"]) expect(html).toContain(m);
  });
  it("Revoke is only enabled while approved, and its confirmation shows only when requested", () => {
    expect(render(review())).toMatch(/disabled=""[^>]*>Revoke approval/);
    expect(render(review({ whiteLabelEnabled: true }))).not.toMatch(/disabled=""[^>]*>Revoke approval/);
    expect(render(review({ whiteLabelEnabled: true }))).not.toContain('role="dialog"');
    expect(render(review({ whiteLabelEnabled: true }), { revokeState: "confirming" })).toContain('role="dialog"');
  });
  it("shows an error message", () => {
    expect(render(review(), { error: BRAND_CHANGED_MESSAGE })).toContain("Reload and review again.");
  });
  it("renders no ids or tokens", () => {
    expect(render(review())).not.toMatch(/organizationId|orgId|token|cuid/i);
  });
});

describe("approvalBlockers", () => {
  it("is empty for a complete brand", () => expect(approvalBlockers(review())).toEqual([]));
  it("lists each missing field", () => expect(approvalBlockers(review({ slug: null, brandSupportEmail: null }))).toHaveLength(2));
});

describe("reviewErrorText", () => {
  it("BRAND_CHANGED asks to reload and refetches", () => {
    expect(reviewErrorText(new WhiteLabelError(409, "BRAND_CHANGED", "x"))).toEqual({ message: BRAND_CHANGED_MESSAGE, refetch: true });
    expect(BRAND_CHANGED_MESSAGE).toBe("The brand changed since you opened this page. Reload and review again.");
  });
  it("BRAND_INCOMPLETE lists the missing fields", () => {
    const t = reviewErrorText(new WhiteLabelError(409, "BRAND_INCOMPLETE", "x", ["slug", "brandSupportEmail"]));
    expect(t.message).toContain("web address");
    expect(t.message).toContain("support email");
  });
  it("NOT_PARENT and unknown errors are readable and never echo raw text", () => {
    expect(reviewErrorText(new WhiteLabelError(409, "NOT_PARENT", "x")).message).toMatch(/parent/);
    expect(reviewErrorText(new Error("secret=abc")).message).toBe("Something went wrong. Please try again.");
  });
});

describe("setWhiteLabel", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("approve sends the revision that was displayed", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await setWhiteLabel("http://api.test/", "t", "org1", true, 7);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://api.test/v1/admin/organizations/org1/white-label");
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body as string)).toEqual({ enabled: true, reviewedRevision: 7 });
  });
  it("revoke sends only enabled:false", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await setWhiteLabel("http://api.test", "t", "org1", false);
    expect(JSON.parse((fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string)).toEqual({ enabled: false });
  });
  it("turns BRAND_CHANGED and BRAND_INCOMPLETE (with missing) into WhiteLabelError", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { code: "BRAND_INCOMPLETE", message: "m", missing: ["slug", 5] } }), { status: 409 })));
    const err = await setWhiteLabel("http://api.test", "t", "o", true, 1).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(WhiteLabelError);
    expect((err as WhiteLabelError).code).toBe("BRAND_INCOMPLETE");
    expect((err as WhiteLabelError).missing).toEqual(["slug"]);
  });
});
