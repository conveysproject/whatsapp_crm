import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SecretBoxKeyError, decryptJson, encryptJson } from "./secret-box.js";

const VAR = "EMAIL_SETTINGS_KEY";
const newKey = () => randomBytes(32).toString("base64");
let saved: string | undefined;

beforeEach(() => {
  saved = process.env[VAR];
  process.env[VAR] = newKey();
});
afterEach(() => {
  if (saved === undefined) delete process.env[VAR];
  else process.env[VAR] = saved;
});

const flip = (b64: string) => {
  const buf = Buffer.from(b64, "base64");
  buf[0] = (buf[0] ?? 0) ^ 0xff;
  return buf.toString("base64");
};

describe("secret-box", () => {
  it("round trips objects, strings and arrays", () => {
    for (const v of [{ apiKey: "k", n: 1, nested: { a: [1, 2] } }, "plain", [1, "two", null]]) {
      expect(decryptJson(encryptJson(v))).toEqual(v);
    }
  });

  it("uses the v1 format and differs per encryption", () => {
    const a = encryptJson({ x: 1 });
    const b = encryptJson({ x: 1 });
    expect(a).not.toBe(b);
    expect(a.startsWith("v1.")).toBe(true);
    expect(a.split(".")).toHaveLength(4);
  });

  it("rejects tampered ciphertext, tag and iv with a generic error", () => {
    const [v, iv, tag, ct] = encryptJson({ secret: "s3cret-value" }).split(".") as [string, string, string, string];
    for (const blob of [`${v}.${iv}.${tag}.${flip(ct)}`, `${v}.${iv}.${flip(tag)}.${ct}`, `${v}.${flip(iv)}.${tag}.${ct}`]) {
      expect(() => decryptJson(blob)).toThrow(new Error("Invalid encrypted value"));
    }
  });

  it("rejects truncated, empty and wrong-version blobs", () => {
    const blob = encryptJson({ a: 1 });
    expect(() => decryptJson(blob.slice(0, blob.length - 6))).toThrow("Invalid encrypted value");
    expect(() => decryptJson(blob.split(".").slice(0, 3).join("."))).toThrow("Invalid encrypted value");
    expect(() => decryptJson("")).toThrow("Invalid encrypted value");
    expect(() => decryptJson(blob.replace(/^v1\./, "v2."))).toThrow("Invalid encrypted value");
  });

  it("rejects a blob encrypted under another key", () => {
    const blob = encryptJson({ a: 1 });
    process.env[VAR] = newKey();
    expect(() => decryptJson(blob)).toThrow("Invalid encrypted value");
  });

  it("throws SecretBoxKeyError for missing, short or long keys without leaking them", () => {
    delete process.env[VAR];
    expect(() => encryptJson({})).toThrow(SecretBoxKeyError);
    expect(() => decryptJson("v1.a.b.c")).toThrow(SecretBoxKeyError);
    for (const bad of [randomBytes(16).toString("base64"), randomBytes(48).toString("base64")]) {
      process.env[VAR] = bad;
      try {
        encryptJson({});
        expect.unreachable();
      } catch (e) {
        expect(e).toBeInstanceOf(SecretBoxKeyError);
        expect((e as Error).message).toContain(VAR);
        expect((e as Error).message).not.toContain(bad);
      }
    }
  });

  it("failed decrypt message contains no plaintext", () => {
    const [v, iv, tag, ct] = encryptJson({ password: "hunter2-plain" }).split(".") as [string, string, string, string];
    try {
      decryptJson(`${v}.${iv}.${tag}.${flip(ct)}`);
      expect.unreachable();
    } catch (e) {
      expect((e as Error).message).not.toContain("hunter2");
      expect((e as Error).message).toBe("Invalid encrypted value");
    }
  });

  it("reads the key at call time, not import time", () => {
    delete process.env[VAR];
    expect(() => encryptJson(1)).toThrow(SecretBoxKeyError);
    process.env[VAR] = newKey();
    expect(decryptJson(encryptJson({ ok: true }))).toEqual({ ok: true });
  });
});
