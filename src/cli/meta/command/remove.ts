import { readdir, rm, rmdir } from "node:fs/promises";
import { dirname } from "node:path";
import type { Command } from "commander";
import { rebuildIndex } from "../../engine/command-discovery/index-persistence.js";
import { findCommand } from "../../engine/registry.js";
import type { MetaCommandResult } from "../../output.js";
import { renderOutput } from "../../output.js";

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

/** Registers the `remove` sub-command on the given command group. */
export function registerRemove(group: Command, format: () => "human" | "json"): void {
	group
		.command("remove <domain> <action>")
		.description("Remove a user command")
		.action(async (domain: string, action: string) => {
			renderOutput(await handleCommandRemove(domain, action), format());
		});
}
