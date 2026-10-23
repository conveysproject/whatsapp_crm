import { describe, it, expect, vi } from "vitest";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { inQuery } from "@/lib/brand-test-fixtures";
import { Sidebar } from "./Sidebar";

vi.mock("next/navigation", () => ({ usePathname: () => "/dashboard" }));

describe("Sidebar default markup", () => {
  it("is unchanged for the default brand", async () => {
    await expect(renderToStaticMarkup(inQuery(h(Sidebar)))).toMatchFileSnapshot("./__golden__/sidebar.default.html");
  });
});
