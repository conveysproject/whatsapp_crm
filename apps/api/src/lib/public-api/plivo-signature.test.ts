import { describe, it, expect } from "vitest";
import { signV2, newNonce } from "./plivo-signature.js";

describe("plivo V2 signature", () => {
  it("matches the independently computed reference vector", () => {
    expect(signV2("https://example.com/hooks/plivo", "12345678901234567890", "token123"))
      .toBe("zE14putzDAofHnAy32hbEsqed/bTl+2AHh0rZCBayVE=");
  });

  it("ignores the query string and fragment", () => {
    expect(signV2("https://example.com/hooks/plivo?x=1#f", "12345678901234567890", "token123"))
      .toBe("zE14putzDAofHnAy32hbEsqed/bTl+2AHh0rZCBayVE=");
  });

  it("changes with the token and the nonce", () => {
    const base = signV2("https://example.com/h", "1", "a");
    expect(signV2("https://example.com/h", "1", "b")).not.toBe(base);
    expect(signV2("https://example.com/h", "2", "a")).not.toBe(base);
  });

  it("nonce is a 20-digit numeric string", () => {
    expect(newNonce()).toMatch(/^\d{20}$/);
  });
});
