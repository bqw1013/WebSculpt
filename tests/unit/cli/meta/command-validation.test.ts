import { describe, expect, it } from "vitest";
import { validateCommandSource } from "../../../../src/cli/meta/lib/command-validation.js";

function makeInput(overrides: Record<string, unknown> = {}) {
	const manifest: Record<string, unknown> = {
		id: "test-domain-test-action",
		domain: "test-domain",
		action: "test-action",
		description: "Test description",
		runtime: "node",
		parameters: [],
		requiresBrowser: false,
	};
	const overrideManifest = overrides.manifest as Record<string, unknown> | undefined;
	if (overrideManifest) {
		for (const [key, value] of Object.entries(overrideManifest)) {
			if (value === undefined) {
				delete manifest[key];
			} else {
				manifest[key] = value;
			}
		}
	}
	return {
		manifest,
		code: overrides.code ?? "export default async function(params) { return {}; }",
		hasReadme: overrides.hasReadme ?? true,
		hasContext: overrides.hasContext ?? true,
		readmeContent: overrides.readmeContent ?? "## Description\n## Parameters\n## Usage",
		contextContent:
			overrides.contextContent ??
			"## Precipitation Background\n## Value Assessment\n## Page Structure\n## Environment Dependencies\n## Failure Signals\n## Repair Clues",
		expectedDomain: overrides.expectedDomain ?? "test-domain",
		expectedAction: overrides.expectedAction ?? "test-action",
	};
}

describe("validateCommandSource", () => {
	describe("L1 structure validation", () => {
		it("passes for a valid manifest", () => {
			const details = validateCommandSource(makeInput());
			expect(details.filter((d) => d.level === "error")).toHaveLength(0);
		});

		it("errors on invalid runtime", () => {
			const details = validateCommandSource(makeInput({ manifest: { runtime: "invalid-runtime" } }));
			expect(details).toContainEqual(expect.objectContaining({ code: "INVALID_RUNTIME", level: "error" }));
		});

		it("errors on duplicate parameter names", () => {
			const details = validateCommandSource(
				makeInput({
					manifest: {
						parameters: [
							{ name: "foo", description: "First" },
							{ name: "foo", description: "Second" },
						],
					},
				}),
			);
			expect(details).toContainEqual(expect.objectContaining({ code: "DUPLICATE_PARAM_NAME", level: "error" }));
		});

		it("errors on missing parameter name", () => {
			const details = validateCommandSource(
				makeInput({
					manifest: {
						parameters: [{ description: "No name" }],
					},
				}),
			);
			expect(details).toContainEqual(expect.objectContaining({ code: "MISSING_PARAM_NAME", level: "error" }));
		});

		it("errors on invalid parameter default type", () => {
			const details = validateCommandSource(
				makeInput({
					manifest: {
						parameters: [{ name: "foo", default: { nested: true } }],
					},
				}),
			);
			expect(details).toContainEqual(expect.objectContaining({ code: "INVALID_PARAM_DEFAULT", level: "error" }));
		});

		it("errors on id-domain-action mismatch", () => {
			const details = validateCommandSource(makeInput({ manifest: { id: "wrong-id" } }));
			expect(details).toContainEqual(expect.objectContaining({ code: "ID_MISMATCH", level: "error" }));
		});

		it("warns on missing identity fields when no domain/action expected", () => {
			const details = validateCommandSource(
				makeInput({
					manifest: { id: undefined, domain: undefined, action: undefined },
					expectedDomain: undefined,
					expectedAction: undefined,
				}),
			);
			expect(details).toContainEqual(expect.objectContaining({ code: "MISSING_IDENTITY_FIELDS", level: "warning" }));
		});

		it("errors on missing description", () => {
			const details = validateCommandSource(makeInput({ manifest: { description: undefined } }));
			expect(details).toContainEqual(expect.objectContaining({ code: "MISSING_DESCRIPTION", level: "error" }));
		});

		it("errors on empty description", () => {
			const details = validateCommandSource(makeInput({ manifest: { description: "" } }));
			expect(details).toContainEqual(expect.objectContaining({ code: "MISSING_DESCRIPTION", level: "error" }));
		});

		it("errors on whitespace-only description", () => {
			const details = validateCommandSource(makeInput({ manifest: { description: "   " } }));
			expect(details).toContainEqual(expect.objectContaining({ code: "MISSING_DESCRIPTION", level: "error" }));
		});

		it("passes for valid prerequisites array", () => {
			const details = validateCommandSource(makeInput({ manifest: { prerequisites: ["Requires user login"] } }));
			expect(details.filter((d) => d.level === "error" && d.code === "INVALID_PREREQUISITES")).toHaveLength(0);
		});

		it("errors on non-array prerequisites", () => {
			const details = validateCommandSource(makeInput({ manifest: { prerequisites: "not-an-array" } }));
			expect(details).toContainEqual(expect.objectContaining({ code: "INVALID_PREREQUISITES", level: "error" }));
		});

		it("errors on prerequisites array with non-string element", () => {
			const details = validateCommandSource(makeInput({ manifest: { prerequisites: ["valid", 123] } }));
			expect(details).toContainEqual(expect.objectContaining({ code: "INVALID_PREREQUISITES", level: "error" }));
		});

		it("warns on missing identity fields in injection simulation mode", () => {
			const details = validateCommandSource(
				makeInput({ manifest: { id: undefined, domain: undefined, action: undefined } }),
			);
			const warnings = details.filter((d) => d.level === "warning");
			expect(warnings.some((w) => w.code === "MISSING_IDENTITY_FIELDS")).toBe(true);
		});

		it("errors on missing requiresBrowser", () => {
			const details = validateCommandSource(makeInput({ manifest: { requiresBrowser: undefined } }));
			expect(details).toContainEqual(expect.objectContaining({ code: "MISSING_REQUIRES_BROWSER", level: "error" }));
		});

		it("errors on non-boolean requiresBrowser", () => {
			const details = validateCommandSource(makeInput({ manifest: { requiresBrowser: "yes" } }));
			expect(details).toContainEqual(expect.objectContaining({ code: "INVALID_REQUIRES_BROWSER", level: "error" }));
		});

		it("errors on browser runtime with requiresBrowser false", () => {
			const details = validateCommandSource(makeInput({ manifest: { runtime: "browser", requiresBrowser: false } }));
			expect(details).toContainEqual(expect.objectContaining({ code: "RUNTIME_BROWSER_MISMATCH", level: "error" }));
		});

		it("errors on node runtime with requiresBrowser true", () => {
			const details = validateCommandSource(makeInput({ manifest: { requiresBrowser: true } }));
			expect(details).toContainEqual(expect.objectContaining({ code: "RUNTIME_BROWSER_MISMATCH", level: "error" }));
		});

		it("passes for valid requiresBrowser with browser runtime", () => {
			const details = validateCommandSource(makeInput({ manifest: { runtime: "browser", requiresBrowser: true } }));
			expect(details.filter((d) => d.level === "error")).toHaveLength(0);
		});

		it("passes for valid requiresBrowser with shell runtime", () => {
			const details = validateCommandSource(makeInput({ manifest: { runtime: "shell", requiresBrowser: false } }));
			expect(details.filter((d) => d.level === "error" && d.code.includes("REQUIRES_BROWSER"))).toHaveLength(0);
		});

		it("passes for valid requiresBrowser with python runtime", () => {
			const details = validateCommandSource(makeInput({ manifest: { runtime: "python", requiresBrowser: false } }));
			expect(details.filter((d) => d.level === "error" && d.code.includes("REQUIRES_BROWSER"))).toHaveLength(0);
		});

		it("passes for valid authRequired values", () => {
			for (const value of ["required", "not-required", "unknown"]) {
				const details = validateCommandSource(makeInput({ manifest: { authRequired: value } }));
				expect(details.filter((d) => d.level === "error" && d.code === "INVALID_AUTH_REQUIRED")).toHaveLength(0);
			}
		});

		it("passes when authRequired is missing", () => {
			const details = validateCommandSource(makeInput({ manifest: { authRequired: undefined } }));
			expect(details.filter((d) => d.level === "error" && d.code === "INVALID_AUTH_REQUIRED")).toHaveLength(0);
		});

		it("errors on invalid authRequired value", () => {
			const details = validateCommandSource(makeInput({ manifest: { authRequired: "maybe" } }));
			expect(details).toContainEqual(expect.objectContaining({ code: "INVALID_AUTH_REQUIRED", level: "error" }));
		});

		it("errors on non-string authRequired", () => {
			const details = validateCommandSource(makeInput({ manifest: { authRequired: true } }));
			expect(details).toContainEqual(expect.objectContaining({ code: "INVALID_AUTH_REQUIRED", level: "error" }));
		});
	});

	describe("L2 compliance validation", () => {
		it("errors on temporary snapshot reference", () => {
			const details = validateCommandSource(makeInput({ code: "export default async function() { return e12; }" }));
			expect(details).toContainEqual(expect.objectContaining({ code: "TEMP_REF_FOUND", level: "error" }));
		});

		it("errors on browser connection keywords", () => {
			const details = validateCommandSource(
				makeInput({ code: "export default async function() { await launch(); }" }),
			);
			expect(details).toContainEqual(
				expect.objectContaining({ code: "BROWSER_CONNECTION_FORBIDDEN", level: "error" }),
			);
		});

		it("errors on inline dynamic import", () => {
			const details = validateCommandSource(
				makeInput({ code: "export default async function() { const m = await import('foo'); }" }),
			);
			expect(details).toContainEqual(expect.objectContaining({ code: "INLINE_IMPORT_FORBIDDEN", level: "error" }));
		});
	});

	describe("L3 contract validation", () => {
		it("errors on node runtime missing valid export", () => {
			const details = validateCommandSource(makeInput({ code: "async function(params) { return {}; }" }));
			expect(details).toContainEqual(expect.objectContaining({ code: "MISSING_EXPORT_DEFAULT", level: "error" }));
		});

		it("passes for node runtime with export const command", () => {
			const details = validateCommandSource(
				makeInput({ code: "export const command = async function(params) { return {}; };" }),
			);
			expect(details.filter((d) => d.level === "error")).toHaveLength(0);
		});

		it("passes for node runtime with export function command", () => {
			const details = validateCommandSource(
				makeInput({ code: "export async function command(params) { return {}; }" }),
			);
			expect(details.filter((d) => d.level === "error")).toHaveLength(0);
		});

		it("errors on invalid JS syntax", () => {
			const details = validateCommandSource(
				makeInput({ code: "export default async function(params) { return { broken: }" }),
			);
			expect(details).toContainEqual(expect.objectContaining({ code: "INVALID_JS_SYNTAX", level: "error" }));
		});

		it("errors on browser runtime missing export default", () => {
			const details = validateCommandSource(
				makeInput({
					manifest: { runtime: "browser" },
					code: "async (page) => { return {}; }",
				}),
			);
			expect(details).toContainEqual(expect.objectContaining({ code: "MISSING_EXPORT_DEFAULT", level: "error" }));
		});

		it("passes for browser runtime with export default", () => {
			const details = validateCommandSource(
				makeInput({
					manifest: { runtime: "browser", requiresBrowser: true },
					code: "export default async (page, params) => { return {}; }",
				}),
			);
			expect(details.filter((d) => d.level === "error")).toHaveLength(0);
		});

		it("errors on undeclared parameter usage", () => {
			const details = validateCommandSource(
				makeInput({
					code: "export default async function(params) { return { x: params.undeclared }; }",
				}),
			);
			expect(details).toContainEqual(expect.objectContaining({ code: "UNDECLARED_PARAM", level: "error" }));
		});
	});

	describe("asset completeness checks", () => {
		it("warns on missing README", () => {
			const details = validateCommandSource(makeInput({ hasReadme: false }));
			expect(details).toContainEqual(expect.objectContaining({ code: "MISSING_README", level: "warning" }));
		});

		it("warns on missing context", () => {
			const details = validateCommandSource(makeInput({ hasContext: false }));
			expect(details).toContainEqual(expect.objectContaining({ code: "MISSING_CONTEXT", level: "warning" }));
		});
	});

	describe("document content validation", () => {
		it("warns on missing README sections", () => {
			const details = validateCommandSource(makeInput({ readmeContent: "# Title only" }));
			expect(details).toContainEqual(expect.objectContaining({ code: "MISSING_README_SECTION", level: "warning" }));
		});

		it("warns on missing context sections", () => {
			const details = validateCommandSource(makeInput({ contextContent: "# Title only" }));
			expect(details).toContainEqual(expect.objectContaining({ code: "MISSING_CONTEXT_SECTION", level: "warning" }));
		});

		it("warns on missing Value Assessment section in context", () => {
			const details = validateCommandSource(
				makeInput({
					contextContent:
						"## Precipitation Background\n## Page Structure\n## Environment Dependencies\n## Failure Signals\n## Repair Clues",
				}),
			);
			expect(details).toContainEqual(
				expect.objectContaining({
					code: "MISSING_CONTEXT_SECTION",
					level: "warning",
					message: expect.stringContaining("Value Assessment"),
				}),
			);
		});
	});
});
