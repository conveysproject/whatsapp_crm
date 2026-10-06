import { describe, it, expect } from "vitest";
import { fromMetaTemplateStatus, toPublicTemplateStatus, PUBLIC_EDITABLE_STATUSES } from "./template-status.js";

describe("fromMetaTemplateStatus", () => {
  it.each([
    ["APPROVED", "approved"], ["PENDING", "pending"], ["REJECTED", "rejected"], ["PAUSED", "paused"], ["DISABLED", "disabled"],
    ["IN_APPEAL", "in_appeal"], ["FLAGGED", "flagged"], ["LIMIT_EXCEEDED", "limit_exceeded"], ["PENDING_DELETION", "pending_deletion"],
    ["ARCHIVED", "archived"], ["DELETED", "archived"], ["REINSTATED", "approved"],
  ])("%s -> %s", (meta, ours) => { expect(fromMetaTemplateStatus(meta)).toBe(ours); });

  it("is case/space tolerant and returns null for unknown or non-string values (caller keeps the current status)", () => {
    expect(fromMetaTemplateStatus(" approved ")).toBe("approved");
    for (const v of ["SOMETHING_NEW", "", undefined, null, 5, {}]) expect(fromMetaTemplateStatus(v)).toBeNull();
  });
});

describe("toPublicTemplateStatus", () => {
  it("upper-cases every stored status; draft reads as PENDING", () => {
    expect(toPublicTemplateStatus("approved")).toBe("APPROVED");
    expect(toPublicTemplateStatus("paused")).toBe("PAUSED");
    expect(toPublicTemplateStatus("limit_exceeded")).toBe("LIMIT_EXCEEDED");
    expect(toPublicTemplateStatus("pending_deletion")).toBe("PENDING_DELETION");
    expect(toPublicTemplateStatus("draft")).toBe("PENDING");
  });
});

describe("PUBLIC_EDITABLE_STATUSES", () => {
  it("matches Meta: only approved, rejected and paused templates can be edited", () => {
    expect([...PUBLIC_EDITABLE_STATUSES].sort()).toEqual(["approved", "paused", "rejected"]);
  });
});
