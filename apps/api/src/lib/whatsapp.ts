import { createHmac, timingSafeEqual } from "node:crypto";

const WA_BASE = "https://graph.facebook.com/v20.0";

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

export async function syncPhoneNumbers(organizationId: string): Promise<unknown[]> {
  void organizationId;
  return [];
}

export async function getHealthStatus(organizationId: string): Promise<{ status: string }> {
  void organizationId;
  return { status: "unknown" };
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
