import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { validateCommandPackage } from "../../../../src/cli/meta/command-validation.js";
import { handleCommandDraft } from "../../../../src/cli/meta/draft.js";

async function readDraftFile(dir: string, fileName: string): Promise<string> {
	return await readFile(join(dir, fileName), "utf-8");
}

async function cleanup(dir: string): Promise<void> {
	try {
		await rm(dir, { recursive: true, force: true });
	} catch {
		// ignore
	}
}

describe("draft output passes validateCommandPackage L1-L3", () => {
	it("node runtime draft passes validation without errors", async () => {
		const result = await handleCommandDraft("test", "nodecmd", {
			runtime: "node",
			to: ".tmp-drafts/test-nodecmd",
		});
		expect(result.success).toBe(true);
		if (!result.success) return;

		const manifest = JSON.parse(await readDraftFile(result.draftPath, "manifest.json"));
		manifest.description = "A test command description";
		const code = await readDraftFile(result.draftPath, "command.js");

		const details = validateCommandPackage({
			manifest,
			code,
			hasReadme: true,
			hasContext: true,
		});

		const errors = details.filter((d) => d.level === "error");
		expect(errors).toHaveLength(0);
		await cleanup(result.draftPath);
	});

	it("playwright-cli runtime draft passes validation without errors", async () => {
		const result = await handleCommandDraft("test", "pwlcmd", {
			runtime: "playwright-cli",
			to: ".tmp-drafts/test-pwlcmd",
		});
		expect(result.success).toBe(true);
		if (!result.success) return;

		const manifest = JSON.parse(await readDraftFile(result.draftPath, "manifest.json"));
		manifest.description = "A test command description";
		const code = await readDraftFile(result.draftPath, "command.js");

		const details = validateCommandPackage({
			manifest,
			code,
			hasReadme: true,
			hasContext: true,
		});

		const errors = details.filter((d) => d.level === "error");
		expect(errors).toHaveLength(0);
		await cleanup(result.draftPath);
	});

	it("shell runtime draft passes validation without errors", async () => {
		const result = await handleCommandDraft("test", "shellcmd", {
			runtime: "shell",
			to: ".tmp-drafts/test-shellcmd",
		});
		expect(result.success).toBe(true);
		if (!result.success) return;

		const manifest = JSON.parse(await readDraftFile(result.draftPath, "manifest.json"));
		manifest.description = "A test command description";
		const code = await readDraftFile(result.draftPath, "command.sh");

		const details = validateCommandPackage({
			manifest,
			code,
			hasReadme: true,
			hasContext: true,
		});

		const errors = details.filter((d) => d.level === "error");
		expect(errors).toHaveLength(0);
		await cleanup(result.draftPath);
	});

	it("python runtime draft passes validation without errors", async () => {
		const result = await handleCommandDraft("test", "pycmd", {
			runtime: "python",
			to: ".tmp-drafts/test-pycmd",
		});
		expect(result.success).toBe(true);
		if (!result.success) return;

		const manifest = JSON.parse(await readDraftFile(result.draftPath, "manifest.json"));
		manifest.description = "A test command description";
		const code = await readDraftFile(result.draftPath, "command.py");

		const details = validateCommandPackage({
			manifest,
			code,
			hasReadme: true,
			hasContext: true,
		});

		const errors = details.filter((d) => d.level === "error");
		expect(errors).toHaveLength(0);
		await cleanup(result.draftPath);
	});

	it("draft with parameters passes validation without errors", async () => {
		const result = await handleCommandDraft("test", "paramcmd", {
			runtime: "node",
			to: ".tmp-drafts/test-paramcmd",
			param: ["author:required", "limit:default=10"],
		});
		expect(result.success).toBe(true);
		if (!result.success) return;

		const manifest = JSON.parse(await readDraftFile(result.draftPath, "manifest.json"));
		manifest.description = "A test command description";
		const code = await readDraftFile(result.draftPath, "command.js");

		const details = validateCommandPackage({
			manifest,
			code,
			hasReadme: true,
			hasContext: true,
		});

		const errors = details.filter((d) => d.level === "error");
		expect(errors).toHaveLength(0);
		await cleanup(result.draftPath);
	});
});
