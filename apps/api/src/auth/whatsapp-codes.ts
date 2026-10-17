import type { PrismaClient } from "@prisma/client";
import { sendTemplateMessage, type WaTemplateComponent } from "../lib/whatsapp.js";

export interface WhatsappAuthConfig {
  orgId: string;
  template: string;
  language: string;
}

/**
 * WhatsApp sign-in codes are sent from one organization's number (the Conveys org) with a Meta
 * "Authentication" template. Off unless AUTH_WHATSAPP_ORG_ID and AUTH_WHATSAPP_TEMPLATE are set.
 */
export function whatsappAuthConfig(): WhatsappAuthConfig | null {
  const orgId = process.env["AUTH_WHATSAPP_ORG_ID"]?.trim();
  const template = process.env["AUTH_WHATSAPP_TEMPLATE"]?.trim();
  if (!orgId || !template) return null;
  const language = process.env["AUTH_WHATSAPP_TEMPLATE_LANG"]?.trim() || "en_US";
  return { orgId, template, language };
}

type Db = Pick<PrismaClient, "organization">;

/** Sends a 6-digit code to an E.164 number. Throws on any failure (callers decide what the user sees). */
export async function sendWhatsappCode(prisma: Db, phoneE164: string, code: string): Promise<void> {
  if (!/^\d{6}$/.test(code) || !/^\+\d{7,15}$/.test(phoneE164)) throw new Error("Invalid code or number");
  const cfg = whatsappAuthConfig();
  if (!cfg) throw new Error("WhatsApp sign-in is disabled");
  const org = await prisma.organization.findUnique({
    where: { id: cfg.orgId },
    select: { phoneNumberId: true, wabaAccessToken: true },
  });
  if (!org?.phoneNumberId || !org.wabaAccessToken) throw new Error("WhatsApp sender is not connected");
  // Authentication templates: the code fills the body variable and the copy-code button.
  const components: WaTemplateComponent[] = [
    { type: "body", parameters: [{ type: "text", text: code }] },
    { type: "button", sub_type: "url", index: 0, parameters: [{ type: "text", text: code }] },
  ];
  await sendTemplateMessage(org.phoneNumberId, phoneE164.slice(1), cfg.template, cfg.language, components, org.wabaAccessToken);
}
