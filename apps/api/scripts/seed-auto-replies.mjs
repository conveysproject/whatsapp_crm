import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const dbUrl = process.env.DATABASE_PUBLIC_URL ?? process.env.DATABASE_URL;
if (!dbUrl) { console.error('No DATABASE_URL set'); process.exit(1); }
const ORG_ID = process.env.ORG_ID;
if (!ORG_ID) { console.error('No ORG_ID set'); process.exit(1); }

const adapter = new PrismaPg({ connectionString: dbUrl });
const prisma = new PrismaClient({ adapter });

console.log('Org:', ORG_ID);

const AUTO_REPLIES = [
  {
    name: 'Price Enquiry',
    triggerType: 'contains',
    triggerKeyword: 'price',
    replyText: '💰 Here are our current prices:\n\n• Basic Plan — ₹999/month\n• Pro Plan — ₹2,499/month\n• Enterprise — Custom pricing\n\nReply *DEMO* to schedule a free demo, or *TALK* to speak with our sales team!',
    priorityIndex: 1,
  },
  {
    name: 'Demo Request',
    triggerType: 'contains',
    triggerKeyword: 'demo',
    replyText: '📅 We would love to show you a demo!\n\nPlease share your preferred date and time and our team will confirm the slot within 2 hours.\n\nAlternatively, call us at +91-XXXXXXXXXX.',
    priorityIndex: 2,
  },
  {
    name: 'Support Request',
    triggerType: 'contains',
    triggerKeyword: 'support',
    replyText: '🛠️ Our support team is here to help!\n\nPlease describe your issue and we will get back to you within 30 minutes during business hours (Mon–Sat, 9 AM – 6 PM IST).',
    priorityIndex: 3,
  },
  {
    name: 'Order Status',
    triggerType: 'contains',
    triggerKeyword: 'order',
    replyText: '📦 To check your order status, please share your *Order ID* (e.g. ORD-12345) and we will fetch the latest update for you right away!',
    priorityIndex: 4,
  },
  {
    name: 'Refund Policy',
    triggerType: 'contains',
    triggerKeyword: 'refund',
    replyText: '↩️ Our refund policy:\n\n• Full refund within 7 days of purchase\n• Pro-rated refund within 30 days\n• No refund after 30 days\n\nTo initiate a refund, reply with your *Order ID* and our team will process it within 3-5 business days.',
    priorityIndex: 5,
  },
  {
    name: 'Business Hours',
    triggerType: 'contains',
    triggerKeyword: 'hours',
    replyText: '🕘 Our business hours:\n\n📅 Monday – Saturday\n⏰ 9:00 AM – 6:00 PM IST\n\nWe are closed on Sundays and public holidays. For urgent queries, email us at support@example.com',
    priorityIndex: 6,
  },
  {
    name: 'Hello Greeting',
    triggerType: 'is',
    triggerKeyword: 'hi',
    replyText: '👋 Hello! Welcome to our WhatsApp support.\n\nHow can we help you today? You can ask about:\n• 💰 *price* — pricing plans\n• 📅 *demo* — schedule a demo\n• 🛠️ *support* — technical help\n• 📦 *order* — order status',
    priorityIndex: 10,
  },
  {
    name: 'Hello Greeting Alt',
    triggerType: 'is',
    triggerKeyword: 'hello',
    replyText: '👋 Hello! Welcome to our WhatsApp support.\n\nHow can we help you today? You can ask about:\n• 💰 *price* — pricing plans\n• 📅 *demo* — schedule a demo\n• 🛠️ *support* — technical help\n• 📦 *order* — order status',
    priorityIndex: 11,
  },
  {
    name: 'Talk to Agent',
    triggerType: 'contains',
    triggerKeyword: 'talk',
    replyText: '🧑‍💼 Connecting you to a live agent now...\n\nAverage wait time: *under 5 minutes*\n\nYou can also reach us at:\n📞 +91-XXXXXXXXXX\n📧 support@example.com',
    priorityIndex: 7,
  },
  {
    name: 'Unsubscribe',
    triggerType: 'is',
    triggerKeyword: 'stop',
    replyText: "You've been unsubscribed from our WhatsApp messages. 🚫\n\nYou won't receive any further updates from us. Reply *START* anytime to re-subscribe.",
    priorityIndex: 0,
  },
  {
    name: 'Re-subscribe',
    triggerType: 'is',
    triggerKeyword: 'start',
    replyText: "Welcome back! 🎉 You're now subscribed to our WhatsApp updates.\n\nReply *STOP* anytime to unsubscribe.",
    priorityIndex: 0,
  },
];

console.log(`\nCreating ${AUTO_REPLIES.length} auto-replies...`);
for (const ar of AUTO_REPLIES) {
  const existing = await prisma.autoReply.findFirst({
    where: { organizationId: ORG_ID, name: ar.name },
  });
  if (existing) {
    console.log(`  ~ "${ar.name}" (already exists)`);
    continue;
  }
  const created = await prisma.autoReply.create({
    data: {
      organizationId: ORG_ID,
      name: ar.name,
      triggerType: ar.triggerType,
      triggerKeyword: ar.triggerKeyword,
      replyText: ar.replyText,
      priorityIndex: ar.priorityIndex,
      isActive: true,
    },
  });
  console.log(`  ✓ "${created.name}" [${created.triggerType}: "${created.triggerKeyword}"] — ${created.id}`);
}

await prisma.$disconnect();
console.log('\nDone.');
