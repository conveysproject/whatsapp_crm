import fp from "fastify-plugin";
import { Server as SocketIOServer } from "socket.io";
import type { FastifyInstance } from "fastify";
import { setIo } from "../lib/io-ref.js";

declare module "fastify" {
  interface FastifyInstance {
    io: SocketIOServer;
  }
}

export default fp(async (fastify: FastifyInstance) => {
  const io = new SocketIOServer(fastify.server, {
    cors: {
      origin: (process.env["CORS_ORIGIN"] ?? "http://localhost:3000")
        .split(",")
        .map((o) => o.trim()),
      methods: ["GET", "POST"],
    },
  });

  setIo(io);

  // GAP-S37: room format is `org:{organizationId}`; clients emit "join-org" with orgId to subscribe.
  // WhatsJet used Pusher `private channel vendor-channel.{vendorUid}` — TrustCRM uses Socket.io rooms instead.
  io.on("connection", (socket) => {
    socket.on("join-org", (organizationId: string) => {
      void socket.join(`org:${organizationId}`);
    });
    socket.on("join-user", (userId: string) => {
      void socket.join(`user:${userId}`);
    });
  });

  fastify.decorate("io", io);

  fastify.addHook("onClose", async () => {
    await io.close();
  });
});
