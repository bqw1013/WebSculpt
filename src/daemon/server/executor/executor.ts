import type { Page } from "playwright-core";
import { acquirePage, releasePage, withBrowser } from "./browser-manager.js";
import { loadCommandModule } from "./module-loader.js";

const COMMAND_TIMEOUT_MS = process.env.WEBSCULPT_TEST_COMMAND_TIMEOUT_MS
	? Number(process.env.WEBSCULPT_TEST_COMMAND_TIMEOUT_MS)
	: 20 * 60 * 1000; // 20 minutes

function createTimeoutError(): Error & { code: string } {
	const timeoutErr = new Error("Command execution timed out") as Error & { code: string };
	timeoutErr.code = "COMMAND_TIMEOUT";
	return timeoutErr;
}

/**
 * Dynamically imports a command module and executes its default export
 * inside a pooled browser page. This preserves the user's login state,
 * cookies, and storage from the existing Chrome session connected over CDP.
 * ESM module cache is managed by file modification time: unchanged files
 * reuse the cached module, modified files trigger a reload.
 *
 * A 20-minute safety timeout is enforced: if the handler has not completed
 * within that window, the page is forcibly closed so the session slot is
 * released and the daemon does not leak resources.
 */
export async function executeCommand(
	commandPath: string,
	params: Record<string, string>,
	cwd?: string,
): Promise<unknown> {
	return withBrowser(async () => {
		let page: Page | undefined;
		let timeoutHandle: NodeJS.Timeout | null = null;
		let timedOut = false;

		try {
			page = await acquirePage();

			timeoutHandle = setTimeout(() => {
				timedOut = true;
				page?.close().catch(() => {});
			}, COMMAND_TIMEOUT_MS);

			const module = await loadCommandModule(commandPath);
			if (timedOut) {
				throw createTimeoutError();
			}
			const handler = (module as Record<string, unknown>).default;

			if (typeof handler !== "function") {
				throw new Error(`Command module at ${commandPath} does not export a default function`);
			}

			const result = await handler(page, params, cwd);
			if (timedOut) {
				throw createTimeoutError();
			}
			return result;
		} catch (err) {
			if (timedOut) {
				throw createTimeoutError();
			}
			throw err;
		} finally {
			if (timeoutHandle) {
				clearTimeout(timeoutHandle);
			}
			if (page) {
				await releasePage(page).catch(() => {});
			}
		}
	});
}
