import { missingConfig } from "./config-check";

const ok = { apiUrl: "https://api.example.com", webUrl: "https://app.example.com", clerkPublishableKey: "pk_live_x" };

describe("missingConfig", () => {
  it("is empty for a valid production config", () => {
    expect(missingConfig(ok, false)).toEqual([]);
  });
  it("flags an empty Clerk key", () => {
    expect(missingConfig({ ...ok, clerkPublishableKey: "" }, false)).toEqual(["EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY"]);
  });
  it("flags a localhost API url in a release build", () => {
    expect(missingConfig({ ...ok, apiUrl: "http://localhost:4000" }, false)).toEqual(["EXPO_PUBLIC_API_URL"]);
    expect(missingConfig({ ...ok, apiUrl: "http://127.0.0.1:4000" }, false)).toEqual(["EXPO_PUBLIC_API_URL"]);
  });
  it("allows localhost in dev", () => {
    expect(missingConfig({ ...ok, apiUrl: "http://localhost:4000" }, true)).toEqual([]);
  });
});

describe("missingConfig per login mode", () => {
  it("does not need the Clerk key for a WBMSG-login build", () => {
    expect(missingConfig({ ...ok, clerkPublishableKey: "", authProvider: "wbmsg" }, false)).toEqual([]);
  });
  it("still needs the Clerk key for clerk and auto builds", () => {
    expect(missingConfig({ ...ok, clerkPublishableKey: "", authProvider: "clerk" }, false)).toEqual(["EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY"]);
    expect(missingConfig({ ...ok, clerkPublishableKey: "", authProvider: "auto" }, false)).toEqual(["EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY"]);
  });
});
