import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { stringify } from "yaml";
import { readCaptureYaml } from "../../../../../../src/cli/meta/capture/lib/capture-io.js";

describe("isCaptureYaml (via readCaptureYaml)", () => {
	const tempDirs: string[] = [];

	afterEach(async () => {
		await Promise.all(tempDirs.splice(0).map(async (dirPath) => rm(dirPath, { recursive: true, force: true })));
	});

	async function createTempYaml(overrides: Record<string, unknown>): Promise<string> {
		const dir = await mkdtemp(join(tmpdir(), "capture-io-test-"));
		tempDirs.push(dir);
		const base = {
			name: "test",
			domain: "test",
			action: "cmd",
			runtime: "node",
			createdAt: new Date().toISOString(),
			schema: "command-capture",
			commandLibrarySnapshot: {
				totalCommands: 10,
				sameDomainCommands: [],
				nameConflict: false,
			},
			repairOf: null,
			sourceCommand: "test/cmd",
			supersedes: null,
			...overrides,
		};
		const filePath = join(dir, "capture.yaml");
		await writeFile(filePath, stringify(base), "utf8");
		return filePath;
	}

	it("accepts absent sourceType", async () => {
		const filePath = await createTempYaml({});
		// Should not throw — absent sourceType is valid
		const result = await readCaptureYaml(filePath);
		expect(result.sourceType).toBeUndefined();
	});

	it('accepts sourceType: "user"', async () => {
		const filePath = await createTempYaml({ sourceType: "user" });
		const result = await readCaptureYaml(filePath);
		expect(result.sourceType).toBe("user");
	});

	it('accepts sourceType: "builtin"', async () => {
		const filePath = await createTempYaml({ sourceType: "builtin" });
		const result = await readCaptureYaml(filePath);
		expect(result.sourceType).toBe("builtin");
	});

	it('rejects sourceType: "invalid"', async () => {
		const filePath = await createTempYaml({ sourceType: "invalid" });
		await expect(readCaptureYaml(filePath)).rejects.toThrow("Invalid capture metadata");
	});

	it("rejects sourceType that is a number", async () => {
		const filePath = await createTempYaml({ sourceType: 123 });
		await expect(readCaptureYaml(filePath)).rejects.toThrow("Invalid capture metadata");
	});

	it("rejects sourceType: null", async () => {
		const filePath = await createTempYaml({ sourceType: null });
		await expect(readCaptureYaml(filePath)).rejects.toThrow("Invalid capture metadata");
	});
});
