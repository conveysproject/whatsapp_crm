/**
 * Generates all favicon sizes from public/logo-source.png.
 * Run: npx tsx apps/web/scripts/generate-favicon.ts
 */

import { chromium } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

const PUBLIC = path.resolve(__dirname, "../public");
const SOURCE = path.join(PUBLIC, "logo-source.png");

const SIZES = [
  { size: 16,  file: "favicon-16x16.png" },
  { size: 32,  file: "favicon-32x32.png" },
  { size: 48,  file: "favicon-48x48.png" },
  { size: 180, file: "apple-touch-icon.png" },
  { size: 192, file: "android-chrome-192x192.png" },
  { size: 512, file: "android-chrome-512x512.png" },
];

function html(size: number, b64: string) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    * { margin:0; padding:0; }
    body { width:${size}px; height:${size}px; overflow:hidden; background:transparent; }
    img { width:${size}px; height:${size}px; object-fit:contain; }
  </style></head><body><img src="data:image/png;base64,${b64}"/></body></html>`;
}

async function main() {
  if (!fs.existsSync(SOURCE)) {
    console.error("Missing public/logo-source.png — copy your logo there first.");
    process.exit(1);
  }

  const b64 = fs.readFileSync(SOURCE).toString("base64");

  console.log("🎨 Generating WBMSG favicons from logo-source.png...\n");

  const browser = await chromium.launch({ headless: true });

  for (const { size, file } of SIZES) {
    const page = await browser.newPage();
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(html(size, b64), { waitUntil: "networkidle" });
    await page.waitForTimeout(100);

    const outPath = path.join(PUBLIC, file);
    await page.screenshot({
      path: outPath,
      type: "png",
      omitBackground: true,
      clip: { x: 0, y: 0, width: size, height: size },
    });
    await page.close();
    console.log(`  ✓ ${file} (${size}×${size})`);
  }

  await browser.close();

  // site.webmanifest
  const manifest = {
    name: "WBMSG",
    short_name: "WBMSG",
    description: "WhatsApp-first CRM for teams",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#0BBF77",
    icons: [
      { src: "/android-chrome-192x192.png", sizes: "192x192", type: "image/png" },
      { src: "/android-chrome-512x512.png", sizes: "512x512", type: "image/png" },
    ],
  };
  fs.writeFileSync(path.join(PUBLIC, "site.webmanifest"), JSON.stringify(manifest, null, 2));
  console.log("  ✓ site.webmanifest");

  console.log("\n✅ All favicon assets saved to public/");
}

main().catch(console.error);
