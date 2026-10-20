import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // tsconfig keeps jsx=preserve for Next; render component tests with the automatic runtime.
  esbuild: { jsx: "automatic" },
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
  test: {
    environment: "node",
    include: ["app/**/*.test.ts", "components/**/*.test.ts", "lib/**/*.test.ts", "hooks/**/*.test.ts"],
  },
});
