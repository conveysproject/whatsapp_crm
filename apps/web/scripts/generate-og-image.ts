/**
 * Generates public/og-image.png — the default social sharing card for wbmsg.com.
 * Run: npx tsx apps/web/scripts/generate-og-image.ts
 */

import { chromium } from "@playwright/test";
import * as path from "path";

const OUT = path.resolve(__dirname, "../public/og-image.png");

const HTML = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: 1200px; height: 630px; overflow: hidden;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    background: #0a1628;
  }

  .wrap {
    width: 1200px; height: 630px;
    background: linear-gradient(135deg, #0a1628 0%, #0c1f3a 60%, #0a2a1a 100%);
    position: relative;
    display: flex;
    flex-direction: column;
    padding: 64px 72px;
    overflow: hidden;
  }

  /* subtle grid lines */
  .wrap::before {
    content: '';
    position: absolute;
    inset: 0;
    background-image:
      linear-gradient(rgba(11,191,119,0.04) 1px, transparent 1px),
      linear-gradient(90deg, rgba(11,191,119,0.04) 1px, transparent 1px);
    background-size: 48px 48px;
  }

  /* glow orb */
  .wrap::after {
    content: '';
    position: absolute;
    top: -120px; right: -120px;
    width: 480px; height: 480px;
    border-radius: 50%;
    background: radial-gradient(circle, rgba(11,191,119,0.18) 0%, transparent 70%);
    pointer-events: none;
  }

  .logo-row {
    display: flex;
    align-items: center;
    gap: 14px;
    position: relative;
    z-index: 1;
  }

  .logo-badge {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    background: #0BBF77;
    color: white;
    padding: 10px 22px;
    border-radius: 10px;
    font-size: 18px;
    font-weight: 800;
    letter-spacing: -0.02em;
  }

  .logo-badge svg { width: 20px; height: 20px; flex-shrink: 0; }

  .tagline-dot {
    width: 6px; height: 6px; border-radius: 50%;
    background: rgba(255,255,255,0.2);
  }

  .logo-sub {
    font-size: 14px;
    color: rgba(255,255,255,0.4);
    font-weight: 500;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .body {
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: center;
    position: relative;
    z-index: 1;
    padding: 32px 0;
  }

  .headline {
    font-size: 58px;
    font-weight: 800;
    color: #ffffff;
    line-height: 1.05;
    letter-spacing: -0.035em;
    margin-bottom: 24px;
  }

  .headline em {
    font-style: normal;
    color: #0BBF77;
  }

  .subline {
    font-size: 20px;
    color: rgba(255,255,255,0.5);
    line-height: 1.55;
    max-width: 640px;
    font-weight: 400;
  }

  .pills {
    display: flex;
    gap: 10px;
    margin-top: 36px;
    flex-wrap: wrap;
  }

  .pill {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: rgba(255,255,255,0.07);
    border: 1px solid rgba(255,255,255,0.1);
    color: rgba(255,255,255,0.65);
    padding: 7px 14px;
    border-radius: 999px;
    font-size: 13px;
    font-weight: 500;
  }

  .pill-dot {
    width: 6px; height: 6px; border-radius: 50%;
    background: #0BBF77;
    flex-shrink: 0;
  }

  .footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    position: relative;
    z-index: 1;
  }

  .domain {
    font-size: 15px;
    color: rgba(255,255,255,0.25);
    font-weight: 500;
    letter-spacing: 0.01em;
  }

  .meta-badge {
    display: flex;
    align-items: center;
    gap: 8px;
    background: rgba(255,255,255,0.05);
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 8px;
    padding: 7px 14px;
    font-size: 12px;
    color: rgba(255,255,255,0.35);
    font-weight: 500;
  }
</style>
</head>
<body>
<div class="wrap">
  <div class="logo-row">
    <div class="logo-badge">
      <!-- WhatsApp-style icon -->
      <svg viewBox="0 0 24 24" fill="white">
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
      </svg>
      WBMSG
    </div>
    <div class="tagline-dot"></div>
    <div class="logo-sub">WhatsApp CRM</div>
  </div>

  <div class="body">
    <div class="headline">
      Turn WhatsApp into your<br>
      <em>team's growth engine</em>
    </div>
    <div class="subline">
      Shared inbox, contacts, broadcast campaigns, automation flows,
      and AI smart replies — powered by the official Meta API.
    </div>
    <div class="pills">
      <div class="pill"><div class="pill-dot"></div>Shared Team Inbox</div>
      <div class="pill"><div class="pill-dot"></div>Broadcast Campaigns</div>
      <div class="pill"><div class="pill-dot"></div>Automation Flows</div>
      <div class="pill"><div class="pill-dot"></div>AI Smart Replies</div>
      <div class="pill"><div class="pill-dot"></div>Contact Management</div>
    </div>
  </div>

  <div class="footer">
    <div class="domain">wbmsg.com</div>
    <div class="meta-badge">Official Meta WhatsApp Business API Partner</div>
  </div>
</div>
</body>
</html>`;

async function main() {
  console.log("🎨 Generating og-image.png...");

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  await page.setViewportSize({ width: 1200, height: 630 });
  await page.setContent(HTML, { waitUntil: "networkidle" });
  await page.waitForTimeout(300);

  await page.screenshot({ path: OUT, type: "png", clip: { x: 0, y: 0, width: 1200, height: 630 } });
  await browser.close();

  console.log(`✅ Saved to public/og-image.png`);
}

main().catch(console.error);
