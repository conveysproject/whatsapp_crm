import { afterEach, describe, expect, it, vi } from "vitest";
import { brandOf } from "@/lib/brand-test-fixtures";
import { DEFAULT_BRAND } from "@/lib/brand";

vi.mock("react", async (orig) => ({ ...(await orig<typeof import("react")>()), useEffect: (fn: () => void) => fn() }));

import { useBrandTitle } from "./useBrandTitle";

afterEach(() => vi.unstubAllGlobals());

describe("useBrandTitle", () => {
  it("sets the tab title to the brand name once a brand is known", () => {
    const doc = { title: "root" };
    vi.stubGlobal("document", doc);
    useBrandTitle(brandOf({ name: "Acme Cloud" }));
    expect(doc.title).toBe("Acme Cloud");
  });
  it("leaves the title alone for the default brand and while loading", () => {
    const doc = { title: "root" };
    vi.stubGlobal("document", doc);
    useBrandTitle(DEFAULT_BRAND);
    useBrandTitle(null);
    expect(doc.title).toBe("root");
  });
});
