import { describe, it, expect, vi } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
vi.mock("../queue.js", () => ({ redisConnection: undefined }));
vi.mock("./queues.js", () => ({ publicApiSendQueue: { add: vi.fn() }, publicApiCallbackQueue: { add: vi.fn() } }));

import { plivoErrorBody, plivoError } from "./responses.js";
import { publicApiErrorHandler } from "../../routes/public-api/index.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe("plivoErrorBody (S9: the single producer of the provisional error body)", () => {
  it("builds { api_id: <uuid>, error, error_code } and nothing else", () => {
    const b = plivoErrorBody("Nope");
    expect(Object.keys(b).sort()).toEqual(["api_id", "error", "error_code"]);
    expect(b.api_id).toMatch(UUID);
    expect(b.error).toBe("Nope");
  });

  it("plivoError and the plugin error handler (429/4xx/500) all send exactly that shape", () => {
    const reply = () => ({ status: vi.fn().mockReturnThis(), send: vi.fn().mockReturnThis(), header: vi.fn().mockReturnThis(), getHeader: vi.fn() });
    const r1 = reply();
    plivoError(r1 as never, 400, "bad");
    const request = { id: "r", log: { error: vi.fn() } };
    const bodies = [r1.send.mock.calls[0]![0]];
    for (const statusCode of [429, 400, 500]) {
      const r = reply();
      publicApiErrorHandler({ statusCode }, request as never, r as never);
      bodies.push(r.send.mock.calls[0]![0]);
    }
    for (const b of bodies) {
      const keys = Object.keys(b as object);
      expect(keys).toEqual(expect.arrayContaining(["api_id", "error", "error_code"]));
      expect(keys.every((k) => ["api_id", "error", "error_code", "hint"].includes(k))).toBe(true);
      expect((b as { api_id: string }).api_id).toMatch(UUID);
    }
  });

  it("no other public-API source file builds an error body by hand", () => {
    const here = fileURLToPath(new URL(".", import.meta.url));
    const dirs = [here, join(here, "../../routes/public-api")];
    const offenders: string[] = [];
    for (const dir of dirs) {
      for (const f of readdirSync(dir)) {
        if (!f.endsWith(".ts") || f.endsWith(".test.ts") || f === "responses.ts" || f === "error-catalog.ts") continue;
        if (/api_id\s*:[^}\n]*\berror\s*:/.test(readFileSync(join(dir, f), "utf8"))) offenders.push(f);
      }
    }
    expect(offenders).toEqual([]);
  });
});
