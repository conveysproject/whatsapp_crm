import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import type { AddressInfo } from "node:net";
import { io as ioClient, type Socket } from "socket.io-client";
import "./socketio.js";

vi.mock("../lib/clerk.js", () => ({
  verifyClerkToken: vi.fn(async (h: string) => {
    if (h === "Bearer good-1") return { userId: "u-1" };
    throw new Error("bad token");
  }),
}));

const mockPrisma = {
  user: { findFirst: vi.fn(async ({ where }: { where: { id: string } }) => (where.id === "u-1" ? { organizationId: "org-1" } : null)) },
};

let app: FastifyInstance;
let url: string;
const clients: Socket[] = [];

function connect(token?: string): Socket {
  const s = ioClient(url, { auth: token ? { token } : {}, transports: ["websocket"], reconnection: false });
  clients.push(s);
  return s;
}

beforeEach(async () => {
  app = Fastify({ logger: false });
  app.decorate("prisma", mockPrisma as unknown as PrismaClient);
  const { default: socketio } = await import("./socketio.js");
  await app.register(socketio);
  // Registered after the plugin's own handlers, so the ack proves earlier events were processed.
  app.io.on("connection", (sock) => sock.on("ping-test", (ack: () => void) => ack()));
  await app.listen({ port: 0, host: "127.0.0.1" });
  url = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
});

afterEach(async () => {
  clients.splice(0).forEach((c) => c.close());
  await app.close();
});

describe("socket.io authentication", () => {
  it("rejects a handshake without a valid token", async () => {
    const s = connect("bad");
    const err = await new Promise<Error>((resolve) => s.on("connect_error", resolve));
    expect(err.message).toBe("unauthorized");
  });

  it("puts an authenticated socket in its own org room and ignores foreign joins", async () => {
    const s = connect("good-1");
    await new Promise<void>((resolve) => s.on("connect", () => resolve()));
    // Deterministic: the ack arrives after the server processed the earlier join-org (events are ordered).
    s.emit("join-org", "org-2");
    await new Promise<void>((resolve) => s.emit("ping-test", () => resolve()));
    const own = new Promise<unknown>((resolve) => s.on("own", resolve));
    let leaked = false;
    s.on("foreign", () => { leaked = true; });
    app.io.to("org:org-2").emit("foreign", {});
    app.io.to("org:org-1").emit("own", { ok: true });
    await expect(own).resolves.toEqual({ ok: true });
    await new Promise((r) => setTimeout(r, 50));
    expect(leaked).toBe(false);
  });
});
