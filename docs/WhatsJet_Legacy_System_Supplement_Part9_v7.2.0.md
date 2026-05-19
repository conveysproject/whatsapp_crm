# WhatsJet Legacy System — Supplement Part 9
## Version 7.2.0 | app-helpers, custom-tech-config, Subscription Engines, HomeController, AuthController

> **Coverage:** `app-helpers.php` (complete), `extended-validations.php` (complete), `custom-tech-config.php` (complete), `ManualSubscriptionEngine.php` (complete), `SubscriptionEngine.php` (complete), `HomeController.php` (complete), `AuthController.php` (complete)
> **Methodology:** Direct PHP source file reading — exact behavior documented, no inference

---

## 1. `app-helpers.php` — Global Application Helper Functions

This file defines all core global functions. Loaded at boot via `AppServiceProvider`. Key discoveries:

### 1.1 Authentication Info (`getUserAuthInfo`)
- Reads from `viaFlashCache('user_auth_info', ...)` — flash-cached per request
- Calls `AuthModel::with('role', 'vendor')->find(Auth::id())`
- Role ID 3 (vendor user): additionally loads `VendorUserModel::where('users__id', ...)->first()`; reads `vendorId` from the VendorUserModel (not the user), and resolves `vendorUid` from VendorModel
- Returns flat array including: `permissions` from `$vendorUser->__data['permissions']`
- Permission values accessed via: `getUserAuthInfo("permissions.{$permission}")` (dot-path)

### 1.2 Role IDs
| Role ID | Role |
|---------|------|
| 1 | SuperAdmin (hasCentralAccess) |
| 2 | Vendor Admin (hasVendorAccess → unconditional true) |
| 3 | Vendor User (hasVendorUserAccess → needs permission check) |

### 1.3 `validateVendorAccess($permissions, $nestedPermission = null)`
- Supports array of permissions (OR logic — any match grants access)
- Calls `hasVendorAccess($permission, $nestedPermission)` per permission
- Uses `Gate::allowIf($hasAccess)` — throws AuthorizationException on deny

### 1.4 `hasVendorAccess($permission, $nestedPermission)`
- Role 2 (vendor admin) → always returns true (no permission check)
- Role 3 (vendor user): checks `permissions.{permission} === 'allow'`
- With nested: checks `permissions.{permission}@{nestedPermission}` — empty sub-permission defaults to allow
- Permission key format: `"parentKey@subKey"` (the `@` separator)

### 1.5 `getAppSettings($itemName)`
- Two paths: `autoload_exceptions` items fetched directly from DB; all others fetched via `viaFlashCache('app_setting_all', ...)`
- Data type casting from `data_type` field:
  - 1 = string, 2 = bool, 3 = int, 4 = JSON (decoded; decrypted first if `hide_value=true`), 6 = float
- Special virtual settings (not in DB, computed):
  - `logo_image_url`, `small_logo_image_url`, `favicon_image_url`
  - `dark_theme_logo_image_url`, `dark_theme_small_logo_image_url`, `dark_theme_favicon_image_url`
- Settings with `hide_value=true` are stored **encrypted** in DB; automatically decrypted on read

### 1.6 `getVendorSettings($itemName, $itemKeys, $otherItem, $forVendorIdOrUid)`
- Like `getAppSettings` but scoped to `vendors__id`
- Data cached via `viaFlashCache('vendor_setting_all_{vendorId}', ...)`
- Also stores vendor `logo_image`, `favicon_name`, `slug`, `title` from `VendorModel` in same cache
- Special virtual: `logo_image_url`, `favicon_image_url`
- Special key `country_code`: looks up `Country::iso_code` for `getVendorSettings('country')`
- Settings with `hide_value=true` stored encrypted; decrypted on read

### 1.7 `vendorPlanDetails($feature, $currentUsage, $vendor, $options)`
- Checks `getVendorCurrentActiveSubscription($vendorId)` first (checks Stripe then ManualSubscription)
- If no subscription and no `plan_id` override: uses free plan from `getFreePlan()`
- Feature limit `-1` = unlimited
- `currentUsage > featureLimitCount` = over limit (`is_limit_available = false`)
- Returns `SubscriptionPlanDetails` object with fields:
  - `has_active_plan`, `plan_type` (free/paid), `is_limit_available`
  - `plan_feature_limit`, `subscription_type` (free/auto/manual)
  - `frequency`, `ends_at`, `is_expired`, `is_expiring` (expiring within 7 days)
  - `plan_id`, `plan_key` = `{plan_id}___{frequency}`
- Expired paid plans: forces `is_limit_available=false`, `has_active_plan=false`

### 1.8 `getVendorCurrentActiveSubscription($vendorId)`
- First tries Stripe: `Subscription::query()->where('vendor_model__id', ...)->active()->first()`
- Falls back to: `ManualSubscriptionModel::where('vendors__id', ...)->where('status', 'active')->latest()->first()`
- Cached via `viaFlashCache('current_user_active_subscription_vendor_{vendorId}', ...)`

### 1.9 `isWhatsAppBusinessAccountReady($vendorIdOrUid)`
Requires ALL of these vendor settings to be set AND non-falsy:
- `facebook_app_id`
- `whatsapp_access_token`
- `whatsapp_business_account_id`
- `current_phone_number_number`
- `current_phone_number_id`
- `webhook_verified_at`
- `whatsapp_access_token_expired` must be **falsy**

### 1.10 `maskString($item, $itemType)`
- Phone masking: requires `hasVendorAccess('hide_contact_phone_numbers')` — shows first + last char with `*` in between
- Email masking: requires `hasVendorAccess('hide_contact_emails')` — masks username and domain separately
- Role 2 (vendor admin): no masking (returns raw value)

### 1.11 `dispatchVendorWebhook($vendorId, $payload)`
- Only fires if: plan has `api_access` feature AND `enable_vendor_webhook=true` AND `vendor_webhook_endpoint` is set
- Payload schema: `{ contact, message: { whatsapp_business_phone_number_id, whatsapp_message_id, replied_to_whatsapp_message_id, is_new_message, body, status, media }, whatsapp_webhook_payload }`
- Fires: `Http::post($vendorWebhookEndpoint, $payload)` — silently ignores all errors

### 1.12 Real-time Broadcast Helpers
- `updateModelsViaVendorBroadcast($vendorUid, $data)` → fires `VendorChannelBroadcast` with `eventModelUpdate => $data`
- `reloadViewViaVendorBroadcast($vendorUid)` → fires `VendorChannelBroadcast` with `reload => true`

### 1.13 `sendFCMNotification($vendorId, $title, $body, $data)`
- Gets device token via `UserDeviceRepository::fetchIt(['vendors__id' => $vendorId])` (one token per vendor)
- Gets OAuth token from `storage/app/service-account.json` via Google Client library
- FCM URL: `https://fcm.googleapis.com/v1/projects/{firebase_project_id}/messages:send`
- Auto-deletes device token from DB on errors: `INVALID_ARGUMENT`, `NOT_FOUND`, `UNREGISTERED`

### 1.14 `logSystemVendorChatMessage($contact, $action, $dynamicTitle)`
Writes system message to `whatsapp_message_logs`:
```php
[
    'status' => 'initialize',
    'is_system_message' => 1,
    'is_incoming_message' => 0,
    '__data' => [
        'system_message_data' => [
            'action' => $action,
            'dynamicKey' => '__dynamicTitle__',
            'dynamicValue' => $dynamicTitle
        ]
    ]
]
```

### 1.15 `getContactDataMaps()`
Returns merged array of: config-defined contact fields + custom fields (`contact_custom_field_{id} => input_name`)

### 1.16 `formatWhatsAppText($text)` — WhatsApp Markdown to HTML
- `*text*` → `<strong>text</strong>`
- `_text_` → `<em>text</em>`
- `~text~` → `<del>text</del>`
- ` ```text``` ` → `<code>text</code>`
- `` `text` `` → `<span class="badge badge-light">text</span>`
- YouTube URLs → embedded `<iframe>`
- Other URLs → `<a href>` link
- Email addresses → `<a href="mailto:">` link

### 1.17 `getPaidPlans()` / `getFreePlan()` / `getPlans()`
- Plans defined in `config('lw-plans')` as baseline
- Overridden/extended by `getAppSettings('subscription_plans')` (stored as JSON in DB)
- `arrayExtend()` merges DB values over config defaults
- `getPaidPlans()` validates features exist in config (removes extras added in DB); only includes plans whose `id` key matches `config('lw-plans.paid')`

### 1.18 `getPublicVendorSlug()`
- First tries `request()->route('vendorSlug')` route parameter
- Falls back to first URL segment if it starts with `@` (e.g., `/@ vendor-slug` → `vendor-slug`)

### 1.19 License Validation Functions
- `swaksharyipadtalni()`: checks `product_registration.registration_id` exists and validates `sha1(HTTP_HOST . registration_id . 'base64decoded-version')` against stored `product_registration.signature`
- `swaksharyipadtalniforadditionals($item)`: same for addon licenses (`lwAddon{item}` setting key)

### 1.20 `isMobileAppRequest()`
Checks: `request()->header('Api-Request-Signature') === 'mobile-app-request'`

### 1.21 `getDemoNumbersForTest($checkThisNumber, $returnString, $ignoreTestContact)`
- Combines: `__misc.demo_test_recipient_contact_number` + session `__demoAccountTestPhoneNumbers` + mobile request `demo_phone_numbers` header
- All sources deduplicated and filtered; strips leading `+` and `0` from numbers

---

## 2. `extended-validations.php` — Custom Validators

All registered via `Validator::extend()`. Used throughout request classes:

| Rule | Behavior |
|------|----------|
| `unique_title` | Slugifies value; checks `AccountModel::where('title', slug)` — undocumented legacy model |
| `check_disposable_email` / `indisposable` | POST to `https://disposable.debounce.io/?email={value}` (10s timeout); fails if `disposable !== 'false'`; on curl error returns false (blocks email) |
| `unique_email` | Checks `User::where('email', lowercase)->count() <= 0` (inverted logic — returns true if user NOT found, i.e. unique) |
| `domain` | Validates domain by prepending `http://` and using FILTER_VALIDATE_URL |
| `domains` | Comma-separated list of domains; each validated same as `domain`; supports `*.` wildcard prefix |
| `unique_subdomain` | Checks against `configItem('reserved_subdomains')` array |
| `amount_validation` | Amount max 9 digits before decimal; max value 999,999,999 |
| `decimal_validation` | Max 4 decimal places (configurable) |
| `ssh_public_key` | Delegates to `Utils::validatePublicKey()` |
| `old_password` | `Hash::check($value, $parameters[0])` |
| `string_contains` | `str_contains($value, $parameters[0])` |
| `validate_age` | Checks `configItem('age_restriction.minimum')` and `.maximum` in years |
| `unique_page_title` | Checks `PageModel` for duplicate title excluding current page UID |

---

## 3. `custom-tech-config.php` — Runtime Configuration

This file runs at boot (loaded in `AppServiceProvider`). It dynamically overrides Laravel config at runtime:

### Language/Locale
```php
if(isset($_GET['lang'])) changeAppLocale($_GET['lang']); else changeAppLocale();
date_default_timezone_set('UTC');
```
- App name: `config(['app.name' => getAppSettings('name')])`

### Pusher Configuration
Loaded if `broadcast_connection_driver` AND `pusher_app_id` are set:
- `broadcasting.connections.pusher.{app_id, key, secret, options.cluster}` from DB settings
- Soketi override (if driver is `'soketi'`): additionally sets `host`, `port`, `scheme`, `useTLS`, `encrypted`

### Stripe Configuration
If `enable_stripe` setting is true:
- Test mode (`use_test_stripe=true`): uses `stripe_testing_publishable_key`, `stripe_testing_secret_key`, `stripe_testing_webhook_secret`
- Live mode: uses `stripe_live_publishable_key`, `stripe_live_secret_key`, `stripe_live_webhook_secret`
- Always sets `cashier.currency_locale` from app locale

### Mail Configuration
If `use_env_default_email_settings` is false: overrides all mail config from DB:
- `mail.driver`, `mail.transport`, `mail.port`, `mail.host`, `mail.username`, `mail.encryption`, `mail.password`
- `mail.from.address`, `mail.from.name`
- SparkPost: `services.sparkpost.secret`
- Mailgun: `services.mailgun.domain`, `services.mailgun.secret`, `services.mailgun.endpoint`
- Sets `__misc.mail_from` to `[address, name]`

If `mail.from.address` is still empty after all of this: falls back to `getAppSettings('contact_email')`.

---

## 4. SubscriptionEngine — Stripe Cashier Wrapper

Full coverage. All methods:

### `subscriber($vendorUid)`
- Returns `VendorModel` (the Cashier customer) — cached in `$this->subscriber`
- Fetches via `vendorRepository->fetchIt($vendorUid ?? getVendorId())`

### `getCurrentPlan($planId, $withSubscription, $vendorId)`
- If no `planId`: calls `getVendorCurrentActiveSubscription()` to find active sub; reads `plan_id` (manual) or `type` (Stripe)
- Fetches from `getPaidPlans()` config array; verifies plan config contains the ID
- Returns plan array or `['subscription' => $sub, 'plan' => $plan]` if `$withSubscription=true`

### `prepareData()` — Subscription Page Setup
- Validates Stripe keys via `validateStripeApiKey()` (calls `Cashier::stripe()->accounts->retrieve()`)
- Creates/gets Stripe customer: `$subscriber->createOrGetStripeCustomer([name, email, address fields])`
- On Stripe exception: cancels current plan, nulls `stripe_id/trial_ends_at/pm_type/pm_last_four`, retries
- Returns: `intent`, `currentPlan`, `invoices`, `planSelectorId`, `subscriber`, `planDetails`, `freePlanDetails`, `isValidStripeKeys`, `existingManualSubscriptionPendingRequest`
- `planSelectorId` format: `{plan_id}___monthly` or `{plan_id}___yearly`

### `processCreate($request)` — New Stripe Subscription
- Parses `plan` as `{planId}___{frequency}` (e.g., `growth___monthly`)
- Reads `charges.{frequency}.price_id` from plan config
- Checks `dashboardEngine->checkPlanUsages()` before subscribing
- Calls `subscriber()->newSubscription($planId, $planPriceId)->trialDays($n)->allowPaymentFailures()->create($paymentMethod)`
- On `IncompletePayment`: redirects to `cashier.payment` route

### `processChangePlan($request)` — Swap Stripe Plan
- Same plan parse logic
- Calls `->subscription($currentPlanId)->allowPaymentFailures()->swap($newPriceId)`
- After swap: updates `type` field on subscription record to new plan ID (Cashier doesn't do this automatically)

### `processCancellation($vendorUid, $discardGracePeriod)` — Cancel
- `discardGracePeriod=false`: `->cancel()` (grace period remains)
- `discardGracePeriod=true`: `->cancelNow()` (immediate)

### `processResume()` / `processRedirectToBillingPortal()` / `processDownloadInvoice($invoiceId)`
- Standard Cashier delegates; billing portal redirects back to `subscription.read.show`

---

## 5. ManualSubscriptionEngine — 5 Payment Gateways

### Plan Selection Key Format
`{planId}___{frequency}` e.g., `growth___monthly` — parsed via `explode('___', $plan)`

### Subscription Status Flow
| Status | Meaning |
|--------|---------|
| `initiated` | Vendor started checkout, awaiting payment |
| `pending` | Manual payment — waiting admin approval |
| `active` | Active subscription |
| `cancelled` | Superseded by new subscription |

### `processManualPayPreparation($request)` — Core Checkout Setup
1. Parses `selected_plan`; fetches plan details and charges
2. Checks `dashboardEngine->checkPlanUsages()` for over-usage (blocks downgrade)
3. **Proration**: if existing active subscription with remaining days:
   - Daily charge = existing charges / days-in-period
   - Prorated balance = daily charge × remaining days
   - New end date extended by `floor(prorated / daily-rate-of-new-plan)` days
   - Max year cap: `Carbon::create(9999, 12, 31, 23, 59, 59)`
4. Deletes any existing `initiated` request for vendor; re-uses existing `pending` request
5. Creates new `initiated` record in `manual_subscriptions`
6. Payment-method-specific:
   - `paypal`: calls `paypalEngine->paypalOrderCreate()` → returns `createPaypalOrder.id`
   - `phonepe`: calls `phonePeEngine->initiatePayment()` → returns `phonePeInitiateData`
   - UPI: builds UPI deep link via `createUpiLink()` → encodes as QR via route `vendor.generate.upi_payment_request`
7. Returns all payment data to frontend

### `recordSentPaymentDetails($request)` — Universal Payment Confirmation
Called by ALL payment gateways after capture. Input must have:
- `manual_subscription_uid`
- `txn_reference`

Auto-payment gateways (PayPal, Razorpay, Paystack, YooMoney, PhonePe):
- Cancels all existing `active` subscriptions → sets to `cancelled`
- Updates record to `status=active`, stores `txn_reference` and `txn_date` in `__data.manual_txn_details`

Manual bank transfer:
- Sets record to `status=pending` (awaiting admin approval)
- Sends email to admin via `BaseMailer::notifyAdmin()` with mail key `manual-subscription-request`
- Email goes to `getAppSettings('contact_email')`

Duplicate check: blocks if `__data->manual_txn_details->txn_reference` already exists for vendor.

### `processManualSubscriptionCreate($request)` — Admin Creates Subscription
- Cancels all existing active subscriptions → new one goes directly to `status=active`

### Payment Gateway Methods
| Method | Gateway | Flow |
|--------|---------|------|
| `processCapturePaypalOrder` | PayPal | `paypalEngine->paypalCaptureOrder()` → `recordSentPaymentDetails()` |
| `processRazorpayCheckout` | Razorpay | `razorpayEngine->capturePayment()` → `recordSentPaymentDetails()` |
| `handleOrderPaymentRazorPayWebhook` | Razorpay | Webhook; checks `captured == true` |
| `processCheckoutPaystack` | Paystack | `paystackEngine->capturePaystackPayment()` |
| `handleOrderPaymentPaystackWebhook` | Paystack | Checks `status == "success"` |
| `processCheckoutYooMoney` | YooMoney | `yoomoneyEngine->captureYoomoneyPayment()` |
| `processCaptureYooMoney` | YooMoney | Two-step: checkout then capture via stored `txn_data` |
| `handleOrderPaymentYoomoneyWebhook` | YooMoney | Checks `status == "succeeded"` |
| `processPhonePeCapturePayment` | PhonePe | Checks `state == 'COMPLETED'`/`'PENDING'`/`'FAILED'` |

---

## 6. HomeController

### Routes Handled
| Method | Description |
|--------|-------------|
| `homePageView()` | Redirects to `other_home_page_url` setting if set; else loads `current_home_page_view` setting (view name) |
| `contactProcess()` | Validates `email|full_name|subject|message`; optionally `indisposable`; delegates to `homeEngine->processContactEmail()` |
| `viewTermsAndPolicies($contentName)` | Validates `$contentName` in `[user_terms, vendor_terms, privacy_policy]`; renders terms-policies view |
| `generateWhatsAppQR($vendorUid, $phoneNumber)` | Generates QR for `https://wa.me/{phoneNumber}` with WhatsApp logo overlay |
| `generateUrlQR($upiAddress, $logo)` | `endroid/qr-code` library; 300px, low error correction, `Margin` round mode; outputs PNG directly via `header('Content-Type: image/png')` |
| `generateUpiPaymentUrl($request)` | Decodes base64 `url` param → calls `generateUrlQR()` |
| `serverCompiledJs()` | Returns `server-compiled-js` view as `text/javascript` |
| `pingPong()` | Returns `processResponse(1)` — simple health check |
| `customStyles()` | Returns `custom-styles` view as `text/css` |

### `registerNumberForDemo($request)` — Demo Mode Phone Registration
- Validates `demo_phone_numbers` (required, comma-separated)
- Each number: must be numeric, min 9 digits
- Cleans with `cleanDisplayPhoneNumber()` (strips non-digits and leading zeros)
- For each number: upserts contact in DB (`contactRepository->storeContact`) if not exists
- Sends template message to each contact if `__misc.demo_template_uid` is set
- Saves collected numbers to session `__demoAccountTestPhoneNumbers`

---

## 7. AuthController — HTTP Layer for Auth

### Login Flow (`processLogin(LoginRequest, RedirectIfTwoFactorAuthenticatable)`)
1. Calls `authEngine->processLogin($request)`
2. If success:
   - User status `0` or falsy → logout + redirect to login with "account not active" message
   - User status `4` → logout + "not activated yet, check email" message
   - 2FA enabled (`two_factor_secret` set AND `two_factor_confirmed_at` non-empty):
     - Logs out
     - Calls `$twoFactorRedirect->handle($request, $currentUser)` (Fortify)
     - Redirects to `auth.two_factor_challenge.view`
   - Otherwise → redirect to `central.console` (role 1), `vendor.console` (role 2/3), or `home`
3. Registration check: `getAppSettings('enable_vendor_registration')` → returns error if false

### Password Reset Flow
- `processForgotPasswordRequest`: validates `email: required|email`; delegates to engine
- `processPasswordReset`: validates `token|email|password:confirmed|min:8`; engine handles actual reset

### Password Update (Authenticated)
- Rules: `old_password: required|min:6|CurrentPasswordCheckRule`, `password: required|min:6|confirmed|different:old_password`

### Social Login Implementation
Both Google and Facebook follow same pattern:
1. Read `{provider}_client_id` and `{provider}_client_secret` from DB settings at call time (not from `.env`)
2. Set `services.{provider}.redirect` to named callback route
3. `Socialite::driver('{provider}')->redirect()` / `Socialite::driver('{provider}')->user()`
4. Delegates to `authEngine->processCreateSocialCallBack($provider)`
5. On deny (`error=access_denied`): redirect to login page

### 2FA Challenge (`verifyTwoFactorAuthentication`)
- `verify_via`: must be `code` or `recovery_code`
- For `code`: validates `code: required|min:6`
- For `recovery_code`: validates `recovery_code: required`
- Delegates to `authEngine->processVerifyTwoFactorAuthentication($request)`

### Registration
- `register()`: uses `RegisterRequest` for validation; delegates to `authEngine->processRegistration()`
- `activationRequiredRegister()`: alternate flow that sends email activation

### Email Verification
- `verifyEmail()`: uses Laravel's `EmailVerificationRequest`; fires `Verified` event on success
- `emailVerificationNotification()`: resends verification email

---

## 8. Updated Coverage Map

### Files Read In This Session (Part 9)
| File | Status |
|------|--------|
| `app/Yantrana/Support/app-helpers.php` | ✅ 100% |
| `app/Yantrana/Support/extended-validations.php` | ✅ 100% |
| `app/Yantrana/Support/custom-tech-config.php` | ✅ 100% |
| `app/Yantrana/Components/Subscription/ManualSubscriptionEngine.php` | ✅ 100% |
| `app/Yantrana/Components/Subscription/SubscriptionEngine.php` | ✅ 100% |
| `app/Yantrana/Components/Home/Controllers/HomeController.php` | ✅ 100% |
| `app/Yantrana/Components/Auth/Controllers/AuthController.php` | ✅ 100% |

### ⚠️ Remaining Gaps (Prioritized)
| File | Priority | Notes |
|------|----------|-------|
| Payment engines (PaypalEngine, RazorpayEngine, PaystackEngine, YoomoneyEngine, PhonePeEngine) | High | 5 payment gateway implementations |
| `app/Yantrana/Components/User/Support/permissions.php` | High | Full permission tree — critical for access control |
| `VendorUserModel.php` | High | Vendor-user membership; permission storage |
| `WhatsAppConnectApiService.php` | High | Embedded signup / WhatsApp account connection |
| All ~15 Repository files | Medium | Query layer only — no business logic |
| `PageEngine.php` | Medium | Static page management |
| Remaining Controller files (~13) | Low | Thin HTTP delegates |
| `config/__settings.php` lines 400+` | Medium | Remaining settings page schemas |
| `config/__currencies.php` | Low | Currency data table |
| `resources/js/services/__jsware/` (3 JS files) | Low | Frontend service layer |

---

*Document compiled: 2026-05-18*
*Part 9 of WhatsJet v7.2.0 reverse-engineering series*
*Cumulative coverage: approximately 93–95% of business logic surface area.*
