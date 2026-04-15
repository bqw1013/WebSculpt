import { pathToFileURL } from "url";
import type { CommandManifest } from "../../types/index.js";

/**
 * Loads and executes a command module with the provided arguments.
 * The import URL includes a cache-busting query so ESM does not reuse a stale module during development.
 */
export async function runCommand(
	manifest: CommandManifest,
	commandPath: string,
	args: Record<string, string>,
): Promise<any> {
	const module = await import(`${pathToFileURL(commandPath).href}?t=${Date.now()}`);
	const handler = module.default || module.command || module;

	if (typeof handler !== "function") {
		throw new Error(`Command ${manifest.id} does not export a function`);
	}

	const params: Record<string, string> = {};
	for (const key of manifest.parameters || []) {
		if (args[key] !== undefined) {
			params[key] = args[key];
		}
	}

	const result = await handler(params);
	return result;
}
