import { registry } from "../../lib/docs/registry";

const BASE = "https://wbmsg.com";

export const dynamic = "force-static";

export function GET() {
  const lines: string[] = [
    "# WBMSG Help Center",
    "",
    "> WBMSG is a WhatsApp-first CRM for small and medium businesses. It connects to the official Meta WhatsApp Business API and gives teams a shared inbox, contact management, broadcast campaigns, automation flows, and AI-powered smart replies — all in one platform.",
    "",
    `> Full documentation: ${BASE}/docs`,
    `> Sitemap: ${BASE}/sitemap.xml`,
    "",
  ];

  for (const cat of registry) {
    lines.push(`## ${cat.title}`);
    lines.push("");
    lines.push(`${cat.description}`);
    lines.push("");
    for (const art of cat.articles) {
      lines.push(`- [${art.title}](${BASE}/docs/${cat.slug}/${art.slug}): ${art.description}`);
    }
    lines.push("");
  }

  return new Response(lines.join("\n"), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=86400, stale-while-revalidate=3600",
    },
  });
}
