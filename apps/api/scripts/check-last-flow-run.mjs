import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

// Last 5 flow runs with flow name
const runs = await prisma.flowRun.findMany({
  orderBy: { startedAt: 'desc' },
  take: 5,
  include: { flow: { select: { name: true, triggerType: true } } },
});

console.log('\n=== LAST 5 FLOW RUNS ===');
for (const r of runs) {
  console.log(`\n[${r.flow.name}] trigger=${r.flow.triggerType}`);
  console.log(`  status=${r.status}  steps=${r.stepsExecuted}  currentNode=${r.currentNodeId ?? 'none'}`);
  console.log(`  started=${r.startedAt.toISOString()}  completed=${r.completedAt?.toISOString() ?? 'pending'}`);
  if (r.error) console.log(`  ERROR: ${r.error}`);
}

// Last 6 outbound messages
const msgs = await prisma.message.findMany({
  where: { direction: 'outbound' },
  orderBy: { sentAt: 'desc' },
  take: 6,
  select: { body: true, contentType: true, sentAt: true },
});

console.log('\n=== LAST 6 OUTBOUND MESSAGES ===');
for (const m of msgs) {
  console.log(`  [${m.contentType}] ${m.body ?? '(media)'} — ${m.sentAt.toISOString()}`);
}

// Contact labels (tags)
const contact = await prisma.contact.findFirst({
  select: { name: true, phoneNumber: true, tags: true, leadStatusId: true },
});
console.log('\n=== CONTACT STATE ===');
console.log(JSON.stringify(contact, null, 2));

// Conversation flowSession
const conv = await prisma.conversation.findFirst({
  select: { id: true, status: true, flowSession: true, assignedTo: true },
});
console.log('\n=== CONVERSATION STATE ===');
console.log(JSON.stringify(conv, null, 2));

await prisma.$disconnect();
