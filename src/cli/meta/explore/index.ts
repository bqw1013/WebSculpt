import type { Command } from "commander";
import { getFormat } from "../shared.js";
import { registerExploreAssess } from "./assess.js";
import { registerExploreNew } from "./new.js";

/** Creates the `explore` sub-command group and registers all explore sub-commands. */
export function registerExploreMeta(program: Command): void {
	const format = (): "human" | "json" => getFormat(program);
	const group = program.command("explore").description("Manage explore workspaces");

	registerExploreNew(group, format);
	registerExploreAssess(group, format);
}
