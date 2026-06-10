import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const dbUrl = process.env.DATABASE_PUBLIC_URL ?? process.env.DATABASE_URL;
if (!dbUrl) { console.error('No DATABASE_URL set'); process.exit(1); }

const adapter = new PrismaPg({ connectionString: dbUrl });
const prisma = new PrismaClient({ adapter });

const orgs = await prisma.organization.findMany({ select: { id: true, name: true } });
console.log('Organizations:', orgs);

const RESPONSES = [
  {
    name: "Greeting",
    shortcut: "/hi",
    content: "Hi {{first_name}}! 👋 Welcome to {{org_name}}. How can we help you today?",
  },
  {
    name: "Thank You",
    shortcut: "/ty",
    content: "Thank you for reaching out, {{first_name}}! We appreciate your time. Is there anything else we can help you with?",
  },
  {
    name: "Follow Up",
    shortcut: "/fu",
    content: "Hi {{first_name}}, just following up on our previous conversation. Have you had a chance to consider our offer?",
  },
  {
    name: "Out of Office",
    shortcut: "/ooo",
    content: "Hi {{first_name}}, our team is currently unavailable. We'll get back to you within 24 hours. Thank you for your patience!",
  },
  {
    name: "Pricing Inquiry",
    shortcut: "/price",
    content: "Hi {{first_name}}, thanks for your interest! I'd be happy to share our pricing details. Could you let us know more about your requirements so we can give you the best quote?",
  },
  {
    name: "Payment Confirmed",
    shortcut: "/paid",
    content: "Hi {{first_name}}, we've received your payment. Thank you! Your order is now being processed and you'll receive an update shortly.",
  },
  {
    name: "Delivery Update",
    shortcut: "/delivery",
    content: "Hi {{first_name}}, your order is on its way! You can expect delivery within the next 2-3 business days. We'll notify you once it's out for delivery.",
  },
  {
    name: "Complaint Acknowledgement",
    shortcut: "/sorry",
    content: "Hi {{first_name}}, we sincerely apologize for the inconvenience. Your feedback is important to us and we're looking into this right away. We'll get back to you shortly with a resolution.",
  },
  {
    name: "Request for Details",
    shortcut: "/details",
    content: "Hi {{first_name}}, could you please share more details about your query? This will help us assist you better.",
  },
  {
    name: "Closing",
    shortcut: "/bye",
    content: "Thank you for contacting us, {{first_name}}! It was a pleasure assisting you. Have a wonderful day! 😊",
  },
];

for (const org of orgs) {
  console.log(`\nSeeding canned responses for org: ${org.name} (${org.id})`);

  for (const r of RESPONSES) {
    const existing = await prisma.cannedResponse.findFirst({
      where: { organizationId: org.id, shortcut: r.shortcut },
    });
    if (existing) {
      console.log(`  SKIP (exists): ${r.name}`);
      continue;
    }
    await prisma.cannedResponse.create({
      data: {
        organizationId: org.id,
        name: r.name,
        shortcut: r.shortcut,
        content: r.content,
        category: "general",
      },
    });
    console.log(`  CREATED: ${r.name}`);
  }
}

await prisma.$disconnect();
console.log('\nDone!');
