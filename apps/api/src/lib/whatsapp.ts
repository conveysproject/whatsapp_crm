import { createHmac, timingSafeEqual } from "node:crypto";
import { prisma } from "./prisma.js";

const WA_BASE = "https://graph.facebook.com/v25.0";

interface WaSendResult {
  messageId: string;
}

interface WaMessageResponse {
  messages: Array<{ id: string }>;
}

export async function sendTextMessage(
  phoneNumberId: string,
  to: string,
  text: string,
  accessToken: string
): Promise<WaSendResult> {
  // GAP-S51: demo mode — prefix all outgoing messages with [DEMO] to prevent real sends being mistaken
  const body = process.env["IS_DEMO_MODE"] === "true" ? `[DEMO] ${text}` : text;
  const res = await fetch(`${WA_BASE}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "text",
      text: { body },
    }),
  });
  if (!res.ok) {
    const err = await res.json() as unknown;
    throw new Error(`WA send failed: ${JSON.stringify(err)}`);
  }
  const data = await res.json() as WaMessageResponse;
  return { messageId: data.messages[0]!.id };
}

export async function sendMediaMessage(
  phoneNumberId: string,
  to: string,
  contentType: string,
  mediaId: string,
  caption: string | undefined,
  accessToken: string
): Promise<WaSendResult> {
  const mediaType = contentType === "document" ? "document"
    : contentType === "video" ? "video"
    : contentType === "audio" ? "audio"
    : "image";

  // Meta requires `link` for public URLs and `id` for uploaded media IDs
  const mediaObject: Record<string, string | undefined> =
    mediaId.startsWith("http://") || mediaId.startsWith("https://")
      ? { link: mediaId }
      : { id: mediaId };
  if (caption) mediaObject.caption = caption;

  const res = await fetch(`${WA_BASE}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: mediaType,
      [mediaType]: mediaObject,
    }),
  });
  if (!res.ok) {
    const err = await res.json() as unknown;
    throw new Error(`WA media send failed: ${JSON.stringify(err)}`);
  }
  const data = await res.json() as WaMessageResponse;
  return { messageId: data.messages[0]!.id };
}

export interface WaInteractivePayload {
  type: "button" | "list" | "cta_url";
  header?: { type: "text"; text: string };
  body: { text: string };
  footer?: { text: string };
  action: Record<string, unknown>;
}

export interface WaTemplateComponent {
  type: "header" | "body" | "button" | "carousel";
  sub_type?: string;
  index?: number;
  parameters?: Array<{ type: "text" | "image" | "video" | "document"; text?: string }>;
  cards?: Array<{ card_index: number; components: WaTemplateComponent[] }>;
}

export async function sendTemplateMessage(
  phoneNumberId: string,
  to: string,
  templateName: string,
  languageCode: string,
  components: WaTemplateComponent[],
  accessToken: string
): Promise<WaSendResult> {
  const res = await fetch(`${WA_BASE}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "template",
      template: {
        name: templateName,
        language: { code: languageCode },
        ...(components.length > 0 && { components }),
      },
    }),
  });
  if (!res.ok) {
    const err = await res.json() as unknown;
    throw new Error(`WA template send failed: ${JSON.stringify(err)}`);
  }
  const data = await res.json() as WaMessageResponse;
  return { messageId: data.messages[0]!.id };
}

export async function sendInteractiveMessage(
  phoneNumberId: string,
  to: string,
  interactive: WaInteractivePayload,
  accessToken: string
): Promise<WaSendResult> {
  const res = await fetch(`${WA_BASE}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "interactive",
      interactive,
    }),
  });
  if (!res.ok) {
    const err = await res.json() as unknown;
    throw new Error(`WA interactive send failed: ${JSON.stringify(err)}`);
  }
  const data = await res.json() as WaMessageResponse;
  return { messageId: data.messages[0]!.id };
}

export function verifyWebhookSignature(
  rawBody: string,
  signature: string,
  secret: string
): boolean {
  const digest = createHmac("sha256", secret).update(rawBody).digest("hex");
  const expected = Buffer.from(`sha256=${digest}`);
  const received = Buffer.from(signature);
  if (expected.length !== received.length) return false;
  return timingSafeEqual(expected, received);
}

// ── Account management helpers ────────────────────────────────────────────

export async function getBusinessProfile(organizationId: string): Promise<Record<string, unknown>> {
  const settings = await prisma.vendorSetting.findMany({
    where: { organizationId },
    select: { key: true, value: true },
  });
  const map = Object.fromEntries(settings.map((s) => [s.key, s.value]));
  const phoneNumberId = map["current_phone_number_id"];
  const accessToken = map["whatsapp_access_token"];

  // If we have credentials, fetch fresh and update cache
  if (phoneNumberId && accessToken) {
    try {
      const res = await fetch(
        `${WA_BASE}/${phoneNumberId}/whatsapp_business_profile?fields=about,address,description,email,profile_picture_url,websites,vertical`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (res.ok) {
        const d = await res.json() as { data?: Array<Record<string, unknown>> };
        const bp = d.data?.[0] ?? {};
        const now = new Date().toISOString();
        // Update cache
        const cacheKeys = [
          { key: "business_profile_about", value: String(bp["about"] ?? "") },
          { key: "business_profile_address", value: String(bp["address"] ?? "") },
          { key: "business_profile_email", value: String(bp["email"] ?? "") },
          { key: "business_profile_description", value: String(bp["description"] ?? "") },
          { key: "business_profile_picture_url", value: String(bp["profile_picture_url"] ?? "") },
          { key: "business_profile_vertical", value: String(bp["vertical"] ?? "") },
          { key: "business_profile_synced_at", value: now },
        ];
        await Promise.all(cacheKeys.map((s) =>
          prisma.vendorSetting.upsert({
            where: { organizationId_key: { organizationId, key: s.key } },
            create: { organizationId, key: s.key, value: s.value, dataType: "string" },
            update: { value: s.value },
          })
        ));
        return bp;
      }
    } catch { /* fall through to cached */ }
  }

  // Return from cache
  return {
    about: map["business_profile_about"] ?? "",
    address: map["business_profile_address"] ?? "",
    email: map["business_profile_email"] ?? "",
    description: map["business_profile_description"] ?? "",
    profile_picture_url: map["business_profile_picture_url"] ?? "",
    vertical: map["business_profile_vertical"] ?? "",
  };
}

export async function updateBusinessProfile(
  organizationId: string,
  profile: { about?: string; address?: string; description?: string; email?: string; vertical?: string; websites?: string[] }
): Promise<{ success: boolean }> {
  const settings = await prisma.vendorSetting.findMany({
    where: { organizationId },
    select: { key: true, value: true },
  });
  const map = Object.fromEntries(settings.map((s) => [s.key, s.value]));
  const phoneNumberId = map["current_phone_number_id"];
  const accessToken = map["whatsapp_access_token"];

  if (phoneNumberId && accessToken) {
    const res = await fetch(`${WA_BASE}/${phoneNumberId}/whatsapp_business_profile`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", ...profile }),
    });
    if (!res.ok) {
      const err = await res.json() as unknown;
      throw new Error(`updateBusinessProfile failed: ${JSON.stringify(err)}`);
    }
  }

  // Update cache with new values
  const cacheUpdates: Array<{ key: string; value: string }> = [];
  if (profile.about !== undefined)       cacheUpdates.push({ key: "business_profile_about", value: profile.about });
  if (profile.address !== undefined)     cacheUpdates.push({ key: "business_profile_address", value: profile.address });
  if (profile.description !== undefined) cacheUpdates.push({ key: "business_profile_description", value: profile.description });
  if (profile.email !== undefined)       cacheUpdates.push({ key: "business_profile_email", value: profile.email });
  if (profile.vertical !== undefined)    cacheUpdates.push({ key: "business_profile_vertical", value: profile.vertical });
  if (profile.websites !== undefined)    cacheUpdates.push({ key: "business_profile_websites", value: JSON.stringify(profile.websites) });
  await Promise.all(cacheUpdates.map((s) =>
    prisma.vendorSetting.upsert({
      where: { organizationId_key: { organizationId, key: s.key } },
      create: { organizationId, key: s.key, value: s.value, dataType: "string" },
      update: { value: s.value },
    })
  ));

  return { success: true };
}

/**
 * Downloads an image from a public URL and uploads it to Meta's resumable
 * upload API, returning the media handle for use in template examples.
 */
export async function uploadMediaHandle(
  appId: string,
  accessToken: string,
  imageUrl: string
): Promise<string> {
  const imgRes = await fetch(imageUrl);
  if (!imgRes.ok) throw new Error(`Could not fetch image from URL: ${imageUrl}`);
  const contentType = imgRes.headers.get("content-type") ?? "image/jpeg";
  const buffer = Buffer.from(await imgRes.arrayBuffer());
  const ext = contentType.includes("png") ? "example.png" : "example.jpg";

  const sessionRes = await fetch(
    `${WA_BASE}/${appId}/uploads?file_name=${encodeURIComponent(ext)}&file_length=${buffer.length}&file_type=${encodeURIComponent(contentType)}&access_token=${accessToken}`,
    { method: "POST" }
  );
  if (!sessionRes.ok) throw new Error(`Upload session failed: ${await sessionRes.text()}`);
  const { id: uploadId } = await sessionRes.json() as { id: string };

  // Step 2: POST binary data directly to the upload session ID as the path
  const uploadRes = await fetch(
    `https://graph.facebook.com/${uploadId}`,
    {
      method: "POST",
      headers: { Authorization: `OAuth ${accessToken}`, file_offset: "0", "Content-Type": contentType },
      body: new Uint8Array(buffer),
    }
  );
  if (!uploadRes.ok) throw new Error(`File upload failed: ${await uploadRes.text()}`);
  const { h: handle } = await uploadRes.json() as { h: string };
  return handle;
}

export async function uploadProfilePicture(
  organizationId: string,
  base64Data: string,
  mimeType: string
): Promise<void> {
  const settings = await prisma.vendorSetting.findMany({
    where: { organizationId },
    select: { key: true, value: true },
  });
  const map = Object.fromEntries(settings.map((s) => [s.key, s.value]));
  const phoneNumberId = map["current_phone_number_id"];
  const accessToken = map["whatsapp_access_token"];
  const appId = map["facebook_app_id"];

  if (!phoneNumberId || !accessToken || !appId) {
    throw new Error("Organization not fully connected to WhatsApp");
  }

  const buffer = Buffer.from(base64Data, "base64");
  const fileName = mimeType === "image/png" ? "profile.png" : "profile.jpg";

  // Step 1: create app-level upload session
  const sessionRes = await fetch(
    `${WA_BASE}/${appId}/uploads?file_name=${encodeURIComponent(fileName)}&file_length=${buffer.length}&file_type=${encodeURIComponent(mimeType)}&access_token=${accessToken}`,
    { method: "POST" }
  );
  if (!sessionRes.ok) {
    const err = await sessionRes.text();
    throw new Error(`Upload session failed: ${err}`);
  }
  const { id: uploadId } = await sessionRes.json() as { id: string };

  // Step 2: POST binary data directly to the upload session ID as the path
  const uploadRes = await fetch(
    `https://graph.facebook.com/${uploadId}`,
    {
      method: "POST",
      headers: {
        Authorization: `OAuth ${accessToken}`,
        file_offset: "0",
        "Content-Type": mimeType,
      },
      body: new Uint8Array(buffer),
    }
  );
  if (!uploadRes.ok) {
    const err = await uploadRes.text();
    throw new Error(`File upload failed: ${err}`);
  }
  const { h: handle } = await uploadRes.json() as { h: string };

  // Step 3: set as profile picture
  const updateRes = await fetch(
    `${WA_BASE}/${phoneNumberId}/whatsapp_business_profile`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", profile_picture_handle: handle }),
    }
  );
  if (!updateRes.ok) {
    const err = await updateRes.text();
    throw new Error(`Profile picture update failed: ${err}`);
  }
}

export async function getDisplayName(organizationId: string): Promise<{ display_name: string }> {
  const settings = await prisma.vendorSetting.findMany({
    where: { organizationId },
    select: { key: true, value: true },
  });
  const map = Object.fromEntries(settings.map((s) => [s.key, s.value]));
  return { display_name: map["display_name"] ?? "" };
}

export async function updateDisplayName(
  organizationId: string,
  displayName: string
): Promise<{ success: boolean }> {
  const settings = await prisma.vendorSetting.findMany({
    where: { organizationId },
    select: { key: true, value: true },
  });
  const map = Object.fromEntries(settings.map((s) => [s.key, s.value]));
  const phoneNumberId = map["current_phone_number_id"];
  const accessToken = map["whatsapp_access_token"];

  if (phoneNumberId && accessToken) {
    const res = await fetch(`${WA_BASE}/${phoneNumberId}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", new_display_name: displayName }),
    });
    if (!res.ok) {
      const err = await res.json() as unknown;
      throw new Error(`updateDisplayName failed: ${JSON.stringify(err)}`);
    }
  }

  await prisma.vendorSetting.upsert({
    where: { organizationId_key: { organizationId, key: "new_display_name" } },
    create: { organizationId, key: "new_display_name", value: displayName, dataType: "string" },
    update: { value: displayName },
  });

  return { success: true };
}

export async function syncPhoneNumbers(organizationId: string): Promise<Array<{ id: string; displayPhoneNumber: string; verifiedName: string }>> {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { whatsappBusinessAccountId: true, wabaAccessToken: true },
  });
  if (!org?.whatsappBusinessAccountId || !org.wabaAccessToken) return [];

  const res = await fetch(
    `${WA_BASE}/${org.whatsappBusinessAccountId}/phone_numbers?fields=id,display_phone_number,verified_name,code_verification_status,webhook_configuration`,
    { headers: { Authorization: `Bearer ${org.wabaAccessToken}` } }
  );
  if (!res.ok) return [];
  const data = await res.json() as { data?: Array<{ id: string; display_phone_number: string; verified_name: string; webhook_configuration?: { phone_number?: string } }> };
  const phones = data.data ?? [];

  if (phones[0]) {
    const existing = await prisma.organization.findUnique({ where: { id: organizationId }, select: { phoneNumberId: true } });
    if (!existing?.phoneNumberId) {
      await prisma.organization.update({
        where: { id: organizationId },
        data: { phoneNumberId: phones[0].id },
      });
    }
    // Save as vendor settings for health check
    const upserts = [
      { key: "current_phone_number_id", value: phones[0].id },
      { key: "current_phone_number_number", value: phones[0].display_phone_number },
    ];
    await Promise.all(upserts.map((s) =>
      prisma.vendorSetting.upsert({
        where: { organizationId_key: { organizationId, key: s.key } },
        create: { organizationId, key: s.key, value: s.value, dataType: "string" },
        update: { value: s.value },
      })
    ));

    // Auto-clear phone-level webhook overrides (WhatsJet pattern)
    await Promise.allSettled(
      phones
        .filter((p) => p.webhook_configuration?.phone_number)
        .map((p) =>
          fetch(`${WA_BASE}/${p.id}`, {
            method: "POST",
            headers: { Authorization: `Bearer ${org.wabaAccessToken!}`, "Content-Type": "application/json" },
            body: JSON.stringify({ webhook_configuration: { override_callback_uri: "" } }),
          })
        )
    );
  }

  return phones.map((p) => ({ id: p.id, displayPhoneNumber: p.display_phone_number, verifiedName: p.verified_name }));
}

const HEALTH_KEYS = [
  "facebook_app_id",
  "whatsapp_access_token",
  "whatsapp_business_account_id",
  "current_phone_number_number",
  "current_phone_number_id",
  "webhook_verified_at",
] as const;

export async function getHealthStatus(
  organizationId: string
): Promise<{
  status: "healthy" | "degraded" | "disconnected";
  conditions: Record<string, boolean>;
  metaHealthStatus: string | null;
  metaHealthCheckedAt: string | null;
  metaHealthStale: boolean;
}> {
  const settings = await prisma.vendorSetting.findMany({
    where: { organizationId },
    select: { key: true, value: true },
  });
  const map = Object.fromEntries(settings.map((s) => [s.key, s.value]));
  const conditions: Record<string, boolean> = {};
  for (const k of HEALTH_KEYS) {
    conditions[k] = Boolean(map[k]);
  }
  conditions["token_not_expired"] = Boolean(map["whatsapp_access_token"]) && map["whatsapp_access_token_expired"] !== "1";
  const values = Object.values(conditions);
  const status = values.every(Boolean) ? "healthy" : values.every((v) => !v) ? "disconnected" : "degraded";

  const metaHealthStatus = map["meta_health_status"] ?? null;
  const metaHealthCheckedAt = map["meta_health_checked_at"] ?? null;
  const metaHealthStale = metaHealthCheckedAt
    ? Date.now() - new Date(metaHealthCheckedAt).getTime() > 60 * 60 * 1000 // >1hr old
    : true;

  return { status, conditions, metaHealthStatus, metaHealthCheckedAt, metaHealthStale };
}

export async function registerPhoneNumber(
  organizationId: string,
  phoneNumber: string,
  pinCode: string
): Promise<{ success: boolean }> {
  void phoneNumber;
  const settings = await prisma.vendorSetting.findMany({
    where: { organizationId },
    select: { key: true, value: true },
  });
  const map = Object.fromEntries(settings.map((s) => [s.key, s.value]));
  const phoneNumberId = map["current_phone_number_id"];
  const accessToken = map["whatsapp_access_token"];
  if (!phoneNumberId || !accessToken) {
    throw new Error("WhatsApp phone number ID or access token not configured");
  }
  const res = await fetch(`${WA_BASE}/${phoneNumberId}/register`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      pin: pinCode,
    }),
  });
  if (!res.ok) {
    const err = await res.json() as unknown;
    throw new Error(`Phone registration failed: ${JSON.stringify(err)}`);
  }
  return { success: true };
}

export async function getPhoneInfo(
  organizationId: string
): Promise<{ messagingLimitTier: string | null; status: string | null; isOnBizApp: boolean; isPinEnabled: boolean; lastOnboardedTime: string | null }> {
  const settings = await prisma.vendorSetting.findMany({
    where: { organizationId },
    select: { key: true, value: true },
  });
  const map = Object.fromEntries(settings.map((s) => [s.key, s.value]));
  const phoneNumberId = map["current_phone_number_id"];
  const accessToken = map["whatsapp_access_token"];
  if (!phoneNumberId || !accessToken) throw new Error("WhatsApp not configured");
  const res = await fetch(
    `${WA_BASE}/${phoneNumberId}?fields=messaging_limit_tier,status,is_on_biz_app,is_pin_enabled,last_onboarded_time`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!res.ok) throw new Error(`getPhoneInfo failed: ${await res.text()}`);
  const d = await res.json() as { messaging_limit_tier?: string; status?: string; is_on_biz_app?: boolean; is_pin_enabled?: boolean; last_onboarded_time?: string };
  return {
    messagingLimitTier: d.messaging_limit_tier ?? null,
    status: d.status ?? null,
    isOnBizApp: d.is_on_biz_app ?? false,
    isPinEnabled: d.is_pin_enabled ?? false,
    lastOnboardedTime: d.last_onboarded_time ?? null,
  };
}

// ── Cache-first Meta data sync ────────────────────────────────────────────────

/**
 * Fetches all Meta data in parallel and stores it in vendorSettings.
 * Call after connect, after sync-all, never on page load.
 */
export async function syncAllMetaData(organizationId: string): Promise<void> {
  const settings = await prisma.vendorSetting.findMany({
    where: { organizationId },
    select: { key: true, value: true },
  });
  const map = Object.fromEntries(settings.map((s) => [s.key, s.value]));
  const phoneNumberId = map["current_phone_number_id"];
  const wabaId = map["whatsapp_business_account_id"];
  const accessToken = map["whatsapp_access_token"];
  if (!phoneNumberId || !accessToken || !wabaId) return;

  const now = new Date().toISOString();

  const [phoneInfoResult, businessProfileResult, wabaInfoResult, displayNameResult, marketingResult] =
    await Promise.allSettled([
      // 1. Phone info + quality rating
      fetch(`${WA_BASE}/${phoneNumberId}?fields=messaging_limit_tier,status,is_on_biz_app,is_pin_enabled,last_onboarded_time,quality_rating`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      }).then((r) => r.ok ? r.json() as Promise<{ messaging_limit_tier?: string; status?: string; is_on_biz_app?: boolean; is_pin_enabled?: boolean; last_onboarded_time?: string; quality_rating?: string }> : Promise.reject(new Error("phone_info fetch failed"))),

      // 2. Business profile
      fetch(`${WA_BASE}/${phoneNumberId}/whatsapp_business_profile?fields=about,address,description,email,profile_picture_url,websites,vertical`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      }).then((r) => r.ok ? r.json() as Promise<{ data?: Array<{ about?: string; address?: string; description?: string; email?: string; profile_picture_url?: string; websites?: string[]; vertical?: string }> }> : Promise.reject(new Error("business_profile fetch failed"))),

      // 3. WABA info: health + business verification + account review
      fetch(`${WA_BASE}/${wabaId}?fields=health_status,business_verification_status,account_review_status,marketing_messages_onboarding_status`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      }).then((r) => r.ok ? r.json() as Promise<{ health_status?: { entities?: Array<{ can_send_message?: string }> }; business_verification_status?: string; account_review_status?: string; marketing_messages_onboarding_status?: string }> : Promise.reject(new Error("waba_info fetch failed"))),

      // 4. Display name
      fetch(`${WA_BASE}/${phoneNumberId}?fields=verified_name,name_status,new_display_name,new_name_status`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      }).then((r) => r.ok ? r.json() as Promise<{ verified_name?: string; name_status?: string; new_display_name?: string; new_name_status?: string }> : Promise.reject(new Error("display_name fetch failed"))),

      // 5. Marketing messages onboarding status (fallback separate call if WABA call fails)
      fetch(`${WA_BASE}/${wabaId}?fields=marketing_messages_onboarding_status`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      }).then((r) => r.ok ? r.json() as Promise<{ marketing_messages_onboarding_status?: string }> : Promise.reject(new Error("marketing_status fetch failed"))),
    ]);

  const upserts: Array<{ key: string; value: string }> = [];

  if (phoneInfoResult.status === "fulfilled") {
    const d = phoneInfoResult.value;
    upserts.push(
      { key: "phone_info_messaging_limit_tier", value: d.messaging_limit_tier ?? "" },
      { key: "phone_info_status", value: d.status ?? "" },
      { key: "phone_info_is_on_biz_app", value: String(d.is_on_biz_app ?? false) },
      { key: "phone_info_is_pin_enabled", value: String(d.is_pin_enabled ?? false) },
      { key: "phone_info_last_onboarded_time", value: d.last_onboarded_time ?? "" },
      { key: "phone_info_quality_rating", value: d.quality_rating ?? "" },
      { key: "phone_info_synced_at", value: now },
    );
  }

  if (businessProfileResult.status === "fulfilled") {
    const bp = businessProfileResult.value.data?.[0] ?? {};
    upserts.push(
      { key: "business_profile_about", value: bp.about ?? "" },
      { key: "business_profile_address", value: bp.address ?? "" },
      { key: "business_profile_email", value: bp.email ?? "" },
      { key: "business_profile_description", value: bp.description ?? "" },
      { key: "business_profile_picture_url", value: bp.profile_picture_url ?? "" },
      { key: "business_profile_vertical", value: bp.vertical ?? "" },
      { key: "business_profile_websites", value: JSON.stringify(bp.websites ?? []) },
      { key: "business_profile_synced_at", value: now },
    );
  }

  if (wabaInfoResult.status === "fulfilled") {
    const w = wabaInfoResult.value;
    const entity = w.health_status?.entities?.[0];
    upserts.push(
      { key: "meta_health_status", value: entity?.can_send_message ?? "" },
      { key: "meta_health_checked_at", value: now },
      { key: "waba_business_verification_status", value: w.business_verification_status ?? "" },
      { key: "waba_account_review_status", value: w.account_review_status ?? "" },
    );
    if (w.marketing_messages_onboarding_status) {
      upserts.push({ key: "marketing_messages_onboarding_status", value: w.marketing_messages_onboarding_status });
    }
  }

  if (displayNameResult.status === "fulfilled") {
    const d = displayNameResult.value;
    upserts.push(
      { key: "display_name", value: d.verified_name ?? "" },
      { key: "display_name_status", value: d.name_status ?? "" },
      { key: "new_display_name", value: d.new_display_name ?? "" },
      { key: "new_display_name_status", value: d.new_name_status ?? "" },
    );
  }

  if (marketingResult.status === "fulfilled") {
    const d = marketingResult.value;
    if (d.marketing_messages_onboarding_status) {
      upserts.push({ key: "marketing_messages_onboarding_status", value: d.marketing_messages_onboarding_status });
    }
  }

  if (upserts.length > 0) {
    await Promise.all(
      upserts.map((s) =>
        prisma.vendorSetting.upsert({
          where: { organizationId_key: { organizationId, key: s.key } },
          create: { organizationId, key: s.key, value: s.value, dataType: "string" },
          update: { value: s.value },
        })
      )
    );
  }
}

// ── Block / Unblock contacts ──────────────────────────────────────────────────

export async function blockContact(
  organizationId: string,
  phoneNumber: string
): Promise<{ success: boolean }> {
  const settings = await prisma.vendorSetting.findMany({
    where: { organizationId },
    select: { key: true, value: true },
  });
  const map = Object.fromEntries(settings.map((s) => [s.key, s.value]));
  const phoneNumberId = map["current_phone_number_id"];
  const accessToken = map["whatsapp_access_token"];
  if (!phoneNumberId || !accessToken) throw new Error("WhatsApp not configured");
  const res = await fetch(`${WA_BASE}/${phoneNumberId}/block_users`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ block_users: [{ user: phoneNumber }] }),
  });
  if (!res.ok) {
    const err = await res.json() as unknown;
    throw new Error(`blockContact failed: ${JSON.stringify(err)}`);
  }
  return { success: true };
}

export async function unblockContact(
  organizationId: string,
  phoneNumber: string
): Promise<{ success: boolean }> {
  const settings = await prisma.vendorSetting.findMany({
    where: { organizationId },
    select: { key: true, value: true },
  });
  const map = Object.fromEntries(settings.map((s) => [s.key, s.value]));
  const phoneNumberId = map["current_phone_number_id"];
  const accessToken = map["whatsapp_access_token"];
  if (!phoneNumberId || !accessToken) throw new Error("WhatsApp not configured");
  const res = await fetch(`${WA_BASE}/${phoneNumberId}/block_users`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", block_users: [{ user: phoneNumber }] }),
  });
  if (!res.ok) {
    const err = await res.json() as unknown;
    throw new Error(`unblockContact failed: ${JSON.stringify(err)}`);
  }
  return { success: true };
}

// ── Meta Template Analytics ───────────────────────────────────────────────────

export async function getMetaTemplateAnalytics(
  organizationId: string,
  params: { templateId: string; startDate: string; endDate: string }
): Promise<unknown> {
  const settings = await prisma.vendorSetting.findMany({
    where: { organizationId },
    select: { key: true, value: true },
  });
  const map = Object.fromEntries(settings.map((s) => [s.key, s.value]));
  const wabaId = map["whatsapp_business_account_id"];
  const accessToken = map["whatsapp_access_token"];
  if (!wabaId || !accessToken) throw new Error("WhatsApp not configured");
  const url = `${WA_BASE}/${wabaId}/template_analytics?start=${encodeURIComponent(params.startDate)}&end=${encodeURIComponent(params.endDate)}&granularity=daily&template_ids[]=${encodeURIComponent(params.templateId)}&product_type=CONVERSATION&waba_timezone=true`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const err = await res.json() as unknown;
    throw new Error(`getMetaTemplateAnalytics failed: ${JSON.stringify(err)}`);
  }
  return res.json();
}

// ── Marketing template messages ───────────────────────────────────────────────

export async function sendMarketingTemplateMessage(
  phoneNumberId: string,
  to: string,
  templateName: string,
  languageCode: string,
  components: WaTemplateComponent[],
  accessToken: string
): Promise<WaSendResult> {
  const res = await fetch(`${WA_BASE}/${phoneNumberId}/marketing_messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "template",
      template: {
        name: templateName,
        language: { code: languageCode },
        ...(components.length > 0 && { components }),
      },
    }),
  });
  if (!res.ok) {
    const err = await res.json() as unknown;
    throw new Error(`WA marketing template send failed: ${JSON.stringify(err)}`);
  }
  const data = await res.json() as WaMessageResponse;
  return { messageId: data.messages[0]!.id };
}

export async function getNewDisplayName(
  organizationId: string
): Promise<{ newDisplayName: string | null; nameStatus: string | null }> {
  const settings = await prisma.vendorSetting.findMany({
    where: { organizationId },
    select: { key: true, value: true },
  });
  const map = Object.fromEntries(settings.map((s) => [s.key, s.value]));
  const phoneNumberId = map["current_phone_number_id"];
  const accessToken = map["whatsapp_access_token"];
  if (!phoneNumberId || !accessToken) throw new Error("WhatsApp not configured");
  const res = await fetch(
    `${WA_BASE}/${phoneNumberId}?fields=new_display_name,name_status`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!res.ok) throw new Error(`getNewDisplayName failed: ${await res.text()}`);
  const d = await res.json() as { new_display_name?: string; name_status?: string };
  return { newDisplayName: d.new_display_name ?? null, nameStatus: d.name_status ?? null };
}

export async function clearPhoneWebhookConfig(
  organizationId: string
): Promise<{ success: boolean }> {
  const settings = await prisma.vendorSetting.findMany({
    where: { organizationId },
    select: { key: true, value: true },
  });
  const map = Object.fromEntries(settings.map((s) => [s.key, s.value]));
  const phoneNumberId = map["current_phone_number_id"];
  const accessToken = map["whatsapp_access_token"];
  if (!phoneNumberId || !accessToken) throw new Error("WhatsApp not configured");
  const res = await fetch(`${WA_BASE}/${phoneNumberId}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ webhook_configuration: { override_callback_uri: "" } }),
  });
  if (!res.ok) throw new Error(`clearPhoneWebhookConfig failed: ${await res.text()}`);
  return { success: true };
}

export async function getAppAccessToken(appId: string, appSecret: string): Promise<{ accessToken: string }> {
  const res = await fetch(
    `${WA_BASE}/oauth/access_token?client_id=${encodeURIComponent(appId)}&client_secret=${encodeURIComponent(appSecret)}&grant_type=client_credentials`
  );
  if (!res.ok) throw new Error(`getAppAccessToken failed: ${await res.text()}`);
  const d = await res.json() as { access_token: string };
  return { accessToken: d.access_token };
}

export async function setTwoStepVerification(
  organizationId: string,
  pinCode: string
): Promise<{ success: boolean }> {
  const settings = await prisma.vendorSetting.findMany({
    where: { organizationId },
    select: { key: true, value: true },
  });
  const map = Object.fromEntries(settings.map((s) => [s.key, s.value]));
  const phoneNumberId = map["current_phone_number_id"];
  const accessToken = map["whatsapp_access_token"];
  if (!phoneNumberId || !accessToken) {
    throw new Error("WhatsApp phone number ID or access token not configured");
  }
  const res = await fetch(`${WA_BASE}/${phoneNumberId}/enable_two_step`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ pin: pinCode }),
  });
  if (!res.ok) {
    const err = await res.json() as unknown;
    throw new Error(`Two-step verification failed: ${JSON.stringify(err)}`);
  }
  return { success: true };
}

// ── Media helpers ─────────────────────────────────────────────────────────────

interface WaMediaUploadResponse {
  id: string;
}

interface WaMediaUrlResponse {
  url: string;
  mime_type: string;
  sha256: string;
  file_size: number;
  id: string;
  messaging_product: string;
}

export async function uploadMedia(
  phoneNumberId: string,
  file: Buffer,
  mimeType: string,
  accessToken: string
): Promise<{ mediaId: string }> {
  const form = new FormData();
  form.append("messaging_product", "whatsapp");
  form.append("file", new Blob([new Uint8Array(file)], { type: mimeType }), "upload");

  const res = await fetch(`${WA_BASE}/${phoneNumberId}/media`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
    body: form,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`WA media upload failed: ${err}`);
  }
  const data = await res.json() as WaMediaUploadResponse;
  return { mediaId: data.id };
}

export async function getMediaUrl(
  mediaId: string,
  accessToken: string
): Promise<{ url: string; mimeType: string }> {
  const res = await fetch(`${WA_BASE}/${mediaId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`WA getMediaUrl failed: ${err}`);
  }
  const data = await res.json() as WaMediaUrlResponse;
  return { url: data.url, mimeType: data.mime_type };
}

export async function downloadMediaBytes(
  url: string,
  accessToken: string
): Promise<Buffer> {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`WA media download failed: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

// Resumable upload for files >50MB — returns same mediaId shape
export async function uploadResumableMedia(
  phoneNumberId: string,
  file: Buffer,
  mimeType: string,
  accessToken: string
): Promise<{ mediaId: string }> {
  // Step 1: create upload session
  const sessionRes = await fetch(`${WA_BASE}/${phoneNumberId}/uploads`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      file_length: file.byteLength,
      file_type: mimeType,
      messaging_product: "whatsapp",
    }),
  });
  if (!sessionRes.ok) throw new Error(`WA resumable session failed: ${await sessionRes.text()}`);
  const { id: uploadId } = await sessionRes.json() as { id: string };

  // Step 2: upload the file bytes
  const uploadRes = await fetch(`${WA_BASE}/${uploadId}`, {
    method: "POST",
    headers: {
      Authorization: `OAuth ${accessToken}`,
      "Content-Type": mimeType,
      file_offset: "0",
    },
    body: new Uint8Array(file),
  });
  if (!uploadRes.ok) throw new Error(`WA resumable upload failed: ${await uploadRes.text()}`);
  const { h: mediaId } = await uploadRes.json() as { h: string };
  return { mediaId };
}

export async function markAsRead(
  phoneNumberId: string,
  messageId: string,
  accessToken: string
): Promise<void> {
  await fetch(`${WA_BASE}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      status: "read",
      message_id: messageId,
    }),
  });
  // Fire-and-forget — mark-as-read failures are non-critical
}
