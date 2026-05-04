import type { Command } from "commander";
import { initStore } from "../../infra/store.js";
import type { MetaCommandResult } from "../output.js";
import { renderOutput } from "../output.js";

/** Initializes the WebSculpt environment and returns a normalized result. */
export async function handleConfigInit(): Promise<MetaCommandResult> {
	await initStore();
	return {
		success: true,
		message: "WebSculpt initialized.",
	};
}

/** Registers the `config init` sub-command on the given program. */
export function registerConfigMeta(program: Command): void {
	const format = (): "human" | "json" => program.opts().format;
	const cfg = program.command("config").description("Initialize and manage CLI configuration");
	cfg.command("init")
		.description("Initialize ~/.websculpt with config.json and log.jsonl")
		.action(async () => {
			renderOutput(await handleConfigInit(), format());
		});
}
