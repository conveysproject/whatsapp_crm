import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import type { AddressInfo } from "node:net";
import { io as ioClient, type Socket } from "socket.io-client";
import { emitSessionsRevoked } from "../auth/session-events.js";
import "./socketio.js";

vi.mock("../auth/identity.js", () => ({
  verifyBearer: vi.fn(async (h: string) => {
    if (h === "Bearer good-1") return { userId: "u-1", sid: null, typ: "user" };
    if (h === "Bearer sid-a") return { userId: "u-1", sid: "sess-a", typ: "user" };
    if (h === "Bearer sid-b") return { userId: "u-1", sid: "sess-b", typ: "user" };
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

describe("session revoke disconnects", () => {
  const up = (s: Socket) => new Promise<void>((resolve) => s.on("connect", () => resolve()));
  const down = (s: Socket) => new Promise<void>((resolve) => s.on("disconnect", () => resolve()));

  it("disconnects only sockets of the revoked session", async () => {
    const a = connect("sid-a");
    const b = connect("sid-b");
    await Promise.all([up(a), up(b)]);
    const aDown = down(a);
    emitSessionsRevoked(["sess-a"]);
    await aDown;
    await new Promise((r) => setTimeout(r, 50));
    expect(a.connected).toBe(false);
    expect(b.connected).toBe(true);
  });

  it("never puts a socket with no session id (sid null) in a sid room", async () => {
    const c = connect("good-1");
    await up(c);
    await new Promise<void>((resolve) => c.emit("ping-test", () => resolve()));
    const rooms = [...app.io.sockets.sockets.values()][0]!.rooms;
    expect([...rooms].some((r) => r.startsWith("sid:"))).toBe(false);
    emitSessionsRevoked(["null", "undefined"]);
    await new Promise((r) => setTimeout(r, 50));
    expect(c.connected).toBe(true);
  });

  it("removes its listener when the server closes", async () => {
    const spy = vi.spyOn(app.io, "in");
    await app.close();
    emitSessionsRevoked(["sess-a"]);
    expect(spy).not.toHaveBeenCalled();
    app = Fastify({ logger: false });
  });
});
