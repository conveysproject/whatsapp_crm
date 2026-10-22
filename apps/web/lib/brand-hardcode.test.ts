import { describe, it, expect } from "vitest";
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Guard: the authenticated app must take the product name, logo and support contact from the brand
 * (useBrand / BrandLogo / BrandName), never from a literal. A new hard-coded literal in a dashboard file fails here.
 * Files that legitimately keep the WBMSG brand are listed below, each with the reason.
 */

const FORBIDDEN = ["WBMSG", "wbmsg.com", "info@conveys.in"] as const;
const SCAN_DIRS = ["app", "components", "lib", "hooks"];

const BILLING = "billing stays WBMSG on the web (decision D4a)";
const PUBLIC = "public marketing, legal or docs page: always the WBMSG product";
const AUTH = "sign-in / sign-up / invitation page: branded by token or slug in task A6";

const ALLOW: Record<string, string> = {
  // billing (D4a)
  "app/(dashboard)/settings/billing/BillingClient.tsx": BILLING,
  "components/billing/CancelAccountCard.tsx": BILLING,
  "lib/billing-cancellation.ts": BILLING,
  "lib/billing-standing.ts": BILLING,
  // public marketing, legal and docs
  "app/(public)/cancellation-policy/page.tsx": PUBLIC,
  "app/(public)/contact/page.tsx": PUBLIC,
  "app/(public)/docs/[category]/[slug]/opengraph-image.tsx": PUBLIC,
  "app/(public)/docs/[category]/[slug]/page.tsx": PUBLIC,
  "app/(public)/docs/[category]/page.tsx": PUBLIC,
  "app/(public)/docs/layout.tsx": PUBLIC,
  "app/(public)/docs/page.tsx": PUBLIC,
  "app/(public)/layout.tsx": PUBLIC,
  "app/(public)/page.tsx": PUBLIC,
  "app/(public)/privacy/page.tsx": PUBLIC,
  "app/(public)/refund-policy/page.tsx": PUBLIC,
  "app/(public)/terms/page.tsx": PUBLIC,
  "components/public/LegalPage.tsx": PUBLIC,
  "components/public/PublicNav.tsx": PUBLIC,
  "lib/docs/content/analytics.ts": "help-center article text (public docs)",
  "lib/docs/content/automation.ts": "help-center article text (public docs)",
  "lib/docs/content/campaigns.ts": "help-center article text (public docs)",
  "lib/docs/content/contacts.ts": "help-center article text (public docs)",
  "lib/docs/content/deals.ts": "help-center article text (public docs)",
  "lib/docs/content/getting-started.ts": "help-center article text (public docs)",
  "lib/docs/content/inbox.ts": "help-center article text (public docs)",
  "lib/docs/content/messages.ts": "help-center article text (public docs)",
  "lib/docs/content/settings.ts": "help-center article text (public docs)",
  "lib/docs/content/templates.ts": "help-center article text (public docs)",
  "lib/docs/content/trust-score.ts": "help-center article text (public docs)",
  "lib/docs/structured-data.ts": "public docs structured data (JSON-LD) for wbmsg.com",
  "app/llms.txt/route.ts": "public llms.txt for wbmsg.com",
  "app/robots.ts": "public robots.txt for wbmsg.com",
  "app/sitemap.ts": "public sitemap for wbmsg.com",
  // root metadata, brand defaults, mail
  "app/layout.tsx": "root metadata for the public site; a branded dashboard overrides it through brandMetadata",
  "lib/brand.ts": "the DEFAULT_BRAND definition itself",
  "lib/mail-from.ts": "fallback From-name of outgoing mail when no usable name is left",
  // auth surfaces handled in A6
  "app/(auth)/sign-in/[[...sign-in]]/page.tsx": AUTH,
  "app/(auth)/sign-in/confirm-email/page.tsx": AUTH,
  "app/(auth)/sign-up/[[...sign-up]]/page.tsx": AUTH,
  "app/invitations/[token]/accept/page.tsx": AUTH,
  "components/auth/SignInForm.tsx": AUTH,
  "components/parent/ClientAcceptView.tsx": "client-invitation accept page (token based, no signed-in org yet): A6",
  "lib/auth/oauth.ts": "sign-in error messages (auth surface, A6)",
  // other
  "app/(setup)/business-details/page.tsx": "post-signup setup before the user has an organization, so there is no brand yet: always the default",
  "app/admin/(protected)/layout.tsx": "super-admin area: platform staff, always the WBMSG platform",
  "app/admin/sign-in/page.tsx": "super-admin area: platform staff, always the WBMSG platform",
};

const ROOT = fileURLToPath(new URL("..", import.meta.url));

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === "node_modules" || name === ".next") continue;
      out.push(...sourceFiles(full));
    } else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) && name !== "brand-test-fixtures.ts") {
      out.push(full);
    }
  }
  return out;
}

/** Source without comments and without the `@WBMSG/...` workspace package names in import paths. */
function stripped(file: string): string {
  return readFileSync(file, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/@WBMSG\/[\w-]+/g, "");
}

function literalsIn(file: string): string[] {
  const src = stripped(file);
  return FORBIDDEN.filter((l) => src.includes(l));
}

const files = SCAN_DIRS.flatMap((d) => sourceFiles(join(ROOT, d))).map((f) => ({
  abs: f,
  rel: relative(ROOT, f).split("\\").join("/"),
}));

describe("no hard-coded product brand outside the allow-list", () => {
  it("scans a meaningful set of files", () => {
    expect(files.length).toBeGreaterThan(100);
    expect(files.some((f) => f.rel === "components/layout/Sidebar.tsx")).toBe(true);
  });

  it("every file with a WBMSG literal is on the allow-list", () => {
    const offenders = files.filter((f) => !(f.rel in ALLOW)).flatMap((f) => literalsIn(f.abs).map((l) => `${f.rel}: ${l}`));
    expect(offenders).toEqual([]);
  });

  it("every allow-list entry has a reason, exists and still needs it", () => {
    const byRel = new Map(files.map((f) => [f.rel, f.abs]));
    for (const [rel, reason] of Object.entries(ALLOW)) {
      expect(reason.trim().length, `${rel} needs a reason`).toBeGreaterThan(10);
      const abs = byRel.get(rel);
      expect(abs, `${rel} is on the allow-list but not found`).toBeDefined();
      expect(literalsIn(abs!).length, `${rel} no longer has a literal: remove it from the allow-list`).toBeGreaterThan(0);
    }
  });

  it("the scanner catches a literal in text and ignores comments", () => {
    const dir = mkdtempSync(join(tmpdir(), "brand-guard-"));
    try {
      const bad = join(dir, "bad.tsx");
      const ok = join(dir, "ok.tsx");
      writeFileSync(bad, ["export const X = () => <p>Welcome to WBMSG</p>;", ""].join("\n"));
      writeFileSync(ok, ["// WBMSG only in a comment", "/* wbmsg.com */", 'import type { A } from "@WBMSG/shared";', ""].join("\n"));
      expect(literalsIn(bad)).toEqual(["WBMSG"]);
      expect(literalsIn(ok)).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
