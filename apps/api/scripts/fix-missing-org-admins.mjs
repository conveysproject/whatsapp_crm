import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const orgs = await prisma.organization.findMany({ select: { id: true, name: true } });
let fixed = 0;

for (const org of orgs) {
  const hasAdmin = await prisma.user.findFirst({
    where: { organizationId: org.id, isActive: true, role: { in: ['admin', 'superAdmin'] } },
    select: { id: true },
  });
  if (hasAdmin) continue;

  // Promote the oldest active user as the org creator/owner.
  const creator = await prisma.user.findFirst({
    where: { organizationId: org.id, isActive: true },
    orderBy: { createdAt: 'asc' },
    select: { id: true, email: true },
  });
  if (!creator) {
    console.log(`- ${org.id} (${org.name}) — no active users, skipped`);
    continue;
  }

  await prisma.user.update({ where: { id: creator.id }, data: { role: 'admin' } });
  fixed++;
  console.log(`✓ ${org.id} (${org.name}) — promoted ${creator.email} to admin`);
}

await prisma.$disconnect();
console.log(`\nDone. Promoted ${fixed} org creator(s).`);
console.log('Note: auth cache TTL is 60s — affected users may need up to 1 minute, or re-login.');
