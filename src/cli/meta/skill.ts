import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Command } from "commander";
import type { MetaCommandResult, SkillUninstallResult } from "../output.js";
import { renderOutput } from "../output.js";

const AGENTS = ["claude", "codex", "agents"] as const;
type Agent = (typeof AGENTS)[number];

function isAgent(value: string): value is Agent {
	return (AGENTS as readonly string[]).includes(value);
}

function getAgentDirs(scope: "local" | "global"): Record<Agent, string> {
	const base = scope === "global" ? path.join(os.homedir()) : process.cwd();
	return {
		claude: path.join(base, ".claude", "skills", "websculpt"),
		codex: path.join(base, ".codex", "skills", "websculpt"),
		agents: path.join(base, ".agents", "skills", "websculpt"),
	};
}

function getAgentRootDir(scope: "local" | "global", agent: Agent): string {
	const base = scope === "global" ? path.join(os.homedir()) : process.cwd();
	return path.join(base, `.${agent}`);
}

/** Resolves the built-in skill source directory. */
export function resolveSkillSource(from?: string, lang?: string): string {
	if (from) {
		if (!fs.existsSync(from)) {
			throw Object.assign(new Error(`Skill source not found: ${from}`), { code: "SKILL_SOURCE_NOT_FOUND" });
		}
		return path.resolve(from);
	}

	const currentDir = path.dirname(fileURLToPath(import.meta.url));
	const skillName = lang === "zh" ? "websculpt" : "websculpt-en";
	const packageRelative = path.resolve(currentDir, "..", "..", "..", "skills", skillName);
	if (fs.existsSync(path.join(packageRelative, "SKILL.md"))) {
		return packageRelative;
	}

	const cwdRelative = path.join(process.cwd(), "skills", skillName);
	if (fs.existsSync(path.join(cwdRelative, "SKILL.md"))) {
		return cwdRelative;
	}

	throw Object.assign(new Error("Built-in skill source not found. Use --from to specify the skill source path."), {
		code: "SKILL_SOURCE_NOT_FOUND",
	});
}

function parseAgents(filter?: string): Agent[] {
	if (!filter || filter === "all") {
		return [...AGENTS];
	}
	const requested = filter
		.split(",")
		.map((s) => s.trim())
		.filter(Boolean);
	const valid = requested.filter(isAgent);
	if (valid.length === 0) {
		return [...AGENTS];
	}
	return valid;
}

/** Installs the WebSculpt skill to agent directories. */
export function handleSkillInstall(options: {
	global?: boolean;
	agents?: string;
	from?: string;
	force?: boolean;
	lang?: string;
}): MetaCommandResult {
	try {
		const source = resolveSkillSource(options.from, options.lang);
		const scope = options.global ? "global" : "local";
		const agents = parseAgents(options.agents);

		const agentDirs = getAgentDirs(scope);
		const results: Array<{ agent: string; status: "installed" | "skipped" | "replaced" }> = [];

		if (scope === "local") {
			const detectedAgents = agents.filter((a) => fs.existsSync(getAgentRootDir(scope, a)));
			if (detectedAgents.length === 0) {
				return {
					success: false,
					error: {
						code: "AGENT_DIRS_NOT_FOUND",
						message:
							"No agent directories found in the current directory. Supported: .claude/, .codex/, .agents/. Run this command inside a project with agent configurations, or use --global.",
					},
				};
			}
		}

		for (const agent of agents) {
			const target = agentDirs[agent];
			if (scope === "local" && !fs.existsSync(getAgentRootDir(scope, agent))) {
				continue;
			}

			if (fs.existsSync(target)) {
				if (options.force) {
					fs.rmSync(target, { recursive: true, force: true });
					fs.cpSync(source, target, { recursive: true, force: true });
					results.push({ agent, status: "replaced" });
				} else {
					results.push({ agent, status: "skipped" });
				}
			} else {
				fs.mkdirSync(path.dirname(target), { recursive: true });
				fs.cpSync(source, target, { recursive: true, force: true });
				results.push({ agent, status: "installed" });
			}
		}

		return { success: true, results };
	} catch (err: unknown) {
		if (err instanceof Error && "code" in err && (err as Record<string, unknown>).code === "SKILL_SOURCE_NOT_FOUND") {
			return {
				success: false,
				error: { code: "SKILL_SOURCE_NOT_FOUND", message: err.message },
			};
		}
		const message = err instanceof Error ? err.message : String(err);
		return {
			success: false,
			error: { code: "INSTALL_ERROR", message },
		};
	}
}

/** Uninstalls the WebSculpt skill from agent directories. */
export function handleSkillUninstall(options: { global?: boolean; agents?: string }): MetaCommandResult {
	try {
		const scope = options.global ? "global" : "local";
		const agents = parseAgents(options.agents);

		const agentDirs = getAgentDirs(scope);
		const results: Array<{ agent: string; status: "removed" | "not_found" }> = [];

		for (const agent of agents) {
			const target = agentDirs[agent];
			if (fs.existsSync(target)) {
				fs.rmSync(target, { recursive: true, force: true });
				results.push({ agent, status: "removed" });
			} else {
				results.push({ agent, status: "not_found" });
			}
		}

		return { success: true, results };
	} catch (err: unknown) {
		const message = err instanceof Error ? err.message : String(err);
		return {
			success: false,
			error: { code: "UNINSTALL_ERROR", message },
		};
	}
}

/** Displays the installation status of the WebSculpt skill across agents. */
export function handleSkillStatus(): MetaCommandResult {
	const localDirs = getAgentDirs("local");
	const globalDirs = getAgentDirs("global");
	const lines: string[] = [];

	for (const agent of AGENTS) {
		const localExists = fs.existsSync(localDirs[agent]);
		const globalExists = fs.existsSync(globalDirs[agent]);

		if (localExists) {
			const suffix = globalExists ? " [global present]" : "";
			lines.push(`${agent.padEnd(8)} installed  local${suffix}`);
		} else if (globalExists) {
			lines.push(`${agent.padEnd(8)} installed  global`);
		} else {
			lines.push(`${agent.padEnd(8)} not installed`);
		}
	}

	return { success: true, lines };
}

/** Registers skill sub-commands on the given program. */
export function registerSkillMeta(program: Command): void {
	const format = (): "human" | "json" => program.opts().format;
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
