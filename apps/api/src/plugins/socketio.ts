import fp from "fastify-plugin";
import { Server as SocketIOServer } from "socket.io";
import type { FastifyInstance } from "fastify";
import { setIo } from "../lib/io-ref.js";
import { onSessionsRevoked } from "../auth/session-events.js";
import { authenticateSocket, canJoinRoom, type SocketIdentity } from "../lib/socket-auth.js";

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

  // Rooms: `org:{organizationId}` and `user:{userId}`. The handshake must carry a Clerk session token
  // (`auth: { token }`); the socket is joined to its OWN rooms only. join-*/leave-* events from older
  // clients are honoured only for those same rooms.
  io.use((socket, next) => {
    authenticateSocket(fastify.prisma, (socket.handshake.auth as { token?: unknown } | undefined)?.token)
      .then((identity) => {
        socket.data.identity = identity;
        next();
      })
      .catch(() => next(new Error("unauthorized")));
  });

  // Own-auth: closing a session drops its live sockets, but only the sockets on THIS API instance.
  // With more than one replica, add @socket.io/redis-adapter so the disconnect reaches every instance.
  const unsubscribeRevoke = onSessionsRevoked((ids) => {
    for (const id of ids) io.in(`sid:${id}`).disconnectSockets(true);
  });

  io.on("connection", (socket) => {
    const identity = socket.data.identity as SocketIdentity;
    if (identity.sid) void socket.join(`sid:${identity.sid}`);
    void socket.join(`org:${identity.organizationId}`);
    void socket.join(`user:${identity.userId}`);
    socket.on("join-org", (organizationId: unknown) => {
      if (canJoinRoom(identity, "org", organizationId)) void socket.join(`org:${identity.organizationId}`);
    });
    socket.on("join-user", (userId: unknown) => {
      if (canJoinRoom(identity, "user", userId)) void socket.join(`user:${identity.userId}`);
    });
    socket.on("leave-org", (organizationId: unknown) => {
      if (canJoinRoom(identity, "org", organizationId)) void socket.leave(`org:${identity.organizationId}`);
    });
    socket.on("leave-user", (userId: unknown) => {
      if (canJoinRoom(identity, "user", userId)) void socket.leave(`user:${identity.userId}`);
    });
  });

  fastify.decorate("io", io);

  fastify.addHook("onClose", async () => {
    unsubscribeRevoke();
    await io.close();
  });
});
