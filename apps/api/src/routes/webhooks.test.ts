import { describe, it, expect, expectTypeOf } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { verifyWebhookSignature } from "../lib/whatsapp.js";

describe("Conversation model", () => {
  it("PrismaClient has conversation property", () => {
    expectTypeOf<PrismaClient>().toHaveProperty("conversation");
  });

  it("PrismaClient has message property", () => {
    expectTypeOf<PrismaClient>().toHaveProperty("message");
  });
});

describe("verifyWebhookSignature", () => {
  it("returns true for matching HMAC-SHA256 signature", () => {
    const secret = "mysecret";
    const payload = '{"hello":"world"}';
    const sig = "sha256=c15378d6581bcd0759288df30dd0eaffadc4fa4258ffe3b8cbdf13555e7f329f";
    expect(verifyWebhookSignature(payload, sig, secret)).toBe(true);
  });

  it("returns false for wrong signature", () => {
    expect(verifyWebhookSignature("payload", "sha256=wrong", "secret")).toBe(false);
  });
});
