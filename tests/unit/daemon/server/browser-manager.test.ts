import { chromium } from "playwright-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../src/daemon/server/config/limits.js", () => ({
	DAEMON_LIMITS: {
		commandTimeoutSec: 20 * 60,
		maxConcurrentSessions: 3,
		maxTotalPages: 50,
		memoryWarningMB: 400,
		memoryLimitMB: 600,
		memoryEmergencyMB: 1000,
		restartAfterExecutions: 200,
	},
}));

import { DAEMON_LIMITS } from "../../../../src/daemon/server/config/limits.js";
import {
	acquirePage,
	closeBrowser,
	drainPagePool,
	getBrowser,
	releasePage,
	withBrowser,
} from "../../../../src/daemon/server/executor/browser-manager.js";

vi.mock("playwright-core", () => ({
	chromium: {
		connectOverCDP: vi.fn(),
	},
}));

function mockPage(): import("playwright-core").Page {
	return {
		goto: vi.fn().mockResolvedValue(undefined),
		close: vi.fn().mockResolvedValue(undefined),
		isClosed: vi.fn().mockReturnValue(false),
	} as unknown as import("playwright-core").Page;
}

function mockContext(): import("playwright-core").BrowserContext {
	return {
		newPage: vi.fn().mockImplementation(async () => {
			return mockPage();
		}),
		pages: vi.fn().mockReturnValue([]),
	} as unknown as import("playwright-core").BrowserContext;
}

function mockBrowser(contexts: import("playwright-core").BrowserContext[] = []): import("playwright-core").Browser {
	return {
		close: vi.fn().mockResolvedValue(undefined),
		isConnected: vi.fn().mockReturnValue(true),
		contexts: vi.fn().mockReturnValue(contexts),
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

	it("does not retry on BROWSER_ATTACH_REQUIRED", async () => {
		const error = new Error("No active browser CDP session found.") as Error & { code: string };
		error.code = "BROWSER_ATTACH_REQUIRED";

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

describe("page pool", () => {
	beforeEach(async () => {
		vi.clearAllMocks();
		await closeBrowser();
	});

	it("acquirePage creates a new page when pool is empty", async () => {
		const ctx = mockContext();
		const browser = mockBrowser([ctx]);
		vi.mocked(chromium.connectOverCDP).mockResolvedValue(browser);

		await getBrowser();
		const page = await acquirePage();
		expect(ctx.newPage).toHaveBeenCalledTimes(1);
		expect(page).toBeDefined();
	});

	it("acquirePage reuses a released page", async () => {
		const ctx = mockContext();
		const browser = mockBrowser([ctx]);
		vi.mocked(chromium.connectOverCDP).mockResolvedValue(browser);

		await getBrowser();
		const page = await acquirePage();
		await releasePage(page);
		const reused = await acquirePage();

		expect(ctx.newPage).toHaveBeenCalledTimes(1);
		expect(reused).toBe(page);
	});

	it("acquirePage discards closed pages", async () => {
		const ctx = mockContext();
		const browser = mockBrowser([ctx]);
		vi.mocked(chromium.connectOverCDP).mockResolvedValue(browser);

		await getBrowser();
		const page = await acquirePage();
		vi.mocked(page.isClosed).mockReturnValue(true);
		await releasePage(page);

		await acquirePage();
		expect(ctx.newPage).toHaveBeenCalledTimes(2);
	});

	it("acquirePage discards unresponsive pages and creates a new one", async () => {
		const ctx = mockContext();
		const browser = mockBrowser([ctx]);
		vi.mocked(chromium.connectOverCDP).mockResolvedValue(browser);

		await getBrowser();
		const page = await acquirePage();
		vi.mocked(page.goto).mockRejectedValue(new Error("Navigation failed"));
		await releasePage(page);

		await acquirePage();
		expect(ctx.newPage).toHaveBeenCalledTimes(2);
	});

	it("releasePage navigates to about:blank before returning to pool", async () => {
		const ctx = mockContext();
		const browser = mockBrowser([ctx]);
		vi.mocked(chromium.connectOverCDP).mockResolvedValue(browser);

		await getBrowser();
		const page = await acquirePage();
		await releasePage(page);

		expect(page.goto).toHaveBeenCalledWith("about:blank", { timeout: 5000 });
	});

	it("releasePage closes page when pool is at capacity", async () => {
		const ctx = mockContext();
		const browser = mockBrowser([ctx]);
		vi.mocked(chromium.connectOverCDP).mockResolvedValue(browser);

		await getBrowser();
		// Fill the pool to capacity by holding pages before releasing them,
		// so that each acquire creates a distinct page.
		const pages: import("playwright-core").Page[] = [];
		for (let i = 0; i < DAEMON_LIMITS.maxConcurrentSessions; i++) {
			pages.push(await acquirePage());
		}
		for (const p of pages) {
			await releasePage(p);
		}
		expect(ctx.newPage).toHaveBeenCalledTimes(DAEMON_LIMITS.maxConcurrentSessions);

		// Acquire a page from the pool (reduces pool size by 1) and return it,
		// bringing the pool back to capacity.
		const pooled = await acquirePage();
		await releasePage(pooled);

		// Releasing an extra page when the pool is already full should close it.
		const extra = mockPage();
		await releasePage(extra);

		expect(extra.close).toHaveBeenCalled();
	});

	it("drainPagePool closes all pooled pages", async () => {
		const ctx = mockContext();
		const browser = mockBrowser([ctx]);
		vi.mocked(chromium.connectOverCDP).mockResolvedValue(browser);

		await getBrowser();
		const pages: import("playwright-core").Page[] = [];
		for (let i = 0; i < 3; i++) {
			const p = await acquirePage();
			pages.push(p);
		}
		for (const p of pages) {
			await releasePage(p);
		}

		await drainPagePool();

		for (const p of pages) {
			expect(p.close).toHaveBeenCalled();
		}
	});

	it("closeBrowser drains the pool", async () => {
		const ctx = mockContext();
		const browser = mockBrowser([ctx]);
		vi.mocked(chromium.connectOverCDP).mockResolvedValue(browser);

		await getBrowser();
		const page = await acquirePage();
		await releasePage(page);

		await closeBrowser();
		expect(page.close).toHaveBeenCalled();
		expect(browser.close).toHaveBeenCalled();
	});

	it("releasePage handles already-closed pages gracefully", async () => {
		const page = mockPage();
		vi.mocked(page.isClosed).mockReturnValue(true);
		await releasePage(page);
		expect(page.goto).not.toHaveBeenCalled();
		expect(page.close).not.toHaveBeenCalled();
	});
});
