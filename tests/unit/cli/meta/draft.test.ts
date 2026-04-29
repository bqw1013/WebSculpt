import { access } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { handleCommandDraft, parseParamSpec } from "../../../../src/cli/meta/draft.js";

describe("parseParamSpec", () => {
	it("parses a plain name as optional parameter without default", () => {
		const result = parseParamSpec("title");
		expect(result).toEqual({ name: "title", required: false });
	});

	it("parses name:required", () => {
		const result = parseParamSpec("author:required");
		expect(result).toEqual({ name: "author", required: true });
	});

	it("parses name:default=string", () => {
		const result = parseParamSpec("query:default=hello");
		expect(result).toEqual({ name: "query", required: false, default: "hello" });
	});

	it("parses name:default=number", () => {
		const result = parseParamSpec("limit:default=10");
		expect(result).toEqual({ name: "limit", required: false, default: 10 });
	});

	it("parses name:default=boolean true", () => {
		const result = parseParamSpec("verbose:default=true");
		expect(result).toEqual({ name: "verbose", required: false, default: true });
	});

	it("parses name:default=boolean false", () => {
		const result = parseParamSpec("dryRun:default=false");
		expect(result).toEqual({ name: "dryRun", required: false, default: false });
	});

	it("trims whitespace around name", () => {
		const result = parseParamSpec("  title  ");
		expect(result).toEqual({ name: "title", required: false });
	});

	it("returns optional for unknown modifier after colon", () => {
		const result = parseParamSpec("name:unknown");
		expect(result).toEqual({ name: "name", required: false });
	});
});

describe("handleCommandDraft", () => {
	it("rejects reserved domain 'command'", async () => {
		const result = await handleCommandDraft("command", "test", {});
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.code).toBe("RESERVED_DOMAIN");
		}
	});

	it("rejects reserved domain 'config'", async () => {
		const result = await handleCommandDraft("config", "test", {});
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.code).toBe("RESERVED_DOMAIN");
		}
	});

	it("generates structured README.md and context.md templates", async () => {
		const result = await handleCommandDraft("test-domain", "test-action", { force: true });
		expect(result.success).toBe(true);
		if (!result.success) return;

		const readmePath = `${result.draftPath}/README.md`;
		const contextPath = `${result.draftPath}/context.md`;

		await expect(access(readmePath)).resolves.toBeUndefined();
		await expect(access(contextPath)).resolves.toBeUndefined();
	});
});
