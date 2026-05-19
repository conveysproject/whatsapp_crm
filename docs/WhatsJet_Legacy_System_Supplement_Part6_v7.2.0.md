# WhatsJet Legacy System — Supplement Part 6
## Version 7.2.0 | Source Documentation Reference

> **Coverage:** Remaining Engine files, all core Models, Config completions, Route registry, Broadcast channels  
> **Methodology:** Direct PHP source file reading — exact behavior documented, no inference  
> **Prior Parts:** Part 1–5 cover DB schema (46 tables), WhatsAppServiceEngine (~4200 lines), WhatsAppApiService, CampaignEngine, BotReplyEngine, ContactEngine, AuthEngine, VendorSettingsEngine, WhatsAppTemplateEngine, DashboardEngine, all 5 middleware, config/__settings.php, config/__tech.php, config/__vendor-settings.php (offsets 1–400)

---

## 1. UserEngine (`app/Yantrana/Components/User/UserEngine.php`)

### Dependencies
- `UserRepository` — user CRUD
- `UserDeviceRepository` — push notification tokens
- `BaconQrCode` library — SVG QR code generation

### 2FA QR Code (`prepare2FAQrCode()`)
- Fetches user by `getUserID()`
- Only generates QR if `user->two_factor_secret` is set
- Calls `$user->twoFactorQrCodeUrl()` (Laravel Fortify)
- Uses `BaconQrCode` with `RendererStyle(500)` and `SvgImageBackEnd`
- Returns `{ qrCodeSvg: '<svg>...' }` or empty string if 2FA not enabled

### 2FA Confirm (`process2FAuthenticationConfirm($inputData)`)
- Requires `confirm_code` in inputData
- Calls `$user->verifyTwoFactorAuth($code)` — Fortify TOTP check
- On success: sets `two_factor_confirmed_at = now()`
- Failure: `__tr('Entered code is invalid.')` (reaction code stays 2)

### Profile Update (`processUpdateProfile($requestData)`)
- Delegates to `$userRepository->updateLoggedInUserProfile()`
- Success: reaction 21 + `{ reloadPage: true }`
- Nothing to update: reaction 14

### User Datatable (`prepareUserDataTableSource()`)
- Masked columns: `email` → `maskString(email, 'email')`, `mobile_number` → `maskString(mobile, 'phone')`
- Status: 0 → 'Inactive'; all others → `configItem('status_codes', status)`
- Returns: `_id`, `_uid`, `first_name`, `last_name`, `username`, `email`, `mobile_number`, `status`, `user_roles__id`, `user_role` (from `role.title`), `created_at` (formatted)

### User Delete (`processUserDelete($userIdOrUid)`)
- Checks `isVendorUser($user->_id, $vendorId)` — rejects cross-vendor
- Reaction 18 if not found, 1 if deleted, 2 if failed

### Login As Team Member (`processLoginAs($userIdOrUid)`)
- Demo guard: `isDemo() and isDemoVendorAccount()` → disabled
- Cross-vendor check via `isVendorUser()`
- Cannot login as yourself (if `$user->_id == getUserID()`)
- Stores `session(['loggedByVendor' => ['id' => getUserID(), 'name' => fullName]])`
- Calls `Auth::loginUsingId($user->_id)`
- Success message: `"Welcome, you are logged as __userName__ successfully."`

### Logout As Team Member (`processLogoutAs()`)
- `Auth::logout()` then `Auth::loginUsingId(session('loggedByVendor.id'))`
- Preserves `loggedBySuperAdmin` session if present
- Forgets `loggedByVendor` session key

### User Create (`processUserCreate($inputData)`)
- Checks `vendorPlanDetails('system_users', countVendorUsers, vendorId)` for plan limits
- Hardcodes `status = 1` (Active) and `user_roles__id = 3` (vendor agent)
- Permission model: for each key in `getListOfPermissions()`:
  - If present in `inputData['permissions']`: `'allow'`; sub-permissions checked individually
  - Sub-permission key format: `"parentKey@subKey"` → 'allow' or 'deny'
  - If absent: `'deny'` for parent and all sub-permissions
- Calls `$userRepository->storeUser($inputData, true)`

### User Update (`processUserUpdate($userIdOrUid, $request)`)
- Validates email uniqueness ignoring current user's own email
- Updates: `first_name`, `last_name`, `mobile_number`, `email`, `status` (via `formSwitchValue()`), optionally `password`
- Permission logic identical to create
- Calls `$userRepository->updateUser($user, $updateData, $inputData)`

### Store Device Token (`processStoreUserDeviceToken($inputData)`)
- Checks if `device_token` already exists for this user (by `device_token + users__id`)
- Returns reaction 2 (silently) if already exists
- Stores via `userDeviceRepository->storeIt()`

---

## 2. VendorEngine (`app/Yantrana/Components/Vendor/VendorEngine.php`)

### Dependencies
- `VendorRepository`, `AuthRepository`, `UserRepository`, `MediaEngine`

### Vendor Datatable (`prepareVendorDataTableList()`)
- Demo mode masking: `fullName`, `email`, `mobile_number`, `username` all masked via `maskForDemo()`
- Returns: `_id`, `_uid`, `title`, `created_at`, `fullName`, `status` (text), `status_code` (int), `user_status` (text), `email`, `mobile_number`, `username`, `userId`, `slug`

### Get Basic Settings (`getBasicSettings($vendorUid)`)
- Returns: `title`, `id`, `uid`, `slug`, `status`, `logo_image`, `logo_url`
- `logo_url` = `getVendorSettings('logo_image_url')`
- If vendor not found: all fields null except structure preserved

### Page Info (`pageInfo($pageSlug)`)
- Converts slug via `str_slug($pageSlug, '_')`
- Only 2 pages allowed: `info_terms_and_conditions`, `info_refund_policy`
- Returns `{ pageId, pageData }` or `abort(404)`

### Vendor Delete (Soft) (`prepareVendorDelete($vendorIdOrUid)`)
- Status 5 = soft deleted; checks if already status 5
- Sets `status = 5` on vendor (user soft delete commented out)
- Uses DB transaction via `authRepository->processTransaction()`

### Vendor Update (`processVendorUpdate($inputData)`)
- Updates vendor: `title`, `status` (via `formSwitchValue('store_status')`)
- Updates user: `first_name`, `last_name`, `username`, `email`, `mobile_number`, `status`
- Both updates can succeed independently (OR logic)

### Password Change (`prepareVendorPasswordData($inputData)`)
- SuperAdmin-side password change for vendor users
- Returns full user array

---

## 3. ConfigurationEngine (`app/Yantrana/Components/Configuration/ConfigurationEngine.php`)

### Dependencies
- `ConfigurationRepository`, `MediaEngine`, `WhatsAppConnectApiService`

### Prepare Configurations (`prepareConfigurations($pageType)`)
- Reads from `config('__settings.items.{pageType}')`
- DB values cast via `$this->castValue(data_type, value)`
- Page-specific additions:
  - `general`: adds `timezone_list`, `languageList` (English always first), active languages from `translation_languages` setting
  - `currency`: adds `currencies` (from `__currencies`) and `currency_options`
  - `premium-plans`: merges default `plan_duration` with DB values via `combineArray()`
  - `premium-feature`: merges default `feature_plans` with DB values
  - `email`: adds `mail_drivers` and `mail_encryption_types` from `__tech`
  - `user`: adds `admin_choice_display_mobile_number` from `__tech`

### Store Configurations (`processConfigurationsStore($pageType, $inputData)`)
- Keys absent from `$inputData` are skipped (no blank wipe)
- `ignore_empty: true` setting: skips items where value is empty AND key doesn't start with `enable_` or `allow_`
- `hide_value: true` fields: encrypted via `encrypt()` before storage (unless value empty)
- **License Enforcement:**
  - `getAppSettings('product_registration', 'licence') === 'dee257a8c3a2656b7d7fbe9a91dd8c7c41d90dc9'` = Extended License check
  - Stripe live keys (`stripe_live_secret_key`, `stripe_live_publishable_key`) require extended license
- **Stripe Key Validation:**
  - Test keys must contain `'_test_'`; live keys must contain `'_live_'`
  - Error: `'Only test keys are accepted.'` / `'Only live keys are accepted.'`
- **Payment Gateway Conflict:**
  - Cannot enable Razorpay subscription addon if Stripe already enabled (and vice versa)
  - Error message from `configItem('razorpay_enable_warning_message')`
- **Embedded Signup:**
  - When `embedded_signup_app_id`, `embedded_signup_app_secret`, `embedded_signup_config_id` are set:
  - Calls `$whatsAppConnectApiService->connectBaseWebhook(appId, appSecret)`
  - If webhook registration fails: returns error `'Failed to register Webhook.'`
- Data type 4 (JSON) is encoded with data_type=5 for storage (encode-only purpose)

---

## 4. MediaEngine (`app/Yantrana/Components/Media/MediaEngine.php`)

### Storage Driver
- Uses `YesFileStorage` facade with `config('filesystems.default', 'public-media-storage')`
- Element config loaded from `config('yes-file-storage.element_config')`

### Upload Methods (all delegate to `processUpload()`)
| Method | Path Key | Special |
|--------|----------|---------|
| `processUploadLogo` | `logo` | — |
| `processUploadDarkThemeLogo` | `dark_theme_logo` | — |
| `processUploadSmallLogo` | `small_logo` | — |
| `processUploadDarkThemeSmallLogo` | `dark_theme_small_logo` | — |
| `processUploadFavicon` | `favicon` | — |
| `processUploadDarkThemeFavicon` | `dark_theme_favicon` | — |
| `processVendorUpload` | varies | Validates `$requestFor` in `$allowedItems`; path uses `{_uid}=getVendorUid()` |
| `processUploadProfile` | `profile_photo/{_uid}` | Resize to 360×360 |
| `processUploadCoverPhoto` | `cover_photo/{_uid}` | Resize to 820×312 |
| `whatsappMediaUploadProcess` | `$requestFor/{_uid}` | Resize with no fixed dimensions |

### Download and Store Incoming Media (`downloadAndStoreMediaFile($fileValue, $vendorUid, $mediaType)`)
- Accepts `media_url` key or raw `body` binary
- If no `mime_type`, reads from HTTP `Content-Type` header
- MIME → extension mapping (complete list in source):
  - audio: aac→aac, mp4→m4a, mpeg→mp3, amr→amr, ogg→ogg
  - video: mp4→mp4, 3gp→3gp, mpeg→mpeg
  - images: jpeg→jpg, png→png, gif→gif, webp→webp
  - documents: pdf, txt, ppt, doc, xls, docx, xlsx, pptx, zip
- Stored at `getPathByKey("whatsapp_{$mediaType}", ['{_uid}' => $vendorUid])`
- Uses temp folder `user_temp_uploads/{_uid}` for intermediate write
- Returns `$storedInfo->data()` on success (array with file path info)
- On exception: deletes both temp and permanent files if they exist; returns empty array

---

## 5. TranslationEngine (`app/Yantrana/Components/Translation/TranslationEngine.php`)

### Dependencies
- `ConfigurationRepository`, `MediaEngine`
- Libraries: `gettext/gettext` (PHP Gettext), `Gettext\Loader\PoLoader`, `Gettext\Scanner\PhpScanner`, `Unn\GettextBlade\Scanner\Blade` (Blade scanner), `XLSXWriter`, `Box\Spout`

### Language Storage
- All languages stored as JSON in `configuration` table under key `'translation_languages'`
- Format: `{ languageId: { id, name, status, created_at, updated_at, is_rtl } }`

### Store Language (`processStoreLanguage($inputData)`)
- Input: `language_id`, `language_name`, `is_rtl` (string 'true'/'false'), `auto_translate`
- On first language: creates new record; otherwise JSON-merges with existing
- Always runs `$this->scan($languageId)` after storing
- If `auto_translate == 'microsoft'`: calls `processTranslatePoFile('microsoft', $languageId)`

### Update Language (`processUpdateLanguage($inputData)`)
- Updates `name`, `is_rtl`, `status` for key `$inputData['form_key']`
- Delete-then-reinsert pattern for the configuration record

### Delete Language (`processDeleteLanguage($languageId)`)
- Removes from JSON, delete-then-reinsert
- Deletes locale directory: `base_path('locale/' . $languageId)`

### Scan (`scan($languageId)`)
- Scans all PHP + Blade files to extract translatable strings
- Writes/updates `.po` file at `base_path('locale/{languageId}/messages.po')`

### List (`lists($languageId)`)
- Creates `.po` file via `scan()` if not exists
- Returns `{ translations: PoTranslations, languageInfo: array }`

---

## 6. Models — Complete Inventory

### `WhatsAppMessageLogModel` (table: `whatsapp_message_logs`)
**JSON columns inside `__data`:**
| Field | Type |
|-------|------|
| `contact_data` | array |
| `initial_response` | array |
| `media_values` | array |
| `template_proforma` | array |
| `template_components` | array |
| `template_component_values` | array |
| `webhook_responses` | array:extend |
| `options` | array:extend |
| `interaction_message_data` | array:extend |
| `other_message_data` | array:extend |
| `system_message_data` | array |
| `campaign_type` | string |
| `preset_message_id` | string |
| `send_message_via_marketing_message_api` | boolean |

**Casts:** `__data→array`, `timestamp→datetime`, `messaged_at→datetime`, `is_incoming_message→integer`

**Appended Attributes:**
- `formatted_message_time`: `formatDateTime(messaged_at, null, vendors__id)`
- `formatted_message_ago_time`: `formatDiffForHumans(messaged_at, 6, vendors__id)` (6 = precision)
- `formatted_updated_time`: `formatDateTime(updated_at, null, vendors__id)`
- `whatsapp_message_error`: Reads from `webhook_responses.failed.0.changes.0.value.statuses.0.errors.0.error_data.details` OR `webhook_responses.incoming.0...messages.0.errors.0.error_data.details`; if message type is `'unsupported'`, appends unsupported sub-type; if status is `delivered/read/played` AND type is not `unsupported` → returns empty string

### `WhatsAppMessageQueueModel` (table: `whatsapp_message_queue`)
**JSON columns inside `__data`:**
| Field | Type |
|-------|------|
| `process_response` | array:extend |
| `contact_data` | array:extend |
| `campaign_data` | array:extend |
| `expiry_at` | string |
| `campaign_type` | string |
| `preset_message_id` | string |

**Casts:** `__data→array`, `scheduled_at→datetime`, `status→integer`, `retries→integer`, `__data->expiry_at→datetime`
**Fillable:** `['status']` only

**Appended Attributes:**
- `whatsapp_message_error`: Reads `process_response.error_message`; replaces string `'Recipient phone number not in allowed list  Recipient'` → `'Recipient'` (deduplication fix)
- `formatted_updated_time`: `formatDateTime(updated_at, null, vendors__id)`
- `formatted_scheduled_time`: `formatDiffForHumans(scheduled_at, null, vendors__id)`

### `WhatsAppTemplateModel` (table: `whatsapp_templates`)
**JSON columns:** `__data.template` → array:extend
**Casts:** `__data→array`

### `ContactModel` (table: `contacts`)
**JSON columns inside `__data`:**
| Field | Type |
|-------|------|
| `contact_notes` | string |
| `contact_metadata` | array:extend |
| `is_blocked` | boolean |
| `past_ai_summary` | string |

**Casts:** `messaged_at→datetime`, `unread_messages_count→integer`, `disable_ai_bot→integer`, `wa_id→string`, `__data→array`
**Max datatable result:** 500 rows

**Appended Attributes:**
- `full_name`: `first_name . ' ' . last_name`
- `name_initials`: first char of first word + first char of last word

**Relationships:**
- `groups()`: HasManyThrough via `GroupContactModel` → `ContactGroupModel` (pivot: `contacts__id`, `contact_groups__id`)
- `labels()`: HasManyThrough via `ContactLabelModel` → `LabelModel` (pivot: `contacts__id`, `labels__id`)
- `valueWithField()`: HasMany `ContactCustomFieldValueModel` with eager `customField`
- `customFieldValues()`: HasMany `ContactCustomFieldValueModel`
- `country()`: BelongsTo `Country` on `countries__id`; filters out `phone_code = 0` or null
- `lastMessage()`: HasOne `WhatsAppMessageLogModel` ordered by `messaged_at` desc
- `lastIncomingMessage()`: HasOne `WhatsAppMessageLogModel` where `is_incoming_message = 1`, latest
- `lastUnreadMessage()`: HasOne where `status = 'received'` and `is_incoming_message = 1`
- `unreadMessages()`: HasMany where `status = 'received'` and `is_incoming_message = 1`
- `assignedUser()`: HasOne `AuthModel` on `assigned_users__id`

**Other:** `scopeWithoutColumn($query, $ignoreColumns)` — selects all columns except listed ones using `Schema::getColumnListing()`

### `ContactGroupModel` (table: `contact_groups`)
Minimal model — no JSON columns, no relationships defined

### `CampaignModel` (table: `campaigns`)
**JSON columns inside `__data`:**
| Field | Type |
|-------|------|
| `total_contacts` | integer |
| `is_all_contacts` | boolean |
| `is_for_template_language_only` | boolean |
| `selected_groups` | array:extend |
| `expiry_at` | string |
| `campaign_type` | string |
| `preset_message_id` | string |
| `preset_message_name` | string |
| `send_message_via_marketing_message_api` | boolean |

**Casts:** `scheduled_at→datetime`, `__data→array`

**Relationships:**
- `messageLog()`: HasMany `WhatsAppMessageLogModel` on `campaigns__id`
- `queueMessages()`: HasMany `WhatsAppMessageQueueModel` on `campaigns__id`
- `queuePendingMessages()`: HasMany where `status = 1`
- `queueProcessingMessages()`: HasMany where `status = 3`
- `queueFailedMessages()`: HasMany where `status = 2`

### `BotReplyModel` (table: `bot_replies`)
**JSON columns inside `__data`:**
| Field | Type |
|-------|------|
| `interaction_message` | array:extend |
| `media_message` | array:extend |
| `template_message` | array:extend |
| `bot_actions` | array:extend |

**Casts:** `__data→array`, `status→integer`

**Relationship:** `botFlow()` BelongsTo `BotFlowModel` on `bot_flows__id`

### `VendorModel` (table: `vendors`)
- Uses Laravel Cashier `Billable` trait (Stripe customer)
- Casts: `trial_ends_at→datetime`, `ends_at→datetime`

### `VendorSettingsModel` (table: `vendor_settings`)
- Minimal model — no casts, no relationships

---

## 7. Config — Remaining Sections

### `config/__vendor-settings.php` — Continuation (offsets 400–619)

**`whatsapp_cloud_api_setup` remaining fields:**
| Key | Type | Notes |
|-----|------|-------|
| `whatsapp_phone_numbers` | json | Phone number list; ignore_empty=true |
| `current_phone_number_number` | string | hide_value=true; ignore_empty=true |
| `current_phone_number_id` | string | hide_value=true; ignore_empty=true |
| `marketing_messages_onboarding_status` | string | hide_value=true; ignore_empty=true |
| `template_analytics_status` | string | hide_value=true; ignore_empty=true |
| `webhook_verified_at` | string | required; ignore_empty=true |
| `webhook_messages_field_verified_at` | string | required; ignore_empty=true |
| `whatsapp_onboarding_raw_data` | json | internal use; ignore_empty=true |
| `whatsapp_phone_numbers_data` | json | internal use; ignore_empty=true |
| `whatsapp_token_info_data` | json | internal use; ignore_empty=true |
| `embedded_setup_done_at` | string | internal; ignore_empty=true |
| `test_recipient_contact` | string | required; numeric |
| `enable_whatsapp_calling` | boolean | ignore_empty=true |

**`language-settings` page:**
- `translation_languages` — json; all languages for this vendor

**`vendor_webhook` page:**
| Key | Type | Default |
|-----|------|---------|
| `enable_vendor_webhook` | boolean | false |
| `vendor_webhook_endpoint` | string | '' | Required if `enable_vendor_webhook=on`; URL validation |

**`internals` page (non-UI, internal use only):**
| Key | Type | Notes |
|-----|------|-------|
| `whatsapp_access_token_expired` | boolean | Set by API expiry detection |
| `whatsapp_health_status_data` | json | Health check cache |
| `is_disabled_message_sound_notification` | boolean | Per-user preference |
| `vendor_api_access_token` | string | hide_value=true; API bearer token |
| `contacts_import_process_data` | json | Import progress tracking |
| `whatsapp_display_name` | string | Cached display name |
| `contact_advance_filter_data` | json | Saved filter state per user |

### `config/yes-token-auth.php` — JWT Configuration
```
refresh_after:              60 * 50  = 3000 seconds (50 minutes) for web
expiration:                 60 * 60 * 3 * 50 = 9000 seconds (2.5 hours) for web
refresh_after_for_mobile:   24 * 60 * 60 * 7 = 604800 seconds (7 days)
expiration_for_mobile:      24 * 60 * 60 * 10 = 864000 seconds (10 days)
verify_user_agent:          true
verify_ip_address:          false
token_registry.enabled:     false
```

### `config/yes-file-storage.php` — Element Restrictions
**Upload type → allowed MIME types and extensions:**
| Element | MIME Types | Extensions |
|---------|-----------|-----------|
| `logo` | image/png, image/svg, image/svg+xml | png, svg |
| `small_logo` | image/png, image/svg, image/svg+xml | png, svg |
| `favicon` | image/ico, image/vnd.microsoft.icon, image/png | png, ico |
| `dark_theme_*` | Same as light variants | Same |
| `profile` | jpg, jpeg, png, gif, svg | jpg, png, jpeg, svg, gif |
| `whatsapp_image` | image/jpeg, image/png | jpg, png, jpeg |
| `whatsapp_sticker` | image/webp | webp |
| `whatsapp_video` | video/mp4, video/3gp | mp4, 3gp |
| `whatsapp_audio` | aac, mp4, mpeg, amr, ogg, webm variants | aac, m4a, mp4, mp3, mpga, amr, ogg, oga, webm |
| `whatsapp_document` | txt, pdf, ppt, doc, xls, docx, xlsx, pptx, xml types | txt, pdf, ppt, pps, doc, xls, docx, xlsx, pptx, xml |
| `vendor_logo` | image/png, image/svg, image/svg+xml | png, svg |
| `vendor_favicon` | image/ico, image/png | png, ico |
| `vendor_contact_import` | text/csv + many fallback CSV MIME types | csv only |
| `addon_upload_file` | application/zip variants | (zip only) |

**Storage paths (base: `media-storage/`):**
```
users-temp-uploads/
  (root)/             → vendor_temp_uploads
  {_uid}/temp_uploads → user_temp_uploads
logo/                 → logo
small_logo/           → small_logo
favicon/              → favicon
dark_theme_*/         → dark_theme_*
vendors/
  (root)/             → vendor_media
  {_uid}/
    (root)/           → vendor
    logo/             → vendor_logo
    small_logo/       → vendor_small_logo
    favicon/          → vendor_favicon
    whatsapp_media/
      images/         → whatsapp_image
      ...
```

### `config/__misc.php`
| Key | Source | Default |
|-----|--------|---------|
| `force_https` | env('FORCE_HTTPS') | false |
| `mail_from` | env('MAIL_FROM_ADD', 'your@domain.com'), env('MAIL_FROM_NAME', 'E-Mail Service') | array |
| `ngrok_url` | env('NGROK_URL') | '' |
| `demo_protected_bots` | env('DEMO_PROTECTED_BOTS') | '' |
| `demo_test_recipient_contact_number` | env('DEMO_TEST_RECIPIENT_CONTACT_NUMBER') | '' |
| `demo_template_uid` | env('DEMO_TEMPLATE_UID') | 0 |
| `storage_base_folder` | env('STORAGE_BASE_FOLDER') | '' |
| `lw_internal_debug` | env('LW_INTERNAL_DEBUG') | false |

---

## 8. Route Registry

### `routes/auth.php` — Authentication Routes (prefix: `/auth`)

**Guest-only routes:**
| Method | Path | Route Name | Action |
|--------|------|-----------|--------|
| GET | `/auth/two-factor-challenge-view` | `auth.two_factor_challenge.view` | 2FA challenge page |
| GET | `/auth/two-factor-challenge-recovery-view` | `auth.two_factor_recovery.view` | 2FA recovery page |
| GET | `/auth/login` | `auth.login` | Login page |
| POST | `/auth/login` | `auth.login.process` | Login process |
| GET | `/auth/forgot-password` | `auth.password.request` | Forgot password page |
| POST | `/auth/forgot-password` | `auth.password.request.process` | Send reset link |
| GET | `/auth/reset-password/{token}` | `auth.password.reset` | Reset password page |
| POST | `/auth/reset-password` | `auth.password.reset.process` | Reset password process |
| GET | `/auth/register/vendor` | `auth.register` | Registration page |
| POST | `/auth/register/vendor` | `auth.register.process` | Register vendor |
| POST | `/auth/register/vendor/activation` | `activation_required.auth.register.process` | Activation-required register |
| GET | `/auth/{userUid}/account-activation` | `user.account.activation` | Activate account |
| GET | `/auth/login-google/redirect` | `login.google` | Google OAuth redirect |
| GET | `/auth/login/callback/google` | `login.google.callback` | Google OAuth callback |
| GET | `/auth/login-facebook/redirect` | `login.facebook` | Facebook OAuth redirect |
| GET | `/auth/login/callback/facebook` | `login.facebook.callback` | Facebook OAuth callback |

**Authenticated routes (throttle: 6/minute):**
| Method | Path | Route Name | Action |
|--------|------|-----------|--------|
| GET/POST | `/auth/confirm-password` | `auth.password.confirm` | Confirm password |
| POST | `/auth/logout` | `auth.logout` | Logout |
| GET | `/auth/verify-email` | `verification.notice` | Email verification prompt |
| GET | `/auth/verify-email/{id}/{hash}` | `verification.verify` | Verify email (signed URL) |
| POST | `/auth/email/verification-notification` | `verification.send` | Resend verification |
| POST | `/auth/update-password` | `auth.password.update.process` | Update password |

### `routes/api.php` — External Vendor API Routes (prefix: `/{vendorUid}/`, middleware: `api.vendor.authenticate`)

All external API routes use Bearer token or `?token=` query parameter authentication.

| Method | Path | Route Name | Action |
|--------|------|-----------|--------|
| POST | `/{uid}/contact/send-message` | `api.vendor.chat_message.send.process` | Send chat message |
| GET | `/{uid}/contact/message-status` | `api.vendor.chat_message.read.status` | Get message status |
| POST | `/{uid}/contact/send-media-message` | `api.vendor.chat_message_media.send.process` | Send media message |
| GET | `/{uid}/contact/template-list` | `api.vendor.template_list.read.list` | List templates |
| POST | `/{uid}/contact/send-template-message` | `api.vendor.chat_template_message.send.process` | Send template message |
| POST | `/{uid}/contact/send-carousel-template-message` | `api.vendor.chat_carousel_template_message.send.process` | Send carousel template |
| POST | `/{uid}/contact/send-interactive-message` | `api.vendor.chat_message_interactive.send.process` | Send interactive message |
| POST | `/{uid}/contact/create` | `api.vendor.contact.create.process` | Create contact |
| POST | `/{uid}/contact/update/{phoneNumber}` | `api.vendor.contact.update.process` | Update contact by phone |
| POST | `/{uid}/contact/assign-team-member` | `api.vendor.contact.assign_member.update.process` | Assign team member |
| GET | `/{uid}/contacts` | `api.vendor.contact.read.list` | List contacts |
| GET | `/{uid}/contact` | `api.vendor.contact.read.single_contact` | Get single contact |
| GET | `/{uid}/contact/groups` | `api.vendor.contact.read.group_list` | Get groups |
| GET | `/{uid}/contact/labels-tags` | `api.vendor.contact.read.labels_and_tags_list` | Get labels/tags |
| POST | `/{uid}/contact/assign-groups` | `api.vendor.contact.assign_groups.update.process` | Assign groups |
| POST | `/{uid}/contact/unassign-groups` | `api.vendor.contact.unassign_groups.update.process` | Unassign groups |
| POST | `/{uid}/contact/assign-labels` | `api.vendor.contact.assign_labels.update.process` | Assign labels |
| POST | `/{uid}/contact/unassign-labels` | `api.vendor.contact.unassign_labels.update.process` | Unassign labels |
| POST | `/{uid}/campaign/schedule` | `api.vendor.campaign.write.schedule` | Schedule campaign |
| GET | `/{uid}/campaign` | `api.vendor.campaign.read.list` | List campaigns |
| GET | `/{uid}/campaign-status/{campaignUid}` | `api.vendor.campaign.read.status_details` | Campaign status |

### Mobile App API Routes (middleware: `guest`)

| Method | Path | Route Name | Action |
|--------|------|-----------|--------|
| POST | `/api/register/vendor` | `api.auth.register.process` | Vendor registration |
| POST | `/api/register/vendor/activation` | `api.activation_required.auth.register.process` | Activation register |
| POST | `/api/user/login-process` | `api.user.login.process` | Login |
| GET | `/api/user/prepare-sign-up` | `api.user.sign_up.prepare` | Sign-up prep data |
| POST | `/api/user/process-sign-up` | `api.user.sign_up.process` | Sign-up |
| POST | `/api/user/two-factor-challenge` | `api.two_factor_authentication.verify` | Verify 2FA |

### App API Routes (middleware: `app_api.vendor.authenticate`)

| Method | Path | Route Name | Action |
|--------|------|-----------|--------|
| POST | `/api/media/upload-temp-media/{uploadItem?}` | `api.media.upload_temp_media` | Upload temp media |
| POST | `/api/user-device/token` | `api.user.device_token.write` | Store FCM token |
| GET | `/api/vendor/whatsapp/chat/unread-count` | `app_api.vendor.chat_message.read.unread_count` | Unread count |
| GET | `/api/vendor/contact/contacts-data/{contactUid?}` | `app_api.vendor.contacts.data.read` | Contacts data |
| GET | `/api/vendor/whatsapp/contact/chat/{contactUid?}` | `app_api.vendor.chat_message.contact.view` | Chat view |
| GET | `/api/vendor/whatsapp/contact/chat-data/{contactUid}/{way?}` | `app_api.vendor.chat_message.data.read` | Chat data (paginate) |
| POST | `/api/vendor/whatsapp/contact/chat/send` | `app_api.vendor.chat_message.send.process` | Send message |
| GET | `/api/vendor/whatsapp/contact/chat-box-data/{contactUid}` | `app_api.chat.box.base.data` | Labels + team members |
| GET | `/api/vendor/contacts/{id}/get-update-data` | `app_api.vendor.contact.read.update.data` | Contact update data |
| GET | `/api/vendor/whatsapp/contact/chat/prepare-send-media/{mediaType?}` | `app_api.vendor.chat_message_media.upload.prepare` | Media upload prep |
| POST | `/api/vendor/whatsapp/contact/chat/send-media` | `app_api.vendor.chat_message_media.send.process` | Send media |
| POST | `/api/vendor/whatsapp/contact/chat/update-notes` | `app_api.vendor.chat.update_notes.process` | Update notes |
| POST | `/api/vendor/whatsapp/contact/chat/assign-user` | `app_api.vendor.chat.assign_user.process` | Assign user |
| POST | `/api/vendor/whatsapp/contact/chat/assign-labels` | `app_api.vendor.chat.assign_labels.process` | Assign labels |
| POST | `/api/vendor/whatsapp/contact/chat/clear-history/{contactUid}` | `app_api.vendor.chat_message.delete.process` | Clear chat |
| POST | `/api/vendor/whatsapp/contact/create-label` | `app_api.vendor.chat.label.create.write` | Create label |
| POST | `/api/vendor/whatsapp/contact/chat/edit-label` | `app_api.vendor.chat.label.update.write` | Update label |
| POST | `/api/vendor/whatsapp/contact/chat/delete-label/{labelUid}` | `app_api.vendor.chat.label.delete.write` | Delete label |

### `routes/web.php` — SuperAdmin Routes (prefix: `/central-console`)

**Media:**
- Logo/small-logo/favicon upload (light + dark variants): 8 routes
- Files/media view, datatable, delete, bulk delete

**Subscription Plans Configuration:**
- GET `/central-console/subscription-plans` → `manage.configuration.subscription-plans`
- POST → `manage.configuration.subscription-plans.write.update`
- POST `/central-console/create-stripe-webhook` → `manage.configuration.create_stripe_webhook`

**Vendor Management:**
- GET `/central-console/vendors` → list view
- GET `/central-console/{vendorIdOrUid}/details` → vendor details
- POST `/central-console/{vendorUid}/login-as-vendor-admin` → login as vendor
- POST `/central-console/dashboard-stats-filter-data/{vendorUid}` → dashboard stats

**Manual Subscriptions (prefix `/manual-subscriptions`):**
- List, create, update, delete, cancel-and-discard

**Translations (prefix `/translations`):**
- Language CRUD, scan, update translations, export/import XLSX, auto-translate (Microsoft service)

**Configuration (prefix `/configuration`):**
- `/{pageType}` → GET/POST for all config pages
- Operations: optimize, clear-optimize, optimize-table
- Licence management: view, register, remove

**Addons:**
- Upload addon ZIP, install addon

**Mobile App Configuration:**
- GET `/central-console/mobile-app` → mobile config page

### `routes/web.php` — Vendor Routes (prefix: `/vendor-console`)

**Dashboard:** GET `/` + POST `dashboard-stats-filter-data`

**WhatsApp (prefix `/whatsapp`):**
| Route | Action |
|-------|--------|
| POST `/health-status` | Get health status |
| POST `/sync-phone-numbers` | Sync phone numbers from Meta |
| POST `/enable-template-analytics` | Enable template analytics |
| POST `/process-template-change` | Change current template view |
| GET `/contact/send-template-message/{contactUid}` | Template send view |
| POST `/contact/send-template-message/{contactUid}` | Template send process |
| GET `/message-log` | Message log view |
| GET `/message-log-list/{isIncomingMsg?}/{start?}/{end?}` | Message log data |
| GET `/{messageIdOrUid}/get-message-data` | Message detail |

**Campaign (prefix `/whatsapp/campaign`):**
| Route | Action |
|-------|--------|
| GET `/new/{campaignType?}` | New campaign view |
| POST `/schedule` | Schedule campaign |
| POST `/targeted-contact-count` | Get targeted contact count |
| GET `/status/{campaignUid}/view/{pageType?}/{logStatus?}` | Status view |
| GET `/queue/{campaignUid}/{logStatus?}` | Queue log list view |
| POST `/requeue/{campaignUid}` | Requeue failed messages |
| GET `/executed/{campaignUid}/{logStatus?}` | Executed log list |
| GET `/expired/{campaignUid}` | Expired log list |
| GET `/status/{campaignUid}/data` | Status data (polling) |
| GET `/` | Campaign list view |
| GET `/{status}/list-data` | Campaign list data |
| GET `/non-template/{status}/list-data` | Non-template list |
| GET `/non-template-message-presets/{status}/list-data` | Message presets list |
| POST `/{campaignIdOrUid}/delete-process` | Delete campaign |
| POST `/{campaignIdOrUid}/archive-process` | Archive campaign |
| POST `/{campaignIdOrUid}/unarchive-process` | Unarchive campaign |
| POST `/{campaignIdOrUid}/abort-process` | Abort campaign |
| GET `/campaign-report/{campaignUid}` | Generate executed report |
| GET `/campaign-queue-log-report/{campaignUid}` | Generate queue report |
| GET `/campaign-expired-log-report/{campaignUid}` | Generate expired report |

**Chat (prefix `/whatsapp`):**
- GET `/contact/chat/{contactUid?}` → chat view
- GET `/chat/unread-count` → unread count
- POST `/contact/chat/send` → send message
- POST `/contact/chat/assign-user` → assign user
- GET `/{contactIdOrUid}/team-member-list` → team member list
- POST `/contact/chat/assign-labels` → assign labels
- POST `/contact/chat/update-notes` → update notes
- GET `/contact/labels/{contactUid}` → get labels
- POST `/contact/create-label` → create label
- POST `/contact/chat/edit-label` → update label
- POST `/contact/chat/delete-label/{labelUid}` → delete label
- GET `/contact/chat/prepare-send-media/{mediaType?}` → media upload prep
- POST `/contact/chat/send-media` → send media
- GET `/contact/chat-data/{contactUid}/{way?}` → chat data (paginate)
- GET `/contact/contacts-data/{contactUid?}` → contacts sidebar data
- POST `/contact/chat/clear-history/{contactUid}` → clear history
- GET `/preset-messages-non-template` → non-template presets list view

**Templates (prefix `/whatsapp/templates`):**
- List view, list data, sync, delete, create view/process, update view/process, analytics view/process

**Bot Replies (prefix `/bot-replies`):**
- CRUD (list, create, update, delete, duplicate)
- `/{id}/all-active-bots` → active bots for contact
- `/{botId}/{contactId}/bot-preview` → bot preview
- `/quick-reply-process` → quick reply trigger

**Bot Flows (prefix `/bot-replies/bot-flows`):**
- CRUD (list, create, update, delete)
- Builder: `/builder/flow/{botFlowIdOrUid}` → flow builder view
- `/builder/update-flow-data-process` → save flow data

**Settings (prefix `/vendor-console`):**
- GET `/settings/{pageType?}` → settings view
- POST `/settings` → update settings
- POST `/settings-basic` → basic settings update
- POST `/disconnect-webhook`, POST `/connect-webhook`
- POST `/disconnect-account`
- GET `/business-profile/{phoneNumberId}`, POST `/business-profile/update`
- GET `/display-name/{phoneNumberId}`, POST `/display-name/update`
- POST `/register-phone-number`
- POST `/two-step-verification/update`
- POST `/embedded-signup-process`

**Subscription (prefix `/vendor-console/subscription`):**
- Show, cancel, resume, billing-portal, download-invoice
- POST `/create`, POST `/change-plan`
- Manual pay: proceed-to-pay, delete-request, send-payment-details, UPI QR
- PayPal: `/paypal/capture-paypal-order`
- Razorpay: `/razorpay/checkout`
- Paystack: `/paystack-verify/{reference}`
- YooMoney: `/yoomoney/checkout/{uid}`, `/yoomoney/capture-payment/{uid}`
- PhonePe: `/phone-pe/capture-payment`
- Payment success: `/{txnId}/payment-success`

**Contacts (prefix `/vendor-console/contacts`):**
- `/list/{groupUid?}` → list view
- `/list-data/{groupUid?}` → list data (filtered by group)
- `/filter-support-data` → filter metadata
- `/filter-store-process` → save contact filter
- `/{contactIdOrUid}/delete-process` → delete single
- `/{contactIdOrUid}/{groupUid}/remove-process` → remove from group
- `/delete-selected-process` → bulk delete
- `/process-delete-all` → delete all
- `/assign-groups-selected-process` → bulk assign groups
- `/add-process` → create contact
- `/{contactIdOrUid}/get-update-data` → fetch for update
- `/update-process` → update contact
- `/{contactIdOrUid}/toggle-ai-bot` → toggle AI bot
- `/export/{exportType?}/{fileType?}` → export contacts
- `/import` → import CSV
- `/abort-import` → cancel import
- `/{contactIdOrUid}/block-process` → block contact
- `/{contactIdOrUid}/unblock-process` → unblock contact

**Custom Fields (prefix `/vendor-console/contacts/custom-fields`):**
- Standard CRUD (list view, list, create, get-update-data, update, delete)

**Contact Groups (prefix `/vendor-console/contacts/groups`):**
- Standard CRUD + archive/unarchive (single and bulk)

**Users (prefix `/vendor-console/users`):**
- List view, list, create, update, delete, login-as, logout-as

**WebHook Route:**
- `routes/web.php` includes the Stripe webhook controller `StripeWebhookController`

### `routes/channels.php` — Broadcast Channels

```php
// Only registered if pusher_app_id is set in app settings
Broadcast::channel('vendor-channel.{vendorUid}', function ($user, $vendorUid) {
    return $vendorUid == getVendorUid();
});
```

**Channel auth logic:** Pusher private channel `vendor-channel.{vendorUid}` — user must belong to that vendor (returns bool).

---

## 9. Key Behavioral Rules Discovered

### Permission System
- Permissions stored as JSON on `users` table (via `vendorUserDetails`)
- Format: `{ "permissionKey": "allow|deny", "permissionKey@subKey": "allow|deny" }`
- At create/update time, ALL permissions from `getListOfPermissions()` are explicitly set to allow/deny
- Sub-permissions stored as `parent@child` format

### User Login-As (Impersonation)
- Session key `loggedByVendor`: `{ id, name }` — tracks original vendor admin
- Session key `loggedBySuperAdmin`: preserved across login-as transitions
- `VendorAccessCheckpost` skips status check if `session('loggedBySuperAdmin')` is set

### Demo Mode Safeguards
- `isDemo() and isDemoVendorAccount()` guards on login-as
- Dashboard POST blocked for non-SuperAdmin in demo (`CentralAccessCheckpost` reaction code 22)
- `maskForDemo()` applied to PII fields in datatable responses

### Translation Storage Pattern
- Languages stored as a single JSON blob under key `'translation_languages'` in `configurations` table
- Update requires delete-then-reinsert of the entire blob
- `.po` files stored at `base_path('locale/{languageId}/messages.po')` using gettext format
- `.mo` (compiled binary) generated for production

### Media Storage Pattern  
- All uploads go through `YesFileStorage` which wraps the configured Laravel disk
- `storage_base_folder` env var prefixes all paths (allows cloud sub-folder routing)
- Temp uploads use `user_temp_uploads` path key; then moved via `processMoveFile()`
- Incoming WhatsApp media: always written to vendor-scoped path `whatsapp_{mediaType}/{_uid}/`

### Stripe Configuration Guards
- Cannot mix Razorpay subscription addon with Stripe enabled (mutual exclusion)
- Test/live key validation enforced server-side (not just client)
- Extended license required for live Stripe keys

### JWT Token Config
- Web sessions: ~50 min refresh, ~2.5 hour expiry
- Mobile app tokens: 7-day refresh, 10-day expiry
- User-agent verification enabled, IP verification disabled

### Broadcast (Real-time)
- Pusher channel: `vendor-channel.{vendorUid}` (private)
- Channel not registered if `pusher_app_id` is not set in app settings
- Authorization: user's vendor UID must match channel vendorUid

---

## 10. Coverage Gap Analysis — Remaining Unread Files

After this session, the following material remains unread:

**Partially Read Engines** (only first ~300 lines covered):
- `VendorEngine.php` — password change by SuperAdmin, addVendor flow (lines 300+)
- `ConfigurationEngine.php` — license registration, embedded signup full flow, addon install (lines 300+)
- `MediaEngine.php` — additional upload helpers, temp file cleanup (lines 300+)
- `TranslationEngine.php` — scan() full implementation, export, import, auto-translate (lines 300+)
- `CampaignEngine.php` — export generation, archiving logic (lines 200+)
- `BotReplyEngine.php` — full CRUD, duplicate logic (lines 200+)

**Unread Engines:**
- `HomeEngine.php` — landing page, ping-pong, demo number register, UPI QR
- `PageEngine.php` — CMS page CRUD for terms/refund policy

**Unread Models:**
- `ContactCustomFieldModel.php`, `ContactCustomFieldValueModel.php`, `ContactLabelModel.php`, `GroupContactModel.php`, `LabelModel.php`
- `BotFlowModel.php`
- `VendorUserModel.php`
- `AuthModel.php` (User model with 2FA methods)
- `WhatsAppWebhookModel.php`
- `CampaignGroupModel.php`

**Unread Repositories:** All ~15 repository files (UserRepository, VendorRepository, ContactRepository, etc.)

**Unread Controllers:** All ~20+ controller files

**Unread JS Files:**
- `resources/js/services/__jsware/common-services.js`
- `resources/js/services/__jsware/datatable-service.js`
- `resources/js/services/__jsware/plugin-services.js`

**Unread Config:**
- `config/__currencies.php` — currency data
- `config/__settings.php` (lines 400+) — remaining settings pages

---

*Document compiled: 2026-05-18*  
*Part 6 of ongoing WhatsJet v7.2.0 reverse-engineering series*  
*Next: Part 7 will cover Repositories, remaining Controllers, HomeEngine/PageEngine, remaining Models, and JS service files*
