#!/usr/bin/env node

import { Command, Help } from "commander";
import { appendLog } from "../infra/store.js";
import { runCommand } from "./engine/command-runner.js";
import { listAllCommands, type ResolvedCommand } from "./engine/registry.js";
import { handleCommandCreate, handleCommandList, handleCommandRemove, handleCommandShow } from "./meta/command.js";
import { handleConfigInit } from "./meta/config.js";
import { printJson, renderOutput } from "./output.js";

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

		if (cmd.name() === "websculpt") {
			out += "Notes:\n";
			out += "  Meta commands manage the system (config, command registry).\n";
			out += "  Extension commands are user or AI-created business commands.\n";
			out += "  Output defaults: meta commands → human text, extension commands → JSON.\n";
			out += "  Command resolution: user > builtin > meta\n";
			out += "\n";
		}

		return `${out.trimEnd()}\n`;
	}
}

async function main() {
	const program = new Command();
	program
		.name("websculpt")
		.description(
			"WebSculpt CLI - AI command cache layer\n\n" +
				"Meta commands manage the system. Extension commands are user or AI-created business commands.",
		)
		.version("0.0.1");
	program.configureHelp({
		sortSubcommands: true,
	});
	program.createHelp = () => new WebSculptHelp();
	program.option("-f, --format <human|json>", "Output format", "human");

	const cmd = program.command("command").description("Manage commands");
	cmd.command("list")
		.description("List all commands")
		.action(async () => {
			renderOutput(await handleCommandList(), program.opts().format);
		});
	cmd.command("create <domain> <action>")
		.description("Create a user command from a package file")
		.requiredOption(
			"--from-file <path>",
			"Path to the command package JSON. Must contain 'manifest' and 'code'; may also contain 'readme' and 'context'.",
		)
		.option("--force", "Overwrite an existing command")
		.action(async (domain: string, action: string, options: { fromFile: string; force?: boolean }) => {
			renderOutput(await handleCommandCreate(domain, action, options), program.opts().format);
		});
	cmd.command("show <domain> <action>")
		.description("Show command details")
		.action(async (domain: string, action: string) => {
			renderOutput(await handleCommandShow(domain, action), program.opts().format);
		});
	cmd.command("remove <domain> <action>")
		.description("Remove a user command")
		.action(async (domain: string, action: string) => {
			renderOutput(await handleCommandRemove(domain, action), program.opts().format);
		});

	const cfg = program.command("config").description("Manage configuration");
	cfg.command("init")
		.description("Initialize ~/.websculpt with config.json and log.jsonl")
		.action(async () => {
			renderOutput(await handleConfigInit(), program.opts().format);
		});

	program
		.command("help [domain] [action]")
		.description("Display help for a command or domain")
		.action((domain?: string, action?: string) => {
			if (!domain) {
				program.help();
				return;
			}
			const target = program.commands.find((c) => c.name() === domain);
			if (!target) {
				console.error(`Unknown command or domain: ${domain}`);
				process.exit(1);
			}
			if (!action) {
				target.help();
				return;
			}
			const sub = target.commands.find((c) => c.name() === action);
			if (!sub) {
				console.error(`Unknown action: ${action}`);
				process.exit(1);
			}
			sub.help();
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
			for (const param of c.manifest.parameters || []) {
				const name = typeof param === "string" ? param : param.name;
				const description = typeof param === "string" ? undefined : param.description;
				const flags = `--${name} <value>`;
				const actionOption = actionCmd.createOption(flags, description);
				if (typeof param !== "string") {
					if (param.required) {
						actionOption.makeOptionMandatory();
					}
					if (param.default !== undefined) {
						actionOption.default(String(param.default));
					}
				}
				actionCmd.addOption(actionOption);
			}
			actionCmd.action(async (options: Record<string, string | undefined>) => {
				const start = Date.now();
				const args: Record<string, string> = {};
				for (const param of c.manifest.parameters || []) {
					const name = typeof param === "string" ? param : param.name;
					if (options[name] !== undefined) {
						args[name] = options[name];
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
					const code =
						err instanceof Error && "code" in err && typeof err.code === "string" ? err.code : "EXECUTION_ERROR";
					const result = {
						success: false,
						command: `${c.manifest.domain}/${c.manifest.action}`,
						error: { code, message },
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
