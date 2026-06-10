/**
 * Wrapper that runs seed-flows.mjs + seed-flows-2.mjs for a specific org.
 * Uses DATABASE_PUBLIC_URL (or DATABASE_URL) and ORG_ID env vars.
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const dbUrl = process.env.DATABASE_PUBLIC_URL ?? process.env.DATABASE_URL;
if (!dbUrl) { console.error('No DATABASE_URL set'); process.exit(1); }

const ORG_ID = process.env.ORG_ID;
if (!ORG_ID) { console.error('No ORG_ID set'); process.exit(1); }

const adapter = new PrismaPg({ connectionString: dbUrl });
const prisma = new PrismaClient({ adapter });

console.log('Org:', ORG_ID);

const ALL_FLOWS = [
  // ─── seed-flows.mjs (1-5) ────────────────────────────────────────────────
  {
    name: 'Welcome & Route',
    triggerType: 'new_conversation',
    flowDefinition: {
      startNodeId: 'n1',
      nodes: [
        { id: 'n1', type: 'send_text', config: { text: 'Hi {{first_name}}! 👋 Welcome! How can we help you today?' }, next: 'n2' },
        { id: 'n2', type: 'send_buttons', config: { body: 'Please choose an option:', buttons: [{ id: 'sales', text: '🛍️ Sales' }, { id: 'support', text: '🆘 Support' }, { id: 'other', text: '❓ Other' }], waitForReply: true }, next: 'n3' },
        { id: 'n3', type: 'condition', config: { conditionType: 'contains', value: 'sales' }, next: 'n4', nextNo: 'n6' },
        { id: 'n4', type: 'add_label', config: { tag: 'sales' }, next: 'n5' },
        { id: 'n5', type: 'send_text', config: { text: 'Great! 🙌 Our sales team will reach you shortly.' }, next: 'n_end' },
        { id: 'n6', type: 'condition', config: { conditionType: 'contains', value: 'support' }, next: 'n7', nextNo: 'n9' },
        { id: 'n7', type: 'add_label', config: { tag: 'support' }, next: 'n8' },
        { id: 'n8', type: 'send_text', config: { text: 'Got it! ⚙️ Our support team will assist you soon.' }, next: 'n_end' },
        { id: 'n9', type: 'send_text', config: { text: 'Thanks for reaching out! ✅ Our team will get back to you shortly.' }, next: 'n_end' },
        { id: 'n_end', type: 'end', config: {}, next: null },
      ],
    },
  },
  {
    name: 'Lead Qualification',
    triggerType: 'keyword_match',
    flowDefinition: {
      startNodeId: 'n1',
      nodes: [
        { id: 'n1', type: 'send_text', config: { text: "Hi {{first_name}}! 👋 Glad to hear you're interested. Let me ask a few quick questions." }, next: 'n2' },
        { id: 'n2', type: 'ask_question', config: { question: 'Which product or service are you looking for?', saveToField: 'notes' }, next: 'n3' },
        { id: 'n3', type: 'ask_question', config: { question: 'What is your approximate budget? (e.g. ₹10,000 – ₹50,000)' }, next: 'n4' },
        { id: 'n4', type: 'ask_question', config: { question: 'When are you looking to purchase? (e.g. This week / Next month)' }, next: 'n5' },
        { id: 'n5', type: 'add_label', config: { tag: 'hot-lead' }, next: 'n6' },
        { id: 'n6', type: 'update_stage', config: { lifecycleStage: 'prospect' }, next: 'n7' },
        { id: 'n7', type: 'send_text', config: { text: 'Thank you! 🎯 Our sales team will contact you within 24 hours with the best offer.' }, next: 'n_end' },
        { id: 'n_end', type: 'end', config: {}, next: null },
      ],
    },
  },
  {
    name: 'Support Triage',
    triggerType: 'keyword_match',
    flowDefinition: {
      startNodeId: 'n1',
      nodes: [
        { id: 'n1', type: 'send_text', config: { text: "Hi {{first_name}}! Sorry to hear you're facing an issue. We're here to help! 🛠️" }, next: 'n2' },
        { id: 'n2', type: 'send_buttons', config: { body: 'What does your issue relate to?', buttons: [{ id: 'order', text: '📦 Order' }, { id: 'payment', text: '💳 Payment' }, { id: 'technical', text: '⚙️ Technical' }], waitForReply: true }, next: 'n3' },
        { id: 'n3', type: 'condition', config: { conditionType: 'contains', value: 'order' }, next: 'n4', nextNo: 'n5' },
        { id: 'n4', type: 'add_label', config: { tag: 'order-issue' }, next: 'n8' },
        { id: 'n5', type: 'condition', config: { conditionType: 'contains', value: 'payment' }, next: 'n6', nextNo: 'n7' },
        { id: 'n6', type: 'add_label', config: { tag: 'payment-issue' }, next: 'n8' },
        { id: 'n7', type: 'add_label', config: { tag: 'technical-issue' }, next: 'n8' },
        { id: 'n8', type: 'send_text', config: { text: 'Thanks! ✅ Our support team has been notified and will reach you shortly.' }, next: 'n_end' },
        { id: 'n_end', type: 'end', config: {}, next: null },
      ],
    },
  },
  {
    name: 'Opt-in Collection',
    triggerType: 'contact_created',
    flowDefinition: {
      startNodeId: 'n1',
      nodes: [
        { id: 'n1', type: 'send_text', config: { text: "Hi {{first_name}}! 👋 Welcome! You've been added to our contact list." }, next: 'n2' },
        { id: 'n2', type: 'send_buttons', config: { body: "We'd love to keep you updated with offers, order updates and important alerts.\n\nWould you like to receive WhatsApp messages from us?", buttons: [{ id: 'yes', text: '✅ Yes, opt me in' }, { id: 'no', text: '❌ No thanks' }], waitForReply: true }, next: 'n3' },
        { id: 'n3', type: 'condition', config: { conditionType: 'contains', value: 'yes' }, next: 'n4', nextNo: 'n6' },
        { id: 'n4', type: 'opt_in', config: {}, next: 'n5' },
        { id: 'n5', type: 'send_text', config: { text: "Perfect! 🎉 You're now opted in. We'll keep you updated with the best offers." }, next: 'n_end' },
        { id: 'n6', type: 'opt_out', config: {}, next: 'n7' },
        { id: 'n7', type: 'send_text', config: { text: "No problem! 👍 You won't receive promotional messages. Feel free to reach out anytime." }, next: 'n_end' },
        { id: 'n_end', type: 'end', config: {}, next: null },
      ],
    },
  },
  {
    name: 'No-Reply Follow-up',
    triggerType: 'no_reply',
    flowDefinition: {
      startNodeId: 'n1',
      nodes: [
        { id: 'n1', type: 'send_text', config: { text: "Hi {{first_name}}! 👋 We noticed you haven't responded to our last message." }, next: 'n2' },
        { id: 'n2', type: 'send_buttons', config: { body: 'Are you still interested in our services?', buttons: [{ id: 'yes', text: '✅ Yes, still interested' }, { id: 'no', text: '❌ Not right now' }], waitForReply: true }, next: 'n3' },
        { id: 'n3', type: 'condition', config: { conditionType: 'contains', value: 'yes' }, next: 'n4', nextNo: 'n6' },
        { id: 'n4', type: 'add_label', config: { tag: 're-engaged' }, next: 'n5' },
        { id: 'n5', type: 'send_text', config: { text: 'Wonderful! 🙌 Our team will get in touch with you shortly.' }, next: 'n_end' },
        { id: 'n6', type: 'update_stage', config: { lifecycleStage: 'churned' }, next: 'n7' },
        { id: 'n7', type: 'send_text', config: { text: "No worries! 😊 Feel free to reach out whenever you're ready. We'll be here." }, next: 'n_end' },
        { id: 'n_end', type: 'end', config: {}, next: null },
      ],
    },
  },

  // ─── seed-flows-2.mjs (6-11) ─────────────────────────────────────────────
  {
    name: 'Unsubscribe Handler',
    triggerType: 'inbound_message',
    flowDefinition: {
      startNodeId: 'n1',
      nodes: [
        { id: 'n1', type: 'condition', config: { conditionType: 'contains', value: 'stop' }, next: 'n2', nextNo: 'n_end' },
        { id: 'n2', type: 'opt_out', config: {}, next: 'n3' },
        { id: 'n3', type: 'send_text', config: { text: "You've been unsubscribed. 🚫 You won't receive any more messages from us.\n\nReply *START* anytime to re-subscribe." }, next: 'n_end' },
        { id: 'n_end', type: 'end', config: {}, next: null },
      ],
    },
  },
  {
    name: 'CSAT Response Handler',
    triggerType: 'button_reply',
    flowDefinition: {
      startNodeId: 'n1',
      nodes: [
        { id: 'n1', type: 'condition', config: { conditionType: 'contains', value: 'excellent' }, next: 'n2', nextNo: 'n4' },
        { id: 'n2', type: 'add_label', config: { tag: 'csat-excellent' }, next: 'n3' },
        { id: 'n3', type: 'send_text', config: { text: 'Thank you for your kind feedback! ⭐⭐⭐⭐⭐ We love serving you!' }, next: 'n_end' },
        { id: 'n4', type: 'condition', config: { conditionType: 'contains', value: 'good' }, next: 'n5', nextNo: 'n7' },
        { id: 'n5', type: 'add_label', config: { tag: 'csat-good' }, next: 'n6' },
        { id: 'n6', type: 'send_text', config: { text: "Thanks for the feedback! 👍 We're glad we could help. See you next time!" }, next: 'n_end' },
        { id: 'n7', type: 'add_label', config: { tag: 'csat-poor' }, next: 'n8' },
        { id: 'n8', type: 'send_text', config: { text: "We're really sorry about your experience. 🙏 A team member will follow up with you shortly to make things right." }, next: 'n_end' },
        { id: 'n_end', type: 'end', config: {}, next: null },
      ],
    },
  },
  {
    name: 'VIP Customer Welcome',
    triggerType: 'tag_added',
    flowDefinition: {
      startNodeId: 'n1',
      nodes: [
        { id: 'n1', type: 'send_text', config: { tag: 'vip', text: "🌟 Great news, {{first_name}}! You've been added to our VIP list.\n\nEnjoy exclusive early access to deals, priority support, and special offers. Thank you for being an amazing customer! 💛" }, next: 'n2' },
        { id: 'n2', type: 'add_label', config: { tag: 'vip-notified' }, next: 'n_end' },
        { id: 'n_end', type: 'end', config: {}, next: null },
      ],
    },
  },
  {
    name: 'Customer Onboarding',
    triggerType: 'lifecycle_change',
    flowDefinition: {
      startNodeId: 'n1',
      nodes: [
        { id: 'n1', type: 'send_text', config: { lifecycleStage: 'customer', text: "🎉 Welcome to the family, {{first_name}}! You're now a valued customer.\n\nHere's what to expect:\n• Priority support on WhatsApp\n• Exclusive member-only offers\n• Early access to new products\n\nWe're thrilled to have you with us! 💛" }, next: 'n2' },
        { id: 'n2', type: 'cta_url', config: { body: 'Get started with your onboarding guide — everything you need to know in one place. 📖', buttonText: 'View Onboarding Guide', url: 'https://wbmsg-production.up.railway.app' }, next: 'n_end' },
        { id: 'n_end', type: 'end', config: {}, next: null },
      ],
    },
  },
  {
    name: 'CSAT Survey',
    triggerType: 'conversation_resolved',
    flowDefinition: {
      startNodeId: 'n1',
      nodes: [
        { id: 'n1', type: 'send_text', config: { text: "Hi {{first_name}}! 👋 Your conversation has been resolved. Hope we were helpful!" }, next: 'n2' },
        { id: 'n2', type: 'send_buttons', config: { body: 'How would you rate your experience today?', buttons: [{ id: 'excellent', text: '😍 Excellent' }, { id: 'good', text: '👍 Good' }, { id: 'needs_imp', text: '😕 Needs Improvement' }], waitForReply: false }, next: 'n_end' },
        { id: 'n_end', type: 'end', config: {}, next: null },
      ],
    },
  },
  {
    name: 'Agent Assignment Notification',
    triggerType: 'conversation_assigned',
    flowDefinition: {
      startNodeId: 'n1',
      nodes: [
        { id: 'n1', type: 'send_text', config: { text: "Hi {{first_name}}! 👋 Your query has been assigned to one of our specialists.\n\nWe'll respond within 15 minutes. Thank you for your patience! ⏱️" }, next: 'n_end' },
        { id: 'n_end', type: 'end', config: {}, next: null },
      ],
    },
  },
];

console.log(`\nCreating ${ALL_FLOWS.length} flows...`);
for (const flow of ALL_FLOWS) {
  const existing = await prisma.flow.findFirst({ where: { organizationId: ORG_ID, name: flow.name } });
  if (existing) {
    console.log(`  ~ "${flow.name}" (already exists)`);
    continue;
  }
  const created = await prisma.flow.create({
    data: { organizationId: ORG_ID, name: flow.name, triggerType: flow.triggerType, isActive: true, flowDefinition: flow.flowDefinition },
  });
  console.log(`  ✓ "${created.name}" [${created.triggerType}] — ${created.id}`);
}

await prisma.$disconnect();
console.log('\nDone.');
