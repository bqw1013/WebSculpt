#!/usr/bin/env node

import { Command, Help } from "commander";
import { appendLog } from "../infra/store.js";
import { runCommand } from "./engine/command-runner.js";
import { listAllCommands, type ResolvedCommand } from "./engine/registry.js";
import { handleCommandCreate, handleCommandList, handleCommandRemove, handleCommandShow } from "./meta/command.js";
import { handleConfigInit } from "./meta/config.js";
import { printJson } from "./output.js";

declare module "commander" {
	interface Command {
		_domainSource?: string;
	}
}

class WebSculptHelp extends Help {
	formatHelp(cmd: Command, helper: Help): string {
		let out = "";

		out += `Usage: ${cmd.name()} <command> [options]\n\n`;

		const description = helper.commandDescription(cmd);
		if (description) {
			out += `${description}\n\n`;
		}

		const visibleOptions = helper.visibleOptions(cmd);
		if (visibleOptions.length > 0) {
			out += "Options:\n";
			for (const option of visibleOptions) {
				const term = helper.optionTerm(option);
				out += `  ${this.formatItem(term, term.length + 2, helper.optionDescription(option), helper)}\n`;
			}
			out += "\n";
		}

		const visibleCommands = helper.visibleCommands(cmd);
		const metaNames = new Set(["command", "config"]);
		const meta = visibleCommands.filter((c) => metaNames.has(c.name()));
		const domains = visibleCommands.filter((c) => !metaNames.has(c.name()) && !c.name().startsWith("help"));
		const builtinDomains = domains.filter((c) => c._domainSource === "builtin");
		const userDomains = domains.filter((c) => c._domainSource === "user");

		if (meta.length > 0) {
			out += "Meta Commands:\n";
			for (const c of meta) {
				const term = helper.subcommandTerm(c);
				out += `  ${this.formatItem(term, term.length + 2, helper.subcommandDescription(c), helper)}\n`;
			}
			out += "\n";
		}

		if (builtinDomains.length > 0) {
			out += "Built-in Domains:\n";
			for (const c of builtinDomains) {
				const term = helper.subcommandTerm(c);
				out += `  ${this.formatItem(term, term.length + 2, helper.subcommandDescription(c), helper)}\n`;
			}
			out += "\n";
		}

		if (userDomains.length > 0) {
			out += "User Domains:\n";
			for (const c of userDomains) {
				const term = helper.subcommandTerm(c);
				out += `  ${this.formatItem(term, term.length + 2, helper.subcommandDescription(c), helper)}\n`;
			}
			out += "\n";
		}

		return `${out.trimEnd()}\n`;
	}
}

async function main() {
	const program = new Command();
	program.name("websculpt").description("WebSculpt CLI - AI command cache layer").version("0.0.1");
	program.configureHelp({
		sortSubcommands: true,
	});
	program.createHelp = () => new WebSculptHelp();

	const cmd = program.command("command").description("Manage commands");
	cmd.command("list")
		.description("List all commands")
		.action(async () => {
			await handleCommandList();
		});
	cmd.command("create <domain> <action>")
		.description("Create a user command from a package file")
		.requiredOption("--from-file <path>", "Path to the command package JSON")
		.option("--force", "Overwrite an existing command")
		.action(async (domain: string, action: string, options: { fromFile: string; force?: boolean }) => {
			await handleCommandCreate(domain, action, options);
		});
	cmd.command("show <domain> <action>")
		.description("Show command details")
		.action(async (domain: string, action: string) => {
			await handleCommandShow(domain, action);
		});
	cmd.command("remove <domain> <action>")
		.description("Remove a user command")
		.action(async (domain: string, action: string) => {
			await handleCommandRemove(domain, action);
		});

	const cfg = program.command("config").description("Manage configuration");
	cfg.command("init")
		.description("Initialize WebSculpt directories")
		.action(async () => {
			await handleConfigInit();
		});

	const commands = await listAllCommands();
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

		for (const c of domainCommands) {
			const actionCmd = domainCmd
				.command(c.manifest.action)
				.description(c.manifest.description || `${c.manifest.domain} ${c.manifest.action}`);
			for (const key of c.manifest.parameters || []) {
				actionCmd.option(`--${key} <value>`);
			}
			actionCmd.action(async (options: Record<string, string | undefined>) => {
				const start = Date.now();
				const args: Record<string, string> = {};
				for (const key of c.manifest.parameters || []) {
					if (options[key] !== undefined) {
						args[key] = options[key];
					}
				}
				try {
					const data = await runCommand(c.manifest, c.commandPath, args);
					const result = {
						success: true,
						command: `${c.manifest.domain}/${c.manifest.action}`,
						data,
						meta: { duration: Date.now() - start },
					};
					printJson(result);
					await appendLog({
						time: new Date().toISOString(),
						domain: c.manifest.domain,
						action: c.manifest.action,
						result,
					});
				} catch (err: unknown) {
					const message = err instanceof Error ? err.message : String(err);
					const result = {
						success: false,
						command: `${c.manifest.domain}/${c.manifest.action}`,
						error: { code: "EXECUTION_ERROR", message },
						meta: { duration: Date.now() - start },
					};
					printJson(result);
					await appendLog({
						time: new Date().toISOString(),
						domain: c.manifest.domain,
						action: c.manifest.action,
						result,
					});
				}
			});
		}
	}

	program.parse(process.argv);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
