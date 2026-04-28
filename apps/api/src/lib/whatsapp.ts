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
