import type { Command } from "commander";
import { getFormat } from "../shared.js";
import { registerScopeAdd } from "./add.js";
import { registerScopeDestroy } from "./destroy.js";
import { registerScopeInit } from "./init.js";
import { registerScopeRemove } from "./remove.js";
import { registerScopeShow } from "./show.js";

/** Creates the `scope` sub-command group and registers all scope sub-commands. */
export function registerScopeMeta(program: Command): void {
	const format = (): "human" | "json" => getFormat(program);
	const group = program.command("scope").description("Manage project-level command visibility");

	registerScopeInit(group, format);
	registerScopeDestroy(group, format);
	registerScopeShow(group, format);
	registerScopeAdd(group, format);
	registerScopeRemove(group, format);
}
