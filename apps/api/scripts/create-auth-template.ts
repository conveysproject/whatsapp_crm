/**
 * Creates the WhatsApp sign-in code template on the Conveys org's WhatsApp Business account
 * (own-auth Phase 4, runbook docs/runbooks/own-auth-sign-in-providers.md §1.1).
 * Meta Authentication category: Meta writes the text; copy-code button; security note; 10-minute expiry.
 *
 * DRY RUN by default: finds the org, checks the WABA connection and whether the template already exists.
 * Prints ids and statuses only — never the access token. --apply submits the template to Meta.
 *
 * Usage (from the Railway-linked folder; DATABASE_PUBLIC_URL is injected by railway):
 *   railway run --service Postgres npx tsx scripts/create-auth-template.ts            # dry run
 *   railway run --service Postgres npx tsx scripts/create-auth-template.ts --apply    # submit to Meta
 */
import { pathToFileURL } from "node:url";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const GRAPH = "https://graph.facebook.com/v25.0";
export const CONVEYS_ORG_NAME = "Conveys Information Technology";
export const TEMPLATE_NAME = "wbmsg_login_code";
export const TEMPLATE_LANG = "en_US";

/** Meta's Authentication-template payload (copy code, security recommendation, 10-minute expiry). */
export function authTemplatePayload(): Record<string, unknown> {
  return {
    name: TEMPLATE_NAME,
    language: TEMPLATE_LANG,
    category: "AUTHENTICATION",
    components: [
      { type: "BODY", add_security_recommendation: true },
      { type: "FOOTER", code_expiration_minutes: 10 },
      { type: "BUTTONS", buttons: [{ type: "OTP", otp_type: "COPY_CODE", text: "Copy code" }] },
    ],
  };
}

async function main(): Promise<void> {
  const apply = process.argv.includes("--apply");
  const url = process.env["DATABASE_PUBLIC_URL"] ?? process.env["DATABASE_URL"];
  if (!url) throw new Error("DATABASE_PUBLIC_URL or DATABASE_URL is not set");
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  try {
    const orgs = await prisma.organization.findMany({
      where: { name: CONVEYS_ORG_NAME },
      select: { id: true, whatsappBusinessAccountId: true, phoneNumberId: true, wabaAccessToken: true },
    });
    if (orgs.length !== 1) throw new Error(`expected exactly one "${CONVEYS_ORG_NAME}" org, found ${orgs.length}`);
    const org = orgs[0]!;
    console.log(`org id: ${org.id}`);
    console.log(`waba connected: ${Boolean(org.whatsappBusinessAccountId && org.wabaAccessToken)}, phone number set: ${Boolean(org.phoneNumberId)}`);
    if (!org.whatsappBusinessAccountId || !org.wabaAccessToken) throw new Error("Conveys org has no connected WhatsApp Business account");
    const auth = { Authorization: `Bearer ${org.wabaAccessToken}` };

    const existingRes = await fetch(`${GRAPH}/${org.whatsappBusinessAccountId}/message_templates?name=${TEMPLATE_NAME}&fields=name,status,category,language`, { headers: auth });
    const existing = (await existingRes.json()) as { data?: Array<{ name: string; status: string; category: string; language: string }>; error?: { message?: string } };
    if (!existingRes.ok) throw new Error(`Meta lookup failed (${existingRes.status}): ${existing.error?.message ?? "unknown"}`);
    const found = (existing.data ?? []).filter((t) => t.name === TEMPLATE_NAME);
    console.log(`existing "${TEMPLATE_NAME}": ${found.length ? found.map((t) => `${t.language}/${t.category}/${t.status}`).join(", ") : "none"}`);
    if (!apply) { console.log("mode: dry run (nothing submitted)"); return; }
    if (found.some((t) => t.language === TEMPLATE_LANG)) { console.log("template already exists for en_US — nothing to do"); return; }

    const res = await fetch(`${GRAPH}/${org.whatsappBusinessAccountId}/message_templates`, {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify(authTemplatePayload()),
    });
    const body = (await res.json()) as { id?: string; status?: string; category?: string; error?: { message?: string; error_user_msg?: string } };
    if (!res.ok) throw new Error(`Meta rejected the template (${res.status}): ${body.error?.error_user_msg ?? body.error?.message ?? "unknown"}`);
    console.log(`submitted: id ${body.id}, status ${body.status}, category ${body.category}`);
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err: unknown) => {
    console.error("failed:", err instanceof Error ? err.message.split("\n")[0] : "unknown error");
    process.exit(1);
  });
}
