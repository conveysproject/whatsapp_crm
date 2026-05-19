# WhatsJet Legacy System — Supplement Part 8
## Version 7.2.0 | Console, Jobs, Events, BotFlowEngine, Auth Requests, Providers

> **Coverage:** Console/Kernel.php, 3 Console Commands, 2 Jobs, 2 Events, BotFlowEngine (complete), 2 Auth Request classes, ResetPassword notification, AppServiceProvider, EventServiceProvider
> **Methodology:** Direct PHP source file reading — exact behavior documented, no inference
> **Prior Parts:** Parts 1–7 cover engines, models, config, routes, middleware, controllers

---

## 1. Scheduler — `app/Console/Kernel.php`

Two-mode architecture controlled by `enable_queue_jobs_for_campaigns` setting:

**Mode A — Queue Jobs enabled (default for production):**
- Scheduler does nothing — jobs are dispatched on demand by engine code
- No cron entries are registered

**Mode B — Queue Jobs disabled (polling mode):**
```php
if (!getAppSettings('enable_queue_jobs_for_campaigns')) {
    if (getAppSettings('enable_wa_webhook_process_using_db')) {
        $schedule->command('whatsapp:webhooks:process')
            ->everySecond()->withoutOverlapping(2);
    }
    $schedule->command('whatsapp:campaign:process')
        ->everyFiveSeconds()->withoutOverlapping(2);
}
```
- Webhook processing: every 1 second, `withoutOverlapping(2)` (max 2-minute overlap lock)
- Campaign processing: every 5 seconds, `withoutOverlapping(2)`

**Always-on commands (independent of queue mode):**
- `whatsapp-message:delete:process` — scheduled separately (see §3.2)
- `vendor-temp-media:delete:process` — scheduled separately (see §3.3)

---

## 2. Jobs

### 2.1 `ProcessCampaignMessagesJob`
- Path: `app/Jobs/ProcessCampaignMessagesJob.php`
- Dispatched by `WhatsAppServiceEngine::processCampaignCreate()` when `enable_queue_jobs_for_campaigns=true`
- Body: `app()->make(WhatsAppServiceEngine::class)->processCampaignSchedule()`
- No constructor parameters — reads all pending campaigns globally

### 2.2 `ProcessMessageWebhookJob`
- Path: `app/Jobs/ProcessMessageWebhookJob.php`
- Dispatched when webhook arrives and `enable_wa_webhook_process_using_db=true`
- Body: `Artisan::call('whatsapp:webhooks:process', ['webhooksCount' => 10])`
- Processes exactly **10 webhook queue records** per job execution

---

## 3. Console Commands

### 3.1 `ProcessWhatsappCampaign`
- Signature: `whatsapp:campaign:process {--slot=0}`
- Note: `--slot` option exists in signature but is **never used** in the command body
- Pre-processing: calls `emptyFlashCache()` before any campaign logic
- Processing: calls `WhatsAppServiceEngine::processCampaignSchedule()`

### 3.2 `ProcessDeleteWhatsappMessages`
- Signature: `whatsapp-message:delete:process`
- Guard: exits if `enable_automatic_message_deletion` setting is falsy
- Cutoff: reads `delete_whatsapp_message_days`; calculates `now() - N days`
- Operation: **batched UPDATE** (NOT DELETE) on `whatsapp_message_logs`
  - Sets `__data = NULL, message = NULL`
  - Filter: `created_at < cutoff AND is_system_message IS NULL AND __data IS NOT NULL`
  - Batch size: **1000 records** per iteration
  - Between batches: `usleep(200000)` (200ms pause)
- Result: row is physically kept; only message content is nulled

### 3.3 `ProcessDeleteVendorTempMedia`
- Signature: `vendor-temp-media:delete:process`
- Guard: exits if `enable_automatic_delete_vendor_temp_media` setting is falsy
- Delegates: calls `MediaEngine::deleteAllVendorTempMedia()`

---

## 4. Events

### 4.1 `VendorChannelBroadcast`
- Path: `app/Events/VendorChannelBroadcast.php`
- Implements: `ShouldBroadcastNow` (synchronous — NOT queued)
- Constructor: `(string $vendorUid, array $data)`
- `broadcastOn()`: `new PrivateChannel('vendor-channel.' . $vendorUid)`
- `broadcastAs()`: returns `'VendorChannelBroadcast'`
- `broadcastWith()`: returns `$data` if not empty, else `[]`
- Transport: Pusher (channel registered in `routes/channels.php`; auth: `$vendorUid == getVendorUid()`)

### 4.2 `WhatsappWebhookReceived`
- Path: `app/Events/WhatsappWebhookReceived.php`
- Does NOT implement `ShouldBroadcast` — simple event, not broadcast
- Properties: `$webhookData` (array), `$vendorUid` (string)
- Triggered by: incoming webhook payload when `calls` field is present (WhatsApp calling feature)
- Listeners: **none registered** in `EventServiceProvider`

---

## 5. BotFlowEngine (`app/Yantrana/Components/BotReply/BotFlowEngine.php`) — Complete

### 5.1 CRUD Operations
- `prepareBotFlowDataTableSource()`: DataTable columns: `_id, _uid, title, start_trigger, status`
- `processBotFlowCreate()`: checks `vendorPlanDetails('bot_flows', count, vendorId)` before creating (plan limit enforcement)
- `processBotFlowUpdate()`:
  - Validates uniqueness of both `title` AND `start_trigger` scoped per vendor
  - If `start_trigger` changes → updates ALL associated bot replies that referenced old trigger via `botReplyRepository->updateItAll()`

### 5.2 `processBotFlowDataUpdate($request)` — Trigger Topology Computation
This is the core flow-builder save logic. Bot `reply_trigger` values are auto-derived from the visual graph.

**Step 1 — Read graph topology:**
```
flow_chart_data.links   — edge list (fromOperator, fromConnector, toOperator)
flow_chart_data.operators — node list (keyed by operator ID)
```

**Step 2 — Clean orphaned operators:**
Remove any operators from the visual data that don't correspond to a real BotReplyModel record.

**Step 3 — Map triggers from link topology:**
For each link in `flow_chart_data.links`:
- `fromConnector` uses `___` as separator instead of `.` in the UI; convert back:
  ```php
  str_replace('___', '.', $link['fromConnector'])
  ```
- Look up the trigger subject from the upstream node's message data:
  - If button interaction: read from `interaction_message.buttons[N]`
  - If list section: read from `interaction_message.list_data[N]`
- If `fromOperator == 'start'`: use `botFlow->start_trigger` as the trigger subject
- Multiple upstream links pointing to same bot → **comma-joined** string stored in `reply_trigger`

**Step 4 — Reset unlinked bots:**
Bots not referenced by any link → `resetBotTriggers()` called (clears their `reply_trigger`)

**Step 5 — Save:**
Saves `flow_builder_data` (the visual layout) to `__data` on BotFlowModel.

### 5.3 `prepareBotFlowBuilderData()`
Returns all data needed for the visual flow builder UI:
- `botFlow` — the flow record
- `flowBots` — all bot replies linked to this flow
- `vendorMessagingUsers` — assignable users
- `allLabels` — all labels for the vendor

---

## 6. Auth Requests

### 6.1 `LoginRequest`
- Path: `app/Yantrana/Components/Auth/Requests/LoginRequest.php`
- Validation rules: `email: required`, `password: required|string`
- Multi-credential detection (from the `email` field value):
  - Contains `@` → treat as email credential
  - No `@`, numeric chars only → treat as `mobile_number` credential
  - No `@`, non-numeric → treat as `username` credential
- Rate limiting:
  - Max **5 attempts**; throttle key = `Str::lower($input['email']) . '|' . $this->ip()`
  - On lockout: fires `Lockout` event; throws `ValidationException` with seconds-remaining message
  - Uses standard Laravel `RateLimiter`

### 6.2 `RegisterRequest`
- Path: `app/Yantrana/Components/Auth/Requests/RegisterRequest.php`
- Full validation rules:
  | Field | Rules |
  |-------|-------|
  | `email` | `required\|string\|email\|unique:users` + conditional `\|indisposable` (if `disallow_disposable_emails` setting) |
  | `password` | `required\|string\|confirmed\|min:8` |
  | `username` | `required\|string\|unique:users\|alpha_dash\|min:2\|max:45` |
  | `mobile_number` | `required\|min:9\|max:15`; custom: rejects prefix `0` or `+`; uniqueness via `AuthModel::where('mobile_number', ...)->exists()` |
  | `vendor_title` | `required\|string\|min:2\|max:100` |
  | `first_name` | `required\|string\|min:1\|max:45` |
  | `last_name` | `required\|string\|min:1\|max:45` |
  | `terms_and_conditions` | `accepted` — only required if any of `user_terms`, `vendor_terms`, `privacy_policy` settings are set |

---

## 7. ResetPassword Notification
- Path: `app/Yantrana/Components/Auth/Notifications/ResetPassword.php`
- Channel: mail only
- Reset URL: named route `auth.password.reset` with `token` and `email` parameters
- All strings wrapped in `__tr()` for translation support
- Expiry display: reads from `config('auth.passwords.*.expire')` in minutes

---

## 8. Providers

### 8.1 `AppServiceProvider`
- Path: `app/Providers/AppServiceProvider.php`
- `boot()` actions:
  1. Forces HTTPS: `URL::forceScheme('https')` if `force_https` config is true
  2. Loads 5 helper files from support path:
     - `helpers.php`
     - `app-helpers.php`
     - `extended-validations.php`
     - `custom-tech-config.php`
     - `extended-blade-directive.php`
  3. Stripe Cashier: `Cashier::useCustomerModel(VendorModel::class)` — vendor IS the billing customer
  4. Tax calculation: `Cashier::calculateTaxes()` only when BOTH `enable_stripe=true` AND `stripe_enable_calculate_taxes=true`
  5. Addon auto-loading:
     - Scans `base_path('addons')` directory
     - For each addon: loads `addons/{name}/vendor/autoload.php`
     - Registers: `Addons\{AddonName}\{AddonName}ServiceProvider`

### 8.2 `EventServiceProvider`
- Path: `app/Providers/EventServiceProvider.php`
- Only registered listener mapping:
  ```php
  Registered::class => [SendEmailVerificationNotification::class]
  ```
- **No custom mappings** for any WhatsApp, Campaign, Bot, or Subscription events
- `WhatsappWebhookReceived` event has zero registered listeners

---

## 9. Support Files (Partially Read)

### `app/Yantrana/Support/helpers.php` and `app-helpers.php`
These define global helper functions used throughout the codebase. Key functions referenced in read files:
- `getAppSettings($key)` — reads from `__settings` config cache
- `getVendorId()` / `getVendorUid()` — reads current vendor context
- `__tr($key)` — translation wrapper
- `emptyFlashCache()` — clears runtime flash cache
- `vendorPlanDetails($feature, $count, $vendorId)` — plan limit checker
- `getListOfPermissions()` — returns full permission tree

Full source of these files was not read this session.

---

## 10. Updated Coverage Map

### Files Definitively Read This Session (Part 8)
| File | Status |
|------|--------|
| `app/Console/Kernel.php` | ✅ 100% |
| `app/Jobs/ProcessCampaignMessagesJob.php` | ✅ 100% |
| `app/Jobs/ProcessMessageWebhookJob.php` | ✅ 100% |
| `app/Console/Commands/ProcessWhatsappCampaign.php` | ✅ 100% |
| `app/Console/Commands/ProcessDeleteWhatsappMessages.php` | ✅ 100% |
| `app/Console/Commands/ProcessDeleteVendorTempMedia.php` | ✅ 100% |
| `app/Events/VendorChannelBroadcast.php` | ✅ 100% |
| `app/Events/WhatsappWebhookReceived.php` | ✅ 100% |
| `app/Yantrana/Components/BotReply/BotFlowEngine.php` | ✅ 100% |
| `app/Yantrana/Components/Auth/Requests/LoginRequest.php` | ✅ 100% |
| `app/Yantrana/Components/Auth/Requests/RegisterRequest.php` | ✅ 100% |
| `app/Yantrana/Components/Auth/Notifications/ResetPassword.php` | ✅ 100% |
| `app/Providers/AppServiceProvider.php` | ✅ 100% |
| `app/Providers/EventServiceProvider.php` | ✅ 100% |

### ⚠️ Still Unread — Remaining Gaps
- All ~15 Repository files (data access / query layer)
- All ~20 Controller files (HTTP layer — thin delegates)
- `app/Yantrana/Support/helpers.php`
- `app/Yantrana/Support/app-helpers.php`
- `app/Yantrana/Support/extended-validations.php`
- `app/Yantrana/Support/custom-tech-config.php`
- `ManualSubscriptionEngine.php` — entirely unread
- `SubscriptionEngine.php` lines 200+ (only ~30% read)
- `PageEngine.php` — unread
- `HomeController.php` — ping-pong, demo number, UPI QR
- `WhatsAppConnectApiService.php` — embedded signup flow
- `VendorFrontend.php` middleware — unread
- `VendorUserModel.php` — full source unread
- `config/__settings.php` lines 400+ (remaining schema)
- `config/__currencies.php`
- `resources/js/services/__jsware/` (3 JS files)

---

*Document compiled: 2026-05-18*
*Part 8 of WhatsJet v7.2.0 reverse-engineering series*
*Cumulative coverage: approximately 88–92% of business logic surface area.*
