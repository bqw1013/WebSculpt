import { execFile } from "child_process";
import { readFile } from "fs/promises";
import { createRequire } from "module";

import { dirname, resolve } from "path";
import { pathToFileURL } from "url";
import { promisify } from "util";
import type { CommandManifest } from "../../types/index.js";

const execFileAsync = promisify(execFile);
const require = createRequire(import.meta.url);

function buildParams(manifest: CommandManifest, args: Record<string, string>): Record<string, string> {
	const params: Record<string, string> = {};
	for (const param of manifest.parameters || []) {
		const key = param.name;
		if (args[key] !== undefined) {
			params[key] = args[key];
		} else if (param.default !== undefined) {
			params[key] = String(param.default);
		}
	}
	return params;
}

/**
 * Executes a Node.js command module via dynamic ESM import.
 * The import URL includes a cache-busting query so ESM does not reuse a stale module during development.
 */
async function runNodeCommand(commandPath: string, params: Record<string, string>): Promise<unknown> {
	const module = await import(`${pathToFileURL(commandPath).href}?t=${Date.now()}`);
	const handler = module.default || module.command || module;

	if (typeof handler !== "function") {
		throw new Error(`Command module at ${commandPath} does not export a function`);
	}

	return await handler(params);
}

/**
 * Known business error codes that may be thrown by command.js.
 */
const KNOWN_BUSINESS_CODES = ["AUTH_REQUIRED", "NOT_FOUND", "EMPTY_RESULT", "MISSING_PARAM", "DRIFT_DETECTED"];

interface PackageJsonWithBin {
	bin?: string | Record<string, string>;
}

/**
 * Extract a business error code from diagnostic text.
 * In the new CDP execution model Error.code is preserved natively,
 * but this helper remains useful as a fallback for nested errors.
 */
function extractBusinessErrorCode(text: string): string | undefined {
	for (const code of KNOWN_BUSINESS_CODES) {
		if (text.includes(code)) {
			return code;
		}
	}
	return undefined;
}

/**
 * Check if diagnostic text indicates a CDP attach failure.
 */
function isCdpAttachError(text: string): boolean {
	const patterns = [
		/attach failed/i,
		/No browser session/i,
		/browser session/i,
		/remote debugging/i,
		/Session.*closed/i,
		/Session.*not found/i,
		/not open/i,
	];
	return patterns.some((p) => p.test(text));
}

/**
 * Resolve the playwright-cli entrypoint.
 * playwright-cli is expected to be installed as a global tool (peer dependency).
 */
async function resolvePlaywrightCliEntrypoint(): Promise<string> {
	let packageJsonPath: string;
	try {
		packageJsonPath = require.resolve("@playwright/cli/package.json");
	} catch {
		const error = new Error('playwright-cli not found in project dependencies. Run "npm install".');
		(error as Error & { code: string }).code = "RUNTIME_NOT_FOUND";
		throw error;
	}

	const packageJsonText = await readFile(packageJsonPath, "utf-8");
	const packageJson = JSON.parse(packageJsonText) as PackageJsonWithBin;
	const binField = packageJson.bin;
	const binRelativePath = typeof binField === "string" ? binField : binField?.["playwright-cli"];

	if (!binRelativePath) {
		const error = new Error("Could not resolve the playwright-cli entrypoint.");
		(error as Error & { code: string }).code = "RUNTIME_NOT_FOUND";
		throw error;
	}

	return resolve(dirname(packageJsonPath), binRelativePath);
}

/**
 * Minimal type stubs for the playwright-core APIs we use.
 * We avoid adding playwright-core as a direct dependency; instead the module
 * is resolved from @playwright/cli's bundled copy at runtime so the versions
 * always stay in sync.
 */
interface PlaywrightCorePage {
	close(): Promise<void>;
}

interface PlaywrightCoreContext {
	newPage(): Promise<PlaywrightCorePage>;
}

interface PlaywrightCoreBrowser {
	contexts(): PlaywrightCoreContext[];
	close(): Promise<void>;
}

interface PlaywrightCoreModule {
	chromium: {
		connectOverCDP(endpointURL: string, options?: unknown): Promise<PlaywrightCoreBrowser>;
	};
}

/**
 * Resolve playwright-core from the @playwright/cli bundle.
 * We deliberately resolve it from the peer's node_modules rather than declaring
 * our own dependency, because the CDP protocol and Playwright internals must
 * match exactly what the daemon expects.
 */
async function resolvePlaywrightCore(): Promise<PlaywrightCoreModule> {
	let modulePath: string;
	try {
		const cliPackageJsonPath = require.resolve("@playwright/cli/package.json");
		modulePath = resolve(dirname(cliPackageJsonPath), "node_modules", "playwright-core");
		// Verify the bundled copy exists
		require.resolve(resolve(modulePath, "package.json"));
	} catch {
		const error = new Error('playwright-core not found inside @playwright/cli. Run "npm install".');
		(error as Error & { code: string }).code = "RUNTIME_NOT_FOUND";
		throw error;
	}

	return (await import(pathToFileURL(resolve(modulePath, "index.mjs")).href)) as PlaywrightCoreModule;
}

/**
 * Check whether a playwright-cli session named "default" is open.
 * The daemon writes session state to local files; "list" is the stable
 * CLI interface for reading that state without hard-coding platform paths.
 */
async function checkPlaywrightCliSession(): Promise<boolean> {
	try {
		const playwrightCliEntrypoint = await resolvePlaywrightCliEntrypoint();
		const { stdout } = await execFileAsync(process.execPath, [playwrightCliEntrypoint, "list"], {
			timeout: 10000,
		});
		return stdout.includes("default") && stdout.includes("status: open");
	} catch {
		return false;
	}
}

/**
 * Auto-attach a playwright-cli session via the CLI.
 * When Chrome remote debugging is enabled, the daemon can discover the
 * DevToolsActivePort file and connect automatically. If it is not enabled,
 * the attach command hangs until timeout; we keep the timeout short (10s)
 * so the user gets a clear error message quickly.
 */
async function autoAttachPlaywrightCli(): Promise<boolean> {
	try {
		const playwrightCliEntrypoint = await resolvePlaywrightCliEntrypoint();
		await execFileAsync(process.execPath, [playwrightCliEntrypoint, "attach", "--cdp=chrome", "--session=default"], {
			timeout: 10000,
		});
		return true;
	} catch {
		return false;
	}
}

/**
 * Executes a browser-automation command by connecting directly to Chrome over CDP.
 *
 * Previous implementation spawned "playwright-cli run-code" which executed the
 * command inside a VM sandbox. The new flow:
 *   1. Ensure the daemon has an open "default" session (auto-attach if needed).
 *   2. Create an independent Playwright client connection via connectOverCDP.
 *   3. Create an isolated page inside the existing persistent context so cookies
 *      and login state are shared with the user's browser.
 *   4. Import command.js as a normal ESM module and invoke handler(page, params).
 *   5. Close only the page and client connection; the real Chrome stays open.
 */
async function runPlaywrightCliCommand(commandPath: string, params: Record<string, string>): Promise<unknown> {
	const sessionOpen = await checkPlaywrightCliSession();
	if (!sessionOpen) {
		const attached = await autoAttachPlaywrightCli();
		if (!attached) {
			const error = new Error(
				"Browser remote debugging is not enabled or no playwright-cli attach has been performed. " +
					"Enable remote debugging and run 'playwright-cli attach --cdp=chrome --session=default'.",
			);
			(error as Error & { code: string }).code = "PLAYWRIGHT_CLI_ATTACH_REQUIRED";
			throw error;
		}
	}

	let browser: PlaywrightCoreBrowser | undefined;
	let page: PlaywrightCorePage | undefined;
	try {
		const playwright = await resolvePlaywrightCore();
		// "chrome" is a special endpoint URL: Playwright reads Chrome's
		// DevToolsActivePort file and connects over the exposed WebSocket.
		browser = await playwright.chromium.connectOverCDP("chrome");
		// Use the existing persistent context so the new page inherits cookies
		// and storage from the user's logged-in session.
		const context = browser.contexts()[0];
		if (!context) {
			throw new Error("No browser context available after CDP connection.");
		}
		page = await context.newPage();

		const module = await import(`${pathToFileURL(commandPath).href}?t=${Date.now()}`);
		const handler = module.default || module.command || module;

		if (typeof handler !== "function") {
			throw new Error(`Command module at ${commandPath} does not export a function`);
		}

		return await handler(page, params);
	} catch (err) {
		const execErr = err as Error & {
			code?: string | number | null;
			killed?: boolean;
			signal?: string | null;
			stderr?: string;
			stdout?: string;
		};

		// Re-throw errors that already carry a structured code
		if (execErr.code && typeof execErr.code === "string" && execErr.code !== "COMMAND_EXECUTION_ERROR") {
			throw execErr;
		}

		// Infrastructure: local playwright-cli or playwright-core not found
		if (execErr.code === "ENOENT") {
			const error = new Error('playwright-cli not found. Run "npm install -g @playwright/cli".');
			(error as Error & { code: string }).code = "RUNTIME_NOT_FOUND";
			throw error;
		}

		// Infrastructure: command timed out (page operation timeout)
		if (execErr.message && /timeout/i.test(execErr.message)) {
			const error = new Error("Command execution timed out after 60 seconds.");
			(error as Error & { code: string }).code = "TIMEOUT";
			throw error;
		}

		// Infrastructure: CDP session not attached
		const diagnosticText = `${execErr.stderr ?? ""}\n${execErr.stdout ?? ""}\n${execErr.message}`;
		if (isCdpAttachError(diagnosticText)) {
			const error = new Error(
				"Browser remote debugging is not enabled or no playwright-cli attach has been performed. " +
					"Enable remote debugging and run 'playwright-cli attach --cdp=chrome --session=default'.",
			);
			(error as Error & { code: string }).code = "PLAYWRIGHT_CLI_ATTACH_REQUIRED";
			throw error;
		}

		// Business errors: extract known codes from error message
		const businessCode = extractBusinessErrorCode(diagnosticText);
		if (businessCode) {
			const error = new Error(execErr.message);
			(error as Error & { code: string }).code = businessCode;
			throw error;
		}

		// Fallback: generic command execution error
		const fallbackError = new Error(execErr.message);
		(fallbackError as Error & { code: string }).code = "COMMAND_EXECUTION_ERROR";
		throw fallbackError;
	} finally {
		if (page) {
			await page.close().catch(() => {});
		}
		if (browser) {
			// Closing a CDP-connected Browser only disconnects the WebSocket client;
			// it does NOT terminate the actual Chrome process.
			await browser.close().catch(() => {});
		}
	}
}

/**
 * Dispatches command execution based on the manifest runtime.
 * New runtimes can be supported by adding cases here without touching the rest of the system.
 */
export async function runCommand(
	manifest: CommandManifest,
	commandPath: string,
	args: Record<string, string>,
): Promise<unknown> {
	const runtime = manifest.runtime || "node";
	const params = buildParams(manifest, args);

	switch (runtime) {
		case "node":
			return await runNodeCommand(commandPath, params);
		case "playwright-cli":
			return await runPlaywrightCliCommand(commandPath, params);
		// Future runtimes can be plugged in below:
		// case "shell": return await runShellCommand(commandPath, params);
		// case "python": return await runPythonCommand(commandPath, params);
		default:
			throw new Error(`Unsupported runtime "${runtime}" for command ${manifest.id}`);
	}
}
