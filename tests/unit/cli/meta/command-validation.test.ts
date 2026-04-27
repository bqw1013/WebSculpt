import { describe, expect, it } from "vitest";
import { validateCommandPackage } from "../../../../src/cli/meta/command-validation.js";

function makeInput(overrides: Record<string, unknown> = {}) {
	return {
		manifest: {
			id: "test-domain-test-action",
			domain: "test-domain",
			action: "test-action",
			description: "Test description",
			runtime: "node",
			parameters: [],
			...overrides.manifest,
		},
		code: overrides.code ?? "export default async function(params) { return {}; }",
		hasReadme: overrides.hasReadme ?? true,
		hasContext: overrides.hasContext ?? true,
		expectedDomain: overrides.expectedDomain ?? "test-domain",
		expectedAction: overrides.expectedAction ?? "test-action",
	};
}

describe("validateCommandPackage", () => {
	describe("L1 structure validation", () => {
		it("passes for a valid manifest", () => {
			const details = validateCommandPackage(makeInput());
			expect(details.filter((d) => d.level === "error")).toHaveLength(0);
		});

		it("errors on invalid runtime", () => {
			const details = validateCommandPackage(makeInput({ manifest: { runtime: "invalid-runtime" } }));
			expect(details).toContainEqual(
				expect.objectContaining({ code: "INVALID_RUNTIME", level: "error" }),
			);
		});

		it("errors on duplicate parameter names", () => {
			const details = validateCommandPackage(
				makeInput({
					manifest: {
						parameters: [
							{ name: "foo", description: "First" },
							{ name: "foo", description: "Second" },
						],
					},
				}),
			);
			expect(details).toContainEqual(
				expect.objectContaining({ code: "DUPLICATE_PARAM_NAME", level: "error" }),
			);
		});

		it("errors on missing parameter name", () => {
			const details = validateCommandPackage(
				makeInput({
					manifest: {
						parameters: [{ description: "No name" }],
					},
				}),
			);
			expect(details).toContainEqual(
				expect.objectContaining({ code: "MISSING_PARAM_NAME", level: "error" }),
			);
		});

		it("errors on invalid parameter default type", () => {
			const details = validateCommandPackage(
				makeInput({
					manifest: {
						parameters: [{ name: "foo", default: { nested: true } }],
					},
				}),
			);
			expect(details).toContainEqual(
				expect.objectContaining({ code: "INVALID_PARAM_DEFAULT", level: "error" }),
			);
		});

		it("errors on id-domain-action mismatch", () => {
			const details = validateCommandPackage(
				makeInput({ manifest: { id: "wrong-id" } }),
			);
			expect(details).toContainEqual(
				expect.objectContaining({ code: "ID_MISMATCH", level: "error" }),
			);
		});

		it("warns on missing identity fields when no domain/action expected", () => {
			const details = validateCommandPackage(
				makeInput({ manifest: { id: undefined, domain: undefined, action: undefined }, expectedDomain: undefined, expectedAction: undefined }),
			);
			expect(details).toContainEqual(
				expect.objectContaining({ code: "MISSING_IDENTITY_FIELDS", level: "warning" }),
			);
		});

		it("errors on missing description", () => {
			const details = validateCommandPackage(makeInput({ manifest: { description: undefined } }));
			expect(details).toContainEqual(
				expect.objectContaining({ code: "MISSING_DESCRIPTION", level: "error" }),
			);
		});

		it("errors on empty description", () => {
			const details = validateCommandPackage(makeInput({ manifest: { description: "" } }));
			expect(details).toContainEqual(
				expect.objectContaining({ code: "MISSING_DESCRIPTION", level: "error" }),
			);
		});

		it("errors on whitespace-only description", () => {
			const details = validateCommandPackage(makeInput({ manifest: { description: "   " } }));
			expect(details).toContainEqual(
				expect.objectContaining({ code: "MISSING_DESCRIPTION", level: "error" }),
			);
		});

		it("warns on missing identity fields in injection simulation mode", () => {
			const details = validateCommandPackage(
				makeInput({ manifest: { id: undefined, domain: undefined, action: undefined } }),
			);
			const warnings = details.filter((d) => d.level === "warning");
			expect(warnings.some((w) => w.code === "MISSING_IDENTITY_FIELDS")).toBe(true);
		});
	});

	describe("L2 compliance validation", () => {
		it("errors on temporary snapshot reference", () => {
			const details = validateCommandPackage(
				makeInput({ code: "export default async function() { return e12; }" }),
			);
			expect(details).toContainEqual(
				expect.objectContaining({ code: "TEMP_REF_FOUND", level: "error" }),
			);
		});

		it("errors on browser connection keywords", () => {
			const details = validateCommandPackage(
				makeInput({ code: "export default async function() { await launch(); }" }),
			);
			expect(details).toContainEqual(
				expect.objectContaining({ code: "BROWSER_CONNECTION_FORBIDDEN", level: "error" }),
			);
		});

		it("errors on inline dynamic import", () => {
			const details = validateCommandPackage(
				makeInput({ code: "export default async function() { const m = await import('foo'); }" }),
			);
			expect(details).toContainEqual(
				expect.objectContaining({ code: "INLINE_IMPORT_FORBIDDEN", level: "error" }),
			);
		});
	});

	describe("L3 contract validation", () => {
		it("errors on node runtime missing valid export", () => {
			const details = validateCommandPackage(
				makeInput({ code: "async function(params) { return {}; }" }),
			);
			expect(details).toContainEqual(
				expect.objectContaining({ code: "MISSING_EXPORT_DEFAULT", level: "error" }),
			);
		});

		it("passes for node runtime with export const command", () => {
			const details = validateCommandPackage(
				makeInput({ code: "export const command = async function(params) { return {}; };" }),
			);
			expect(details.filter((d) => d.level === "error")).toHaveLength(0);
		});

		it("passes for node runtime with export function command", () => {
			const details = validateCommandPackage(
				makeInput({ code: "export async function command(params) { return {}; }" }),
			);
			expect(details.filter((d) => d.level === "error")).toHaveLength(0);
		});

		it("errors on invalid JS syntax", () => {
			const details = validateCommandPackage(
				makeInput({ code: "export default async function(params) { return { broken: }" }),
			);
			expect(details).toContainEqual(
				expect.objectContaining({ code: "INVALID_JS_SYNTAX", level: "error" }),
			);
		});

		it("errors on playwright-cli runtime missing PARAMS_INJECT", () => {
			const details = validateCommandPackage(
				makeInput({
					manifest: { runtime: "playwright-cli" },
					code: "async (page) => { return {}; }",
				}),
			);
			expect(details).toContainEqual(
				expect.objectContaining({ code: "MISSING_PARAMS_INJECT", level: "error" }),
			);
		});

		it("errors on playwright-cli runtime containing module syntax", () => {
			const details = validateCommandPackage(
				makeInput({
					manifest: { runtime: "playwright-cli" },
					code: "/* PARAMS_INJECT */ export async function run(page) { return {}; }",
				}),
			);
			expect(details).toContainEqual(
				expect.objectContaining({ code: "MODULE_SYNTAX_IN_FUNCTION_BODY", level: "error" }),
			);
		});

		it("warns on undeclared parameter usage", () => {
			const details = validateCommandPackage(
				makeInput({
					code: "export default async function(params) { return { x: params.undeclared }; }",
				}),
			);
			expect(details).toContainEqual(
				expect.objectContaining({ code: "UNDECLARED_PARAM", level: "warning" }),
			);
		});
	});

	describe("asset completeness checks", () => {
		it("warns on missing README", () => {
			const details = validateCommandPackage(makeInput({ hasReadme: false }));
			expect(details).toContainEqual(
				expect.objectContaining({ code: "MISSING_README", level: "warning" }),
			);
		});

		it("warns on missing context", () => {
			const details = validateCommandPackage(makeInput({ hasContext: false }));
			expect(details).toContainEqual(
				expect.objectContaining({ code: "MISSING_CONTEXT", level: "warning" }),
			);
		});
	});
});
