import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Browser, Page } from "playwright-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type * as ExecutorModule from "../../../../src/daemon/server/executor/executor.js";

vi.mock("../../../../src/daemon/server/executor/browser-manager.js", () => ({
	withBrowser: vi.fn(),
	acquirePage: vi.fn(),
	releasePage: vi.fn().mockResolvedValue(undefined),
}));

import { acquirePage, withBrowser } from "../../../../src/daemon/server/executor/browser-manager.js";

describe("executeCommand timeout", () => {
	let tempDir: string;
	let rejectEvaluate: ((reason: Error) => void) | null = null;
	let mockPage: Page;
	let executeCommand: typeof ExecutorModule.executeCommand;

	beforeEach(async () => {
		vi.clearAllMocks();
		process.env.WEBSCULPT_TEST_COMMAND_TIMEOUT_MS = "500";

		tempDir = mkdtempSync(join(tmpdir(), "ws-test-"));

		mockPage = {
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

		vi.mocked(acquirePage).mockResolvedValue(mockPage);

		vi.mocked(withBrowser).mockImplementation(async (fn) => {
			return fn({} as Browser);
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

	it("closes the page when the client disconnects", async () => {
		const hangingPath = join(tempDir, "disconnect.js");
		writeFileSync(hangingPath, "export default async (page) => await page.evaluate(() => {});", "utf-8");
		const controller = new AbortController();

		const execution = executeCommand(hangingPath, {}, undefined, controller.signal);
		await vi.waitFor(() => expect(mockPage.evaluate).toHaveBeenCalled());
		controller.abort();

		await expect(execution).rejects.toMatchObject({ code: "CLIENT_DISCONNECTED" });
		expect(mockPage.close).toHaveBeenCalled();
	});

	it("passes cwd as the third argument to the command handler", async () => {
		const cwdPath = join(tempDir, "cwd-cmd.js");
		writeFileSync(cwdPath, "export default async (page, params, cwd) => cwd;", "utf-8");

		const result = await executeCommand(cwdPath, {}, "/custom/cwd");
		expect(result).toBe("/custom/cwd");
	});

	it("clears the timeout when the command completes before the deadline", async () => {
		const quickPath = join(tempDir, "quick.js");
		writeFileSync(quickPath, "export default async () => 'ok';", "utf-8");

		const result = await executeCommand(quickPath, {});
		expect(result).toBe("ok");
	});

	it("resolves file I/O relative to cwd using path.resolve", async () => {
		const outputDir = mkdtempSync(join(tmpdir(), "ws-cwd-"));
		const outputFile = "result.txt";
		const cmdPath = join(tempDir, "file-cmd.js");
		const code = [
			`import { writeFileSync } from "node:fs";`,
			`import { resolve } from "node:path";`,
			`export default async (page, params, cwd) => {`,
			`  const filePath = resolve(cwd, params.output);`,
			`  writeFileSync(filePath, "hello from cwd");`,
			`  return "written";`,
			`};`,
		].join("\n");
		writeFileSync(cmdPath, code, "utf-8");

		const result = await executeCommand(cmdPath, { output: outputFile }, outputDir);

		expect(result).toBe("written");
		const expectedPath = join(outputDir, outputFile);
		expect(existsSync(expectedPath)).toBe(true);
		expect(readFileSync(expectedPath, "utf-8")).toBe("hello from cwd");

		rmSync(outputDir, { recursive: true, force: true });
	});
});
