import { access, constants, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Command } from "commander";
import type { ExploreNewResult, MetaCommandResult } from "../../output.js";
import { renderOutput } from "../../output.js";
import { generateTraceTemplate } from "./lib/explore-draft.js";
import { type ExploreYaml, getExploreWorkspacePath, writeExploreYaml } from "./lib/explore-io.js";

const VALID_EXPLORE_NAME = /^[a-z0-9-]+$/;

/** Options accepted by the `explore new` command handler. */
export interface ExploreNewOptions {
	intent?: string;
	force?: boolean;
}

/**
 * Creates an explore workspace with metadata and a trace template.
 */
export async function handleExploreNew(name: string, options: ExploreNewOptions): Promise<MetaCommandResult> {
	try {
		if (!VALID_EXPLORE_NAME.test(name)) {
			return {
				success: false,
				error: {
					code: "INVALID_EXPLORE_NAME",
					message: `Explore name "${name}" must match ^[a-z0-9-]+$`,
				},
			};
		}

		const intent = options.intent;
		if (!intent) {
			return {
				success: false,
				error: {
					code: "MISSING_REQUIRED_OPTION",
					message: "--intent is required",
				},
			};
		}

		const workspacePath = getExploreWorkspacePath(name);

		try {
			await access(workspacePath, constants.F_OK);
			if (!options.force) {
				return {
					success: false,
					error: {
						code: "EXPLORE_ALREADY_EXISTS",
						message: `Explore workspace already exists: ${workspacePath}. Use --force to overwrite.`,
					},
				};
			}
			await rm(workspacePath, { recursive: true, force: true });
		} catch (err: unknown) {
			const code = (err as NodeJS.ErrnoException).code;
			if (code !== "ENOENT") {
				throw err;
			}
		}

		const metadata: ExploreYaml = {
			name,
			intent,
			createdAt: new Date().toISOString(),
			schema: "explore-trace",
		};

		await mkdir(workspacePath, { recursive: true });
		await writeExploreYaml(join(workspacePath, "explore.yaml"), metadata);
		await writeFile(join(workspacePath, "trace.md"), generateTraceTemplate(), "utf8");

		const result: ExploreNewResult = {
			success: true,
			explore: {
				name,
				path: workspacePath,
				intent,
			},
			next: `websculpt explore assess ${name}`,
		};
		return result;
	} catch (err: unknown) {
		const message = err instanceof Error ? err.message : String(err);
		return {
			success: false,
			error: { code: "EXPLORE_NEW_ERROR", message },
		};
	}
}

/** Registers the `explore new` sub-command on the explore command group. */
export function registerExploreNew(group: Command, format: () => "human" | "json"): void {
	group
		.command("new <name>")
		.description("Create an explore workspace")
		.requiredOption("--intent <intent>", "Description of the exploration goal")
		.option("--force", "Overwrite an existing explore workspace")
		.action(async (name: string, options: ExploreNewOptions) => {
			renderOutput(await handleExploreNew(name, options), format());
		});
}
