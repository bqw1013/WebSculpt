import { chromium } from "playwright-core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { closeBrowser, withBrowser } from "../../../../src/cli/daemon/runtime/browser-manager.js";

vi.mock("playwright-core", () => ({
	chromium: {
		connectOverCDP: vi.fn(),
	},
}));

function mockBrowser(): import("playwright-core").Browser {
	return {
		close: vi.fn().mockResolvedValue(undefined),
		isConnected: vi.fn().mockReturnValue(true),
	} as unknown as import("playwright-core").Browser;
}

describe("withBrowser stale connection detection", () => {
	beforeEach(async () => {
		vi.clearAllMocks();
		await closeBrowser();
	});

	it("retries on TargetClosedError", async () => {
		const browser1 = mockBrowser();
		const browser2 = mockBrowser();

		let callCount = 0;
		vi.mocked(chromium.connectOverCDP).mockImplementation(async () => {
			callCount++;
			if (callCount === 1) return browser1;
			return browser2;
		});

		const error = new Error("Target closed");
		error.name = "TargetClosedError";

		let fnCallCount = 0;
		const result = await withBrowser(async () => {
			fnCallCount++;
			if (fnCallCount === 1) throw error;
			return "success";
		});

		expect(result).toBe("success");
		expect(fnCallCount).toBe(2);
	});

	it("retries on ECONNRESET", async () => {
		const browser1 = mockBrowser();
		const browser2 = mockBrowser();

		let callCount = 0;
		vi.mocked(chromium.connectOverCDP).mockImplementation(async () => {
			callCount++;
			if (callCount === 1) return browser1;
			return browser2;
		});

		const error = new Error("Connection reset") as Error & { code: string };
		error.code = "ECONNRESET";

		let fnCallCount = 0;
		const result = await withBrowser(async () => {
			fnCallCount++;
			if (fnCallCount === 1) throw error;
			return "success";
		});

		expect(result).toBe("success");
		expect(fnCallCount).toBe(2);
	});

	it("does not retry on PLAYWRIGHT_CLI_ATTACH_REQUIRED", async () => {
		const error = new Error("No active browser CDP session found.") as Error & { code: string };
		error.code = "PLAYWRIGHT_CLI_ATTACH_REQUIRED";

		await expect(
			withBrowser(async () => {
				throw error;
			}),
		).rejects.toBe(error);
	});

	it("does not retry on WebSocket business errors", async () => {
		vi.mocked(chromium.connectOverCDP).mockResolvedValue(mockBrowser());

		const error = new Error("WebSocket connection to API failed");

		await expect(
			withBrowser(async () => {
				throw error;
			}),
		).rejects.toBe(error);
	});
});
