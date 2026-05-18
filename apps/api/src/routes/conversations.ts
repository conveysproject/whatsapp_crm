import type { FastifyPluginAsync } from "fastify";
import type { ConversationStatus } from "@prisma/client";
import type { ConversationId } from "@WBMSG/shared";
import { getIo } from "../lib/io-ref.js";
import { summarizeConversation } from "../lib/claude.js";

export const conversationsRouter: FastifyPluginAsync = async (fastify) => {
  // ── List with status / assignee filters ────────────────────────────────
  fastify.get<{
    Querystring: { status?: string; assignedTo?: string; teamId?: string; page?: string };
  }>("/conversations", async (request, reply) => {
    const { organizationId } = request.auth;
    const { status, assignedTo, teamId, page } = request.query;
    const pageNum = Math.max(1, parseInt(page ?? "1", 10));

    const where: Record<string, unknown> = { organizationId };
    if (status) where.status = status;
    if (assignedTo) where.assignedTo = assignedTo;
    if (teamId) where.teamId = teamId;

    const conversations = await fastify.prisma.conversation.findMany({
      where,
      include: { contact: { select: { firstName: true, lastName: true, phoneNumber: true } } },
      orderBy: { lastMessageAt: "desc" },
      skip: (pageNum - 1) * 50,
      take: 50,
    });
    return reply.send({ data: conversations });
  });

  fastify.get<{ Params: { id: ConversationId }; Querystring: { cursor?: string; limit?: string } }>(
    "/conversations/:id/messages",
    async (request, reply) => {
      const { organizationId } = request.auth;
      const conversation = await fastify.prisma.conversation.findFirst({
        where: { id: request.params.id, organizationId },
      });
      if (!conversation) {
        return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Conversation not found" } });
      }
      const limit = Math.min(parseInt(request.query.limit ?? "50", 10), 100);
      const cursor = request.query.cursor;
      const messages = await fastify.prisma.message.findMany({
        where: {
          conversationId: request.params.id,
          ...(cursor ? { id: { lt: cursor } } : {}),
        },
        orderBy: { sentAt: "desc" },
        take: limit + 1,
      });
      const hasMore = messages.length > limit;
      const page = hasMore ? messages.slice(0, limit) : messages;
      return reply.send({
        data: page.toReversed(),
        pagination: { hasMore, nextCursor: hasMore ? page[0]?.id ?? null : null },
      });
    }
  );

  fastify.delete<{ Params: { id: ConversationId } }>(
    "/conversations/:id/history",
    async (request, reply) => {
      const { organizationId } = request.auth;
      const conversation = await fastify.prisma.conversation.findFirst({
        where: { id: request.params.id, organizationId },
      });
      if (!conversation) {
        return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Conversation not found" } });
      }
      const result = await fastify.prisma.message.deleteMany({
        where: { conversationId: request.params.id },
      });
      return reply.send({ data: { deleted: result.count } });
    }
  );

  // ── Change status (open / closed / pending) ────────────────────────────
  fastify.post<{ Params: { id: ConversationId }; Body: { status: string } }>(
    "/conversations/:id/status",
    async (request, reply) => {
      const { organizationId } = request.auth;
      const { status } = request.body;
      const validStatuses = ["open", "resolved", "pending", "bot"];
      if (!validStatuses.includes(status)) {
        return reply.status(400).send({ error: { code: "INVALID_STATUS", message: `status must be one of: ${validStatuses.join(", ")}` } });
      }
      const conversation = await fastify.prisma.conversation.findFirst({
        where: { id: request.params.id, organizationId },
      });
      if (!conversation) {
        return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Conversation not found" } });
      }
      const updated = await fastify.prisma.conversation.update({
        where: { id: conversation.id },
        data: {
          status: status as ConversationStatus,
          closedAt: status === "closed" ? new Date() : null,
        },
      });
      getIo()?.to(`org:${organizationId}`).emit("conversation:status", { conversationId: conversation.id, status });
      return reply.send({ data: updated });
    }
  );

  // ── Assign to agent ────────────────────────────────────────────────────
  fastify.post<{ Params: { id: ConversationId }; Body: { assignedTo: string | null } }>(
    "/conversations/:id/assign",
    async (request, reply) => {
      const { organizationId } = request.auth;
      const conversation = await fastify.prisma.conversation.findFirst({
        where: { id: request.params.id, organizationId },
      });
      if (!conversation) {
        return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Conversation not found" } });
      }
      const updated = await fastify.prisma.conversation.update({
        where: { id: conversation.id },
        data: { assignedTo: request.body.assignedTo },
      });
      getIo()?.to(`org:${organizationId}`).emit("conversation:assign", {
        conversationId: conversation.id,
        assignedTo: request.body.assignedTo,
      });
      return reply.send({ data: updated });
    }
  );

  // ── Mark as read (reset unreadCount) ──────────────────────────────────
  fastify.post<{ Params: { id: ConversationId } }>(
    "/conversations/:id/read",
    async (request, reply) => {
      const { organizationId } = request.auth;
      const conversation = await fastify.prisma.conversation.findFirst({
        where: { id: request.params.id, organizationId },
      });
      if (!conversation) {
        return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Conversation not found" } });
      }
      await fastify.prisma.conversation.update({
        where: { id: conversation.id },
        data: { unreadCount: 0 },
      });
      return reply.status(204).send();
    }
  );

  // ── Typing indicator (fire-and-forget Socket.io emit) ──────────────────
  fastify.post<{ Params: { id: ConversationId }; Body: { isTyping: boolean } }>(
    "/conversations/:id/typing",
    async (request, reply) => {
      const { organizationId, userId } = request.auth;
      getIo()?.to(`org:${organizationId}`).emit("typing", {
        conversationId: request.params.id,
        userId,
        isTyping: request.body.isTyping ?? true,
      });
      return reply.status(204).send();
    }
  );

  // ── AI conversation summary ────────────────────────────────────────────
  fastify.post<{ Params: { id: ConversationId } }>("/conversations/:id/summarize", async (request, reply) => {
    const { organizationId } = request.auth;
    const conversation = await fastify.prisma.conversation.findFirst({
      where: { id: request.params.id, organizationId },
      include: { contact: { select: { id: true, pastAiSummary: true } } },
    });
    if (!conversation) {
      return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Conversation not found" } });
    }
    const messages = await fastify.prisma.message.findMany({
      where: { conversationId: conversation.id },
      orderBy: { sentAt: "asc" },
      take: 100,
      select: { body: true, direction: true, sentAt: true },
    });
    const summary = await summarizeConversation(messages, conversation.contact?.pastAiSummary);
    if (conversation.contact) {
      await fastify.prisma.contact.update({
        where: { id: conversation.contact.id },
        data: { pastAiSummary: summary },
      });
    }
    return reply.send({ data: { summary } });
  });
};
