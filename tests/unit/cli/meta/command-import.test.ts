import { describe, expect, it, vi } from "vitest";

// Test the splitCommandId helper by importing it from import.ts
// Since splitCommandId is not exported, we test its behavior indirectly
// through handleCommandImport with mocked filesystem.

vi.mock("../../../../src/cli/meta/lib/command-source-loader.js", () => ({
	loadCommandSource: vi.fn(),
	isLoadError: vi.fn(),
}));

vi.mock("../../../../src/cli/meta/lib/command-validation.js", () => ({
	validateCommandSource: vi.fn().mockReturnValue([]),
}));

vi.mock("../../../../src/cli/engine/command-discovery/index-persistence.js", () => ({
	rebuildIndex: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("node:fs/promises", async (importOriginal) => {
	const actual = await importOriginal<typeof import("node:fs/promises")>();
	return {
		...actual,
		mkdir: vi.fn().mockResolvedValue(undefined),
		rm: vi.fn().mockResolvedValue(undefined),
		writeFile: vi.fn().mockResolvedValue(undefined),
	};
	// Note: we DON'T mock access, readdir, or readFile here because
	// we need them to behave realistically for each test case
});

import { handleCommandImport } from "../../../../src/cli/meta/command/import.js";

describe("handleCommandImport package validation", () => {
	it("rejects import when --from/commands/ directory is missing", async () => {
		// Use a path that definitely doesn't have a commands/ subdirectory
		const result = await handleCommandImport({ from: "/nonexistent/path" });

		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.code).toBe("MISSING_COMMANDS_DIR");
		}
	});
});

describe("handleCommandImport dry-run", () => {
	// Dry-run with a non-existent commands dir should still fail at structure check
	it("still validates package structure in dry-run mode", async () => {
		const result = await handleCommandImport({
			from: "/nonexistent/path",
			dryRun: true,
		});

		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.code).toBe("MISSING_COMMANDS_DIR");
		}
	});
});
