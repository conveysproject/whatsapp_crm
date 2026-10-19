import { afterEach, describe, expect, it, vi } from "vitest";
import { isBootstrapEnabled, verifyBootstrapSecret } from "./bootstrap-secret.js";

const SECRET = "test-bootstrap-secret-0123456789abcdef";

describe("bootstrap secret", () => {
  afterEach(() => { vi.unstubAllEnvs(); });

  it("is disabled and rejects everything when the secret is unset or shorter than 32 characters", () => {
    vi.stubEnv("BOOTSTRAP_SECRET", "");
    expect(isBootstrapEnabled()).toBe(false);
    expect(verifyBootstrapSecret("")).toBe(false);
    vi.stubEnv("BOOTSTRAP_SECRET", "short-secret");
    expect(isBootstrapEnabled()).toBe(false);
    expect(verifyBootstrapSecret("short-secret")).toBe(false);
  });

  it("accepts only the exact secret", () => {
    vi.stubEnv("BOOTSTRAP_SECRET", SECRET);
    expect(isBootstrapEnabled()).toBe(true);
    expect(verifyBootstrapSecret(SECRET)).toBe(true);
    expect(verifyBootstrapSecret(SECRET.slice(0, -1))).toBe(false);
    expect(verifyBootstrapSecret(SECRET.slice(0, -1) + "X")).toBe(false);
    expect(verifyBootstrapSecret(SECRET + "x")).toBe(false);
  });
});
