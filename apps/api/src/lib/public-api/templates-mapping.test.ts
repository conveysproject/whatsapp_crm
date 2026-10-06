import { describe, it, expect } from "vitest";
import {
  parseTemplateBody, parseListQuery, templateStatus, toSubmitResponse, toListObject, toRetrieveResponse, TemplateValidationError,
} from "./templates-mapping.js";

const valid = () => ({ name: "order_update_1", language: "en_US", category: "UTILITY", components: [{ type: "BODY", text: "Hi {{1}}" }] });
const bad = (patch: Record<string, unknown>) => () => parseTemplateBody({ ...valid(), ...patch });

describe("parseTemplateBody", () => {
  it("accepts a valid body and normalizes category; components pass through unchanged", () => {
    const b = valid();
    const r = parseTemplateBody({ ...b, category: "Marketing" });
    expect(r).toEqual({ name: "order_update_1", language: "en_US", category: "marketing", components: b.components, allowCategoryChange: false });
  });
  it("reads allow_category_change; rejects non-boolean", () => {
    expect(parseTemplateBody({ ...valid(), allow_category_change: true }).allowCategoryChange).toBe(true);
    expect(bad({ allow_category_change: "yes" })).toThrow(TemplateValidationError);
  });
  it.each([null, "x", 5, [], undefined])("rejects a non-object body %j", (b) => {
    expect(() => parseTemplateBody(b)).toThrow(TemplateValidationError);
  });
  it.each(["", "Has Space", "UPPER", "dash-name", "a".repeat(513), 5, null])("rejects name %j", (name) => {
    expect(bad({ name })).toThrow(TemplateValidationError);
  });
  it("accepts a 512-char name", () => { expect(() => parseTemplateBody({ ...valid(), name: "a".repeat(512) })).not.toThrow(); });
  it.each(["e", "en-US", "en US", "x".repeat(16), "", 5, "en1"])("rejects language %j", (language) => {
    expect(bad({ language })).toThrow(TemplateValidationError);
  });
  it.each(["en", "en_US", "pt_BR", "x".repeat(15)])("accepts language %j", (language) => {
    expect(parseTemplateBody({ ...valid(), language }).language).toBe(language);
  });
  it.each(["promo", "", 5, null])("rejects category %j", (category) => { expect(bad({ category })).toThrow(TemplateValidationError); });
  it("accepts category case-insensitively", () => {
    for (const c of ["marketing", "UTILITY", "Authentication"]) expect(parseTemplateBody({ ...valid(), category: c }).category).toBe(c.toLowerCase());
  });
  it.each([undefined, "x", {}, [], [{ type: "HEADER", format: "TEXT", text: "h" }]])("rejects components %j (not an array or no BODY)", (components) => {
    expect(bad({ components })).toThrow(TemplateValidationError);
  });
  it("matches component type case-insensitively", () => {
    expect(() => parseTemplateBody({ ...valid(), components: [{ type: "body", text: "x" }] })).not.toThrow();
  });
  it("rejects unknown component types and non-object components", () => {
    expect(bad({ components: [{ type: "BODY", text: "x" }, { type: "CAROUSELISH" }] })).toThrow(TemplateValidationError);
    expect(bad({ components: [{ type: "BODY", text: "x" }, "oops"] })).toThrow(TemplateValidationError);
    expect(bad({ components: [{ text: "x" }] })).toThrow(TemplateValidationError);
  });
  it("rejects non-string text and over-long text", () => {
    expect(bad({ components: [{ type: "BODY", text: 5 }] })).toThrow(TemplateValidationError);
    expect(bad({ components: [{ type: "BODY", text: { a: 1 } }] })).toThrow(TemplateValidationError);
    expect(bad({ components: [{ type: "BODY", text: "a".repeat(1025) }] })).toThrow(TemplateValidationError);
    expect(() => parseTemplateBody({ ...valid(), components: [{ type: "BODY", text: "a".repeat(1024) }] })).not.toThrow();
    expect(bad({ components: [{ type: "BODY", text: "x" }, { type: "HEADER", format: "TEXT", text: "a".repeat(61) }] })).toThrow(TemplateValidationError);
    expect(bad({ components: [{ type: "BODY", text: "x" }, { type: "FOOTER", text: "a".repeat(61) }] })).toThrow(TemplateValidationError);
    expect(bad({ components: [{ type: "BODY", text: "x" }, { type: "FOOTER", text: 1 }] })).toThrow(TemplateValidationError);
  });
  it("limits buttons to 10 and requires an array of objects with string text", () => {
    const btn = (n: number) => ({ type: "BUTTONS", buttons: Array.from({ length: n }, () => ({ type: "QUICK_REPLY", text: "ok" })) });
    expect(() => parseTemplateBody({ ...valid(), components: [valid().components[0], btn(10)] })).not.toThrow();
    expect(bad({ components: [valid().components[0], btn(11)] })).toThrow(TemplateValidationError);
    expect(bad({ components: [valid().components[0], { type: "BUTTONS", buttons: "x" }] })).toThrow(TemplateValidationError);
    expect(bad({ components: [valid().components[0], { type: "BUTTONS", buttons: [{ type: "QUICK_REPLY", text: 3 }] }] })).toThrow(TemplateValidationError);
    expect(bad({ components: [valid().components[0], { type: "BUTTONS", buttons: [null] }] })).toThrow(TemplateValidationError);
  });
  it("requires example.header_handle (array of strings) for media headers", () => {
    const hdr = (h: object) => ({ components: [{ type: "HEADER", ...h }, valid().components[0]] });
    expect(bad(hdr({ format: "IMAGE" }))).toThrow(TemplateValidationError);
    expect(bad(hdr({ format: "VIDEO", example: { header_handle: "h" } }))).toThrow(TemplateValidationError);
    expect(bad(hdr({ format: "DOCUMENT", example: { header_handle: [1] } }))).toThrow(TemplateValidationError);
    expect(bad(hdr({ format: "IMAGE", example: { header_handle: [] } }))).toThrow(TemplateValidationError);
    expect(() => parseTemplateBody({ ...valid(), ...hdr({ format: "IMAGE", example: { header_handle: ["4::aW1h"] } }) })).not.toThrow();
    expect(() => parseTemplateBody({ ...valid(), ...hdr({ format: "TEXT", text: "Hello" }) })).not.toThrow();
  });
});

describe("parseListQuery", () => {
  it("defaults", () => { expect(parseListQuery({})).toEqual({ limit: 20, offset: 0 }); });
  it("clamps limit to 1..20 and offset to >= 0", () => {
    expect(parseListQuery({ limit: "500" }).limit).toBe(20);
    expect(parseListQuery({ limit: "0" }).limit).toBe(1);
    expect(parseListQuery({ limit: "-3" }).limit).toBe(1);
    expect(parseListQuery({ limit: "5" }).limit).toBe(5);
    expect(parseListQuery({ offset: "-4" }).offset).toBe(0);
    expect(parseListQuery({ offset: "40" }).offset).toBe(40);
    expect(parseListQuery({ offset: "99999999999999" }).offset).toBeLessThanOrEqual(2_000_000_000);
  });
  it("treats junk as defaults and takes the first of repeated keys", () => {
    expect(parseListQuery({ limit: "abc", offset: "x" })).toEqual({ limit: 20, offset: 0 });
    expect(parseListQuery({ limit: ["7", "9"], offset: { a: 1 } })).toEqual({ limit: 7, offset: 0 });
    expect(parseListQuery(null as never)).toEqual({ limit: 20, offset: 0 });
  });
  it("reads template_name, trimmed; blank is ignored", () => {
    expect(parseListQuery({ template_name: " promo " }).name).toBe("promo");
    expect(parseListQuery({ template_name: "  " }).name).toBeUndefined();
  });
});

describe("templateStatus", () => {
  it("maps statuses; draft is PENDING", () => {
    expect(templateStatus("draft")).toBe("PENDING");
    expect(templateStatus("pending")).toBe("PENDING");
    expect(templateStatus("approved")).toBe("APPROVED");
    expect(templateStatus("rejected")).toBe("REJECTED");
  });
});

const row = {
  metaTemplateId: "9001", name: "promo", language: "en_US", category: "marketing" as const, status: "approved" as const,
  qualityScore: null as string | null, rejectedReason: null as string | null, components: [{ type: "BODY", text: "x" }],
};

describe("response mapping", () => {
  it("toSubmitResponse", () => {
    expect(toSubmitResponse({ ...row, status: "pending" })).toEqual({
      api_id: expect.any(String), status: "success", message: "template submitted to meta for review",
      template_id: "9001", template_name: "promo", template_status: "PENDING", template_language: "en_US", template_category: "MARKETING",
    });
  });
  it("toListObject", () => {
    expect(toListObject(row)).toEqual({ template_id: "9001", name: "promo", language: "en_US", category: "MARKETING", status: "APPROVED" });
  });
  it("toRetrieveResponse defaults rejected_reason and quality score", () => {
    expect(toRetrieveResponse(row)).toEqual({
      api_id: expect.any(String), template_id: "9001", name: "promo", language: "en_US", category: "MARKETING", status: "APPROVED",
      quality_score: { score: "UNKNOWN" }, rejected_reason: "NONE", components: row.components,
    });
    const r = toRetrieveResponse({ ...row, status: "rejected", qualityScore: "GREEN", rejectedReason: "INVALID_FORMAT" });
    expect(r.quality_score).toEqual({ score: "GREEN" });
    expect(r.rejected_reason).toBe("INVALID_FORMAT");
    expect(r.status).toBe("REJECTED");
  });
});
