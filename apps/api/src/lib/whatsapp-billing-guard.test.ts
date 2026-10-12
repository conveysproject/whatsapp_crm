import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// A blocked customer must never reach Meta through ANY of the send functions. The real functions run here;
// only the database and the network are faked.
const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    organization: { findFirst: vi.fn(), findUnique: vi.fn() },
    vendorSetting: { findFirst: vi.fn() },
    billingStatement: { findMany: vi.fn() },
    billingSetting: { findUnique: vi.fn() },
    billingCancellation: { findUnique: vi.fn() },
  },
}));
vi.mock("./prisma.js", () => ({ prisma: prismaMock }));
vi.mock("./register-phone-enqueue.js", () => ({ onPhoneStatusPending: vi.fn() }));

import {
  sendTextMessage, sendMediaMessage, sendTemplateMessage, sendInteractiveMessage, sendLocationMessage, sendMarketingTemplateMessage,
} from "./whatsapp.js";
import { BillingBlockedError, resetSendGuardCaches } from "./billing/send-guard.js";

const DAY = 86_400_000;
const config = (mode: string) => ({ value: { published: true, freeAllowance: 500, alertsEnabled: false, chargingStartDate: null, gstRatePercent: 0, autoIssueEnabled: false, blockingMode: mode, bands: [{ upTo: 10000, inr: 500, usd: 5 }] } });

const senders: Array<[string, () => Promise<unknown>]> = [
  ["sendTextMessage", () => sendTextMessage("pn1", "911", "hi", "tok")],
  ["sendMediaMessage", () => sendMediaMessage("pn1", "911", "image", "media-1", "caption", "tok")],
  ["sendTemplateMessage", () => sendTemplateMessage("pn1", "911", "promo", "en_US", [], "tok")],
  ["sendInteractiveMessage", () => sendInteractiveMessage("pn1", "911", { type: "button", body: { text: "x" }, action: { buttons: [] } } as never, "tok")],
  ["sendLocationMessage", () => sendLocationMessage("pn1", "911", { latitude: 1, longitude: 2 } as never, "tok")],
  ["sendMarketingTemplateMessage", () => sendMarketingTemplateMessage("pn1", "911", "promo", "en_US", [], "tok")],
];

describe("every send to Meta goes through the payment guard", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    resetSendGuardCaches();
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset().mockResolvedValue({ ok: true, json: async () => ({ messages: [{ id: "wamid.1" }] }) });
    [prismaMock.organization.findFirst, prismaMock.organization.findUnique, prismaMock.vendorSetting.findFirst, prismaMock.billingStatement.findMany, prismaMock.billingSetting.findUnique, prismaMock.billingCancellation.findUnique].forEach((m) => m.mockReset());
    prismaMock.billingCancellation.findUnique.mockResolvedValue(null);
    prismaMock.organization.findFirst.mockResolvedValue({ id: "o1" });
    prismaMock.organization.findUnique.mockResolvedValue({ name: "Acme", settings: {} });
    prismaMock.billingSetting.findUnique.mockResolvedValue(config("enforce"));
    prismaMock.billingStatement.findMany.mockResolvedValue([{ month: "2026-10-14", dueAt: new Date(Date.now() - 10 * DAY) }]);
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  for (const [name, send] of senders) {
    it(`${name} refuses a blocked customer and never calls Meta`, async () => {
      await expect(send()).rejects.toBeInstanceOf(BillingBlockedError);
      expect(fetchMock).not.toHaveBeenCalled();
    });
    it(`${name} still sends for a customer in good standing`, async () => {
      prismaMock.billingStatement.findMany.mockResolvedValue([]);
      await expect(send()).resolves.toBeDefined();
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  }

  for (const [name, send] of senders) {
    it(`${name} refuses a cancelled account and never calls Meta`, async () => {
      prismaMock.billingCancellation.findUnique.mockResolvedValue({ status: "approved" });
      prismaMock.billingStatement.findMany.mockResolvedValue([]);
      await expect(send()).rejects.toMatchObject({ code: "ACCOUNT_CANCELLED" });
      expect(fetchMock).not.toHaveBeenCalled();
    });
  }

  it("lets every send through while blocking is in watch or off mode", async () => {
    for (const mode of ["watch", "off"]) {
      resetSendGuardCaches();
      fetchMock.mockClear();
      prismaMock.billingSetting.findUnique.mockResolvedValue(config(mode));
      const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
      await sendTextMessage("pn1", "911", "hi", "tok");
      warn.mockRestore();
      expect(fetchMock, mode).toHaveBeenCalledTimes(1);
    }
  });

  it("never blocks when the billing lookup itself fails", async () => {
    prismaMock.organization.findFirst.mockRejectedValue(new Error("db down"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await expect(sendTextMessage("pn1", "911", "hi", "tok")).resolves.toBeDefined();
    warn.mockRestore();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
