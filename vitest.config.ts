import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		environment: "node",
		fileParallelism: false,
		hookTimeout: 20_000,
		include: ["tests/e2e/**/*.test.ts"],
		testTimeout: 20_000,
	},
});
