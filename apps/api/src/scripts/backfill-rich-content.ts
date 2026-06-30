import { prisma } from "../lib/prisma.js";

const APPLY = process.argv.includes("--apply");

interface TemplateJson {
  templateName?: string;
  header?: unknown;
  body?: string | null;
  footer?: unknown;
  buttons?: unknown;
  carousel?: unknown;
}

interface InteractiveReplyJson {
  button_reply?: { id: string; title: string };
  list_reply?: { id: string; title: string };
}

interface InteractiveFullJson {
  type?: string;
  body?: { text?: string };
}

async function main() {
  const rows = await prisma.$queryRawUnsafe<
    { id: string; conversation_id: string; organization_id: string; content_type: string; body: string }[]
  >(`
    SELECT id, conversation_id, organization_id, content_type, body
    FROM messages
    WHERE content_type IN ('template', 'interactive')
      AND body IS NOT NULL
      AND body LIKE '{%'
    ORDER BY created_at DESC
  `);

  console.log(`${APPLY ? "APPLYING" : "DRY RUN"} — ${rows.length} messages to backfill\n`);

  for (const row of rows) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(row.body);
    } catch {
      console.log(`[skip] ${row.id} — body not valid JSON`);
      continue;
    }

    let newBody: string | null = null;
    let richContent: unknown = null;

    if (row.content_type === "template") {
      const t = parsed as TemplateJson;
      newBody = t.body ?? null;
      richContent = { templateName: t.templateName, header: t.header, footer: t.footer, buttons: t.buttons, carousel: t.carousel };
    } else {
      const r = parsed as InteractiveReplyJson & InteractiveFullJson;
      if (r.button_reply) {
        newBody = r.button_reply.title;
        richContent = { button_reply: r.button_reply };
      } else if (r.list_reply) {
        newBody = r.list_reply.title;
        richContent = { list_reply: r.list_reply };
      } else {
        newBody = r.body?.text ?? null;
        richContent = parsed;
      }
    }

    // Resolve any leftover unresolved positional placeholders ({{1}}, {{2}}…) using the
    // conversation's contact — covers the 3 known Conveys messages sent before the
    // campaign worker's positional-variable bug fix.
    if (newBody && /\{\{\d+\}\}/.test(newBody)) {
      const contact = await prisma.$queryRawUnsafe<{ first_name: string | null; last_name: string | null; phone_number: string }[]>(`
        SELECT c.first_name, c.last_name, c.phone_number
        FROM conversations conv
        JOIN contacts c ON c.id = conv.contact_id
        WHERE conv.id = $1
      `, row.conversation_id);
      const name = contact[0] ? [contact[0].first_name, contact[0].last_name].filter(Boolean).join(" ") || contact[0].phone_number : null;
      if (name) {
        newBody = newBody.replace(/\{\{1\}\}/g, name);
      }
    }

    console.log(`[${row.organization_id}] ${row.id} (${row.content_type})`);
    console.log(`  old body: ${row.body.slice(0, 80)}...`);
    console.log(`  new body: ${newBody}`);
    console.log(`  rich_content: ${JSON.stringify(richContent).slice(0, 120)}...`);

    if (APPLY) {
      await prisma.$executeRawUnsafe(
        `UPDATE messages SET body = $1, rich_content = $2 WHERE id = $3`,
        newBody,
        JSON.stringify(richContent),
        row.id
      );
    }
    console.log("");
  }

  console.log(APPLY ? "Done — applied." : "Dry run complete — pass --apply to write changes.");
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
