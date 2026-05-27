import { describe, it, expect } from "vitest";
import {
  extractFirstLastName,
  extractCustomFields,
} from "./contact-import.worker.js";

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
    const row = { Phone: "+911234567890" };
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
    const row = { Phone: "+911234567890" };
    const mapping = [{ csvColumn: "Phone", dbField: "fullPhoneNumber" as const }];
    const result = extractCustomFields(row, mapping);
    expect(result).toEqual({});
  });
});
