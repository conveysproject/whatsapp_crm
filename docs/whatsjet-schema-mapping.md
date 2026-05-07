# WhatsJet → WBMSG Schema Mapping

Source: `data-schema.sql` (WhatsJet 7.0 MySQL dump)  
Target: `apps/api/prisma/schema.prisma` (PostgreSQL via Prisma)

---

## Summary Counts

| Category | Count |
|---|---|
| WhatsJet tables (total, verified by grep) | **46** |
| Fully mapped → Prisma model | 28 |
| Partially mapped / merged | 6 |
| Skipped — handled by infrastructure | 11 |
| Permanently skipped | 1 |
| **New models (no WhatsJet equivalent)** | **11** |

---

## Fully Mapped (28)

| # | WhatsJet Table | Our Prisma Model | Notes |
|---|---|---|---|
| 1 | `activity_logs` | `ActivityLog` | Audit trail |
| 2 | `bot_flows` | `Flow` | Visual flow builder |
| 3 | `bot_replies` | `AutoReply` | Keyword trigger engine — different from flows; `contains`/`is`/`starts_with`; can escalate to a Flow |
| 4 | `campaign_groups` | `CampaignSegment` | Junction: Campaign ↔ Segment |
| 5 | `campaigns` | `Campaign` | `status` tinyint → `CampaignStatus` enum |
| 6 | `contact_bot_flow_sessions` | `BotSession` | Active session per conversation |
| 7 | `contact_custom_field_values` | `ContactCustomFieldValue` | Per-contact dynamic field values |
| 8 | `contact_custom_fields` | `ContactCustomField` | Field definitions per org |
| 9 | `contact_groups` | `Segment` | `filters` JSON added for dynamic segments |
| 10 | `contact_labels` | `ContactLabel` | Junction: Contact ↔ Label |
| 11 | `contacts` | `Contact` | `wa_id` → `phoneNumber` |
| 12 | `credit_transactions` | `CreditLedger` | Per-message/call debit; supports credit wallet pricing (₹/1000 msgs) |
| 13 | `group_contacts` | `SegmentContact` | Junction: Segment ↔ Contact |
| 14 | `info_materials` | `MediaAsset` | Agent-shareable files (catalogs, PDFs); actual files in S3/R2 |
| 15 | `labels` | `Label` | Color-coded labels with text/bg color |
| 16 | `manual_subscriptions` | `ManualSubscription` | Non-Stripe plans: Razorpay, UPI, bank transfer, cash — India market |
| 17 | `message_labels` | `MessageLabel` | Junction: Message ↔ Label |
| 18 | `pages` | `Page` | White-label CMS pages per vendor; `organizationId` null = platform page |
| 19 | `response_webhook_action_logs` | `WebhookDeliveryLog` | Outbound delivery per endpoint: status, HTTP code, retries |
| 20 | `response_webhook_actions` | `Webhook` | Configured outbound webhook endpoints |
| 21 | `response_webhook_logs` | `WebhookLog` | Inbound payload audit trail; enterprise debugging |
| 22 | `tickets` | `Ticket` | Support tickets; `status`/`priority` as enums |
| 23 | `transactions` | `Transaction` | Unified payment ledger across Stripe + manual gateways |
| 24 | `user_devices` | `UserDevice` | FCM push tokens per device |
| 25 | `users` | `User` | Password/2FA dropped (Clerk); `settings Json` for prefs |
| 26 | `vendor_notifications` | `Notification` | In-app notifications with scheduling and expiry |
| 27 | `vendors` | `Organization` | Core tenant model |
| 28 | `whatsapp_calls` | `WhatsappCall` | Voice call records with direction, duration |
| 29 | `whatsapp_message_logs` | `Message` | `is_incoming_message` → `MessageDirection` enum |
| 30 | `whatsapp_message_queue` | `CampaignRecipient` | Per-contact campaign send status; enables UI progress reporting |
| 31 | `whatsapp_templates` | `Template` | `__data` JSON → `components` JSON |

---

## Partially Mapped / Merged (6)

| # | WhatsJet Table | Mapped Into | Reason |
|---|---|---|---|
| 1 | `configurations` | `Organization.settings` (Json) | Platform-level config → env vars; per-tenant config → org settings |
| 2 | `user_roles` | `Role` enum | `admin`, `manager`, `agent`, `viewer` — no lookup table needed |
| 3 | `user_settings` | `User.settings` (Json) | Notification prefs, language, timezone per user |
| 4 | `vendor_settings` | `Organization.settings` (Json) | Per-tenant settings on org model |
| 5 | `vendor_users` | `OrganizationMember` | Junction table restored: one agent → multiple orgs (agency use case) |

---

## Skipped — Handled by Infrastructure (11)

| # | WhatsJet Table | Replaced By | Stack |
|---|---|---|---|
| 1 | `background_tasks` | BullMQ | Workers in `apps/api/src/workers/` |
| 2 | `failed_jobs` | BullMQ dead-letter | Native to BullMQ |
| 3 | `jobs` | BullMQ | BullMQ + Redis |
| 4 | `login_attempts` | Clerk | Rate-limiting and lockout |
| 5 | `login_logs` | Clerk | Session/audit log |
| 6 | `manual_subscriptions` | ~~Stripe~~ → **Modelled** | Was wrong — see row 16 above |
| 7 | `password_resets` | Clerk | Clerk password reset flow |
| 8 | `subscription_items` | Stripe | Stripe line items |
| 9 | `subscriptions` | Stripe | `PlanTier` enum on Organization; Stripe ID stored there |
| 10 | `whatsapp_webhook_queue` | BullMQ | `inbound-message` worker |
| 11 | `whatsapp_message_queue` | ~~BullMQ~~ → **Modelled** | Was wrong — see `CampaignRecipient` above |

---

## Permanently Skipped (1)

| # | WhatsJet Table | Reason |
|---|---|---|
| 1 | `countries` | 250-row static dataset; stored as a constants file or seed, never queried dynamically |

---

## New Models — No WhatsJet Equivalent (11)

| # | Prisma Model | Purpose |
|---|---|---|
| 1 | `ApiKey` | API key auth for external integrations |
| 2 | `BotSession` | Active chatbot session state per conversation |
| 3 | `Chatbot` | Named chatbot entity wrapping a Flow |
| 4 | `Company` | Company/account object for B2B CRM |
| 5 | `ContactImport` | Bulk CSV import job tracking |
| 6 | `Conversation` | Unified conversation thread |
| 7 | `Deal` | Sales deal in a pipeline |
| 8 | `Invitation` | Email-based team member invite (Clerk-linked) |
| 9 | `Pipeline` | Sales pipeline with configurable stages |
| 10 | `RoutingRule` | Auto-assignment rules for inbound conversations |
| 11 | `SlaPolicy` | First-response and resolution SLA policies |
| 12 | `Team` | Agent grouping for routing and assignment |

---

## Architecture Decisions

| Decision | Rationale |
|---|---|
| `User.organizationId` kept non-nullable | Primary/home org for fast single-org auth checks; `OrganizationMember` handles multi-org |
| `AutoReply` separate from `Flow` | Keyword triggers are a different runtime path — queried differently, evaluated in priority order, no graph traversal |
| `CampaignRecipient` alongside BullMQ | BullMQ processes sends; DB row tracks outcome for finance reports and customer-facing UI |
| `CreditLedger` with BigInt credits | Supports both integer credit units (1 credit = 1 message) and large topups without precision loss |
| `PaymentGateway` enum includes `upi`/`bank_transfer`/`cash` | India's SMB market — most customers pay outside Stripe |
| `Transaction.currency` defaults to `INR` | Primary market is India |

---

## Migration History

| Migration | Applied | Description |
|---|---|---|
| `20260502030000_add_contact_import_model` | 2026-05-02 | ContactImport table |
| `20260507202118_add_whatsjet_schema_models` | 2026-05-08 | 12 models: labels, custom fields, segments, tickets, calls, notifications, activity, devices |
| `20260507204512_add_future_scope_models` | 2026-05-08 | MediaAsset, Page, WebhookLog, WebhookDeliveryLog; User.settings |
| `20260507205831_add_product_complete_schema` | 2026-05-08 | AutoReply, CampaignRecipient, ManualSubscription, Transaction, CreditLedger, OrganizationMember |

---

*Last updated: 2026-05-08 — all 46 WhatsJet tables accounted for*
