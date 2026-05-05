import { access, constants, mkdir, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { Command } from "commander";
import type { CommandParameter, CommandRuntime, ValidationDetail } from "../../../types/index.js";
import { RESERVED_DOMAINS } from "../../engine/registry.js";
import { resolveEntryFile, VALID_RUNTIMES } from "../../engine/runtime-meta.js";
import type { MetaCommandResult } from "../../output.js";
import { renderOutput } from "../../output.js";
import type { ParsedParam } from "../lib/draft-templates.js";
import {
	generateCommandTemplate,
	generateContextTemplate,
	generateNextSteps,
	generateReadmeTemplate,
} from "../lib/draft-templates.js";

function collectOption(value: string, previous: string[]): string[] {
	return previous.concat([value]);
}

export interface DraftOptions {
	runtime?: string;
	to?: string;
	param?: string[];
	force?: boolean;
}

export interface DraftResult {
	success: true;
	draftPath: string;
	files: string[];
	runtime: string;
	nextSteps: Array<{
		action: string;
		file?: string;
		command?: string;
	}>;
}

/**
 * Parses a --param spec string into a structured parameter definition.
 * Supports: name:required, name:default=value
 */
export function parseParamSpec(spec: string): ParsedParam {
	const colonIndex = spec.indexOf(":");
	if (colonIndex === -1) {
		return { name: spec.trim(), required: false };
	}

	const name = spec.slice(0, colonIndex).trim();
	const rest = spec.slice(colonIndex + 1);

	if (rest === "required") {
		return { name, required: true };
	}

	if (rest.startsWith("default=")) {
		const rawValue = rest.slice("default=".length);
		const defaultValue = parseDefaultValue(rawValue);
		return { name, required: false, default: defaultValue };
	}

	return { name, required: false };
}

function parseDefaultValue(raw: string): string | number | boolean {
	if (raw === "true") return true;
	if (raw === "false") return false;
	const num = Number(raw);
	if (!Number.isNaN(num) && raw.trim() !== "") return num;
	return raw;
}

/**
 * Generates a compliant command skeleton directory for later consumption
 * by `command create --from-dir`.
 */
export async function handleCommandDraft(
	domain: string,
	action: string,
	options: DraftOptions,
): Promise<MetaCommandResult> {
	try {
		if (RESERVED_DOMAINS.has(domain)) {
			return {
				success: false,
				error: {
					code: "RESERVED_DOMAIN",
					message: `Domain "${domain}" is reserved for meta commands`,
				},
			};
		}

		const runtime: CommandRuntime =
			options.runtime && VALID_RUNTIMES.includes(options.runtime as CommandRuntime)
				? (options.runtime as CommandRuntime)
				: "node";

		const draftDir = options.to ? resolve(options.to) : resolve(".websculpt-drafts", `${domain}-${action}`);

		// Check if directory already exists
		try {
			await access(draftDir, constants.F_OK);
			if (!options.force) {
				return {
					success: false,
					error: {
						code: "ALREADY_EXISTS",
						message: `Draft directory already exists: ${draftDir}. Use --force to overwrite.`,
					},
				};
			}
			await rm(draftDir, { recursive: true, force: true });
		} catch (err: unknown) {
			const code = (err as NodeJS.ErrnoException).code;
			if (code !== "ENOENT") {
				throw err;
			}
			// Directory does not exist, proceed.
		}

		await mkdir(draftDir, { recursive: true });

		// Parse parameters
		const rawParams = options.param ?? [];
		const parsedParams: ParsedParam[] = rawParams.map(parseParamSpec);
		const parameters: CommandParameter[] = parsedParams.map((p) => ({
			name: p.name,
			required: p.required,
			default: p.default,
		}));

		// Generate manifest (without identity fields)
		const manifest: Record<string, unknown> = {
			runtime,
			description: "",
			parameters: parameters.length > 0 ? parameters : [],
			requiresBrowser: runtime === "playwright-cli",
			authRequired: "unknown",
		};

		// Generate files
		const entryFile = resolveEntryFile(runtime);
		const commandCode = generateCommandTemplate(runtime, parsedParams);
		const readme = generateReadmeTemplate(domain, action, runtime);
		const context = generateContextTemplate(domain, action);

		await writeFile(join(draftDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
		await writeFile(join(draftDir, entryFile), commandCode);
		await writeFile(join(draftDir, "README.md"), readme);
		await writeFile(join(draftDir, "context.md"), context);

		const files = ["manifest.json", entryFile, "README.md", "context.md"];
		const nextSteps = generateNextSteps(domain, action, draftDir, runtime);
		const warnings: ValidationDetail[] = [];
		if (runtime === "shell" || runtime === "python") {
			warnings.push({
				code: "RUNTIME_NOT_EXECUTABLE",
				message: `The "${runtime}" runtime is not yet executable by the CLI. Only "node" and "playwright-cli" commands can be run at this time.`,
				level: "warning",
			});
		}

		return {
			success: true,
			draftPath: draftDir,
			files,
			runtime,
			nextSteps,
			warnings: warnings.length > 0 ? warnings : undefined,
		} as DraftResult;
	} catch (err: unknown) {
		const message = err instanceof Error ? err.message : String(err);
		return {
			success: false,
			error: { code: "DRAFT_ERROR", message },
		};
	}
}

/** Registers the `draft` sub-command on the given command group. */
export function registerDraft(group: Command, format: () => "human" | "json"): void {
	group
		.command("draft <domain> <action>")
		.description("Generate a command skeleton directory")
		.option("--runtime <runtime>", "Runtime: node, playwright-cli, shell, python (default: node)")
		.option("--to <path>", "Custom output directory")
		.option("--param <spec>", "Declare a parameter (repeatable)", collectOption, [])
		.option("--force", "Overwrite existing draft directory")
		.action(
			async (
				domain: string,
				action: string,
				options: { runtime?: string; to?: string; param: string[]; force?: boolean },
			) => {
				renderOutput(await handleCommandDraft(domain, action, options), format());
			},
		);
}
