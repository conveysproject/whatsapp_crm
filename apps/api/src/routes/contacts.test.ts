import { describe, it, expectTypeOf } from "vitest";
import type { PrismaClient } from "@prisma/client";

describe("Contact model", () => {
  it("PrismaClient has contact property", () => {
    expectTypeOf<PrismaClient>().toHaveProperty("contact");
  });
});
