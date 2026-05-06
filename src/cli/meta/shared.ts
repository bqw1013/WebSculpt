import type { Command } from "commander";
import type { OutputFormat } from "../output.js";

/**
 * Retrieves the output format from the program's parsed options.
 * Defaults to "human" if not specified.
 */
export function getFormat(program: Command): OutputFormat {
	return program.opts().format;
}
