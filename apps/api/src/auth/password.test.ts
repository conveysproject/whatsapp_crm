import { describe, it, expect } from "vitest";
import { hash as argonHash, type Algorithm } from "@node-rs/argon2";
import { hashPassword, verifyPassword, checkPasswordPolicy } from "./password.js";

describe("password hashing", () => {
  it("round-trips and hashes in under 1000 ms", async () => {
    const start = Date.now();
    const h = await hashPassword("correct horse battery");
    expect(Date.now() - start).toBeLessThan(1000);
    expect(h).toContain("$argon2id$");
    expect(h).toContain("m=65536,t=3,p=1");
    expect(await verifyPassword("correct horse battery", h)).toEqual({ ok: true, needsRehash: false });
  });

  it("rejects a wrong password", async () => {
    const h = await hashPassword("correct horse battery");
    const r = await verifyPassword("wrong password!", h);
    expect(r.ok).toBe(false);
  });

  it("flags hashes made with weaker params for rehash", async () => {
    const weak = await argonHash("correct horse battery", {
      algorithm: 2 as Algorithm,
      memoryCost: 65536,
      timeCost: 2,
      parallelism: 1,
    });
    expect(await verifyPassword("correct horse battery", weak)).toEqual({ ok: true, needsRehash: true });
  });

  it("returns ok:false for malformed hashes instead of throwing", async () => {
    expect((await verifyPassword("whatever123", "not-a-hash")).ok).toBe(false);
  });
});

describe("checkPasswordPolicy", () => {
  it("enforces 8-128 length", () => {
    expect(checkPasswordPolicy("a".repeat(7))).toEqual({ ok: false, reason: "too_short" });
    expect(checkPasswordPolicy("a".repeat(129))).toEqual({ ok: false, reason: "too_long" });
    expect(checkPasswordPolicy("a".repeat(8))).toEqual({ ok: true });
    expect(checkPasswordPolicy("a".repeat(128))).toEqual({ ok: true });
  });
});
