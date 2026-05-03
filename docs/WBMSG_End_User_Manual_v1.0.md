# WBMSG
# WBMSG — End-User Manual
User Documentation per IEEE 26511:2018
Version 1.0  |  April 2026
Public
Document Owner
Head of Customer Success / Documentation Lead
## 1. Welcome
WBMSG is a WhatsApp-first customer relationship platform built for Indian small and mid-sized businesses. This manual takes you from sign-up to your first revenue conversation. Read sections in order on your first day; later, jump to the specific section you need.
### 1.1 Who this manual is for
- Owners and admins setting up WBMSG for the first time.
- Agents handling day-to-day WhatsApp conversations.
- Marketers running campaigns and broadcasts.
- Developers integrating WBMSG into existing systems (see also the API Reference).
### 1.2 Conventions
- Bold text refers to UI labels (Settings, Save).
- Monospace refers to typed values, IDs, or code.
- Quotes wrap example messages a customer sends or receives.
- Side-notes prefixed 'Tip', 'Note', or 'Caution' offer extra context.
## 2. System Requirements
- Modern web browser: Chrome 120+, Edge 120+, Safari 17+, Firefox 120+.
- Internet connection: 1 Mbps minimum; 5 Mbps recommended for the agent inbox.
- Optional mobile: install WBMSG as a Progressive Web App on Android (Chrome) or iOS (Safari).
- WhatsApp Business Account (or we'll help you create one during onboarding).
- A registered business — WBMSG is for businesses, not personal use.
## 3. Getting Started
### 3.1 Create your account (≈ 2 min)
1. Visit WBMSG.in and click Sign up.
1. Enter your work email, set a password (or use Google sign-in).
1. Verify the email link sent to your inbox.
1. Provide your business name, registered address, and GST number (optional but enables tax invoices).
1. You land on the Welcome dashboard with a four-step checklist.
### 3.2 Connect WhatsApp (≈ 10 min)
1. From the checklist, click Connect WhatsApp.
1. Select 'I have a WhatsApp Business API account' or 'Help me create one'.
1. Path A — already have one: paste your phone number ID and access token from Meta Business Manager. Click Validate.
1. Path B — new account: WBMSG walks you through Meta's verification (business documentation, phone number registration, display name approval). Approval typically takes 1–3 business days.
1. Once connected, send a test message from your phone to your registered WhatsApp number — it appears in your Inbox within seconds.
### 3.3 Invite your team (≈ 3 min)
1. Open Settings → Team.
1. Click Invite member; enter email and choose a role (Owner, Admin, Agent, Viewer).
1. Optionally assign to a Group (e.g., Sales, Support).
1. The invitee receives an email; on acceptance, they appear in the Team list.
### 3.4 Import contacts (≈ 5 min)
1. Open Contacts → Import.
1. Download the CSV template; fill in name, phone (with country code), tags.
1. Upload the CSV. WBMSG validates phone numbers and shows a preview.
1. Click Import. Up to 50,000 contacts import in 90 s.
1. Tip: tags such as 'lead', 'customer', 'churned' make later segmentation easy.
## 4. The Inbox — Your Daily Workhorse
### 4.1 Layout
- Left pane: conversation list (sorted by recency).
- Centre pane: the active conversation, with full message history.
- Right pane: contact profile, tags, notes, AI-suggested replies.
### 4.2 Replying to a message
1. Click a conversation; the centre pane loads the history.
1. Type your reply, attach files (image, PDF, video), and press Enter or click Send.
1. Replies are tracked against the 24-hour customer-service window — WBMSG warns you when it's about to close.
1. After the window closes, only approved Message Templates can be sent (use the Template picker).
### 4.3 Assigning conversations
- Click the Assignee badge to assign to yourself or a teammate.
- Use the Group filter to see only conversations for your team.
- Auto-assignment rules can be configured in Settings → Routing.
### 4.4 Notes, tags, and statuses
- Add a private note (visible only to your team) using the @internal: prefix.
- Apply tags to mark intent (interested, not-now, scam, escalated).
- Status: Open → Pending → Resolved. Archived after 30 days.
### 4.5 Keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| J / K | Next / previous conversation |
| R | Reply (focus the input) |
| A | Assign to me |
| E | Mark as resolved |
| # | Add a tag |
| ? | Show all shortcuts |

## 5. Templates
### 5.1 What templates are
Message Templates are pre-approved messages from Meta. You must use a template to message a customer outside the 24-hour reply window or to start a new conversation that isn't a reply.
### 5.2 Creating a template
1. Open Templates → New template.
1. Choose a category: Marketing, Utility, or Authentication.
1. Write the message body; insert variables with {{1}}, {{2}}.
1. Add optional header (text, image, video, document) and buttons (URL, phone, quick-reply).
1. Submit for approval. Meta typically approves within minutes; rejections include a reason.
### 5.3 Using a template
- From any conversation, click the Template icon and select an approved template.
- Fill in variables; preview the final message before sending.
- Templates are also used in Campaigns (next section).
## 6. Campaigns
### 6.1 What a campaign is
A Campaign sends an approved template to a defined list of recipients at a scheduled time, respecting Meta rate limits and customer opt-out preferences.
### 6.2 Create a campaign
1. Open Campaigns → New campaign.
1. Name the campaign and select a Template.
1. Choose recipients: a saved Segment, a tag, or upload a one-off CSV.
1. Map variables to recipient attributes (e.g., {{1}} → contact.name).
1. Choose schedule: send now, schedule for later, or send across a window to respect rate limits.
1. Review the cost estimate (per Meta's pricing) and click Schedule.
### 6.3 Track results
- Live counters: sent, delivered, read, replied, opted-out, failed.
- Click any counter to see the underlying contacts.
- Replies create normal conversations in the Inbox; assignment rules apply.
- Campaign report exports to CSV for further analysis.
### 6.4 Best practices
- Test the template against an internal list of 10 contacts first.
- Send during 09:00–18:00 IST for highest open rates.
- Provide a clear opt-out path (a quick-reply button labelled 'Stop').
- Don't repeat the same campaign to the same person within 7 days — WBMSG warns you if you try.
## 7. Contacts &amp; Segments
- Each contact has profile fields, custom fields, tags, conversation history, and notes.
- Custom fields are defined in Settings → Custom fields (text, number, date, dropdown).
- Segments are saved filters: e.g., 'tag = lead AND last_message &gt; 7 days'.
- Use segments in Campaigns, Auto-replies, and Reports.
## 8. Automations &amp; AI Agent
### 8.1 Auto-reply rules
- Create rules in Automations → Rules.
- Trigger: keyword, time-of-day, contact attribute, or first-time message.
- Action: reply with template, assign to a teammate, apply a tag, add to a segment.
- Rules execute in order; the first matching rule wins.
### 8.2 AI Agent (beta during GA)
- Upload your business knowledge (FAQs, product catalogue, return policy) in Knowledge.
- Enable AI Agent on a per-conversation or per-segment basis.
- The agent answers using your knowledge, hands off to a human when intent is unclear or when the customer asks for a person.
- All AI replies are logged and editable; turn off any time per organisation.
## 9. Reports &amp; Analytics
- Inbox: response time, resolution rate, conversation volume, agent productivity.
- Campaigns: send → delivered → read → reply → revenue funnel.
- Contacts: growth, churn, segment trends.
- Custom dashboards: pin the metrics that matter to you.
- Export any report to CSV or schedule it to email.
## 10. Billing &amp; Plans
- View your current plan, usage, and next bill in Settings → Billing.
- Plans: Free, Starter, Pro, Enterprise. See WBMSG.in/pricing for current rates in INR.
- Payments via UPI, card, NetBanking (Razorpay) or international card (Stripe).
- Tax invoices issued automatically; download from Billing → Invoices.
- Upgrade or downgrade anytime; pro-rated.
- Cancel anytime; data exportable for 30 days post-cancellation.
## 11. Security &amp; Privacy Settings
- Enable Multi-Factor Authentication for every team member in Settings → Security.
- Single Sign-On (SAML) available on Pro and Enterprise plans.
- Audit log: who did what and when, in Settings → Audit log (90 d on Pro, 1 y on Enterprise).
- Data export: full export of your data via Settings → Data → Export (within 24 h).
- Data deletion: per-contact erasure honoured within 30 days; full account deletion 30 days after request.
## 12. Mobile &amp; Offline
- Install WBMSG as a PWA from your phone's browser menu.
- Push notifications for new messages (Android; iOS needs add-to-home-screen).
- Offline mode: read recent inbox without connection; messages send when online.
## 13. Integrations
- Native: Razorpay (payments), Stripe (international payments), Google Sheets, Zapier (1000+ apps), Make.com.
- Webhooks: subscribe to events such as message.received, conversation.assigned, campaign.completed.
- REST API: full programmatic access; OpenAPI spec at developers.WBMSG.in.
- Coming soon: Salesforce, HubSpot, Shopify, WooCommerce.
## 14. Frequently Asked Questions
### 14.1 Why was my template rejected?
Meta rejects templates for: missing variables in marketing categories, promotional content disguised as utility, or links to disallowed domains. The rejection reason appears next to the template; edit and resubmit.
### 14.2 Why didn't my campaign send to everyone?
Common reasons: recipients have opted out, phone number invalid, recipient not on WhatsApp, or your template was paused by Meta. Review Failed in the campaign report; click any failure to see the cause.
### 14.3 Can I delete a message I sent?
WhatsApp itself supports 'Delete for everyone' within ~2 days. WBMSG exposes this from the message's three-dot menu. After the window, the message stays in the recipient's chat.
### 14.4 How do I move from another tool (WATI, AiSensy)?
Export contacts and templates from your existing tool as CSV. Upload contacts via Contacts → Import; recreate (or have us migrate) templates. Your phone number ID can be moved without losing history; CS will guide you.
### 14.5 Is my customer data stored in India?
Yes. All customer Restricted data is stored in AWS Mumbai (ap-south-1). See Data Privacy Policy for details on sub-processors and transfers.
### 14.6 What happens during planned maintenance?
Maintenance windows are Saturday 02:00–04:00 IST with 7 days' notice. We design changes to be zero-downtime; if downtime is unavoidable, the status page lists exact times.
## 15. Glossary

| Term | Meaning |
| --- | --- |
| BSP | Business Solution Provider — Meta's term for partners like WBMSG |
| 24-hour window | Period after a customer's last message during which you can reply freely |
| Template | Pre-approved message content used outside the 24-hour window |
| Segment | A saved filter over contacts, used in Campaigns and Automations |
| Inbox | The conversation queue that your agents work from |
| DLQ | Dead-Letter Queue — failed sends parked for inspection |
| RPA | Robotic Process Automation — out of scope; we are an interaction platform |

## 16. Getting Help
- Help centre: WBMSG.in/help (searchable; &gt; 300 articles at GA).
- In-product chat: bottom-right of every page; live agent during business hours.
- Email: support@WBMSG.in (24 h response Pro; 1 BD Starter).
- Phone (Enterprise only): printed on your contract.
- Status: status.WBMSG.in (subscribe for updates).
- Community: community.WBMSG.in (peer-to-peer; product team monitors).
## 17. Keyboard &amp; Touch Reference
- All keyboard shortcuts: ? in any page.
- Touch: long-press a conversation for context menu.
- Search anywhere: / opens global search.
## 18. What's New
- April 2026 — v1.0 GA: Inbox, Campaigns, Templates, AI Agent (beta).
- Subscribe to the in-product Changelog for monthly updates.
## 19. Feedback
We read every piece of feedback. Use the in-product feedback button (top-right) or write to feedback@WBMSG.in. Customer Advisory Board members have additional channels.
## 20. Version History

| Version | Date | Author | Change |
| --- | --- | --- | --- |
| 1.0 | 26-Apr-2026 | Documentation Lead | Baseline at GA preparation |

End of End-User Manual | WBMSG v1.0 | April 2026 | IEEE 26511:2018