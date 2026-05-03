import { type Browser, chromium } from "playwright-core";
import { logEvent } from "./logger.js";

let cachedBrowser: Browser | null = null;
let connectingPromise: Promise<Browser> | null = null;
let hasEverConnected = false;

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
						"3. Attach playwright-cli:\n" +
						"   playwright-cli attach --cdp=chrome --session=default\n" +
						"   (For Edge, use: playwright-cli attach --cdp=msedge --session=default)\n\n" +
						"4. Verify the session is active:\n" +
						"   playwright-cli list\n" +
						"   Expected output includes: default: status: open\n\n" +
						"5. If other sessions are listed but 'default' is not:\n" +
						"   playwright-cli close-all\n" +
						"   playwright-cli attach --cdp=chrome --session=default\n\n" +
						"6. On Windows, if attach still fails (background daemon processes may linger):\n" +
						"   playwright-cli kill-all\n" +
						"   playwright-cli close-all\n" +
						"   playwright-cli attach --cdp=chrome --session=default",
				);
				(error as Error & { code: string }).code = "PLAYWRIGHT_CLI_ATTACH_REQUIRED";
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
 * Closes the cached browser connection and clears the cache.
 */
export async function closeBrowser(): Promise<void> {
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
		if (code === "PLAYWRIGHT_CLI_ATTACH_REQUIRED") {
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
