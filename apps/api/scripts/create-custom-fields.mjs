import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const dbUrl = process.env.DATABASE_PUBLIC_URL ?? process.env.DATABASE_URL;
if (!dbUrl) { console.error('DATABASE_URL not set'); process.exit(1); }

const adapter = new PrismaPg({ connectionString: dbUrl });
const prisma = new PrismaClient({ adapter });

// Get org — pass ORG_NAME env var to target a specific org, or leave blank for all
const orgName = process.env.ORG_NAME;
const orgs = await prisma.organization.findMany({
  where: orgName ? { name: { contains: orgName, mode: 'insensitive' } } : undefined,
  select: { id: true, name: true },
});

if (orgs.length === 0) {
  console.error('No organizations found' + (orgName ? ` matching "${orgName}"` : ''));
  await prisma.$disconnect();
  process.exit(1);
}

console.log('Organizations found:');
orgs.forEach(o => console.log(`  [${o.id}] ${o.name}`));

// Inferred from CSV sample: 12, 67687687687, tttt, tttt, 2026-05-26, 00:56, kjnkjnkjhkjhkj, Option 1, true
const FIELDS = [
  { inputName: 'Custom Field 1', fieldKey: 'custom_field_1', inputType: 'number' },
  { inputName: 'Custom Field 2', fieldKey: 'custom_field_2', inputType: 'number' },
  { inputName: 'Custom Field 3', fieldKey: 'custom_field_3', inputType: 'text' },
  { inputName: 'Custom Field 4', fieldKey: 'custom_field_4', inputType: 'text' },
  { inputName: 'Custom Field 5', fieldKey: 'custom_field_5', inputType: 'date' },
  { inputName: 'Custom Field 6', fieldKey: 'custom_field_6', inputType: 'time' },
  { inputName: 'Custom Field 7', fieldKey: 'custom_field_7', inputType: 'text' },
  { inputName: 'Custom Field 8', fieldKey: 'custom_field_8', inputType: 'text' },
  { inputName: 'Custom Field 9', fieldKey: 'custom_field_9', inputType: 'boolean' },
];

for (const org of orgs) {
  console.log(`\n--- Creating custom fields for org: ${org.name} ---`);
  for (const f of FIELDS) {
    const result = await prisma.contactCustomField.upsert({
      where: { organizationId_fieldKey: { organizationId: org.id, fieldKey: f.fieldKey } },
      create: { organizationId: org.id, ...f },
      update: { inputType: f.inputType },
    });
    console.log(`  ✓ ${result.inputName} (${result.inputType}) — ${result.id}`);
  }
}

await prisma.$disconnect();
console.log('\nDone.');
