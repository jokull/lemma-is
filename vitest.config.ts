import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Increase timeout for data loading
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
