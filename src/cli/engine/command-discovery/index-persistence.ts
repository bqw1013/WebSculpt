import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { INDEX_PATH } from "../../../infra/paths.js";
import type { RegistryIndex } from "./contract.js";
import { scanAllCommands } from "./scanner.js";

/** Reads the app version from package.json. */
export async function getAppVersion(): Promise<string> {
	const __filename = fileURLToPath(import.meta.url);
	const projectRoot = dirname(dirname(dirname(dirname(dirname(__filename)))));
	const pkgRaw = await readFile(join(projectRoot, "package.json"), "utf-8");
	const pkg = JSON.parse(pkgRaw) as { version: string };
	return pkg.version;
}

/** Reads and validates the index file, returning null on any error. */
export async function readIndex(): Promise<RegistryIndex | null> {
	try {
		const raw = await readFile(INDEX_PATH, "utf-8");
		const parsed = JSON.parse(raw) as unknown;
		if (
			typeof parsed === "object" &&
			parsed !== null &&
			"formatVersion" in parsed &&
			"appVersion" in parsed &&
			"generatedAt" in parsed &&
			"commands" in parsed &&
			Array.isArray((parsed as RegistryIndex).commands)
		) {
			return parsed as RegistryIndex;
		}
		return null;
	} catch {
		return null;
	}
}

/** Scans all commands, serializes to RegistryIndex, and writes to INDEX_PATH. */
export async function rebuildIndex(): Promise<void> {
	const commands = await scanAllCommands();
	const appVersion = await getAppVersion();
	const index: RegistryIndex = {
		formatVersion: 1,
		appVersion,
		generatedAt: new Date().toISOString(),
		commands: commands.map((c) => ({
			manifest: c.manifest,
			source: c.source,
			runtime: c.runtime,
		})),
	};
	await writeFile(INDEX_PATH, JSON.stringify(index, null, 2), "utf-8");
}
