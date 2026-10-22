import { describe, it, expect, vi } from "vitest";
import { createElement as h, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { inQuery } from "@/lib/brand-test-fixtures";
import WhatsAppAccountPage from "./page";

vi.mock("@/components/PermissionGate", () => ({ PermissionGate: ({ children }: { children: ReactNode }) => children }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => undefined, replace: () => undefined }),
  useSearchParams: () => new URLSearchParams(),
}));

describe("whatsapp-account default markup", () => {
  it("page", async () => {
    await expect(renderToStaticMarkup(inQuery(h(WhatsAppAccountPage)))).toMatchFileSnapshot("./__golden__/whatsapp-account.default.html");
  });
});
