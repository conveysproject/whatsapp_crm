import { describe, it, expect } from "vitest";
import { allowedRedirectOrigins, isAllowedRedirect } from "./safe-redirect.js";

describe("safe-redirect", () => {
  const origins = ["https://wbmsg.com"];
  it("allows same-origin urls", () => {
    expect(isAllowedRedirect("https://wbmsg.com/settings/billing?x=1", origins)).toBe(true);
  });
  it("rejects other hosts, lookalikes, schemes and garbage", () => {
    expect(isAllowedRedirect("https://evil.com/", origins)).toBe(false);
    expect(isAllowedRedirect("https://wbmsg.com.evil.com/", origins)).toBe(false);
    expect(isAllowedRedirect("javascript:alert(1)", origins)).toBe(false);
    expect(isAllowedRedirect("//evil.com", origins)).toBe(false);
    expect(isAllowedRedirect("", origins)).toBe(false);
  });
  it("derives origins from WEB_PUBLIC_URL and adds localhost outside production", () => {
    expect(allowedRedirectOrigins({ WEB_PUBLIC_URL: "https://wbmsg.com/x", NODE_ENV: "production" } as NodeJS.ProcessEnv))
      .toEqual(["https://wbmsg.com"]);
    expect(allowedRedirectOrigins({ NODE_ENV: "development" } as NodeJS.ProcessEnv)).toContain("http://localhost:3000");
  });
});
