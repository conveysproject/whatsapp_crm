import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const DB = "postgresql://postgres:TWaGRPILYCQYOdRGipvyAtvpUfWRLSOK@trolley.proxy.rlwy.net:28192/railway";
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: DB }) });
const ORG = "org_3FoEbm5wEKZ6G8tMdhgT7Zksiu6";
const apply = process.argv.includes("--apply");

async function q<T>(sql: string): Promise<T[]> {
  return prisma.$queryRawUnsafe<T>(sql) as Promise<T[]>;
}

async function main(): Promise<void> {
  // Check the template components for image URL
  const tpls = await q<{ id: string; name: string; components: unknown }>(
    `SELECT id, name, components FROM templates WHERE name = 'conveys_wbmsg_introduction'`
  );
  const tpl = tpls[0];
  if (!tpl) { console.error("Template not found"); return; }

  const comps = tpl.components as Array<{ type?: string; format?: string; example?: { header_handle?: string[] } }>;
  const headerComp = comps.find(c => c.type?.toUpperCase() === "HEADER");
  const imageUrl = headerComp?.example?.header_handle?.[0] ?? null;
  console.info(`Template header format: ${headerComp?.format}`);
  console.info(`Template image URL: ${imageUrl}`);

  // Check campaigns for mediaUrl
  const camps = await q<{ id: string; name: string; media_url: string | null }>(
    `SELECT id, name, media_url FROM campaigns WHERE organization_id = '${ORG}' ORDER BY created_at DESC LIMIT 5`
  );
  console.info("\nCampaigns:");
  for (const c of camps) {
    console.info(`  "${c.name}" mediaUrl=${c.media_url ?? "NULL"}`);
  }

  // Use R2 campaign media URL (permanent) over WhatsApp CDN URL (expires)
  const r2Url = camps.find(c => c.media_url)?.media_url ?? imageUrl;
  console.info(`\nUsing image URL: ${r2Url}`);

  if (!r2Url) { console.info("\nNo image URL found. Cannot patch."); return; }

  // Patch the 3 template messages — add mediaUrl to header
  const msgs = await q<{ id: string; body: string }>(
    `SELECT id, body FROM messages
     WHERE organization_id = '${ORG}' AND content_type = 'template'
     ORDER BY created_at DESC LIMIT 10`
  );

  console.info("\nMessages to patch:");
  for (const m of msgs) {
    try {
      const parsed = JSON.parse(m.body) as { header?: { format?: string; mediaUrl?: string }; body?: string };
      if (parsed.header?.format?.toUpperCase() === "IMAGE" && !parsed.header.mediaUrl) {
        parsed.header.mediaUrl = r2Url;
        const newBody = JSON.stringify(parsed).replace(/'/g, "''");
        console.info(`  msg:${m.id} → adding mediaUrl`);
        if (apply) {
          await q(`UPDATE messages SET body = '${newBody}' WHERE id = '${m.id}'`);
          console.info(`    ✅ updated`);
        }
      }
    } catch { /* skip non-JSON */ }
  }

  if (!apply) console.info("\n[DRY RUN] Pass --apply to update.");
  else console.info("\n✅ Done.");
}

main()
  .catch((e: unknown) => console.error(e))
  .finally(() => prisma.$disconnect());
