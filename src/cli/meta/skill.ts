import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { MetaCommandResult } from "../output.js";

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
export function resolveSkillSource(from?: string): string {
	if (from) {
		if (!fs.existsSync(from)) {
			throw Object.assign(new Error(`Skill source not found: ${from}`), { code: "SKILL_SOURCE_NOT_FOUND" });
		}
		return path.resolve(from);
	}

	const currentDir = path.dirname(fileURLToPath(import.meta.url));
	const packageRelative = path.resolve(currentDir, "..", "..", "..", "skills", "websculpt");
	if (fs.existsSync(path.join(packageRelative, "SKILL.md"))) {
		return packageRelative;
	}

	const cwdRelative = path.join(process.cwd(), "skills", "websculpt");
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

function readVersion(dir: string): string | undefined {
	try {
		const versionPath = path.join(dir, "version.json");
		const data = JSON.parse(fs.readFileSync(versionPath, "utf-8"));
		return typeof data.version === "string" ? data.version : undefined;
	} catch {
		return undefined;
	}
}

/** Installs the WebSculpt skill to agent directories. */
export function handleSkillInstall(options: {
	global?: boolean;
	agents?: string;
	from?: string;
	force?: boolean;
}): MetaCommandResult {
	try {
		const source = resolveSkillSource(options.from);
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
		const localVersion = readVersion(localDirs[agent]);
		const globalVersion = readVersion(globalDirs[agent]);

		if (localVersion) {
			const suffix = globalVersion ? ` [global ${globalVersion} present]` : "";
			lines.push(`${agent.padEnd(8)} ${localVersion.padEnd(8)} local${suffix}`);
		} else if (globalVersion) {
			lines.push(`${agent.padEnd(8)} ${globalVersion.padEnd(8)} global`);
		} else {
			lines.push(`${agent.padEnd(8)} not installed`);
		}
	}

	return { success: true, lines };
}
