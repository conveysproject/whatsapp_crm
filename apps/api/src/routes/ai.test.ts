import { describe, it, expect, vi } from "vitest";

vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = {
      create: vi.fn().mockResolvedValue({
        content: [{ type: "text", text: '["Sure!", "Let me check.", "I understand."]' }],
      }),
    };
  },
}));

vi.mock("../lib/claude.js", async (importOriginal) => {
  const actual = await importOriginal();
  return actual;
});

describe("generateSuggestions", () => {
  it("returns array of suggestion strings", async () => {
    const { generateSuggestions } = await import("../lib/claude.js");
    const result = await generateSuggestions([
      { role: "user", content: "Hello, I need help with my order" },
    ]);
    expect(Array.isArray(result)).toBe(true);
  });
});
