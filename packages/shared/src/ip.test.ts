import { describe, expect, it } from "vitest";
import { isIpLiteral, isPublicAddress, normalizeIpv4Mapped, parseDottedQuadIpv4, parseIpv6 } from "./ip.js";

describe("isPublicAddress: unsafe", () => {
  const unsafe = [
    "127.0.0.1", "127.255.255.254", "0.0.0.0", "0.1.2.3", "::1", "::",
    "10.0.0.1", "172.16.0.1", "172.31.255.255", "192.168.1.1", "fc00::1", "fd12:3456::1", "fd00::1",
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
    "2001:10::1", "2001:1f:ffff::1", "2001:20::1", "2001:2f::1", "2001:2::1", "2001:2:0:1::1",
    "fec0::1", "fe80::1%eth0", "::ffff:0:1.2.3.4",
  ];
  it.each(unsafe)("%s is not public", (ip) => {
    expect(isPublicAddress(ip)).toBe(false);
  });
});

describe("isPublicAddress: public", () => {
  it.each([
    "93.184.216.34", "8.8.8.8", "1.1.1.1", "172.15.0.1", "172.32.0.1", "100.63.0.1", "100.128.0.1", "198.17.0.1", "198.20.0.1",
    "2606:2800:220:1:248:1893:25c8:1946", "2a00:1450:4001::200e", "::ffff:93.184.216.34", "64:ff9b::5db8:d822", "2002:5db8:d822::1",
    "2001:4860:4860::8888", "2001:3::1", "2001:30::1", "2001:2:1::1",
  ])("%s is public", (ip) => {
    expect(isPublicAddress(ip)).toBe(true);
  });
  it.each(["", "not-an-ip", "1.2.3", "2130706433", "0x7f.0.0.1", "127.0.0.01", "1.2.3.256", "1:2:3", "1::2::3", "gggg::1", "12345::1"])(
    "%j is not a valid literal and is refused",
    (ip) => {
      expect(isPublicAddress(ip)).toBe(false);
      expect(isIpLiteral(ip)).toBe(false);
    },
  );
});

describe("parsers", () => {
  it("parseDottedQuadIpv4 is strict", () => {
    expect(parseDottedQuadIpv4("1.2.3.4")).toEqual([1, 2, 3, 4]);
    for (const s of ["01.2.3.4", "1.2.3", "1.2.3.4.5", "256.0.0.1", "1.2.3.-4", "0x1.2.3.4", " 1.2.3.4"]) expect(parseDottedQuadIpv4(s)).toBeNull();
  });
  it("parseIpv6 expands compressed forms", () => {
    expect(parseIpv6("::1")).toEqual([0, 0, 0, 0, 0, 0, 0, 1]);
    expect(parseIpv6("2001:db8::")).toEqual([0x2001, 0xdb8, 0, 0, 0, 0, 0, 0]);
    expect(parseIpv6("::ffff:1.2.3.4")).toEqual([0, 0, 0, 0, 0, 0xffff, 0x102, 0x304]);
    expect(parseIpv6("1:2:3:4:5:6:7:8")).toHaveLength(8);
    for (const s of ["1:2:3:4:5:6:7", "1:2:3:4:5:6:7:8:9", "1:2:3:4:5:6:7::8", "[::1]", "::1%lo"]) expect(parseIpv6(s)).toBeNull();
  });
});

describe("normalizeIpv4Mapped", () => {
  it("turns a mapped address into its IPv4", () => {
    expect(normalizeIpv4Mapped("::ffff:93.184.216.34")).toEqual({ address: "93.184.216.34", family: 4 });
    expect(normalizeIpv4Mapped("::FFFF:5db8:d822")).toEqual({ address: "93.184.216.34", family: 4 });
  });
  it("leaves other addresses alone", () => {
    expect(normalizeIpv4Mapped("93.184.216.34")).toEqual({ address: "93.184.216.34", family: 4 });
    expect(normalizeIpv4Mapped("2606:2800:220:1::1")).toEqual({ address: "2606:2800:220:1::1", family: 6 });
  });
  it("returns null for non-literals", () => {
    expect(normalizeIpv4Mapped("example.com")).toBeNull();
    expect(normalizeIpv4Mapped("2130706433")).toBeNull();
  });
});
