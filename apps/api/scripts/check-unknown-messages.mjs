import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

console.log('\n=== FLOWS containing suspicious text ===');
const flows = await prisma.flow.findMany({ select: { id: true, name: true, triggerType: true, flowDefinition: true } });
for (const f of flows) {
  const json = JSON.stringify(f.flowDefinition);
  if (json.includes('eat') || json.includes('user_var') || json.includes('Hello')) {
    console.log(`\n[FLOW] "${f.name}" [${f.triggerType}]`);
    console.log(JSON.stringify(f.flowDefinition, null, 2));
  }
}

console.log('\n=== AUTO-REPLIES ===');
const ars = await prisma.autoReply.findMany();
console.log(ars.length ? JSON.stringify(ars, null, 2) : '(none)');

console.log('\n=== CHATBOTS ===');
const bots = await prisma.chatbot.findMany();
console.log(bots.length ? JSON.stringify(bots, null, 2) : '(none)');

console.log('\n=== LAST 10 OUTBOUND MESSAGES ===');
const msgs = await prisma.message.findMany({
  where: { direction: 'outbound' },
  orderBy: { sentAt: 'desc' },
  take: 10,
  select: { id: true, body: true, contentType: true, sentAt: true, conversationId: true },
});
console.log(JSON.stringify(msgs, null, 2));

await prisma.$disconnect();
