#!/usr/bin/env node

import { Command } from "commander";
import { registerDomainCommands } from "./domains.js";
import { registerHelpCommand, WebSculptHelp } from "./help.js";
import { registerMetaCommands } from "./meta/index.js";

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

	registerMetaCommands(program);
	registerHelpCommand(program);
	await registerDomainCommands(program);

	program.parse(process.argv);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
