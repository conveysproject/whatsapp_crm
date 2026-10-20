import { describe, it, expect, vi, afterEach } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { ORG_FLAGS_QUERY_KEY, orgFlagsQueryOptions } from "./useOrganization";

afterEach(() => vi.unstubAllGlobals());

describe("useOrganization cache key", () => {
  it("does not share the legacy org-me key (which caches the { data } envelope)", () => {
    expect(ORG_FLAGS_QUERY_KEY).not.toEqual(["org-me"]);
    expect(orgFlagsQueryOptions.queryKey).toEqual(ORG_FLAGS_QUERY_KEY);
  });
  it("is not affected by an envelope cached under org-me", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ data: { id: "o1", name: "Acme", isParent: true } }), { status: 200 })));
    const qc = new QueryClient();
    qc.setQueryData(["org-me"], { data: { id: "legacy", name: "Legacy" } });
    const org = await qc.fetchQuery(orgFlagsQueryOptions);
    expect(org).toMatchObject({ id: "o1", isParent: true });
    expect(qc.getQueryData(["org-me"])).toEqual({ data: { id: "legacy", name: "Legacy" } });
  });
});
