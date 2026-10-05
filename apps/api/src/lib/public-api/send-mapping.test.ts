import { describe, it, expect } from "vitest";
import { normalizeFullPhone } from "../phone-normalize.js";
import { parseSendBody, SendValidationError, inferMediaKind, toMetaTemplateComponents, toMetaInteractive, renderTemplateForInbox } from "./send-mapping.js";

const base = { src: "+14155552671", dst: "+14155552672", type: "whatsapp" };
const bad = (b: unknown) => expect(() => parseSendBody(b)).toThrow(SendValidationError);

describe("parseSendBody", () => {
  it("parses a text message", () => {
    const p = parseSendBody({ ...base, text: "hello", url: "https://c.example.com/cb", method: "get" });
    expect(p.src).toBe("14155552671");
    expect(p.dsts).toEqual(["14155552672"]);
    expect(p.callbackUrl).toBe("https://c.example.com/cb");
    expect(p.callbackMethod).toBe("GET");
    expect(p.content).toEqual({ kind: "text", text: "hello" });
  });

  it("splits dst on '<', normalizes and de-duplicates", () => {
    const p = parseSendBody({ ...base, dst: "+14155552672<14155552672< +14155550000", text: "x" });
    expect(p.dsts).toEqual(["14155552672", "14155550000"]);
  });

  it("rejects the whole request for any invalid, empty or too many recipients", () => {
    bad({ ...base, dst: "+14155552672<abc", text: "x" });
    bad({ ...base, dst: "+14155552672<<+14155550000", text: "x" });
    bad({ ...base, dst: "", text: "x" });
    const nums = Array.from({ length: 21 }, (_, i) => `+1415555${String(1000 + i)}`);
    // every number is individually valid and distinct, so only the count can reject
    for (const n of nums) expect(normalizeFullPhone(n)).not.toBeNull();
    expect(new Set(nums.map((n) => normalizeFullPhone(n))).size).toBe(21);
    expect(() => parseSendBody({ ...base, dst: nums.join("<"), text: "x" })).toThrow(/20 destinations/);
  });

  it("requires type=whatsapp and src", () => {
    bad({ ...base, type: "sms", text: "x" });
    bad({ dst: base.dst, type: "whatsapp", text: "x" });
    bad({ ...base, src: "nope", text: "x" });
  });

  it("requires exactly one content kind and enforces text length", () => {
    bad({ ...base });
    bad({ ...base, text: "x", template: { name: "t", language: "en" } });
    bad({ ...base, text: "x".repeat(4097) });
    bad({ ...base, text: "   " });
  });

  it("parses media (text becomes caption), location, template and interactive", () => {
    expect(parseSendBody({ ...base, text: "cap", media_urls: ["https://m.example.com/a.png"] }).content)
      .toEqual({ kind: "media", mediaUrl: "https://m.example.com/a.png", caption: "cap" });
    expect(parseSendBody({ ...base, media_urls: "https://m.example.com/a.pdf" }).content)
      .toEqual({ kind: "media", mediaUrl: "https://m.example.com/a.pdf", caption: null });
    expect(parseSendBody({ ...base, location: { latitude: "1", longitude: "2", name: "n", address: "a" } }).content)
      .toEqual({ kind: "location", latitude: "1", longitude: "2", name: "n", address: "a" });
    bad({ ...base, location: { latitude: "1", longitude: "2", name: "n" } });
    expect(parseSendBody({ ...base, template: { name: "t", language: "en_US" } }).content)
      .toEqual({ kind: "template", name: "t", language: "en_US", components: [] });
    bad({ ...base, media_urls: ["http://insecure.example.com/a.png"] });
    bad({ ...base, media_urls: ["https://a/1.png", "https://a/2.png"] });
  });
});

describe("inferMediaKind", () => {
  it.each([["https://x/a.JPG", "image"], ["https://x/a.mp4?s=1", "video"], ["https://x/a.pdf", "document"], ["https://x/a.mp3", "audio"], ["https://x/a", "image"]])
    ("%s -> %s", (u, k) => { expect(inferMediaKind(u)).toBe(k); });
});

describe("toMetaTemplateComponents", () => {
  it("maps media/text/payload parameters using the stored header format", () => {
    const out = toMetaTemplateComponents([
      { type: "header", parameters: [{ type: "media", media: "https://x/a.mp4" }] },
      { type: "body", parameters: [{ type: "text", text: "John" }] },
      { type: "button", sub_type: "quick_reply", index: "0", parameters: [{ type: "payload", payload: "p1" }] },
      { type: "button", sub_type: "url", index: "1", parameters: [{ type: "text", text: "abc" }] },
    ], "VIDEO");
    expect(out).toEqual([
      { type: "header", parameters: [{ type: "video", video: { link: "https://x/a.mp4" } }] },
      { type: "body", parameters: [{ type: "text", text: "John" }] },
      { type: "button", sub_type: "quick_reply", index: 0, parameters: [{ type: "payload", payload: "p1" }] },
      { type: "button", sub_type: "url", index: 1, parameters: [{ type: "text", text: "abc" }] },
    ]);
  });
  it("rejects unknown component types", () => {
    expect(() => toMetaTemplateComponents([{ type: "weird" }], null)).toThrow(SendValidationError);
  });
});

describe("toMetaInteractive", () => {
  it("maps reply buttons", () => {
    expect(toMetaInteractive({ type: "button", header: { type: "media", media: "https://x/a.png" }, body: { text: "Pick" }, action: { buttons: [{ title: "A", id: "1" }] } })).toEqual({
      type: "button", header: { type: "image", image: { link: "https://x/a.png" } }, body: { text: "Pick" },
      action: { buttons: [{ type: "reply", reply: { id: "1", title: "A" } }] },
    });
  });
  it("maps cta_url", () => {
    expect(toMetaInteractive({ type: "cta_url", body: { text: "Go" }, footer: { text: "f" }, action: { buttons: [{ title: "Open", cta_url: "https://plivo.com" }] } })).toEqual({
      type: "cta_url", body: { text: "Go" }, footer: { text: "f" },
      action: { name: "cta_url", parameters: { display_text: "Open", url: "https://plivo.com" } },
    });
  });
  it("maps the documented list shape (action.lists) into one section", () => {
    const out = toMetaInteractive({ type: "list", body: { text: "Choose" }, action: { lists: [{ title: "A", id: "1" }] } });
    expect(out.action).toEqual({ button: "Options", sections: [{ title: "Options", rows: [{ id: "1", title: "A" }] }] });
  });
  it("rejects unknown types", () => {
    expect(() => toMetaInteractive({ type: "x", body: { text: "t" }, action: {} })).toThrow(SendValidationError);
  });
});

describe("renderTemplateForInbox", () => {
  it("fills body variables from parameters", () => {
    const json = JSON.parse(renderTemplateForInbox("welcome", [{ type: "BODY", text: "Hi {{1}}, order {{2}}" }, { type: "FOOTER", text: "bye" }], [
      { type: "body", parameters: [{ type: "text", text: "Ann" }, { type: "text", text: "42" }] },
    ])) as { templateName: string; body: string; footer: string };
    expect(json).toMatchObject({ templateName: "welcome", body: "Hi Ann, order 42", footer: "bye" });
  });
});
