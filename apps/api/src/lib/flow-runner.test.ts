import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PrismaClient } from "@prisma/client";

const { wa, recordOutbound } = vi.hoisted(() => ({
  wa: { sendTemplateMessage: vi.fn() },
  recordOutbound: vi.fn(),
}));
vi.mock("./whatsapp.js", () => ({
  sendTextMessage: vi.fn(),
  sendMediaMessage: vi.fn(),
  sendInteractiveMessage: vi.fn(),
  sendTemplateMessage: wa.sendTemplateMessage,
}));
vi.mock("./queue.js", () => ({ resumeFlowQueue: { add: vi.fn() } }));
vi.mock("./record-outbound.js", () => ({ recordOutbound }));

import { runFlow, type FlowDefinition } from "./flow-runner.js";

const mockPrisma = {
  flowRun: { create: vi.fn(), update: vi.fn() },
  organization: { findUnique: vi.fn() },
  contact: { findFirst: vi.fn() },
  template: { findMany: vi.fn() },
};
const prisma = mockPrisma as unknown as PrismaClient;

const flow = {
  startNodeId: "n1",
  nodes: [
    { id: "n1", type: "send_template", config: { templateName: "welcome", languageCode: "en_US", components: [] }, next: null },
  ],
} as unknown as FlowDefinition;
const payload = { conversationId: "conv-1", organizationId: "org-1", contactPhone: "919999999999" };

describe("runFlow send_template", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mockPrisma.flowRun.create.mockResolvedValue({ id: "run-1" });
    mockPrisma.flowRun.update.mockResolvedValue({});
    mockPrisma.organization.findUnique.mockResolvedValue({ phoneNumberId: "pn-1", wabaAccessToken: "tok" });
    mockPrisma.contact.findFirst.mockResolvedValue(null);
    wa.sendTemplateMessage.mockResolvedValue({ messageId: "wamid-1" });
  });

  it("looks the template up by org, name and language and records templateId and source=flow for exactly one match", async () => {
    mockPrisma.template.findMany.mockResolvedValue([{ id: "tpl-1" }]);
    await runFlow(prisma, "flow-1", flow, payload);
    expect(mockPrisma.template.findMany).toHaveBeenCalledWith({
      where: { organizationId: "org-1", name: "welcome", language: "en_US" },
      select: { id: true },
      take: 2,
    });
    expect(recordOutbound).toHaveBeenCalledWith(prisma, expect.objectContaining({
      contentType: "template", body: "welcome", whatsappMessageId: "wamid-1", templateId: "tpl-1", source: "flow",
    }));
  });

  it("passes no templateId when no template matches", async () => {
    mockPrisma.template.findMany.mockResolvedValue([]);
    await runFlow(prisma, "flow-1", flow, payload);
    const args = recordOutbound.mock.calls[0]![1] as Record<string, unknown>;
    expect(args.source).toBe("flow");
    expect(args.templateId).toBeUndefined();
  });

  it("passes no templateId when more than one template matches", async () => {
    mockPrisma.template.findMany.mockResolvedValue([{ id: "tpl-1" }, { id: "tpl-2" }]);
    await runFlow(prisma, "flow-1", flow, payload);
    const args = recordOutbound.mock.calls[0]![1] as Record<string, unknown>;
    expect(args.source).toBe("flow");
    expect(args.templateId).toBeUndefined();
  });

  it("swallows a lookup error and still sends and records the step", async () => {
    mockPrisma.template.findMany.mockRejectedValue(new Error("db down"));
    await runFlow(prisma, "flow-1", flow, payload);
    expect(wa.sendTemplateMessage).toHaveBeenCalledTimes(1);
    const args = recordOutbound.mock.calls[0]![1] as Record<string, unknown>;
    expect(args.source).toBe("flow");
    expect(args.templateId).toBeUndefined();
    expect(mockPrisma.flowRun.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "completed" }) }));
  });
});
