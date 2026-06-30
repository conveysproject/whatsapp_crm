import { prisma } from "../lib/prisma.js";

async function main() {
  const rows = await prisma.$queryRawUnsafe<
    { id: string; organization_id: string; content_type: string; body: string | null }[]
  >(`
    SELECT id, organization_id, content_type, body
    FROM messages
    WHERE content_type IN ('template', 'interactive')
      AND body IS NOT NULL
      AND body LIKE '{%'
    ORDER BY created_at DESC
  `);
  console.log(`Found ${rows.length} messages with JSON-shaped body:\n`);
  for (const r of rows) {
    console.log(`[${r.organization_id}] ${r.id} (${r.content_type})`);
    console.log(`  body: ${r.body?.slice(0, 200)}`);
  }
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
