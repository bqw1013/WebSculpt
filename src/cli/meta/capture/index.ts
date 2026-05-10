import type { Command } from "commander";
import { getFormat } from "../shared.js";
import { registerCaptureFinalize } from "./finalize.js";
import { registerCaptureNew } from "./new.js";
import { registerCaptureStatus } from "./status.js";
import { registerCaptureValidate } from "./validate.js";

/** Creates the `capture` sub-command group and registers all capture sub-commands. */
export function registerCaptureMeta(program: Command): void {
	const format = (): "human" | "json" => getFormat(program);
	const group = program.command("capture").description("Manage capture workspaces");

	registerCaptureNew(group, format);
	registerCaptureStatus(group, format);
	registerCaptureValidate(group, format);
	registerCaptureFinalize(group, format);
}
