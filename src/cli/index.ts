#!/usr/bin/env node

import { createRequire } from "node:module";
import { Command } from "commander";
import { initStore } from "../infra/store.js";
import { registerDomainCommands } from "./domains.js";
import { loadRegistry } from "./engine/registry.js";
import { registerHelpCommand, WebSculptHelp } from "./help.js";
import { registerMetaCommands } from "./meta/index.js";

const require = createRequire(import.meta.url);
const pkg = require("../../package.json");

async function main() {
	const program = new Command();
	program
		.name("websculpt")
		.description(
			"WebSculpt — AI harness for gathering web information. " +
				"Extension commands are reusable data-collection workflows; meta commands manage the system.",
		)
		.version(pkg.version);
	program.configureHelp({
		sortSubcommands: true,
	});
	program.createHelp = () => new WebSculptHelp();
	program.option("-f, --format <human|json>", "Output format", "human");

	registerMetaCommands(program);
	registerHelpCommand(program);
	await initStore();
	await loadRegistry();
	registerDomainCommands(program);

	program.parse(process.argv);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
