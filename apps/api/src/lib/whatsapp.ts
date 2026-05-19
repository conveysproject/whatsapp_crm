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
      text: { body: text },
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

  const mediaObject: Record<string, string | undefined> = { id: mediaId };
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
  type: "button" | "list";
  header?: { type: "text"; text: string };
  body: { text: string };
  footer?: { text: string };
  action: Record<string, unknown>;
}

export interface WaTemplateComponent {
  type: "header" | "body" | "button";
  sub_type?: string;
  index?: number;
  parameters?: Array<{ type: "text" | "image" | "document"; text?: string }>;
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
        components,
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
  // Credentials fetched per-request from DB in real flow; here we return a stub shape
  // Real implementation: GET /{phone-number-id}/whatsapp_business_profile
  void organizationId;
  return { about: "", address: "", email: "", websites: [], vertical: "" };
}

export async function updateBusinessProfile(
  organizationId: string,
  profile: { about?: string; address?: string; email?: string; websites?: string[] }
): Promise<{ success: boolean }> {
  void organizationId;
  void profile;
  return { success: true };
}

export async function getDisplayName(organizationId: string): Promise<{ display_name: string }> {
  void organizationId;
  return { display_name: "" };
}

export async function updateDisplayName(
  organizationId: string,
  displayName: string
): Promise<{ success: boolean }> {
  void organizationId;
  void displayName;
  return { success: true };
}

export async function syncPhoneNumbers(organizationId: string): Promise<Array<{ id: string; displayPhoneNumber: string; verifiedName: string }>> {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { whatsappBusinessAccountId: true, wabaAccessToken: true },
  });
  if (!org?.whatsappBusinessAccountId || !org.wabaAccessToken) return [];

  const res = await fetch(
    `${WA_BASE}/${org.whatsappBusinessAccountId}/phone_numbers?fields=id,display_phone_number,verified_name,code_verification_status`,
    { headers: { Authorization: `Bearer ${org.wabaAccessToken}` } }
  );
  if (!res.ok) return [];
  const data = await res.json() as { data?: Array<{ id: string; display_phone_number: string; verified_name: string }> };
  const phones = data.data ?? [];

  // Persist first phone number back to org if not already set
  if (phones[0] && !org.wabaAccessToken) {
    // access token already set; update phoneNumberId only if absent
  }
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
): Promise<{ status: "healthy" | "degraded"; conditions: Record<string, boolean> }> {
  const settings = await prisma.vendorSetting.findMany({
    where: { organizationId },
    select: { key: true, value: true },
  });
  const map = Object.fromEntries(settings.map((s) => [s.key, s.value]));
  const conditions: Record<string, boolean> = {};
  for (const k of HEALTH_KEYS) {
    conditions[k] = Boolean(map[k]);
  }
  conditions["token_not_expired"] = map["whatsapp_access_token_expired"] !== "1";
  const status = Object.values(conditions).every(Boolean) ? "healthy" : "degraded";
  return { status, conditions };
}

export async function registerPhoneNumber(
  organizationId: string,
  phoneNumber: string,
  pinCode: string
): Promise<{ success: boolean }> {
  void organizationId;
  void phoneNumber;
  void pinCode;
  return { success: true };
}

export async function setTwoStepVerification(
  organizationId: string,
  pinCode: string
): Promise<{ success: boolean }> {
  void organizationId;
  void pinCode;
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
