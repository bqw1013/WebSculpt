import type { Command } from "commander";
import type { SkillUninstallResult } from "../output.js";
import { renderOutput } from "../output.js";
import { handleCommandList, handleCommandRemove, handleCommandShow } from "./command.js";
import { handleConfigInit } from "./config.js";
import { handleCommandCreate } from "./create.js";
import { handleDaemonLogs, handleDaemonRestart, handleDaemonStart, handleDaemonStatus, handleDaemonStop } from "./daemon.js";
import { handleCommandDraft } from "./draft.js";
import { handleSkillInstall, handleSkillStatus, handleSkillUninstall } from "./skill.js";
import { handleCommandValidate } from "./validate.js";

function collectOption(value: string, previous: string[]): string[] {
	return previous.concat([value]);
}

// Re-export all meta handlers so callers can import from the facade.
export {
	handleCommandList,
	handleCommandRemove,
	handleCommandShow,
	handleConfigInit,
	handleCommandCreate,
	handleSkillInstall,
	handleSkillStatus,
	handleSkillUninstall,
	handleCommandValidate,
	handleCommandDraft,
	handleDaemonStatus,
	handleDaemonLogs,
	handleDaemonStop,
	handleDaemonStart,
	handleDaemonRestart,
};

/** Registers all meta commands (command, config, skill) on the given program. */
export function registerMetaCommands(program: Command): void {
	const format = (): "human" | "json" => program.opts().format;

	const cmd = program.command("command").description("Manage extension command registry");
	cmd.command("list")
		.description("List all extension commands")
		.action(async () => {
			renderOutput(await handleCommandList(), format());
		});
	cmd.command("create <domain> <action>")
		.description("Create a user command from a directory")
		.requiredOption(
			"--from-dir <path>",
			"Path to the command source directory. Must contain manifest.json and the runtime-specific entry file.",
		)
		.option("--force", "Overwrite an existing command")
		.action(async (domain: string, action: string, options: { fromDir: string; force?: boolean }) => {
			renderOutput(await handleCommandCreate(domain, action, options), format());
		});
	cmd.command("validate")
		.description("Validate a command directory without installing")
		.requiredOption("--from-dir <path>", "Path to the command source directory")
		.argument("[domain]", "Optional domain to simulate injection")
		.argument("[action]", "Optional action to simulate injection")
		.action(async (domain: string | undefined, action: string | undefined, options: { fromDir: string }) => {
			renderOutput(await handleCommandValidate(options.fromDir, domain, action), format());
		});
	cmd.command("show <domain> <action>")
		.description("Show extension command details")
		.option("--include-readme", "Include README.md content in the output")
		.action(async (domain: string, action: string, options: { includeReadme?: boolean }) => {
			renderOutput(await handleCommandShow(domain, action, options.includeReadme), format());
		});
	cmd.command("remove <domain> <action>")
		.description("Remove a user command")
		.action(async (domain: string, action: string) => {
			renderOutput(await handleCommandRemove(domain, action), format());
		});
	cmd.command("draft <domain> <action>")
		.description("Generate a command skeleton directory")
		.option("--runtime <runtime>", "Runtime: node, playwright-cli, shell, python (default: node)")
		.option("--to <path>", "Custom output directory")
		.option("--param <spec>", "Declare a parameter (repeatable)", collectOption, [])
		.option("--force", "Overwrite existing draft directory")
		.action(
			async (
				domain: string,
				action: string,
				options: { runtime?: string; to?: string; param: string[]; force?: boolean },
			) => {
				renderOutput(await handleCommandDraft(domain, action, options), format());
			},
		);

	const cfg = program.command("config").description("Initialize and manage CLI configuration");
	cfg.command("init")
		.description("Initialize ~/.websculpt with config.json and log.jsonl")
		.action(async () => {
			renderOutput(await handleConfigInit(), format());
		});

	const daemon = program.command("daemon").description("Manage the background browser daemon");
	daemon
		.command("status")
		.description("Show daemon health and resource status")
		.action(async () => {
			const result = await handleDaemonStatus();
			renderOutput(result, format());
			if (!result.success) {
				process.exitCode = 1;
			}
		});
	daemon
		.command("logs")
		.description("Show recent daemon log entries")
		.option("--lines <n>", "Number of lines to show", (val) => Number.parseInt(val, 10))
		.action(async (options: { lines?: number }) => {
			const result = await handleDaemonLogs({ lines: options.lines });
			renderOutput(result, format());
			if (!result.success) {
				process.exitCode = 1;
			}
		});
	daemon
		.command("start")
		.description("Start the background daemon if not already running")
		.action(async () => {
			renderOutput(await handleDaemonStart(), format());
		});
	daemon
		.command("restart")
		.description("Restart the background daemon")
		.action(async () => {
			renderOutput(await handleDaemonRestart(), format());
		});
	daemon
		.command("stop")
		.description("Stop the running daemon process")
		.action(async () => {
			renderOutput(await handleDaemonStop(), format());
		});

	const skill = program.command("skill").description("Install strategy docs to AI agent directories");
	skill
		.command("install")
		.description("Install the WebSculpt skill to agent directories")
		.option("-g, --global", "Install to global agent directories")
		.option("-a, --agents <agents>", "Target specific agents (claude,codex,agents,all)")
		.option("--from <path>", "Explicit skill source path")
		.option("--lang <lang>", "Language: en (default) or zh")
		.option("--force", "Replace existing installation")
		.action(async (options: { global?: boolean; agents?: string; from?: string; force?: boolean; lang?: string }) => {
			renderOutput(handleSkillInstall(options), format());
		});
	skill
		.command("uninstall")
		.description("Uninstall the WebSculpt skill from agent directories")
		.option("-g, --global", "Uninstall from global agent directories")
		.option("-a, --agents <agents>", "Target specific agents")
		.action(async (options: { global?: boolean; agents?: string }) => {
			const result = handleSkillUninstall(options);
			renderOutput(result, format());
			if (result.success && (result as SkillUninstallResult).results.every((r) => r.status === "not_found")) {
				process.exitCode = 1;
			}
		});
	skill
		.command("status")
		.description("Show skill installation status")
		.action(async () => {
			renderOutput(handleSkillStatus(), format());
		});
}
