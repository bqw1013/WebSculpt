import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Command } from "commander";
import { writeScope } from "../../engine/scope.js";
import type { MetaCommandResult } from "../../output.js";
import { renderOutput } from "../../output.js";

/** Handles the `scope init` command. */
export async function handleScopeInit(cwd: string): Promise<MetaCommandResult> {
	const scopePath = join(cwd, ".websculpt", "scope.json");
	if (existsSync(scopePath)) {
		return {
			success: false,
			error: {
				code: "SCOPE_ALREADY_EXISTS",
				message: "A scope already exists in this directory.",
			},
		};
	}
	await writeScope(scopePath, { commands: [] });
	return {
		success: true,
		message: `Scope initialized at ${scopePath}`,
	};
}

/** Registers the `scope init` sub-command. */
export function registerScopeInit(group: Command, format: () => "human" | "json"): void {
	group
		.command("init")
		.description("Initialize a scope in the current directory")
		.action(async () => {
			renderOutput(await handleScopeInit(process.cwd()), format());
		});
}
