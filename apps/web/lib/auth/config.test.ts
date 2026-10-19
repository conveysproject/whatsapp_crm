import { describe, it, expect, afterEach } from "vitest";
import { apiBaseUrl, COOKIE } from "./config";

describe("auth config", () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });
  it("apiBaseUrl strips trailing slash and falls back", () => {
    delete process.env["API_URL"];
    delete process.env["NEXT_PUBLIC_API_URL"];
    expect(apiBaseUrl()).toBe("http://localhost:4000");
    process.env["NEXT_PUBLIC_API_URL"] = "https://b.example/";
    expect(apiBaseUrl()).toBe("https://b.example");
    process.env["API_URL"] = "https://a.example//";
    expect(apiBaseUrl()).toBe("https://a.example");
  });
  it("treats empty env strings as unset", () => {
    process.env["API_URL"] = "";
    process.env["NEXT_PUBLIC_API_URL"] = "";
    expect(apiBaseUrl()).toBe("http://localhost:4000");
    process.env["API_URL"] = "";
    process.env["NEXT_PUBLIC_API_URL"] = "https://b.example";
    expect(apiBaseUrl()).toBe("https://b.example");
  });
  it("cookie names", () => {
    expect(COOKIE).toEqual({ refresh: "wb_rt", device: "wb_dev", access: "wb_at" });
  });
});
