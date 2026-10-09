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
  it.each([["https://x/a.JPG", "image"], ["https://x/a.mp4?s=1", "video"], ["https://x/a.pdf", "document"], ["https://x/a.mp3", "audio"], ["https://x/a", "image"]])("%s -> %s", (u, k) => { expect(inferMediaKind(u)).toBe(k); });
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

// ---- Fix round 1: malformed untrusted input must always yield SendValidationError ----
const cast = (v: unknown): never => v as never;
const tpl = (t: unknown) => ({ ...base, template: t });
const inter = (i: unknown) => ({ ...base, interactive: i });
const mapT = (components: unknown) => () => toMetaTemplateComponents(cast(components), null);
const mapI = (i: unknown) => () => toMetaInteractive(cast(i));

describe("exclusivity edge cases", () => {
  it("rejects text combined with interactive / location / template+media", () => {
    bad({ ...base, text: "x", interactive: { type: "button", body: { text: "b" }, action: {} } });
    bad({ ...base, text: "x", location: { latitude: "1", longitude: "2", name: "n", address: "a" } });
    bad({ ...base, template: { name: "t", language: "en" }, media_urls: ["https://m.example.com/a.png"] });
  });
  it("rejects empty media_urls / non-object template with SendValidationError", () => {
    bad({ ...base, media_urls: [] });
    bad({ ...base, media_urls: "" });
    bad({ ...base, template: "str" });
    bad({ ...base, interactive: "str" });
    bad({ ...base, location: "str" });
  });
});

describe("template component validation", () => {
  const badComponents: Array<[string, unknown]> = [
    ["null component", [null]],
    ["numeric type", [{ type: 5 }]],
    ["components not array", "x"],
    ["parameters string", [{ type: "body", parameters: "x" }]],
    ["parameters object", [{ type: "body", parameters: {} }]],
    ["parameters [null]", [{ type: "body", parameters: [null] }]],
    ["parameter numeric type", [{ type: "body", parameters: [{ type: 3 }] }]],
    ["unknown parameter type", [{ type: "body", parameters: [{ type: "weird", text: "a" }] }]],
    ["empty parameter type", [{ type: "body", parameters: [{ type: "" }] }]],
    ["text param w/o text", [{ type: "body", parameters: [{ type: "text" }] }]],
    ["text param numeric text", [{ type: "body", parameters: [{ type: "text", text: 5 }] }]],
    ["payload param w/o payload", [{ type: "button", parameters: [{ type: "payload" }] }]],
    ["media param w/o media", [{ type: "header", parameters: [{ type: "media" }] }]],
    ["media param empty media", [{ type: "header", parameters: [{ type: "media", media: "" }] }]],
    ["media param http", [{ type: "header", parameters: [{ type: "media", media: "http://x/a.png" }] }]],
    ["index abc", [{ type: "button", index: "abc", parameters: [] }]],
    ["index null", [{ type: "button", index: null, parameters: [] }]],
    ["index 1.5", [{ type: "button", index: 1.5, parameters: [] }]],
  ];
  it.each(badComponents)("mapper rejects %s", (_n, comps) => { expect(mapT(comps)).toThrow(SendValidationError); });
  it.each(badComponents)("parseSendBody rejects %s", (_n, comps) => {
    expect(() => parseSendBody(tpl({ name: "t", language: "en", components: comps }))).toThrow(SendValidationError);
  });
});

describe("interactive validation", () => {
  const badInteractive: Array<[string, unknown]> = [
    ["no body", { type: "button", action: { buttons: [] } }],
    ["body not object", { type: "button", body: "x", action: { buttons: [] } }],
    ["non-string body.text", { type: "button", body: { text: 5 }, action: { buttons: [] } }],
    ["no action", { type: "button", body: { text: "b" } }],
    ["action not object", { type: "button", body: { text: "b" }, action: "x" }],
    ["buttons string", { type: "button", body: { text: "b" }, action: { buttons: "x" } }],
    ["buttons [null]", { type: "button", body: { text: "b" }, action: { buttons: [null] } }],
    ["button w/o title", { type: "button", body: { text: "b" }, action: { buttons: [{ id: "1" }] } }],
    ["lists string", { type: "list", body: { text: "b" }, action: { lists: "x" } }],
    ["lists [null]", { type: "list", body: { text: "b" }, action: { lists: [null] } }],
    ["cta buttons [null]", { type: "cta_url", body: { text: "b" }, action: { buttons: [null] } }],
    ["unknown type, no body/action", { type: "x" }],
    ["missing type", { body: { text: "b" }, action: {} }],
    ["footer not object", { type: "button", body: { text: "b" }, footer: "f", action: { buttons: [] } }],
    ["header not object", { type: "button", body: { text: "b" }, header: "h", action: { buttons: [] } }],
  ];
  it.each(badInteractive)("mapper rejects %s", (_n, i) => { expect(mapI(i)).toThrow(SendValidationError); });
  it.each(badInteractive)("parseSendBody+mapper rejects %s", (_n, i) => {
    expect(() => {
      const p = parseSendBody(inter(i));
      if (p.content.kind !== "interactive") throw new Error("wrong kind");
      toMetaInteractive(p.content.interactive);
    }).toThrow(SendValidationError);
  });
  it("unknown type reports Unsupported interactive type even without body/action", () => {
    expect(mapI({ type: "x" })).toThrow(/Unsupported interactive type/);
  });
});

describe("renderTemplateForInbox hardening", () => {
  const render = (text: string, params: string[]) =>
    (JSON.parse(renderTemplateForInbox("n", [{ type: "BODY", text }], [{ type: "body", parameters: params.map((t) => ({ type: "text", text: t })) }])) as { body: string }).body;
  it("treats parameter text literally (no $ replacement patterns)", () => {
    expect(render("Pay {{1}} now", ["Total $& due"])).toBe("Pay Total $& due now");
    expect(render("Pay {{1}} now", ["$$"])).toBe("Pay $$ now");
    expect(render("Pay {{1}} now", ["$1"])).toBe("Pay $1 now");
    expect(render("Pay {{1}} now", ["a$`b"])).toBe("Pay a$`b now");
  });
  it("does a single pass (no re-substitution inside inserted values)", () => {
    expect(render("A {{1}} B {{2}}", ["{{2}}", "x"])).toBe("A {{2}} B x");
  });
  it("replaces missing params with empty string", () => {
    expect(render("A {{1}} B {{2}}", ["x"])).toBe("A x B ");
  });
});

describe("named template parameters", () => {
  it("passes parameter_name through to the Meta component", () => {
    const out = toMetaTemplateComponents(cast([
      { type: "body", parameters: [{ type: "text", parameter_name: "username", text: "Alex" }, { type: "text", parameter_name: "ra_name", text: "WB-1001" }] },
    ]), null);
    expect(out).toEqual([{ type: "body", parameters: [
      { type: "text", text: "Alex", parameter_name: "username" },
      { type: "text", text: "WB-1001", parameter_name: "ra_name" },
    ] }]);
  });

  it("leaves positional parameters without a parameter_name key", () => {
    const out = toMetaTemplateComponents(cast([{ type: "body", parameters: [{ type: "text", text: "Ann" }] }]), null);
    expect(out[0]!.parameters![0]).toEqual({ type: "text", text: "Ann" });
  });

  it.each([
    ["parameter_name not a string", [{ type: "body", parameters: [{ type: "text", text: "a", parameter_name: 5 }] }]],
    ["parameter_name with spaces", [{ type: "body", parameters: [{ type: "text", text: "a", parameter_name: "user name" }] }]],
    ["parameter_name too long", [{ type: "body", parameters: [{ type: "text", text: "a", parameter_name: "a".repeat(65) }] }]],
    ["empty text value", [{ type: "body", parameters: [{ type: "text", text: "" }] }]],
    ["whitespace-only text value", [{ type: "body", parameters: [{ type: "text", text: "   " }] }]],
    ["two body components", [{ type: "body", parameters: [] }, { type: "body", parameters: [] }]],
    ["two header components", [{ type: "header", parameters: [] }, { type: "header", parameters: [] }]],
  ])("rejects %s", (_n, comps) => { expect(mapT(comps)).toThrow(SendValidationError); });

  it("allows several button components", () => {
    expect(mapT([
      { type: "button", sub_type: "url", index: 0, parameters: [{ type: "text", text: "a" }] },
      { type: "button", sub_type: "url", index: 1, parameters: [{ type: "text", text: "b" }] },
    ])).not.toThrow();
  });

  it("renderTemplateForInbox fills named placeholders by parameter_name, in any order", () => {
    const stored = [{ type: "BODY", text: "Hi {{username}}, approved by {{ra_name}}" }];
    const json = renderTemplateForInbox("t", stored, cast([
      { type: "body", parameters: [{ type: "text", parameter_name: "ra_name", text: "WB-1001" }, { type: "text", parameter_name: "username", text: "Alex" }] },
    ]));
    expect(JSON.parse(json).body).toBe("Hi Alex, approved by WB-1001");
  });
});

describe("text-parameter checks are scoped to header and body", () => {
  it("accepts an empty text on a button parameter", () => {
    expect(mapT([{ type: "button", sub_type: "url", index: 0, parameters: [{ type: "text", text: "" }] }])).not.toThrow();
  });

  it("ignores parameter_name on a button parameter", () => {
    const out = toMetaTemplateComponents(cast([
      { type: "button", sub_type: "url", index: 0, parameters: [{ type: "text", text: "x", parameter_name: "bad name!" }] },
    ]), null);
    expect(out[0]!.parameters![0]).toEqual({ type: "text", text: "x" });
  });

  it.each(["header", "body"])("%s still rejects empty text and a bad parameter_name", (t) => {
    expect(mapT([{ type: t, parameters: [{ type: "text", text: "" }] }])).toThrow(SendValidationError);
    expect(mapT([{ type: t, parameters: [{ type: "text", text: "a", parameter_name: "bad name!" }] }])).toThrow(SendValidationError);
  });
});

describe("parseSendBody: strict input checks", () => {
  it.each([
    ["letters around src", { src: "abc14155552671xyz" }],
    ["letters in dst", { dst: "abc14155552672xyz" }],
    ["symbols in dst", { dst: "+14155552672#1" }],
    ["letters in a second dst", { dst: "+14155552672<4155x50000" }],
  ])("rejects phone strings with %s", (_n, over) => { bad({ ...base, ...over, text: "x" }); });

  it("accepts +, spaces, dashes and parentheses in phone numbers", () => {
    const p = parseSendBody({ ...base, src: "+1 (415) 555-2671", dst: "+1 415-555-2672", text: "x" });
    expect(p.src).toBe("14155552671");
    expect(p.dsts).toEqual(["14155552672"]);
  });

  it.each([["UPPER"], ["has space"], ["has-dash"], [""], ["a".repeat(513)]])("rejects template name %j", (name) => {
    bad({ ...base, template: { name, language: "en" } });
  });
  it.each([["english"], ["EN"], ["en-US"], ["e"], ["en_us_x"]])("rejects template language %j", (language) => {
    bad({ ...base, template: { name: "t", language } });
  });
  it.each([["en"], ["en_US"], ["pt_BR"], ["fil"], ["zh_CN"]])("accepts template language %j", (language) => {
    expect(() => parseSendBody({ ...base, template: { name: "t", language } })).not.toThrow();
  });

  it("rejects a callback method other than GET or POST, accepts either case", () => {
    bad({ ...base, text: "x", method: "PUT" });
    expect(parseSendBody({ ...base, text: "x", method: "get" }).callbackMethod).toBe("GET");
    expect(parseSendBody({ ...base, text: "x" }).callbackMethod).toBe("POST");
  });
  it("treats blank method as POST and trims whitespace", () => {
    expect(parseSendBody({ ...base, text: "x", method: "" }).callbackMethod).toBe("POST");
    expect(parseSendBody({ ...base, text: "x", method: "  " }).callbackMethod).toBe("POST");
    expect(parseSendBody({ ...base, text: "x", method: " get " }).callbackMethod).toBe("GET");
    bad({ ...base, text: "x", method: "PUT" });
  });
  it("accepts a callback url of exactly 2000 characters, rejects 2001", () => {
    const prefix = "https://c.example.com/";
    expect(() => parseSendBody({ ...base, text: "x", url: prefix + "a".repeat(2000 - prefix.length) })).not.toThrow();
    bad({ ...base, text: "x", url: prefix + "a".repeat(2001 - prefix.length) });
  });
  it("caps the echoed destination in the error message", () => {
    let msg = "";
    try { parseSendBody({ ...base, dst: "x".repeat(100), text: "x" }); } catch (e) { msg = (e as Error).message; }
    expect(msg).toBe("Invalid destination number: " + "x".repeat(32));
  });
  it("rejects a callback url over 2000 characters", () => {
    bad({ ...base, text: "x", url: "https://c.example.com/" + "a".repeat(2000) });
  });
});
