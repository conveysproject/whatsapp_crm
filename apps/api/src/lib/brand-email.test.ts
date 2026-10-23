import { beforeEach, describe, expect, it, vi } from "vitest";

const sendMail = vi.fn();
vi.mock("./mail.js", () => ({ sendMail: (...a: unknown[]) => sendMail(...a) }));

import { sendCodeEmail } from "../auth/emails.js";
import { PLAIN_EMAIL_RE, validateBrandInput } from "./brand.js";
import { brandedShell, brandMailExtras } from "./email-brand.js";

// KEEP IN SYNC with PLAIN_EMAIL_CASES in apps/web/lib/mail-from.test.ts (same literal, same rules).
const PLAIN_EMAIL_CASES: [string, boolean][] = [
  ["help@acme.test", true],
  ["help+tag@acme.test", true],
  ["help@mail.sub.acme.test", true],
  ["o'brien@x.com", false],
  ["a,b@x.com", false],
  ["a;b@x.com", false],
  ["a(b)@x.com", false],
  ["a[b]@x.com", false],
  ["a:b@x.com", false],
  ["a\\b@x.com", false],
  ["<a@x.com>", false],
  ['a"b@x.com', false],
  ["a b@x.com", false],
  ["a@b@x.com", false],
  ["a@xcom", false],
  [`${"a".repeat(250)}@x.com`, false],
];

const valid = { name: "Acme Msgs", color: "#112233", supportEmail: "help@acme.test", slug: "acme-msgs", hidePoweredBy: false };

describe("PLAIN_EMAIL_RE", () => {
  it.each(PLAIN_EMAIL_CASES)("%j -> %s", (input, expected) => {
    expect(PLAIN_EMAIL_RE.test(input)).toBe(expected);
  });
});

describe("validateBrandInput support email and name", () => {
  it("accepts a plain support email", () => {
    expect(validateBrandInput(valid).ok).toBe(true);
  });
  it.each(PLAIN_EMAIL_CASES.filter(([, ok]) => !ok).map(([e]) => [e]))("refuses %j at save", (supportEmail) => {
    const r = validateBrandInput({ ...valid, supportEmail });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.field).toBe("supportEmail");
  });
  it.each([[",,,"], ['"\\;'], ["--"], ["  .. "]])("refuses a name with no letter or digit: %j", (name) => {
    const r = validateBrandInput({ ...valid, name });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.field).toBe("name");
  });
  it("accepts non-latin names", () => {
    expect(validateBrandInput({ ...valid, name: "品牌" }).ok).toBe(true);
  });
});

describe("legacy stored support email that fails the plain rules", () => {
  const legacy = { name: "Acme Msgs", logoUrl: null, supportEmail: "o'brien@x.com", hidePoweredBy: false };
  beforeEach(() => sendMail.mockReset().mockResolvedValue(undefined));

  it("brandMailExtras omits replyTo but keeps fromName", () => {
    expect(brandMailExtras(legacy)).toEqual({ fromName: "Acme Msgs" });
  });
  it("the footer has no mailto link", () => {
    expect(brandedShell(legacy, "<p>x</p>")).not.toContain("mailto:");
  });
  it("the email is still sent, without replyTo", async () => {
    await sendCodeEmail("a@b.com", "signin_email", "123456", undefined, legacy);
    expect(sendMail).toHaveBeenCalledTimes(1);
    const arg = sendMail.mock.calls[0]![0];
    expect(arg.fromName).toBe("Acme Msgs");
    expect("replyTo" in arg).toBe(false);
  });
  it("omits fromName when the name sanitizes to nothing", () => {
    expect(brandMailExtras({ ...legacy, name: "<>\r\n" })).toEqual({});
  });
});
