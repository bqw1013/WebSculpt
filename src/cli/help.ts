import { type Command, Help } from "commander";

// Extend Commander's Command type to attach domain-source metadata for custom help formatting.
declare module "commander" {
	interface Command {
		_domainSource?: string;
	}
}

/** Custom help formatter that categorizes commands into Meta, Built-in, and User domains. */
export class WebSculptHelp extends Help {
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
		const metaNames = new Set(["command", "config", "skill"]);
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
			out += "  Meta commands manage the system (config, command registry, skill).\n";
			out += "  Extension commands are user or AI-created business commands.\n";
			out += "  Output defaults: meta commands -> human text, extension commands -> JSON.\n";
			out += "  Command resolution: user > builtin > meta\n";
			out += "\n";
		}

		return `${out.trimEnd()}\n`;
	}
}

/** Registers the `help [domain] [action]` routing command on the given program. */
export function registerHelpCommand(program: Command): void {
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
}
