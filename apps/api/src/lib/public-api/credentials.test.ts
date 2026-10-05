import { describe, it, expect, beforeEach } from "vitest";
import { newAuthToken, hashToken, tokenMatchesHash, encryptToken, decryptToken, TokenKeyError } from "./credentials.js";

const KEY = Buffer.alloc(32, 7).toString("base64");

describe("credentials", () => {
  beforeEach(() => { process.env["PUBLIC_API_TOKEN_KEY"] = KEY; });

  it("generates unique 64-char hex tokens", () => {
    const a = newAuthToken();
    const b = newAuthToken();
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toBe(b);
  });

  it("hash matches only the right token", () => {
    const t = newAuthToken();
    const h = hashToken(t);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(tokenMatchesHash(t, h)).toBe(true);
    expect(tokenMatchesHash(t + "x", h)).toBe(false);
    expect(tokenMatchesHash("", h)).toBe(false);
  });

  it("encrypt/decrypt round-trips and uses a random IV", () => {
    const t = newAuthToken();
    const e1 = encryptToken(t);
    const e2 = encryptToken(t);
    expect(e1).not.toBe(e2);
    expect(decryptToken(e1)).toBe(t);
  });

  it("rejects tampered ciphertext", () => {
    const [iv, tag, ct] = encryptToken("secret").split(".");
    const flipped = Buffer.from(ct!, "base64");
    flipped[0] = flipped[0]! ^ 0xff;
    expect(() => decryptToken(`${iv}.${tag}.${flipped.toString("base64")}`)).toThrow();
  });

  it("throws TokenKeyError when the key is missing or the wrong length", () => {
    delete process.env["PUBLIC_API_TOKEN_KEY"];
    expect(() => encryptToken("x")).toThrow(TokenKeyError);
    process.env["PUBLIC_API_TOKEN_KEY"] = Buffer.alloc(16).toString("base64");
    expect(() => encryptToken("x")).toThrow(TokenKeyError);
  });
});
