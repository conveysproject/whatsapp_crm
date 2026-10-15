import { stepAfterAttempt } from "./sign-in-steps";

describe("stepAfterAttempt", () => {
  it("is done when Clerk reports complete", () => {
    expect(stepAfterAttempt("complete", [])).toBe("done");
  });
  it("asks for the emailed code on a new device (needs_client_trust)", () => {
    expect(stepAfterAttempt("needs_client_trust", [{ strategy: "email_code" }])).toBe("email_code");
  });
  it("uses the email code for a second factor when one is offered", () => {
    expect(stepAfterAttempt("needs_second_factor", [{ strategy: "totp" }, { strategy: "email_code" }])).toBe("email_code");
  });
  it("sends the user to the web when the only second factor is not supported in the app", () => {
    expect(stepAfterAttempt("needs_second_factor", [{ strategy: "totp" }])).toBe("unsupported_2fa");
    expect(stepAfterAttempt("needs_client_trust", null)).toBe("unsupported_2fa");
  });
  it("stays on the password step for anything else", () => {
    expect(stepAfterAttempt("needs_first_factor", [])).toBe("password");
    expect(stepAfterAttempt(undefined, undefined)).toBe("password");
  });
});
