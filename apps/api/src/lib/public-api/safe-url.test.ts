import { describe, it, expect, vi } from "vitest";

vi.mock("node:dns/promises", () => ({ lookup: vi.fn() }));
import { lookup } from "node:dns/promises";
import { isPrivateIp, assertSafeCallbackUrl, UnsafeUrlError } from "./safe-url.js";

const lookupMock = vi.mocked(lookup) as unknown as ReturnType<typeof vi.fn>;

describe("isPrivateIp", () => {
  it.each(["10.0.0.1", "127.0.0.1", "169.254.169.254", "172.16.5.4", "172.31.255.255", "192.168.1.1", "0.0.0.0", "100.64.0.1", "224.0.0.1", "::1", "::", "fe80::1", "fc00::1", "fd12::1", "::ffff:10.0.0.1"])
    ("%s is private", (ip) => { expect(isPrivateIp(ip)).toBe(true); });
  it.each(["8.8.8.8", "172.32.0.1", "1.1.1.1", "2606:4700:4700::1111", "::ffff:8.8.8.8"])
    ("%s is public", (ip) => { expect(isPrivateIp(ip)).toBe(false); });
});

describe("assertSafeCallbackUrl", () => {
  it("accepts an https URL resolving to public IPs", async () => {
    lookupMock.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
    const u = await assertSafeCallbackUrl("https://client.example.com/hook");
    expect(u.hostname).toBe("client.example.com");
  });
  it("rejects http, credentials, and garbage", async () => {
    await expect(assertSafeCallbackUrl("http://client.example.com/h")).rejects.toThrow(UnsafeUrlError);
    await expect(assertSafeCallbackUrl("https://u:p@client.example.com/h")).rejects.toThrow(UnsafeUrlError);
    await expect(assertSafeCallbackUrl("not a url")).rejects.toThrow(UnsafeUrlError);
  });
  it("rejects when ANY resolved address is private", async () => {
    lookupMock.mockResolvedValue([{ address: "93.184.216.34", family: 4 }, { address: "10.0.0.5", family: 4 }]);
    await expect(assertSafeCallbackUrl("https://evil.example.com/h")).rejects.toThrow(UnsafeUrlError);
  });
  it("rejects a literal private IP host without a DNS lookup", async () => {
    lookupMock.mockClear();
    await expect(assertSafeCallbackUrl("https://127.0.0.1/h")).rejects.toThrow(UnsafeUrlError);
    expect(lookupMock).not.toHaveBeenCalled();
  });
  it("rejects when DNS fails", async () => {
    lookupMock.mockRejectedValue(new Error("ENOTFOUND"));
    await expect(assertSafeCallbackUrl("https://nope.example.com/h")).rejects.toThrow(UnsafeUrlError);
  });
});
