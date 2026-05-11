import { type Browser, chromium, type Page } from "playwright-core";
import { DAEMON_LIMITS } from "../config/limits.js";
import { logEvent } from "../observability/logger.js";

let cachedBrowser: Browser | null = null;
let connectingPromise: Promise<Browser> | null = null;
let hasEverConnected = false;
const pagePool: Page[] = [];

/**
 * Returns an active Browser connected over Chrome DevTools Protocol.
 * Connections are lazily established and cached for reuse.
 *
 * Concurrent callers share a single connection attempt via `connectingPromise`,
 * preventing multiple overlapping CDP connection attempts from spawning
 * redundant browser windows or dialogs.
 */
export async function getBrowser(): Promise<Browser> {
	if (cachedBrowser?.isConnected()) {
		return cachedBrowser;
	}
	cachedBrowser = null;

	if (!connectingPromise) {
		const promise = (async (): Promise<Browser> => {
			try {
				const browser = await chromium.connectOverCDP("chrome");
				cachedBrowser = browser;
				hasEverConnected = true;
				logEvent("INFO", "browser_connect");
				return browser;
			} catch {
				const error = new Error(
					"No active browser CDP session found.\n\n" +
						"Follow these steps to establish a connection:\n\n" +
						"1. Ensure Chrome or Edge is running.\n\n" +
						"2. Enable remote debugging in your browser:\n" +
						"   - Open a new tab\n" +
						"   - Go to: chrome://inspect/#remote-debugging\n" +
						'   - Check "Allow this browser instance to be remotely debugged"\n' +
						"   - Leave the browser open\n\n" +
						"3. Try the command again.",
				);
				(error as Error & { code: string }).code = "BROWSER_ATTACH_REQUIRED";
				throw error;
			}
		})();
		connectingPromise = promise;
		promise.finally(() => {
			if (connectingPromise === promise) {
				connectingPromise = null;
			}
		});
	}

	return connectingPromise;
}

/**
 * Returns true if a browser connection is currently cached.
 * Does not trigger a new connection.
 */
export function isBrowserConnected(): boolean {
	return cachedBrowser?.isConnected() ?? false;
}

/**
 * Returns true if connectOverCDP has never been called.
 * This disambiguates "not yet connected" from "connection lost."
 */
export function isBrowserLazy(): boolean {
	return !hasEverConnected;
}

/**
 * Returns the total count of open pages across all browser contexts.
 * Returns 0 if the browser is not connected.
 */
export function getOpenPageCount(): number {
	if (!cachedBrowser?.isConnected()) return 0;
	try {
		return cachedBrowser.contexts().reduce((sum, ctx) => sum + ctx.pages().length, 0);
	} catch {
		return 0;
	}
}

/**
 * Acquires a page for command execution.
 * Reuses a pooled page when available, or creates a new one.
 * Pooled pages are reset to about:blank before reuse.
 */
export async function acquirePage(): Promise<Page> {
	const browser = cachedBrowser;
	if (!browser?.isConnected()) {
		throw new Error("Browser is not connected");
	}

	const context = browser.contexts()[0];
	if (!context) {
		throw new Error("Browser has no default context available");
	}

	while (pagePool.length > 0) {
		const page = pagePool.pop();
		if (!page || page.isClosed()) {
			continue;
		}
		try {
			await page.goto("about:blank", { timeout: 5000 });
			return page;
		} catch {
			await page.close().catch(() => {});
		}
	}

	return context.newPage();
}

/**
 * Releases a page back to the pool after command execution.
 * The page is navigated to about:blank to clear renderer state.
 * If the pool is at capacity, the page is closed instead.
 */
export async function releasePage(page: Page): Promise<void> {
	if (page.isClosed()) {
		return;
	}

	try {
		await page.goto("about:blank", { timeout: 5000 });
	} catch {
		await page.close().catch(() => {});
		return;
	}

	if (pagePool.length < DAEMON_LIMITS.maxConcurrentSessions) {
		pagePool.push(page);
	} else {
		await page.close().catch(() => {});
	}
}

/**
 * Closes all pooled pages and empties the pool.
 */
export async function drainPagePool(): Promise<void> {
	const pages = pagePool.splice(0, pagePool.length);
	for (const page of pages) {
		if (!page.isClosed()) {
			await page.close().catch(() => {});
		}
	}
}

/**
 * Closes the cached browser connection and clears the cache.
 */
export async function closeBrowser(): Promise<void> {
	await drainPagePool();
	if (cachedBrowser) {
		await cachedBrowser.close().catch(() => {});
		logEvent("WARN", "browser_disconnect");
		cachedBrowser = null;
	}
}

/**
 * Executes a function with an active browser, reconnecting once if
 * the cached connection turns out to be stale (e.g. Chrome was restarted).
 */
export async function withBrowser<T>(fn: (browser: Browser) => Promise<T>): Promise<T> {
	let browser: Browser;
	try {
		browser = await getBrowser();
		return await fn(browser);
	} catch (err) {
		const code = (err as Error & { code?: string }).code;
		const message = (err as Error).message ?? "";

		// Do not retry on CDP attach failures; the browser simply isn't available.
		if (code === "BROWSER_ATTACH_REQUIRED") {
			throw err;
		}

		const errName = (err as Error).name;
		const errCode = (err as Error & { code?: string }).code;

		// Detect stale connection errors and retry once.
		if (
			errName === "TargetClosedError" ||
			errCode === "ECONNRESET" ||
			errCode === "ECONNREFUSED" ||
			errCode === "EPIPE" ||
			message.includes("Browser has been closed") ||
			message.includes("Session closed") ||
			message.includes("Target closed")
		) {
			await closeBrowser();
			browser = await getBrowser();
			return await fn(browser);
		}
		throw err;
	}
}
