import { describe, it, expect, vi } from "vitest";
import { createElement as h, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ClientAcceptMessage, ClientAcceptView } from "./ClientAcceptView";

vi.mock("next/link", () => ({ default: ({ children, href }: { children: ReactNode; href: string }) => h("a", { href }, children) }));

const meta = { parentName: "Acme Agency", email: "client@example.com", accountExists: false };
const props = { meta, busy: false, error: null, redirectPath: "/client-invitations/t/accept", onSubmit: () => undefined, onCreateAccount: () => undefined };

describe("client accept default markup", () => {
  for (const mode of ["signedIn", "newAccount", "signIn"] as const) {
    it(mode, async () => {
      await expect(renderToStaticMarkup(h(ClientAcceptView, { ...props, mode }))).toMatchFileSnapshot(`./__golden__/client-accept.${mode}.default.html`);
    });
  }
  it("message", async () => {
    await expect(renderToStaticMarkup(h(ClientAcceptMessage, { message: "Loading invitation..." }))).toMatchFileSnapshot("./__golden__/client-accept.message.default.html");
  });
});
