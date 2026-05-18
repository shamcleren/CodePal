import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    globalSetup: ["./vitest.globalSetup.ts"],
    setupFiles: ["src/testSupport/listenCapabilitySetup.ts"],
  },
});
