import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { resolveEntryFile } from "../../engine/runtime-meta.js";

/**
 * Represents the loaded contents of a command package source directory.
 */
export interface CommandPackageSource {
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
}

/**
 * Error result returned when a command package fails to load.
 */
export interface LoadError {
	success: false;
	error: {
		code: string;
		message: string;
	};
}

/**
 * Type guard that narrows a load result to a {@link LoadError}.
 */
export function isLoadError(result: CommandPackageSource | LoadError): result is LoadError {
	return "success" in result && result.success === false;
}

/**
 * Loads a command package from a source directory.
 * Reads manifest.json, the runtime-specific entry file, and optional README.md / context.md.
 * Returns a structured load error with code INVALID_PACKAGE for any physical load failure.
 */
export async function loadCommandPackageSource(fromDir: string): Promise<CommandPackageSource | LoadError> {
	let rawManifest: string;
	try {
		rawManifest = await readFile(join(fromDir, "manifest.json"), "utf-8");
	} catch {
		return {
			success: false,
			error: { code: "INVALID_PACKAGE", message: `Cannot read manifest.json from: ${fromDir}` },
		};
	}

	let manifest: unknown;
	try {
		manifest = JSON.parse(rawManifest) as unknown;
	} catch {
		return {
			success: false,
			error: { code: "INVALID_PACKAGE", message: "Invalid JSON in manifest.json" },
		};
	}

	const m = manifest && typeof manifest === "object" ? (manifest as Record<string, unknown>) : {};
	const runtime = (m.runtime as string | undefined) ?? "node";
	const entryFile = resolveEntryFile(runtime);

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

	return {
		manifest,
		code,
		hasReadme,
		hasContext,
		readmeContent,
		contextContent,
	};
}
