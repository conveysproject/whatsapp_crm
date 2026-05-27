import { describe, it, expect, vi } from "vitest";
import {
  extractFirstLastName,
  extractCustomFields,
  assignBatchGroups,
} from "./contact-import.worker.js";
import type { PrismaClient } from "@prisma/client";

const mockCreateMany = vi.fn().mockResolvedValue({ count: 2 });
const mockPrisma = {
  groupContact: { createMany: mockCreateMany },
} as unknown as PrismaClient;

describe("extractFirstLastName", () => {
  it("extracts separate firstName and lastName columns", () => {
    const row = { First: "Jane", Last: "Doe" };
    const mapping = [
      { csvColumn: "First", dbField: "firstName" as const },
      { csvColumn: "Last", dbField: "lastName" as const },
    ];
    const result = extractFirstLastName(row, mapping);
    expect(result).toEqual({ firstName: "Jane", lastName: "Doe", name: "Jane Doe" });
  });

  it("splits fullName on first space", () => {
    const row = { Name: "John Smith Doe" };
    const mapping = [{ csvColumn: "Name", dbField: "fullName" as const }];
    const result = extractFirstLastName(row, mapping);
    expect(result).toEqual({ firstName: "John", lastName: "Smith Doe", name: "John Smith Doe" });
  });

  it("handles fullName with no space", () => {
    const row = { Name: "Priya" };
    const mapping = [{ csvColumn: "Name", dbField: "fullName" as const }];
    const result = extractFirstLastName(row, mapping);
    expect(result).toEqual({ firstName: "Priya", lastName: "", name: "Priya" });
  });

  it("fullName wins over separate firstName/lastName when both mapped", () => {
    const row = { First: "Jane", Last: "Doe", Full: "Alice Wonder" };
    const mapping = [
      { csvColumn: "First", dbField: "firstName" as const },
      { csvColumn: "Last", dbField: "lastName" as const },
      { csvColumn: "Full", dbField: "fullName" as const },
    ];
    const result = extractFirstLastName(row, mapping);
    expect(result).toEqual({ firstName: "Alice", lastName: "Wonder", name: "Alice Wonder" });
  });

  it("returns nulls when no name fields mapped", () => {
    const row = { Phone: "911234567890" };
    const mapping = [{ csvColumn: "Phone", dbField: "fullPhoneNumber" as const }];
    const result = extractFirstLastName(row, mapping);
    expect(result).toEqual({ firstName: null, lastName: null, name: null });
  });
});

describe("extractCustomFields", () => {
  it("extracts custom field values from matching columns", () => {
    const row = { City: "Mumbai", Plan: "Pro" };
    const mapping = [
      { csvColumn: "City", dbField: "customField:cf-1" as const },
      { csvColumn: "Plan", dbField: "customField:cf-2" as const },
    ];
    const result = extractCustomFields(row, mapping);
    expect(result).toEqual({ "cf-1": "Mumbai", "cf-2": "Pro" });
  });

  it("keys by inputName when cfInputNameMap is provided", () => {
    const row = { City: "Mumbai", Plan: "Pro" };
    const mapping = [
      { csvColumn: "City", dbField: "customField:cf-1" as const },
      { csvColumn: "Plan", dbField: "customField:cf-2" as const },
    ];
    const cfInputNameMap = new Map([["cf-1", "City Field"], ["cf-2", "Plan Field"]]);
    const result = extractCustomFields(row, mapping, cfInputNameMap);
    expect(result).toEqual({ "City Field": "Mumbai", "Plan Field": "Pro" });
  });

  it("skips empty custom field values", () => {
    const row = { City: "", Plan: "Pro" };
    const mapping = [
      { csvColumn: "City", dbField: "customField:cf-1" as const },
      { csvColumn: "Plan", dbField: "customField:cf-2" as const },
    ];
    const result = extractCustomFields(row, mapping);
    expect(result).toEqual({ "cf-2": "Pro" });
  });

  it("returns empty object when no custom fields mapped", () => {
    const row = { Phone: "911234567890" };
    const mapping = [{ csvColumn: "Phone", dbField: "fullPhoneNumber" as const }];
    const result = extractCustomFields(row, mapping);
    expect(result).toEqual({});
  });
});

describe("assignBatchGroups", () => {
  it("creates groupContact records for each contact × group pair", async () => {
    await assignBatchGroups(mockPrisma, ["contact-1", "contact-2"], ["group-a"]);
    expect(mockCreateMany).toHaveBeenCalledWith({
      data: [
        { contactId: "contact-1", contactGroupId: "group-a" },
        { contactId: "contact-2", contactGroupId: "group-a" },
      ],
      skipDuplicates: true,
    });
  });

  it("does nothing when batchGroupIds is empty", async () => {
    mockCreateMany.mockClear();
    await assignBatchGroups(mockPrisma, ["contact-1"], []);
    expect(mockCreateMany).not.toHaveBeenCalled();
  });

  it("does nothing when contactIds is empty", async () => {
    mockCreateMany.mockClear();
    await assignBatchGroups(mockPrisma, [], ["group-a"]);
    expect(mockCreateMany).not.toHaveBeenCalled();
  });
});
