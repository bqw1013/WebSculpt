import { mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { clearCommandModuleCache, loadCommandModule } from "../../../../src/daemon/server/executor/module-loader.js";

describe("loadCommandModule", () => {
	let tempDir: string;

	beforeEach(() => {
		tempDir = mkdtempSync(join(tmpdir(), "ws-ml-test-"));
		clearCommandModuleCache();
	});

	afterEach(() => {
		rmSync(tempDir, { recursive: true, force: true });
	});

	it("caches an unchanged module and returns the same reference on subsequent loads", async () => {
		const filePath = join(tempDir, "cmd.js");
		writeFileSync(filePath, "export default async () => 'first';", "utf-8");

		const mod1 = await loadCommandModule(filePath);
		const mod2 = await loadCommandModule(filePath);

		expect(mod1).toBe(mod2);
	});

	it("reloads the module when the file has been modified", async () => {
		const filePath = join(tempDir, "cmd.js");
		writeFileSync(filePath, "export default async () => 'first';", "utf-8");

		const mod1 = await loadCommandModule(filePath);

		// Force a different mtime by writing new content.
		writeFileSync(filePath, "export default async () => 'second';", "utf-8");
		const newTime = Date.now() + 1000;
		utimesSync(filePath, newTime / 1000, newTime / 1000);

		const mod2 = await loadCommandModule(filePath);

		expect(mod1).not.toBe(mod2);
		expect(typeof (mod1 as Record<string, unknown>).default).toBe("function");
		expect(typeof (mod2 as Record<string, unknown>).default).toBe("function");
	});

	it("returns the updated module after reload", async () => {
		const filePath = join(tempDir, "cmd.js");
		writeFileSync(filePath, "export default async () => 1;", "utf-8");

		const mod1 = await loadCommandModule(filePath);
		const fn1 = (mod1 as Record<string, unknown>).default as () => Promise<unknown>;
		expect(await fn1()).toBe(1);

		writeFileSync(filePath, "export default async () => 2;", "utf-8");
		const newTime = Date.now() + 1000;
		utimesSync(filePath, newTime / 1000, newTime / 1000);

		const mod2 = await loadCommandModule(filePath);
		const fn2 = (mod2 as Record<string, unknown>).default as () => Promise<unknown>;
		expect(await fn2()).toBe(2);
	});
});
