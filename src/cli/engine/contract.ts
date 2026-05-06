import { join } from "node:path";
import { USER_COMMANDS_DIR } from "../../infra/paths.js";
import type { CommandManifest } from "../../types/index.js";
import { resolveEntryFile } from "../runtime/index.js";
import { getBuiltinCommandsDir } from "./paths.js";

/** Domains reserved for meta commands; user-defined commands in these domains are ignored. */
export const RESERVED_DOMAINS = new Set(["command", "config", "skill", "daemon"]);

/** A command that has been resolved to an on-disk module and its origin. */
export interface ResolvedCommand {
	manifest: CommandManifest;
	/** Absolute path to the command entry file (e.g. command.js). */
	commandPath: string;
	source: "user" | "builtin";
	/** Execution runtime derived from the manifest. */
	runtime: string;
}

/** Shape of the persistent registry index file. */
export interface RegistryIndex {
	formatVersion: number;
	appVersion: string;
	generatedAt: string;
	commands: Array<{
		manifest: CommandManifest;
		source: "user" | "builtin";
		runtime: string;
	}>;
}

/** Derives a ResolvedCommand from an index entry by computing commandPath at runtime. */
export function toResolvedCommand(entry: {
	manifest: CommandManifest;
	source: "user" | "builtin";
	runtime: string;
}): ResolvedCommand {
	const baseDir = entry.source === "user" ? USER_COMMANDS_DIR : getBuiltinCommandsDir();
	const actionPath = join(baseDir, entry.manifest.domain, entry.manifest.action);
	const entryFile = resolveEntryFile(entry.runtime);
	const commandPath = join(actionPath, entryFile);
	return {
		manifest: entry.manifest,
		commandPath,
		source: entry.source,
		runtime: entry.runtime,
	};
}
