import type { Command } from "commander";
import { listAllCommands } from "../../engine/registry.js";
import { listScopedCommands } from "../../engine/scope.js";
import type { MetaCommandResult } from "../../output.js";
import { renderOutput } from "../../output.js";

/** Lists registered commands and returns them as a normalized result.
 *  When `all` is false and cwd is inside an active scope, only whitelisted commands are returned. */
export function handleCommandList(all = false, cwd = process.cwd()): MetaCommandResult {
	const commands = all ? listAllCommands() : listScopedCommands(cwd);
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

/** Registers the `list` sub-command on the given command group. */
export function registerList(group: Command, format: () => "human" | "json"): void {
	group
		.command("list")
		.description("List extension commands (scoped by default)")
		.option("--all", "Show all commands, bypassing scope filtering")
		.action(async (options: { all?: boolean }) => {
			renderOutput(handleCommandList(options.all ?? false), format());
		});
}
