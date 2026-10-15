import { QueryClient } from "@tanstack/react-query";
import { trimThreadToNewestPage } from "./thread-refresh";

const infinite = { pages: [{ n: 1 }, { n: 2 }, { n: 3 }], pageParams: [null, "a", "b"] };

describe("trimThreadToNewestPage", () => {
  it("keeps only the newest page of every thread when no id is given", () => {
    const qc = new QueryClient();
    qc.setQueryData(["messages", "c1"], infinite);
    qc.setQueryData(["messages", "c2"], infinite);
    trimThreadToNewestPage(qc);
    expect(qc.getQueryData(["messages", "c1"])).toEqual({ pages: [{ n: 1 }], pageParams: [null] });
    expect(qc.getQueryData(["messages", "c2"])).toEqual({ pages: [{ n: 1 }], pageParams: [null] });
  });
  it("is scoped to the given conversation", () => {
    const qc = new QueryClient();
    qc.setQueryData(["messages", "c1"], infinite);
    qc.setQueryData(["messages", "c2"], infinite);
    trimThreadToNewestPage(qc, "c1");
    expect((qc.getQueryData(["messages", "c1"]) as typeof infinite).pages).toHaveLength(1);
    expect((qc.getQueryData(["messages", "c2"]) as typeof infinite).pages).toHaveLength(3);
  });
  it("leaves non-infinite data and empty caches untouched", () => {
    const qc = new QueryClient();
    qc.setQueryData(["messages", "flat"], [1, 2, 3]);
    trimThreadToNewestPage(qc);
    expect(qc.getQueryData(["messages", "flat"])).toEqual([1, 2, 3]);
    expect(qc.getQueryData(["messages", "none"])).toBeUndefined();
  });
});
