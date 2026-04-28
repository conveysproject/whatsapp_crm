import { describe, it, expectTypeOf } from "vitest";
import type { PrismaClient } from "@prisma/client";

describe("Conversation model", () => {
  it("PrismaClient has conversation property", () => {
    expectTypeOf<PrismaClient>().toHaveProperty("conversation");
  });

  it("PrismaClient has message property", () => {
    expectTypeOf<PrismaClient>().toHaveProperty("message");
  });
});
