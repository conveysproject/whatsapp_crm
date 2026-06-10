import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const db = new PrismaClient({ adapter });
const templates = await db.template.findMany({
  where: { name: { contains: "jaspers_market" } },
  select: {
    id: true,
    name: true,
    status: true,
    category: true,
    language: true,
    metaTemplateId: true,
    components: true,
    createdAt: true,
    updatedAt: true,
  },
});
console.log(JSON.stringify(templates, null, 2));
await db.$disconnect();
