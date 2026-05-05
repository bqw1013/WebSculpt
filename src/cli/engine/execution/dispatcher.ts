import { pathToFileURL } from "node:url";
import type { CommandManifest } from "../../../types/index.js";
import { normalizeRuntime } from "../../runtime/index.js";
import { ensureDaemonClient } from "../daemon/index.js";

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
 * Infrastructure error codes that should be surfaced to the user as-is.
 */
const INFRASTRUCTURE_CODES = new Set(["DAEMON_START_FAILED", "DAEMON_UNREACHABLE", "PLAYWRIGHT_CLI_ATTACH_REQUIRED"]);

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

		// Infrastructure errors are surfaced as-is.
		if (code && INFRASTRUCTURE_CODES.has(code)) {
			throw err;
		}

		// Socket timeout is mapped to a user-facing TIMEOUT code.
		if (code === "SOCKET_TIMEOUT") {
			const error = new Error("Command execution timed out after 60 seconds.");
			(error as Error & { code: string }).code = "TIMEOUT";
			throw error;
		}

		// If the error carries a structured code, preserve it directly.
		if (code && typeof code === "string") {
			throw err;
		}

		// Fallback: generic command execution error.
		const fallbackError = new Error(execErr.message ?? "");
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
	const runtime = normalizeRuntime(manifest.runtime);
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
