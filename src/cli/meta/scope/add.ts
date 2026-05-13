import type { Command } from "commander";
import { listAllCommands } from "../../engine/registry.js";
import { findScope, readScope, writeScope } from "../../engine/scope.js";
import type { MetaCommandResult } from "../../output.js";
import { renderOutput } from "../../output.js";

/** Handles the `scope add <identifier>` command. */
export async function handleScopeAdd(cwd: string, identifier: string): Promise<MetaCommandResult> {
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
	const commandsToAdd: string[] = [];

	if (identifier.includes("/")) {
		commandsToAdd.push(identifier);
	} else {
		const domain = identifier;
		const allCommands = listAllCommands();
		for (const c of allCommands) {
			if (c.manifest.domain === domain) {
				commandsToAdd.push(`${c.manifest.domain}/${c.manifest.action}`);
			}
		}
	}

	const existing = new Set(scope.config.commands);
	let added = 0;
	for (const cmd of commandsToAdd) {
		if (!existing.has(cmd)) {
			existing.add(cmd);
			added++;
		}
	}

	scope.config.commands = [...existing];
	await writeScope(scopePath, scope.config);

	return {
		success: true,
		message: `Added ${added} command(s) to scope.`,
	};
}

/** Registers the `scope add` sub-command. */
export function registerScopeAdd(group: Command, format: () => "human" | "json"): void {
	group
		.command("add <identifier>")
		.description("Add a command or domain to the current scope")
		.action(async (identifier: string) => {
			renderOutput(await handleScopeAdd(process.cwd(), identifier), format());
		});
}
