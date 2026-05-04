import type { Command } from "commander";
import { RESERVED_DOMAINS } from "../engine/registry.js";
import type { MetaCommandResult } from "../output.js";
import { renderOutput } from "../output.js";
import { validateCommandPackage } from "./command-validation.js";
import { isLoadError, loadCommandPackageSource } from "./package-loader.js";

function getCommandMetaGroup(program: Command): Command {
	const existing = program.commands.find((c) => c.name() === "command");
	if (existing) return existing;
	return program.command("command").description("Manage extension command registry");
}

/**
 * Validates a command directory without installing it.
 *
 * When domain and action are provided, simulates the full create injection logic
 * and performs reserved-domain checks.
 */
export async function handleCommandValidate(
	fromDir: string,
	domain?: string,
	action?: string,
): Promise<MetaCommandResult> {
	if (domain !== undefined && RESERVED_DOMAINS.has(domain)) {
		return {
			success: false,
			error: {
				code: "RESERVED_DOMAIN",
				message: `Domain "${domain}" is reserved for meta commands`,
			},
		};
	}

	const loaded = await loadCommandPackageSource(fromDir);
	if (isLoadError(loaded)) {
		return loaded;
	}
	const { manifest, code, hasReadme, hasContext, readmeContent, contextContent } = loaded;

	const details = validateCommandPackage({
		manifest,
		code,
		hasReadme,
		hasContext,
		readmeContent,
		contextContent,
		expectedDomain: domain,
		expectedAction: action,
	});

	const errors = details.filter((d) => d.level === "error");
	const warnings = details.filter((d) => d.level === "warning");

	if (errors.length > 0) {
		return {
			success: false,
			error: {
				code: "VALIDATION_ERROR",
				message: `Validation failed with ${errors.length} error(s)`,
				details: errors,
			},
		};
	}

	return {
		success: true,
		warnings: warnings.length > 0 ? warnings : undefined,
	};
}

/** Registers the `command validate` sub-command on the given program. */
export function registerValidateMeta(program: Command): void {
	const format = (): "human" | "json" => program.opts().format;
	const cmd = getCommandMetaGroup(program);
	cmd.command("validate")
		.description("Validate a command directory without installing")
		.requiredOption("--from-dir <path>", "Path to the command source directory")
		.argument("[domain]", "Optional domain to simulate injection")
		.argument("[action]", "Optional action to simulate injection")
		.action(async (domain: string | undefined, action: string | undefined, options: { fromDir: string }) => {
			renderOutput(await handleCommandValidate(options.fromDir, domain, action), format());
		});
}
