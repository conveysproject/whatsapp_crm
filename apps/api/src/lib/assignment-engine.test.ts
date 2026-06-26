import { describe, it, expect, vi } from "vitest";
import { evaluateConditions, type AssignmentCondition, pickWorkloadBalancedAgent } from "./assignment-engine.js";

const contact = {
  firstName: "Ravi", lastName: "Kumar", email: "ravi@acme.com",
  phoneNumber: "+919000000001", leadStatusId: "ls-1", countryCode: "IN",
  languageCode: "en", tags: ["vip", "jewellery"],
};

describe("pickWorkloadBalancedAgent", () => {
  it("filters candidate agents to the given team", async () => {
    const prisma = {
      user: { findMany: vi.fn().mockResolvedValue([{ id: "a1" }]) },
      contact: { groupBy: vi.fn().mockResolvedValue([]) },
    } as never;
    await pickWorkloadBalancedAgent(prisma, "org-1", "team-1");
    expect((prisma as never as { user: { findMany: ReturnType<typeof vi.fn> } }).user.findMany)
      .toHaveBeenCalledWith({ where: { organizationId: "org-1", role: "agent", isActive: true, teamId: "team-1" }, select: { id: true } });
  });
});

describe("evaluateConditions", () => {
  it("empty conditions always match", () => {
    expect(evaluateConditions(contact, [])).toBe(true);
  });
  it("field equals (case-insensitive)", () => {
    expect(evaluateConditions(contact, [{ kind: "field", field: "countryCode", operator: "equals", value: "in" }])).toBe(true);
    expect(evaluateConditions(contact, [{ kind: "field", field: "countryCode", operator: "equals", value: "us" }])).toBe(false);
  });
  it("field isNot", () => {
    expect(evaluateConditions(contact, [{ kind: "field", field: "leadStatusId", operator: "isNot", value: "ls-2" }])).toBe(true);
    expect(evaluateConditions(contact, [{ kind: "field", field: "leadStatusId", operator: "isNot", value: "ls-1" }])).toBe(false);
  });
  it("field contains", () => {
    expect(evaluateConditions(contact, [{ kind: "field", field: "email", operator: "contains", value: "@acme" }])).toBe(true);
    expect(evaluateConditions(contact, [{ kind: "field", field: "email", operator: "contains", value: "@other" }])).toBe(false);
  });
  it("tags has / notHas", () => {
    expect(evaluateConditions(contact, [{ kind: "tags", operator: "has", value: "vip" }])).toBe(true);
    expect(evaluateConditions(contact, [{ kind: "tags", operator: "has", value: "lead" }])).toBe(false);
    expect(evaluateConditions(contact, [{ kind: "tags", operator: "notHas", value: "lead" }])).toBe(true);
    expect(evaluateConditions(contact, [{ kind: "tags", operator: "notHas", value: "vip" }])).toBe(false);
  });
  it("multiple conditions are AND'd", () => {
    const conds: AssignmentCondition[] = [
      { kind: "field", field: "countryCode", operator: "equals", value: "IN" },
      { kind: "tags", operator: "has", value: "vip" },
    ];
    expect(evaluateConditions(contact, conds)).toBe(true);
    expect(evaluateConditions(contact, [...conds, { kind: "tags", operator: "has", value: "missing" }])).toBe(false);
  });
});
