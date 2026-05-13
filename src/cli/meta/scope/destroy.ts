import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { Command } from "commander";
import type { MetaCommandResult } from "../../output.js";
import { renderOutput } from "../../output.js";

/** Handles the `scope destroy` command. */
export async function handleScopeDestroy(cwd: string): Promise<MetaCommandResult> {
	const scopePath = join(cwd, ".websculpt", "scope.json");
	if (!existsSync(scopePath)) {
		return {
			success: false,
			error: {
				code: "NO_SCOPE_FOUND",
				message: "No scope found in the current directory.",
			},
		};
	}
	await rm(scopePath);
	const parentDir = dirname(scopePath);
	try {
		// Only remove the .websculpt directory if it is empty.
		await rm(parentDir, { recursive: true });
	} catch {
		// Directory not empty or other error; ignore.
	}
	return {
		success: true,
		message: `Scope destroyed at ${scopePath}`,
	};
}

/** Registers the `scope destroy` sub-command. */
export function registerScopeDestroy(group: Command, format: () => "human" | "json"): void {
	group
		.command("destroy")
		.description("Remove the scope in the current directory")
		.action(async () => {
			renderOutput(await handleScopeDestroy(process.cwd()), format());
		});
}
