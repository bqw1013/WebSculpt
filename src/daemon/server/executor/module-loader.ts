import { statSync } from "node:fs";
import { pathToFileURL } from "node:url";

interface CachedModule {
	mtime: number;
	module: unknown;
}

const moduleCache = new Map<string, CachedModule>();

/**
 * Loads a command module via dynamic import, caching the result by file
 * modification time. Unchanged files reuse the existing module record,
 * eliminating Node.js ESM loader cache leakage. Modified files trigger
 * a reload.
 */
export async function loadCommandModule(commandPath: string): Promise<unknown> {
	const mtime = statSync(commandPath).mtimeMs;
	const cached = moduleCache.get(commandPath);

	if (cached && cached.mtime === mtime) {
		return cached.module;
	}

	const module = await import(`${pathToFileURL(commandPath).href}?t=${mtime}`);
	moduleCache.set(commandPath, { mtime, module });
	return module;
}

/**
 * Clears the command module cache. Primarily used for test hygiene.
 */
export function clearCommandModuleCache(): void {
	moduleCache.clear();
}
