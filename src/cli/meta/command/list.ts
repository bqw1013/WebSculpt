import type { Command } from "commander";
import { listAllCommands } from "../../engine/registry.js";
import { listScopedCommands } from "../../engine/scope.js";
import type { MetaCommandResult } from "../../output.js";
import { renderOutput } from "../../output.js";

/** Lists registered commands and returns them as a normalized result.
 *  When `all` is false and cwd is inside an active scope, only whitelisted commands are returned.
 *  When `domain` is given, only commands whose domain exactly matches are returned (applied after scope selection). */
export function handleCommandList(all = false, cwd = process.cwd(), domain?: string): MetaCommandResult {
	const commands = all ? listAllCommands() : listScopedCommands(cwd);
	const filtered = domain === undefined ? commands : commands.filter((c) => c.manifest.domain === domain);
	return {
		success: true,
		commands: filtered.map((c) => ({
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

/** Registers the `list` sub-command on the given command group. */
export function registerList(group: Command, format: () => "human" | "json"): void {
	group
		.command("list [domain]")
		.description("List extension commands (scoped by default)")
		.option("--all", "Show all commands, bypassing scope filtering")
		.action(async (domain: string | undefined, options: { all?: boolean }) => {
			renderOutput(handleCommandList(options.all ?? false, process.cwd(), domain), format());
		});
}
