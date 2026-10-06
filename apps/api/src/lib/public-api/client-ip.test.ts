import { describe, it, expect } from "vitest";
import { clientIp } from "./client-ip.js";

const RAILWAY_PEER = "100.64.0.7"; // what the API sees for every request behind Railway's proxy

describe("clientIp", () => {
  it("uses the socket address when the peer is a public address (direct connection): forwarded headers are never trusted", () => {
    expect(clientIp("198.51.100.20", "203.0.113.5")).toBe("198.51.100.20");
    expect(clientIp("198.51.100.20", "203.0.113.5", "203.0.113.6")).toBe("198.51.100.20");
  });

  it("behind the proxy: returns the client address from X-Forwarded-For", () => {
    expect(clientIp(RAILWAY_PEER, "203.0.113.5")).toBe("203.0.113.5");
  });

  it("a visitor cannot choose their bucket: spoofed leading entries are ignored (rightmost public entry wins)", () => {
    expect(clientIp(RAILWAY_PEER, "9.9.9.9, 203.0.113.5")).toBe("203.0.113.5");
    expect(clientIp(RAILWAY_PEER, "1.1.1.1, 2.2.2.2, 203.0.113.5")).toBe("203.0.113.5");
  });

  it("skips our own proxy hops (private / CGNAT / loopback / link-local) from the right", () => {
    expect(clientIp(RAILWAY_PEER, "203.0.113.5, 100.64.0.9")).toBe("203.0.113.5");
    expect(clientIp(RAILWAY_PEER, "203.0.113.5, 10.1.2.3, 172.16.0.4, 192.168.1.1, 127.0.0.1, 169.254.1.1")).toBe("203.0.113.5");
  });

  it("a spoofed PRIVATE leading entry does not matter", () => {
    expect(clientIp(RAILWAY_PEER, "10.0.0.1, 203.0.113.5")).toBe("203.0.113.5");
  });

  it("when every entry is private (internal caller) returns the rightmost entry", () => {
    expect(clientIp(RAILWAY_PEER, "10.0.0.1, 10.0.0.2")).toBe("10.0.0.2");
  });

  it("skips garbage entries and falls back to X-Real-IP, then to the peer", () => {
    expect(clientIp(RAILWAY_PEER, "unknown, , abc, 203.0.113.5")).toBe("203.0.113.5");
    expect(clientIp(RAILWAY_PEER, "unknown, abc", "203.0.113.9")).toBe("203.0.113.9");
    expect(clientIp(RAILWAY_PEER, "unknown", "not-an-ip")).toBe(RAILWAY_PEER);
    expect(clientIp(RAILWAY_PEER, undefined, undefined)).toBe(RAILWAY_PEER);
  });

  it("handles ports, IPv6 and bracketed IPv6 forms", () => {
    expect(clientIp(RAILWAY_PEER, "203.0.113.5:4711")).toBe("203.0.113.5");
    expect(clientIp(RAILWAY_PEER, "[2001:db8::1]:443")).toBe("2001:db8::1");
    expect(clientIp(RAILWAY_PEER, "2001:DB8::1")).toBe("2001:db8::1");
    expect(clientIp(RAILWAY_PEER, "::ffff:203.0.113.5")).toBe("203.0.113.5");
  });

  it("accepts array-valued headers (repeated header lines)", () => {
    expect(clientIp(RAILWAY_PEER, ["9.9.9.9", "203.0.113.5"])).toBe("203.0.113.5");
  });

  it("treats an IPv4-mapped IPv6 peer like its IPv4 address", () => {
    expect(clientIp("::ffff:100.64.0.7", "203.0.113.5")).toBe("203.0.113.5");
    expect(clientIp("::ffff:198.51.100.20", "203.0.113.5")).toBe("198.51.100.20");
  });

  it("returns a non-IP peer unchanged (never trusts headers when the peer is not a valid address)", () => {
    expect(clientIp("undefined", "203.0.113.5")).toBe("undefined");
  });

  it("bounds the work for a hostile header (many entries, huge string)", () => {
    const many = Array.from({ length: 5000 }, (_, i) => `9.9.${i % 255}.${i % 250}`).join(", ") + ", 203.0.113.5";
    expect(clientIp(RAILWAY_PEER, many)).toBe("203.0.113.5");
    expect(clientIp(RAILWAY_PEER, "x".repeat(200_000))).toBe(RAILWAY_PEER);
  });
});
