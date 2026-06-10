import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const dbUrl = process.env.DATABASE_PUBLIC_URL ?? process.env.DATABASE_URL;
if (!dbUrl) { console.error('No DATABASE_URL set'); process.exit(1); }
const ORG_ID = process.env.ORG_ID;
if (!ORG_ID) { console.error('No ORG_ID set'); process.exit(1); }

const adapter = new PrismaPg({ connectionString: dbUrl });
const prisma = new PrismaClient({ adapter });

console.log('Org:', ORG_ID);

const PIPELINES = [
  {
    name: 'Sales Pipeline',
    stages: ['New', 'Contacted', 'Qualified', 'Proposal Sent', 'Negotiation', 'Won', 'Lost'],
  },
  {
    name: 'Onboarding Pipeline',
    stages: ['Signed Up', 'Demo Done', 'Trial Active', 'Converted', 'Churned'],
  },
  {
    name: 'Support Pipeline',
    stages: ['Open', 'In Progress', 'Waiting on Customer', 'Resolved'],
  },
];

console.log(`\nCreating ${PIPELINES.length} pipelines...`);
for (const p of PIPELINES) {
  const existing = await prisma.pipeline.findFirst({
    where: { organizationId: ORG_ID, name: p.name },
  });
  if (existing) {
    console.log(`  ~ "${p.name}" (already exists)`);
    continue;
  }
  const created = await prisma.pipeline.create({
    data: { organizationId: ORG_ID, name: p.name, stages: p.stages },
  });
  console.log(`  ✓ "${created.name}" — ${created.id} (${p.stages.length} stages)`);
}

await prisma.$disconnect();
console.log('\nDone.');
