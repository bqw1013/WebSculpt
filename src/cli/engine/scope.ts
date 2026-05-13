import { existsSync, readFileSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { Scope, ScopeConfig } from "../types/scope.js";
import { listAllCommands } from "./registry.js";

const SCOPE_FILE_NAME = "scope.json";
const SCOPE_DIR_NAME = ".websculpt";

/**
 * Walks upward from `cwd` to locate the nearest `.websculpt/scope.json`.
 * Returns the absolute path if found, or `null` if no scope exists in the path.
 */
export function findScope(cwd: string): string | null {
	let current = cwd;
	while (true) {
		const scopePath = join(current, SCOPE_DIR_NAME, SCOPE_FILE_NAME);
		if (existsSync(scopePath)) {
			return scopePath;
		}
		const parent = dirname(current);
		if (parent === current) {
			break;
		}
		current = parent;
	}
	return null;
}

/**
 * Parses and validates a `scope.json` file.
 * Returns the resolved scope or throws if the file is malformed.
 */
export async function readScope(scopePath: string): Promise<Scope> {
	const raw = await readFile(scopePath, "utf8");
	const parsed = JSON.parse(raw) as unknown;
	if (!isScopeConfig(parsed)) {
		throw new Error(`Invalid scope config at ${scopePath}`);
	}
	return { path: scopePath, config: parsed };
}

/**
 * Serializes a scope config to disk.
 */
export async function writeScope(scopePath: string, scope: ScopeConfig): Promise<void> {
	await mkdir(dirname(scopePath), { recursive: true });
	await writeFile(scopePath, `${JSON.stringify(scope, null, 2)}\n`, "utf8");
}

/**
 * Resolves the nearest active scope from `cwd` and filters the cached command
 * registry against its whitelist. Missing or stale entries are omitted.
 */
export function listScopedCommands(cwd: string): ReturnType<typeof listAllCommands> {
	const scopePath = findScope(cwd);
	if (!scopePath) {
		return listAllCommands();
	}
	// Synchronously read the scope file; callers may be synchronous.
	const raw = readFileSync(scopePath, "utf8");
	const parsed = JSON.parse(raw) as unknown;
	if (!isScopeConfig(parsed)) {
		return listAllCommands();
	}
	const whitelist = new Set(parsed.commands);
	const all = listAllCommands();
	return all.filter((c) => whitelist.has(`${c.manifest.domain}/${c.manifest.action}`));
}

function isScopeConfig(value: unknown): value is ScopeConfig {
	return (
		typeof value === "object" &&
		value !== null &&
		"commands" in value &&
		Array.isArray((value as ScopeConfig).commands) &&
		(value as ScopeConfig).commands.every((c) => typeof c === "string")
	);
}
