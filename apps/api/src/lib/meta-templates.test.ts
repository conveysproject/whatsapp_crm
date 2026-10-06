import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { submitTemplateToMeta, editTemplateOnMeta, deleteTemplateOnMeta, MetaTemplateError } from "./meta-templates.js";

const TOKEN = "SECRET_TOKEN_XYZ";
const fetchMock = vi.fn();
const json = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => body }) as unknown as Response;
const metaErr = (code: number, subcode?: number) => ({ error: { message: `bad thing ${TOKEN}`, code, ...(subcode ? { error_subcode: subcode } : {}) } });
const comps = [{ type: "BODY" as const, text: "hi" }];

beforeEach(() => { fetchMock.mockReset(); vi.stubGlobal("fetch", fetchMock); });
afterEach(() => { vi.unstubAllGlobals(); });

async function caught(p: Promise<unknown>): Promise<MetaTemplateError> {
  try { await p; } catch (e) { return e as MetaTemplateError; }
  throw new Error("expected rejection");
}

describe("submitTemplateToMeta", () => {
  it("POSTs name/category/language/components with the bearer token", async () => {
    fetchMock.mockResolvedValue(json(200, { id: "123", status: "PENDING" }));
    const r = await submitTemplateToMeta({ wabaId: "w1", accessToken: TOKEN, name: "Order Update", category: "utility", language: "en_US", components: comps });
    expect(r).toEqual({ metaTemplateId: "123", status: "pending" });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://graph.facebook.com/v25.0/w1/message_templates");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe(`Bearer ${TOKEN}`);
    expect(JSON.parse(init.body)).toEqual({ name: "order_update", category: "UTILITY", language: "en_US", components: comps });
  });

  it("sends allow_category_change only when requested", async () => {
    fetchMock.mockResolvedValue(json(200, { id: "1" }));
    await submitTemplateToMeta({ wabaId: "w1", accessToken: TOKEN, name: "a", category: "marketing", language: "en", components: comps, allowCategoryChange: true });
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body).allow_category_change).toBe(true);
  });

  it("throws a typed error with Meta's code, compatible message, and no token", async () => {
    fetchMock.mockResolvedValue(json(400, metaErr(100, 2388023)));
    const e = await caught(submitTemplateToMeta({ wabaId: "w1", accessToken: TOKEN, name: "a", category: "marketing", language: "en", components: comps }));
    expect(e).toBeInstanceOf(MetaTemplateError);
    expect(e.code).toBe(100);
    expect(e.status).toBe(400);
    expect(e.message.startsWith("Meta template submission failed")).toBe(true);
    expect(e.message).not.toContain(TOKEN);
  });

  it("throws a typed error when the success body has no id", async () => {
    fetchMock.mockResolvedValue(json(200, {}));
    const e = await caught(submitTemplateToMeta({ wabaId: "w1", accessToken: TOKEN, name: "a", category: "marketing", language: "en", components: comps }));
    expect(e).toBeInstanceOf(MetaTemplateError);
  });
});

describe("editTemplateOnMeta", () => {
  it("POSTs components to /{metaTemplateId}", async () => {
    fetchMock.mockResolvedValue(json(200, { success: true }));
    await editTemplateOnMeta({ accessToken: TOKEN, metaTemplateId: "777", components: comps });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://graph.facebook.com/v25.0/777");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe(`Bearer ${TOKEN}`);
    expect(JSON.parse(init.body)).toEqual({ components: comps });
  });

  it("includes category when given", async () => {
    fetchMock.mockResolvedValue(json(200, { success: true }));
    await editTemplateOnMeta({ accessToken: TOKEN, metaTemplateId: "777", components: comps, category: "utility" });
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body)).toEqual({ components: comps, category: "UTILITY" });
  });

  it("throws MetaTemplateError with code on non-2xx, without the token", async () => {
    fetchMock.mockResolvedValue(json(400, metaErr(100)));
    const e = await caught(editTemplateOnMeta({ accessToken: TOKEN, metaTemplateId: "777", components: comps }));
    expect(e).toBeInstanceOf(MetaTemplateError);
    expect(e.code).toBe(100);
    expect(e.message).not.toContain(TOKEN);
  });

  it("throws on success:false", async () => {
    fetchMock.mockResolvedValue(json(200, { success: false }));
    await expect(editTemplateOnMeta({ accessToken: TOKEN, metaTemplateId: "777", components: comps })).rejects.toBeInstanceOf(MetaTemplateError);
  });

  it("throws on a non-JSON error body", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 502, json: async () => { throw new Error("x"); } } as unknown as Response);
    const e = await caught(editTemplateOnMeta({ accessToken: TOKEN, metaTemplateId: "777", components: comps }));
    expect(e.code).toBeNull();
    expect(e.status).toBe(502);
  });
});

describe("deleteTemplateOnMeta", () => {
  it("DELETEs /{waba}/message_templates with encoded name and hsm_id", async () => {
    fetchMock.mockResolvedValue(json(200, { success: true }));
    await deleteTemplateOnMeta({ wabaId: "w1", accessToken: TOKEN, name: "a b&c", metaTemplateId: "777" });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://graph.facebook.com/v25.0/w1/message_templates?name=a%20b%26c&hsm_id=777");
    expect(init.method).toBe("DELETE");
    expect(init.headers.Authorization).toBe(`Bearer ${TOKEN}`);
  });

  it("throws on non-2xx and on success:false", async () => {
    fetchMock.mockResolvedValueOnce(json(400, metaErr(190)));
    const e = await caught(deleteTemplateOnMeta({ wabaId: "w1", accessToken: TOKEN, name: "a", metaTemplateId: "1" }));
    expect(e.code).toBe(190);
    expect(e.message).not.toContain(TOKEN);
    fetchMock.mockResolvedValueOnce(json(200, { success: false }));
    await expect(deleteTemplateOnMeta({ wabaId: "w1", accessToken: TOKEN, name: "a", metaTemplateId: "1" })).rejects.toBeInstanceOf(MetaTemplateError);
  });

  it("treats Meta 'object does not exist' (100 / 33) as already deleted", async () => {
    fetchMock.mockResolvedValue(json(400, metaErr(100, 33)));
    await expect(deleteTemplateOnMeta({ wabaId: "w", accessToken: "t", name: "n", metaTemplateId: "1" })).resolves.toBeUndefined();
  });

  it("treats Meta 'template not found' (100 / 2593002) as already deleted", async () => {
    fetchMock.mockResolvedValue(json(400, metaErr(100, 2593002)));
    await expect(deleteTemplateOnMeta({ wabaId: "w1", accessToken: TOKEN, name: "a", metaTemplateId: "1" })).resolves.toBeUndefined();
  });

  it("does not treat other code-100 errors as success", async () => {
    fetchMock.mockResolvedValue(json(400, metaErr(100, 2494000)));
    await expect(deleteTemplateOnMeta({ wabaId: "w1", accessToken: TOKEN, name: "a", metaTemplateId: "1" })).rejects.toBeInstanceOf(MetaTemplateError);
  });

  it("wraps network failures without leaking the token", async () => {
    fetchMock.mockRejectedValue(new Error(`socket hang up ${TOKEN}`));
    const e = await caught(deleteTemplateOnMeta({ wabaId: "w1", accessToken: TOKEN, name: "a", metaTemplateId: "1" }));
    expect(e).toBeInstanceOf(MetaTemplateError);
    expect(e.message).not.toContain(TOKEN);
  });
});
