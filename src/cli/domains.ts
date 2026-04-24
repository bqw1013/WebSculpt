import type { Command } from "commander";
import { executeCommand } from "./engine/executor.js";
import { listAllCommands, type ResolvedCommand } from "./engine/registry.js";
import { printJson } from "./output.js";

// Extend Commander's Command type to attach domain-source metadata for custom help formatting.
declare module "commander" {
	interface Command {
		_domainSource?: string;
	}
}

/**
 * Loads all domain commands from the registry, mounts them onto the Commander
 * program, maps manifest parameters to CLI options, and wires action execution
 * through the executor.
 */
export function registerDomainCommands(program: Command): void {
	const commands = listAllCommands();
	const domainMap = new Map<string, ResolvedCommand[]>();
	for (const c of commands) {
		const list = domainMap.get(c.manifest.domain) ?? [];
		list.push(c);
		domainMap.set(c.manifest.domain, list);
	}

	for (const [domain, domainCommands] of domainMap) {
		// If any command in the domain is user-defined, treat the whole domain as user so it overrides built-ins.
		const source = domainCommands.some((c) => c.source === "user") ? "user" : "builtin";
		const domainCmd = program.command(domain).description(`${domain} commands`);
		// Attach metadata for the custom help formatter to categorize domains correctly.
		domainCmd._domainSource = source;

		// Deduplicate by action; user commands take precedence over built-ins.
		const actionMap = new Map<string, ResolvedCommand>();
		for (const c of domainCommands) {
			if (!actionMap.has(c.manifest.action) || c.source === "user") {
				actionMap.set(c.manifest.action, c);
			}
		}

		for (const c of actionMap.values()) {
			const actionCmd = domainCmd.command(c.manifest.action).description(c.manifest.description);
			for (const param of c.manifest.parameters || []) {
				const name = param.name;
				const description = param.description;
				const flags = `--${name} <value>`;
				const actionOption = actionCmd.createOption(flags, description);
				if (param.required) {
					actionOption.makeOptionMandatory();
				}
				if (param.default !== undefined) {
					actionOption.default(String(param.default));
				}
				actionCmd.addOption(actionOption);
			}
			actionCmd.action(async (options: Record<string, string | undefined>) => {
				const args: Record<string, string> = {};
				for (const param of c.manifest.parameters || []) {
					const name = param.name;
					if (options[name] !== undefined) {
						args[name] = options[name];
					}
				}
				const result = await executeCommand(c, args);
				printJson(result);
			});
		}
	}
}
