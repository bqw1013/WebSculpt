import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { CommandManifest, CommandRuntime } from "../../../../types/index.js";
import { resolveEntryFile, runtimeRequiresBrowser } from "../../../runtime/index.js";
import { generateCommandTemplate, generateContextTemplate, generateReadmeTemplate } from "../../lib/draft-templates.js";
import { type CaptureYaml, getCaptureDraftPath } from "./capture-io.js";

/** Identity mismatch found between capture metadata and the draft manifest. */
export interface CaptureDraftIdentityMismatch {
	field: "domain" | "action" | "runtime";
	expected: string;
	actual: unknown;
	message: string;
}

/** Result of reading and checking the draft manifest. */
export interface CaptureDraftManifestInspection {
	content: string;
	invalidReason?: string;
	manifest?: Record<string, unknown>;
	mismatch?: CaptureDraftIdentityMismatch;
}

/**
 * Reads `draft/manifest.json` and compares its identity fields with capture metadata.
 */
export async function inspectCaptureDraftManifest(
	draftPath: string,
	captureYaml: CaptureYaml,
): Promise<CaptureDraftManifestInspection> {
	let content: string;
	try {
		content = await readFile(join(draftPath, "manifest.json"), "utf8");
	} catch {
		return {
			content: "",
			invalidReason: "Manifest file not found",
		};
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(content) as unknown;
	} catch (err: unknown) {
		const message = err instanceof Error ? err.message : String(err);
		return {
			content,
			invalidReason: `Manifest JSON is invalid: ${message}`,
		};
	}

	if (!isRecord(parsed)) {
		return {
			content,
			invalidReason: "Manifest JSON must be an object",
		};
	}

	return {
		content,
		manifest: parsed,
		mismatch: findCaptureDraftIdentityMismatch(captureYaml, parsed),
	};
}

/**
 * Computes a stable hash for draft files whose contents are covered by validation.
 */
export async function computeCaptureDraftFingerprint(
	name: string,
	captureYaml: CaptureYaml,
	baseDir = process.cwd(),
): Promise<string> {
	const draftPath = getCaptureDraftPath(name, baseDir);
	const files = ["manifest.json", resolveEntryFile(captureYaml.runtime), "README.md", "context.md"];
	const hash = createHash("sha256");

	hash.update(
		JSON.stringify({ domain: captureYaml.domain, action: captureYaml.action, runtime: captureYaml.runtime }),
	);
	hash.update("\0");
	for (const file of files) {
		hash.update(file);
		hash.update("\0");
		try {
			hash.update(await readFile(join(draftPath, file), "utf8"));
		} catch (err: unknown) {
			const code = isNodeError(err) ? err.code : "UNKNOWN";
			hash.update(`missing:${code}`);
		}
		hash.update("\0");
	}

	return hash.digest("hex");
}

/**
 * Generates the initial evidence document with mandatory audit headings.
 */
export function generateEvidenceTemplate(metadata: CaptureYaml): string {
	return `# Evidence: ${metadata.domain}/${metadata.action}

This document records the research and validation evidence for the \`${metadata.domain}/${metadata.action}\` command.

## Exploration Path

<!-- Record command library overlap checks and the guide or tool contract you consulted. -->

## Verified URLs

<!-- List each URL that was actually visited and used for extraction. -->

## Structural Evidence

<!-- Record DOM selectors, JSON fields, API shapes, or other structural facts. -->

## Failure Signals

<!-- Describe known failure modes, dependencies, and drift signals. -->

## Capture Assessment

<!-- State whether this command should be captured and why. -->
`;
}

/**
 * Writes the initial draft skeleton files (manifest, command entry, README, context).
 */
export async function writeDraftSkeleton(
	draftPath: string,
	domain: string,
	action: string,
	runtime: CommandRuntime,
): Promise<void> {
	const manifest: CommandManifest = {
		id: `${domain}-${action}`,
		domain,
		action,
		runtime,
		description: "",
		parameters: [],
		requiresBrowser: runtimeRequiresBrowser(runtime),
		authRequired: "unknown",
	};
	const entryFile = resolveEntryFile(runtime);

	await writeFile(join(draftPath, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
	await writeFile(join(draftPath, entryFile), generateCommandTemplate(runtime, []), "utf8");
	await writeFile(join(draftPath, "README.md"), generateReadmeTemplate(domain, action, runtime), "utf8");
	await writeFile(join(draftPath, "context.md"), generateContextTemplate(domain, action), "utf8");
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNodeError(value: unknown): value is NodeJS.ErrnoException {
	return typeof value === "object" && value !== null && "code" in value;
}

function findCaptureDraftIdentityMismatch(
	captureYaml: CaptureYaml,
	manifest: Record<string, unknown>,
): CaptureDraftIdentityMismatch | undefined {
	const expected = {
		domain: captureYaml.domain,
		action: captureYaml.action,
		runtime: captureYaml.runtime,
	} as const;

	for (const field of ["domain", "action", "runtime"] as const) {
		const actual = manifest[field];
		if (actual !== expected[field]) {
			return {
				field,
				expected: expected[field],
				actual,
				message: `Manifest ${field} ${formatManifestValue(actual)} does not match capture ${field} "${expected[field]}"`,
			};
		}
	}

	return undefined;
}

function formatManifestValue(value: unknown): string {
	if (typeof value === "string") {
		return `"${value}"`;
	}
	if (value === undefined) {
		return "undefined";
	}
	return JSON.stringify(value) ?? String(value);
}
