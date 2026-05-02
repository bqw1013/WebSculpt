import { type Browser, chromium } from "playwright-core";

let cachedBrowser: Browser | null = null;

/**
 * Returns an active Browser connected over Chrome DevTools Protocol.
 * Connections are lazily established and cached for reuse.
 */
export async function getBrowser(): Promise<Browser> {
	if (!cachedBrowser || !cachedBrowser.isConnected()) {
		cachedBrowser = null;
		try {
			cachedBrowser = await chromium.connectOverCDP("chrome");
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
	}
	return cachedBrowser;
}

/**
 * Returns true if a browser connection is currently cached.
 * Does not trigger a new connection.
 */
export function isBrowserConnected(): boolean {
	return cachedBrowser?.isConnected() ?? false;
}

/**
 * Closes the cached browser connection and clears the cache.
 */
export async function closeBrowser(): Promise<void> {
	if (cachedBrowser) {
		await cachedBrowser.close().catch(() => {});
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
