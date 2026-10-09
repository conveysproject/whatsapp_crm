import { describe, it, expect } from "vitest";
import { SendValidationError, type PlivoTemplateComponent } from "./send-mapping.js";
import { placeholders, resolveTemplate, validateAgainstTemplate, type TemplateRow } from "./template-validation.js";

const row = (over: Partial<TemplateRow> = {}): TemplateRow => ({
  name: "kyc", language: "en", status: "approved", parameterFormat: "NAMED",
  components: [{ type: "BODY", text: "Hi {{username}}, approved by {{ra_name}}" }], ...over,
});
const t = (n: string, v = "x") => ({ type: "text", parameter_name: n, text: v });
const body = (...parameters: object[]) => [{ type: "body", parameters }] as PlivoTemplateComponent[];
const fails = (r: TemplateRow, c: PlivoTemplateComponent[], msg: RegExp) => expect(() => validateAgainstTemplate(r, c)).toThrow(msg);

describe("placeholders", () => {
  it("extracts unique names and numbers in order", () => {
    expect(placeholders("a {{x}} b {{ y }} c {{x}}")).toEqual(["x", "y"]);
    expect(placeholders("{{1}} {{2}}")).toEqual(["1", "2"]);
    expect(placeholders(undefined)).toEqual([]);
  });
});

describe("resolveTemplate", () => {
  const rows = [row({ language: "en_US" }), row({ language: "hi", status: "pending" })];
  it("returns the approved row for the exact language", () => { expect(resolveTemplate(rows, "kyc", "en_US").language).toBe("en_US"); });
  it("not found when there are no rows", () => { expect(() => resolveTemplate([], "kyc", "en")).toThrow(/Template "kyc" not found/); });
  it("lists available languages when the language does not exist", () => {
    expect(() => resolveTemplate(rows, "kyc", "en")).toThrow(/no language "en"; available: en_US, hi/);
  });
  it("names the status when the language exists but is not approved", () => {
    expect(() => resolveTemplate(rows, "kyc", "hi")).toThrow(/not approved \(status: pending\)/);
  });
  it("rejects two approved rows for the same name and language", () => {
    expect(() => resolveTemplate([row(), row()], "kyc", "en")).toThrow(/more than one template/);
  });
});

describe("error codes", () => {
  const rows = [row({ language: "en_US" }), row({ language: "hi", status: "pending" })];
  const code = (c: string) => expect.objectContaining({ code: c, constructor: SendValidationError });
  it("TEMPLATE_NOT_FOUND for no rows and for a missing language", () => {
    expect(() => resolveTemplate([], "kyc", "en")).toThrow(code("TEMPLATE_NOT_FOUND"));
    expect(() => resolveTemplate(rows, "kyc", "en")).toThrow(code("TEMPLATE_NOT_FOUND"));
  });
  it("TEMPLATE_NOT_APPROVED when the language exists but is not approved", () => {
    expect(() => resolveTemplate(rows, "kyc", "hi")).toThrow(code("TEMPLATE_NOT_APPROVED"));
  });
  it("VALIDATION_FAILED when more than one template matches", () => {
    expect(() => resolveTemplate([row(), row()], "kyc", "en")).toThrow(code("VALIDATION_FAILED"));
  });
  it("TEMPLATE_PARAMS_MISMATCH for a parameter mismatch", () => {
    expect(() => validateAgainstTemplate(row(), body(t("username")))).toThrow(code("TEMPLATE_PARAMS_MISMATCH"));
  });
});

describe("validateAgainstTemplate: named", () => {
  it("accepts any order", () => { expect(() => validateAgainstTemplate(row(), body(t("ra_name"), t("username")))).not.toThrow(); });
  it("rejects a missing name", () => { fails(row(), body(t("username")), /not matched for BODY: expected \[username, ra_name\]; got \[username\]/); });
  it("rejects an unknown name", () => { fails(row(), body(t("username"), t("other")), /not matched for BODY/); });
  it("rejects a duplicate name", () => { fails(row(), body(t("username"), t("username")), /not matched for BODY/); });
  it("rejects a parameter without parameter_name", () => {
    fails(row(), body(t("username"), { type: "text", text: "x" }), /\(no parameter_name\)/);
  });
  it("rejects when no components are sent at all", () => { fails(row(), [], /not matched for BODY.*got \[\]/); });
  it("rejects non-text body parameters", () => { fails(row(), body({ type: "media", media: "https://x/a.png" }), /not matched for BODY/); });
  it("treats a non-numeric placeholder as named even when parameterFormat is null", () => {
    expect(() => validateAgainstTemplate(row({ parameterFormat: null }), body(t("username"), t("ra_name")))).not.toThrow();
  });
});

describe("validateAgainstTemplate: positional", () => {
  const pos = row({ parameterFormat: "POSITIONAL", components: [{ type: "BODY", text: "Hi {{1}} {{2}}" }] });
  it("accepts the right count", () => { expect(() => validateAgainstTemplate(pos, body({ type: "text", text: "a" }, { type: "text", text: "b" }))).not.toThrow(); });
  it("rejects the wrong count", () => { fails(pos, body({ type: "text", text: "a" }), /expected 2 text parameter\(s\); got 1/); });
  it("rejects parameter_name on a positional template", () => { fails(pos, body(t("a"), t("b")), /remove parameter_name/); });
  it("accepts a template with no variables and no components", () => {
    expect(() => validateAgainstTemplate(row({ parameterFormat: "POSITIONAL", components: [{ type: "BODY", text: "Hello" }] }), [])).not.toThrow();
  });
});

describe("validateAgainstTemplate: header", () => {
  const img = row({ parameterFormat: "POSITIONAL", components: [{ type: "HEADER", format: "IMAGE" }, { type: "BODY", text: "Hello" }] });
  const media = { type: "media", media: "https://x/a.png" };
  it("requires exactly one media parameter for an IMAGE header", () => {
    fails(img, [], /HEADER: expected exactly one media parameter for a IMAGE header/);
    fails(img, [{ type: "header", parameters: [media, media] }] as PlivoTemplateComponent[], /HEADER/);
    expect(() => validateAgainstTemplate(img, [{ type: "header", parameters: [media] }] as PlivoTemplateComponent[])).not.toThrow();
  });
  it("rejects header parameters when the template has no header", () => {
    fails(row({ components: [{ type: "BODY", text: "Hello" }], parameterFormat: "POSITIONAL" }), [{ type: "header", parameters: [media] }] as PlivoTemplateComponent[], /template has no header/);
  });
  it("checks TEXT header variables like the body", () => {
    const txt = row({ components: [{ type: "HEADER", format: "TEXT", text: "Hi {{name}}" }, { type: "BODY", text: "Hello" }] });
    fails(txt, [], /not matched for HEADER/);
    expect(() => validateAgainstTemplate(txt, [{ type: "header", parameters: [t("name")] }] as PlivoTemplateComponent[])).not.toThrow();
  });
  it("does not validate button components (unchanged behavior)", () => {
    expect(() => validateAgainstTemplate(row({ parameterFormat: "POSITIONAL", components: [{ type: "BODY", text: "Hello" }] }),
      [{ type: "button", sub_type: "url", index: 3, parameters: [{ type: "text", text: "z" }] }] as PlivoTemplateComponent[])).not.toThrow();
  });
});
