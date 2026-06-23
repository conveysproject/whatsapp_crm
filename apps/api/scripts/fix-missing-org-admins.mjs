import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

// Safety: dry-run by default. Pass --apply to actually write.
const APPLY = process.argv.includes('--apply');
console.log(APPLY ? '== APPLY MODE — changes WILL be written ==' : '== DRY RUN — no changes (pass --apply to write) ==\n');

const orgs = await prisma.organization.findMany({ select: { id: true, name: true } });
let toFix = 0;

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
    select: { id: true, email: true, role: true },
  });
  if (!creator) {
    console.log(`- ${org.id} (${org.name}) — no active users, skipped`);
    continue;
  }

  toFix++;
  if (APPLY) {
    await prisma.user.update({ where: { id: creator.id }, data: { role: 'admin' } });
    console.log(`✓ ${org.id} (${org.name}) — promoted ${creator.email} (was ${creator.role}) to admin`);
  } else {
    console.log(`would promote: ${org.id} (${org.name}) — ${creator.email} (currently ${creator.role}) → admin`);
  }
}

await prisma.$disconnect();
if (APPLY) {
  console.log(`\nDone. Promoted ${toFix} org creator(s).`);
  console.log('Note: auth cache TTL is 60s — affected users may need up to 1 minute, or re-login.');
} else {
  console.log(`\nDry run complete. ${toFix} org(s) would be fixed. Re-run with --apply to write.`);
}
