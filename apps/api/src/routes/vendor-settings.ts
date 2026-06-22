import type { FastifyPluginAsync } from "fastify";
import { syncPhoneNumbers } from "../lib/whatsapp.js";
import { prisma } from "../lib/prisma.js";
import { storeTrainingEmbeddings } from "../lib/ai-rag.js";
import { canAccess } from "../lib/permissions.js";
import { normalizeFullPhone } from "../lib/phone-normalize.js";

interface SettingEntry {
  key: string;
  value: string;
  dataType?: string;
}

function castSetting(value: string | null, dataType: string): unknown {
  if (value === null || value === "") return null;
  switch (dataType) {
    case "boolean": return value === "true" || value === "1";
    case "integer": return parseInt(value, 10);
    case "float": return parseFloat(value);
    case "json": try { return JSON.parse(value); } catch { return value; }
    default: return value;
  }
}

async function runSettingsSideEffects(organizationId: string, settings: SettingEntry[]): Promise<void> {
  const keyMap = Object.fromEntries(settings.map((s) => [s.key, s.value]));

  // whatsapp_access_token saved → clear expired flag
  if ("whatsapp_access_token" in keyMap) {
    await prisma.vendorSetting.upsert({
      where: { organizationId_key: { organizationId, key: "whatsapp_access_token_expired" } },
      create: { organizationId, key: "whatsapp_access_token_expired", value: "0", dataType: "boolean" },
      update: { value: "0" },
    });
  }

  // whatsapp_business_account_id saved → re-sync phone numbers
  if ("whatsapp_business_account_id" in keyMap && keyMap["whatsapp_business_account_id"]) {
    await syncPhoneNumbers(organizationId);
  }

  // test_recipient_contact saved → auto-create contact if not found
  if ("test_recipient_contact" in keyMap && keyMap["test_recipient_contact"]) {
    const phone = keyMap["test_recipient_contact"]!;
    const normalizedPhone = normalizeFullPhone(phone) ?? phone;
    const existing = await prisma.contact.findFirst({
      where: { organizationId, phoneNumber: normalizedPhone, deletedAt: null },
    });
    if (!existing) {
      await prisma.contact.create({
        data: { organizationId, phoneNumber: normalizedPhone, name: "Test Contact" },
      });
    }
  }

  // GAP-S27/S67: open_ai_input_training_data saved → re-generate RAG embeddings
  if ("open_ai_input_training_data" in keyMap && keyMap["open_ai_input_training_data"] && process.env["OPENAI_API_KEY"]) {
    await storeTrainingEmbeddings(organizationId, keyMap["open_ai_input_training_data"]!);
  }
}

export const vendorSettingsRouter: FastifyPluginAsync = async (fastify) => {
  fastify.get("/vendor-settings", async (request, reply) => {
    const { organizationId } = request.auth;
    const rows = await fastify.prisma.vendorSetting.findMany({
      where: { organizationId },
    });
    const data: Record<string, unknown> = {};
    for (const row of rows) {
      data[row.key] = castSetting(row.value, row.dataType);
    }
    return reply.send({ data });
  });

  fastify.put<{ Body: { settings: SettingEntry[] } }>(
    "/vendor-settings",
    async (request, reply) => {
      const { organizationId, role, permissions } = request.auth;
      // GAP-S04: settings_access permission required to modify org-level settings
      if (!canAccess(role, permissions, "settings_access")) {
        return reply.status(403).send({ error: { code: "FORBIDDEN", message: "settings_access permission required" } });
      }
      const { settings } = request.body;
      await Promise.all(
        settings.map((s) =>
          fastify.prisma.vendorSetting.upsert({
            where: { organizationId_key: { organizationId, key: s.key } },
            create: { organizationId, key: s.key, value: s.value, dataType: s.dataType ?? "string" },
            update: { value: s.value, dataType: s.dataType ?? "string" },
          })
        )
      );

      // GAP-S67: side effects for specific setting keys
      void runSettingsSideEffects(organizationId, settings).catch(() => {/* non-critical */});

      return reply.send({ success: true });
    }
  );

  fastify.put("/vendor-settings/sound-notification", async (request, reply) => {
    const { organizationId } = request.auth;
    const body = request.body as { disabled: boolean };
    await fastify.prisma.vendorSetting.upsert({
      where: { organizationId_key: { organizationId, key: "is_disabled_message_sound_notification" } },
      create: { organizationId, key: "is_disabled_message_sound_notification", value: String(body.disabled), dataType: "boolean" },
      update: { value: String(body.disabled) },
    });
    return reply.send({ success: true });
  });

  // ── Enable marketing messages (Meta template analytics opt-in) ───────────
  fastify.post("/vendor-settings/marketing-messages/enable", async (request, reply) => {
    const { organizationId } = request.auth;
    const org = await fastify.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { phoneNumberId: true, wabaAccessToken: true },
    });
    if (!org?.phoneNumberId || !org.wabaAccessToken) {
      return reply.status(400).send({ error: { code: "WA_NOT_CONNECTED", message: "WhatsApp account not connected" } });
    }

    // Call Meta Graph API to opt into marketing message analytics
    const res = await fetch(
      `https://graph.facebook.com/v25.0/${org.phoneNumberId}`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${org.wabaAccessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ messaging_product: "whatsapp", enable_smart_delivery: true }),
      }
    );
    const json = await res.json() as Record<string, unknown>;

    const enabled = res.ok;
    await fastify.prisma.vendorSetting.upsert({
      where: { organizationId_key: { organizationId, key: "marketing_messages_enabled" } },
      create: { organizationId, key: "marketing_messages_enabled", value: String(enabled), dataType: "boolean" },
      update: { value: String(enabled) },
    });

    if (!res.ok) {
      return reply.status(400).send({ error: { code: "META_API_ERROR", message: (json["error"] as Record<string, string>)?.["message"] ?? "Meta API error" } });
    }
    return reply.send({ data: { enabled: true } });
  });

  // ── Marketing messages onboarding status ─────────────────────────────────
  fastify.get("/vendor-settings/marketing-messages/status", async (request, reply) => {
    const { organizationId } = request.auth;
    const setting = await fastify.prisma.vendorSetting.findUnique({
      where: { organizationId_key: { organizationId, key: "marketing_messages_enabled" } },
    });
    return reply.send({ data: { enabled: setting?.value === "true" } });
  });
};
