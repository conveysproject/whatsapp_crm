import { describe, it, expect } from "vitest";
import { getTagColor } from "./tag-color";

describe("getTagColor", () => {
  it("returns an object with bg and text properties", () => {
    const color = getTagColor("premium");
    expect(color).toHaveProperty("bg");
    expect(color).toHaveProperty("text");
  });

  it("returns the same color for the same tag every time", () => {
    expect(getTagColor("vip")).toEqual(getTagColor("vip"));
    expect(getTagColor("lead")).toEqual(getTagColor("lead"));
  });

  it("does not throw on an empty string", () => {
    expect(() => getTagColor("")).not.toThrow();
  });

  it("reaches at least 5 distinct colors across 20 varied inputs", () => {
    const inputs = ["a","b","c","d","e","f","g","h","i","j","k","l","m","n","o","p","q","r","s","t"];
    const bgs = new Set(inputs.map((t) => getTagColor(t).bg));
    expect(bgs.size).toBeGreaterThanOrEqual(5);
  });
});
