import type { Command } from "commander";
import { findScope, readScope, writeScope } from "../../engine/scope.js";
import type { MetaCommandResult } from "../../output.js";
import { renderOutput } from "../../output.js";

/** Handles the `scope remove <identifier>` command. */
export async function handleScopeRemove(cwd: string, identifier: string): Promise<MetaCommandResult> {
	const scopePath = findScope(cwd);
	if (!scopePath) {
		return {
			success: false,
			error: {
				code: "NO_SCOPE_FOUND",
				message: "No scope found in the current directory or its ancestors.",
			},
		};
	}
	const scope = await readScope(scopePath);
	const beforeCount = scope.config.commands.length;

	if (identifier.includes("/")) {
		scope.config.commands = scope.config.commands.filter((c) => c !== identifier);
	} else {
		const domain = identifier;
		scope.config.commands = scope.config.commands.filter((c) => !c.startsWith(`${domain}/`));
	}

	await writeScope(scopePath, scope.config);
	const removed = beforeCount - scope.config.commands.length;

	return {
		success: true,
		message: `Removed ${removed} command(s) from scope.`,
	};
}

/** Registers the `scope remove` sub-command. */
export function registerScopeRemove(group: Command, format: () => "human" | "json"): void {
	group
		.command("remove <identifier>")
		.description("Remove a command or domain from the current scope")
		.action(async (identifier: string) => {
			renderOutput(await handleScopeRemove(process.cwd(), identifier), format());
		});
}
