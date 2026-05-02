import { pathToFileURL } from "node:url";
import type { CommandManifest } from "../../types/index.js";
import { ensureDaemonClient } from "./daemon-client.js";

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
 * Executes a playwright-cli runtime command via the websculpt-daemon.
 */
async function runPlaywrightDaemonCommand(commandPath: string, params: Record<string, string>): Promise<unknown> {
	try {
		const client = await ensureDaemonClient();
		return await client.run(commandPath, params);
	} catch (err) {
		const execErr = err as Error & { code?: string };
		const code = execErr.code;
		const message = execErr.message ?? "";

		// Infrastructure: daemon failed to start
		if (code === "DAEMON_START_FAILED") {
			throw err;
		}

		// Infrastructure: daemon is unreachable
		if (code === "DAEMON_UNREACHABLE") {
			throw err;
		}

		// Infrastructure: CDP session not attached (detailed message comes from the daemon)
		if (code === "PLAYWRIGHT_CLI_ATTACH_REQUIRED") {
			throw err;
		}

		// Infrastructure: socket request timed out (60s)
		if (message.includes("Socket request timed out") || message.includes("timeout")) {
			const error = new Error("Command execution timed out after 60 seconds.");
			(error as Error & { code: string }).code = "TIMEOUT";
			throw error;
		}

		// Business errors: preserve codes thrown by command code
		const businessCode = extractBusinessErrorCode(message);
		if (businessCode) {
			const error = new Error(message);
			(error as Error & { code: string }).code = businessCode;
			throw error;
		}

		// If the error already carries a structured code, preserve it.
		if (code && typeof code === "string") {
			throw err;
		}

		// Fallback: generic command execution error
		const fallbackError = new Error(message);
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
			return await runPlaywrightDaemonCommand(commandPath, params);
		// Future runtimes can be plugged in below:
		// case "shell": return await runShellCommand(commandPath, params);
		// case "python": return await runPythonCommand(commandPath, params);
		default:
			throw new Error(`Unsupported runtime "${runtime}" for command ${manifest.id}`);
	}
}
