import { describe, it, expect, vi, afterEach } from "vitest";

vi.mock("./prisma.js", () => ({ prisma: {} }));
vi.mock("./register-phone-enqueue.js", () => ({ onPhoneStatusPending: vi.fn() }));
import { sendTextMessage, sendLocationMessage, WaApiError } from "./whatsapp.js";

afterEach(() => { vi.unstubAllGlobals(); });

function stubFetch(status: number, json: unknown) {
  const fn = vi.fn().mockResolvedValue({ ok: status < 400, status, json: async () => json });
  vi.stubGlobal("fetch", fn);
  return fn;
}

describe("WaApiError", () => {
  it("send failures carry the Meta error code but keep the old message format", async () => {
    stubFetch(400, { error: { code: 131047, error_subcode: 2494, message: "Re-engagement" } });
    const err = await sendTextMessage("pn", "919999999999", "hi", "tok").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(WaApiError);
    expect((err as WaApiError).metaCode).toBe(131047);
    expect((err as WaApiError).metaSubcode).toBe(2494);
    expect((err as Error).message.startsWith("WA send failed: ")).toBe(true);
  });

  it("tolerates a non-JSON error body", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 502, json: async () => { throw new Error("bad json"); } }));
    const err = await sendTextMessage("pn", "1", "x", "tok").catch((e: unknown) => e);
    expect((err as WaApiError).metaCode).toBeNull();
    expect((err as WaApiError).metaError).toBeNull();
  });

  it("carries the normalized Meta error object", async () => {
    stubFetch(400, { error: { code: 131047, error_subcode: 2494, message: "Re-engagement", type: "OAuthException", error_data: { details: "24h window" }, fbtrace_id: "x" } });
    const err = await sendTextMessage("pn", "919999999999", "hi", "tok").catch((e: unknown) => e);
    expect((err as WaApiError).metaError).toEqual({ code: 131047, subcode: 2494, title: null, message: "Re-engagement", details: "24h window", href: null });
  });
});

describe("sendLocationMessage", () => {
  it("posts a Meta location message", async () => {
    const fetchFn = stubFetch(200, { messages: [{ id: "wamid.1" }] });
    const r = await sendLocationMessage("pn", "919999999999", { latitude: "12.9", longitude: "77.6", name: "HQ", address: "MG Road" }, "tok");
    expect(r.messageId).toBe("wamid.1");
    const body = JSON.parse((fetchFn.mock.calls[0]![1] as { body: string }).body) as Record<string, unknown>;
    expect(body).toMatchObject({ messaging_product: "whatsapp", to: "919999999999", type: "location", location: { latitude: 12.9, longitude: 77.6, name: "HQ", address: "MG Road" } });
  });
});
