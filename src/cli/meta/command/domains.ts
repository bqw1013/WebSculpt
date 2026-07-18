import type { Command } from "commander";
import { listAllCommands } from "../../engine/registry.js";
import { listScopedCommands } from "../../engine/scope.js";
import type { MetaCommandResult } from "../../output.js";
import { renderOutput } from "../../output.js";

/** Lists the unique domains of the currently visible commands, deduplicated and sorted alphabetically.
 *  When `all` is false and cwd is inside an active scope, only whitelisted commands are considered. */
export function handleCommandDomains(all = false, cwd = process.cwd()): MetaCommandResult {
	const commands = all ? listAllCommands() : listScopedCommands(cwd);
	const domains = [...new Set(commands.map((c) => c.manifest.domain))].sort();
	return { success: true, domains };
}

/** Registers the `domains` sub-command on the given command group. */
export function registerDomains(group: Command, format: () => "human" | "json"): void {
	group
		.command("domains")
		.description("List available command domains (scoped by default)")
		.option("--all", "Show all domains, bypassing scope filtering")
		.action(async (options: { all?: boolean }) => {
			renderOutput(handleCommandDomains(options.all ?? false), format());
		});
}
