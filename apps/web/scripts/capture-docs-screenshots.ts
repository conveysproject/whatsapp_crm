/**
 * Captures UI screenshots for the /docs help center.
 * PII is masked (gray box) before capture.
 * Run: npx tsx apps/web/scripts/capture-docs-screenshots.ts
 */

import { chromium, type Page, type Browser, type Locator } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

const BASE = "https://wbmsg.com";
const EMAIL = "pooyanp9@gmail.com";
const PASSWORD = "FBTEST1234@";
const OUT = path.resolve(__dirname, "../public/docs/screenshots");
const SESSION_FILE = path.resolve(__dirname, "../e2e/.auth/wbmsg-screenshots.json");
const VIEWPORT = { width: 1440, height: 900 };
const MASK_COLOR = "#D1D5DB"; // gray-300 — neutral, looks like empty fields

// ── PII mask selectors per URL pattern ───────────────────────────────────────
// Selectors whose matched elements are covered with MASK_COLOR before capture.
const PII_MASKS: Record<string, string[]> = {
  "/inbox": [
    // Conversation list: contact names and message previews
    "div.overflow-y-auto button span.text-sm",
    "div.overflow-y-auto button span.text-xs.text-gray-500",
    // Message thread: contact name in header, message bubbles
    "div.flex-1 div.font-semibold",
    "div.flex-1 div.text-sm.text-gray-700",
    "div.flex-1 div.text-xs.text-gray-500",
  ],
  "/contacts": [
    "tbody td",   // entire contacts table body
  ],
  "/contacts/groups": [
    "tbody td",
  ],
  "/contacts/segments": [
    "tbody td",
  ],
  "/settings/members": [
    "tbody td",
    // Card-based layouts too
    "div.text-sm.font-medium",
    "div.text-xs.text-gray-500",
  ],
  "/settings/teams": [
    "tbody td",
  ],
  "/messages": [
    "tbody td",
  ],
  "/trust-score": [
    // Trust score might show contact names
    "table tbody td",
  ],
  "/analytics": [
    "table tbody td",
  ],
};

// ── Pages to capture ──────────────────────────────────────────────────────────
const SHOTS: Array<{ file: string; url: string; waitFor?: string }> = [
  { file: "inbox/inbox-overview.png",        url: "/inbox",                     waitFor: "main" },
  { file: "contacts/contacts-list.png",      url: "/contacts",                  waitFor: "tbody" },
  { file: "contacts/import-contacts.png",    url: "/contacts/import",           waitFor: "main" },
  { file: "contacts/groups.png",             url: "/contacts/groups",           waitFor: "main" },
  { file: "contacts/segments.png",           url: "/contacts/segments",         waitFor: "main" },
  { file: "templates/template-library.png",  url: "/templates",                 waitFor: "main" },
  { file: "templates/create-template.png",   url: "/templates/new",             waitFor: "main" },
  { file: "campaigns/campaigns-list.png",    url: "/campaigns",                 waitFor: "main" },
  { file: "campaigns/create-campaign.png",   url: "/campaigns/new",             waitFor: "main" },
  { file: "automation/flows.png",            url: "/flows",                     waitFor: "main" },
  { file: "automation/basic-automation.png", url: "/flows/basic-automation",    waitFor: "main" },
  { file: "automation/auto-replies.png",     url: "/flows/auto-replies",        waitFor: "main" },
  { file: "automation/ai-intent.png",        url: "/flows/ai-intent-matching",  waitFor: "main" },
  { file: "analytics/dashboard.png",         url: "/analytics",                 waitFor: "main" },
  { file: "deals/deals.png",                url: "/deals",                     waitFor: "main" },
  { file: "settings/members.png",           url: "/settings/members",          waitFor: "main" },
  { file: "settings/roles.png",             url: "/settings/roles",            waitFor: "main" },
  { file: "settings/labels.png",            url: "/settings/inbox-labels",     waitFor: "main" },
  { file: "settings/canned-responses.png",  url: "/settings/canned-responses", waitFor: "main" },
  { file: "settings/whatsapp-account.png",  url: "/settings/whatsapp-account", waitFor: "main" },
  { file: "settings/ai.png",               url: "/settings/ai",               waitFor: "main" },
  { file: "settings/billing.png",          url: "/settings/billing",          waitFor: "main" },
  { file: "trust-score/trust-score.png",   url: "/trust-score",               waitFor: "main" },
  { file: "messages/messages-log.png",     url: "/messages",                  waitFor: "main" },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function ensureDir(file: string) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
}

function getMasks(page: Page, url: string): Locator[] {
  const selectors: string[] = [];
  for (const [pattern, sels] of Object.entries(PII_MASKS)) {
    if (url.startsWith(pattern)) {
      selectors.push(...sels);
    }
  }
  return selectors.map((sel) => page.locator(sel));
}

// ── Login ─────────────────────────────────────────────────────────────────────

async function login(browser: Browser): Promise<void> {
  console.log("  → Logging in to wbmsg.com...");
  const ctx = await browser.newContext({ viewport: VIEWPORT });
  const page = await ctx.newPage();

  await page.goto(`${BASE}/sign-in`, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForSelector("input", { timeout: 15_000 });
  await page.locator("input").first().fill(EMAIL);
  await page.keyboard.press("Enter");

  await page.waitForSelector("input[type='password']", { timeout: 20_000 });
  await page.locator("input[type='password']").fill(PASSWORD);
  await page.keyboard.press("Enter");

  await page.waitForURL(
    (url) => !url.toString().includes("/sign-in") && !url.toString().includes("/sign-up"),
    { timeout: 60_000 }
  );
  await page.waitForLoadState("networkidle").catch(() => {});
  console.log(`  → Logged in — at ${page.url()}`);

  await ctx.storageState({ path: SESSION_FILE });
  await ctx.close();
}

// ── Page validation ───────────────────────────────────────────────────────────

async function validate(page: Page, url: string): Promise<{ ok: boolean; reason?: string }> {
  const currentUrl = page.url();

  // Redirected to sign-in → session dead
  if (currentUrl.includes("/sign-in")) {
    return { ok: false, reason: "redirected to sign-in (session expired)" };
  }

  // Landed on an entirely different path → route doesn't exist
  const expectedPath = new URL(BASE + url).pathname;
  const actualPath = new URL(currentUrl).pathname;
  if (!actualPath.startsWith(expectedPath.replace(/\/$/, ""))) {
    return { ok: false, reason: `unexpected redirect to ${actualPath}` };
  }

  // Next.js 404 / 500 error pages
  const h1Text = await page.locator("h1").first().textContent({ timeout: 3_000 }).catch(() => "");
  if (h1Text && /404|500|not found|server error/i.test(h1Text)) {
    return { ok: false, reason: `error page: "${h1Text.trim()}"` };
  }

  // Persistent loading spinner (skeleton / spinner still visible after networkidle)
  const hasSpinner = await page.locator(
    "[class*='animate-spin'], [class*='animate-pulse'][class*='skeleton'], [data-loading='true']"
  ).first().isVisible({ timeout: 2_000 }).catch(() => false);
  if (hasSpinner) {
    return { ok: false, reason: "page still loading (spinner visible)" };
  }

  // main element must have some meaningful content (not just nav + empty div)
  const mainContent = await page.locator("main").textContent({ timeout: 3_000 }).catch(() => "");
  if (!mainContent || mainContent.trim().length < 20) {
    return { ok: false, reason: "main content appears empty" };
  }

  return { ok: true };
}

// ── Capture ───────────────────────────────────────────────────────────────────

async function capture(page: Page, shot: (typeof SHOTS)[number]) {
  const outPath = path.join(OUT, shot.file);
  ensureDir(outPath);

  await page.goto(`${BASE}${shot.url}`, { waitUntil: "domcontentloaded", timeout: 30_000 });

  if (shot.waitFor) {
    await page.waitForSelector(shot.waitFor, { timeout: 15_000 }).catch(() => {});
  }

  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(700);

  // Validate page before shooting
  const { ok, reason } = await validate(page, shot.url);
  if (!ok) {
    console.warn(`  ⏭ Skipped ${shot.file} — ${reason}`);
    return;
  }

  const maskLocators = getMasks(page, shot.url);

  await page.screenshot({
    path: outPath,
    fullPage: false,
    mask: maskLocators,
    maskColor: MASK_COLOR,
  });

  const maskedCount = maskLocators.length;
  console.log(`  ✓ ${shot.file}${maskedCount > 0 ? ` (${maskedCount} PII selectors masked)` : ""}`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  fs.mkdirSync(OUT, { recursive: true });

  console.log("\n📸 WBMSG Docs Screenshot Capture — PII masked");
  console.log(`   Target: ${BASE}`);
  console.log(`   Output: ${OUT}\n`);

  const browser = await chromium.launch({ headless: false });

  try {
    const sessionValid =
      fs.existsSync(SESSION_FILE) &&
      Date.now() - fs.statSync(SESSION_FILE).mtimeMs < 60 * 60 * 1000;

    if (!sessionValid) {
      await login(browser);
    } else {
      console.log("  → Reusing saved session\n");
    }

    const context = await browser.newContext({
      viewport: VIEWPORT,
      storageState: SESSION_FILE,
    });
    const page = await context.newPage();
    page.on("console", () => {});
    page.on("pageerror", () => {});

    // Verify session
    await page.goto(`${BASE}/dashboard`, { waitUntil: "domcontentloaded", timeout: 30_000 });
    if (page.url().includes("/sign-in")) {
      console.log("  → Session expired — re-logging in...");
      await context.close();
      fs.rmSync(SESSION_FILE, { force: true });
      await login(browser);
      const ctx2 = await browser.newContext({ viewport: VIEWPORT, storageState: SESSION_FILE });
      const p2 = await ctx2.newPage();
      for (const shot of SHOTS) {
        await capture(p2, shot).catch((e: unknown) =>
          console.warn(`  ⚠ ${shot.file}: ${(e as Error).message}`)
        );
      }
    } else {
      for (const shot of SHOTS) {
        await capture(page, shot).catch((e: unknown) =>
          console.warn(`  ⚠ ${shot.file}: ${(e as Error).message}`)
        );
      }
    }

    console.log(`\n✅ Done — ${SHOTS.length} screenshots with PII masked`);
  } finally {
    await browser.close();
  }
}

main().catch(console.error);
