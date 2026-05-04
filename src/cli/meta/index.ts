import type { Command } from "commander";
import { registerCommandMeta } from "./command.js";
import { registerConfigMeta } from "./config.js";
import { registerCreateMeta } from "./create.js";
import { registerDaemonMeta } from "./daemon.js";
import { registerDraftMeta } from "./draft.js";
import { registerSkillMeta } from "./skill.js";
import { registerValidateMeta } from "./validate.js";

/** Registers all meta commands (command, config, skill) on the given program. */
export function registerMetaCommands(program: Command): void {
	registerCommandMeta(program);
	registerCreateMeta(program);
	registerValidateMeta(program);
	registerDraftMeta(program);
	registerConfigMeta(program);
	registerDaemonMeta(program);
	registerSkillMeta(program);
}
