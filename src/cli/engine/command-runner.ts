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
 * The actual module is resolved from @playwright/cli's node_modules at runtime.
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
 * Resolve playwright-core from the @playwright/cli bundle to ensure
 * version consistency.
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
 * Returns true if attach succeeded, false otherwise.
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
 * The command module is imported as a normal ESM module and invoked with (page, params).
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
		browser = await playwright.chromium.connectOverCDP("chrome");
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
