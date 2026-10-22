import { describe, it, expect, vi } from "vitest";
import { createElement as h, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import SignInPage from "./sign-in/[[...sign-in]]/page";
import SignUpPage from "./sign-up/[[...sign-up]]/page";
import ForgotPasswordPage from "./forgot-password/page";
import ResetPasswordPage from "./reset-password/page";

vi.mock("next/font/google", () => ({
  DM_Sans: () => ({ variable: "dm-var" }),
  Bricolage_Grotesque: () => ({ variable: "br-var" }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => undefined }), useSearchParams: () => new URLSearchParams() }));
vi.mock("next/link", () => ({ default: ({ children, href }: { children: ReactNode; href: string }) => h("a", { href }, children) }));

// The default (WBMSG) markup of the auth pages must never change when a brand is added.
describe("auth pages default markup", () => {
  it("sign-in", async () => {
    await expect(renderToStaticMarkup(h(SignInPage))).toMatchFileSnapshot("./__golden__/sign-in.default.html");
  });
  it("sign-up", async () => {
    await expect(renderToStaticMarkup(h(SignUpPage))).toMatchFileSnapshot("./__golden__/sign-up.default.html");
  });
  it("forgot-password", async () => {
    await expect(renderToStaticMarkup(h(ForgotPasswordPage))).toMatchFileSnapshot("./__golden__/forgot-password.default.html");
  });
  it("reset-password", async () => {
    const out = await ResetPasswordPage({ searchParams: Promise.resolve({}) });
    await expect(renderToStaticMarkup(out)).toMatchFileSnapshot("./__golden__/reset-password.default.html");
  });
});
