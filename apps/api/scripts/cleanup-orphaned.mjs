import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const connectionString = process.env.DATABASE_PUBLIC_URL ?? process.env.DATABASE_URL;
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

try {
  const orphanedConvCount = await prisma.conversation.count({ where: { contactId: null } });
  const orphanedMsgCount = await prisma.message.count({ where: { conversation: { contactId: null } } });
  const oldLogCount = await prisma.activityLog.count({
    where: { createdAt: { lt: new Date(Date.now() - 90 * 86400000) } },
  });

  console.log("=== Dry Run ===");
  console.log(`Orphaned conversations (contactId = null): ${orphanedConvCount}`);
  console.log(`Messages inside those conversations:       ${orphanedMsgCount}`);
  console.log(`Activity logs older than 90 days:          ${oldLogCount}`);

  if (process.argv[2] !== "--execute") {
    console.log("\nPass --execute to delete.");
    process.exit(0);
  }

  console.log("\n=== Executing cleanup ===");

  const BATCH = 500;
  let deletedConversations = 0;
  let deletedMessages = 0;

  while (true) {
    const batch = await prisma.conversation.findMany({
      where: { contactId: null },
      select: { id: true },
      take: BATCH,
    });
    if (batch.length === 0) break;
    const ids = batch.map((c) => c.id);
    const [msgResult] = await prisma.$transaction([
      prisma.message.deleteMany({ where: { conversationId: { in: ids } } }),
      prisma.conversation.deleteMany({ where: { id: { in: ids } } }),
    ]);
    deletedMessages += msgResult.count;
    deletedConversations += batch.length;
    process.stdout.write(`\r  conversations: ${deletedConversations}, messages: ${deletedMessages}`);
    if (batch.length < BATCH) break;
  }
  console.log();

  const logResult = await prisma.activityLog.deleteMany({
    where: { createdAt: { lt: new Date(Date.now() - 90 * 86400000) } },
  });

  console.log(`Deleted ${deletedConversations} conversations`);
  console.log(`Deleted ${deletedMessages} messages`);
  console.log(`Deleted ${logResult.count} activity logs (>90 days old)`);
  console.log("Done.");
} finally {
  await prisma.$disconnect();
}
