import { describe, it, expect, vi } from "vitest";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { inQuery } from "@/lib/brand-test-fixtures";
import { ApiCredentialsSection } from "./ApiCredentialsSection";

vi.mock("@/components/PermissionGate", () => ({ PermissionGate: ({ children }: { children: unknown }) => children }));

describe("ApiCredentialsSection default markup", () => {
  it("is unchanged for the default brand (empty list)", async () => {
    const html = renderToStaticMarkup(inQuery(h(ApiCredentialsSection), (qc) => qc.setQueryData(["api-credentials"], [])));
    await expect(html).toMatchFileSnapshot("./__golden__/api-credentials.default.html");
  });
});
