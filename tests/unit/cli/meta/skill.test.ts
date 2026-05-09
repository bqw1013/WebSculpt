import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	handleSkillInstall,
	handleSkillStatus,
	handleSkillUninstall,
	resolveSingleSkillSource,
	resolveSkillSource,
	resolveSkillSources,
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

describe("resolveSkillSources", () => {
	let readdirSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		vi.spyOn(process, "cwd").mockReturnValue(MOCK_CWD);
		vi.spyOn(fs, "existsSync").mockImplementation((p: fs.PathLike) => {
			const str = String(p);
			return str === path.join(MOCK_CWD, "skills") || str.endsWith("SKILL.md");
		});
		readdirSpy = vi.spyOn(fs, "readdirSync").mockReturnValue([
			{ name: "websculpt-explore", isDirectory: () => true },
			{ name: "websculpt-capture", isDirectory: () => true },
			{ name: "websculpt-explore-en", isDirectory: () => true },
			{ name: "websculpt-capture-en", isDirectory: () => true },
		] as unknown as fs.Dirent[]);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("returns all English skills by default", () => {
		const result = resolveSkillSources();
		expect(result.map((r) => path.basename(r))).toEqual(["websculpt-explore-en", "websculpt-capture-en"]);
	});

	it("returns Chinese skills when lang is zh", () => {
		const result = resolveSkillSources("zh");
		expect(result.map((r) => path.basename(r))).toEqual(["websculpt-explore", "websculpt-capture"]);
	});

	it("throws when no matching skills are found", () => {
		readdirSpy.mockReturnValue([] as unknown as fs.Dirent[]);
		expect(() => resolveSkillSources()).toThrow(expect.objectContaining({ code: "SKILL_SOURCE_NOT_FOUND" }));
	});
});

describe("resolveSingleSkillSource", () => {
	let existsSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		vi.spyOn(process, "cwd").mockReturnValue(MOCK_CWD);
		existsSpy = vi.spyOn(fs, "existsSync").mockImplementation((p: fs.PathLike) => {
			const str = String(p);
			return str === path.join(MOCK_CWD, "skills") || str.endsWith("SKILL.md");
		});
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("resolves explore skill in English by default", () => {
		const result = resolveSingleSkillSource("explore");
		expect(path.basename(result)).toBe("websculpt-explore-en");
	});

	it("resolves capture skill in Chinese when lang is zh", () => {
		const result = resolveSingleSkillSource("capture", "zh");
		expect(path.basename(result)).toBe("websculpt-capture");
	});

	it("throws when skill source is not found", () => {
		existsSpy.mockReturnValue(false);
		expect(() => resolveSingleSkillSource("missing")).toThrow(
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
				{ agent: "claude", skill: "source", status: "installed" },
				{ agent: "codex", skill: "source", status: "installed" },
				{ agent: "agents", skill: "source", status: "installed" },
			],
		});
	});

	it("skips globally when target already exists", () => {
		existingPaths.add(path.join(MOCK_HOME, ".claude", "skills", "source"));
		existingPaths.add(path.join(MOCK_HOME, ".codex", "skills", "source"));
		existingPaths.add(path.join(MOCK_HOME, ".agents", "skills", "source"));
		const result = handleSkillInstall({ from: MOCK_SOURCE, global: true });
		expect(result).toEqual({
			success: true,
			results: [
				{ agent: "claude", skill: "source", status: "skipped" },
				{ agent: "codex", skill: "source", status: "skipped" },
				{ agent: "agents", skill: "source", status: "skipped" },
			],
		});
	});

	it("replaces globally when target exists and force is set", () => {
		existingPaths.add(path.join(MOCK_HOME, ".claude", "skills", "source"));
		const result = handleSkillInstall({ from: MOCK_SOURCE, global: true, force: true });
		expect(result).toEqual({
			success: true,
			results: [
				{ agent: "claude", skill: "source", status: "replaced" },
				{ agent: "codex", skill: "source", status: "installed" },
				{ agent: "agents", skill: "source", status: "installed" },
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
			results: [{ agent: "claude", skill: "source", status: "installed" }],
		});
	});

	it("installs a single skill by name", () => {
		existingPaths.add(path.join(MOCK_CWD, "skills"));
		existingPaths.add(path.join(MOCK_CWD, "skills", "websculpt-capture-en"));
		existingPaths.add(path.join(MOCK_CWD, "skills", "websculpt-capture-en", "SKILL.md"));
		existingPaths.add(path.join(MOCK_HOME, ".claude", "skills"));
		const result = handleSkillInstall({ name: "capture", global: true });
		expect(result).toEqual({
			success: true,
			results: [
				{ agent: "claude", skill: "websculpt-capture", status: "installed" },
				{ agent: "codex", skill: "websculpt-capture", status: "installed" },
				{ agent: "agents", skill: "websculpt-capture", status: "installed" },
			],
		});
	});
});

describe("handleSkillUninstall", () => {
	let existingPaths: Set<string>;

	beforeEach(() => {
		existingPaths = new Set();
		vi.spyOn(fs, "existsSync").mockImplementation((p: fs.PathLike) => existingPaths.has(String(p)));
		vi.spyOn(fs, "rmSync").mockImplementation(() => undefined);
		vi.spyOn(fs, "readdirSync").mockImplementation((p: fs.PathLike) => {
			const str = String(p);
			if (str === path.join(MOCK_HOME, ".claude", "skills")) {
				return [{ name: "websculpt-explore", isDirectory: () => true }] as unknown as fs.Dirent[];
			}
			return [] as unknown as fs.Dirent[];
		});
		vi.spyOn(os, "homedir").mockReturnValue(MOCK_HOME);
		vi.spyOn(process, "cwd").mockReturnValue(MOCK_CWD);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("removes globally when target exists", () => {
		existingPaths.add(path.join(MOCK_HOME, ".claude", "skills", "websculpt-explore"));
		existingPaths.add(path.join(MOCK_HOME, ".claude", "skills"));
		const result = handleSkillUninstall({ global: true });
		expect(result).toEqual({
			success: true,
			results: [
				{ agent: "claude", skill: "websculpt-explore", status: "removed" },
				{ agent: "codex", skill: "websculpt-explore", status: "not_found" },
				{ agent: "codex", skill: "websculpt-capture", status: "not_found" },
				{ agent: "agents", skill: "websculpt-explore", status: "not_found" },
				{ agent: "agents", skill: "websculpt-capture", status: "not_found" },
			],
		});
	});

	it("returns not_found when target does not exist", () => {
		const result = handleSkillUninstall({ global: true });
		expect(result).toEqual({
			success: true,
			results: [
				{ agent: "claude", skill: "websculpt-explore", status: "not_found" },
				{ agent: "claude", skill: "websculpt-capture", status: "not_found" },
				{ agent: "codex", skill: "websculpt-explore", status: "not_found" },
				{ agent: "codex", skill: "websculpt-capture", status: "not_found" },
				{ agent: "agents", skill: "websculpt-explore", status: "not_found" },
				{ agent: "agents", skill: "websculpt-capture", status: "not_found" },
			],
		});
	});

	it("removes a single skill by name", () => {
		existingPaths.add(path.join(MOCK_HOME, ".claude", "skills", "websculpt-capture"));
		existingPaths.add(path.join(MOCK_HOME, ".claude", "skills"));
		const result = handleSkillUninstall({ global: true, name: "capture" });
		expect(result).toEqual({
			success: true,
			results: [
				{ agent: "claude", skill: "websculpt-capture", status: "removed" },
				{ agent: "codex", skill: "websculpt-capture", status: "not_found" },
				{ agent: "agents", skill: "websculpt-capture", status: "not_found" },
			],
		});
	});
});

describe("handleSkillStatus", () => {
	let existingPaths: Set<string>;

	beforeEach(() => {
		existingPaths = new Set();
		vi.spyOn(os, "homedir").mockReturnValue(MOCK_HOME);
		vi.spyOn(process, "cwd").mockReturnValue(MOCK_CWD);
		vi.spyOn(fs, "existsSync").mockImplementation((p: fs.PathLike) => existingPaths.has(String(p)));
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("shows local-priority with global annotation and not-installed fallback", () => {
		existingPaths.add(path.join(MOCK_CWD, ".claude", "skills", "websculpt-explore"));
		existingPaths.add(path.join(MOCK_HOME, ".claude", "skills", "websculpt-explore"));
		existingPaths.add(path.join(MOCK_HOME, ".codex", "skills", "websculpt-capture"));

		const result = handleSkillStatus();
		expect(result).toEqual({
			success: true,
			lines: [
				"claude:",
				"  websculpt-explore      installed  local",
				"  websculpt-capture      not installed",
				"codex:",
				"  websculpt-explore      not installed",
				"  websculpt-capture      installed  global",
				"agents:",
				"  websculpt-explore      not installed",
				"  websculpt-capture      not installed",
			],
		});
	});
});
