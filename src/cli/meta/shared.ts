import type { Command } from "commander";
import type { OutputFormat } from "../output.js";

/** Root directory for all project-local WebSculpt workspace data. */
export const WORKSPACE_ROOT = ".websculpt";

/** Subdirectory for explore workspaces. */
export const EXPLORE_DIR = "explores";

/** Subdirectory for capture workspaces. */
export const CAPTURE_DIR = "captures";

/**
 * Retrieves the output format from the program's parsed options.
 * Defaults to "human" if not specified.
 */
export function getFormat(program: Command): OutputFormat {
	return program.opts().format;
}
