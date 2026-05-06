import type { Command } from "commander";
import { getFormat } from "../shared.js";
import { registerCreate } from "./create.js";
import { registerDraft } from "./draft.js";
import { registerList } from "./list.js";
import { registerRemove } from "./remove.js";
import { registerShow } from "./show.js";
import { registerValidate } from "./validate.js";

/** Creates the `command` sub-command group and registers all its sub-commands. */
export function registerCommandMeta(program: Command): void {
	const format = (): "human" | "json" => getFormat(program);
	const group = program.command("command").description("Manage extension command registry");

	registerList(group, format);
	registerShow(group, format);
	registerRemove(group, format);
	registerCreate(group, format);
	registerValidate(group, format);
	registerDraft(group, format);
}
