import { missingConfig } from "./config-check";

const ok = { apiUrl: "https://api.example.com", webUrl: "https://app.example.com" };

describe("missingConfig", () => {
  it("is empty for a valid production config", () => {
    expect(missingConfig(ok, false)).toEqual([]);
  });
  it("flags a localhost API url in a release build", () => {
    expect(missingConfig({ ...ok, apiUrl: "http://localhost:4000" }, false)).toEqual(["EXPO_PUBLIC_API_URL"]);
    expect(missingConfig({ ...ok, apiUrl: "http://127.0.0.1:4000" }, false)).toEqual(["EXPO_PUBLIC_API_URL"]);
  });
  it("allows localhost in dev", () => {
    expect(missingConfig({ ...ok, apiUrl: "http://localhost:4000" }, true)).toEqual([]);
  });
});
