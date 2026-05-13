import type { Command } from "commander";
import { listAllCommands } from "../../engine/registry.js";
import { findScope, readScope } from "../../engine/scope.js";
import type { MetaCommandResult, ScopeShowResult } from "../../output.js";
import { renderOutput } from "../../output.js";

/** Handles the `scope show` command. */
export async function handleScopeShow(cwd: string): Promise<MetaCommandResult> {
	const scopePath = findScope(cwd);
	if (!scopePath) {
		return {
			success: true,
			message: "No scope configured in this directory. All commands are visible.",
		};
	}
	const scope = await readScope(scopePath);
	const allCommands = listAllCommands();
	const available = new Set(allCommands.map((c) => `${c.manifest.domain}/${c.manifest.action}`));

	const result: ScopeShowResult = {
		success: true,
		scopeCommands: scope.config.commands.map((cmd) => ({
			command: cmd,
			valid: available.has(cmd),
		})),
	};
	return result;
}

/** Registers the `scope show` sub-command. */
export function registerScopeShow(group: Command, format: () => "human" | "json"): void {
	group
		.command("show")
		.description("Display the current scope configuration")
		.action(async () => {
			renderOutput(await handleScopeShow(process.cwd()), format());
		});
}
