import { ApiError, type Api } from "./api";
import { resolveGate, type Me } from "./session-gate";

const me: Me = { id: "u-1", fullName: "Maria Lopez", email: "m@x.com", role: "admin", organizationId: "org-1", availability: "online", permissions: {} };
const apiReturning = (impl: () => Promise<unknown>) => jest.fn(impl) as unknown as Api;

describe("resolveGate", () => {
  it("lets customer roles in", async () => {
    for (const role of ["admin", "manager", "agent", "viewer"] as const) {
      const gate = await resolveGate(apiReturning(async () => ({ data: { ...me, role } })));
      expect(gate).toEqual({ kind: "ok", me: { ...me, role } });
    }
  });
  it("blocks super admins", async () => {
    expect(await resolveGate(apiReturning(async () => ({ data: { ...me, role: "superAdmin" } })))).toEqual({ kind: "super_admin" });
  });
  it("treats 401/403/404 as no WBMSG account", async () => {
    for (const status of [401, 403, 404]) {
      const gate = await resolveGate(apiReturning(async () => { throw new ApiError(status, "X", "x"); }));
      expect(gate).toEqual({ kind: "no_account" });
    }
  });
  it("reports other failures as retryable errors", async () => {
    expect(await resolveGate(apiReturning(async () => { throw new ApiError(500, "X", "boom"); }))).toEqual({ kind: "error", message: "boom" });
    expect(await resolveGate(apiReturning(async () => { throw new TypeError("Network request failed"); }))).toEqual({ kind: "error", message: "Network request failed" });
  });
  it("asks /users/me", async () => {
    const api = apiReturning(async () => ({ data: me }));
    await resolveGate(api);
    expect(api).toHaveBeenCalledWith("/users/me");
  });
});
