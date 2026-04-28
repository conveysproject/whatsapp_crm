import { describe, it, expect, vi } from "vitest";

vi.mock("@clerk/backend", () => ({
  createClerkClient: vi.fn(() => ({
    verifyToken: vi.fn(),
  })),
}));

describe("verifyClerkToken", () => {
  it("throws for missing Authorization header", async () => {
    const { verifyClerkToken } = await import("./clerk.js");
    await expect(verifyClerkToken(undefined)).rejects.toThrow("Missing Authorization header");
  });

  it("throws for non-Bearer token", async () => {
    const { verifyClerkToken } = await import("./clerk.js");
    await expect(verifyClerkToken("Basic abc")).rejects.toThrow("Invalid Authorization header format");
  });
});
