import { describe, it, expect } from "vitest";
import { safeErr } from "./safe-err.js";

describe("safeErr", () => {
  it("keeps name and code only, never the message", () => {
    const err = Object.assign(new Error("Invalid `prisma.message.create()` invocation: phoneNumber: \"14155552672\" body: \"secret text\""), { name: "PrismaClientValidationError", code: "P2009" });
    const out = safeErr(err);
    expect(out).toEqual({ name: "PrismaClientValidationError", code: "P2009" });
    expect(JSON.stringify(out)).not.toContain("14155552672");
  });

  it("uses metaCode as the code for WhatsApp API errors", () => {
    class WaApiError extends Error { name = "WaApiError"; constructor(m: string, readonly metaCode: number | null) { super(m); } }
    expect(safeErr(new WaApiError('WA send failed: {"to":"14155552672"}', 131047))).toEqual({ name: "WaApiError", code: 131047 });
  });

  it("tolerates non-errors", () => {
    expect(safeErr(null)).toEqual({ name: "object" });
    expect(safeErr("14155552672")).toEqual({ name: "string" });
    expect(safeErr({})).toEqual({ name: "Error" });
  });
});
