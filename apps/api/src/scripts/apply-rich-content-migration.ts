import { prisma } from "../lib/prisma.js";

async function main() {
  await prisma.$executeRawUnsafe(`ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "rich_content" JSONB;`);
  console.log("rich_content column added.");
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
