import { describe, it, expect, vi } from "vitest";
import { createElement as h, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { inQuery } from "@/lib/brand-test-fixtures";
import ApiUsagePage from "./page";

vi.mock("@/components/PermissionGate", () => ({ PermissionGate: ({ children }: { children: ReactNode }) => children }));
vi.mock("next/link", () => ({ default: ({ children, href }: { children: ReactNode; href: string }) => h("a", { href }, children) }));

describe("api-usage default markup", () => {
  it("page heading", async () => {
    await expect(renderToStaticMarkup(inQuery(h(ApiUsagePage)))).toMatchFileSnapshot("./__golden__/api-usage.default.html");
  });
});
