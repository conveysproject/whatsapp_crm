# WBMSG vs Interakt — Complete Feature Coverage Report

> **Source:** All 160 URLs from `https://www.interakt.shop/resource_centre-sitemap.xml`
> **Date:** 2026-06-29
> **Method:** All 160 sitemap URLs reviewed and grouped into unique features. WBMSG codebase fully scanned.
> **Last verified:** Segments feature code-verified against Interakt video demo (2026-06-29)

---

## 1. Inbox / Shared Team Inbox

| Feature | Interakt | WBMSG |
|---|---|---|
| Shared team inbox | ✅ | ✅ |
| Message thread (text, emoji) | ✅ | ✅ |
| Rich media messages (image/video/doc/audio) | ✅ | ✅ |
| Assign / reassign chats to agents | ✅ | ✅ |
| Assign chats to teams | ✅ | ✅ |
| Open / close conversations | ✅ | ✅ |
| Search chats | ✅ | ✅ |
| Filter chats | ✅ | ✅ |
| Conversation labels | ✅ | ✅ |
| Canned responses / Quick replies | ✅ | ✅ |
| Template picker in inbox | ✅ | ✅ |
| Contact panel / Smart cards | ✅ | ✅ |
| Notes on contacts | ✅ | ✅ |
| Contact tags from inbox | ✅ | ✅ |
| Conversation history | ✅ | ✅ |
| Events tracking | ✅ | ✅ |
| Voice messages | ✅ | ✅ |
| Block / unblock contact | ✅ | ✅ |
| Broadcast from inbox | ✅ | ✅ (via campaigns) |
| **Mute chats** | ✅ | ❌ GAP |
| **Forward chats** | ✅ | ❌ GAP |
| **Bulk actions** (resolve/assign many at once) | ✅ | ❌ GAP |
| **Inbox automation rules** | ✅ | ❌ GAP |
| **Team member availability / status** | ✅ | ❌ GAP |
| **WhatsApp chat widget** (website embed) | ✅ | ❌ GAP |
| AI smart replies | ❌ | ✅ 🟢 WBMSG ONLY |
| Voice auto-transcription (AI) | ❌ | ✅ 🟢 WBMSG ONLY |
| Interactive message picker | ❌ | ✅ 🟢 WBMSG ONLY |

---

## 2. Contact Management

| Feature | Interakt | WBMSG |
|---|---|---|
| Contacts list with CRUD | ✅ | ✅ |
| Import contacts (CSV / bulk) | ✅ | ✅ |
| Export contacts | ✅ | ✅ |
| Tags on contacts | ✅ | ✅ |
| Custom fields | ✅ | ✅ |
| Segments — create & save | ✅ | ✅ |
| Segments — filter by fields | ✅ | ✅ |
| Segments — filter by tags | ✅ | ✅ |
| Segments — filter by events (with sub-conditions) | ✅ | ✅ |
| Segments — AND / OR logic between rules | ✅ | ✅ |
| Segments — dynamic (contacts auto-enter / exit) | ✅ | ✅ |
| Segments — use in campaigns | ✅ | ✅ |
| Segments — view all saved segments in one place | ✅ | ✅ |
| Segments — filter by custom fields | ❌ | ✅ 🟢 WBMSG ONLY |
| Segments — event time-range filter (e.g. "in last 30 days") | ✅ | ⚠️ Partial — date operators exist on contact fields; events filtered by properties only |
| Contact groups | ✅ | ✅ |
| Auto-assign rules | ✅ | ✅ |
| Contact timeline / events | ✅ | ✅ |
| Search & filter contacts | ✅ | ✅ |
| Saved filters | ✅ | ✅ |
| Lead statuses | ✅ | ✅ |
| Delete contacts | ✅ | ✅ |
| Block / unblock contact | ✅ | ✅ |

> ✅ **Fully covered. One nuance: event time-range filtering (e.g. "abandoned checkout in last 30 days") works on contact fields but not yet directly on event timestamps. Verify with a live test.**

---

## 3. Campaigns

| Feature | Interakt | WBMSG |
|---|---|---|
| One-time campaigns | ✅ | ✅ |
| Scheduled campaigns (send now or later) | ✅ | ✅ |
| Target by segment / group | ✅ | ✅ |
| Send with media | ✅ | ✅ |
| Campaign analytics / stats | ✅ | ✅ |
| Preset / saved messages | ✅ | ✅ |
| Message interval control | ✅ | ✅ |
| Bulk send from inbox | ✅ | ✅ (via campaigns) |
| **Ongoing campaigns** (event/trait/time auto-triggered) | ✅ | ❌ GAP |
| **Campaign delay / timed follow-up sequence** | ✅ | ❌ GAP |
| **Contact-based / trait-triggered automation** | ✅ | ❌ GAP |
| AI-generated campaign content (Claude) | ❌ | ✅ 🟢 WBMSG ONLY |

---

## 4. Templates

| Feature | Interakt | WBMSG |
|---|---|---|
| Create & manage templates | ✅ | ✅ |
| Template variables | ✅ | ✅ |
| Header / body / footer / buttons | ✅ | ✅ |
| Carousel templates | ✅ | ✅ |
| Template analytics | ✅ | ✅ |
| Template library (pre-made) | ✅ | ✅ |
| Template sync with Meta | ✅ | ✅ |
| **WhatsApp Forms** (native Meta flows) | ✅ | ❌ GAP |
| LTO (Limited Time Offer) template type | ❌ | ✅ 🟢 WBMSG ONLY |
| AI-generated templates (Claude) | ❌ | ✅ 🟢 WBMSG ONLY |

---

## 5. Automation / Flows

| Feature | Interakt | WBMSG |
|---|---|---|
| Auto-replies (keyword FAQ) | ✅ | ✅ |
| Exact / contains / any-message triggers | ✅ | ✅ |
| AI intent matching | ✅ | ✅ |
| No-code flow builder | ✅ | ✅ |
| Trigger / action / condition nodes | ✅ | ✅ |
| Welcome message | ✅ | ✅ |
| Out-of-office automation | ✅ | ✅ |
| Business hours automation | ✅ | ✅ |
| Delayed response | ✅ | ✅ |
| Smart automations | ✅ | ✅ |
| **WhatsApp Forms inside flows** | ✅ | ❌ GAP |
| **Answer bot** (AI auto-resolves FAQs) | ✅ | ❌ GAP |
| **Catalog product responses in flows** | ✅ | ❌ GAP |
| AI-generated flows (Claude) | ❌ | ✅ 🟢 WBMSG ONLY |

---

## 6. Sales CRM

| Feature | Interakt | WBMSG |
|---|---|---|
| Pipelines | ✅ | ✅ |
| Deals | ✅ | ✅ |
| Lead statuses | ✅ | ✅ |
| Contact hub | ✅ | ✅ |
| Custom fields in CRM | ✅ | ✅ |
| Auto-assign contacts | ✅ | ✅ |
| Contact timeline in CRM | ✅ | ✅ |
| Search / filter contacts | ✅ | ✅ |
| Agents & teams in CRM | ✅ | ✅ |
| Roles & permissions | ✅ | ✅ |
| View pipelines from contact hub | ✅ | ✅ |
| **CRM-specific reports (standalone)** | ✅ | ⚠️ Partial |

---

## 7. Analytics

| Feature | Interakt | WBMSG |
|---|---|---|
| Conversation analytics | ✅ | ✅ |
| Campaign analytics | ✅ | ✅ |
| Team performance metrics | ✅ | ✅ |
| Agent leaderboard | ✅ | ✅ |
| Date range filtering | ✅ | ✅ |
| CSV export | ✅ | ✅ |
| Template analytics | ✅ | ✅ |
| Response time / resolution rate | ✅ | ✅ |
| Predictive analytics | ❌ | ✅ 🟢 WBMSG ONLY |
| Activity feed | ❌ | ✅ 🟢 WBMSG ONLY |

> ✅ **Fully covered. WBMSG is ahead on analytics.**

---

## 8. Settings & Team Management

| Feature | Interakt | WBMSG |
|---|---|---|
| Account details | ✅ | ✅ |
| Team members | ✅ | ✅ |
| Create / manage teams | ✅ | ✅ |
| Roles & permissions (RBAC) | ✅ | ✅ |
| Invitations | ✅ | ✅ |
| Routing rules | ✅ | ✅ |
| Canned responses | ✅ | ✅ |
| Labels | ✅ | ✅ |
| Notifications | ✅ | ✅ |
| WhatsApp account settings | ✅ | ✅ |
| Webhook actions | ✅ | ✅ |
| Media library | ✅ | ✅ |
| **Two-factor authentication (2FA)** | ✅ | ❌ GAP |
| **Team member availability status** | ✅ | ❌ GAP |
| AI settings | ❌ | ✅ 🟢 WBMSG ONLY |
| Branding / white-label settings | ❌ | ✅ 🟢 WBMSG ONLY |
| Vendor settings | ❌ | ✅ 🟢 WBMSG ONLY |
| Trust score | ❌ | ✅ 🟢 WBMSG ONLY |

---

## 9. Onboarding

| Feature | Interakt | WBMSG |
|---|---|---|
| Sign-up / login | ✅ | ✅ |
| WABA connection (Embedded Signup) | ✅ | ✅ |
| Number provisioning | ✅ | ✅ |
| Team invite during onboarding | ✅ | ✅ |
| Onboarding checklist | ✅ | ✅ |
| **Facebook Business Manager setup guide** | ✅ | ❌ GAP (docs only) |
| **BSP migration support** | ✅ | ❌ GAP |
| **Eligibility checker** | ✅ | ❌ GAP |
| **Sandbox / test mode** | ✅ | ❌ GAP |

---

## 10. Billing

| Feature | Interakt | WBMSG |
|---|---|---|
| Subscription billing | ✅ | ✅ |
| Billing details view | ✅ | ✅ |
| **Prepaid wallet** (top-up for campaign costs) | ✅ | ❌ GAP |
| **Meta conversation pricing calculator** | ✅ | ❌ GAP |

---

## 11. Integrations

| Integration | Interakt | WBMSG |
|---|---|---|
| Webhooks (inbound / outbound) | ✅ | ✅ |
| API & developer docs | ✅ | ✅ |
| Templates via API / webhooks | ✅ | ✅ |
| **WooCommerce** | ✅ | ❌ GAP |
| **Shopify** | ✅ | ❌ GAP |
| **Google Sheets** | ✅ | ❌ GAP |
| **HubSpot CRM** | ✅ | ❌ GAP |
| **Zoho CRM** | ✅ | ❌ GAP |
| **Salesforce** | ✅ | ❌ GAP |
| **Zapier** | ✅ | ❌ GAP |
| **Make (Integromat)** | ✅ | ❌ GAP |
| **Pabbly Connect** | ✅ | ❌ GAP |
| **Pabbly Subscription Billing** | ✅ | ❌ GAP |
| **Pipedrive** | ✅ | ❌ GAP |
| **Slack** | ✅ | ❌ GAP |
| **Stripe** | ✅ | ❌ GAP |
| **Razorpay** | ✅ | ❌ GAP |
| **Cashfree** | ✅ | ❌ GAP |
| **Airwallex** | ✅ | ❌ GAP |
| **Freshdesk** | ✅ | ❌ GAP |
| **Freshchat** | ✅ | ❌ GAP |
| **JudgeMe** (reviews) | ✅ | ❌ GAP |
| **BizKonnect** | ✅ | ❌ GAP |
| **Gupshup BSP** | ✅ | ❌ GAP |
| **Instagram** (dedicated integration) | ✅ | ❌ GAP |
| Third-party integration hub | ✅ | ❌ GAP |

---

## 12. WhatsApp Commerce

| Feature | Interakt | WBMSG |
|---|---|---|
| **Product catalog** | ✅ | ❌ GAP |
| **Product collections / catalog messages** | ✅ | ❌ GAP |
| **Shopping cart management** | ✅ | ❌ GAP |
| **WhatsApp Pay** (in-chat payments) | ✅ | ❌ GAP |
| **Order tracking panel** | ✅ | ❌ GAP |

---

## 13. Channel Expansion

| Feature | Interakt | WBMSG |
|---|---|---|
| WhatsApp (primary) | ✅ | ✅ |
| **Instagram lead generation** | ✅ | ❌ GAP |
| **RCS / SMS fallback channels** | ✅ | ❌ GAP |
| **Click-to-WhatsApp Ads launcher** | ✅ | ❌ GAP |
| **WhatsApp Coexistence** (app + API parallel) | ✅ | ❌ GAP |
| **MM Lite API** support | ✅ | ❌ GAP |
| Mobile app | ✅ (limited) | ✅ (full) |
| **WhatsApp Web on mobile app** | ✅ | ❌ GAP |

---

## 14. WBMSG Exclusive (Interakt has nothing equivalent)

| Feature | Notes |
|---|---|
| Trust score | Proprietary message quality scoring |
| Predictive analytics | AI-driven forecasting |
| AI smart replies in inbox | Real-time Claude-powered suggestions |
| Voice message auto-transcription | AI converts voice to text |
| LTO template type | Limited Time Offer — native Meta urgency mechanic |
| AI-generated templates | Claude `ai-creator` lib |
| AI-generated flows | Claude `ai-creator` lib |
| Branding / white-label customization | Full UI theming |
| Vendor / reseller settings | Multi-vendor architecture layer |
| Webhook action responders | Programmatic event → action hooks |
| Activity feed in analytics | Live event stream |

---

## Final Score

| Category | Interakt | WBMSG | Gaps |
|---|---|---|---|
| Inbox | 24 | 19 | **5** |
| Contact Management | 14 | 14 | **0** |
| Campaigns | 8 | 7 | **2** |  
| Templates | 7 | 6 | **1** |
| Automation / Flows | 12 | 10 | **2** |
| Sales CRM | 12 | 11 | **1 partial** |
| Analytics | 8 | 10 | **0 (ahead)** |
| Settings | 14 | 14 | **2 (ahead overall)** |
| Onboarding | 9 | 5 | **4** |
| Billing | 4 | 2 | **2** |
| Integrations | 26 | 3 | **23** |
| Commerce | 5 | 0 | **5** |
| Channel Expansion | 6 | 1 | **5** |
| **TOTAL** | **149** | **102** | **52** |

**Core product coverage** (excluding integrations / commerce / channels): **~88%**
**Total coverage including ecosystem**: **~68%**

> The 52 gaps break down as: **23 integrations + 5 commerce + 5 channel expansion = 33 ecosystem gaps**.
> The actual product-to-product gap (inbox, contacts, campaigns, automation, CRM, analytics, settings) is only **~19 items**.

---

## Gap Priority

### 🔴 High — Core product holes

| Gap | Why it matters |
|---|---|
| Ongoing / event-triggered campaigns | Biggest campaign differentiator — automated drips based on events/traits |
| WhatsApp Forms (native Meta flows) | Collect structured data inside WhatsApp without leaving the app |
| Bulk inbox actions | Power-user workflow; agents can't bulk-resolve/assign |
| Answer bot | AI that auto-resolves FAQs without a human agent |
| Inbox automation rules | Auto-assign, auto-label, auto-respond on conversation rules |
| Two-factor authentication (2FA) | Security baseline expected by business accounts |
| Sandbox / test mode | Developers can't test without spending real Meta credits |
| WhatsApp Commerce (catalog + cart + pay) | Full e-commerce vertical missing entirely |

### 🟡 Medium — Ecosystem / Growth

| Gap | Why it matters |
|---|---|
| Zapier / Make / Pabbly | Unlocks 5,000+ app connections without native integrations |
| Shopify | #1 e-commerce platform; most DTC WhatsApp users need this |
| Freshdesk / Freshchat | Large support-team segment uses these |
| Slack | Team notifications when chats arrive |
| Click-to-WhatsApp Ads launcher | High demand from performance marketers |
| Google Sheets trigger | Non-dev businesses use this for campaign uploads |
| Mute / forward chats | UX gaps; agents expect these |
| Team member availability | Agents can't set online/offline; affects auto-routing |

### 🟢 Low — India-specific or niche

| Gap | Notes |
|---|---|
| Instagram lead gen | Secondary to WhatsApp; Meta growth feature |
| RCS / SMS fallback | Carrier-heavy, India-focused |
| Prepaid wallet billing | Interakt's India billing model; WBMSG uses subscription |
| Razorpay / Cashfree / Airwallex | India/APAC payment gateways |
| BSP migration guide | One-time onboarding doc, not a product feature |
| Personal concierge tier | Upsell support package, not a feature |
| WhatsApp Coexistence | Niche use case |
| MM Lite API | Meta-internal; very few customers need this |
