import type { FastifyPluginAsync } from "fastify";

export const notificationsRouter: FastifyPluginAsync = async (fastify) => {
  fastify.get("/notifications", async (request) => {
    const { userId, organizationId } = request.auth;
    const notifications = await fastify.prisma.notification.findMany({
      where: { organizationId, userId },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { id: true, type: true, message: true, action: true, readAt: true, createdAt: true },
    });
    const unreadCount = notifications.filter((n) => n.readAt === null).length;
    return { data: notifications, unreadCount };
  });

  fastify.put("/notifications/read-all", async (request) => {
    const { userId, organizationId } = request.auth;
    await fastify.prisma.notification.updateMany({
      where: { organizationId, userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { data: { success: true } };
  });

  fastify.put<{ Params: { id: string } }>(
    "/notifications/:id/read",
    async (request, reply) => {
      const { userId, organizationId } = request.auth;
      const notification = await fastify.prisma.notification.findFirst({
        where: { id: request.params.id, organizationId, userId },
      });
      if (!notification) {
        return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Notification not found" } });
      }
      const updated = await fastify.prisma.notification.update({
        where: { id: request.params.id },
        data: { readAt: new Date() },
      });
      return { data: updated };
    }
  );
};
