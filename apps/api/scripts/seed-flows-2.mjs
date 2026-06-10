import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const orgRow = await prisma.vendorSetting.findFirst({
  where: { key: 'role_permissions_superAdmin' },
  select: { organizationId: true },
});
if (!orgRow) { console.error('No org found'); process.exit(1); }
const { organizationId } = orgRow;
console.log('Org:', organizationId);

const flows = [

  // ─── 6. UNSUBSCRIBE HANDLER (inbound_message) ─────────────────────────
  // Fires on every inbound message in existing conversations.
  // Uses a condition to act only if message contains "stop" / "unsubscribe".
  {
    name: 'Unsubscribe Handler',
    triggerType: 'inbound_message',
    flowDefinition: {
      startNodeId: 'n1',
      nodes: [
        {
          id: 'n1', type: 'condition',
          config: { conditionType: 'contains', value: 'stop' },
          next: 'n2', nextNo: 'n_end',
        },
        {
          id: 'n2', type: 'opt_out',
          config: {},
          next: 'n3',
        },
        {
          id: 'n3', type: 'send_text',
          config: { text: "You've been unsubscribed. 🚫 You won't receive any more messages from us.\n\nReply *START* anytime to re-subscribe." },
          next: 'n_end',
        },
        { id: 'n_end', type: 'end', config: {}, next: null },
      ],
    },
  },

  // ─── 7. CSAT RESPONSE HANDLER (button_reply) ─────────────────────────
  // Fires when a customer clicks any button reply (outside an active flow session).
  // Designed to handle replies to the CSAT survey sent by Flow 10 below.
  {
    name: 'CSAT Response Handler',
    triggerType: 'button_reply',
    flowDefinition: {
      startNodeId: 'n1',
      nodes: [
        {
          id: 'n1', type: 'condition',
          config: { conditionType: 'contains', value: 'excellent' },
          next: 'n2', nextNo: 'n4',
        },
        {
          id: 'n2', type: 'add_label',
          config: { tag: 'csat-excellent' },
          next: 'n3',
        },
        {
          id: 'n3', type: 'send_text',
          config: { text: 'Thank you for your kind feedback! ⭐⭐⭐⭐⭐ We love serving you!' },
          next: 'n_end',
        },
        {
          id: 'n4', type: 'condition',
          config: { conditionType: 'contains', value: 'good' },
          next: 'n5', nextNo: 'n7',
        },
        {
          id: 'n5', type: 'add_label',
          config: { tag: 'csat-good' },
          next: 'n6',
        },
        {
          id: 'n6', type: 'send_text',
          config: { text: "Thanks for the feedback! 👍 We're glad we could help. See you next time!" },
          next: 'n_end',
        },
        {
          id: 'n7', type: 'add_label',
          config: { tag: 'csat-poor' },
          next: 'n8',
        },
        {
          id: 'n8', type: 'send_text',
          config: { text: "We're really sorry about your experience. 🙏 A team member will follow up with you shortly to make things right." },
          next: 'n_end',
        },
        { id: 'n_end', type: 'end', config: {}, next: null },
      ],
    },
  },

  // ─── 8. VIP CUSTOMER FLOW (tag_added) ────────────────────────────────
  // Fires whenever a tag is added to a contact.
  // Start node config { tag: "vip" } is stored for future dispatcher filtering.
  // Note: no conversationId available here, so waitForReply is not used.
  {
    name: 'VIP Customer Welcome',
    triggerType: 'tag_added',
    flowDefinition: {
      startNodeId: 'n1',
      nodes: [
        {
          id: 'n1', type: 'send_text',
          config: {
            tag: 'vip',  // stored for future tag-filter support in dispatcher
            text: "🌟 Great news, {{first_name}}! You've been added to our VIP list.\n\nEnjoy exclusive early access to deals, priority support, and special offers. Thank you for being an amazing customer! 💛",
          },
          next: 'n2',
        },
        {
          id: 'n2', type: 'add_label',
          config: { tag: 'vip-notified' },
          next: 'n_end',
        },
        { id: 'n_end', type: 'end', config: {}, next: null },
      ],
    },
  },

  // ─── 9. CUSTOMER ONBOARDING (lifecycle_change) ───────────────────────
  // Fires whenever a contact's lifecycle stage is updated.
  // Start node config { lifecycleStage: "customer" } for future dispatcher filtering.
  // Note: no conversationId available, so waitForReply is not used.
  {
    name: 'Customer Onboarding',
    triggerType: 'lifecycle_change',
    flowDefinition: {
      startNodeId: 'n1',
      nodes: [
        {
          id: 'n1', type: 'send_text',
          config: {
            lifecycleStage: 'customer',  // stored for future lifecycle-filter support
            text: "🎉 Welcome to the family, {{first_name}}! You're now a valued customer.\n\nHere's what to expect:\n• Priority support on WhatsApp\n• Exclusive member-only offers\n• Early access to new products\n\nWe're thrilled to have you with us! 💛",
          },
          next: 'n2',
        },
        {
          id: 'n2', type: 'cta_url',
          config: {
            body: 'Get started with your onboarding guide — everything you need to know in one place. 📖',
            buttonText: 'View Onboarding Guide',
            url: 'https://wbmsg-production.up.railway.app',
          },
          next: 'n_end',
        },
        { id: 'n_end', type: 'end', config: {}, next: null },
      ],
    },
  },

  // ─── 10. CSAT SURVEY (conversation_resolved) ─────────────────────────
  // Fires when a conversation is marked resolved.
  // Sends the CSAT buttons; Flow 7 (CSAT Response Handler) handles the reply.
  {
    name: 'CSAT Survey',
    triggerType: 'conversation_resolved',
    flowDefinition: {
      startNodeId: 'n1',
      nodes: [
        {
          id: 'n1', type: 'send_text',
          config: { text: "Hi {{first_name}}! 👋 Your conversation has been resolved. Hope we were helpful!" },
          next: 'n2',
        },
        {
          id: 'n2', type: 'send_buttons',
          config: {
            body: 'How would you rate your experience today?',
            buttons: [
              { id: 'excellent', text: '😍 Excellent' },
              { id: 'good',      text: '👍 Good' },
              { id: 'needs_imp', text: '😕 Needs Improvement' },
            ],
            waitForReply: false,  // CSAT Response Handler (button_reply flow) picks this up
          },
          next: 'n_end',
        },
        { id: 'n_end', type: 'end', config: {}, next: null },
      ],
    },
  },

  // ─── 11. AGENT ASSIGNMENT NOTIFICATION (conversation_assigned) ───────
  // Fires when a conversation is assigned to an agent.
  // Lets the customer know their query is being handled.
  {
    name: 'Agent Assignment Notification',
    triggerType: 'conversation_assigned',
    flowDefinition: {
      startNodeId: 'n1',
      nodes: [
        {
          id: 'n1', type: 'send_text',
          config: { text: "Hi {{first_name}}! 👋 Your query has been assigned to one of our specialists.\n\nWe'll respond within 15 minutes. Thank you for your patience! ⏱️" },
          next: 'n_end',
        },
        { id: 'n_end', type: 'end', config: {}, next: null },
      ],
    },
  },

];

for (const flow of flows) {
  const created = await prisma.flow.create({
    data: {
      organizationId,
      name: flow.name,
      triggerType: flow.triggerType,
      isActive: true,
      flowDefinition: flow.flowDefinition,
    },
  });
  console.log(`✓ "${flow.name}" [${flow.triggerType}] id=${created.id}`);
}

await prisma.$disconnect();
console.log('\nAll 6 remaining flows created and active.');
