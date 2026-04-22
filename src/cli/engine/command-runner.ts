import { execFile } from "child_process";
import { mkdtemp, readFile, rm, writeFile } from "fs/promises";
import { createRequire } from "module";
import { tmpdir } from "os";
import { dirname, join, resolve } from "path";
import { pathToFileURL } from "url";
import { promisify } from "util";
import type { CommandManifest } from "../../types/index.js";

const execFileAsync = promisify(execFile);
const require = createRequire(import.meta.url);

function buildParams(manifest: CommandManifest, args: Record<string, string>): Record<string, string> {
	const params: Record<string, string> = {};
	for (const param of manifest.parameters || []) {
		const key = typeof param === "string" ? param : param.name;
		if (args[key] !== undefined) {
			params[key] = args[key];
		} else if (typeof param === "object" && param.default !== undefined) {
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
 * A temporary wrapper file is created because playwright-cli's run-code
 * execution context does not expose Node.js globals such as `process.env`.
 * Params are injected by replacing the `PARAMS_INJECT` placeholder
 * inside the command file with a `const params = {...};` declaration.
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

	const tmpDir = await mkdtemp(join(tmpdir(), "websculpt-"));
	const tmpFile = join(tmpDir, "command.js");
	await writeFile(tmpFile, wrappedCode, "utf-8");

	try {
		const playwrightCliEntrypoint = await resolvePlaywrightCliEntrypoint();
		const { stdout } = await execFileAsync(
			process.execPath,
			[playwrightCliEntrypoint, "run-code", "--filename", tmpFile],
			{
				timeout: 60000,
			},
		);

		// playwright-cli surfaces command-level errors under "### Error" with exit code 0
		const errorMatch = stdout.match(/### Error\nError:\s*([\s\S]*?)(?=\n### |$)/);
		if (errorMatch) {
			const errorMessage = errorMatch[1].trim();
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

		const rawJson = resultMatch[1].trim();
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
				"Browser remote debugging is not enabled or no playwright-cli attach has been performed. " +
					"Enable remote debugging and run 'playwright-cli attach --cdp=chrome'.",
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
	} finally {
		await rm(tmpDir, { recursive: true }).catch(() => {});
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
