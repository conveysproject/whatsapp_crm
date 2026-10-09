import { describe, it, expect } from "vitest";
import { parseArgs } from "./lookup-api-request.args.js";

const OK = ["--org", "org_1", "--reason", "client ticket 123"];
const UUID = "11111111-1111-4111-8111-111111111111";

describe("parseArgs", () => {
  it("requires --org and a non-trivial --reason", () => {
    expect(() => parseArgs([])).toThrow(/--org/);
    expect(() => parseArgs(["--org", "org_1"])).toThrow(/--reason/);
    expect(() => parseArgs(["--org", "org_1", "--reason", "x"])).toThrow(/--reason/);
    expect(() => parseArgs(["--org", "org_1", "--reason", "1234567"])).toThrow(/--reason/);
  });
  it("rejects a flag given without a value", () => {
    expect(() => parseArgs(["--org"])).toThrow(/--org/);
    expect(() => parseArgs(["--org", "--reason", "client ticket 123"])).toThrow(/--org/);
    expect(() => parseArgs(["--org", "o", "--reason"])).toThrow(/--reason/);
    expect(() => parseArgs([...OK, "--api-id"])).toThrow(/api-id/);
    expect(() => parseArgs([...OK, "--since-hours"])).toThrow(/since-hours/);
  });
  it("parses api-id, since and actor with defaults", () => {
    const a = parseArgs([...OK, "--api-id", UUID]);
    expect(a).toMatchObject({ org: "org_1", reason: "client ticket 123", apiId: UUID, sinceHours: 24, showMeta: false });
    expect(a.actor.length).toBeGreaterThan(0);
    expect(parseArgs(["--org", "o", "--reason", "client ticket 9", "--since-hours", "72"]).sinceHours).toBe(72);
    expect(parseArgs(OK)).not.toHaveProperty("apiId");
  });
  it("rejects a malformed api-id and an out-of-range or non-integer window", () => {
    expect(() => parseArgs([...OK, "--api-id", "nope"])).toThrow(/api-id/);
    expect(() => parseArgs([...OK, "--since-hours", "0"])).toThrow(/since-hours/);
    expect(() => parseArgs([...OK, "--since-hours", "9000"])).toThrow(/since-hours/);
    expect(() => parseArgs([...OK, "--since-hours", "1.5"])).toThrow(/since-hours/);
    expect(() => parseArgs([...OK, "--since-hours", "abc"])).toThrow(/since-hours/);
    expect(parseArgs([...OK, "--since-hours", "8760"]).sinceHours).toBe(8760);
  });
  it("parses --show-meta (default off) and ignores unknown flags", () => {
    expect(parseArgs(OK).showMeta).toBe(false);
    expect(parseArgs([...OK, "--show-meta"]).showMeta).toBe(true);
    expect(parseArgs([...OK, "--whatever", "x"]).org).toBe("org_1");
  });
});
