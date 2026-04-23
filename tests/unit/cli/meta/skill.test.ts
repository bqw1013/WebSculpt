import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
	resolveSkillSource,
	handleSkillInstall,
	handleSkillUninstall,
	handleSkillStatus,
} from "../../../../src/cli/meta/skill.js";

const MOCK_HOME = "/mock/home";
const MOCK_CWD = "/mock/project";
const MOCK_SOURCE = "/mock/source";

describe("resolveSkillSource", () => {
	let existsSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		existsSpy = vi.spyOn(fs, "existsSync").mockReturnValue(false);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("returns the resolved path when --from points to an existing directory", () => {
		existsSpy.mockImplementation((p: fs.PathLike) => String(p) === "/custom/skill");
		const result = resolveSkillSource("/custom/skill");
		expect(result).toBe(path.resolve("/custom/skill"));
	});

	it("throws SKILL_SOURCE_NOT_FOUND when --from points to a missing directory", () => {
		expect(() => resolveSkillSource("/missing/skill")).toThrow(
			expect.objectContaining({ code: "SKILL_SOURCE_NOT_FOUND" }),
		);
	});
});

describe("handleSkillInstall", () => {
	let existingPaths: Set<string>;

	beforeEach(() => {
		existingPaths = new Set([MOCK_SOURCE]);
		vi.spyOn(fs, "existsSync").mockImplementation((p: fs.PathLike) => existingPaths.has(String(p)));
		vi.spyOn(fs, "mkdirSync").mockImplementation(() => undefined);
		vi.spyOn(fs, "cpSync").mockImplementation(() => undefined);
		vi.spyOn(fs, "rmSync").mockImplementation(() => undefined);
		vi.spyOn(os, "homedir").mockReturnValue(MOCK_HOME);
		vi.spyOn(process, "cwd").mockReturnValue(MOCK_CWD);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("returns AGENT_DIRS_NOT_FOUND when no local agent directories exist", () => {
		const result = handleSkillInstall({ from: MOCK_SOURCE });
		expect(result).toEqual({
			success: false,
			error: {
				code: "AGENT_DIRS_NOT_FOUND",
				message: expect.stringContaining("No agent directories found"),
			},
		});
	});

	it("installs globally when target does not exist", () => {
		const result = handleSkillInstall({ from: MOCK_SOURCE, global: true });
		expect(result).toEqual({
			success: true,
			results: [
				{ agent: "claude", status: "installed" },
				{ agent: "codex", status: "installed" },
				{ agent: "agents", status: "installed" },
			],
		});
	});

	it("skips globally when target already exists", () => {
		existingPaths.add(path.join(MOCK_HOME, ".claude", "skills", "websculpt"));
		existingPaths.add(path.join(MOCK_HOME, ".codex", "skills", "websculpt"));
		existingPaths.add(path.join(MOCK_HOME, ".agents", "skills", "websculpt"));
		const result = handleSkillInstall({ from: MOCK_SOURCE, global: true });
		expect(result).toEqual({
			success: true,
			results: [
				{ agent: "claude", status: "skipped" },
				{ agent: "codex", status: "skipped" },
				{ agent: "agents", status: "skipped" },
			],
		});
	});

	it("replaces globally when target exists and force is set", () => {
		existingPaths.add(path.join(MOCK_HOME, ".claude", "skills", "websculpt"));
		const result = handleSkillInstall({ from: MOCK_SOURCE, global: true, force: true });
		expect(result).toEqual({
			success: true,
			results: [
				{ agent: "claude", status: "replaced" },
				{ agent: "codex", status: "installed" },
				{ agent: "agents", status: "installed" },
			],
		});
	});

	it("returns SKILL_SOURCE_NOT_FOUND for an invalid --from path", () => {
		const result = handleSkillInstall({ from: "/missing/source" });
		expect(result).toEqual({
			success: false,
			error: {
				code: "SKILL_SOURCE_NOT_FOUND",
				message: expect.stringContaining("Skill source not found"),
			},
		});
	});

	it("respects the --agents filter", () => {
		const result = handleSkillInstall({ from: MOCK_SOURCE, global: true, agents: "claude" });
		expect(result).toEqual({
			success: true,
			results: [{ agent: "claude", status: "installed" }],
		});
	});
});

describe("handleSkillUninstall", () => {
	let existingPaths: Set<string>;

	beforeEach(() => {
		existingPaths = new Set();
		vi.spyOn(fs, "existsSync").mockImplementation((p: fs.PathLike) => existingPaths.has(String(p)));
		vi.spyOn(fs, "rmSync").mockImplementation(() => undefined);
		vi.spyOn(os, "homedir").mockReturnValue(MOCK_HOME);
		vi.spyOn(process, "cwd").mockReturnValue(MOCK_CWD);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("removes globally when target exists", () => {
		existingPaths.add(path.join(MOCK_HOME, ".claude", "skills", "websculpt"));
		const result = handleSkillUninstall({ global: true });
		expect(result).toEqual({
			success: true,
			results: [
				{ agent: "claude", status: "removed" },
				{ agent: "codex", status: "not_found" },
				{ agent: "agents", status: "not_found" },
			],
		});
	});

	it("returns not_found when target does not exist", () => {
		const result = handleSkillUninstall({ global: true });
		expect(result).toEqual({
			success: true,
			results: [
				{ agent: "claude", status: "not_found" },
				{ agent: "codex", status: "not_found" },
				{ agent: "agents", status: "not_found" },
			],
		});
	});
});

describe("handleSkillStatus", () => {
	beforeEach(() => {
		vi.spyOn(os, "homedir").mockReturnValue(MOCK_HOME);
		vi.spyOn(process, "cwd").mockReturnValue(MOCK_CWD);
		vi.spyOn(fs, "readFileSync").mockImplementation(() => {
			throw new Error("ENOENT");
		});
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("shows local-priority with global annotation and not-installed fallback", () => {
		vi.spyOn(fs, "readFileSync").mockImplementation((p: fs.PathLike) => {
			const filePath = String(p);
			if (filePath === path.join(MOCK_CWD, ".claude", "skills", "websculpt", "version.json")) {
				return JSON.stringify({ version: "1.0.0" });
			}
			if (filePath === path.join(MOCK_HOME, ".claude", "skills", "websculpt", "version.json")) {
				return JSON.stringify({ version: "0.9.0" });
			}
			if (filePath === path.join(MOCK_HOME, ".codex", "skills", "websculpt", "version.json")) {
				return JSON.stringify({ version: "0.8.0" });
			}
			throw new Error("ENOENT");
		});

		const result = handleSkillStatus();
		expect(result).toEqual({
			success: true,
			lines: [
				"claude   1.0.0    local [global 0.9.0 present]",
				"codex    0.8.0    global",
				"agents   not installed",
			],
		});
	});
});
