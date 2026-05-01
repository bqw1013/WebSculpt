import type { ValidationDetail } from "../../types/index.js";

const VALID_RUNTIMES = new Set<string>(["node", "shell", "python", "playwright-cli"]);

const TEMP_REF_REGEX = /\be\d+\b/g;
const BROWSER_KEYWORDS = ["launch", "connect", "connectOverCDP", "newBrowser", "chrome-remote-interface"];
const INLINE_IMPORT_REGEX = /await\s+import\s*\(/;
const EXPORT_DEFAULT_REGEX = /export\s+default/;
const EXPORT_COMMAND_REGEX = /export\s+(?:(?:const|let|var)\s+command|(?:async\s+)?function\s+command)\b/;
const PARAM_ACCESS_REGEX = /params\.([a-zA-Z_$][a-zA-Z0-9_$]*)/g;

function addError(details: ValidationDetail[], code: string, message: string): void {
	details.push({ code, message, level: "error" });
}

function addWarning(details: ValidationDetail[], code: string, message: string): void {
	details.push({ code, message, level: "warning" });
}

function checkJsSyntax(code: string, runtime: string): ValidationDetail | null {
	if (runtime !== "node" && runtime !== "playwright-cli") {
		return null;
	}
	let trial: string;
	if (/^export\s+default\s+/s.test(code)) {
		trial = `return (${code.replace(/^export\s+default\s+/s, "")})`;
	} else if (/^export\s+(?:const|let|var)\s+command\s*=\s*/s.test(code)) {
		const expr = code.replace(/^export\s+(?:const|let|var)\s+command\s*=\s*/s, "").replace(/;\s*$/s, "");
		trial = `return (${expr})`;
	} else if (/^export\s+(?:async\s+)?function\s+command\s*\(/s.test(code)) {
		trial = `return (${code.replace(/^export\s+/s, "")})`;
	} else {
		trial = `return (${code})`;
	}
	try {
		// eslint-disable-next-line no-new-func
		new Function(trial);
		return null;
	} catch (err) {
		if (err instanceof SyntaxError) {
			return {
				code: "INVALID_JS_SYNTAX",
				message: `Invalid JavaScript syntax: ${err.message}`,
				level: "error",
			};
		}
		return null;
	}
}

function validateL1Structure(
	manifest: Record<string, unknown>,
	details: ValidationDetail[],
	expectedDomain: string | undefined,
	expectedAction: string | undefined,
): void {
	const runtime = manifest.runtime ?? "node";
	if (typeof runtime !== "string" || !VALID_RUNTIMES.has(runtime)) {
		addError(details, "INVALID_RUNTIME", `Runtime must be one of: ${[...VALID_RUNTIMES].join(", ")}`);
	}

	const id = manifest.id;
	const domain = manifest.domain;
	const action = manifest.action;

	if (expectedDomain !== undefined && expectedAction !== undefined) {
		// Full injection simulation mode: missing fields are warnings, mismatches are errors.
		if (id === undefined || id === null || id === "") {
			addWarning(details, "MISSING_IDENTITY_FIELDS", "Manifest is missing 'id' (will be injected on create)");
		} else if (typeof id !== "string" || id !== `${expectedDomain}-${expectedAction}`) {
			addError(details, "ID_MISMATCH", `Manifest id "${id}" does not match "${expectedDomain}-${expectedAction}"`);
		}

		if (domain === undefined || domain === null || domain === "") {
			addWarning(details, "MISSING_IDENTITY_FIELDS", "Manifest is missing 'domain' (will be injected on create)");
		} else if (typeof domain !== "string" || domain !== expectedDomain) {
			addError(details, "ID_MISMATCH", `Manifest domain "${domain}" does not match expected "${expectedDomain}"`);
		}

		if (action === undefined || action === null || action === "") {
			addWarning(details, "MISSING_IDENTITY_FIELDS", "Manifest is missing 'action' (will be injected on create)");
		} else if (typeof action !== "string" || action !== expectedAction) {
			addError(details, "ID_MISMATCH", `Manifest action "${action}" does not match expected "${expectedAction}"`);
		}
	} else {
		// Preflight mode without domain/action: missing fields are a single warning.
		const missing: string[] = [];
		if (id === undefined || id === null || (typeof id === "string" && id.trim().length === 0)) {
			missing.push("id");
		}
		if (domain === undefined || domain === null || (typeof domain === "string" && domain.trim().length === 0)) {
			missing.push("domain");
		}
		if (action === undefined || action === null || (typeof action === "string" && action.trim().length === 0)) {
			missing.push("action");
		}

		if (missing.length > 0) {
			addWarning(details, "MISSING_IDENTITY_FIELDS", `Manifest is missing identity field(s): ${missing.join(", ")}`);
		}

		// When all identity fields are present, validate consistency.
		if (missing.length === 0 && typeof id === "string" && typeof domain === "string" && typeof action === "string") {
			if (id !== `${domain}-${action}`) {
				addError(details, "ID_MISMATCH", `Manifest id "${id}" does not match "${domain}-${action}"`);
			}
		}
	}

	// Description validation
	if (typeof manifest.description !== "string" || manifest.description.trim().length === 0) {
		addError(details, "MISSING_DESCRIPTION", "Manifest 'description' must be a non-empty string");
	}

	// Prerequisites validation
	const prerequisites = manifest.prerequisites;
	if (prerequisites !== undefined) {
		if (!Array.isArray(prerequisites)) {
			addError(details, "INVALID_PREREQUISITES", "Manifest 'prerequisites' must be an array of strings");
		} else {
			for (let i = 0; i < prerequisites.length; i++) {
				if (typeof prerequisites[i] !== "string") {
					addError(
						details,
						"INVALID_PREREQUISITES",
						`Manifest 'prerequisites' must be an array of strings; element at index ${i} is not a string`,
					);
					break;
				}
			}
		}
	}

	// Parameter validation
	const parameters = manifest.parameters;
	if (parameters !== undefined) {
		if (!Array.isArray(parameters)) {
			addError(details, "INVALID_PARAMETERS", "Manifest 'parameters' must be an array");
		} else {
			const seenNames = new Set<string>();
			for (let i = 0; i < parameters.length; i++) {
				const param = parameters[i];
				if (param === null || typeof param !== "object") {
					addError(details, "INVALID_PARAMETERS", `Parameter at index ${i} must be an object`);
					continue;
				}
				const p = param as Record<string, unknown>;
				if (typeof p.name !== "string" || p.name.trim().length === 0) {
					addError(details, "MISSING_PARAM_NAME", `Parameter at index ${i} is missing a valid 'name'`);
				} else {
					if (seenNames.has(p.name)) {
						addError(details, "DUPLICATE_PARAM_NAME", `Duplicate parameter name: "${p.name}"`);
					}
					seenNames.add(p.name);
				}

				if (p.default !== undefined) {
					const t = typeof p.default;
					if (t !== "string" && t !== "number" && t !== "boolean") {
						addError(
							details,
							"INVALID_PARAM_DEFAULT",
							`Parameter "${p.name ?? `"index ${i}`}" default must be a string, number, or boolean`,
						);
					}
				}
			}
		}
	}
}

function validateL2Compliance(code: string, runtime: string, details: ValidationDetail[]): void {
	if (TEMP_REF_REGEX.test(code)) {
		addError(details, "TEMP_REF_FOUND", "Command code contains temporary snapshot references (e.g., e1, e15)");
	}
	for (const keyword of BROWSER_KEYWORDS) {
		// Allow connectOverCDP in playwright-cli runtime only if it appears in runner docs,
		// but command code should never create its own browser connection.
		// The runner now owns the CDP connection, so we narrow the check for playwright-cli.
		if (runtime === "playwright-cli" && keyword === "connectOverCDP") {
			continue;
		}
		// Simple word-boundary check to avoid false positives in substrings.
		const regex = new RegExp(`\\b${keyword}\\b`);
		if (regex.test(code)) {
			addError(
				details,
				"BROWSER_CONNECTION_FORBIDDEN",
				`Command code contains forbidden browser connection keyword: "${keyword}"`,
			);
		}
	}
	if (INLINE_IMPORT_REGEX.test(code)) {
		addError(details, "INLINE_IMPORT_FORBIDDEN", "Command code contains inline dynamic import (`await import(...)`)");
	}
}

function validateL3Contract(manifest: Record<string, unknown>, code: string, details: ValidationDetail[]): void {
	const runtime = (manifest.runtime ?? "node") as string;

	// Syntax check for JS-based runtimes.
	const syntaxError = checkJsSyntax(code, runtime);
	if (syntaxError) {
		details.push(syntaxError);
	}

	if (runtime === "node") {
		if (!EXPORT_DEFAULT_REGEX.test(code) && !EXPORT_COMMAND_REGEX.test(code)) {
			addError(
				details,
				"MISSING_EXPORT_DEFAULT",
				"Node runtime command must contain `export default` or `export const command` / `export function command`",
			);
		}
	}

	// Parameter consistency check (warning level).
	const parameters = manifest.parameters;
	const declaredNames = new Set<string>();
	if (Array.isArray(parameters)) {
		for (const param of parameters) {
			if (param && typeof param === "object" && typeof (param as Record<string, unknown>).name === "string") {
				declaredNames.add((param as Record<string, unknown>).name as string);
			}
		}
	}
	const paramMatches = code.matchAll(PARAM_ACCESS_REGEX);
	const usedNames = new Set<string>();
	for (const match of paramMatches) {
		usedNames.add(match[1]);
	}
	for (const name of usedNames) {
		if (!declaredNames.has(name)) {
			addWarning(
				details,
				"UNDECLARED_PARAM",
				`Code accesses params.${name} but it is not declared in manifest.parameters`,
			);
		}
	}
}

function validateAssets(hasReadme: boolean, hasContext: boolean, details: ValidationDetail[]): void {
	if (!hasReadme) {
		addWarning(details, "MISSING_README", "README.md is missing from the command package");
	}
	if (!hasContext) {
		addWarning(details, "MISSING_CONTEXT", "context.md is missing from the command package");
	}
}

const EXPECTED_README_SECTIONS = ["## Description", "## Parameters", "## Usage"];
const EXPECTED_CONTEXT_SECTIONS = [
	"## Precipitation Background",
	"## Page Structure",
	"## Environment Dependencies",
	"## Failure Signals",
];

function validateDocumentContent(
	readmeContent: string | undefined,
	contextContent: string | undefined,
	details: ValidationDetail[],
): void {
	if (readmeContent !== undefined) {
		for (const section of EXPECTED_README_SECTIONS) {
			if (!readmeContent.includes(section)) {
				addWarning(details, "MISSING_README_SECTION", `README.md is missing expected section: ${section.slice(3)}`);
			}
		}
	}

	if (contextContent !== undefined) {
		for (const section of EXPECTED_CONTEXT_SECTIONS) {
			if (!contextContent.includes(section)) {
				addWarning(
					details,
					"MISSING_CONTEXT_SECTION",
					`context.md is missing expected section: ${section.slice(3)}`,
				);
			}
		}
	}
}

export interface ValidateCommandPackageInput {
	/** Raw parsed manifest (may be any JSON value). */
	manifest: unknown;
	/** Command source code as a string. */
	code: string;
	/** Whether README.md exists in the source directory. */
	hasReadme: boolean;
	/** Whether context.md exists in the source directory. */
	hasContext: boolean;
	/** Content of README.md for content-quality checks. */
	readmeContent?: string;
	/** Content of context.md for content-quality checks. */
	contextContent?: string;
	/** Expected domain when validating for create/install. */
	expectedDomain?: string;
	/** Expected action when validating for create/install. */
	expectedAction?: string;
}

/**
 * Performs layered validation on a command package.
 *
 * L1: Structure validation (manifest shape, types, consistency).
 * L2: Compliance validation (prohibited code patterns).
 * L3: Contract validation (runtime-specific code requirements).
 * Assets: Completeness warnings for README.md and context.md.
 *
 * Returns a flat array of validation details. Callers determine success/failure
 * by checking for any "error"-level detail.
 */
export function validateCommandPackage(input: ValidateCommandPackageInput): ValidationDetail[] {
	const details: ValidationDetail[] = [];

	if (input.manifest === null || typeof input.manifest !== "object") {
		addError(details, "INVALID_MANIFEST", "Manifest must be a non-null object");
		return details;
	}

	const manifest = input.manifest as Record<string, unknown>;

	validateL1Structure(manifest, details, input.expectedDomain, input.expectedAction);
	validateL2Compliance(input.code, (manifest.runtime ?? "node") as string, details);
	validateL3Contract(manifest, input.code, details);
	validateAssets(input.hasReadme, input.hasContext, details);
	validateDocumentContent(input.readmeContent, input.contextContent, details);

	return details;
}
