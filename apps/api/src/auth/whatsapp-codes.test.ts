import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ sendTemplateMessage: vi.fn(), hitLimit: vi.fn() }));
vi.mock("../lib/whatsapp.js", () => ({ sendTemplateMessage: m.sendTemplateMessage }));
vi.mock("./limits.js", () => ({ hitLimit: m.hitLimit }));

import { sendWhatsappCode, whatsappAuthConfig, whatsappDailyCap, whatsappDailyCapHit } from "./whatsapp-codes.js";

const prisma = { organization: { findUnique: vi.fn() } };

beforeEach(() => {
  vi.clearAllMocks();
  process.env["AUTH_WHATSAPP_ORG_ID"] = "org_conveys";
  process.env["AUTH_WHATSAPP_TEMPLATE"] = "wbmsg_login_code";
  delete process.env["AUTH_WHATSAPP_TEMPLATE_LANG"];
  prisma.organization.findUnique.mockResolvedValue({ phoneNumberId: "pn1", wabaAccessToken: "tok" });
  m.sendTemplateMessage.mockResolvedValue({ messageId: "wamid" });
});
afterEach(() => {
  delete process.env["AUTH_WHATSAPP_ORG_ID"];
  delete process.env["AUTH_WHATSAPP_TEMPLATE"];
});

describe("whatsappAuthConfig", () => {
  it("is null unless both the org id and template name are set", () => {
    expect(whatsappAuthConfig()).toEqual({ orgId: "org_conveys", template: "wbmsg_login_code", language: "en_US" });
    process.env["AUTH_WHATSAPP_TEMPLATE_LANG"] = "en";
    expect(whatsappAuthConfig()?.language).toBe("en");
    delete process.env["AUTH_WHATSAPP_TEMPLATE"];
    expect(whatsappAuthConfig()).toBeNull();
    process.env["AUTH_WHATSAPP_TEMPLATE"] = "x";
    process.env["AUTH_WHATSAPP_ORG_ID"] = " ";
    expect(whatsappAuthConfig()).toBeNull();
  });
});

describe("sendWhatsappCode", () => {
  it("sends the authentication template from the configured org with body + copy-code button", async () => {
    await sendWhatsappCode(prisma as never, "+918779506101", "123456");
    expect(prisma.organization.findUnique).toHaveBeenCalledWith({
      where: { id: "org_conveys" },
      select: { phoneNumberId: true, wabaAccessToken: true },
    });
    expect(m.sendTemplateMessage).toHaveBeenCalledWith("pn1", "918779506101", "wbmsg_login_code", "en_US", [
      { type: "body", parameters: [{ type: "text", text: "123456" }] },
      { type: "button", sub_type: "url", index: 0, parameters: [{ type: "text", text: "123456" }] },
    ], "tok");
  });

  it("throws when disabled, when the org has no WhatsApp number, or for a malformed code", async () => {
    await expect(sendWhatsappCode(prisma as never, "+91", "12345")).rejects.toThrow();
    prisma.organization.findUnique.mockResolvedValue({ phoneNumberId: null, wabaAccessToken: "tok" });
    await expect(sendWhatsappCode(prisma as never, "+918779506101", "123456")).rejects.toThrow("not connected");
    delete process.env["AUTH_WHATSAPP_ORG_ID"];
    await expect(sendWhatsappCode(prisma as never, "+918779506101", "123456")).rejects.toThrow("disabled");
    expect(m.sendTemplateMessage).not.toHaveBeenCalled();
  });

  it("propagates a send failure", async () => {
    m.sendTemplateMessage.mockRejectedValue(new Error("WA template send failed"));
    await expect(sendWhatsappCode(prisma as never, "+918779506101", "123456")).rejects.toThrow("WA template");
  });
});

describe("global daily cap", () => {
  afterEach(() => {
    delete process.env["AUTH_WHATSAPP_DAILY_CAP"];
  });

  it("defaults to 500 and reads AUTH_WHATSAPP_DAILY_CAP", () => {
    expect(whatsappDailyCap()).toBe(500);
    process.env["AUTH_WHATSAPP_DAILY_CAP"] = "20";
    expect(whatsappDailyCap()).toBe(20);
    process.env["AUTH_WHATSAPP_DAILY_CAP"] = "junk";
    expect(whatsappDailyCap()).toBe(500);
  });

  it("counts against one Redis key per UTC day", async () => {
    process.env["AUTH_WHATSAPP_DAILY_CAP"] = "7";
    m.hitLimit.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    expect(await whatsappDailyCapHit(new Date("2026-10-18T23:59:00Z"))).toBe(false);
    expect(await whatsappDailyCapHit(new Date("2026-10-18T23:59:30Z"))).toBe(true);
    expect(m.hitLimit).toHaveBeenCalledWith("auth:wa:daily:2026-10-18", 7, 172800);
  });
});
