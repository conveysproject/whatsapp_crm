import { describe, expect, it, vi } from "vitest";
import { resolveSafeSmtpHost } from "./safe-host";

type Addr = { address: string; family: 4 | 6 };
const lookupOf = (...addrs: string[]) =>
  vi.fn(async () => addrs.map((a): Addr => ({ address: a, family: a.includes(":") ? 6 : 4 })));

describe("resolveSafeSmtpHost: unsafe literal addresses", () => {
  const unsafe = [
    "127.0.0.1", "127.255.255.254", "0.0.0.0", "0.1.2.3", "::1", "::",
    "10.0.0.1", "172.16.0.1", "172.31.255.255", "192.168.1.1", "fc00::1", "fd12:3456::1",
    "169.254.169.254", "169.254.0.1", "fe80::1", "febf::1",
    "100.64.0.1", "100.127.255.255", "198.18.0.1", "198.19.255.255",
    "192.0.0.1", "192.0.2.5", "198.51.100.5", "203.0.113.5", "2001:db8::1", "3fff::1",
    "224.0.0.1", "239.255.255.255", "ff02::1", "ff00::",
    "240.0.0.1", "255.255.255.255", "192.88.99.1",
    "::ffff:127.0.0.1", "::ffff:10.0.0.1", "::ffff:169.254.169.254", "::ffff:7f00:1", "::ffff:a9fe:a9fe",
    "::7f00:1", "::127.0.0.1", "::10.1.2.3",
    "64:ff9b::7f00:1", "64:ff9b::169.254.169.254", "64:ff9b::a00:1",
    "2002:7f00:1::1", "2002:a9fe:a9fe::1", "2002:c0a8:101::",
    "2001:0:4136:e378:8000:63bf:3fff:fdd2", "2001::1",
    "fec0::1", "fe80::1%eth0",
  ];
  it.each(unsafe)("rejects %s", async (ip) => {
    const lookup = lookupOf("93.184.216.34");
    const r = await resolveSafeSmtpHost(ip, { lookup });
    expect(r.ok).toBe(false);
    expect(lookup).not.toHaveBeenCalled();
  });
  it("classifies unsafe literals as unsafe_address", async () => {
    expect(await resolveSafeSmtpHost("169.254.169.254")).toEqual({ ok: false, reason: "unsafe_address" });
    expect(await resolveSafeSmtpHost("::ffff:127.0.0.1")).toEqual({ ok: false, reason: "unsafe_address" });
  });
});

describe("resolveSafeSmtpHost: public literals", () => {
  it("accepts a public IPv4 literal without a lookup", async () => {
    const lookup = lookupOf();
    expect(await resolveSafeSmtpHost("93.184.216.34", { lookup })).toEqual({ ok: true, address: "93.184.216.34", family: 4 });
    expect(lookup).not.toHaveBeenCalled();
  });
  it("accepts a public IPv6 literal", async () => {
    expect(await resolveSafeSmtpHost("2606:2800:220:1:248:1893:25c8:1946")).toEqual({
      ok: true, address: "2606:2800:220:1:248:1893:25c8:1946", family: 6,
    });
  });
  it("accepts mapped / 6to4 / NAT64 forms of a public IPv4", async () => {
    expect((await resolveSafeSmtpHost("::ffff:93.184.216.34")).ok).toBe(true);
    expect((await resolveSafeSmtpHost("64:ff9b::5db8:d822")).ok).toBe(true);
    expect((await resolveSafeSmtpHost("2002:5db8:d822::1")).ok).toBe(true);
  });
});

describe("resolveSafeSmtpHost: invalid hosts", () => {
  const bad = [
    "", " ", "smtp.example.com ", " smtp.example.com", "smtp example.com", "http://smtp.example.com",
    "smtp.example.com:587", "smtp.example.com/path", "user@smtp.example.com", "smtp.example.com\r\nRCPT",
    "smtp.example.com\n", "smtp.example.com\0", "smtp.example.com.", ".example.com", "a..example.com",
    "-bad.example.com", "bad-.example.com", "under_score.example.com", "[::1]", "x".repeat(254),
    "a".repeat(64) + ".example.com", "smtp.exa mple.com", "smtp.example.com?x=1", "smtp.example.com#x",
    "2130706433", "0x7f.1", "0x7f000001", "017700000001", "127.1", "127.0.1", "1.2.3", "1.2.3.4.5",
    "0177.0.0.1", "127.0.0.01", "256.1.1.1", "1.2.3.256", "192.168.1", "08.8.8.8", "example.123", "example.0x7f",
    "localhost.", 42 as unknown as string, undefined as unknown as string,
  ];
  it.each(bad.map((b) => [typeof b === "string" ? JSON.stringify(b).slice(0, 40) : String(b), b] as const))(
    "rejects %s as invalid_host",
    async (_l, h) => {
      const lookup = lookupOf("93.184.216.34");
      expect(await resolveSafeSmtpHost(h as string, { lookup })).toEqual({ ok: false, reason: "invalid_host" });
      expect(lookup).not.toHaveBeenCalled();
    },
  );
  it("accepts a 253 character hostname", async () => {
    const h = [..."abcd"].map(() => "a".repeat(61)).join(".") + ".com"; // 4*61+4 dots...
    expect(h.length).toBeLessThanOrEqual(253);
    expect((await resolveSafeSmtpHost(h, { lookup: lookupOf("93.184.216.34") })).ok).toBe(true);
  });
});

describe("resolveSafeSmtpHost: hostnames", () => {
  it("looks up with all and verbatim, and returns the first IPv4", async () => {
    const lookup = lookupOf("2606:2800:220:1::1", "93.184.216.34", "93.184.216.35");
    expect(await resolveSafeSmtpHost("smtp.example.com", { lookup })).toEqual({ ok: true, address: "93.184.216.34", family: 4 });
    expect(lookup).toHaveBeenCalledWith("smtp.example.com", { all: true, verbatim: true });
  });
  it("returns an IPv6 address when there is no IPv4", async () => {
    expect(await resolveSafeSmtpHost("smtp.example.com", { lookup: lookupOf("2606:2800:220:1::1") })).toEqual({
      ok: true, address: "2606:2800:220:1::1", family: 6,
    });
  });
  it("rejects when any address is unsafe (mixed public and private)", async () => {
    expect(await resolveSafeSmtpHost("smtp.example.com", { lookup: lookupOf("93.184.216.34", "10.0.0.5") })).toEqual({
      ok: false, reason: "unsafe_address",
    });
    expect((await resolveSafeSmtpHost("smtp.example.com", { lookup: lookupOf("93.184.216.34", "::ffff:127.0.0.1") })).ok).toBe(false);
    expect((await resolveSafeSmtpHost("smtp.example.com", { lookup: lookupOf("93.184.216.34", "fe80::1") })).ok).toBe(false);
  });
  it("rejects a name that resolves to loopback or metadata", async () => {
    expect(await resolveSafeSmtpHost("evil.example.com", { lookup: lookupOf("127.0.0.1") })).toEqual({ ok: false, reason: "unsafe_address" });
    expect(await resolveSafeSmtpHost("evil.example.com", { lookup: lookupOf("169.254.169.254") })).toEqual({ ok: false, reason: "unsafe_address" });
  });
  it("is unresolvable when lookup throws or returns nothing", async () => {
    expect(await resolveSafeSmtpHost("nx.example.com", { lookup: vi.fn(async () => { throw new Error("ENOTFOUND"); }) })).toEqual({ ok: false, reason: "unresolvable" });
    expect(await resolveSafeSmtpHost("nx.example.com", { lookup: lookupOf() })).toEqual({ ok: false, reason: "unresolvable" });
  });
  it("rejects a malformed address returned by the resolver", async () => {
    expect((await resolveSafeSmtpHost("smtp.example.com", { lookup: lookupOf("not-an-ip") })).ok).toBe(false);
  });
});

describe("resolveSafeSmtpHost: lookup deadline and normalisation", () => {
  it("gives up on a lookup that never answers after 5 seconds", async () => {
    vi.useFakeTimers();
    try {
      const lookup = vi.fn(() => new Promise<Addr[]>(() => {}));
      const p = resolveSafeSmtpHost("slow.example.com", { lookup });
      await vi.advanceTimersByTimeAsync(4999);
      let settled = false;
      void p.then(() => (settled = true));
      await Promise.resolve();
      expect(settled).toBe(false);
      await vi.advanceTimersByTimeAsync(2);
      expect(await p).toEqual({ ok: false, reason: "unresolvable" });
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
  it("clears the timer when the lookup answers", async () => {
    vi.useFakeTimers();
    try {
      expect((await resolveSafeSmtpHost("smtp.example.com", { lookup: lookupOf("93.184.216.34") })).ok).toBe(true);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
  it("normalises a public IPv4-mapped literal and resolver answer to IPv4", async () => {
    expect(await resolveSafeSmtpHost("::ffff:93.184.216.34")).toEqual({ ok: true, address: "93.184.216.34", family: 4 });
    expect(await resolveSafeSmtpHost("smtp.example.com", { lookup: lookupOf("::ffff:93.184.216.34") })).toEqual({
      ok: true, address: "93.184.216.34", family: 4,
    });
  });
  it("rejects ORCHID and benchmarking IPv6 ranges", async () => {
    for (const ip of ["2001:10::1", "2001:20::1", "2001:2::1"]) {
      expect(await resolveSafeSmtpHost(ip)).toEqual({ ok: false, reason: "unsafe_address" });
    }
  });
});
