import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanupApiPayloads, payloadRetentionDays } from "./payload-cleanup.js";
import { DELETE_BATCH } from "./usage-cleanup.js";

afterEach(() => {
  delete process.env["API_PAYLOAD_RETENTION_DAYS"];
});

describe("payloadRetentionDays", () => {
  it.each([
    [undefined, 365],
    ["", 365],
    ["abc", 365],
    ["-5", 365],
    ["0", 365],
    ["30", 90],
    ["90", 90],
    ["730", 730],
    ["1.5", 90], // parseInt semantics: "1.5" -> 1, then raised to the 90-day floor
    ["365.9", 365], // parseInt truncates
    ["36500", 36500],
    ["999999999999", 36500], // upper clamp: no Invalid Date cutoff
  ])("%j -> %i", (env, expected) => {
    if (env === undefined) delete process.env["API_PAYLOAD_RETENTION_DAYS"];
    else process.env["API_PAYLOAD_RETENTION_DAYS"] = env;
    expect(payloadRetentionDays()).toBe(expected);
  });
});

/** Table name of a tagged-template DELETE call (strings array is argument 0). */
const tableOf = (call: unknown[]): string => (call[0] as string[]).join("?").match(/DELETE FROM (\w+)/)![1]!;

describe("cleanupApiPayloads", () => {
  it("deletes in batches from both tables and sums the counts", async () => {
    const exec = vi
      .fn()
      .mockResolvedValueOnce(DELETE_BATCH) // payloads: full batch, continue
      .mockResolvedValueOnce(10) // payloads: short, stop
      .mockResolvedValueOnce(3); // attempts: short, stop
    const n = await cleanupApiPayloads({ $executeRaw: exec } as never, new Date("2027-10-09T00:00:00Z"), 60_000, () => 0);
    expect(n).toBe(DELETE_BATCH + 13);
    expect(exec).toHaveBeenCalledTimes(3);
    expect(exec.mock.calls.map(tableOf)).toEqual(["api_request_payloads", "api_request_payloads", "api_callback_attempts"]);
  });

  it("uses a cutoff exactly payloadRetentionDays() before now, parameterized, with the batch limit", async () => {
    const exec = vi.fn().mockResolvedValue(0);
    const now = new Date("2027-10-09T00:00:00Z");
    await cleanupApiPayloads({ $executeRaw: exec } as never, now, 60_000, () => 0);
    const expected = new Date(now.getTime() - 365 * 86_400_000);
    for (const call of exec.mock.calls) {
      expect(call[1]).toEqual(expected);
      expect(call[2]).toBe(DELETE_BATCH);
      expect((call[0] as string[]).join("?")).toContain("created_at <");
    }
    expect(exec).toHaveBeenCalledTimes(2);
  });

  it("honours API_PAYLOAD_RETENTION_DAYS in the cutoff (floor applied)", async () => {
    process.env["API_PAYLOAD_RETENTION_DAYS"] = "30";
    const exec = vi.fn().mockResolvedValue(0);
    const now = new Date("2027-10-09T00:00:00Z");
    await cleanupApiPayloads({ $executeRaw: exec } as never, now, 60_000, () => 0);
    expect(exec.mock.calls[0]![1]).toEqual(new Date(now.getTime() - 90 * 86_400_000));
  });

  it("gives each table its own budget slice so a full first table cannot starve the second", async () => {
    const calls: string[] = [];
    const exec = vi.fn().mockImplementation(async (...args: unknown[]) => {
      calls.push(tableOf(args));
      return DELETE_BATCH; // always full
    });
    let t = 0;
    const clock = () => (t += 10_000); // every clock read advances 10s
    // total budget 40s -> 20s per table. Table 1: start read=10s, after batch read=20s (10s<20s) -> batch 2, read=30s (20s>=20s) stop.
    const n = await cleanupApiPayloads({ $executeRaw: exec } as never, new Date(), 40_000, clock);
    expect(calls.filter((c) => c === "api_request_payloads")).toHaveLength(2);
    expect(calls.filter((c) => c === "api_callback_attempts")).toHaveLength(2);
    expect(n).toBe(4 * DELETE_BATCH);
  });

  it("still attempts the second table when the first exhausted its slice immediately", async () => {
    const calls: string[] = [];
    const exec = vi.fn().mockImplementation(async (...args: unknown[]) => {
      calls.push(tableOf(args));
      return DELETE_BATCH;
    });
    let t = 0;
    const clock = () => (t += 1_000_000); // far beyond any slice
    await cleanupApiPayloads({ $executeRaw: exec } as never, new Date(), 60_000, clock);
    expect(calls).toEqual(["api_request_payloads", "api_callback_attempts"]); // one batch each, then budget stops
  });
});
