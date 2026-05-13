import type { Command } from "commander";
import { registerCaptureMeta } from "./capture/index.js";
import { registerCommandMeta } from "./command/index.js";
import { registerConfigMeta } from "./config.js";
import { registerDaemonMeta } from "./daemon.js";
import { registerScopeMeta } from "./scope/index.js";
import { registerSkillMeta } from "./skill.js";

/** Set of all meta command names registered by this module. */
export const META_COMMAND_NAMES = new Set(["command", "config", "daemon", "skill", "capture", "scope"]);

/** Registers all meta commands (command, config, daemon, skill, scope) on the given program. */
export function registerMetaCommands(program: Command): void {
	registerCommandMeta(program);
	registerConfigMeta(program);
	registerDaemonMeta(program);
	registerSkillMeta(program);
	registerCaptureMeta(program);
	registerScopeMeta(program);
}
