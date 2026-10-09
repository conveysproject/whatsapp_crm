import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PrismaClient } from "@prisma/client";

vi.mock("./io-ref.js", () => ({ getIo: () => null }));

import { recordOutbound } from "./record-outbound.js";

const mockPrisma = {
  message: { create: vi.fn().mockResolvedValue({}) },
  conversation: { update: vi.fn().mockResolvedValue({}) },
};
const prisma = mockPrisma as unknown as PrismaClient;
const base = { conversationId: "conv-1", organizationId: "org-1", contentType: "template", body: "welcome" };
const createdData = () => (mockPrisma.message.create.mock.calls[0]![0] as { data: Record<string, unknown> }).data;

describe("recordOutbound", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("writes templateId and source when given", async () => {
    await recordOutbound(prisma, { ...base, templateId: "tpl-1", source: "campaign" });
    expect(createdData()).toMatchObject({ conversationId: "conv-1", organizationId: "org-1", direction: "outbound", templateId: "tpl-1", source: "campaign" });
  });

  it("writes null for both columns when they are not given", async () => {
    await recordOutbound(prisma, { ...base, contentType: "text" });
    expect(createdData()).toMatchObject({ templateId: null, source: null });
  });

  it("writes null templateId when only a source is given", async () => {
    await recordOutbound(prisma, { ...base, source: "flow" });
    expect(createdData()).toMatchObject({ templateId: null, source: "flow" });
  });
});
