import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		environment: "node",
		hookTimeout: 20_000,
		testTimeout: 20_000,
		include: [],
		projects: [
			{
				extends: true,
				test: {
					name: "unit",
					include: ["tests/unit/**/*.test.ts"],
					passWithNoTests: true,
				},
			},
			{
				extends: true,
				test: {
					name: "integration",
					include: ["tests/integration/**/*.test.ts"],
					passWithNoTests: true,
				},
			},
			{
				extends: true,
				test: {
					name: "e2e",
					include: ["tests/e2e/**/*.test.ts"],
					fileParallelism: false,
				},
			},
		],
	},
});
