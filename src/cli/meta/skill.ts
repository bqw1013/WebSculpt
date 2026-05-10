import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Command } from "commander";
import type { MetaCommandResult, SkillUninstallResult } from "../output.js";
import { renderOutput } from "../output.js";
import { getFormat } from "./shared.js";

const AGENTS = ["claude", "codex", "agents"] as const;
type Agent = (typeof AGENTS)[number];

function isAgent(value: string): value is Agent {
	return (AGENTS as readonly string[]).includes(value);
}

function getAgentRootDir(scope: "local" | "global", agent: Agent): string {
	const base = scope === "global" ? path.join(os.homedir()) : process.cwd();
	return path.join(base, `.${agent}`);
}

function getAgentSkillDir(scope: "local" | "global", agent: Agent, skillName: string): string {
	return path.join(getAgentRootDir(scope, agent), "skills", skillName);
}

function getSkillsDir(): string | null {
	const currentDir = path.dirname(fileURLToPath(import.meta.url));
	const packageSkillsDir = path.resolve(currentDir, "..", "..", "..", "skills");
	if (fs.existsSync(packageSkillsDir)) {
		return packageSkillsDir;
	}
	const cwdSkillsDir = path.join(process.cwd(), "skills");
	if (fs.existsSync(cwdSkillsDir)) {
		return cwdSkillsDir;
	}
	return null;
}

/** Scans the skills directory and returns all matching websculpt-* paths filtered by language. */
export function resolveSkillSources(lang?: string): string[] {
	const skillsDir = getSkillsDir();
	if (!skillsDir) {
		throw Object.assign(new Error("Built-in skill source not found. Use --from to specify the skill source path."), {
			code: "SKILL_SOURCE_NOT_FOUND",
		});
	}

	const entries = fs.readdirSync(skillsDir, { withFileTypes: true });
	const sources = entries
		.filter(
			(e) =>
				e.isDirectory() &&
				e.name.startsWith("websculpt-") &&
				fs.existsSync(path.join(skillsDir, e.name, "SKILL.md")),
		)
		.map((e) => path.join(skillsDir, e.name));

	const filtered = sources.filter((src) => {
		const name = path.basename(src);
		if (lang === "zh") {
			return !name.endsWith("-en");
		}
		// Default to en: keep only *-en directories
		return name.endsWith("-en");
	});

	if (filtered.length === 0) {
		throw Object.assign(new Error("Built-in skill source not found. Use --from to specify the skill source path."), {
			code: "SKILL_SOURCE_NOT_FOUND",
		});
	}

	return filtered;
}

/** Resolves a single skill by short name to its full directory path. */
export function resolveSingleSkillSource(name: string, lang?: string): string {
	const skillName = lang === "zh" ? `websculpt-${name}` : `websculpt-${name}-en`;

	const skillsDir = getSkillsDir();
	if (!skillsDir) {
		throw Object.assign(
			new Error(`Built-in skill source not found for "${name}". Use --from to specify the skill source path.`),
			{
				code: "SKILL_SOURCE_NOT_FOUND",
			},
		);
	}

	const skillPath = path.join(skillsDir, skillName);
	if (fs.existsSync(path.join(skillPath, "SKILL.md"))) {
		return skillPath;
	}

	throw Object.assign(
		new Error(`Built-in skill source not found for "${name}". Use --from to specify the skill source path.`),
		{
			code: "SKILL_SOURCE_NOT_FOUND",
		},
	);
}

/** Resolves the built-in skill source directory. */
export function resolveSkillSource(from?: string, lang?: string): string {
	if (from) {
		if (!fs.existsSync(from)) {
			throw Object.assign(new Error(`Skill source not found: ${from}`), { code: "SKILL_SOURCE_NOT_FOUND" });
		}
		return path.resolve(from);
	}

	// Default to English, resolve the first available skill for backward compatibility
	const sources = resolveSkillSources(lang);
	if (sources.length === 0) {
		throw Object.assign(new Error("Built-in skill source not found. Use --from to specify the skill source path."), {
			code: "SKILL_SOURCE_NOT_FOUND",
		});
	}
	return sources[0] as string;
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

function getBaseSkillName(sourceName: string): string {
	return sourceName.replace(/-en$/, "");
}

function getBuiltInSkillNames(): string[] {
	const skillsDir = getSkillsDir();
	if (skillsDir) {
		try {
			const entries = fs.readdirSync(skillsDir, { withFileTypes: true });
			const names = entries
				.filter(
					(e) =>
						e.isDirectory() &&
						e.name.startsWith("websculpt-") &&
						fs.existsSync(path.join(skillsDir, e.name, "SKILL.md")),
				)
				.map((e) => getBaseSkillName(e.name));
			return [...new Set(names)];
		} catch {
			// fall through
		}
	}
	return ["websculpt-explore", "websculpt-capture"];
}

/** Installs the WebSculpt skill to agent directories. */
export function handleSkillInstall(options: {
	global?: boolean;
	agents?: string;
	from?: string;
	force?: boolean;
	lang?: string;
	name?: string;
}): MetaCommandResult {
	try {
		let sources: string[];
		if (options.from) {
			sources = [resolveSkillSource(options.from)];
		} else if (options.name) {
			sources = [resolveSingleSkillSource(options.name, options.lang)];
		} else {
			sources = resolveSkillSources(options.lang);
		}

		const scope = options.global ? "global" : "local";
		const agents = parseAgents(options.agents);

		const results: Array<{ agent: string; skill: string; status: "installed" | "skipped" | "replaced" }> = [];

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
			if (scope === "local" && !fs.existsSync(getAgentRootDir(scope, agent))) {
				continue;
			}

			for (const source of sources) {
				const skillName = getBaseSkillName(path.basename(source));
				const target = getAgentSkillDir(scope, agent, skillName);

				if (fs.existsSync(target)) {
					if (options.force) {
						fs.rmSync(target, { recursive: true, force: true });
						fs.cpSync(source, target, { recursive: true, force: true });
						results.push({ agent, skill: skillName, status: "replaced" });
					} else {
						results.push({ agent, skill: skillName, status: "skipped" });
					}
				} else {
					fs.mkdirSync(path.dirname(target), { recursive: true });
					fs.cpSync(source, target, { recursive: true, force: true });
					results.push({ agent, skill: skillName, status: "installed" });
				}
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
export function handleSkillUninstall(options: { global?: boolean; agents?: string; name?: string }): MetaCommandResult {
	try {
		const scope = options.global ? "global" : "local";
		const agents = parseAgents(options.agents);

		const results: Array<{ agent: string; skill: string; status: "removed" | "not_found" }> = [];

		for (const agent of agents) {
			const agentSkillsDir = path.join(getAgentRootDir(scope, agent), "skills");

			if (!fs.existsSync(agentSkillsDir)) {
				// No skills directory at all
				if (options.name) {
					const skillName = `websculpt-${options.name}`;
					results.push({ agent, skill: skillName, status: "not_found" });
				} else {
					const builtInSkills = getBuiltInSkillNames();
					for (const skillName of builtInSkills) {
						results.push({ agent, skill: skillName, status: "not_found" });
					}
				}
				continue;
			}

			if (options.name) {
				const skillName = `websculpt-${options.name}`;
				const target = path.join(agentSkillsDir, skillName);
				if (fs.existsSync(target)) {
					fs.rmSync(target, { recursive: true, force: true });
					results.push({ agent, skill: skillName, status: "removed" });
				} else {
					results.push({ agent, skill: skillName, status: "not_found" });
				}
			} else {
				const entries = fs.readdirSync(agentSkillsDir, { withFileTypes: true });
				const skillDirs = entries
					.filter((e) => e.isDirectory() && e.name.startsWith("websculpt-"))
					.map((e) => e.name);

				if (skillDirs.length === 0) {
					const builtInSkills = getBuiltInSkillNames();
					for (const skillName of builtInSkills) {
						results.push({ agent, skill: skillName, status: "not_found" });
					}
				} else {
					for (const skillName of skillDirs) {
						const target = path.join(agentSkillsDir, skillName);
						fs.rmSync(target, { recursive: true, force: true });
						results.push({ agent, skill: skillName, status: "removed" });
					}
				}
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
	const skillNames = getBuiltInSkillNames();
	const lines: string[] = [];

	for (const agent of AGENTS) {
		lines.push(`${agent}:`);

		for (const skillName of skillNames) {
			const localExists = fs.existsSync(getAgentSkillDir("local", agent, skillName));
			const globalExists = fs.existsSync(getAgentSkillDir("global", agent, skillName));

			if (localExists) {
				lines.push(`  ${skillName.padEnd(22)} installed  local`);
			} else if (globalExists) {
				lines.push(`  ${skillName.padEnd(22)} installed  global`);
			} else {
				lines.push(`  ${skillName.padEnd(22)} not installed`);
			}
		}
	}

	return { success: true, lines };
}

/** Registers skill sub-commands on the given program. */
export function registerSkillMeta(program: Command): void {
	const format = (): "human" | "json" => getFormat(program);
	const skill = program.command("skill").description("Install strategy docs to AI agent directories");

	skill
		.command("install")
		.description("Install WebSculpt skills to agent directories")
		.argument("[name]", "Skill name to install (e.g., capture, explore)")
		.option("-g, --global", "Install to global agent directories")
		.option("-a, --agents <agents>", "Target specific agents (claude,codex,agents,all)")
		.option("--from <path>", "Explicit skill source path")
		.option("--lang <lang>", "Language: en (default) or zh")
		.option("--force", "Replace existing installation")
		.action(
			async (
				name: string | undefined,
				options: { global?: boolean; agents?: string; from?: string; force?: boolean; lang?: string },
			) => {
				renderOutput(handleSkillInstall({ ...options, name }), format());
			},
		);

	skill
		.command("uninstall")
		.description("Uninstall WebSculpt skills from agent directories")
		.argument("[name]", "Skill name to uninstall (e.g., capture, explore)")
		.option("-g, --global", "Uninstall from global agent directories")
		.option("-a, --agents <agents>", "Target specific agents")
		.action(async (name: string | undefined, options: { global?: boolean; agents?: string }) => {
			const result = handleSkillUninstall({ ...options, name });
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
