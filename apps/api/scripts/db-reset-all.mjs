import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

// Only countries is preserved (seed reference data)
const PRESERVE = new Set(['countries']);

const EXTRA_TABLES = [
  'organization_members',
  'users',
  'organizations',
  'platform_configs',
];

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) { console.error('DATABASE_URL not set'); process.exit(1); }

const adapter = new PrismaPg({ connectionString: dbUrl });
const prisma = new PrismaClient({ adapter });

console.log('\n=== DELETING: platform_configs, organizations, organization_members, users ===\n');

await prisma.$executeRawUnsafe('SET session_replication_role = replica;');

for (const table of EXTRA_TABLES) {
  try {
    const rows = await prisma.$executeRawUnsafe(`DELETE FROM "${table}"`);
    console.log(`✓ ${table} — ${rows} rows deleted`);
  } catch (e) {
    console.error(`✗ ${table} — ERROR: ${e.message?.split('\n')[0]}`);
  }
}

await prisma.$executeRawUnsafe('SET session_replication_role = DEFAULT;');
await prisma.$disconnect();

console.log('\n=== DONE ===');
