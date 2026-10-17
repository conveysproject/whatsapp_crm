import { parseAuthMode, resolveAuthMode } from "./provider";

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

describe("resolveAuthMode", () => {
  function deps(probe: () => Promise<number>, last: string | null = null) {
    return { probe: jest.fn(probe), lastKnown: jest.fn(async () => last), remember: jest.fn(async () => undefined) };
  }

  it("uses a fixed mode without asking the API", async () => {
    const d = deps(async () => 200);
    await expect(resolveAuthMode("clerk", d)).resolves.toBe("clerk");
    await expect(resolveAuthMode("wbmsg", d)).resolves.toBe("wbmsg");
    expect(d.probe).not.toHaveBeenCalled();
  });

  it("auto: 200 means WBMSG login, 404 means Clerk, and the answer is remembered", async () => {
    const a = deps(async () => 200);
    await expect(resolveAuthMode("auto", a)).resolves.toBe("wbmsg");
    expect(a.remember).toHaveBeenCalledWith("wbmsg");
    const b = deps(async () => 404);
    await expect(resolveAuthMode("auto", b)).resolves.toBe("clerk");
    expect(b.remember).toHaveBeenCalledWith("clerk");
  });

  it("auto: offline or unclear answers reuse the last known mode, else clerk", async () => {
    await expect(resolveAuthMode("auto", deps(async () => 0, "wbmsg"))).resolves.toBe("wbmsg");
    await expect(resolveAuthMode("auto", deps(async () => 503, "wbmsg"))).resolves.toBe("wbmsg");
    await expect(resolveAuthMode("auto", deps(async () => { throw new Error("x"); }, null))).resolves.toBe("clerk");
    await expect(resolveAuthMode("auto", deps(async () => 0, "garbage"))).resolves.toBe("clerk");
  });
});
