import { describe, it, expect } from "vitest";
import { planImport, splitName, normalizeEmail, parseArgs, type UserRow } from "./import-auth-accounts.helpers.js";

const u = (id: string, email: string, fullName = "Ann Lee", deletedAt: Date | null = null): UserRow => ({ id, email, fullName, deletedAt });

describe("import-auth-accounts helpers", () => {
  it("plans one account per live user with normalized email and split names", () => {
    const plan = planImport([u("user_1", "  Ann@X.com ", "Ann Marie Lee")], []);
    expect(plan.create).toEqual([{ id: "user_1", email: "ann@x.com", firstName: "Ann", lastName: "Marie Lee" }]);
    expect(plan.conflicts).toEqual([]);
  });

  it("skips soft-deleted users", () => {
    const plan = planImport([u("user_1", "a@x.com", "A", new Date())], []);
    expect(plan.create).toEqual([]);
    expect(plan.skippedDeleted).toEqual(["user_1"]);
  });

  it("is idempotent: users that already have an account with the same id are not re-created", () => {
    const plan = planImport([u("user_1", "a@x.com")], [{ id: "user_1", email: "a@x.com" }]);
    expect(plan.create).toEqual([]);
    expect(plan.alreadyImported).toEqual(["user_1"]);
  });

  it("reports duplicate emails among users instead of guessing", () => {
    const plan = planImport([u("user_1", "a@x.com"), u("user_2", "A@x.com ")], []);
    expect(plan.create).toEqual([]);
    expect(plan.conflicts.map((c) => c.reason)).toEqual(["duplicate_email_in_users", "duplicate_email_in_users"]);
  });

  it("reports an email already used by a different auth account", () => {
    const plan = planImport([u("user_1", "a@x.com")], [{ id: "usr_other", email: "a@x.com" }]);
    expect(plan.create).toEqual([]);
    expect(plan.conflicts).toEqual([{ userId: "user_1", reason: "email_taken_by_other_account" }]);
  });

  it("reports empty emails", () => {
    expect(planImport([u("user_1", "  ")], []).conflicts).toEqual([{ userId: "user_1", reason: "empty_email" }]);
  });

  it("splitName handles empty and single names", () => {
    expect(splitName("")).toEqual({ firstName: null, lastName: null });
    expect(splitName("Cher")).toEqual({ firstName: "Cher", lastName: null });
  });

  it("normalizeEmail trims and lowercases", () => {
    expect(normalizeEmail(" A@B.COM ")).toBe("a@b.com");
  });

  it("parseArgs is dry-run unless --apply", () => {
    expect(parseArgs([])).toEqual({ apply: false });
    expect(parseArgs(["--apply"])).toEqual({ apply: true });
  });
});
