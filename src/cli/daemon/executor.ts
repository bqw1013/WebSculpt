import { pathToFileURL } from "node:url";
import type { Page } from "playwright-core";
import { withBrowser } from "./browser-manager.js";

/**
 * Dynamically imports a command module and executes its default export
 * inside a new page of the browser's default context.
 * This preserves the user's login state, cookies, and storage from the
 * existing Chrome session connected over CDP.
 * ESM module cache is bypassed via a cache-busting query parameter.
 */
export async function executeCommand(commandPath: string, params: Record<string, string>): Promise<unknown> {
	return withBrowser(async (browser) => {
		// Reuse the default browser context so the new page inherits
		// cookies, localStorage, and login state from the existing Chrome session.
		const context = browser.contexts()[0];
		if (!context) {
			throw new Error("Browser has no default context available");
		}
		let page: Page | undefined;

		try {
			page = await context.newPage();

			const module = await import(`${pathToFileURL(commandPath).href}?t=${Date.now()}`);
			const handler = module.default;

			if (typeof handler !== "function") {
				throw new Error(`Command module at ${commandPath} does not export a default function`);
			}

			return await handler(page, params);
		} finally {
			// Close only the isolated page; leave the shared context open.
			await page?.close().catch(() => {});
		}
	});
}
