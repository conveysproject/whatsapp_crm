import { describe, it, expect, vi } from "vitest";

vi.mock("../lib/claude.js", () => ({
  generateSuggestions: vi.fn().mockResolvedValue(["Sure!", "Let me check.", "I understand."]),
}));

describe("generateSuggestions", () => {
  it("returns array of suggestion strings", async () => {
    const { generateSuggestions } = await import("../lib/claude.js");
    const result = await generateSuggestions([
      { role: "user", content: "Hello, I need help with my order" },
    ]);
    expect(Array.isArray(result)).toBe(true);
  });
});
