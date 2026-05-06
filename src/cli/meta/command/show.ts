import { access, readFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import type { Command } from "commander";
import { findCommand } from "../../engine/registry.js";
import type { CommandShowResult, MetaCommandResult } from "../../output.js";
import { renderOutput } from "../../output.js";
import { RUNTIME_SYSTEM_PREREQUISITES } from "../../runtime/index.js";

/** Displays details for a specific command. */
export async function handleCommandShow(
	domain: string,
	action: string,
	includeReadme = false,
): Promise<MetaCommandResult> {
	const resolved = findCommand(domain, action);
	if (!resolved) {
		return {
			success: false,
			error: {
				code: "NOT_FOUND",
				message: `Command "${domain}/${action}" does not exist.`,
			},
		};
	}

	const dir = dirname(resolved.commandPath);
	const entryFile = basename(resolved.commandPath);

	async function fileExists(name: string): Promise<boolean> {
		try {
			await access(join(dir, name));
			return true;
		} catch {
			return false;
		}
	}

	const assets = {
		manifest: await fileExists("manifest.json"),
		readme: await fileExists("README.md"),
		context: await fileExists("context.md"),
		entryFile: await fileExists(entryFile),
	};

	const systemPrereqs =
		RUNTIME_SYSTEM_PREREQUISITES[resolved.runtime as import("../../../types/index.js").CommandRuntime] ?? [];
	const manifestPrereqs = resolved.manifest.prerequisites ?? [];
	const prerequisites = [...systemPrereqs, ...manifestPrereqs];

	const result: CommandShowResult = {
		success: true,
		command: {
			id: resolved.manifest.id,
			domain: resolved.manifest.domain,
			action: resolved.manifest.action,
			description: resolved.manifest.description,
			runtime: resolved.runtime,
			source: resolved.source,
			path: dir,
			entryFile,
			parameters: resolved.manifest.parameters ?? [],
			prerequisites,
			assets,
			requiresBrowser: resolved.manifest.requiresBrowser,
			authRequired: resolved.manifest.authRequired,
		},
	};

	if (includeReadme && assets.readme) {
		try {
			const content = await readFile(join(dir, "README.md"), "utf8");
			result.readmeContent = content;
		} catch {
			// Silently ignore missing README even if asset flag was true (race condition).
		}
	}

	return result;
}

/** Registers the `show` sub-command on the given command group. */
export function registerShow(group: Command, format: () => "human" | "json"): void {
	group
		.command("show <domain> <action>")
		.description("Show extension command details")
		.option("--include-readme", "Include README.md content in the output")
		.action(async (domain: string, action: string, options: { includeReadme?: boolean }) => {
			renderOutput(await handleCommandShow(domain, action, options.includeReadme), format());
		});
}
