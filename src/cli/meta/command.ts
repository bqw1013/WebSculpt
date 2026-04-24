import { readdir, rm, rmdir } from "fs/promises";
import { dirname } from "path";
import { findCommand, listAllCommands, rebuildIndex } from "../engine/registry.js";
import type { MetaCommandResult } from "../output.js";

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
		})),
	};
}

/** Displays details for a specific command. (Not implemented) */
export async function handleCommandShow(_domain: string, _action: string): Promise<MetaCommandResult> {
	return {
		success: false,
		error: {
			code: "NOT_IMPLEMENTED",
			message: "Command details are not implemented yet.",
		},
	};
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
