import type { Command } from "commander";
import { listAllCommands } from "../../engine/registry.js";
import type { MetaCommandResult } from "../../output.js";
import { renderOutput } from "../../output.js";

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

/** Registers the `list` sub-command on the given command group. */
export function registerList(group: Command, format: () => "human" | "json"): void {
	group
		.command("list")
		.description("List all extension commands")
		.action(async () => {
			renderOutput(await handleCommandList(), format());
		});
}
