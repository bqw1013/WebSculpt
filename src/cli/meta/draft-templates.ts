import { resolveEntryFile } from "../engine/runtime-meta.js";

/**
 * Represents a parsed parameter specification from the --param CLI option.
 */
export interface ParsedParam {
	name: string;
	required: boolean;
	default?: string | number | boolean;
}

export function generateNodeTemplate(params: ParsedParam[]): string {
	const paramLines = params.map((p) => {
		if (p.default !== undefined && typeof p.default === "number") {
			return `\tconst ${p.name} = parseInt(params.${p.name}, 10);`;
		}
		return `\tconst ${p.name} = params.${p.name};`;
	});

	return `// Helper functions can be defined above export default
export default async function(params) {
${paramLines.join("\n")}
	// TODO: implement command logic
	return { ok: true };
}
`;
}

export function generatePlaywrightCliTemplate(params: ParsedParam[]): string {
	const paramLines = params.map((p) => {
		if (p.default !== undefined && typeof p.default === "number") {
			return `\tconst ${p.name} = parseInt(params.${p.name}, 10);`;
		}
		return `\tconst ${p.name} = params.${p.name};`;
	});

	return `// Helper functions can be defined above export default
export default async (page, params) => {
${paramLines.join("\n")}
	// TODO: implement command logic using page
	return { ok: true };
};
`;
}

export function generateShellTemplate(_params: ParsedParam[]): string {
	return `#!/bin/sh
# TODO: implement command logic
exit 0
`;
}

export function generatePythonTemplate(_params: ParsedParam[]): string {
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

export function generateCommandTemplate(runtime: string, params: ParsedParam[]): string {
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

export function generateReadmeTemplate(domain: string, action: string, runtime: string): string {
	return `# ${domain}/${action}

Generated draft for a \`${runtime}\` runtime command.

## Description

TODO: describe what this command does.

## Parameters

TODO: list parameters and their meanings.

## Return Value

TODO: describe the return value structure.

## Usage

\`\`\`
websculpt ${domain} ${action}
\`\`\`

## Common Error Codes

TODO: list common business error codes (e.g., AUTH_REQUIRED, NOT_FOUND, EMPTY_RESULT).
`;
}

export function generateContextTemplate(_domain: string, _action: string): string {
	return `# Context

## Precipitation Background

TODO: when and why this command was precipitated.

## Page Structure

TODO: key URLs, selectors, or interaction sequences.

## Environment Dependencies

TODO: login state, browser config, anti-crawl strategy.

## Failure Signals

TODO: how the page behaves when it changes (e.g., selector returns null, throws DRIFT_DETECTED).

## Repair Clues

TODO: backup plans, alternative entry points.
`;
}

export function generateNextSteps(
	domain: string,
	action: string,
	draftPath: string,
	runtime: string,
): Array<{ action: string; file?: string; command?: string }> {
	const steps: Array<{ action: string; file?: string; command?: string }> = [
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
