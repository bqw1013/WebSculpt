import { access, readdir, readFile, rm, rmdir } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { findCommand, listAllCommands, rebuildIndex } from "../engine/registry.js";
import { RUNTIME_SYSTEM_PREREQUISITES } from "../engine/runtime-meta.js";
import type { CommandShowResult, MetaCommandResult } from "../output.js";

/** Lists all registered commands and returns them as a normalized result. */
export function handleCommandList(): MetaCommandResult {
	const commands = listAllCommands();
	return {
		success: true,
		commands: commands.map((c) => ({
			domain: c.manifest.domain,
			action: c.manifest.action,
			type: c.source,
			id: c.manifest.id,
			description: c.manifest.description,
			requiresBrowser: c.manifest.requiresBrowser,
			authRequired: c.manifest.authRequired,
		})),
	};
}

/** Displays details for a specific command. */
export async function handleCommandShow(
	domain: string,
	action: string,
	includeReadme = false,
): Promise<MetaCommandResult> {
	const resolved = findCommand(domain, action);
	if (!resolved) {
		return {
			success: false,
			error: {
				code: "NOT_FOUND",
				message: `Command "${domain}/${action}" does not exist.`,
			},
		};
	}

	const dir = dirname(resolved.commandPath);
	const entryFile = basename(resolved.commandPath);

	async function fileExists(name: string): Promise<boolean> {
		try {
			await access(join(dir, name));
			return true;
		} catch {
			return false;
		}
	}

	const assets = {
		manifest: await fileExists("manifest.json"),
		readme: await fileExists("README.md"),
		context: await fileExists("context.md"),
		entryFile: await fileExists(entryFile),
	};

	const systemPrereqs =
		RUNTIME_SYSTEM_PREREQUISITES[resolved.runtime as import("../../types/index.js").CommandRuntime] ?? [];
	const manifestPrereqs = resolved.manifest.prerequisites ?? [];
	const prerequisites = [...systemPrereqs, ...manifestPrereqs];

	const result: CommandShowResult = {
		success: true,
		command: {
			id: resolved.manifest.id,
			domain: resolved.manifest.domain,
			action: resolved.manifest.action,
			description: resolved.manifest.description,
			runtime: resolved.runtime,
			source: resolved.source,
			path: dir,
			entryFile,
			parameters: resolved.manifest.parameters ?? [],
			prerequisites,
			assets,
			requiresBrowser: resolved.manifest.requiresBrowser,
			authRequired: resolved.manifest.authRequired,
		},
	};

	if (includeReadme && assets.readme) {
		try {
			const content = await readFile(join(dir, "README.md"), "utf8");
			result.readmeContent = content;
		} catch {
			// Silently ignore missing README even if asset flag was true (race condition).
		}
	}

	return result;
}

/** Removes a user-defined command and returns a normalized result. */
export async function handleCommandRemove(domain: string, action: string): Promise<MetaCommandResult> {
	try {
		const resolved = findCommand(domain, action);
		if (!resolved) {
			return {
				success: false,
				error: {
					code: "NOT_FOUND",
					message: `Command "${domain}/${action}" does not exist.`,
				},
			};
		}

		if (resolved.source === "builtin") {
			return {
				success: false,
				error: {
					code: "CANNOT_REMOVE_BUILTIN",
					message: `Built-in command "${domain}/${action}" cannot be removed.`,
				},
			};
		}

		const actionDir = dirname(resolved.commandPath);
		const domainDir = dirname(actionDir);

		await rm(actionDir, { recursive: true, force: true });

		// Best-effort cleanup of empty parent domain directory.
		try {
			const remaining = await readdir(domainDir);
			if (remaining.length === 0) {
				await rmdir(domainDir);
			}
		} catch {
			// Swallow cleanup errors; the command itself was successfully removed.
		}

		await rebuildIndex();

		return {
			success: true,
			command: `${domain}/${action}`,
		};
	} catch (err: unknown) {
		const message = err instanceof Error ? err.message : String(err);
		return {
			success: false,
			error: { code: "REMOVE_ERROR", message },
		};
	}
}
