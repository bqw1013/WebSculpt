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
		const metaNames = new Set(["command", "config", "daemon", "skill"]);
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
			out += "  Default commands shipped with the project\n";
			for (const c of builtinDomains) {
				const term = helper.subcommandTerm(c);
				out += `  ${this.formatItem(term, term.length + 2, helper.subcommandDescription(c), helper)}\n`;
			}
			out += "\n";
		}

		if (userDomains.length > 0) {
			out += "User Domains:\n";
			out += "  Custom commands created by you or AI; override built-in\n";
			for (const c of userDomains) {
				const term = helper.subcommandTerm(c);
				out += `  ${this.formatItem(term, term.length + 2, helper.subcommandDescription(c), helper)}\n`;
			}
			out += "\n";
		}

		if (cmd.name() === "websculpt") {
			out += "Command types:\n";
			out += "  Meta      Manage the CLI system (registry, config, agent skill docs)\n";
			out += "  Builtin   Default commands shipped with the project\n";
			out += "  User      Custom commands created by you or AI; override builtin\n";
			out += "\n";
			out += "Resolution: user > builtin > meta\n";
			out += "Output:     meta -> human text, extension -> JSON\n";
			out += "\n";
		}

		return `${out.trimEnd()}\n`;
	}
}
