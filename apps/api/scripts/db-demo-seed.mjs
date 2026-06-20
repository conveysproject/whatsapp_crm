/**
 * Full demo seed — jewellery, website, food clients
 * Run AFTER db-reset.mjs
 * Usage: node apps/api/scripts/db-demo-seed.mjs
 */

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const dbUrl = process.env.DATABASE_PUBLIC_URL ?? process.env.DATABASE_URL;
if (!dbUrl) { console.error('DATABASE_URL not set'); process.exit(1); }

const adapter = new PrismaPg({ connectionString: dbUrl });
const prisma = new PrismaClient({ adapter });

const org = await prisma.organization.findFirst({ select: { id: true, name: true } });
if (!org) { console.error('No organization found'); process.exit(1); }
const { id: organizationId } = org;
console.log(`\n=== DEMO SEED ===\nOrg: ${org.name} (${organizationId})\n`);

// ── helpers ───────────────────────────────────────────────────────────────────
function daysAgo(n, hours = 0, mins = 0) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(hours, mins, 0, 0);
  return d;
}
function minutesAgo(n) {
  return new Date(Date.now() - n * 60 * 1000);
}

// ── 1. Role permissions ───────────────────────────────────────────────────────
console.log('--- Role Permissions ---');
const ROLES = {
  superAdmin: { contacts_access:'allow','contacts_access@contacts_export':'allow','contacts_access@contacts_add':'allow','contacts_access@contacts_delete':'allow','contacts_access@contacts_bulk_tag':'allow','contacts_access@contacts_import':'allow','contacts_access@contacts_manage_custom_fields':'allow',hide_phone_number:'allow','hide_phone_number@hide_contact_fields':'allow',inbox_access:'allow','inbox_access@inbox_all_conversations':'allow','inbox_access@inbox_unassigned':'allow','inbox_access@assigned_chats_only':'allow',campaigns_access:'allow','campaigns_access@campaigns_create':'allow','campaigns_access@campaigns_export_report':'allow','campaigns_access@campaigns_custom_reports':'allow','campaigns_access@campaigns_manage_segments':'allow',templates_access:'allow','templates_access@templates_ai_buttons':'allow','templates_access@templates_create':'allow','templates_access@templates_edit':'allow','templates_access@templates_delete':'allow',settings_access:'allow','settings_access@settings_agents':'allow','settings_access@settings_whatsapp':'allow','settings_access@settings_api_key':'allow','settings_access@settings_billing':'allow','settings_access@settings_tags':'allow',analytics_access:'allow','analytics_access@analytics_export':'allow','analytics_access@analytics_agent_performance':'allow',automation_access:'allow','automation_access@automation_export_report':'allow','automation_access@automation_welcome_message':'allow','automation_access@automation_bot_flows':'allow','automation_access@automation_bot_replies':'allow' },
  admin: { contacts_access:'allow','contacts_access@contacts_export':'allow','contacts_access@contacts_add':'allow','contacts_access@contacts_delete':'allow','contacts_access@contacts_bulk_tag':'allow','contacts_access@contacts_import':'allow','contacts_access@contacts_manage_custom_fields':'allow',hide_phone_number:'allow','hide_phone_number@hide_contact_fields':'allow',inbox_access:'allow','inbox_access@inbox_all_conversations':'allow','inbox_access@inbox_unassigned':'allow','inbox_access@assigned_chats_only':'allow',campaigns_access:'allow','campaigns_access@campaigns_create':'allow','campaigns_access@campaigns_export_report':'allow','campaigns_access@campaigns_custom_reports':'allow','campaigns_access@campaigns_manage_segments':'allow',templates_access:'allow','templates_access@templates_ai_buttons':'allow','templates_access@templates_create':'allow','templates_access@templates_edit':'allow','templates_access@templates_delete':'allow',settings_access:'allow','settings_access@settings_agents':'allow','settings_access@settings_whatsapp':'allow','settings_access@settings_api_key':'allow','settings_access@settings_billing':'allow','settings_access@settings_tags':'allow',analytics_access:'allow','analytics_access@analytics_export':'allow','analytics_access@analytics_agent_performance':'allow',automation_access:'allow','automation_access@automation_export_report':'allow','automation_access@automation_welcome_message':'allow','automation_access@automation_bot_flows':'allow','automation_access@automation_bot_replies':'allow' },
  manager: { contacts_access:'allow','contacts_access@contacts_export':'allow','contacts_access@contacts_add':'allow','contacts_access@contacts_bulk_tag':'allow','contacts_access@contacts_import':'allow',inbox_access:'allow','inbox_access@inbox_all_conversations':'allow','inbox_access@inbox_unassigned':'allow',campaigns_access:'allow','campaigns_access@campaigns_create':'allow','campaigns_access@campaigns_export_report':'allow','campaigns_access@campaigns_manage_segments':'allow',templates_access:'allow','templates_access@templates_create':'allow','templates_access@templates_edit':'allow',settings_access:'allow','settings_access@settings_agents':'allow','settings_access@settings_tags':'allow',analytics_access:'allow','analytics_access@analytics_export':'allow','analytics_access@analytics_agent_performance':'allow',automation_access:'allow','automation_access@automation_export_report':'allow','automation_access@automation_welcome_message':'allow','automation_access@automation_bot_replies':'allow' },
  agent: { contacts_access:'allow','contacts_access@contacts_add':'allow',inbox_access:'allow','inbox_access@inbox_unassigned':'allow','inbox_access@assigned_chats_only':'allow',templates_access:'allow' },
  viewer: { contacts_access:'allow',inbox_access:'allow','inbox_access@inbox_all_conversations':'allow',campaigns_access:'allow',templates_access:'allow',analytics_access:'allow',automation_access:'allow' },
};
for (const [role, permissions] of Object.entries(ROLES)) {
  const key = `role_permissions_${role}`;
  await prisma.vendorSetting.upsert({
    where: { organizationId_key: { organizationId, key } },
    create: { organizationId, key, value: JSON.stringify(permissions) },
    update: { value: JSON.stringify(permissions) },
  });
  console.log(`  ✓ ${role}`);
}

// ── 2. Labels ─────────────────────────────────────────────────────────────────
console.log('\n--- Labels ---');
const LABELS = [
  // General
  { title: 'VIP',            textColor: '#fff', bgColor: '#b45309' },
  { title: 'Hot Lead',       textColor: '#fff', bgColor: '#dc2626' },
  { title: 'Cold Lead',      textColor: '#fff', bgColor: '#6b7280' },
  { title: 'Follow Up',      textColor: '#fff', bgColor: '#7c3aed' },
  { title: 'New Customer',   textColor: '#fff', bgColor: '#16a34a' },
  { title: 'Unsubscribed',   textColor: '#fff', bgColor: '#991b1b' },
  { title: 'Re-engaged',     textColor: '#fff', bgColor: '#6d28d9' },
  { title: 'CSAT Excellent', textColor: '#fff', bgColor: '#15803d' },
  { title: 'CSAT Good',      textColor: '#fff', bgColor: '#1d4ed8' },
  { title: 'CSAT Poor',      textColor: '#fff', bgColor: '#be123c' },
  // Jewellery
  { title: 'Gold Enquiry',       textColor: '#fff', bgColor: '#92400e' },
  { title: 'Diamond Enquiry',    textColor: '#fff', bgColor: '#1e3a8a' },
  { title: 'Custom Order',       textColor: '#fff', bgColor: '#b45309' },
  { title: 'Wedding Order',      textColor: '#fff', bgColor: '#be185d' },
  { title: 'Ready to Pickup',    textColor: '#fff', bgColor: '#065f46' },
  { title: 'Repair Request',     textColor: '#fff', bgColor: '#78350f' },
  // Website / Agency
  { title: 'Website Enquiry',    textColor: '#fff', bgColor: '#1e40af' },
  { title: 'SEO Interest',       textColor: '#fff', bgColor: '#0369a1' },
  { title: 'Social Media',       textColor: '#fff', bgColor: '#6d28d9' },
  { title: 'Proposal Sent',      textColor: '#fff', bgColor: '#d97706' },
  { title: 'Project Active',     textColor: '#fff', bgColor: '#065f46' },
  { title: 'On Hold',            textColor: '#fff', bgColor: '#78350f' },
  // Food
  { title: 'Regular Customer',   textColor: '#fff', bgColor: '#065f46' },
  { title: 'Bulk Order',         textColor: '#fff', bgColor: '#1e3a8a' },
  { title: 'Catering Enquiry',   textColor: '#fff', bgColor: '#b45309' },
  { title: 'Complaint',          textColor: '#fff', bgColor: '#b91c1c' },
  { title: 'Positive Feedback',  textColor: '#fff', bgColor: '#15803d' },
];
const labelMap = {};
for (const l of LABELS) {
  const created = await prisma.label.create({ data: { organizationId, ...l } });
  labelMap[l.title] = created.id;
  console.log(`  ✓ ${l.title}`);
}

// ── 3. Teams ──────────────────────────────────────────────────────────────────
console.log('\n--- Teams ---');
const salesTeam  = await prisma.team.create({ data: { organizationId, name: 'Sales Team',   description: 'Handles all sales enquiries' } });
const supportTeam = await prisma.team.create({ data: { organizationId, name: 'Support Team', description: 'Handles customer issues' } });
console.log(`  ✓ Sales Team, Support Team`);

// ── 4. Pipelines ──────────────────────────────────────────────────────────────
console.log('\n--- Pipelines ---');
const salesPipeline = await prisma.pipeline.create({
  data: {
    organizationId,
    name: 'Sales Pipeline',
    stages: [
      { id: 'new_lead',       name: 'New Lead',       color: '#6b7280' },
      { id: 'qualified',      name: 'Qualified',      color: '#2563eb' },
      { id: 'proposal_sent',  name: 'Proposal Sent',  color: '#7c3aed' },
      { id: 'negotiation',    name: 'Negotiation',    color: '#ea580c' },
      { id: 'won',            name: 'Won',             color: '#16a34a' },
      { id: 'lost',           name: 'Lost',            color: '#dc2626' },
    ],
  },
});
await prisma.pipeline.create({
  data: {
    organizationId,
    name: 'Support Pipeline',
    stages: [
      { id: 'new',         name: 'New',         color: '#6b7280' },
      { id: 'in_progress', name: 'In Progress', color: '#2563eb' },
      { id: 'escalated',   name: 'Escalated',   color: '#dc2626' },
      { id: 'resolved',    name: 'Resolved',    color: '#16a34a' },
    ],
  },
});
console.log(`  ✓ Sales Pipeline, Support Pipeline`);

// ── 5. Canned Responses ───────────────────────────────────────────────────────
console.log('\n--- Canned Responses ---');
const CANNED = [
  { name: 'Greeting',         shortcut: '/hi',       content: 'Hi {{first_name}}! 👋 Welcome to our store! How can we assist you today?' },
  { name: 'Be Right Back',    shortcut: '/brb',      content: 'Thanks for your patience! I\'ll be back with you in just a moment. 🙏' },
  { name: 'Business Hours',   shortcut: '/hours',    content: 'We\'re open Monday–Saturday, 10 AM to 8 PM IST. Happy to help during working hours! 🕘' },
  { name: 'Thank You',        shortcut: '/thanks',   content: 'Thank you so much! 😊 Is there anything else we can help you with?' },
  { name: 'Issue Resolved',   shortcut: '/resolved', content: 'I\'m glad we could resolve your query! ✅ Feel free to reach out anytime.' },
  { name: 'Callback Request', shortcut: '/callback', content: 'Sure! Please share a convenient time and our team will call you within the slot. 📞' },
  { name: 'Out of Office',    shortcut: '/ooo',      content: 'We\'re currently closed. We\'ll respond first thing tomorrow morning! 🌙' },
  // Jewellery
  { name: 'Gold Rate Update',   shortcut: '/gold',    content: 'Today\'s gold rate: 22K ₹5,450/g | 24K ₹5,920/g. Rates updated daily at 10 AM. 💛' },
  { name: 'Custom Order Info',  shortcut: '/custom',  content: 'We accept custom orders with a minimum advance of 30%. Delivery in 15–21 working days. Want to schedule a design consultation? 📐' },
  { name: 'Order Ready',        shortcut: '/ready',   content: 'Great news! Your order is ready for pickup. 🎉 We\'re open 10 AM–8 PM, Mon–Sat. Please bring your order receipt.' },
  { name: 'Jewellery Care Tips',shortcut: '/care',    content: 'To keep your jewellery sparkling: avoid perfume contact, store separately, and clean with a soft dry cloth. 💎 Bring in for a free cleaning anytime!' },
  // Website / Agency
  { name: 'Portfolio Link',     shortcut: '/portfolio', content: 'Here\'s our portfolio with recent projects across various industries. Let us know which style appeals to you! 🌐' },
  { name: 'Website Pricing',    shortcut: '/webprice',  content: 'Our website packages start from ₹15,000 for basic landing pages to ₹75,000+ for e-commerce. Want a detailed quote for your requirements? 💻' },
  { name: 'Project Timeline',   shortcut: '/timeline',  content: 'A typical website takes 3–4 weeks. E-commerce projects take 6–8 weeks. We work in sprints with regular feedback checkpoints. 🗓️' },
  { name: 'Demo Call Invite',   shortcut: '/demo',      content: 'Let\'s schedule a 30-minute discovery call to understand your goals better. Please share your preferred slot and we\'ll send a calendar invite! 📅' },
  // Food
  { name: 'Menu Link',          shortcut: '/menu',      content: 'Here\'s our updated menu with today\'s specials! 🍽️ We also have family meal combos and bulk tiffin packages. Let me know your preference.' },
  { name: 'Delivery Time',      shortcut: '/delivery',  content: 'We deliver within 45–60 minutes to nearby areas. For locations beyond 10 km, delivery takes 75–90 minutes. 🛵' },
  { name: 'Catering Enquiry',   shortcut: '/catering',  content: 'We offer catering for events from 20 to 500+ guests. Our packages include vegetarian, Jain, and mixed non-veg options. Want a customized quote? 🍱' },
  { name: 'Order Confirmation', shortcut: '/orderconf', content: 'Your order has been confirmed! 🎉 Estimated delivery: 45–60 mins. Our delivery partner will call you before arrival.' },
];
for (const cr of CANNED) {
  await prisma.cannedResponse.create({ data: { organizationId, ...cr } });
}
console.log(`  ✓ ${CANNED.length} canned responses`);

// ── 6. Auto Replies ───────────────────────────────────────────────────────────
console.log('\n--- Auto Replies ---');
const AUTO_REPLIES = [
  { name: 'Hello Greeting',    triggerType: 'contains',    triggerKeyword: 'hello',    replyText: 'Hi there! 👋 Thanks for reaching out. How can we help you today?', priorityIndex: 1 },
  { name: 'Hi Greeting',       triggerType: 'contains',    triggerKeyword: 'hi',       replyText: 'Hey! 😊 Welcome! How can we assist you?', priorityIndex: 2 },
  { name: 'Pricing Enquiry',   triggerType: 'contains',    triggerKeyword: 'price',    replyText: 'Thanks for your interest! 💰 Our team will share pricing details shortly. Could you tell us what you\'re looking for?', priorityIndex: 3 },
  { name: 'Business Hours',    triggerType: 'contains',    triggerKeyword: 'timing',   replyText: '🕘 We\'re open Mon–Sat, 10 AM to 8 PM IST. If you\'re messaging after hours, we\'ll reply tomorrow morning!', priorityIndex: 4 },
  { name: 'Order Status',      triggerType: 'contains',    triggerKeyword: 'order',    replyText: 'I\'ll check on your order right away! 📦 Could you please share your order ID or the phone number used at the time of purchase?', priorityIndex: 5 },
  { name: 'Thank You Reply',   triggerType: 'contains',    triggerKeyword: 'thank',    replyText: 'You\'re most welcome! 😊 Always here to help.', priorityIndex: 6 },
  { name: 'Complaint Keyword', triggerType: 'contains',    triggerKeyword: 'complaint',replyText: 'We\'re sorry to hear that! 🙏 Your concern is important to us. A senior team member will reach you within 2 hours to resolve this.', priorityIndex: 7 },
];
for (const ar of AUTO_REPLIES) {
  await prisma.autoReply.create({ data: { organizationId, ...ar } });
}
console.log(`  ✓ ${AUTO_REPLIES.length} auto replies`);

// ── 7. Flows ──────────────────────────────────────────────────────────────────
console.log('\n--- Flows ---');
const FLOWS = [
  { name: 'Welcome & Route', triggerType: 'new_conversation', flowDefinition: { startNodeId:'n1', nodes:[{id:'n1',type:'send_text',config:{text:'Hi {{first_name}}! 👋 Welcome! How can we help you today?'},next:'n2'},{id:'n2',type:'send_buttons',config:{body:'Please choose an option:',buttons:[{id:'sales',text:'🛍️ Sales'},{id:'support',text:'🆘 Support'},{id:'other',text:'❓ Other'}],waitForReply:true},next:'n3'},{id:'n3',type:'condition',config:{conditionType:'contains',value:'sales'},next:'n4',nextNo:'n6'},{id:'n4',type:'add_label',config:{tag:'Hot Lead'},next:'n5'},{id:'n5',type:'send_text',config:{text:'Great! 🙌 Our sales team will reach you shortly.'},next:'n_end'},{id:'n6',type:'condition',config:{conditionType:'contains',value:'support'},next:'n7',nextNo:'n9'},{id:'n7',type:'add_label',config:{tag:'Follow Up'},next:'n8'},{id:'n8',type:'send_text',config:{text:'Got it! ⚙️ Our support team will assist you soon.'},next:'n_end'},{id:'n9',type:'send_text',config:{text:'Thanks for reaching out! ✅ Our team will get back to you shortly.'},next:'n_end'},{id:'n_end',type:'end',config:{},next:null}] } },
  { name: 'Lead Qualification', triggerType: 'keyword_match', flowDefinition: { startNodeId:'n1', nodes:[{id:'n1',type:'send_text',config:{text:'Hi {{first_name}}! 👋 Glad to hear you\'re interested. Let me ask a few quick questions.'},next:'n2'},{id:'n2',type:'ask_question',config:{question:'Which product or service are you looking for?',saveToField:'notes'},next:'n3'},{id:'n3',type:'ask_question',config:{question:'What is your approximate budget?'},next:'n4'},{id:'n4',type:'ask_question',config:{question:'When are you looking to purchase?'},next:'n5'},{id:'n5',type:'add_label',config:{tag:'Hot Lead'},next:'n6'},{id:'n6',type:'update_stage',config:{lifecycleStage:'prospect'},next:'n7'},{id:'n7',type:'send_text',config:{text:'Thank you! 🎯 Our team will contact you within 24 hours.'},next:'n_end'},{id:'n_end',type:'end',config:{},next:null}] } },
  { name: 'Support Triage', triggerType: 'keyword_match', flowDefinition: { startNodeId:'n1', nodes:[{id:'n1',type:'send_text',config:{text:'Hi {{first_name}}! Sorry to hear you\'re facing an issue. We\'re here to help! 🛠️'},next:'n2'},{id:'n2',type:'send_buttons',config:{body:'What does your issue relate to?',buttons:[{id:'order',text:'📦 Order'},{id:'payment',text:'💳 Payment'},{id:'technical',text:'⚙️ Technical'}],waitForReply:true},next:'n3'},{id:'n3',type:'condition',config:{conditionType:'contains',value:'order'},next:'n4',nextNo:'n5'},{id:'n4',type:'add_label',config:{tag:'Complaint'},next:'n8'},{id:'n5',type:'condition',config:{conditionType:'contains',value:'payment'},next:'n6',nextNo:'n7'},{id:'n6',type:'add_label',config:{tag:'Complaint'},next:'n8'},{id:'n7',type:'add_label',config:{tag:'Complaint'},next:'n8'},{id:'n8',type:'send_text',config:{text:'Thanks! ✅ Our support team has been notified and will reach you shortly.'},next:'n_end'},{id:'n_end',type:'end',config:{},next:null}] } },
  { name: 'Opt-in Collection', triggerType: 'contact_created', flowDefinition: { startNodeId:'n1', nodes:[{id:'n1',type:'send_text',config:{text:'Hi {{first_name}}! 👋 You\'ve been added to our contact list.'},next:'n2'},{id:'n2',type:'send_buttons',config:{body:'Would you like to receive WhatsApp updates from us?',buttons:[{id:'yes',text:'✅ Yes, opt me in'},{id:'no',text:'❌ No thanks'}],waitForReply:true},next:'n3'},{id:'n3',type:'condition',config:{conditionType:'contains',value:'yes'},next:'n4',nextNo:'n6'},{id:'n4',type:'opt_in',config:{},next:'n5'},{id:'n5',type:'send_text',config:{text:'Perfect! 🎉 You\'re now opted in.'},next:'n_end'},{id:'n6',type:'opt_out',config:{},next:'n7'},{id:'n7',type:'send_text',config:{text:'No problem! 👍 Feel free to reach out anytime.'},next:'n_end'},{id:'n_end',type:'end',config:{},next:null}] } },
  { name: 'No-Reply Follow-up', triggerType: 'no_reply', flowDefinition: { startNodeId:'n1', nodes:[{id:'n1',type:'send_text',config:{text:'Hi {{first_name}}! 👋 We noticed you haven\'t responded. Still interested?'},next:'n2'},{id:'n2',type:'send_buttons',config:{body:'Are you still interested in our services?',buttons:[{id:'yes',text:'✅ Yes'},{id:'no',text:'❌ Not now'}],waitForReply:true},next:'n3'},{id:'n3',type:'condition',config:{conditionType:'contains',value:'yes'},next:'n4',nextNo:'n6'},{id:'n4',type:'add_label',config:{tag:'Re-engaged'},next:'n5'},{id:'n5',type:'send_text',config:{text:'Wonderful! 🙌 Our team will get in touch shortly.'},next:'n_end'},{id:'n6',type:'update_stage',config:{lifecycleStage:'churned'},next:'n7'},{id:'n7',type:'send_text',config:{text:'No worries! 😊 Feel free to reach out whenever you\'re ready.'},next:'n_end'},{id:'n_end',type:'end',config:{},next:null}] } },
  { name: 'Unsubscribe Handler', triggerType: 'inbound_message', flowDefinition: { startNodeId:'n1', nodes:[{id:'n1',type:'condition',config:{conditionType:'contains',value:'stop'},next:'n2',nextNo:'n_end'},{id:'n2',type:'opt_out',config:{},next:'n3'},{id:'n3',type:'send_text',config:{text:'You\'ve been unsubscribed. 🚫 Reply START anytime to re-subscribe.'},next:'n_end'},{id:'n_end',type:'end',config:{},next:null}] } },
  { name: 'CSAT Survey', triggerType: 'conversation_resolved', flowDefinition: { startNodeId:'n1', nodes:[{id:'n1',type:'send_text',config:{text:'Hi {{first_name}}! 👋 Your conversation has been resolved. Hope we were helpful!'},next:'n2'},{id:'n2',type:'send_buttons',config:{body:'How would you rate your experience today?',buttons:[{id:'excellent',text:'😍 Excellent'},{id:'good',text:'👍 Good'},{id:'needs_imp',text:'😕 Needs Improvement'}],waitForReply:false},next:'n_end'},{id:'n_end',type:'end',config:{},next:null}] } },
  { name: 'CSAT Response Handler', triggerType: 'button_reply', flowDefinition: { startNodeId:'n1', nodes:[{id:'n1',type:'condition',config:{conditionType:'contains',value:'excellent'},next:'n2',nextNo:'n4'},{id:'n2',type:'add_label',config:{tag:'CSAT Excellent'},next:'n3'},{id:'n3',type:'send_text',config:{text:'Thank you! ⭐⭐⭐⭐⭐ We love serving you!'},next:'n_end'},{id:'n4',type:'condition',config:{conditionType:'contains',value:'good'},next:'n5',nextNo:'n7'},{id:'n5',type:'add_label',config:{tag:'CSAT Good'},next:'n6'},{id:'n6',type:'send_text',config:{text:'Thanks for the feedback! 👍 See you next time!'},next:'n_end'},{id:'n7',type:'add_label',config:{tag:'CSAT Poor'},next:'n8'},{id:'n8',type:'send_text',config:{text:'We\'re really sorry. 🙏 A team member will follow up with you shortly.'},next:'n_end'},{id:'n_end',type:'end',config:{},next:null}] } },
  { name: 'VIP Customer Welcome', triggerType: 'tag_added', flowDefinition: { startNodeId:'n1', nodes:[{id:'n1',type:'send_text',config:{tag:'vip',text:'🌟 Congratulations, {{first_name}}! You\'ve been added to our VIP list. Enjoy exclusive early access to deals and priority support! 💛'},next:'n_end'},{id:'n_end',type:'end',config:{},next:null}] } },
  { name: 'Customer Onboarding', triggerType: 'lifecycle_change', flowDefinition: { startNodeId:'n1', nodes:[{id:'n1',type:'send_text',config:{lifecycleStage:'customer',text:'🎉 Welcome to the family, {{first_name}}! You\'re now a valued customer. Enjoy priority support and exclusive member-only offers. 💛'},next:'n_end'},{id:'n_end',type:'end',config:{},next:null}] } },
  { name: 'Agent Assignment Notification', triggerType: 'conversation_assigned', flowDefinition: { startNodeId:'n1', nodes:[{id:'n1',type:'send_text',config:{text:'Hi {{first_name}}! 👋 Your query has been assigned to one of our specialists. We\'ll respond within 15 minutes. ⏱️'},next:'n_end'},{id:'n_end',type:'end',config:{},next:null}] } },
];
for (const flow of FLOWS) {
  await prisma.flow.create({ data: { organizationId, name: flow.name, triggerType: flow.triggerType, isActive: true, flowDefinition: flow.flowDefinition } });
  console.log(`  ✓ ${flow.name}`);
}

// ── 8. Templates ──────────────────────────────────────────────────────────────
console.log('\n--- Templates ---');
const TEMPLATES = [
  // Jewellery
  { name: 'gold_rate_update',      category: 'marketing', language: 'en', bodyText: 'Hello {{1}}! 💛 Today\'s gold rate: 22K ₹5,450/g | 24K ₹5,920/g. Visit us or reply to enquire about our latest collection!', components: [{ type:'BODY', text:'Hello {{1}}! 💛 Today\'s gold rate: 22K ₹5,450/g | 24K ₹5,920/g. Visit us or reply to enquire about our latest collection!' }] },
  { name: 'wedding_collection_promo', category: 'marketing', language: 'en', bodyText: 'Hi {{1}}! 💍 Our exclusive bridal jewellery collection is now available. Book a private appointment for a personalised consultation. Limited slots!', components: [{ type:'BODY', text:'Hi {{1}}! 💍 Our exclusive bridal jewellery collection is now available. Book a private appointment for a personalised consultation. Limited slots!' }] },
  { name: 'order_ready_pickup',    category: 'utility',   language: 'en', bodyText: 'Dear {{1}}, your jewellery order is ready for pickup! 🎉 Please visit us between 10 AM–8 PM with your order receipt. We look forward to seeing you!', components: [{ type:'BODY', text:'Dear {{1}}, your jewellery order is ready for pickup! 🎉 Please visit us between 10 AM–8 PM with your order receipt. We look forward to seeing you!' }] },
  // Website / Agency
  { name: 'proposal_followup',     category: 'marketing', language: 'en', bodyText: 'Hi {{1}}! 🌐 Just following up on the website proposal we sent. Have you had a chance to review it? Happy to answer any questions or customise the scope for you!', components: [{ type:'BODY', text:'Hi {{1}}! 🌐 Just following up on the website proposal we sent. Have you had a chance to review it? Happy to answer any questions or customise the scope for you!' }] },
  { name: 'demo_call_reminder',    category: 'utility',   language: 'en', bodyText: 'Hi {{1}}! 📅 This is a reminder for your demo call tomorrow at {{2}}. We\'ll walk you through our portfolio and discuss your project requirements. See you then!', components: [{ type:'BODY', text:'Hi {{1}}! 📅 This is a reminder for your demo call tomorrow at {{2}}. We\'ll walk you through our portfolio and discuss your project requirements. See you then!' }] },
  { name: 'project_milestone_update', category: 'utility', language: 'en', bodyText: 'Hi {{1}}! 🚀 Great news — your project has reached the {{2}} milestone! Please review and share your feedback within 2 days so we can proceed to the next phase.', components: [{ type:'BODY', text:'Hi {{1}}! 🚀 Great news — your project has reached the {{2}} milestone! Please review and share your feedback within 2 days so we can proceed to the next phase.' }] },
  // Food
  { name: 'daily_specials',        category: 'marketing', language: 'en', bodyText: 'Hi {{1}}! 🍽️ Today\'s specials: Butter Paneer Masala + Garlic Naan ₹220 | Chicken Biryani Combo ₹280. Order before 7 PM for same-day delivery!', components: [{ type:'BODY', text:'Hi {{1}}! 🍽️ Today\'s specials: Butter Paneer Masala + Garlic Naan ₹220 | Chicken Biryani Combo ₹280. Order before 7 PM for same-day delivery!' }] },
  { name: 'catering_package_offer', category: 'marketing', language: 'en', bodyText: 'Hi {{1}}! 🍱 Planning an event? Our catering packages start at ₹250/plate for 30+ guests. Customised menus available. Book before {{2}} for 10% off!', components: [{ type:'BODY', text:'Hi {{1}}! 🍱 Planning an event? Our catering packages start at ₹250/plate for 30+ guests. Customised menus available. Book before {{2}} for 10% off!' }] },
  { name: 'feedback_request',      category: 'utility',   language: 'en', bodyText: 'Hi {{1}}! 😊 Thank you for ordering from us! How was your experience today? Your feedback helps us serve you better. Please reply with a rating: Excellent / Good / Needs Improvement.', components: [{ type:'BODY', text:'Hi {{1}}! 😊 Thank you for ordering from us! How was your experience today? Your feedback helps us serve you better. Please reply with a rating: Excellent / Good / Needs Improvement.' }] },
];
const templateMap = {};
for (const t of TEMPLATES) {
  const created = await prisma.template.create({
    data: { organizationId, name: t.name, category: t.category, language: t.language, bodyText: t.bodyText, components: t.components, status: 'approved' },
  });
  templateMap[t.name] = created.id;
  console.log(`  ✓ ${t.name}`);
}

// ── 9. Contacts ───────────────────────────────────────────────────────────────
console.log('\n--- Contacts ---');

const CONTACTS_DATA = [
  // ── Jewellery customers ────────────────────────────────────────────────────
  { firstName:'Priya',    lastName:'Sharma',   phoneNumber:'919876543210', email:'priya.sharma@gmail.com',     lifecycleStage:'customer', tags:['jewellery','vip'],          notes:'Repeat customer. Purchased diamond necklace set in Jan. Interested in matching earrings.',   vertical:'jewellery' },
  { firstName:'Rahul',    lastName:'Mehta',    phoneNumber:'919823456781', email:'rahul.mehta@gmail.com',      lifecycleStage:'prospect', tags:['jewellery','wedding'],       notes:'Planning wedding in December. Looking for bridal set under ₹2L.',                          vertical:'jewellery' },
  { firstName:'Sunita',   lastName:'Patel',    phoneNumber:'919934567892', email:'sunita.patel@yahoo.com',     lifecycleStage:'lead',     tags:['jewellery'],                 notes:'Enquired about 22K gold bangles. Budget ₹50,000.',                                         vertical:'jewellery' },
  { firstName:'Vikram',   lastName:'Singh',    phoneNumber:'919745678903', email:'vikram.singh@outlook.com',   lifecycleStage:'customer', tags:['jewellery','custom-order'],  notes:'Custom gold chain order placed. Ready in 10 days.',                                        vertical:'jewellery' },
  { firstName:'Anita',    lastName:'Gupta',    phoneNumber:'919856789014', email:'anita.gupta@gmail.com',      lifecycleStage:'prospect', tags:['jewellery','diamond'],       notes:'Interested in diamond solitaire ring. Comparing options.',                                  vertical:'jewellery' },
  { firstName:'Rajesh',   lastName:'Kumar',    phoneNumber:'919967890125', email:'rajesh.kumar@gmail.com',     lifecycleStage:'customer', tags:['jewellery','vip'],           notes:'Purchased silver articles worth ₹30,000. Comes every Diwali.',                             vertical:'jewellery' },
  { firstName:'Kavita',   lastName:'Joshi',    phoneNumber:'919678901236', email:'kavita.joshi@rediffmail.com',lifecycleStage:'lead',     tags:['jewellery'],                 notes:'Repair job — broken gold necklace clasp. Picked up.',                                      vertical:'jewellery' },
  { firstName:'Arun',     lastName:'Nair',     phoneNumber:'919789012347', email:'arun.nair@gmail.com',        lifecycleStage:'prospect', tags:['jewellery','wedding'],       notes:'Buying gold coins for daughter\'s wedding gift. ₹1L budget.',                              vertical:'jewellery' },
  { firstName:'Deepa',    lastName:'Pillai',   phoneNumber:'919890123458', email:'deepa.pillai@gmail.com',     lifecycleStage:'customer', tags:['jewellery'],                 notes:'Purchased pearl necklace. Wants matching bracelet.',                                        vertical:'jewellery' },
  { firstName:'Mohan',    lastName:'Agarwal',  phoneNumber:'919901234569', email:'mohan.agarwal@gmail.com',    lifecycleStage:'lead',     tags:['jewellery','gold'],          notes:'Investment purchase — 10g gold coins. Waiting for rates to dip.',                          vertical:'jewellery' },
  // ── Website / Agency clients ───────────────────────────────────────────────
  { firstName:'Deepak',   lastName:'Verma',    phoneNumber:'918012345670', email:'deepak.verma@startup.in',    lifecycleStage:'customer', tags:['website','seo'],            notes:'E-commerce website completed. Now wants SEO package.',                                      vertical:'website' },
  { firstName:'Sonia',    lastName:'Agarwal',  phoneNumber:'918123456781', email:'sonia@designstudio.in',      lifecycleStage:'prospect', tags:['website','social-media'],   notes:'Interior design studio. Wants portfolio site + Instagram management.',                     vertical:'website' },
  { firstName:'Manish',   lastName:'Tiwari',   phoneNumber:'918234567892', email:'manish.tiwari@business.com', lifecycleStage:'lead',     tags:['website'],                  notes:'Restaurant owner. Needs basic website with menu and booking form.',                         vertical:'website' },
  { firstName:'Ritu',     lastName:'Sharma',   phoneNumber:'918345678903', email:'ritu.sharma@clinic.in',      lifecycleStage:'customer', tags:['website','project-active'], notes:'Dental clinic website live. Monthly blog writing ongoing.',                                vertical:'website' },
  { firstName:'Ashok',    lastName:'Yadav',    phoneNumber:'918456789014', email:'ashok@retailchain.com',      lifecycleStage:'prospect', tags:['website','seo'],            notes:'Retail chain with 3 stores. Wants SEO + Google Ads management.',                           vertical:'website' },
  { firstName:'Pooja',    lastName:'Mishra',   phoneNumber:'918567890125', email:'pooja.mishra@fashion.in',    lifecycleStage:'lead',     tags:['website'],                  notes:'Fashion boutique. Wants Shopify store with payment gateway.',                              vertical:'website' },
  { firstName:'Nikhil',   lastName:'Bhat',     phoneNumber:'918678901236', email:'nikhil.bhat@tech.io',        lifecycleStage:'customer', tags:['website','social-media'],   notes:'Tech startup. Website done. Handling LinkedIn content.',                                   vertical:'website' },
  { firstName:'Shreya',   lastName:'Kapoor',   phoneNumber:'918789012347', email:'shreya@eventsco.in',         lifecycleStage:'prospect', tags:['website','proposal-sent'],  notes:'Event management company. Proposal sent ₹45,000. Awaiting approval.',                     vertical:'website' },
  { firstName:'Arjun',    lastName:'Reddy',    phoneNumber:'918890123458', email:'arjun.reddy@school.edu',     lifecycleStage:'lead',     tags:['website'],                  notes:'Private school. Wants admissions-focused website with form integration.',                  vertical:'website' },
  { firstName:'Lakshmi',  lastName:'Iyer',     phoneNumber:'918901234569', email:'lakshmi.iyer@ngo.org',       lifecycleStage:'lead',     tags:['website'],                  notes:'NGO — needs donation-enabled website. Low budget ₹15,000.',                               vertical:'website' },
  // ── Food business customers ────────────────────────────────────────────────
  { firstName:'Suresh',   lastName:'Pandey',   phoneNumber:'917012345670', email:'suresh.pandey@gmail.com',    lifecycleStage:'customer', tags:['food','regular'],           notes:'Orders veg thali every Tuesday. Family of 4.',                                             vertical:'food' },
  { firstName:'Meena',    lastName:'Singh',    phoneNumber:'917123456781', email:'meena.singh@gmail.com',      lifecycleStage:'customer', tags:['food','vip'],               notes:'Corporate tiffin client. 15 tiffins daily, Mon–Fri.',                                      vertical:'food' },
  { firstName:'Geeta',    lastName:'Krishnan', phoneNumber:'917234567892', email:'geeta.k@company.com',        lifecycleStage:'prospect', tags:['food','catering'],          notes:'Office party for 50 people on 15th. Wants North Indian menu.',                             vertical:'food' },
  { firstName:'Rohit',    lastName:'Gupta',    phoneNumber:'917345678903', email:'rohit.gupta@gmail.com',      lifecycleStage:'customer', tags:['food','regular'],           notes:'Weekend biryani orders. 2–3 times per month.',                                             vertical:'food' },
  { firstName:'Swati',    lastName:'Kapoor',   phoneNumber:'917456789014', email:'swati.kapoor@hotmail.com',   lifecycleStage:'lead',     tags:['food'],                     notes:'New customer. Ordered once, hasn\'t reordered yet.',                                        vertical:'food' },
  { firstName:'Rajan',    lastName:'Pillai',   phoneNumber:'917567890125', email:'rajan.pillai@gmail.com',     lifecycleStage:'customer', tags:['food','bulk-order'],        notes:'Monthly bulk order — savouries for temple. ₹8,000–₹12,000.',                             vertical:'food' },
  { firstName:'Nisha',    lastName:'Shah',     phoneNumber:'917678901236', email:'nisha.shah@gmail.com',       lifecycleStage:'customer', tags:['food','regular'],           notes:'Healthy meal plan subscriber. 5 days/week tiffin.',                                        vertical:'food' },
  { firstName:'Pavan',    lastName:'Jain',     phoneNumber:'917789012347', email:'pavan.jain@business.in',     lifecycleStage:'prospect', tags:['food','catering'],          notes:'Wedding reception catering for 200 guests. Comparing quotes.',                             vertical:'food' },
  { firstName:'Kamla',    lastName:'Desai',    phoneNumber:'917890123458', email:'kamla.desai@gmail.com',      lifecycleStage:'customer', tags:['food','feedback'],          notes:'Complained about cold delivery once. Resolved. Now back as regular.',                      vertical:'food' },
  { firstName:'Venkat',   lastName:'Rao',      phoneNumber:'917901234569', email:'venkat.rao@office.com',      lifecycleStage:'lead',     tags:['food'],                     notes:'Office canteen enquiry for 30 daily lunches.',                                             vertical:'food' },
];

const contactMap = {};
for (const c of CONTACTS_DATA) {
  const { vertical, ...contactData } = c;
  const created = await prisma.contact.create({
    data: {
      organizationId,
      phoneNumber: contactData.phoneNumber,
      name: `${contactData.firstName} ${contactData.lastName}`,
      firstName: contactData.firstName,
      lastName: contactData.lastName,
      email: contactData.email,
      tags: contactData.tags,
      notes: contactData.notes,
      countryCode: 'IN',
      languageCode: 'en',
    },
  });
  contactMap[contactData.phoneNumber] = { id: created.id, vertical, firstName: contactData.firstName };
  process.stdout.write('.');
}
console.log(`\n  ✓ ${CONTACTS_DATA.length} contacts`);

// ── 10. Conversations + Messages ──────────────────────────────────────────────
console.log('\n--- Conversations & Messages ---');

async function createConversation(contactId, status, messages, daysBack, teamId = null) {
  const lastMsg = messages[messages.length - 1];
  const conv = await prisma.conversation.create({
    data: {
      organizationId,
      contactId,
      status,
      teamId,
      lastMessageAt: daysAgo(daysBack),
      lastInboundAt: daysAgo(daysBack, 10),
      unreadCount: status === 'open' ? Math.floor(Math.random() * 3) : 0,
      closedAt: status === 'resolved' ? daysAgo(daysBack - 1) : null,
      createdAt: daysAgo(daysBack + 1),
    },
  });
  let t = daysBack;
  for (const msg of messages) {
    t -= 0.02;
    await prisma.message.create({
      data: {
        conversationId: conv.id,
        organizationId,
        direction: msg.dir,
        contentType: 'text',
        body: msg.body,
        status: msg.dir === 'outbound' ? 'read' : 'sent',
        senderName: msg.dir === 'inbound' ? null : 'Support Team',
        sentAt: daysAgo(t),
        createdAt: daysAgo(t),
      },
    });
  }
  return conv;
}

// Jewellery conversations
const jewelleryContacts = CONTACTS_DATA.filter(c => c.vertical === 'jewellery');
const jc = jewelleryContacts;

await createConversation(contactMap[jc[0].phoneNumber].id, 'resolved', [
  { dir:'inbound',  body:'Hello, I wanted to check on my diamond necklace order. Order #DN-2847.' },
  { dir:'outbound', body:'Hi Priya! 😊 Let me check that for you right away.' },
  { dir:'outbound', body:'Good news! Your diamond necklace set is ready and has passed quality inspection. You can pick it up anytime between 10 AM–8 PM.' },
  { dir:'inbound',  body:'Wonderful! I\'ll come tomorrow evening around 6 PM.' },
  { dir:'outbound', body:'Perfect! We\'ll have it ready for you. See you tomorrow! 💎' },
  { dir:'inbound',  body:'Thank you so much!' },
  { dir:'outbound', body:'You\'re welcome, Priya! 😊 Looking forward to seeing you.' },
], 3, supportTeam.id);

await createConversation(contactMap[jc[1].phoneNumber].id, 'open', [
  { dir:'inbound',  body:'Hi, I\'m planning my wedding in December and looking for a complete bridal jewellery set.' },
  { dir:'outbound', body:'Congratulations Rahul! 🎉 We have a stunning collection of bridal sets. What is your approximate budget and preferred metal — gold or polki?' },
  { dir:'inbound',  body:'Budget is around ₹1.8–2 lakhs. Gold preferred. My fiancée loves traditional designs.' },
  { dir:'outbound', body:'Perfect! We have 3 beautiful traditional gold bridal sets in that range. Can I share some photos?' },
  { dir:'inbound',  body:'Yes please!' },
  { dir:'outbound', body:'I\'ve sent 3 options to your email. All include necklace + earrings + bangles. Which one appeals most? We can also customise the design.' },
  { dir:'inbound',  body:'The second one looks perfect. Can we meet this weekend to see it in person?' },
  { dir:'outbound', body:'Absolutely! Saturday or Sunday? We can book a private slot for you.' },
], 1, salesTeam.id);

await createConversation(contactMap[jc[2].phoneNumber].id, 'open', [
  { dir:'inbound',  body:'Namaste, I want to buy 22K gold bangles for my daughter. Can you tell me the current rate?' },
  { dir:'outbound', body:'Namaste Sunita ji! 🙏 Current 22K gold rate is ₹5,450/g. For a standard set of 4 bangles (~30g each), it would be approx ₹1.9–2.1L depending on making charges.' },
  { dir:'inbound',  body:'That\'s a bit above my budget. Do you have lighter weight options?' },
  { dir:'outbound', body:'Yes! We have 20g bangles as well — that would come to ₹1.3–1.5L. We also have stylish half-karat bangles starting ₹45,000/pair.' },
  { dir:'inbound',  body:'The half-karat ones sound good. Can I come see tomorrow?' },
  { dir:'outbound', body:'Of course! We\'re open from 10 AM. Ask for Rajiv at the counter — he\'ll show you our complete bangle collection. 😊' },
], 2);

await createConversation(contactMap[jc[3].phoneNumber].id, 'resolved', [
  { dir:'inbound',  body:'Hello! I placed a custom gold chain order 2 weeks ago. Order ID CV-1923. Is it ready?' },
  { dir:'outbound', body:'Hello Vikram! Let me check the status with our workshop.' },
  { dir:'outbound', body:'Your chain is currently in the final polishing stage. Should be ready in 2 days. We\'ll WhatsApp you when it\'s ready for pickup!' },
  { dir:'inbound',  body:'Great! Thanks for the update.' },
  { dir:'outbound', body:'Great news Vikram! 🎉 Your custom chain is ready. Beautiful craftsmanship — we\'re sure you\'ll love it! Please come anytime between 10–8 PM.' },
  { dir:'inbound',  body:'Coming today at 4 PM. Thanks!' },
  { dir:'outbound', body:'See you at 4 PM! 😊' },
], 5, salesTeam.id);

await createConversation(contactMap[jc[5].phoneNumber].id, 'open', [
  { dir:'inbound',  body:'Hi, is this Mehta Jewellers? I\'m looking for a Diwali gift for my wife.' },
  { dir:'outbound', body:'Yes! Hello Rajesh ji 😊 Happy upcoming Diwali! We have a beautiful range of gifts — from gold coins to silver articles and elegant jewellery sets. What\'s your budget?' },
  { dir:'inbound',  body:'Around ₹15,000–₹20,000.' },
  { dir:'outbound', body:'In that range we have: 5g gold coins (₹16,000), silver dinner set (₹18,000), or a beautiful silver & pearl necklace (₹14,500). All come in gift packaging! 🎁' },
  { dir:'inbound',  body:'The gold coin sounds perfect. Can I order online and pick up?' },
  { dir:'outbound', body:'Absolutely! I\'ll share our payment link. Once confirmed, your order will be gift-wrapped and ready within the hour. 😊' },
], 0);

// Website conversations
const wc = CONTACTS_DATA.filter(c => c.vertical === 'website');

await createConversation(contactMap[wc[0].phoneNumber].id, 'resolved', [
  { dir:'inbound',  body:'Hi! My website has been live for 2 months. I want to discuss SEO now.' },
  { dir:'outbound', body:'Hey Deepak! 😊 Great to hear the site is performing well. Let\'s definitely talk SEO. Are you targeting local customers or all-India?' },
  { dir:'inbound',  body:'Primarily Mumbai, but would love to expand to Pune and Bangalore.' },
  { dir:'outbound', body:'Perfect. For 3 cities I\'d recommend our ₹18,000/month SEO package — includes on-page, technical SEO, 8 blogs/month, and monthly reports. Want to start with a free audit?' },
  { dir:'inbound',  body:'Yes! Send the audit report and I\'ll decide.' },
  { dir:'outbound', body:'Audit done! 📊 Found 23 improvement points. I\'ve sent the detailed report to your email. Good news — your site has a strong foundation. Quick wins possible in 60–90 days!' },
  { dir:'inbound',  body:'Excellent! Let\'s go ahead with the SEO package.' },
  { dir:'outbound', body:'Wonderful! 🎉 I\'ll send the agreement and first month\'s invoice. We\'ll start the keyword research this week!' },
], 7, salesTeam.id);

await createConversation(contactMap[wc[1].phoneNumber].id, 'open', [
  { dir:'inbound',  body:'Hello! I run an interior design studio and need a portfolio website. How much would it cost?' },
  { dir:'outbound', body:'Hi Sonia! 👋 A portfolio website with gallery, contact form, and Instagram feed integration would be ₹22,000–₹28,000. Turnaround: 3 weeks. Want to see some samples?' },
  { dir:'inbound',  body:'Yes please! Also do you handle Instagram management?' },
  { dir:'outbound', body:'Absolutely! Our social media package is ₹8,000/month — 12 posts/month, stories, caption writing, and engagement management. Want a combined package proposal?' },
  { dir:'inbound',  body:'That would be great. Please send a detailed proposal.' },
  { dir:'outbound', body:'Proposal sent to your email! Website (₹25,000) + 3 months social media (₹24,000) = ₹49,000 total, with a 10% combo discount. 😊' },
], 2, salesTeam.id);

await createConversation(contactMap[wc[3].phoneNumber].id, 'resolved', [
  { dir:'inbound',  body:'Hi! The dental clinic website looks great. Can we add a monthly blog section?' },
  { dir:'outbound', body:'Hi Ritu! So glad you\'re happy with the site! 😊 Adding a blog section would be a one-time ₹3,500 development charge. Ongoing blog writing is ₹2,000/article.' },
  { dir:'inbound',  body:'Let\'s do 2 articles per month. Can you start from next month?' },
  { dir:'outbound', body:'Confirmed! 2 articles/month at ₹4,000/month. First topics: "5 Signs You Need a Root Canal" and "Importance of Regular Dental Cleanings". Does that work?' },
  { dir:'inbound',  body:'Perfect topics! Go ahead.' },
  { dir:'outbound', body:'Great! First draft ready by the 5th of next month. 🖊️' },
], 10, salesTeam.id);

await createConversation(contactMap[wc[6].phoneNumber].id, 'open', [
  { dir:'inbound',  body:'Hey! Quick update — one of my LinkedIn posts went viral. 45K impressions! 🎉' },
  { dir:'outbound', body:'That\'s amazing, Nikhil! 🚀 Great engagement! Which topic was it?' },
  { dir:'inbound',  body:'The "Startup lessons from my first failure" post. Can we do a series on it?' },
  { dir:'outbound', body:'100%! A 5-part "Lessons from Failure" series would be incredible for authority building. I\'ll draft the content calendar this week. Expect it by Thursday!' },
  { dir:'inbound',  body:'Looking forward to it!' },
], 1);

await createConversation(contactMap[wc[7].phoneNumber].id, 'pending', [
  { dir:'inbound',  body:'Hi! Did you receive our proposal feedback?' },
  { dir:'outbound', body:'Hi Shreya! Yes, received it. We can reduce the scope by removing the live chat integration — that brings it down to ₹38,000. Does that work?' },
  { dir:'inbound',  body:'Let me check with my partner and get back to you by Friday.' },
  { dir:'outbound', body:'Of course! Take your time. The offer is valid till end of month. 😊' },
], 3);

// Food conversations
const fc = CONTACTS_DATA.filter(c => c.vertical === 'food');

await createConversation(contactMap[fc[0].phoneNumber].id, 'open', [
  { dir:'inbound',  body:'Hi! Can I order today\'s thali for 4 people? What are the options?' },
  { dir:'outbound', body:'Hi Suresh! 😊 Today\'s veg thali (₹120/plate): Dal tadka, Aloo sabzi, Paneer, 5 rotis, rice, salad & dessert. For 4 people that\'s ₹480. Cash or UPI?' },
  { dir:'inbound',  body:'UPI please. Sending now.' },
  { dir:'outbound', body:'Payment received! ✅ Order confirmed for 4 thalis. Delivery in 40–50 minutes. 🚴' },
  { dir:'inbound',  body:'Great! Please don\'t forget extra chutney.' },
  { dir:'outbound', body:'Extra chutney noted! 😄 Driver will call before arriving.' },
], 0, supportTeam.id);

await createConversation(contactMap[fc[1].phoneNumber].id, 'resolved', [
  { dir:'inbound',  body:'This month\'s invoice for tiffin please.' },
  { dir:'outbound', body:'Hi Meena! Here are October\'s details: 22 working days × 15 tiffins × ₹85 = ₹28,050. Invoice sent to your email. Due by 5th Nov.' },
  { dir:'inbound',  body:'Received. One thing — 3 days last week the dal was too watery. Please check quality.' },
  { dir:'outbound', body:'Apologies Meena! 🙏 Feedback noted and shared with the kitchen. We\'re adding a quality check step for dal consistency. Will make it right from tomorrow!' },
  { dir:'inbound',  body:'Thank you for being responsive!' },
  { dir:'outbound', body:'Always! Your satisfaction is our priority. 😊 Invoice sent.' },
], 8, supportTeam.id);

await createConversation(contactMap[fc[2].phoneNumber].id, 'open', [
  { dir:'inbound',  body:'Hello! We want to plan an office party for 50 people on the 15th. Can you cater?' },
  { dir:'outbound', body:'Hi Geeta! 😊 Absolutely! For 50 people we recommend our Office Party Package: Live counters (Pav Bhaji + Pani Puri), Mini meals (Biryani + Raita + Dessert), Starters = ₹350/person. Total ₹17,500.' },
  { dir:'inbound',  body:'That sounds good. Do you have non-veg options too?' },
  { dir:'outbound', body:'Yes! We can add Chicken Tikka and Mutton Seekh Kebab counters for ₹50/person extra. Total with non-veg: ₹20,000 for 50 pax.' },
  { dir:'inbound',  body:'Perfect. Can you send a formal quotation to my email?' },
  { dir:'outbound', body:'Sending now! 📧 We\'ll need 50% advance to confirm the booking. Let me know if you have any dietary restrictions.' },
], 1, salesTeam.id);

await createConversation(contactMap[fc[3].phoneNumber].id, 'resolved', [
  { dir:'inbound',  body:'Hi! I ordered mutton biryani Sunday but it never arrived. What happened?' },
  { dir:'outbound', body:'Hi Rohit, so sorry about this! 🙏 Let me check immediately with our delivery team.' },
  { dir:'outbound', body:'I\'ve checked — the delivery partner had a breakdown near your area. We should have called you. This is completely our fault. Full refund processed and we\'re sending fresh biryani complimentary now!' },
  { dir:'inbound',  body:'Oh wow, thank you for resolving so quickly!' },
  { dir:'outbound', body:'Biryani is on the way! 🍛 ETA 30 minutes. We\'ve added extra raita and gulab jamun as apology. 😊 Thank you for your patience Rohit!' },
  { dir:'inbound',  body:'Received! It was delicious. All good!' },
], 5, supportTeam.id);

await createConversation(contactMap[fc[5].phoneNumber].id, 'open', [
  { dir:'inbound',  body:'Namaste! Can I book sweets and savouries for temple prasad next month? About 300 packets.' },
  { dir:'outbound', body:'Namaste Rajan ji! 🙏 For 300 packets we can prepare: Ladoo (200g each) + Chivda packet = ₹45/packet = ₹13,500 total. Advance booking discount: 5% off if booked 2 weeks ahead.' },
  { dir:'inbound',  body:'Great! Which date can you deliver?' },
  { dir:'outbound', body:'We can deliver any day with 2 weeks notice. Please confirm the date and advance payment (₹6,000) and we\'ll block your slot! 🙏' },
  { dir:'inbound',  body:'I\'ll confirm by tomorrow.' },
], 2, salesTeam.id);

console.log(`  ✓ 15 conversations with messages`);

// ── 11. Deals ─────────────────────────────────────────────────────────────────
console.log('\n--- Deals ---');

const DEALS = [
  // Jewellery deals
  { title: 'Rahul Mehta — Bridal Set', value: 185000, stage: 'negotiation', contactPhone: '919823456781', notes: 'Shortlisted traditional gold set. Final decision expected after family visit.' },
  { title: 'Anita Gupta — Diamond Ring', value: 65000,  stage: 'qualified',  contactPhone: '919856789014', notes: 'Comparing 3 options. Decision expected this week.' },
  { title: 'Arun Nair — Wedding Gold Coins', value: 95000, stage: 'proposal_sent', contactPhone: '919789012347', notes: 'Quotation sent for 10+5g gold coins. Awaiting confirmation.' },
  { title: 'Vikram Singh — Custom Chain', value: 28000,  stage: 'won',        contactPhone: '919745678903', notes: 'Order delivered. Payment complete.' },
  { title: 'Priya Sharma — Matching Earrings', value: 45000, stage: 'qualified', contactPhone: '919876543210', notes: 'Returning customer. High conversion probability.' },
  // Website deals
  { title: 'Sonia Agarwal — Portfolio + Social', value: 49000,  stage: 'proposal_sent', contactPhone: '918123456781', notes: 'Combo proposal sent. 10% discount applied.' },
  { title: 'Ashok Yadav — SEO + Ads Management', value: 25000,  stage: 'qualified',     contactPhone: '918456789014', notes: 'Monthly retainer. Starting Q1.' },
  { title: 'Shreya Kapoor — Events Website',     value: 38000,  stage: 'negotiation',   contactPhone: '918789012347', notes: 'Reducing scope to cut cost. Decision by Friday.' },
  { title: 'Deepak Verma — SEO Package',         value: 54000,  stage: 'won',           contactPhone: '918012345670', notes: '3-month SEO contract signed. Started.' },
  { title: 'Pavan Jain — Wedding Catering',      value: 125000, stage: 'proposal_sent', contactPhone: '917789012347', notes: 'Quotation for 200 pax. Comparing 2 vendors.' },
  // Food deals
  { title: 'Geeta Krishnan — Office Party',      value: 20000,  stage: 'negotiation',   contactPhone: '917234567892', notes: 'Non-veg addon added. Awaiting advance.' },
  { title: 'Meena Singh — Annual Tiffin Contract', value: 336600, stage: 'won',          contactPhone: '917123456781', notes: '15 tiffins/day × 22 days × 12 months at ₹85.' },
  { title: 'Venkat Rao — Office Canteen',        value: 45000,  stage: 'new_lead',       contactPhone: '917901234569', notes: '30 daily lunches. Initial enquiry.' },
];

for (const deal of DEALS) {
  const contact = contactMap[deal.contactPhone];
  await prisma.deal.create({
    data: {
      organizationId,
      pipelineId: salesPipeline.id,
      title: deal.title,
      value: deal.value,
      stage: deal.stage,
      contactId: contact?.id ?? null,
      notes: deal.notes,
    },
  });
}
console.log(`  ✓ ${DEALS.length} deals`);

// ── 12. Campaigns ─────────────────────────────────────────────────────────────
console.log('\n--- Campaigns ---');

const CAMPAIGNS = [
  { name: 'Diwali Jewellery Sale',    templateId: templateMap['gold_rate_update'],      campaignType: 'template', status: 'completed' },
  { name: 'Bridal Collection Launch', templateId: templateMap['wedding_collection_promo'], campaignType: 'template', status: 'completed' },
  { name: 'Daily Specials Blast',     templateId: templateMap['daily_specials'],          campaignType: 'template', status: 'completed' },
  { name: 'Catering Summer Promo',    templateId: templateMap['catering_package_offer'],  campaignType: 'template', status: 'draft' },
  { name: 'SEO Awareness Campaign',   templateId: templateMap['proposal_followup'],        campaignType: 'template', status: 'draft' },
];

for (const c of CAMPAIGNS) {
  await prisma.campaign.create({
    data: {
      organizationId,
      name: c.name,
      templateId: c.templateId,
      campaignType: c.campaignType,
      isArchived: false,
    },
  });
  console.log(`  ✓ ${c.name}`);
}

await prisma.$disconnect();

console.log('\n=== DEMO SEED COMPLETE ===');
console.log('✓ Role permissions (5 roles)');
console.log('✓ Labels (27)');
console.log('✓ Teams (2)');
console.log('✓ Pipelines (2)');
console.log('✓ Canned responses (19)');
console.log('✓ Auto replies (7)');
console.log('✓ Flows (11)');
console.log('✓ Templates (9)');
console.log('✓ Contacts (30 — jewellery + website + food)');
console.log('✓ Conversations (15 with messages)');
console.log('✓ Deals (13)');
console.log('✓ Campaigns (5)');
console.log('\nNext: Settings → WhatsApp Account → connect your WABA');
