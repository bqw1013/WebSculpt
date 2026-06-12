import { describe, expect, it, vi } from "vitest";
import { isCaptureRestoreResult, renderCaptureRestoreResult } from "../../../../../src/cli/output/renderers/capture.js";
import type { CaptureRestoreResult, MetaCommandResult } from "../../../../../src/cli/output/types.js";

function buildRestoreResult(overrides?: Partial<CaptureRestoreResult>): CaptureRestoreResult {
	return {
		success: true,
		command: "test/collect",
		path: "/home/user/.websculpt/commands/test/collect",
		sourceType: "user",
		next: "Restore complete. Verify the command with: websculpt test collect",
		...overrides,
	};
}

describe("isCaptureRestoreResult", () => {
	it("returns true for a valid CaptureRestoreResult", () => {
		const result = buildRestoreResult();
		expect(isCaptureRestoreResult(result)).toBe(true);
	});

	it("returns true for builtin restore result", () => {
		const result = buildRestoreResult({ sourceType: "builtin" });
		expect(isCaptureRestoreResult(result)).toBe(true);
	});

	it("returns false for a failure result", () => {
		const error: MetaCommandResult = {
			success: false,
			error: { code: "NOT_FOUND", message: "Not found" },
		};
		expect(isCaptureRestoreResult(error)).toBe(false);
	});

	it("returns false for CaptureImportResult", () => {
		const importResult: MetaCommandResult = {
			success: true,
			capture: {
				name: "test",
				path: "/tmp/test",
				domain: "test",
				action: "cmd",
				runtime: "node",
			},
			importedFrom: "test/cmd",
			next: "next step",
		};
		expect(isCaptureRestoreResult(importResult)).toBe(false);
	});

	it("returns false for CaptureNewResult", () => {
		const newResult: MetaCommandResult = {
			success: true,
			capture: {
				name: "test",
				path: "/tmp/test",
				domain: "test",
				action: "cmd",
				runtime: "node",
			},
			commandLibrarySnapshot: {
				totalCommands: 10,
				sameDomainCommands: [],
				nameConflict: false,
			},
			summary: {
				domain: "test",
				action: "cmd",
				estimatedSteps: 5,
			},
			next: "next step",
		};
		expect(isCaptureRestoreResult(newResult)).toBe(false);
	});

	it("returns false for CaptureStatusResult", () => {
		const statusResult: MetaCommandResult = {
			success: true,
			capture: { name: "test", path: "/tmp" },
			artifacts: {
				evidence: { status: "done" },
				command: { status: "done" },
				manifest: { status: "done" },
				readme: { status: "done" },
				context: { status: "done" },
				validation: { status: "done" },
			},
			readyToFinalize: true,
			next: { action: "finalize" },
		};
		expect(isCaptureRestoreResult(statusResult)).toBe(false);
	});
});

describe("renderCaptureRestoreResult", () => {
	it("renders command, path, sourceType, and next prompt", () => {
		const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

		const result = buildRestoreResult();
		renderCaptureRestoreResult(result);

		const output = logSpy.mock.calls.map((call) => call[0]).join("\n");

		expect(output).toContain("Command restored: test/collect");
		expect(output).toContain("path:");
		expect(output).toContain("/home/user/.websculpt/commands/test/collect");
		expect(output).toContain("source type:");
		expect(output).toContain("user");
		expect(output).toContain("Next:");
		expect(output).toContain("Restore complete. Verify the command with: websculpt test collect");

		logSpy.mockRestore();
	});

	it("renders builtin sourceType", () => {
		const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

		const result = buildRestoreResult({ sourceType: "builtin" });
		renderCaptureRestoreResult(result);

		const output = logSpy.mock.calls.map((call) => call[0]).join("\n");
		expect(output).toContain("builtin");

		logSpy.mockRestore();
	});
});
