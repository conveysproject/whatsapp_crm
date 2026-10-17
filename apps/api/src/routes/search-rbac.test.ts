// Global search must respect permissions, visibility and phone masking (fix-all-gaps, 2026-10-17).
import { describe, it, expect, beforeEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";

const mockPrisma = {
  contact: { findMany: vi.fn() },
  conversation: { findMany: vi.fn() },
  message: { findMany: vi.fn() },
  team: { findFirst: vi.fn() },
  user: { findMany: vi.fn() },
};

async function buildAs(role: string, extra: Record<string, string> = {}): Promise<FastifyInstance> {
  const { defaultsForRole } = await import("../lib/default-role-permissions.js");
  const app = Fastify({ logger: false });
  app.decorate("prisma", mockPrisma as unknown as PrismaClient);
  app.addHook("onRequest", async (req) => {
    req.auth = { userId: "u-1", organizationId: "org-1", role: role as "agent", permissions: { ...defaultsForRole(role), ...extra }, teamId: null, teamRole: null };
  });
  const { searchRouter } = await import("./search.js");
  await app.register(searchRouter, { prefix: "/v1" });
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.contact.findMany.mockResolvedValue([{ id: "c1", name: "Alice", phoneNumber: "+919876543210", email: "alice@acme.com" }]);
  mockPrisma.conversation.findMany.mockResolvedValue([{ id: "v1", whatsappContactId: "919876543210", status: "open", lastMessageAt: null }]);
  mockPrisma.message.findMany.mockResolvedValue([{ id: "m1", conversationId: "v1", body: "hello", sentAt: null }]);
});

describe("GET /v1/search RBAC", () => {
  it("whatsappAdmin (no contacts/inbox access) gets nothing and nothing is queried", async () => {
    const app = await buildAs("whatsappAdmin");
    const res = await app.inject({ method: "GET", url: "/v1/search?q=al" });
    expect(res.statusCode).toBe(200);
    const d = res.json<{ data: Record<string, unknown[]> }>().data;
    expect(d.contacts).toEqual([]); expect(d.conversations).toEqual([]); expect(d.messages).toEqual([]);
    expect(mockPrisma.contact.findMany).not.toHaveBeenCalled();
    expect(mockPrisma.message.findMany).not.toHaveBeenCalled();
    await app.close();
  });

  it("agent: contacts/conversations/messages limited to what they can see", async () => {
    const app = await buildAs("agent");
    await app.inject({ method: "GET", url: "/v1/search?q=al" });
    expect(mockPrisma.contact.findMany.mock.calls[0]![0].where).toMatchObject({ organizationId: "org-1", assignedUserId: "u-1" });
    expect(mockPrisma.conversation.findMany.mock.calls[0]![0].where).toMatchObject({ organizationId: "org-1", assignedTo: "u-1" });
    expect(mockPrisma.message.findMany.mock.calls[0]![0].where).toMatchObject({ organizationId: "org-1", conversation: { assignedTo: "u-1" } });
    await app.close();
  });

  it("assigned_chats_only limits conversations and messages to own chats", async () => {
    const app = await buildAs("manager", { assigned_chats_only: "allow" });
    await app.inject({ method: "GET", url: "/v1/search?q=al" });
    expect(mockPrisma.conversation.findMany.mock.calls[0]![0].where).toMatchObject({ assignedTo: "u-1" });
    expect(mockPrisma.message.findMany.mock.calls[0]![0].where).toMatchObject({ conversation: { assignedTo: "u-1" } });
    await app.close();
  });

  it("masks phone and email when hide-contact-fields is on", async () => {
    const app = await buildAs("agent", { "hide_phone_number@hide_contact_fields": "allow" });
    const res = await app.inject({ method: "GET", url: "/v1/search?q=al" });
    const d = res.json<{ data: { contacts: { phoneNumber: string; email: string }[]; conversations: { whatsappContactId: string }[] } }>().data;
    expect(d.contacts[0]!.phoneNumber).not.toContain("9876543210");
    expect(d.contacts[0]!.email).not.toBe("alice@acme.com");
    expect(d.conversations[0]!.whatsappContactId).not.toContain("9876543210");
    await app.close();
  });

  it("admin sees everything org-wide, unmasked", async () => {
    const app = await buildAs("admin");
    const res = await app.inject({ method: "GET", url: "/v1/search?q=al" });
    expect(mockPrisma.contact.findMany.mock.calls[0]![0].where).not.toHaveProperty("assignedUserId");
    expect(res.json<{ data: { contacts: { phoneNumber: string }[] } }>().data.contacts[0]!.phoneNumber).toBe("+919876543210");
    await app.close();
  });
});
