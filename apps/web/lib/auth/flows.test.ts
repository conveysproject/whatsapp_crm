import { describe, expect, it } from "vitest";
import { nextStep, postSignInDestination } from "./flows";

describe("nextStep", () => {
  it("maps a plain 200 to done", () => {
    expect(nextStep({ status: 200, body: { ok: true } })).toEqual({ kind: "done" });
    expect(nextStep({ status: 200, body: null })).toEqual({ kind: "done" });
  });
  it("maps 202 to done", () => {
    expect(nextStep({ status: 202, body: {} })).toEqual({ kind: "done" });
  });
  it("maps mustSetPassword 200 to done", () => {
    expect(nextStep({ status: 200, body: { mustSetPassword: true } })).toEqual({ kind: "done" });
  });
  it("maps new_device", () => {
    expect(nextStep({ status: 200, body: { next: "new_device", challengeId: "c1" } })).toEqual({
      kind: "new_device",
      challengeId: "c1",
    });
  });
  it("maps set_password", () => {
    expect(nextStep({ status: 200, body: { next: "set_password", challengeId: "c2" } })).toEqual({
      kind: "set_password",
      challengeId: "c2",
    });
  });
  it("errors when a next step has no challengeId", () => {
    expect(nextStep({ status: 200, body: { next: "new_device" } }).kind).toBe("error");
  });
  it("uses the API error message", () => {
    expect(nextStep({ status: 400, body: { error: { code: "INVALID_CODE", message: "That code is not right." } } })).toEqual({
      kind: "error",
      message: "That code is not right.",
    });
  });
  it.each([
    [401, "email or password"],
    [429, "Too many"],
    [503, "unavailable"],
    [500, "went wrong"],
  ])("falls back for status %i", (status, fragment) => {
    const r = nextStep({ status, body: {} });
    expect(r.kind).toBe("error");
    expect(r.kind === "error" && r.message).toContain(fragment);
  });
  it("handles non-object bodies", () => {
    expect(nextStep({ status: 503, body: "oops" }).kind).toBe("error");
  });
});

describe("postSignInDestination", () => {
  const base = { email: "a+b@x.com", redirectTarget: "/inbox" };
  it("vendor goes to the redirect target or the security page", () => {
    expect(postSignInDestination({ ...base, variant: "vendor", mustSetPassword: false })).toBe("/inbox");
    expect(postSignInDestination({ ...base, variant: "vendor", mustSetPassword: true })).toBe("/settings/security?set=1");
  });
  it("admin reloads the sign-in page, or sets a password first", () => {
    expect(postSignInDestination({ ...base, variant: "admin", mustSetPassword: false })).toBe("/admin/sign-in");
    expect(postSignInDestination({ ...base, variant: "admin", mustSetPassword: true })).toBe(
      "/forgot-password?email=a%2Bb%40x.com",
    );
  });
});
