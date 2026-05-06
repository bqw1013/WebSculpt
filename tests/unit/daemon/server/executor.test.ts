import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Browser, BrowserContext, Page } from "playwright-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../src/daemon/server/executor/browser-manager.js", () => ({
	withBrowser: vi.fn(),
}));

import { withBrowser } from "../../../../src/daemon/server/executor/browser-manager.js";

describe("executeCommand timeout", () => {
	let tempDir: string;
	let rejectEvaluate: ((reason: Error) => void) | null = null;
	let executeCommand: typeof import("../../../../src/daemon/server/executor/executor.js").executeCommand;

	beforeEach(async () => {
		vi.clearAllMocks();
		process.env.WEBSCULPT_TEST_COMMAND_TIMEOUT_MS = "50";

		tempDir = mkdtempSync(join(tmpdir(), "ws-test-"));

		const mockPage = {
			close: vi.fn().mockImplementation(() => {
				if (rejectEvaluate) {
					const err = new Error("TargetClosedError");
					err.name = "TargetClosedError";
					rejectEvaluate(err);
				}
				return Promise.resolve();
			}),
			evaluate: vi.fn().mockImplementation(() => {
				return new Promise((_resolve, reject) => {
					rejectEvaluate = reject;
				});
			}),
		} as unknown as Page;

		const mockContext = {
			newPage: vi.fn().mockResolvedValue(mockPage),
		} as unknown as BrowserContext;

		const mockBrowser = {
			contexts: vi.fn().mockReturnValue([mockContext]),
		} as unknown as Browser;

		vi.mocked(withBrowser).mockImplementation(async (fn) => {
			return fn(mockBrowser);
		});

		vi.resetModules();
		const mod = await import("../../../../src/daemon/server/executor/executor.js");
		executeCommand = mod.executeCommand;
	});

	afterEach(() => {
		delete process.env.WEBSCULPT_TEST_COMMAND_TIMEOUT_MS;
		rmSync(tempDir, { recursive: true, force: true });
	});

	it("forcibly closes the page after the timeout and rejects", { timeout: 5000 }, async () => {
		const hangingPath = join(tempDir, "hang.js");
		writeFileSync(hangingPath, "export default async (page) => await page.evaluate(() => {});", "utf-8");

		await expect(executeCommand(hangingPath, {})).rejects.toThrow("Command execution timed out");
	});

	it("clears the timeout when the command completes before the deadline", async () => {
		const quickPath = join(tempDir, "quick.js");
		writeFileSync(quickPath, "export default async () => 'ok';", "utf-8");

		const result = await executeCommand(quickPath, {});
		expect(result).toBe("ok");
	});
});
