import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const rows = await prisma.vendorSetting.findMany({
  where: { key: { startsWith: 'role_permissions_' } },
  select: { organizationId: true, key: true, value: true },
});

for (const row of rows) {
  console.log(`\n[${row.key}] org=${row.organizationId}`);
  try {
    console.log(JSON.stringify(JSON.parse(row.value), null, 2));
  } catch {
    console.log(row.value);
  }
}

if (rows.length === 0) console.log('No role_permissions_* rows found in vendor_settings');

await prisma.$disconnect();
