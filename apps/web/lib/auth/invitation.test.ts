import { describe, expect, it } from "vitest";
import { invitationNextStep, signedInAcceptStep } from "./invitation";

const err = (code: string, message?: string) => ({ error: { code, ...(message ? { message } : {}) } });

describe("invitationNextStep", () => {
  it("201 means signed in and done", () => {
    expect(invitationNextStep(201, { organizationId: "o1" })).toEqual({ kind: "done" });
  });
  it("409 ACCOUNT_EXISTS asks the person to sign in", () => {
    expect(invitationNextStep(409, err("ACCOUNT_EXISTS"))).toEqual({ kind: "account_exists" });
  });
  it("400 INVALID_INVITATION uses plain copy", () => {
    expect(invitationNextStep(400, err("INVALID_INVITATION"))).toEqual({
      kind: "error",
      message: "This invitation link is invalid or has expired.",
    });
  });
  it("400 WEAK_PASSWORD passes the API message through", () => {
    expect(invitationNextStep(400, err("WEAK_PASSWORD", "Password is too short"))).toEqual({
      kind: "error",
      message: "Password is too short",
    });
  });
  it("403 SEAT_LIMIT has a fallback message", () => {
    const s = invitationNextStep(403, err("SEAT_LIMIT"));
    expect(s.kind).toBe("error");
  });
  it("unknown failures and junk bodies fall back safely", () => {
    expect(invitationNextStep(500, null).kind).toBe("error");
    expect(invitationNextStep(409, err("OTHER")).kind).toBe("error");
  });
});

describe("signedInAcceptStep", () => {
  it("201 is done", () => {
    expect(signedInAcceptStep(201, {})).toEqual({ kind: "done" });
  });
  it("EMAIL_MISMATCH and ALREADY_MEMBER are errors with their own copy", () => {
    const a = signedInAcceptStep(403, err("EMAIL_MISMATCH"));
    const b = signedInAcceptStep(409, err("ALREADY_MEMBER"));
    expect(a.kind).toBe("error");
    expect(b.kind).toBe("error");
    expect(a).not.toEqual(b);
  });
  it("other errors use the API message or a fallback", () => {
    expect(signedInAcceptStep(400, err("X", "Nope"))).toEqual({ kind: "error", message: "Nope" });
    expect(signedInAcceptStep(500, undefined).kind).toBe("error");
  });
});
