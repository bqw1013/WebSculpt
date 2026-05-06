import { existsSync } from "node:fs";
import { getAppVersion, readIndex, rebuildIndex } from "./command-discovery/index-persistence.js";
import { scanAllCommands, scanCommands } from "./command-discovery/scanner.js";
import { type ResolvedCommand, toResolvedCommand } from "./contract.js";
import { getBuiltinCommandsDir } from "./paths.js";

let cachedCommands: ResolvedCommand[] | null = null;

/**
 * Loads the registry from the index (or rebuilds if missing/corrupted/stale)
 * and populates the in-memory cache.
 */
export async function loadRegistry(): Promise<void> {
	const appVersion = await getAppVersion();
	const index = await readIndex();
	if (index && index.appVersion === appVersion) {
		const builtinDir = getBuiltinCommandsDir();
		const builtinScanned = await scanCommands(builtinDir, "builtin");
		const builtinInIndex = index.commands.filter((c) => c.source === "builtin");
		const toKey = (c: { manifest: { domain: string; action: string } }) =>
			`${c.manifest.domain}/${c.manifest.action}`;
		const scannedKeys = new Set(builtinScanned.map(toKey));
		const indexKeys = new Set(builtinInIndex.map(toKey));
		const builtinChanged =
			scannedKeys.size !== indexKeys.size ||
			[...scannedKeys].some((k) => !indexKeys.has(k)) ||
			builtinScanned.some((s) => {
				const indexed = builtinInIndex.find(
					(i) => i.manifest.domain === s.manifest.domain && i.manifest.action === s.manifest.action,
				);
				return !indexed || indexed.manifest.requiresBrowser !== s.manifest.requiresBrowser;
			});
		if (!builtinChanged) {
			cachedCommands = index.commands.map(toResolvedCommand);
			return;
		}
		const commands = await scanAllCommands();
		cachedCommands = commands;
		await rebuildIndex();
	} else {
		const commands = await scanAllCommands();
		cachedCommands = commands;
		await rebuildIndex();
	}
}

/** Clears the in-memory registry cache. */
export function clearRegistryCache(): void {
	cachedCommands = null;
}

/** Returns all available commands from the in-memory cache. */
export function listAllCommands(): ResolvedCommand[] {
	if (!cachedCommands) {
		throw new Error("Registry not loaded. Call loadRegistry() first.");
	}
	const stale: ResolvedCommand[] = [];
	const valid = cachedCommands.filter((c) => {
		if (existsSync(c.commandPath)) return true;
		stale.push(c);
		return false;
	});
	if (stale.length > 0) {
		cachedCommands = valid;
		rebuildIndex().catch(() => {});
	}
	return [...valid];
}

/**
 * Finds a single command by domain and action from the in-memory cache.
 * User commands take precedence over built-ins.
 * Stale entries missing on disk are evicted lazily.
 */
export function findCommand(domain: string, action: string): ResolvedCommand | null {
	if (!cachedCommands) {
		throw new Error("Registry not loaded. Call loadRegistry() first.");
	}
	const candidates = [
		cachedCommands.find((c) => c.manifest.domain === domain && c.manifest.action === action && c.source === "user"),
		cachedCommands.find(
			(c) => c.manifest.domain === domain && c.manifest.action === action && c.source === "builtin",
		),
	];
	for (const candidate of candidates) {
		if (!candidate) continue;
		if (existsSync(candidate.commandPath)) return candidate;
		cachedCommands = cachedCommands.filter((c) => c !== candidate);
		rebuildIndex().catch(() => {});
	}
	return null;
}
