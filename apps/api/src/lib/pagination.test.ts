import { describe, it, expect } from "vitest";
import { paginate, parsePaginationParams } from "./pagination.js";

describe("paginate", () => {
  const items = Array.from({ length: 10 }, (_, i) => ({ id: `id-${i}` }));

  it("returns all items when count <= limit", () => {
    const result = paginate(items.slice(0, 5), 10);
    expect(result.data).toHaveLength(5);
    expect(result.pagination.has_more).toBe(false);
    expect(result.pagination.next_cursor).toBeNull();
  });

  it("slices to limit and sets next_cursor when has_more", () => {
    const result = paginate(items, 5);
    expect(result.data).toHaveLength(5);
    expect(result.pagination.has_more).toBe(true);
    expect(result.pagination.next_cursor).toBe("id-4");
  });
});

describe("parsePaginationParams", () => {
  it("returns defaults when no params", () => {
    const result = parsePaginationParams({});
    expect(result.limit).toBe(50);
    expect(result.cursor).toBeUndefined();
  });

  it("clamps limit to 100", () => {
    const result = parsePaginationParams({ limit: "999" });
    expect(result.limit).toBe(100);
  });

  it("parses cursor", () => {
    const result = parsePaginationParams({ cursor: "abc" });
    expect(result.cursor).toBe("abc");
  });
});
