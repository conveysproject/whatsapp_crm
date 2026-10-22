import { describe, it, expect } from "vitest";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ConnectWhatsAppModal } from "./ConnectWhatsAppModal";

describe("ConnectWhatsAppModal default markup", () => {
  it("is unchanged for the default brand", async () => {
    const html = renderToStaticMarkup(h(ConnectWhatsAppModal, { flow: "onboarding", onSuccess: () => undefined, variant: "inline" }));
    await expect(html).toMatchFileSnapshot("./__golden__/connect-modal.default.html");
  });
});
