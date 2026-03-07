import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    reporters: ["verbose", "junit"],
    outputFile: { junit: "test-results.xml" },
  },
});
