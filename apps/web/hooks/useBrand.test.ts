import { describe, it, expect } from "vitest";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { useBrand } from "./useBrand";
import { BrandProvider } from "@/components/brand/BrandProvider";
import { DEFAULT_BRAND, parseBrand } from "@/lib/brand";

function Name(): ReturnType<typeof h> {
  return h("span", null, useBrand().name);
}

describe("useBrand", () => {
  it("returns the default brand when there is no provider", () => {
    expect(renderToStaticMarkup(h(Name))).toBe("<span>WBMSG</span>");
  });
  it("returns the provided brand", () => {
    const brand = parseBrand({ ...DEFAULT_BRAND, name: "Acme Cloud", isDefault: false, primaryColor: "#1a2b3c" });
    expect(brand).not.toBe(DEFAULT_BRAND);
    expect(renderToStaticMarkup(h(BrandProvider, { brand }, h(Name)))).toBe("<span>Acme Cloud</span>");
  });
});
