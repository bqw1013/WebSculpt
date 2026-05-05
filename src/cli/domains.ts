import type { Command } from "commander";
import type { CommandParameter, CommandRuntime } from "../types/index.js";
import type { ResolvedCommand } from "./engine/command-discovery/contract.js";
import { executeCommand } from "./engine/execution/orchestrator.js";
import { listAllCommands } from "./engine/registry.js";
import { printJson } from "./output.js";
import { RUNTIME_SYSTEM_PREREQUISITES } from "./runtime/index.js";

/** Groups resolved commands by their manifest domain. */
function groupCommandsByDomain(commands: ResolvedCommand[]): Map<string, ResolvedCommand[]> {
	const map = new Map<string, ResolvedCommand[]>();
	for (const c of commands) {
		const list = map.get(c.manifest.domain) ?? [];
		list.push(c);
		map.set(c.manifest.domain, list);
	}
	return map;
}

/** Determines which help section the domain belongs to. If any command is user-defined, the whole domain is shown under User Domains. */
function resolveHelpSection(commands: ResolvedCommand[]): "user" | "builtin" {
	return commands.some((c) => c.source === "user") ? "user" : "builtin";
}

/** Deduplicates actions within a domain; user commands take precedence over built-ins. */
function deduplicateActions(commands: ResolvedCommand[]): Map<string, ResolvedCommand> {
	const actionMap = new Map<string, ResolvedCommand>();
	for (const c of commands) {
		if (!actionMap.has(c.manifest.action) || c.source === "user") {
			actionMap.set(c.manifest.action, c);
		}
	}
	return actionMap;
}

/** Collects only the arguments declared in the manifest parameters. */
function collectArgs(
	options: Record<string, string | undefined>,
	parameters: CommandParameter[] | undefined,
): Record<string, string> {
	const args: Record<string, string> = {};
	for (const param of parameters || []) {
		const value = options[param.name];
		if (value !== undefined) {
			args[param.name] = value;
		}
	}
	return args;
}

/** Resolves the effective output format. Domain commands default to JSON unless the user explicitly passes --format. */
function resolveEffectiveFormat(program: Command): "human" | "json" {
	const format = program.opts().format as "human" | "json";
	const formatSource = program.getOptionValueSource("format");
	return formatSource !== "default" ? format : "json";
}

/** Builds the extra help text for a command (prerequisites, browser requirement, login requirement). */
function buildHelpText(command: ResolvedCommand): string {
	const systemPrereqs = RUNTIME_SYSTEM_PREREQUISITES[command.runtime as CommandRuntime];
	const manifestPrereqs = command.manifest.prerequisites;

	const allPrereqs = new Set<string>();
	if (systemPrereqs) {
		for (const p of systemPrereqs) {
			allPrereqs.add(p);
		}
	}
	if (manifestPrereqs) {
		for (const p of manifestPrereqs) {
			allPrereqs.add(p);
		}
	}

	const lines: string[] = [];
	if (allPrereqs.size > 0) {
		lines.push("Prerequisites:", ...[...allPrereqs].map((p) => `  ${p}`));
	}
	lines.push(`Browser: ${command.manifest.requiresBrowser ? "yes" : "no"}`);
	if (command.manifest.authRequired !== undefined) {
		lines.push(`Login: ${command.manifest.authRequired}`);
	}
	return `\n${lines.join("\n")}`;
}

/**
 * Loads all domain commands from the registry, mounts them onto the Commander
 * program, maps manifest parameters to CLI options, and wires action execution
 * through the executor.
 */
export function registerDomainCommands(program: Command): void {
	const commands = listAllCommands();
	const domainMap = groupCommandsByDomain(commands);

	for (const [domain, domainCommands] of domainMap) {
		const source = resolveHelpSection(domainCommands);
		const domainCmd = program.command(domain).description(`${domain} commands`);
		// Attach metadata for the custom help formatter to categorize domains correctly.
		domainCmd._domainSource = source;

		const actionMap = deduplicateActions(domainCommands);

		for (const command of actionMap.values()) {
			const { action, description, parameters } = command.manifest;
			const actionCmd = domainCmd.command(action).description(description);

			for (const param of parameters || []) {
				const flags = `--${param.name} <value>`;
				const option = actionCmd.createOption(flags, param.description);
				if (param.required) {
					option.makeOptionMandatory();
				}
				if (param.default !== undefined) {
					option.default(String(param.default));
				}
				actionCmd.addOption(option);
			}

			actionCmd.action(async (options: Record<string, string | undefined>) => {
				const args = collectArgs(options, parameters);
				const result = await executeCommand(command, args);
				const effectiveFormat = resolveEffectiveFormat(program);

				if (!result.success && effectiveFormat === "human") {
					console.error(`${result.error.code}: ${result.error.message}`);
				} else {
					printJson(result);
				}
			});

			actionCmd.addHelpText("after", buildHelpText(command));
		}
	}
}
