import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

// Derive org from existing vendor_settings (superAdmin row was saved there)
const orgRow = await prisma.vendorSetting.findFirst({
  where: { key: 'role_permissions_superAdmin' },
  select: { organizationId: true },
});
if (!orgRow) { console.error('No org found via vendor_settings'); process.exit(1); }
const organizationId = orgRow.organizationId;
console.log('Org:', organizationId);

const flows = [
  // ─── 1. WELCOME & ROUTE ────────────────────────────────────────────────
  {
    name: 'Welcome & Route',
    triggerType: 'new_conversation',
    flowDefinition: {
      startNodeId: 'n1',
      nodes: [
        {
          id: 'n1', type: 'send_text',
          config: { text: 'Hi {{first_name}}! 👋 Welcome! How can we help you today?' },
          next: 'n2',
        },
        {
          id: 'n2', type: 'send_buttons',
          config: {
            body: 'Please choose an option:',
            buttons: [
              { id: 'sales',   text: '🛍️ Sales' },
              { id: 'support', text: '🆘 Support' },
              { id: 'other',   text: '❓ Other' },
            ],
            waitForReply: true,
          },
          next: 'n3',
        },
        {
          id: 'n3', type: 'condition',
          config: { conditionType: 'contains', value: 'sales' },
          next: 'n4', nextNo: 'n6',
        },
        {
          id: 'n4', type: 'add_label',
          config: { tag: 'sales' },
          next: 'n5',
        },
        {
          id: 'n5', type: 'send_text',
          config: { text: 'Great! 🙌 Our sales team will reach you shortly.' },
          next: 'n_end',
        },
        {
          id: 'n6', type: 'condition',
          config: { conditionType: 'contains', value: 'support' },
          next: 'n7', nextNo: 'n9',
        },
        {
          id: 'n7', type: 'add_label',
          config: { tag: 'support' },
          next: 'n8',
        },
        {
          id: 'n8', type: 'send_text',
          config: { text: 'Got it! ⚙️ Our support team will assist you soon.' },
          next: 'n_end',
        },
        {
          id: 'n9', type: 'send_text',
          config: { text: 'Thanks for reaching out! ✅ Our team will get back to you shortly.' },
          next: 'n_end',
        },
        { id: 'n_end', type: 'end', config: {}, next: null },
      ],
    },
  },

  // ─── 2. LEAD QUALIFICATION ─────────────────────────────────────────────
  {
    name: 'Lead Qualification',
    triggerType: 'keyword_match',
    flowDefinition: {
      startNodeId: 'n1',
      nodes: [
        {
          id: 'n1', type: 'send_text',
          config: { text: 'Hi {{first_name}}! 👋 Glad to hear you\'re interested. Let me ask a few quick questions.' },
          next: 'n2',
        },
        {
          id: 'n2', type: 'ask_question',
          config: { question: 'Which product or service are you looking for?', saveToField: 'notes' },
          next: 'n3',
        },
        {
          id: 'n3', type: 'ask_question',
          config: { question: 'What is your approximate budget? (e.g. ₹10,000 – ₹50,000)' },
          next: 'n4',
        },
        {
          id: 'n4', type: 'ask_question',
          config: { question: 'When are you looking to purchase? (e.g. This week / Next month)' },
          next: 'n5',
        },
        {
          id: 'n5', type: 'add_label',
          config: { tag: 'hot-lead' },
          next: 'n6',
        },
        {
          id: 'n6', type: 'update_stage',
          config: { lifecycleStage: 'prospect' },
          next: 'n7',
        },
        {
          id: 'n7', type: 'send_text',
          config: { text: 'Thank you! 🎯 Our sales team will contact you within 24 hours with the best offer.' },
          next: 'n_end',
        },
        { id: 'n_end', type: 'end', config: {}, next: null },
      ],
    },
  },

  // ─── 3. SUPPORT TRIAGE ─────────────────────────────────────────────────
  {
    name: 'Support Triage',
    triggerType: 'keyword_match',
    flowDefinition: {
      startNodeId: 'n1',
      nodes: [
        {
          id: 'n1', type: 'send_text',
          config: { text: 'Hi {{first_name}}! Sorry to hear you\'re facing an issue. We\'re here to help! 🛠️' },
          next: 'n2',
        },
        {
          id: 'n2', type: 'send_buttons',
          config: {
            body: 'What does your issue relate to?',
            buttons: [
              { id: 'order',     text: '📦 Order' },
              { id: 'payment',   text: '💳 Payment' },
              { id: 'technical', text: '⚙️ Technical' },
            ],
            waitForReply: true,
          },
          next: 'n3',
        },
        {
          id: 'n3', type: 'condition',
          config: { conditionType: 'contains', value: 'order' },
          next: 'n4', nextNo: 'n5',
        },
        {
          id: 'n4', type: 'add_label',
          config: { tag: 'order-issue' },
          next: 'n8',
        },
        {
          id: 'n5', type: 'condition',
          config: { conditionType: 'contains', value: 'payment' },
          next: 'n6', nextNo: 'n7',
        },
        {
          id: 'n6', type: 'add_label',
          config: { tag: 'payment-issue' },
          next: 'n8',
        },
        {
          id: 'n7', type: 'add_label',
          config: { tag: 'technical-issue' },
          next: 'n8',
        },
        {
          id: 'n8', type: 'send_text',
          config: { text: 'Thanks! ✅ Our support team has been notified and will reach you shortly.' },
          next: 'n_end',
        },
        { id: 'n_end', type: 'end', config: {}, next: null },
      ],
    },
  },

  // ─── 4. OPT-IN COLLECTION ──────────────────────────────────────────────
  {
    name: 'Opt-in Collection',
    triggerType: 'contact_created',
    flowDefinition: {
      startNodeId: 'n1',
      nodes: [
        {
          id: 'n1', type: 'send_text',
          config: { text: 'Hi {{first_name}}! 👋 Welcome! You\'ve been added to our contact list.' },
          next: 'n2',
        },
        {
          id: 'n2', type: 'send_buttons',
          config: {
            body: 'We\'d love to keep you updated with offers, order updates and important alerts.\n\nWould you like to receive WhatsApp messages from us?',
            buttons: [
              { id: 'yes', text: '✅ Yes, opt me in' },
              { id: 'no',  text: '❌ No thanks' },
            ],
            waitForReply: true,
          },
          next: 'n3',
        },
        {
          id: 'n3', type: 'condition',
          config: { conditionType: 'contains', value: 'yes' },
          next: 'n4', nextNo: 'n6',
        },
        {
          id: 'n4', type: 'opt_in',
          config: {},
          next: 'n5',
        },
        {
          id: 'n5', type: 'send_text',
          config: { text: 'Perfect! 🎉 You\'re now opted in. We\'ll keep you updated with the best offers.' },
          next: 'n_end',
        },
        {
          id: 'n6', type: 'opt_out',
          config: {},
          next: 'n7',
        },
        {
          id: 'n7', type: 'send_text',
          config: { text: 'No problem! 👍 You won\'t receive promotional messages. Feel free to reach out anytime.' },
          next: 'n_end',
        },
        { id: 'n_end', type: 'end', config: {}, next: null },
      ],
    },
  },

  // ─── 5. NO-REPLY FOLLOW-UP ─────────────────────────────────────────────
  {
    name: 'No-Reply Follow-up',
    triggerType: 'no_reply',
    flowDefinition: {
      startNodeId: 'n1',
      nodes: [
        {
          id: 'n1', type: 'send_text',
          config: { text: 'Hi {{first_name}}! 👋 We noticed you haven\'t responded to our last message.' },
          next: 'n2',
        },
        {
          id: 'n2', type: 'send_buttons',
          config: {
            body: 'Are you still interested in our services?',
            buttons: [
              { id: 'yes', text: '✅ Yes, still interested' },
              { id: 'no',  text: '❌ Not right now' },
            ],
            waitForReply: true,
          },
          next: 'n3',
        },
        {
          id: 'n3', type: 'condition',
          config: { conditionType: 'contains', value: 'yes' },
          next: 'n4', nextNo: 'n6',
        },
        {
          id: 'n4', type: 'add_label',
          config: { tag: 're-engaged' },
          next: 'n5',
        },
        {
          id: 'n5', type: 'send_text',
          config: { text: 'Wonderful! 🙌 Our team will get in touch with you shortly.' },
          next: 'n_end',
        },
        {
          id: 'n6', type: 'update_stage',
          config: { lifecycleStage: 'churned' },
          next: 'n7',
        },
        {
          id: 'n7', type: 'send_text',
          config: { text: 'No worries! 😊 Feel free to reach out whenever you\'re ready. We\'ll be here.' },
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
console.log('\nAll 5 flows created and active.');
