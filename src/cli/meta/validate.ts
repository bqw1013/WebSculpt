import { readFile } from "fs/promises";
import { join } from "path";
import { RESERVED_DOMAINS } from "../engine/registry.js";
import type { MetaCommandResult } from "../output.js";
import { validateCommandPackage } from "./command-validation.js";

function resolveEntryFile(runtime: string | undefined): string {
	switch (runtime) {
		case "shell":
			return "command.sh";
		case "python":
			return "command.py";
		default:
			return "command.js";
	}
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

	// Read manifest.json
	let rawManifest: string;
	try {
		rawManifest = await readFile(join(fromDir, "manifest.json"), "utf-8");
	} catch {
		return {
			success: false,
			error: {
				code: "INVALID_PACKAGE",
				message: `Cannot read manifest.json from: ${fromDir}`,
			},
		};
	}

	let manifest: unknown;
	try {
		manifest = JSON.parse(rawManifest) as unknown;
	} catch {
		return {
			success: false,
			error: {
				code: "INVALID_PACKAGE",
				message: "Invalid JSON in manifest.json",
			},
		};
	}

	// Determine runtime and entry file
	const m = manifest && typeof manifest === "object" ? (manifest as Record<string, unknown>) : {};
	const runtime = (m.runtime as string | undefined) ?? "node";
	const entryFile = resolveEntryFile(runtime);

	// Read entry file code
	let code: string;
	try {
		code = await readFile(join(fromDir, entryFile), "utf-8");
	} catch {
		return {
			success: false,
			error: {
				code: "INVALID_PACKAGE",
				message: `Entry file "${entryFile}" not found in source directory`,
			},
		};
	}

	// Check auxiliary file presence
	let hasReadme = false;
	let hasContext = false;
	let readmeContent: string | undefined;
	let contextContent: string | undefined;
	try {
		readmeContent = await readFile(join(fromDir, "README.md"), "utf-8");
		hasReadme = true;
	} catch {
		// README.md not present
	}
	try {
		contextContent = await readFile(join(fromDir, "context.md"), "utf-8");
		hasContext = true;
	} catch {
		// context.md not present
	}

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
