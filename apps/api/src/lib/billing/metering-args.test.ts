import { describe, it, expect } from "vitest";
import { parseMeteringArgs } from "./metering-args.js";

const today = new Date("2026-10-10T12:00:00Z");
const p = (argv: string[]) => parseMeteringArgs(argv, today);

describe("parseMeteringArgs", () => {
  it("parses a valid range as a dry run", () => {
    const r = p(["--from", "2026-10-01", "--to", "2026-10-10"]);
    expect(r.from.toISOString()).toBe("2026-10-01T00:00:00.000Z");
    expect(r.to.toISOString()).toBe("2026-10-10T00:00:00.000Z");
    expect(r.apply).toBe(false);
  });
  it("accepts --apply", () => {
    expect(p(["--from", "2026-10-01", "--to", "2026-10-02", "--apply"]).apply).toBe(true);
  });
  it("accepts a single day", () => {
    expect(() => p(["--from", "2026-10-01", "--to", "2026-10-01"])).not.toThrow();
  });
  it("rejects missing --to", () => {
    expect(() => p(["--from", "2026-10-01"])).toThrow(/^Usage:/);
  });
  it("rejects a missing value after --from", () => {
    expect(() => p(["--from", "--to", "2026-10-02"])).toThrow(/^Usage:/);
    expect(() => p(["--to", "2026-10-02", "--from"])).toThrow(/^Usage:/);
  });
  it("rejects a reversed range", () => {
    expect(() => p(["--from", "2026-10-05", "--to", "2026-10-01"])).toThrow(/^Usage:/);
  });
  it("accepts exactly 62 days and rejects 63", () => {
    expect(() => p(["--from", "2026-08-10", "--to", "2026-10-10"])).not.toThrow();
    expect(() => p(["--from", "2026-08-09", "--to", "2026-10-10"])).toThrow(/^Usage:/);
  });
  it("rejects --apply=true and --Apply", () => {
    expect(() => p(["--from", "2026-10-01", "--to", "2026-10-02", "--apply=true"])).toThrow(/^Usage:/);
    expect(() => p(["--from", "2026-10-01", "--to", "2026-10-02", "--Apply"])).toThrow(/^Usage:/);
  });
  it("rejects unknown flags", () => {
    expect(() => p(["--from", "2026-10-01", "--to", "2026-10-02", "--force"])).toThrow(/^Usage:/);
  });
  it("rejects impossible dates", () => {
    for (const bad of ["2026-02-30", "2026-13-01", "2026-1-5"]) {
      expect(() => p(["--from", bad, "--to", "2026-10-02"])).toThrow(/^Usage:/);
    }
  });
  it("accepts a leap day", () => {
    expect(() => parseMeteringArgs(["--from", "2028-02-29", "--to", "2028-03-01"], new Date("2028-06-01T00:00:00Z"))).not.toThrow();
  });
  it("rejects a far-future --to and accepts today", () => {
    expect(() => p(["--from", "2026-10-01", "--to", "2099-01-01"])).toThrow(/^Usage:/);
    expect(() => p(["--from", "2026-10-01", "--to", "2026-10-11"])).toThrow(/^Usage:/);
    expect(() => p(["--from", "2026-10-01", "--to", "2026-10-10"])).not.toThrow();
  });
  it("rejects duplicate flags", () => {
    expect(() => p(["--from", "2026-10-01", "--from", "2026-10-02", "--to", "2026-10-03"])).toThrow(/^Usage:/);
    expect(() => p(["--from", "2026-10-01", "--to", "2026-10-03", "--apply", "--apply"])).toThrow(/^Usage:/);
  });
  it("rejects extra positional args", () => {
    expect(() => p(["--from", "2026-10-01", "--to", "2026-10-02", "extra"])).toThrow(/^Usage:/);
  });
});
