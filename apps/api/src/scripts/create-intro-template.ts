/**
 * Creates the "conveys_wbmsg_introduction" MARKETING template in the prod DB.
 * Status will be "pending" — review on the Templates page then click Submit to send to Meta.
 *
 * Usage (from apps/api directory):
 *   node_modules/.bin/tsx src/scripts/create-intro-template.ts          # dry run
 *   node_modules/.bin/tsx src/scripts/create-intro-template.ts --apply  # write to DB
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const apply = process.argv.includes("--apply");

// Public Railway Postgres URL (works from local machine)
const DB_URL = "postgresql://postgres:TWaGRPILYCQYOdRGipvyAtvpUfWRLSOK@trolley.proxy.rlwy.net:28192/railway";

const adapter = new PrismaPg({ connectionString: DB_URL });
const prisma = new PrismaClient({ adapter });

const TEMPLATE_NAME = "conveys_wbmsg_introduction";
const TEMPLATE_BODY =
  "Hi {{1}},\n\n" +
  "I am reaching out from Conveys Information Technology — an Official Meta Tech Provider.\n\n" +
  "We build WBMSG, a WhatsApp CRM built on the Official WhatsApp Cloud API, designed to help businesses grow:\n\n" +
  "- Broadcast messages to your entire contact list\n" +
  "- Manage all customer conversations from one inbox\n" +
  "- Automate replies with smart chat flows\n" +
  "- Track campaign performance with real-time analytics\n\n" +
  "Free plan available. No credit card needed.\n\n" +
  "Get started at wbmsg.com";

const COMPONENTS = [
  {
    type: "HEADER",
    format: "IMAGE",
  },
  {
    type: "BODY",
    text: TEMPLATE_BODY,
  },
  {
    type: "FOOTER",
    text: "Official Meta Tech Provider",
  },
  {
    type: "BUTTONS",
    buttons: [{ type: "URL", text: "Try WBMSG Free", url: "https://wbmsg.com" }],
  },
];

async function main(): Promise<void> {
  console.info(`Mode: ${apply ? "APPLY" : "DRY RUN"}\n`);

  const org = await prisma.organization.findFirst({
    where: { slug: "conveys-information-technology-1782733095849254827" },
    select: { id: true, name: true, slug: true },
  });
  if (!org) {
    // Fallback: find by name
    const byName = await prisma.organization.findFirst({
      where: { name: { contains: "Conveys", mode: "insensitive" } },
      select: { id: true, name: true, slug: true },
    });
    if (!byName) {
      const all = await prisma.organization.findMany({ select: { id: true, name: true, slug: true } });
      console.error("Org not found. All orgs:", JSON.stringify(all, null, 2));
      return;
    }
    Object.assign(org ?? {}, byName);
  }

  const foundOrg = org ?? await prisma.organization.findFirst({
    where: { name: { contains: "Conveys", mode: "insensitive" } },
    select: { id: true, name: true, slug: true },
  });
  if (!foundOrg) { console.error("Org not found."); return; }

  console.info(`Org:  ${foundOrg.name}`);
  console.info(`ID:   ${foundOrg.id}`);
  console.info(`Slug: ${foundOrg.slug}\n`);

  const existing = await prisma.template.findFirst({
    where: { organizationId: foundOrg.id, name: TEMPLATE_NAME },
  });
  if (existing) {
    console.info(`Template "${TEMPLATE_NAME}" already exists (id: ${existing.id}, status: ${existing.status}).`);
    return;
  }

  console.info("Template to create:");
  console.info(`  name:     ${TEMPLATE_NAME}`);
  console.info(`  category: marketing`);
  console.info(`  language: en`);
  console.info(`  header:   IMAGE (dynamic — attach image at send time)`);
  console.info(`  body:     Hi {{1}}, I am reaching out from Conveys…`);
  console.info(`  footer:   Official Meta Tech Provider`);
  console.info(`  button:   Try WBMSG Free → https://wbmsg.com\n`);

  if (!apply) {
    console.info("--- DRY RUN — add --apply to write to DB ---");
    return;
  }

  const template = await prisma.template.create({
    data: {
      organizationId: foundOrg.id,
      name: TEMPLATE_NAME,
      category: "marketing",
      language: "en",
      components: COMPONENTS as object[],
      status: "pending",
    },
  });

  console.info(`✅ Template created in DB!`);
  console.info(`   DB Template ID: ${template.id}`);
  console.info(`   Status: pending`);
  console.info(`\nGo to Templates in WBMSG, find "${TEMPLATE_NAME}", review it, then click Submit to send to Meta for approval.`);
}

main()
  .catch((err: unknown) => { console.error(err); process.exit(1); })
  .finally(() => prisma.$disconnect());
