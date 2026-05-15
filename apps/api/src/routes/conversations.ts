import type { FastifyPluginAsync } from "fastify";
import type { ConversationStatus } from "@prisma/client";
import type { ConversationId } from "@WBMSG/shared";
import { getIo } from "../lib/io-ref.js";

export const conversationsRouter: FastifyPluginAsync = async (fastify) => {
  // ── List with status / assignee filters ────────────────────────────────
  fastify.get<{
    Querystring: { status?: string; assignedTo?: string; page?: string };
  }>("/conversations", async (request, reply) => {
    const { organizationId } = request.auth;
    const { status, assignedTo, page } = request.query;
    const pageNum = Math.max(1, parseInt(page ?? "1", 10));

    const where: Record<string, unknown> = { organizationId };
    if (status) where.status = status;
    if (assignedTo) where.assignedTo = assignedTo;

    const conversations = await fastify.prisma.conversation.findMany({
      where,
      include: { contact: { select: { firstName: true, lastName: true, phoneNumber: true } } },
      orderBy: { lastMessageAt: "desc" },
      skip: (pageNum - 1) * 50,
      take: 50,
    });
    return reply.send({ data: conversations });
  });

  fastify.get<{ Params: { id: ConversationId } }>(
    "/conversations/:id/messages",
    async (request, reply) => {
      const { organizationId } = request.auth;
      const conversation = await fastify.prisma.conversation.findFirst({
        where: { id: request.params.id, organizationId },
      });
      if (!conversation) {
        return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Conversation not found" } });
      }
      const messages = await fastify.prisma.message.findMany({
        where: { conversationId: request.params.id },
        orderBy: { sentAt: "asc" },
        take: 100,
      });
      return reply.send({ data: messages });
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
      const validStatuses = ["open", "closed", "pending"];
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
};
