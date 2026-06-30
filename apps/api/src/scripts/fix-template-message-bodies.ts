/**
 * Patches existing template messages that have a UUID stored as body
 * with the actual template body text from the template components.
 * Dry-run by default. Pass --apply to execute.
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const DB = "postgresql://postgres:TWaGRPILYCQYOdRGipvyAtvpUfWRLSOK@trolley.proxy.rlwy.net:28192/railway";
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: DB }) });
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const apply = process.argv.includes("--apply");

async function q<T>(sql: string): Promise<T[]> {
  return prisma.$queryRawUnsafe<T>(sql) as Promise<T[]>;
}

async function main(): Promise<void> {
  // Find messages where body is a UUID (template ID stored incorrectly)
  const msgs = await q<{ id: string; body: string; organization_id: string }>(
    `SELECT id, body, organization_id FROM messages
     WHERE content_type = 'template' AND body ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     ORDER BY created_at DESC`
  );

  console.info(`Found ${msgs.length} messages with UUID body`);

  for (const msg of msgs) {
    const templateId = msg.body;
    // Look up the template
    const templates = await q<{ id: string; name: string; components: unknown }>(
      `SELECT id, name, components FROM templates WHERE id = '${templateId}'`
    );
    const tpl = templates[0];
    if (!tpl) {
      console.info(`  [SKIP] msg:${msg.id} — template ${templateId} not found`);
      continue;
    }

    const comps = (tpl.components ?? []) as Array<{ type?: string; text?: string; format?: string; buttons?: Array<{ type?: string; text?: string }> }>;
    const headerComp = comps.find((c) => c.type?.toUpperCase() === "HEADER");
    const bodyComp = comps.find((c) => c.type?.toUpperCase() === "BODY");
    const footerComp = comps.find((c) => c.type?.toUpperCase() === "FOOTER");
    const btnsComp = comps.find((c) => c.type?.toUpperCase() === "BUTTONS");

    const newBody = JSON.stringify({
      header: headerComp ? { format: headerComp.format ?? "TEXT", text: headerComp.text } : undefined,
      body: bodyComp?.text ?? tpl.name,
      footer: footerComp?.text,
      buttons: (btnsComp as { buttons?: Array<{ type?: string; text?: string }> } | undefined)?.buttons ?? [],
    });

    console.info(`  msg:${msg.id} template:"${tpl.name}" body:"${bodyComp?.text?.slice(0, 60)}..."`);

    if (apply) {
      await q(`UPDATE messages SET body = '${newBody.replace(/'/g, "''")}' WHERE id = '${msg.id}'`);
      console.info(`    ✅ updated`);
    }
  }

  if (!apply) {
    console.info("\n[DRY RUN] Pass --apply to update the DB.");
  } else {
    console.info("\n✅ Done.");
  }
}

main()
  .catch((e: unknown) => console.error(e))
  .finally(() => prisma.$disconnect());
