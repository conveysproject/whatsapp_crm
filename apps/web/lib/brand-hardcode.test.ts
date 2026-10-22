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

const FORBIDDEN = ["WBMSG", "wbmsg.com", "info@conveys.in", "TrustCRM"] as const;
const SCAN_DIRS = ["app", "components", "lib", "hooks"];

const BILLING = "billing stays WBMSG on the web (decision D4a)";
const PUBLIC = "public marketing, legal or docs page: always the WBMSG product";
const AUTH = "default-brand-only auth page: no white-label variant (clients are invited and sign in on /c/<slug>/sign-in)";

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
  "components/brand/AuthLogo.tsx": "the default logo asset path /wbmsg_logo.png (a file name, not text)",
  "components/brand/BrandLogo.tsx": "the default logo asset path /wbmsg_logo.png (a file name, not text)",
  "lib/auth/jwt.ts": "JWT issuer / audience identifiers: protocol values that must match the API, never shown",
  "lib/mail-from.ts": "fallback From-name of outgoing mail when no usable name is left",
  // auth surfaces handled in A6
  "app/(auth)/sign-in/confirm-email/page.tsx": AUTH,
  "app/(auth)/sign-up/[[...sign-up]]/page.tsx": AUTH,
  "lib/auth/oauth.ts": "OAuth error strings: generic auth messages, to be branded in a later task (behaviour unchanged here)",
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
    } else if (/\.(tsx?|jsx?)$/.test(name) && !/\.test\.(tsx?|jsx?)$/.test(name) && name !== "brand-test-fixtures.ts") {
      out.push(full);
    }
  }
  return out;
}

interface Scanned {
  /** Source without comments (strings kept). A comment marker inside a string does not hide anything. */
  code: string;
  /** Contents of every string / template literal that is not an import specifier. */
  strings: string[];
}

/**
 * Minimal tokenizer: tracks single, double and template quotes (with `${}` nesting) so that a `/*` or `//` inside a string is not a comment.
 * An unmatched ' or " (an apostrophe in JSX text) ends at the line break, so it cannot swallow the rest of the file.
 */
export function scan(src: string): Scanned {
  let code = "";
  const strings: string[] = [];
  const tplStack: number[] = []; // brace depth at which each open `${` returns to its template
  let braces = 0;
  let i = 0;
  const n = src.length;
  const isImportSpec = () => /(?:\bfrom|\bimport|\brequire\()\s*$/.test(code.slice(-24));
  const readTemplate = () => {
    // after the opening backtick or a closing `}` of `${}`
    let buf = "";
    while (i < n) {
      const c = src[i]!;
      if (c === "\\") { buf += c + (src[i + 1] ?? ""); i += 2; continue; }
      if (c === "`") { code += buf + "`"; strings.push(buf); i++; return; }
      if (c === "$" && src[i + 1] === "{") {
        code += buf + "${"; strings.push(buf); i += 2; tplStack.push(braces); braces++; return;
      }
      buf += c; i++;
    }
    code += buf;
  };
  while (i < n) {
    const c = src[i]!;
    const next = src[i + 1];
    if (c === "/" && next === "*") {
      const end = src.indexOf("*/", i + 2);
      i = end === -1 ? n : end + 2;
      continue;
    }
    if (c === "/" && next === "/" && src[i - 1] !== ":") {
      while (i < n && src[i] !== "\n") i++;
      continue;
    }
    if (c === "'" || c === '"') {
      const spec = isImportSpec();
      let j = i + 1;
      let buf = "";
      while (j < n && src[j] !== c && src[j] !== "\n") {
        if (src[j] === "\\") { buf += src[j]! + (src[j + 1] ?? ""); j += 2; continue; }
        buf += src[j]; j++;
      }
      if (src[j] === c) {
        if (!spec) strings.push(buf);
        code += c + buf + c;
        i = j + 1;
      } else {
        code += c; i++; // lone apostrophe in text
      }
      continue;
    }
    if (c === "`") { i++; code += "`"; readTemplate(); continue; }
    if (c === "{") braces++;
    if (c === "}") {
      braces--;
      if (tplStack.length && tplStack[tplStack.length - 1] === braces) {
        tplStack.pop(); code += "}"; i++; readTemplate(); continue;
      }
    }
    code += c; i++;
  }
  return { code, strings };
}

/** Visible JSX text between `>` and `<` (good enough to catch `<p>wbmsg</p>`). */
function jsxText(code: string): string[] {
  return [...code.matchAll(/>([^<>{}=;]+)</g)].map((m) => m[1]!);
}

/** Source without comments and without the `@WBMSG/...` workspace package names in import paths. */
function stripped(file: string): string {
  return scan(readFileSync(file, "utf8")).code.replace(/@WBMSG\/[\w-]+/g, "");
}

/** Forbidden literals in a source text. Lower or mixed-case `wbmsg` counts only inside user-visible strings or JSX text. */
export function literalsInSource(src: string): string[] {
  const { code, strings } = scan(src);
  const clean = code.replace(/@WBMSG\/[\w-]+/g, "");
  const found: string[] = FORBIDDEN.filter((l) => clean.includes(l));
  const visible = [...strings, ...jsxText(code)].map((t) => t.replace(/x-wbmsg-[\w-]*/gi, "").replace(/@WBMSG\/[\w-]+/g, ""));
  if (visible.some((t) => /wbmsg/i.test(t.replace(/WBMSG|wbmsg\.com/g, "")))) found.push("wbmsg (any case)");
  return found;
}

function literalsIn(file: string): string[] {
  return literalsInSource(readFileSync(file, "utf8"));
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

  it("the scanner catches wbmsg.com, info@conveys.in, TrustCRM and mixed-case wbmsg in visible text", () => {
    expect(literalsInSource('export const U = "https://wbmsg.com/x";')).toEqual(["wbmsg.com"]);
    expect(literalsInSource('export const M = "info@conveys.in";')).toEqual(["info@conveys.in"]);
    expect(literalsInSource("export const X = () => <p>Powered by TrustCRM</p>;")).toEqual(["TrustCRM"]);
    expect(literalsInSource('export const T = "Welcome to Wbmsg";')).toEqual(["wbmsg (any case)"]);
    expect(literalsInSource("export const X = () => <p>welcome to wbmsg</p>;")).toEqual(["wbmsg (any case)"]);
    expect(literalsInSource("export const T = `Hi from wbmsg ${name}`;")).toEqual(["wbmsg (any case)"]);
  });

  it("the scanner ignores identifiers, imports, protocol names and comments", () => {
    const ok = [
      "function WbmsgSecurity() { return null; }",
      'import { x } from "@/lib/auth/middleware-wbmsg";',
      'import type { A } from "@WBMSG/shared";',
      'headers["x-wbmsg-bff"] = secret;',
      "const a = wbmsgAuth();",
      "// wbmsg only in a comment",
      "/* WBMSG wbmsg.com */",
    ].join("\n");
    expect(literalsInSource(ok)).toEqual([]);
  });

  it("a comment marker inside a string does not hide code after it", () => {
    expect(literalsInSource('const glob = "/*"; const t = "Welcome to WBMSG"; const e = "*/";')).toEqual(["WBMSG"]);
    expect(literalsInSource('const u = "http://x"; const t = "WBMSG";')).toEqual(["WBMSG"]);
    expect(literalsInSource("const g = `/* ${a} */`; const t = 'info@conveys.in';")).toEqual(["info@conveys.in"]);
  });

  it("a glob string with /* does not hide a planted literal on the next line", () => {
    const src = 'const g = "**/*.ts";\nconst u = "https://wbmsg.com/x";\n';
    expect(literalsInSource(src)).toEqual(["wbmsg.com"]);
  });

  it("a regex literal containing a quote does not hide a planted literal after it", () => {
    const src = "const r = /[\"']+/g;\nconst u = \"https://wbmsg.com/x\";\n";
    expect(literalsInSource(src)).toEqual(["wbmsg.com"]);
    const src2 = "const r = /'/;\nconst t = 'info@conveys.in';\n";
    expect(literalsInSource(src2)).toEqual(["info@conveys.in"]);
  });

  it("an apostrophe in JSX text does not swallow the rest of the file", () => {
    expect(literalsInSource("const X = () => <p>Don't panic</p>;\nconst T = \"TrustCRM\";")).toEqual(["TrustCRM"]);
  });

  it("scans .js and .jsx files too", () => {
    const dir = mkdtempSync(join(tmpdir(), "brand-guard-js-"));
    try {
      writeFileSync(join(dir, "a.jsx"), "export const A = () => <p>WBMSG</p>;\n");
      expect(sourceFiles(dir).map((f) => relative(dir, f))).toEqual(["a.jsx"]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
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
