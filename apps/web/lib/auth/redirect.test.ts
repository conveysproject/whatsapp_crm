import { describe, expect, it } from "vitest";
import { safeRedirect } from "./redirect";

describe("safeRedirect", () => {
  it.each(["/inbox", "/inbox?tab=a&b=1", "/a/b#x", "/"])("allows %s", (p) => {
    expect(safeRedirect(p)).toBe(p);
  });
  it.each([
    null, "", "inbox", "//evil.com", "https://evil.com", "javascript:alert(1)", "/\\evil",
    "\\evil", "/a\\b", "%2F%2Fevil", "/%2Fevil.com", "/%5Cevil", "/\tevil", "/a\nb", "/a%0Ab",
    "/%2F/evil", "%252F%252Fevil", "/%", "///evil", "/\u0000x",
  ])("rejects %s", (p) => {
    expect(safeRedirect(p)).toBe("/dashboard");
  });
  it("uses a custom fallback", () => {
    expect(safeRedirect("//x", "/admin")).toBe("/admin");
  });
});
