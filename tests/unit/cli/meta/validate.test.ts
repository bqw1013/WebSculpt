import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { handleCommandValidate } from "../../../../src/cli/meta/validate.js";

async function createTempDir(): Promise<string> {
	const dir = join(process.cwd(), "tests", ".tmp", `validate-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
	await mkdir(dir, { recursive: true });
	return dir;
}

async function writeManifest(dir: string, manifest: Record<string, unknown>): Promise<void> {
	await writeFile(join(dir, "manifest.json"), JSON.stringify(manifest), "utf-8");
}

async function writeCode(dir: string, code: string, filename = "command.js"): Promise<void> {
	await writeFile(join(dir, filename), code, "utf-8");
}

describe("handleCommandValidate", () => {
	it("returns success for a valid command directory", async () => {
		const dir = await createTempDir();
		await writeManifest(dir, {
			id: "my-domain-my-action",
			domain: "my-domain",
			action: "my-action",
			runtime: "node",
		});
		await writeCode(dir, "export default async function(params) { return {}; }");
		await writeFile(join(dir, "README.md"), "# Test", "utf-8");
		await writeFile(join(dir, "context.md"), "Context", "utf-8");

		const result = await handleCommandValidate(dir);

		expect(result.success).toBe(true);
	});

	it("returns warnings for missing identity fields when no domain/action given", async () => {
		const dir = await createTempDir();
		await writeManifest(dir, { runtime: "node" });
		await writeCode(dir, "export default async function(params) { return {}; }");
		await writeFile(join(dir, "README.md"), "# Test", "utf-8");
		await writeFile(join(dir, "context.md"), "Context", "utf-8");

		const result = await handleCommandValidate(dir);

		expect(result.success).toBe(true);
		if (result.success && "warnings" in result) {
			expect(result.warnings).toEqual(
				expect.arrayContaining([
					expect.objectContaining({ code: "MISSING_IDENTITY_FIELDS" }),
				]),
			);
		}
	});

	it("returns errors for validation failures", async () => {
		const dir = await createTempDir();
		await writeManifest(dir, {
			id: "my-domain-my-action",
			domain: "my-domain",
			action: "my-action",
			runtime: "invalid-runtime",
		});
		await writeCode(dir, "export default async function(params) { return {}; }");

		const result = await handleCommandValidate(dir);

		expect(result.success).toBe(false);
		if (!result.success && "error" in result) {
			expect(result.error.code).toBe("VALIDATION_ERROR");
			expect(result.error.details).toEqual(
				expect.arrayContaining([
					expect.objectContaining({ code: "INVALID_RUNTIME" }),
				]),
			);
		}
	});

	it("returns RESERVED_DOMAIN error when domain argument is reserved", async () => {
		const dir = await createTempDir();
		await writeManifest(dir, {
			id: "command-foo",
			domain: "command",
			action: "foo",
			runtime: "node",
		});
		await writeCode(dir, "export default async function(params) { return {}; }");

		const result = await handleCommandValidate(dir, "command", "foo");

		expect(result.success).toBe(false);
		if (!result.success && "error" in result) {
			expect(result.error.code).toBe("RESERVED_DOMAIN");
		}
	});

	it("returns INVALID_PACKAGE when manifest.json is missing", async () => {
		const dir = await createTempDir();
		const result = await handleCommandValidate(dir);

		expect(result.success).toBe(false);
		if (!result.success && "error" in result) {
			expect(result.error.code).toBe("INVALID_PACKAGE");
		}
	});

	it("validates injection consistency when domain and action are provided", async () => {
		const dir = await createTempDir();
		await writeManifest(dir, {
			id: "wrong-id",
			domain: "wrong-domain",
			action: "wrong-action",
			runtime: "node",
		});
		await writeCode(dir, "export default async function(params) { return {}; }");

		const result = await handleCommandValidate(dir, "expected-domain", "expected-action");

		expect(result.success).toBe(false);
		if (!result.success && "error" in result) {
			expect(result.error.code).toBe("VALIDATION_ERROR");
			expect(result.error.details).toEqual(
				expect.arrayContaining([
					expect.objectContaining({ code: "ID_MISMATCH" }),
				]),
			);
		}
	});
});
