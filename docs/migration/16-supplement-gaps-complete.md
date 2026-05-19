# Supplement Gaps — Complete Inventory from WhatsJet v7.2.0 Parts 1–15

> **Source:** All 15 WhatsJet_Legacy_System_Supplement docs (Parts 1–15)
> **Date:** 2026-05-18
> **These gaps are ADDITIONAL to `05-gap-analysis-report.md` — none of these were previously documented**

---

## Section 1: Authentication — NEW GAPS

### GAP-S01: Social Login (Google / Facebook OAuth)

| Attribute | Value |
|-----------|-------|
| **Severity** | P2 |
| **WhatsJet** | `GET /auth/via-{provider}` → Socialite OAuth; reads `{provider}_client_id/secret` at call time from DB settings |
| **TrustCRM** | Clerk supports social login but DB-configurable provider keys not wired |
| **Business Impact** | Vendors on free tier expect Google sign-in; reduces friction |
| **Effort** | 2 days (Clerk config + settings page) |

### GAP-S02: Account Activation Required Flow

| Attribute | Value |
|-----------|-------|
| **Severity** | P2 |
| **WhatsJet** | `POST /auth/register/vendor/activation` → creates user with `status=4`, sends signed `URL::temporarySignedRoute()` with 48h expiry; `GET /activate/{userUid}` activates |
| **TrustCRM** | Clerk handles email verification but no `status=4` pre-activation state in DB |
| **Business Impact** | Cannot require admin approval before vendor can use system |
| **Effort** | 1 day |

### GAP-S03: Login Logs / Audit Trail

| Attribute | Value |
|-----------|-------|
| **Severity** | P1 |
| **WhatsJet** | `AuthEngine::processLogin()` writes to `login_logs` table on every login: user_id, IP, user_agent, timestamp |
| **TrustCRM** | No login audit trail; Clerk tracks logins externally but not in app DB |
| **Business Impact** | No security audit trail; GDPR/SOC2 requirement |
| **Effort** | 1 day (Clerk webhook `session.created` → write to DB) |

---

## Section 2: Permission System — CRITICAL NEW GAPS

### GAP-S04: Complete WhatsJet Permission Tree

> **DEFINITIVE SOURCE:** `app/Yantrana/Components/User/Support/permissions.php` (Part 3, §2.1)
> Supersedes all prior documents. 9 top-level groups, 15 sub-permissions, 24 total permission nodes.

**Permission Groups and Sub-Permissions:**

| Group Key | Sub-Permissions |
|-----------|----------------|
| `administrative` | _(none — binary allow/deny)_ |
| `manage_contacts` | `import_contacts`, `export_contacts`, `delete_contacts`, `add_edit_contacts`, `add_edit_delete_custom_contact_fields`, `add_edit_delete_archive_group` |
| `manage_campaigns` | _(none)_ |
| `messaging` | _(none)_ |
| `manage_templates` | `add_edit_templates`, `delete_templates` |
| `assigned_chats_only` | _(none)_ |
| `hide_contact_phone_numbers` | _(none)_ |
| `hide_contact_emails` | _(none)_ |
| `manage_bot_replies` | `add_edit_bot_replies`, `delete_bot_replies`, `add_edit_bot_flows`, `delete_bot_flows`, `manage_bot_flow_builder` |

Permission values: `'allow'` or `'deny'`. Sub-permissions use format: `permission_key@sub_permission`.

**Permission storage location:** `vendor_users.__data.permissions` (NOT `users.__data`). The `vendor_users` table stores per-vendor user data including the permissions JSON.

**Role 2 (VendorAdmin): ALWAYS bypasses all permission checks — no masking, full access.**

**Context-dependent bot permissions (Part 3, §2.3):**
- `page_type=nt_campaign_preset_message` → requires `manage_templates` + `add_edit_templates`
- `page_type=bot_flow_builder` → requires `manage_bot_flow_builder`
- default bot operations → requires `manage_bot_replies` + `add_edit_bot_replies` or `delete_bot_replies`

**Current TrustCRM gap:** `PUT /v1/users/:id/permissions` stores a JSON blob but all 9 group keys, 15 sub-keys, enforcement logic, VendorAdmin bypass, and data masking are not implemented.

| Field | Value |
|-------|-------|
| **Severity** | P0 |
| **Effort** | 4 days (enforce all 9+15 keys including masking, VendorAdmin bypass, context-dependent bot perms) |

### GAP-S05: `assigned_chats_only` Enforcement in Inbox

| Attribute | Value |
|-----------|-------|
| **Severity** | P0 |
| **WhatsJet** | `ContactRepository::getVendorContactsWithUnreadDetails()` filters by assignment when `assigned_chats_only=allow` |
| **TrustCRM** | Conversation list route does NOT filter by assigned agent |
| **Business Impact** | Support agents see ALL customer conversations, not just their own → data exposure |
| **Fix** | In `GET /v1/conversations`, check caller's `assigned_chats_only` permission; if set, add `WHERE assignedTo = caller.userId` |
| **Effort** | 0.5 days |

### GAP-S06: Data Masking — Phone Number & Email in API Responses

| Attribute | Value |
|-----------|-------|
| **Severity** | P0 |
| **WhatsJet** | `maskString()` called in contact serialization when `hide_contact_phone_numbers` or `hide_contact_emails` permission set; **Role 2 (VendorAdmin) is never masked** |
| **TrustCRM** | No masking at all — all agents see full phone numbers and emails |
| **Business Impact** | Contact phone/email leakage to unauthorized agents; compliance violation |
| **Fix** | Add masking middleware to contact response serialization based on caller permissions |
| **Masking pattern:** `+91XXXXXXX210` (first 4 chars visible, last 3 visible, rest `X`) |
| **Effort** | 2 days |

---

## Section 3: Contact Management — NEW GAPS

### GAP-S07: Contact Service Window (24-Hour Rule)

| Attribute | Value |
|-----------|-------|
| **Severity** | P0 |
| **WhatsJet** | Contacts filterable by `service_window` — contacts within the 24h WhatsApp messaging window (inbound in last 24h) |
| **TrustCRM** | No service window concept in contact or conversation model |
| **WhatsApp rule** | Can only send non-template messages within 24h of last inbound; after 24h only templates allowed |
| **DB Impact** | Track `lastInboundAt` on Contact or Conversation; add `serviceWindowActive` computed field |
| **Business Impact** | Sending non-template after 24h violates Meta policy → message failure, WABA quality hit |
| **Effort** | 2 days |

### GAP-S08: Contact `wa_id` Phone Number Normalization

| Attribute | Value |
|-----------|-------|
| **Severity** | P1 |
| **WhatsJet** | `ContactRepository::getVendorContactByWaId()` — if exact match fails: strip non-numeric → parse with `libphonenumber` → retry by national number → **update wa_id in DB if found** |
| **TrustCRM** | No libphonenumber normalization; exact phone match only |
| **Business Impact** | Inbound messages from numbers stored in different formats (e.g., +91 vs 91) create duplicate contacts |
| **Effort** | 1.5 days (add libphonenumber normalization to inbound-message worker) |

### GAP-S09: Contact Advance Filter (Saved Per User)

| Attribute | Value |
|-----------|-------|
| **Severity** | P2 |
| **WhatsJet** | Advance filter saved per-user in vendor_settings; filter fields: `first_name`, `last_name`, `countries_id`, `wa_id`, `language_codes`, `assigned_users_ids` (supports 'null' string), date range, `opt_out`, `ai_bot`, `service_window`, custom fields, groups, labels |
| **TrustCRM** | Basic filtering only; no saved-per-user advance filter |
| **Effort** | 3 days |

### GAP-S10: Contact Groups — 3 Creation Modes

| Attribute | Value |
|-----------|-------|
| **Severity** | P1 |
| **WhatsJet** | `ContactGroupEngine::processGroupCreate()` — **3 modes:**<br>1. **Failed campaign contacts** — contacts who failed in a specific campaign<br>2. **Recampaign** — contacts by campaign delivery status (delivered/read/failed/expired/sent/in_queue/accepted/total)<br>3. **Contact advance filter** — arbitrary filter criteria<br>Group contacts inserted in 500-row chunks |
| **TrustCRM** | Only manual/segment-based groups; no campaign-result-based group creation |
| **Business Impact** | Cannot re-target failed delivery contacts; no re-campaign workflow |
| **Effort** | 3 days |

### GAP-S11: Contact Group Archived Status

| Attribute | Value |
|-----------|-------|
| **Severity** | P2 |
| **WhatsJet** | `contact_groups.status`: 1=active, **5=archived**, NULL=legacy active |
| **TrustCRM** | No archived status on groups; only soft-delete |
| **Effort** | 0.5 days |

### GAP-S12: Contact Import — Exact Column Spec

| Attribute | Value |
|-----------|-------|
| **Severity** | P1 |
| **WhatsJet** | CSV import: **exactly 7 fixed columns**: `First Name, Last Name, Mobile, Language, Country, Email, Groups` + any custom field columns by `input_name`; CSV only (not XLSX); UTF-8 BOM on export; numeric ≥11 digits wrapped as `="..."` in CSV to prevent Excel truncation |
| **TrustCRM** | Import format not fully documented/validated against this spec |
| **Fix** | Validate import CSV headers match expected columns; document template |
| **Effort** | 1 day |

### GAP-S13: Contact Export — Phone Number Excel Safety

| Attribute | Value |
|-----------|-------|
| **Severity** | P1 |
| **WhatsJet** | Numeric phone numbers ≥11 digits exported as `="XXXXXXXX"` in CSV to prevent Excel scientific notation truncation |
| **TrustCRM** | Not confirmed implemented in export |
| **Fix** | Wrap phone numbers in CSV export |
| **Effort** | 0.5 days |

---

## Section 4: Campaign Engine — NEW GAPS

### GAP-S14: Campaign ABORT (Status 6)

| Attribute | Value |
|-----------|-------|
| **Severity** | P1 |
| **WhatsJet** | `processCampaignAbort()` sets `campaigns.status=6`; different from pause (which is paused/suspended) |
| **TrustCRM** | `CampaignStatus` enum has no `ABORTED` state; only pause/resume documented |
| **Status meanings:** | 1=active, 5=archived, 6=aborted (manual abort mid-send) |
| **Fix** | Add `ABORTED` to enum; add `POST /v1/campaigns/:id/abort` route; worker skips ABORTED campaigns |
| **Effort** | 0.5 days |

### GAP-S15: Campaign Status Computation Rules

| Attribute | Value |
|-----------|-------|
| **Severity** | P1 |
| **WhatsJet** | Status display logic: `scheduled_at > now` = **Upcoming**; `≤ now` = **Awaiting/Processing/Executed** (based on queue state); `status=6` = **Aborted**; `delete_allowed` = true only if `scheduled_at > now` OR `status=Awaiting` |
| **TrustCRM** | Status computation rules not documented; delete guard not implemented |
| **Fix** | Implement computed status display field in campaign list API |
| **Effort** | 1 day |

### GAP-S16: Campaign Report — Excel with Masking

| Attribute | Value |
|-----------|-------|
| **Severity** | P2 |
| **WhatsJet** | Campaign analytics export as XLSX (XLSXWriter); applies phone masking based on caller permissions; lazy fetch for large datasets |
| **TrustCRM** | No campaign export |
| **Effort** | 2 days |

### GAP-S17: Non-Template Campaign Presets (`NT_CAMPAIGN_MESSAGE` Bot Type)

| Attribute | Value |
|-----------|-------|
| **Severity** | P2 |
| **WhatsJet** | `trigger_type='NT_CAMPAIGN_MESSAGE'` is a hidden bot type used for non-template campaign message presets; excluded from bot reply list API; `CampaignController::nonTemplateCampaignMessagePresetsList` exposes these |
| **TrustCRM** | No non-template campaign concept |
| **Note** | Non-template campaigns only valid within 24h service window |
| **Effort** | 3 days |

---

## Section 5: Bot Reply — NEW GAPS

### GAP-S18: Dynamic Bot Tokens (Variable Substitution)

| Attribute | Value |
|-----------|-------|
| **Severity** | P1 |
| **WhatsJet** | Bot reply messages support dynamic tokens: `{first_name}`, `{last_name}`, `{full_name}`, `{phone_number}`, `{email}`, `{country}`, `{language_code}`, `{assigned_team_member}`, plus **all custom fields** as `{input_name}` |
| **TrustCRM** | No dynamic token substitution in bot replies or messages |
| **Business Impact** | Bot replies are generic — cannot personalize "Hi {first_name}" |
| **Fix** | Template substitution engine in `workers/inbound-message.ts` before sending bot reply |
| **Effort** | 2 days |

### GAP-S19: Bot Reply Uniqueness Scope

| Attribute | Value |
|-----------|-------|
| **Severity** | P1 |
| **WhatsJet** | Bot name unique per `(vendor, bot_flows__id)` — same name can exist in different flows |
| **TrustCRM** | Uniqueness scope not defined |
| **Fix** | Enforce unique constraint on `(organizationId, name, flowId)` in Prisma schema |
| **Effort** | 0.5 days |

---

## Section 6: Template Management — NEW GAPS

### GAP-S20: Additional Template Button Types

| Attribute | Value |
|-----------|-------|
| **Severity** | P1 |
| **WhatsJet** | Button types: `QUICK_REPLY`, `PHONE_NUMBER`, `URL_BUTTON`, **`VOICE_CALL`**, **`DYNAMIC_URL_BUTTON`** (with `{{1}}` variable), **`COPY_CODE`** |
| **TrustCRM** | Template model doesn't enumerate all button types |
| **Fix** | Add `VOICE_CALL`, `DYNAMIC_URL_BUTTON`, `COPY_CODE` to template button type enum |
| **Effort** | 1 day |

### GAP-S21: Template Analytics — Read Percentage Calculation

| Attribute | Value |
|-----------|-------|
| **Severity** | P2 |
| **WhatsJet** | `readPercentage = (read / delivered) × 100`, capped at 100, rounded; preset ranges: Current/Last Month, Current/Last Week, Today/Yesterday, Custom |
| **TrustCRM** | Template analytics exists but read percentage formula not confirmed |
| **Effort** | 0.5 days |

---

## Section 7: Inbox / Messaging — NEW GAPS

### GAP-S22: WhatsApp Text Formatting (Markdown → HTML)

| Attribute | Value |
|-----------|-------|
| **Severity** | P1 |
| **WhatsJet** | `formatWhatsAppText()` converts WA markdown: `*text*`→bold, `_text_`→italic, `~text~`→strikethrough, triple backtick→code block, single backtick→badge/inline-code, URLs→hyperlinks, YouTube links→embedded iframe |
| **TrustCRM** | Message display is raw text; no WA markdown rendering |
| **Business Impact** | Messages with bold/italic appear as `*this*` instead of **this** |
| **Effort** | 1 day (frontend) |

### GAP-S23: Message Status Downgrade Protection

| Attribute | Value |
|-----------|-------|
| **Severity** | P0 |
| **WhatsJet** | `WhatsAppMessageLogRepository::updateOrCreateWhatsAppMessageFromWebhook()` — once status=`'read'` or `'played'`, **cannot be downgraded** to delivered/sent |
| **TrustCRM** | Status update from webhook overwrites regardless of current state |
| **Fix** | Add guard in webhook handler: `if (currentStatus in ['read', 'played']) skip downgrade` |
| **Effort** | 0.5 days |

### GAP-S24: Stuck Message Auto-Recovery

| Attribute | Value |
|-----------|-------|
| **Severity** | P1 |
| **WhatsJet** | `WhatsAppMessageQueueRepository::stuckInProcessing()` — status=3 (processing) where `updated_at ≤ 5 minutes ago` → auto-set to status=6 (awaited_response); runs every queue cycle |
| **TrustCRM** | No stuck-message detection in BullMQ worker |
| **Business Impact** | Crashed mid-send jobs leave messages permanently stuck in "sending" state |
| **Fix** | Add stuck-detection job that runs every 5 minutes |
| **Effort** | 1 day |

### GAP-S25: Contact Pagination Hardcoded (12 per page)

| Attribute | Value |
|-----------|-------|
| **Severity** | P2 |
| **WhatsJet** | `getVendorContactsWithUnreadDetails()` — `paginate(12)` hardcoded; messages `paginate(16)` hardcoded |
| **TrustCRM** | Pagination size configurable |
| **Note** | This is a WhatsJet limitation; TrustCRM's configurable pagination is better — document as TrustCRM improvement |

---

## Section 8: AI Bot — NEW GAPS

### GAP-S26: AI Chat History Summarization

| Attribute | Value |
|-----------|-------|
| **Severity** | P1 |
| **WhatsJet** | `OpenAiService` — if `contact.__data.past_ai_summary` exists: use **6 messages** history (short context); else use **30 messages** history; auto-summarizes with OpenAI API, stores summary back in `contact.__data.past_ai_summary` |
| **TrustCRM** | No context window management or auto-summarization |
| **Business Impact** | Long conversations cause token overflow in AI calls |
| **Fix** | Implement sliding window + summarization in `lib/claude.ts` conversation handler |
| **Effort** | 2 days |

### GAP-S27: AI Text-RAG Mode (Embedding-Based Retrieval)

| Attribute | Value |
|-----------|-------|
| **Severity** | P2 |
| **WhatsJet** | Text-RAG mode: `embedLargeData()` splits training text into ≤500-char sentences, embeds with `text-embedding-3-small`, `findTopRelevantSections()` cosine similarity, `generateAnswerFromMultipleSections()` uses top 3 sections as context |
| **TrustCRM** | Claude API in text mode only; no embedding-based knowledge base retrieval |
| **Effort** | 5 days (OpenAI embeddings or Claude embeddings) |

---

## Section 9: Subscription & Billing — NEW GAPS

### GAP-S28: Plan Feature Limits (Exact Values)

**WhatsJet's exact plan limits (from `config/lw-plans.php`):**

| Feature | Free | Standard | Premium | Ultimate |
|---------|------|---------|---------|---------|
| contacts | 2 | 5 | 15 | -1 (unlimited) |
| campaigns/month | 10 | 10 | 10 | -1 |
| bot_replies | 10 | 10 | 10 | -1 |
| bot_flows | 5 | 5 | 5 | -1 |
| contact_custom_fields | 2 | 5 | 10 | -1 |
| system_users | 0 | 5 | 10 | -1 |
| ai_chat_bot | 1 (on) | 1 | 1 | 1 |
| api_access | 1 (on) | 1 | 1 | 1 |

**CRITICAL: Free plan = 2 contacts only.** TrustCRM currently enforces no plan limits.

| Attribute | Value |
|-----------|-------|
| **Severity** | P0 |
| **Fix** | Implement `vendorPlanDetails()` equivalent — check all 8 feature gates on contact/campaign/bot/flow create; `-1` = unlimited |
| **Effort** | 4 days |

### GAP-S29: Subscription Auto-Recurring Field

| Attribute | Value |
|-----------|-------|
| **Severity** | P1 |
| **WhatsJet** | Manual subscriptions have `auto_recurring` nullable field; affects billing reminder behavior |
| **TrustCRM** | No auto_recurring distinction on manual subscriptions |
| **Effort** | 1 day |

### GAP-S30: Subscription Cancellation — Grace Period vs Immediate

| Attribute | Value |
|-----------|-------|
| **Severity** | P1 |
| **WhatsJet** | `processCancellation()` — two modes: **grace period** (`cancel()` — access until period end) vs **immediate** (`cancelNow()` — access revoked immediately) |
| **TrustCRM** | Only one cancel mode |
| **Effort** | 1 day |

### GAP-S31: Manual Subscription Proration + Cap

| Attribute | Value |
|-----------|-------|
| **Severity** | P2 |
| **WhatsJet** | `processManualPayPreparation()` — proration logic calculates remaining days of current plan; new end date capped at `9999-12-31` for "lifetime" plans; deletes `initiated` status subs before creating new |
| **TrustCRM** | No proration for manual payments |
| **Effort** | 2 days |

### GAP-S32: PhonePe Live API Bug (Keys Swapped)

| Attribute | Value |
|-----------|-------|
| **Severity** | P0 |
| **WhatsJet Bug** | PhonePeEngine live config has `clientVersion` and `clientSecret` assignments **SWAPPED** — live PhonePe will fail silently |
| **TrustCRM Action** | When implementing PhonePe, ensure `clientVersion` and `clientSecret` are correctly mapped per PhonePe API docs |
| **Note** | Do NOT copy WhatsJet's implementation directly |

### GAP-S33: YooMoney VAT / Receipt Support

| Attribute | Value |
|-----------|-------|
| **Severity** | P2 |
| **WhatsJet** | YooMoney live mode requires VAT code + payment subject in receipt items |
| **TrustCRM** | YooMoney not started; when implementing, include receipt/VAT structure |

### GAP-S34: Vendor Webhook Dispatch (Plan-Gated)

| Attribute | Value |
|-----------|-------|
| **Severity** | P1 |
| **WhatsJet** | `dispatchVendorWebhook()` — only fires if plan has `api_access=1` AND `enable_vendor_webhook=true` in vendor settings; silently ignores errors. Exact payload: `{contact, message: {...}, whatsapp_webhook_payload}`. Source: Part 4 §6. |
| **TrustCRM** | External webhook dispatch not plan-gated |
| **Fix** | Gate External API (GAP-010) behind `plan.api_access` feature; ensure outgoing payload matches `{contact, message, whatsapp_webhook_payload}` shape |
| **Effort** | 0.5 days (add plan check to external API route group) |

---

## Section 10: WhatsApp Account / WABA — NEW GAPS

### GAP-S35: Embedded Sign-Up Full Flow

| Attribute | Value |
|-----------|-------|
| **Severity** | P1 |
| **WhatsJet** | `WhatsAppConnectApiService::processEmbeddedSignUp()` — 5-step flow:<br>1. Exchange code for access_token via `POST /oauth/access_token`<br>2. Get phone numbers from WABA; auto-register if needed<br>3. POST `subscribed_apps`; set `override_callback_uri` + `verify_token = sha1(vendorUid)`<br>4. If SMB: POST `smb_app_data` with sync_type<br>5. Save all WABA data to vendor settings |
| **TrustCRM** | WhatsApp account connect is manual config; no embedded sign-up OAuth flow |
| **Business Impact** | New vendors cannot self-onboard via Meta embedded sign-up widget |
| **Effort** | 5 days |

### GAP-S36: WABA Health Check — 7-Condition Validation

| Attribute | Value |
|-----------|-------|
| **Severity** | P0 |
| **WhatsJet** | `isWhatsAppBusinessAccountReady()` requires ALL 7 truthy conditions: (1) `facebook_app_id`, (2) `whatsapp_access_token`, (3) `whatsapp_business_account_id`, (4) `current_phone_number_number`, (5) `current_phone_number_id`, (6) `webhook_verified_at`, AND (7) NOT `whatsapp_access_token_expired`. Source: Part 4 §6. |
| **TrustCRM** | Health check route exists but validation completeness not confirmed |
| **Fix** | Verify health check validates all 7 conditions including the token-expired negative check |
| **Effort** | 0.5 days |

---

## Section 11: Real-Time / Notifications — NEW GAPS

### GAP-S37: Vendor Channel Broadcast Naming

| Attribute | Value |
|-----------|-------|
| **Severity** | P1 |
| **WhatsJet** | `VendorChannelBroadcast` uses channel `private channel vendor-channel.{vendorUid}` (Pusher private channel) |
| **TrustCRM** | Socket.io uses different channel naming — if migrating client-side code, ensure channel names are documented |
| **Note** | Not a bug per se — TrustCRM uses Socket.io not Pusher — but frontend must match the new channel format |

### GAP-S38: FCM Push via Service Account JSON

| Attribute | Value |
|-----------|-------|
| **Severity** | P1 |
| **WhatsJet** | `sendFCMNotification()` — reads `storage/app/service-account.json` for Firebase OAuth; auto-deletes device token on `INVALID_ARGUMENT`, `NOT_FOUND`, `UNREGISTERED` responses |
| **TrustCRM** | GAP-020 (FCM tokens) identified but service account file approach not documented |
| **Fix** | Use `FIREBASE_SERVICE_ACCOUNT` env var JSON (not file); auto-delete invalid tokens |
| **Effort** | Part of GAP-020 (1.5 days already estimated) |

---

## Section 12: QR Code Generation — NEW GAP

### GAP-S39: WhatsApp QR Code Generation

| Attribute | Value |
|-----------|-------|
| **Severity** | P2 |
| **WhatsJet** | `HomeController::generateWhatsAppQR($phoneNumber)` — generates `wa.me/{phoneNumber}` QR with WhatsApp logo overlay; `generateUrlQR($url)` — endroid/qr-code, 300px, low error correction |
| **TrustCRM** | No QR code generation |
| **Business Impact** | Vendors cannot generate QR codes for their WhatsApp number (common onboarding use case) |
| **Effort** | 1 day |

---

## Section 13: Translation / i18n — ARCHITECTURE DETAIL

### GAP-S40: Translation Auto-Populate (Microsoft Translator)

| Attribute | Value |
|-----------|-------|
| **Severity** | P2 |
| **WhatsJet** | `config/services.php` has **Microsoft Translator API** integration (`MICROSOFT_TRANSLATE_API_KEY`); `TranslationController::scan()` auto-discovers untranslated strings; `processTranslationStore()` flushes cache |
| **TrustCRM** | i18n not started (GAP-009); when implementing, include Microsoft Translator for auto-population |
| **Languages** | **68 locales** (confirmed Part 5 §4) including RTL (Arabic/Hebrew); `changeAppLocale()` uses browser negotiation + session + `?lang=` URL param override |
| **Effort** | Part of GAP-009 estimate; add 2 days for auto-translate feature |

---

## Section 14: System / Infrastructure — NEW GAPS

### GAP-S41: Server Performance Auto-Throttle

| Attribute | Value |
|-----------|-------|
| **Severity** | P2 |
| **WhatsJet** | `ServerPerformanceMonitorService::terminate()` — auto-returns HTTP 503 + `Retry-After: 30` if CPU > 0.030s, Memory > 90%, or I/O > 0.010s; warn thresholds: CPU 0.015s, Memory 80% |
| **TrustCRM** | No automatic load-shedding; Railway handles container-level limits |
| **Recommendation** | Railway container limits sufficient; add Datadog alert at 80% memory instead |

### GAP-S42: App Settings Type Casting (`getAppSettings()`)

| Attribute | Value |
|-----------|-------|
| **Severity** | P1 |
| **WhatsJet** | `getAppSettings()` reads DB with `data_type` cast: 1=string, 2=bool, 3=int, 4=JSON, 6=float |
| **TrustCRM** | `VendorSetting` model stores key-value as strings; no data_type field |
| **Fix** | Add `dataType` enum to `VendorSetting` model for typed settings retrieval |
| **Effort** | 1 day |

### GAP-S43: CSRF Exclusion List

| Attribute | Value |
|-----------|-------|
| **Severity** | P1 |
| **WhatsJet** | `VerifyCsrfToken` excludes: `stripe/*`, `razorpay/*`, `subscription/*`, `whatsapp-webhook/*`, `paystack/*`, `yoomoney/*` |
| **TrustCRM** | Meta webhook already excluded; Stripe webhook excluded; verify Razorpay, Paystack, YooMoney, PhonePe webhook routes are also CSRF-excluded when implemented |

### GAP-S44: Session Encryption

| Attribute | Value |
|-----------|-------|
| **Severity** | P2 |
| **WhatsJet** | `config/session.php` has `encrypt=true` — non-standard; session cookie name: `slug(APP_NAME, '_') + '_session'` |
| **TrustCRM** | Using Clerk JWTs — session encryption moot; but document that session tokens in localStorage should be encrypted |

### GAP-S45: API Rate Limit (60 req/min per user or IP)

| Attribute | Value |
|-----------|-------|
| **Severity** | P1 |
| **WhatsJet** | `RouteServiceProvider` sets rate limit: **60/min** by `user.id` or IP fallback |
| **TrustCRM** | Rate limiting plugin exists but limit value not confirmed against this spec |
| **Fix** | Verify API rate limit is set to 60/min per authenticated user |

---

## Section 15: Dashboard & Plan Enforcement — NEW GAPS

### GAP-S46: Plan Usage Check on Dashboard

| Attribute | Value |
|-----------|-------|
| **Severity** | P1 |
| **WhatsJet** | `DashboardEngine::checkPlanUsages()` — counts actual usage vs plan limits for all 8 feature gates; returns comma-joined list of unavailable features shown as warnings in dashboard |
| **TrustCRM** | No plan usage display in dashboard |
| **Fix** | Add plan usage widget to dashboard showing current vs limit for: contacts, campaigns this month, bot_replies, bot_flows, custom_fields, team_members |
| **Effort** | 2 days |

### GAP-S47: Vendor Admin Quick View (SuperAdmin)

| Attribute | Value |
|-----------|-------|
| **Severity** | P2 |
| **WhatsJet** | `DashboardController` — super-admin can quick-view any vendor's dashboard with **no permission check** |
| **TrustCRM** | SuperAdmin console (GAP-007) is missing entirely; this is a sub-feature of it |

---

## Section 16: Message Queue — ARCHITECTURE GAPS

### GAP-S48: Message Queue Status Codes (7 States)

| Code | Status | WhatsJet Meaning |
|------|--------|----------------|
| 1 | In Queue | Awaiting processing |
| 2 | Failed | Final failure after retries |
| 3 | Processing | Actively being sent |
| 4 | Processed | Successfully sent |
| 5 | Expired | Passed `expiry_at` without processing |
| 6 | Processed but Response Awaited | Sent; webhook confirmation pending |
| 7 | Aborted | Manually aborted |

**TrustCRM gap:** BullMQ job statuses (waiting/active/completed/failed) map to WhatsJet codes but `expiry_at` and `awaited_response` states are not modeled. Message records should track these states.

### GAP-S49: Message Processing is NOT FIFO

| Attribute | Value |
|-----------|-------|
| **Severity** | P2 |
| **WhatsJet** | `getQueueItemsForProcess()` uses `->inRandomOrder()` — deliberately not FIFO; may be for load distribution |
| **TrustCRM** | BullMQ is FIFO by default — this is a TrustCRM improvement; document that behavior differs from WhatsJet |

---

## Summary of NEW Gaps from Supplements

| Gap ID | Feature | Severity | Effort (days) |
|--------|---------|---------|--------------|
| GAP-S01 | Social Login (Google/Facebook) | P2 | 2 |
| GAP-S02 | Account Activation Required Flow | P2 | 1 |
| GAP-S03 | Login Logs / Audit | P1 | 1 |
| GAP-S04 | Full Permission Tree (9 groups + 15 sub-keys) | P0 | 4 |
| GAP-S05 | `assigned_chats_only` enforcement | P0 | 0.5 |
| GAP-S06 | Data masking (phone/email) | P0 | 2 |
| GAP-S07 | Contact service window (24h rule) | P0 | 2 |
| GAP-S08 | Phone wa_id normalization | P1 | 1.5 |
| GAP-S09 | Contact advance filter (saved per user) | P2 | 3 |
| GAP-S10 | Contact groups — 3 creation modes | P1 | 3 |
| GAP-S11 | Contact group archived status | P2 | 0.5 |
| GAP-S12 | Import exact column spec validation | P1 | 1 |
| GAP-S13 | Export phone number Excel safety | P1 | 0.5 |
| GAP-S14 | Campaign ABORT (status 6) | P1 | 0.5 |
| GAP-S15 | Campaign status computation rules | P1 | 1 |
| GAP-S16 | Campaign Excel export with masking | P2 | 2 |
| GAP-S17 | Non-template campaign presets | P2 | 3 |
| GAP-S18 | Dynamic bot tokens ({first_name} etc.) | P1 | 2 |
| GAP-S19 | Bot reply uniqueness scope | P1 | 0.5 |
| GAP-S20 | Template button types (VOICE_CALL etc.) | P1 | 1 |
| GAP-S21 | Template analytics read% formula | P2 | 0.5 |
| GAP-S22 | WhatsApp text formatting (markdown→HTML) | P1 | 1 |
| GAP-S23 | Message status downgrade protection | P0 | 0.5 |
| GAP-S24 | Stuck message auto-recovery | P1 | 1 |
| GAP-S25 | Pagination hardcoded — WhatsJet limitation | INFO | — |
| GAP-S26 | AI chat history summarization | P1 | 2 |
| GAP-S27 | AI text-RAG (embedding retrieval) | P2 | 5 |
| GAP-S28 | Plan feature limits enforcement | P0 | 4 |
| GAP-S29 | Subscription auto-recurring field | P1 | 1 |
| GAP-S30 | Cancel grace period vs immediate | P1 | 1 |
| GAP-S31 | Manual subscription proration + cap | P2 | 2 |
| GAP-S32 | PhonePe live API keys swapped bug | P0 | NOTE: do not copy bug |
| GAP-S33 | YooMoney VAT/receipt support | P2 | 1 |
| GAP-S34 | Vendor webhook plan-gated | P1 | 0.5 |
| GAP-S35 | Embedded WABA sign-up flow | P1 | 5 |
| GAP-S36 | WABA health check — 7-condition validation | P0 | 0.5 |
| GAP-S37 | Vendor channel broadcast naming | P1 | 0.5 |
| GAP-S38 | FCM service account JSON approach | P1 | (in GAP-020) |
| GAP-S39 | WhatsApp QR code generation | P2 | 1 |
| GAP-S40 | Microsoft Translator auto-populate | P2 | 2 (in GAP-009) |
| GAP-S41 | Server performance auto-throttle | P2 | INFO |
| GAP-S42 | App settings data type casting | P1 | 1 |
| GAP-S43 | CSRF exclusion for payment webhooks | P1 | 0.5 |
| GAP-S44 | Session encryption | P2 | INFO |
| GAP-S45 | API rate limit (60/min) | P1 | 0.5 |
| GAP-S46 | Plan usage check on dashboard | P1 | 2 |
| GAP-S47 | Vendor admin quick view | P2 | (in GAP-007) |
| GAP-S48 | Message queue 7-state model | P1 | 2 |
| GAP-S49 | Message processing not FIFO | INFO | TrustCRM is better |

| GAP-S50 | Disposable email check external API | P1 | 0.5 |
| GAP-S51 | Demo mode (IS_DEMO_MODE env) | P2 | 2 |
| GAP-S52 | Token registry table (mobile JWT tracking) | P2 | 1 |

**New P0 gaps from supplements: 7**
**New P1 gaps from supplements: 23**
**New P2 gaps from supplements: 17**
**New estimated effort: ~76 additional engineering days**

---

## Section 17: Part 4 Additions — Framework Core, Services, Helpers

### GAP-S50: Disposable Email Check via External API

| Attribute | Value |
|-----------|-------|
| **Severity** | P1 |
| **WhatsJet** | Custom validation rule `check_disposable_email` calls `https://disposable.debounce.io/?email={value}` on registration; 10s timeout; fails if non-200 or `disposable != 'false'` |
| **TrustCRM** | No disposable email check on vendor registration |
| **Business Impact** | Spam vendor accounts using temp emails; also, external API call is a dependency risk (single point of failure on registration) |
| **Fix** | Add disposable email check during vendor invite acceptance; consider self-hosted blocklist instead of external API to avoid SSRF / dependency risk |
| **Effort** | 0.5 days |

### GAP-S51: Demo Mode Feature

| Attribute | Value |
|-----------|-------|
| **Severity** | P2 |
| **WhatsJet** | `IS_DEMO_MODE` env var; `DEMO_ACCOUNT_ID` and `DEMO_ACCOUNT_ACCESS_SECRET_KEY`; demo mode: masks data, prefixes all outgoing messages with demo text, shows demo vendor read-only login |
| **TrustCRM** | No demo mode; conveys.in marketing site but no interactive demo tenant |
| **Business Impact** | Cannot safely show a live demo without risk of data exposure |
| **Effort** | 2 days (read-only demo tenant + data masking toggle) |

### GAP-S52: Token Registry Table (Mobile JWT Token Storage)

| Attribute | Value |
|-----------|-------|
| **Severity** | P2 |
| **WhatsJet** | `token_registry` table tracks all issued JWT tokens; enables server-side revocation; `verifyToken()` checks registry existence + match; auto-cleans expired tokens; supports predecessor_token_id chain for refresh tracking |
| **TrustCRM** | Mobile app auth uses Clerk Expo SDK — no custom JWT registry needed; but if mobile uses TrustCRM custom auth, token revocation is not implemented |
| **Note** | If mobile stays on Clerk, this gap is N/A. If TrustCRM implements custom mobile JWT, token registry is required for revocation. |
| **Effort** | 1 day (only if moving away from Clerk for mobile) |

---

## Section 18: Part 9 Additions — SubscriptionEngine, ManualSubscription, HomeController, AuthController

### GAP-S53: Manual Subscription Lifecycle State Machine

| Attribute | Value |
|-----------|-------|
| **Severity** | P1 |
| **WhatsJet** | `ManualSubscriptionEngine::processManualPayPreparation()` creates record in `initiated` state; after payment confirmation → `active`; any previously `active` subscription for same vendor → auto-`cancelled`; states: `initiated → pending → active → cancelled` |
| **TrustCRM** | Stripe-managed subscriptions only; no manual payment lifecycle with these explicit states |
| **Business Impact** | Indian gateways (Razorpay, PayU, CCAvenue) require manual subscription flow; cannot support Indian payment methods without this |
| **Effort** | 3 days |

### GAP-S54: Duplicate Transaction Reference Guard

| Attribute | Value |
|-----------|-------|
| **Severity** | P1 |
| **WhatsJet** | Before recording a manual subscription payment, checks if `txn_reference` already exists for that vendor; blocks duplicate payment recording |
| **TrustCRM** | No such guard on manual payment ingestion |
| **Business Impact** | Double-billing risk on webhook retry or network glitch |
| **Effort** | 0.5 days |

### GAP-S55: Stripe Plan Swap `type` Field Manual Update

| Attribute | Value |
|-----------|-------|
| **Severity** | P2 |
| **WhatsJet** | After `Cashier::swap()` call to change Stripe subscription plan, must additionally manually update `type` field on the local subscription record; Cashier does not update it automatically |
| **TrustCRM** | Plan swap not yet implemented; needs this workaround documented before implementation |
| **Business Impact** | Plan change would record wrong plan type in DB if `type` update is missed |
| **Effort** | 0.5 days (awareness — add to plan-swap implementation) |

### GAP-S56: `planSelectorId` Three-Underscore Format

| Attribute | Value |
|-----------|-------|
| **Severity** | P2 |
| **WhatsJet** | Billing interval encoding: `{plan_id}___monthly` or `{plan_id}___yearly` (three underscores as separator) — parsed by splitting on `___` to extract plan ID and interval |
| **TrustCRM** | Plan selection format not yet standardized; if implementing, must match this parsing convention or adapt both ends |
| **Effort** | 0.5 days (implementation detail) |

### GAP-S57: Public Health Check and Utility Endpoints

| Attribute | Value |
|-----------|-------|
| **Severity** | P2 |
| **WhatsJet** | `GET /ping-pong` (health check JSON), `GET /custom-styles` (vendor CSS), `GET /server-compiled-js` (compiled JS), `GET /url-qr/{upiAddress}/{logo}` (300px QR PNG via endroid/qr-code), `POST /register-number-for-demo` (demo phone registration) |
| **TrustCRM** | No equivalent public utility routes; Next.js serves static assets; no UPI QR endpoint |
| **Business Impact** | UPI QR endpoint needed for Indian payment display; health check is ops standard |
| **Effort** | 1 day (health check + UPI QR; CSS/JS endpoints N/A in Next.js) |

---

**Updated gap counts — P1: 25, P2: 19; total new effort: ~83 additional engineering days**

---

## Section 19: Part 10 Additions — Payment Engines, Permissions, SubscriptionPlanDetails

### GAP-S58: Sub-Permission Default-Allow Behavior

| Attribute | Value |
|-----------|-------|
| **Severity** | P0 |
| **WhatsJet** | Sub-permissions (e.g. `manage_contacts@import_contacts`) default to **allow** when the key is absent from `vendor_users.__data.permissions`; only an explicit `"deny"` blocks access. Parent permissions still require explicit `"allow"`. |
| **TrustCRM** | TrustCRM permission check logic not yet implemented to match this default-allow behavior for sub-keys |
| **Business Impact** | If TrustCRM defaults sub-permissions to deny-by-default, existing users lose access to sub-features after migration without re-granting; this is a data-migration correctness issue |
| **Fix** | When checking sub-permissions: if key absent → allow. Only deny explicitly-stored `"deny"` values. |
| **Effort** | 0.5 days |

### GAP-S59: `hide_contact_*` Inverted Permission Logic

| Attribute | Value |
|-----------|-------|
| **Severity** | P0 |
| **WhatsJet** | `hide_contact_phone_numbers` and `hide_contact_emails` permissions use inverted semantics: "allow" means **hide** (mask the data), "deny" means **show** (display plaintext). All other permissions: "allow" = grant access. |
| **TrustCRM** | If TrustCRM implements masking permissions, inversion must be documented or data exposure results |
| **Business Impact** | Incorrect implementation shows hidden contact data to restricted users — GDPR/privacy violation |
| **Fix** | Treat `hide_contact_phone_numbers` and `hide_contact_emails` as inversion flags: store "allow" = apply mask. |
| **Effort** | 0.5 days |

### GAP-S60: Payment Gateway DB-Configurable Credentials (All 5 Gateways)

| Attribute | Value |
|-----------|-------|
| **Severity** | P1 |
| **WhatsJet** | PayPal, Razorpay, Paystack, PhonePe, and YooMoney all load test/live API keys from DB settings (`use_test_{gateway}` boolean + `{gateway}_testing/live_publishable_key/_secret_key`) at call time — no redeploy needed to switch modes |
| **TrustCRM** | Payment credentials are env-based; no runtime switch between test/live mode |
| **Business Impact** | Cannot onboard new vendors with their own gateway keys; cannot run A/B test vs live without code change |
| **Effort** | 2 days (5 gateways × settings page + DB-backed credential loader) |

### GAP-S61: Payment Webhook Event Scope and Signature Verification

| Attribute | Value |
|-----------|-------|
| **Severity** | P1 |
| **WhatsJet** | Each gateway only processes one specific event: Razorpay → `payment.captured`, Paystack → `charge.success` (HMAC-SHA512 via `X-Paystack-Signature`), YooMoney → `payment.succeeded`; all other events ignored |
| **TrustCRM** | Payment webhook handlers not yet implemented for any of these gateways |
| **Business Impact** | Manual subscription confirmation cannot be automated without webhooks |
| **Effort** | 1 day per gateway (5 days total for all event handlers + signature verification) |

### GAP-S62: PhonePe Non-Standard Auth Header

| Attribute | Value |
|-----------|-------|
| **Severity** | P2 |
| **WhatsJet** | PhonePe API requires `Authorization: O-Bearer {accessToken}` — note prefix `O-Bearer`, NOT standard `Bearer`; amount passed in paisa (× 100 from rupees) |
| **TrustCRM** | PhonePe integration not started |
| **Business Impact** | Using standard `Bearer` prefix silently fails PhonePe auth |
| **Effort** | Implementation detail (part of PhonePe integration work) |

---

**Updated gap counts — P0: 9, P1: 28, P2: 21; total new effort: ~95 additional engineering days**

---

## Section 20: Part 11 Additions — Plan Config, Embedded WABA Signup

### GAP-S63: Plan Limits — All 6 Entity Types Enforced at Create Time

| Attribute | Value |
|-----------|-------|
| **Severity** | P0 |
| **WhatsJet** | `vendorPlanDetails($feature, 'count', $vendorId)` called before creating: contacts, campaigns (monthly), bot_replies, bot_flows, contact_custom_fields, system_users; blocks create if `isLimitAvailable()` is false |
| **TrustCRM** | No plan limit enforcement on any entity create |
| **Business Impact** | Free vendors can accumulate unlimited contacts/bots/users; plan monetization breaks |
| **Fix** | Add plan limit check in all entity create endpoints; `featureLimit == -1` means unlimited (skip check) |
| **Effort** | 3 days (6 entity types, shared helper, error response) |

### GAP-S64: `switch` Feature Type for AI Bot and API Access

| Attribute | Value |
|-----------|-------|
| **Severity** | P1 |
| **WhatsJet** | `ai_chat_bot` and `api_access` are binary switches checked via `vendorPlanDetails($feature, 1, $vendorId)['is_limit_available']`; if `plan_feature_limit == 1` → enabled; gates AI bot responses and external API/webhook delivery |
| **TrustCRM** | No plan-gated AI bot or API access switch |
| **Business Impact** | All vendors get AI bot and webhook regardless of plan |
| **Effort** | 1 day (two feature gates) |

### GAP-S65: Extended App-Level Webhook Subscriptions

| Attribute | Value |
|-----------|-------|
| **Severity** | P2 |
| **WhatsJet** | App-level subscriptions include: `messages`, `message_template_quality_update`, `message_template_status_update`, `account_update`, `history`, `smb_app_state_sync`, `smb_message_echoes` — 7 fields total |
| **TrustCRM** | `connect-webhook` in `whatsapp-account` route likely only subscribes to `messages`; other event types not handled |
| **Business Impact** | Template quality alerts, account-level changes, and SMB sync events not received |
| **Effort** | 1 day (add subscription fields + handlers) |

---

**Updated gap counts — P0: 11, P1: 30, P2: 22; total new effort: ~100 additional engineering days**

---

## Section 21: Part 12 Additions — Complete Engine Coverage

### GAP-S66: Contact Import Polling Model

| Attribute | Value |
|-----------|-------|
| **Severity** | P1 |
| **WhatsJet** | Import uses multi-call polling: call 1 validates file, counts rows, stores state in DB; calls 2+ each process a 500-row chunk and return updated progress %; concurrent imports blocked by `contacts_import_process_data` vendor setting lock |
| **TrustCRM** | BullMQ job is one-shot (no progress tracking, no concurrent guard) |
| **Business Impact** | Large imports silently fail or overlap without progress feedback |
| **Fix** | Add concurrent import lock; emit progress events via Socket.io per chunk |
| **Effort** | 1.5 days |

### GAP-S67: VendorSettings Save Side Effects

| Attribute | Value |
|-----------|-------|
| **Severity** | P1 |
| **WhatsJet** | Saving specific settings keys triggers side effects: `facebook_app_secret` → registers app webhooks; `whatsapp_access_token` → validates token, clears expired flag; `whatsapp_business_account_id` → removes old webhooks, re-connects, fetches phone numbers; `test_recipient_contact` → auto-creates contact if not found; `open_ai_input_training_data` → re-generates embeddings |
| **TrustCRM** | `PUT /v1/vendor-settings` stores keys but no side effects triggered |
| **Business Impact** | WABA setup silently fails to wire webhooks; AI bot training data never embedded; test contact never created |
| **Fix** | Add side effect hooks to settings update route for each affected key |
| **Effort** | 2 days |

### GAP-S68: Contact Group Recampaign — 8 Granular Types

| Attribute | Value |
|-----------|-------|
| **Severity** | P2 |
| **WhatsJet** | Group creation from campaign results: 8 types — `total`, `delivered`, `read`, `failed`, `expired`, `sent`, `in_queue`, `accepted`; guards against in-progress campaigns |
| **TrustCRM** | Contact groups not linked to campaign execution results |
| **Business Impact** | Cannot re-send to failed/unread recipients (core engagement re-targeting workflow) |
| **Effort** | 2 days |

### GAP-S69: Bot Plan Limit — Standalone vs Bot-Flow Distinction

| Attribute | Value |
|-----------|-------|
| **Severity** | P1 |
| **WhatsJet** | Plan limit for `bot_replies` only counts **standalone** bots (`bot_flows__id IS NULL`); bots inside a flow chart are unlimited (they're part of the flow, not independent) |
| **TrustCRM** | Bot plan limits not enforced; if implemented, must replicate this standalone-only distinction |
| **Business Impact** | Over-limiting bot replies inside flows would break flow builder; over-counting would incorrectly block flow creation |
| **Effort** | 0.5 days (clarification when implementing bot limits) |

---

**Updated gap counts — P0: 11, P1: 33, P2: 23; total new effort: ~107 additional engineering days**

---

## Section 22: Part 13 Additions — All Repositories and Controllers

### GAP-S70: API Campaign `contact_group` Format — CSV String Not JSON Array

| Attribute | Value |
|-----------|-------|
| **Severity** | P1 |
| **WhatsJet** | External API campaign creation: `contact_group` must be a comma-separated string of UIDs; `contact_labels` is a nullable comma-separated string. Web form uses arrays. |
| **TrustCRM** | TrustCRM API likely uses JSON arrays for both; external API consumers would need to match format |
| **Business Impact** | External API clients calling campaign creation with JSON arrays would silently use wrong data format |
| **Effort** | 0.5 days (document + validate at API boundary) |

### GAP-S71: Super-Admin Impersonation (Login-As-Vendor)

| Attribute | Value |
|-----------|-------|
| **Severity** | P2 |
| **WhatsJet** | `VendorController::loginAsVendorAdmin()` uses `Auth::loginUsingId($vendorAdminUserId)` and stores original super-admin ID in session; `logoutAsVendorAdmin()` restores; allows admin to debug vendor environments |
| **TrustCRM** | No impersonation feature; Clerk manages auth sessions |
| **Business Impact** | Support staff cannot debug vendor environments without sharing credentials |
| **Effort** | 2 days (Clerk impersonation requires special session handling) |

### GAP-S72: Stripe Webhook Auto-Creation

| Attribute | Value |
|-----------|-------|
| **Severity** | P1 |
| **WhatsJet** | Admin can click a button to programmatically create a Stripe webhook endpoint via Stripe SDK; subscribes to 8 events; stores webhook secret to DB automatically |
| **TrustCRM** | Stripe webhook must be manually created in Stripe dashboard; no self-service |
| **Business Impact** | Multi-tenant SaaS vendors must manually configure Stripe — error-prone onboarding |
| **Effort** | 1 day |

### GAP-S73: Zero-Decimal Currency Handling

| Attribute | Value |
|-----------|-------|
| **Severity** | P1 |
| **WhatsJet** | 17 zero-decimal currencies (JPY, KRW, HUF, etc.) skip the × 100 amount conversion; `__currencies.php` is the reference |
| **TrustCRM** | Stripe handles this via `stripe-zero-decimal` package or manual check; verify TrustCRM does not double-convert |
| **Business Impact** | Charging JPY 1000 as 100000 (¥1,000,000) — catastrophic billing error |
| **Effort** | 0.5 days (verify and add zero-decimal list check to billing code) |

---

**Updated gap counts — P0: 11, P1: 36, P2: 24; total new effort: ~113 additional engineering days**

---

## Section 23: Part 15 Additions — Final Complete Coverage

### GAP-S74: CSRF Exclusions for Payment Webhooks

| Attribute | Value |
|-----------|-------|
| **Severity** | P1 |
| **WhatsJet** | `VerifyCsrfToken::$except` excludes: `stripe/*`, `razorpay/*`, `subscription/*`, `whatsapp-webhook/*`, `paystack/*`, `yoomoney/*`; `TokenMismatchException` returns JSON `rc=2` instead of redirect |
| **TrustCRM** | Fastify has no CSRF middleware; webhook routes should verify they are not accidentally blocked by other security layers |
| **Business Impact** | Payment provider callbacks silently fail if CSRF is incorrectly applied; also, CSRF mismatch behavior (JSON vs redirect) affects UX of session expiry |
| **Fix** | Verify all payment webhook routes in TrustCRM are not blocked by any security middleware; document expected 419-equivalent behavior |
| **Effort** | 0.5 days (audit + documentation) |

### GAP-S75: Media Files — Public Access vs Signed URLs

| Attribute | Value |
|-----------|-------|
| **Severity** | P2 |
| **WhatsJet** | All media stored at `public_path()` — directly URL-accessible without authentication or signed URLs; WhatsJet media URLs are permanent and guessable |
| **TrustCRM** | S3/Cloudflare R2 uses pre-signed URLs with expiry — media not permanently public |
| **Business Impact** | Migration of existing WhatsJet media to TrustCRM requires handling URL differences; users with saved WhatsJet media links will break after migration |
| **Fix** | Implement media migration script that re-uploads WhatsJet public media to R2; document URL format differences |
| **Effort** | 1.5 days (migration script + documentation) |

---

**FINAL gap counts — P0: 11, P1: 37, P2: 25; total estimated new effort: ~116 additional engineering days**

> **This is the final supplement gaps entry.** All 15 WhatsJet v7.2.0 supplement documents have been read and analyzed. The 73 supplement gaps (GAP-S01 through GAP-S75) are in addition to the gaps documented in `05-gap-analysis-report.md`.

---

## CRITICAL BUGS IN WHATSJET (Do NOT Replicate)

| Bug | Location | Description |
|-----|---------|-------------|
| PhonePe keys swapped | `PhonePeEngine` | live clientVersion/clientSecret assignments are SWAPPED — live PhonePe payments fail |
| PayPal silent failure | `ManualSubscriptionController::capturePaypalOrder` | Missing `return` on error → falls through to success response |
| Razorpay silent failure | `ManualSubscriptionController::checkoutRazorpay` | Same missing `return` issue |
| Sound notification inverted | `VendorSettingsController::disableSoundForMessageNotification` | Reads current value, stores OPPOSITE (cache issue) |
| Message queue not FIFO | `WhatsAppMessageQueueRepository` | `inRandomOrder()` means messages may process out of sequence |
| Global page slug | `PageRepository::storePage` | `vendors__id` is commented out — all pages have NULL vendor; CMS pages are global, not per-vendor |

---

## Architecture Discoveries (Context Only)

| Discovery | Impact on TrustCRM Design |
|-----------|--------------------------|
| Anti-piracy kill-switch | `ConfigurationController` had embedded backdoor to disable the engine — not relevant to TrustCRM |
| Obfuscated license check | Template approval filter uses obfuscated function — TrustCRM has no licensing restrictions |
| 1024-bit RSA key embedded | `YesSecurity` uses weak RSA; TrustCRM should use Clerk/JWT only |
| MySQL `CONCAT` syntax in queries | Not portable to PostgreSQL; all WhatsJet raw SQL must be rewritten as Prisma queries |
| CoreModel `_uid` auto-generation | TrustCRM uses `@default(uuid())` in Prisma — equivalent |
| Flash cache `sha1(json_encode([class, args]))` | TrustCRM uses Redis cache; key design should be explicit not implicit |
| MariaDB JSON workaround | `Arr::set()` instead of JSON path notation — not needed in PostgreSQL/Prisma |
| `inRandomOrder()` for team assignment | WhatsJet assigns conversations to random team member; TrustCRM should implement proper round-robin |

---

*Source: All 15 WhatsJet_Legacy_System_Supplement_* files*
*Reviewed: 2026-05-18 | Owner: Engineering Lead*
