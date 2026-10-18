import { EMPTY_RECORD, classifyProbe, parseAuthMode, parseModeRecord, recordAfterProbe, startMode } from "./provider";

describe("parseAuthMode", () => {
  it("defaults to clerk", () => {
    expect(parseAuthMode(undefined)).toBe("clerk");
    expect(parseAuthMode("")).toBe("clerk");
    expect(parseAuthMode("something")).toBe("clerk");
  });
  it("accepts wbmsg and auto in any case", () => {
    expect(parseAuthMode(" WBMSG ")).toBe("wbmsg");
    expect(parseAuthMode("auto")).toBe("auto");
    expect(parseAuthMode("clerk")).toBe("clerk");
  });
});

describe("classifyProbe", () => {
  it("WBMSG only for a real key set", () => {
    expect(classifyProbe(200, { keys: [{ kty: "OKP" }] })).toBe("wbmsg");
    expect(classifyProbe(200, { keys: [] })).toBe("wbmsg");
    expect(classifyProbe(200, null)).toBe("unknown");
    expect(classifyProbe(200, "<html>captive portal</html>")).toBe("unknown");
    expect(classifyProbe(200, { keys: "x" })).toBe("unknown");
  });
  it("Clerk only for the API's JSON NOT_FOUND", () => {
    expect(classifyProbe(404, { error: { code: "NOT_FOUND", message: "Not found" } })).toBe("clerk");
    expect(classifyProbe(404, null)).toBe("unknown");
    expect(classifyProbe(404, { error: { code: "OTHER" } })).toBe("unknown");
  });
  it("anything else is unknown", () => {
    expect(classifyProbe(0, null)).toBe("unknown");
    expect(classifyProbe(503, { error: { code: "NOT_FOUND" } })).toBe("unknown");
  });
});

describe("parseModeRecord", () => {
  it("reads a stored record and tolerates garbage", () => {
    expect(parseModeRecord(JSON.stringify({ mode: "wbmsg", clerkSeen: 1 }))).toEqual({ mode: "wbmsg", clerkSeen: 1 });
    expect(parseModeRecord(null)).toEqual(EMPTY_RECORD);
    expect(parseModeRecord("wbmsg")).toEqual(EMPTY_RECORD);
    expect(parseModeRecord(JSON.stringify({ mode: "x", clerkSeen: -1 }))).toEqual(EMPTY_RECORD);
  });
});

describe("startMode (no network)", () => {
  it("uses the remembered mode, default clerk", () => {
    expect(startMode(EMPTY_RECORD, false)).toEqual({ mode: "clerk", wipeWbmsg: false });
    expect(startMode({ mode: "wbmsg", clerkSeen: 0 }, false)).toEqual({ mode: "wbmsg", wipeWbmsg: false });
    expect(startMode({ mode: "clerk", clerkSeen: 0 }, false)).toEqual({ mode: "clerk", wipeWbmsg: false });
  });
  it("a stored WBMSG session without a record keeps WBMSG login", () => {
    expect(startMode(EMPTY_RECORD, true)).toEqual({ mode: "wbmsg", wipeWbmsg: false });
  });
  it("wipes the WBMSG keys when a decided downgrade takes effect", () => {
    expect(startMode({ mode: "clerk", clerkSeen: 0 }, true)).toEqual({ mode: "clerk", wipeWbmsg: true });
  });
});

describe("recordAfterProbe", () => {
  it("clerk → wbmsg switches at once (for the next launch)", () => {
    expect(recordAfterProbe(EMPTY_RECORD, "clerk", "wbmsg")).toEqual({ mode: "wbmsg", clerkSeen: 0 });
    expect(recordAfterProbe({ mode: "clerk", clerkSeen: 0 }, "clerk", "wbmsg")).toEqual({ mode: "wbmsg", clerkSeen: 0 });
  });
  it("wbmsg never downgrades on a single Clerk answer", () => {
    expect(recordAfterProbe({ mode: "wbmsg", clerkSeen: 0 }, "wbmsg", "clerk")).toEqual({ mode: "wbmsg", clerkSeen: 1 });
  });
  it("downgrades after Clerk answers on two launches in a row", () => {
    const first = recordAfterProbe({ mode: "wbmsg", clerkSeen: 0 }, "wbmsg", "clerk");
    expect(recordAfterProbe(first, "wbmsg", "clerk")).toEqual({ mode: "clerk", clerkSeen: 0 });
  });
  it("a WBMSG answer in between resets the count", () => {
    const first = recordAfterProbe({ mode: "wbmsg", clerkSeen: 0 }, "wbmsg", "clerk");
    const reset = recordAfterProbe(first, "wbmsg", "wbmsg");
    expect(recordAfterProbe(reset, "wbmsg", "clerk")).toEqual({ mode: "wbmsg", clerkSeen: 1 });
  });
  it("sticky also when WBMSG runs only because a session is stored (no record yet)", () => {
    expect(recordAfterProbe(EMPTY_RECORD, "wbmsg", "clerk")).toEqual({ mode: "wbmsg", clerkSeen: 1 });
  });
  it("unknown keeps the remembered mode", () => {
    expect(recordAfterProbe({ mode: "wbmsg", clerkSeen: 1 }, "wbmsg", "unknown")).toEqual({ mode: "wbmsg", clerkSeen: 1 });
    expect(recordAfterProbe(EMPTY_RECORD, "clerk", "unknown")).toEqual({ mode: "clerk", clerkSeen: 0 });
  });
  it("clerk stays clerk", () => {
    expect(recordAfterProbe(EMPTY_RECORD, "clerk", "clerk")).toEqual({ mode: "clerk", clerkSeen: 0 });
  });
});
