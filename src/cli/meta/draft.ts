import { access, mkdir, readFile, rm, writeFile } from "fs/promises";
import { join, resolve } from "path";
import type { CommandParameter, CommandRuntime, ValidationDetail } from "../../types/index.js";
import type { MetaCommandResult } from "../output.js";

const RESERVED_DOMAINS = new Set(["command", "config"]);
const VALID_RUNTIMES: CommandRuntime[] = ["node", "playwright-cli", "shell", "python"];

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

interface ParsedParam {
	name: string;
	required: boolean;
	default?: string | number | boolean;
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

function resolveEntryFile(runtime: string): string {
	switch (runtime) {
		case "shell":
			return "command.sh";
		case "python":
			return "command.py";
		default:
			return "command.js";
	}
}

function generateNodeTemplate(params: ParsedParam[]): string {
	const paramLines = params.map((p) => {
		if (p.default !== undefined) {
			if (typeof p.default === "number") {
				return `\tconst ${p.name} = parseInt(params.${p.name}, 10);`;
			}
			return `\tconst ${p.name} = params.${p.name} ?? ${JSON.stringify(p.default)};`;
		}
		return `\tconst ${p.name} = params.${p.name};`;
	});

	return `export default async function(params) {
	/* PARAMS_INJECT */
${paramLines.join("\n")}
	// TODO: implement command logic
	return { ok: true };
}
`;
}

function generatePlaywrightCliTemplate(params: ParsedParam[]): string {
	const paramLines = params.map((p) => {
		if (p.default !== undefined) {
			if (typeof p.default === "number") {
				return `\tconst ${p.name} = parseInt(params.${p.name}, 10);`;
			}
			return `\tconst ${p.name} = params.${p.name} ?? ${JSON.stringify(p.default)};`;
		}
		return `\tconst ${p.name} = params.${p.name};`;
	});

	return `/* PARAMS_INJECT */
async function (page) {
${paramLines.join("\n")}
	// TODO: implement command logic using page
	return { ok: true };
}
`;
}

function generateShellTemplate(_params: ParsedParam[]): string {
	return `#!/bin/sh
# TODO: implement command logic
exit 0
`;
}

function generatePythonTemplate(_params: ParsedParam[]): string {
	return `import sys

def run(params):
    # TODO: implement command logic
    return {"ok": True}

if __name__ == "__main__":
    import json
    params = json.loads(sys.argv[1]) if len(sys.argv) > 1 else {}
    result = run(params)
    print(json.dumps(result))
`;
}

function generateCommandTemplate(runtime: string, params: ParsedParam[]): string {
	switch (runtime) {
		case "playwright-cli":
			return generatePlaywrightCliTemplate(params);
		case "shell":
			return generateShellTemplate(params);
		case "python":
			return generatePythonTemplate(params);
		default:
			return generateNodeTemplate(params);
	}
}

function generateReadmeTemplate(domain: string, action: string, runtime: string): string {
	return `# ${domain}/${action}

Generated draft for a \`${runtime}\` runtime command.

## Description

TODO: describe what this command does.

## Parameters

TODO: list parameters and their meanings.

## Usage

\`\`\`
websculpt ${domain} ${action}
\`\`\`
`;
}

function generateContextTemplate(_domain: string, _action: string): string {
	return `# Context

TODO: add any additional context, design notes, or implementation guidance here.
`;
}

function generateNextSteps(domain: string, action: string, draftPath: string, runtime: string): DraftResult["nextSteps"] {
	const steps: DraftResult["nextSteps"] = [
		{ action: "Edit the command entry file to implement your logic", file: resolveEntryFile(runtime) },
		{ action: "Update manifest.json with description and any additional metadata", file: "manifest.json" },
		{ action: "Update README.md with command description and parameters", file: "README.md" },
		{ action: "Add any design notes or context to context.md", file: "context.md" },
		{
			action: "Validate the draft before creating",
			command: `websculpt command validate --from-dir "${draftPath}"`,
		},
		{
			action: "Create the command from the draft",
			command: `websculpt command create ${domain} ${action} --from-dir "${draftPath}"`,
		},
	];
	if (runtime === "shell" || runtime === "python") {
		steps.push({
			action: `Note: the "${runtime}" runtime is not yet executable by the CLI; only "node" and "playwright-cli" commands can be run`,
		});
	}
	return steps;
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

		const draftDir = options.to
			? resolve(options.to)
			: resolve(".websculpt-drafts", `${domain}-${action}`);

		// Check if directory already exists
		try {
			await access(draftDir);
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
		} catch {
			// Directory does not exist, proceed.
		}

		await mkdir(draftDir, { recursive: true });

		// Parse parameters
		const rawParams = options.param ?? [];
		const parsedParams: ParsedParam[] = rawParams.map(parseParamSpec);
		const parameters: CommandParameter[] = parsedParams;

		// Generate manifest (without identity fields)
		const manifest: Record<string, unknown> = {
			runtime,
			parameters: parameters.length > 0 ? parameters : [],
		};

		// Generate files
		const entryFile = resolveEntryFile(runtime);
		const commandCode = generateCommandTemplate(runtime, parsedParams);
		const readme = generateReadmeTemplate(domain, action, runtime);
		const context = generateContextTemplate(domain, action);

		await writeFile(join(draftDir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
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
