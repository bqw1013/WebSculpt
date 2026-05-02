import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";

import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
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
		/remote debugging/i,
		/Session.*closed/i,
		/Session.*not found/i,
		/browser .* not open/i,
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
 * Spawns playwright-cli to execute a browser-automation command.
 * Params are injected by replacing the `PARAMS_INJECT` placeholder
 * inside the command file with a `const params = {...};` declaration.
 * The wrapped code is passed directly as the run-code positional argument
 * to avoid playwright-cli's sandbox file-access restrictions on temporary files.
 * The JSON result surfaced under "### Result" in stdout is parsed and returned.
 */
async function runPlaywrightCliCommand(commandPath: string, params: Record<string, string>): Promise<unknown> {
	const originalCode = await readFile(commandPath, "utf-8");

	if (!originalCode.includes("/* PARAMS_INJECT */")) {
		const error = new Error(
			"Command code is missing the /* PARAMS_INJECT */ placeholder. " +
				"This placeholder is required for playwright-cli runtime commands.",
		);
		(error as Error & { code: string }).code = "MISSING_PARAMS_INJECT";
		throw error;
	}

	const paramsLine = `const params = ${JSON.stringify(params)};`;
	const wrappedCode = originalCode.replace("/* PARAMS_INJECT */", paramsLine);

	try {
		const playwrightCliEntrypoint = await resolvePlaywrightCliEntrypoint();
		// NOTE: Passing the code directly as a positional argument relies on
		// execFileAsync (array-based args), which bypasses shell interpretation.
		// Windows command-line length limit is ~32,767 chars; current commands
		// are typically well under 5,000 chars, leaving a large safety margin.
		const { stdout } = await execFileAsync(process.execPath, [playwrightCliEntrypoint, "run-code", wrappedCode], {
			timeout: 60000,
		});

		// playwright-cli surfaces command-level errors under "### Error" with exit code 0
		const errorMatch = stdout.match(/### Error\n([\s\S]*?)(?=\n### |$)/);
		if (errorMatch) {
			const errorMessage = (errorMatch[1] ?? "").trim();
			const businessCode = extractBusinessErrorCode(errorMessage);
			const error = new Error(errorMessage);
			(error as Error & { code: string }).code = businessCode ?? "COMMAND_EXECUTION_ERROR";
			throw error;
		}

		// Extract the JSON result that follows "### Result" in stdout
		const resultMatch = stdout.match(/### Result\n([\s\S]*?)(?=\n### |$)/);
		if (!resultMatch) {
			const error = new Error("Command did not produce the expected '### Result' marker in stdout.");
			(error as Error & { code: string }).code = "MISSING_RESULT_MARKER";
			throw error;
		}

		const rawJson = (resultMatch[1] ?? "").trim();
		try {
			return JSON.parse(rawJson);
		} catch (_parseErr) {
			const error = new Error(`Malformed JSON after result marker: ${rawJson}`);
			(error as Error & { code: string }).code = "MALFORMED_RESULT_JSON";
			throw error;
		}
	} catch (err) {
		const execErr = err as Error & {
			code?: string | number | null;
			killed?: boolean;
			signal?: string | null;
			stderr?: string;
			stdout?: string;
		};

		// Already a structured error thrown by this function; re-throw as-is
		if (
			execErr.code &&
			typeof execErr.code === "string" &&
			[
				"RUNTIME_NOT_FOUND",
				"MISSING_PARAMS_INJECT",
				"MISSING_RESULT_MARKER",
				"MALFORMED_RESULT_JSON",
				"COMMAND_EXECUTION_ERROR",
			].includes(execErr.code)
		) {
			throw execErr;
		}

		// Infrastructure: local playwright-cli entrypoint not found
		if (execErr.code === "ENOENT") {
			const error = new Error('playwright-cli not found. Run "npm install -g @playwright/cli".');
			(error as Error & { code: string }).code = "RUNTIME_NOT_FOUND";
			throw error;
		}

		// Infrastructure: command timed out
		if (execErr.killed && execErr.signal === "SIGTERM") {
			const error = new Error("Command execution timed out after 60 seconds.");
			(error as Error & { code: string }).code = "TIMEOUT";
			throw error;
		}

		// Infrastructure: CDP session not attached
		const diagnosticText = `${execErr.stderr ?? ""}\n${execErr.stdout ?? ""}\n${execErr.message}`;
		if (isCdpAttachError(diagnosticText)) {
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

		// Business errors: extract known codes from stderr/message text
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
