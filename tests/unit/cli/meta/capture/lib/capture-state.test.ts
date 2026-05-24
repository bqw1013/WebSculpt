import { describe, expect, it } from "vitest";
import {
	type CaptureArtifactsStatus,
	deriveCommandState,
	deriveContextState,
	deriveEvidenceState,
	deriveManifestState,
	deriveNextAction,
	deriveReadmeState,
	deriveValidationState,
} from "../../../../../../src/cli/meta/capture/lib/capture-state.js";

// ---------------------------------------------------------------------------
// deriveEvidenceState
// ---------------------------------------------------------------------------

describe("deriveEvidenceState", () => {
	it("returns done when audit passes", () => {
		const result = deriveEvidenceState({
			passed: true,
			missingHeadings: [],
			emptyHeadings: [],
			keywordGaps: [],
		});
		expect(result.status).toBe("done");
		expect(result.detail).toEqual({ keywordGaps: [] });
	});

	it("returns blocked with missing and empty headings", () => {
		const result = deriveEvidenceState({
			passed: false,
			missingHeadings: ["Failure Signals"],
			emptyHeadings: ["Capture Assessment"],
			keywordGaps: [],
		});
		expect(result.status).toBe("blocked");
		expect(result.reason).toBe("Missing headings: Failure Signals; Empty headings: Capture Assessment");
		expect(result.detail).toEqual({
			missingHeadings: ["Failure Signals"],
			emptyHeadings: ["Capture Assessment"],
			keywordGaps: [],
		});
	});

	it("includes keyword gaps in detail even when passed", () => {
		const result = deriveEvidenceState({
			passed: true,
			missingHeadings: [],
			emptyHeadings: [],
			keywordGaps: ["guide-read"],
		});
		expect(result.status).toBe("done");
		expect(result.detail).toEqual({ keywordGaps: ["guide-read"] });
	});
});

// ---------------------------------------------------------------------------
// deriveCommandState
// ---------------------------------------------------------------------------

describe("deriveCommandState", () => {
	it("returns blocked when evidence is not complete", () => {
		const result = deriveCommandState(false, undefined, "some content");
		expect(result.status).toBe("blocked");
		expect(result.reason).toBe("Evidence is not complete");
	});

	it("returns blocked when manifest mismatch exists", () => {
		const result = deriveCommandState(
			true,
			'Manifest runtime "browser" does not match capture runtime "node"',
			"content",
		);
		expect(result.status).toBe("blocked");
		expect(result.reason).toBe('Manifest runtime "browser" does not match capture runtime "node"');
	});

	it("returns blocked when command file is missing", () => {
		const result = deriveCommandState(true, undefined, "");
		expect(result.status).toBe("blocked");
		expect(result.reason).toBe("Command file not found");
	});

	it("returns ready when content contains a TODO marker", () => {
		const result = deriveCommandState(true, undefined, "// TODO: implement command logic");
		expect(result.status).toBe("ready");
	});

	it("returns ready when content contains the browser TODO marker", () => {
		const result = deriveCommandState(true, undefined, "// TODO: implement command logic using page");
		expect(result.status).toBe("ready");
	});

	it("returns done when content has no TODO markers", () => {
		const result = deriveCommandState(true, undefined, "export default async function() { return {}; }");
		expect(result.status).toBe("done");
	});
});

// ---------------------------------------------------------------------------
// deriveManifestState
// ---------------------------------------------------------------------------

describe("deriveManifestState", () => {
	const baseInspection = {
		content: "{}",
		manifest: { domain: "example", action: "collect", runtime: "node", description: "Collects data" },
	};

	it("returns blocked on manifest mismatch", () => {
		const result = deriveManifestState("Manifest domain mismatch", "done", baseInspection);
		expect(result.status).toBe("blocked");
		expect(result.reason).toBe("Manifest domain mismatch");
	});

	it("returns blocked when command is not done", () => {
		const result = deriveManifestState(undefined, "ready", baseInspection);
		expect(result.status).toBe("blocked");
		expect(result.reason).toBe("Command is not complete");
	});

	it("returns blocked when manifest file is not found", () => {
		const result = deriveManifestState(undefined, "done", { content: "", invalidReason: "Manifest file not found" });
		expect(result.status).toBe("blocked");
		expect(result.reason).toBe("Manifest file not found");
	});

	it("returns blocked when manifest JSON is invalid", () => {
		const result = deriveManifestState(undefined, "done", {
			content: "bad",
			invalidReason: "Manifest JSON is invalid",
		});
		expect(result.status).toBe("blocked");
		expect(result.reason).toBe("Manifest JSON is invalid");
	});

	it("returns ready when description is empty string", () => {
		const result = deriveManifestState(undefined, "done", {
			content: "{}",
			manifest: { description: "" },
		});
		expect(result.status).toBe("ready");
	});

	it("returns ready when description is whitespace only", () => {
		const result = deriveManifestState(undefined, "done", {
			content: "{}",
			manifest: { description: "   " },
		});
		expect(result.status).toBe("ready");
	});

	it("returns ready when description is missing", () => {
		const result = deriveManifestState(undefined, "done", {
			content: "{}",
			manifest: {},
		});
		expect(result.status).toBe("ready");
	});

	it("returns done when description is present", () => {
		const result = deriveManifestState(undefined, "done", {
			content: "{}",
			manifest: { description: "Collects data" },
		});
		expect(result.status).toBe("done");
	});
});

// ---------------------------------------------------------------------------
// deriveReadmeState
// ---------------------------------------------------------------------------

describe("deriveReadmeState", () => {
	it("returns blocked on manifest mismatch", () => {
		const result = deriveReadmeState("Mismatch", "done", "content");
		expect(result.status).toBe("blocked");
		expect(result.reason).toBe("Mismatch");
	});

	it("returns blocked when manifest is not done", () => {
		const result = deriveReadmeState(undefined, "ready", "content");
		expect(result.status).toBe("blocked");
		expect(result.reason).toBe("Manifest is not complete");
	});

	it("returns blocked when README is missing", () => {
		const result = deriveReadmeState(undefined, "done", "");
		expect(result.status).toBe("blocked");
		expect(result.reason).toBe("README file not found");
	});

	it("returns ready when README contains TODO", () => {
		const result = deriveReadmeState(undefined, "done", "# Title\n\nTODO: describe");
		expect(result.status).toBe("ready");
	});

	it("returns done when README has no TODO", () => {
		const result = deriveReadmeState(undefined, "done", "# Title\n\nComplete.");
		expect(result.status).toBe("done");
	});
});

// ---------------------------------------------------------------------------
// deriveContextState
// ---------------------------------------------------------------------------

describe("deriveContextState", () => {
	it("returns blocked on manifest mismatch", () => {
		const result = deriveContextState("Mismatch", "done", "content");
		expect(result.status).toBe("blocked");
		expect(result.reason).toBe("Mismatch");
	});

	it("returns blocked when README is not done", () => {
		const result = deriveContextState(undefined, "ready", "content");
		expect(result.status).toBe("blocked");
		expect(result.reason).toBe("README is not complete");
	});

	it("returns blocked when context is missing", () => {
		const result = deriveContextState(undefined, "done", "");
		expect(result.status).toBe("blocked");
		expect(result.reason).toBe("Context file not found");
	});

	it("returns ready when context contains TODO", () => {
		const result = deriveContextState(undefined, "done", "# Context\n\nTODO: fill");
		expect(result.status).toBe("ready");
	});

	it("returns done when context has no TODO", () => {
		const result = deriveContextState(undefined, "done", "# Context\n\nComplete.");
		expect(result.status).toBe("done");
	});
});

// ---------------------------------------------------------------------------
// deriveValidationState
// ---------------------------------------------------------------------------

describe("deriveValidationState", () => {
	it("returns blocked on manifest mismatch", () => {
		const result = deriveValidationState("Mismatch", true, { success: true, timestamp: "t" }, "fp");
		expect(result.status).toBe("blocked");
		expect(result.reason).toBe("Mismatch");
	});

	it("returns blocked when draft artifacts are not complete", () => {
		const result = deriveValidationState(undefined, false, { success: true, timestamp: "t" }, "fp");
		expect(result.status).toBe("blocked");
		expect(result.reason).toBe("Draft artifacts are not complete");
	});

	it("returns blocked when validation record is missing", () => {
		const result = deriveValidationState(undefined, true, undefined, "fp");
		expect(result.status).toBe("blocked");
		expect(result.reason).toBe("Run `capture validate`");
	});

	it("returns blocked with failed detail when validation success is false", () => {
		const result = deriveValidationState(undefined, true, { success: false, timestamp: "t" }, "fp");
		expect(result.status).toBe("blocked");
		expect(result.reason).toBe("Last validation failed");
		expect(result.detail).toEqual({ lastResult: "failed" });
	});

	it("returns blocked with stale detail when fingerprint mismatches", () => {
		const result = deriveValidationState(
			undefined,
			true,
			{ success: true, draftFingerprint: "old", timestamp: "t" },
			"new",
		);
		expect(result.status).toBe("blocked");
		expect(result.reason).toBe("Draft changed after last validation");
		expect(result.detail).toEqual({ lastResult: "stale" });
	});

	it("returns blocked with stale detail when fingerprint is missing", () => {
		const result = deriveValidationState(undefined, true, { success: true, timestamp: "t" }, "fp");
		expect(result.status).toBe("blocked");
		expect(result.reason).toBe("Draft changed after last validation");
		expect(result.detail).toEqual({ lastResult: "stale" });
	});

	it("returns done when validation passes and fingerprint matches", () => {
		const result = deriveValidationState(
			undefined,
			true,
			{ success: true, draftFingerprint: "fp", timestamp: "t" },
			"fp",
		);
		expect(result.status).toBe("done");
	});
});

// ---------------------------------------------------------------------------
// deriveNextAction
// ---------------------------------------------------------------------------

describe("deriveNextAction", () => {
	const allDone: CaptureArtifactsStatus = {
		evidence: { status: "done" },
		command: { status: "done" },
		manifest: { status: "done" },
		readme: { status: "done" },
		context: { status: "done" },
		validation: { status: "done" },
	};

	it("returns fill-evidence when evidence is not done", () => {
		const artifacts = { ...allDone, evidence: { status: "blocked", reason: "missing" } };
		const result = deriveNextAction(artifacts, "node");
		expect(result.nextAction).toBe("fill-evidence");
		expect(result.nextTarget).toBe("evidence.md");
	});

	it("returns fill-manifest when manifest mismatch exists", () => {
		const artifacts = { ...allDone, command: { status: "blocked", reason: "mismatch" } };
		const result = deriveNextAction(artifacts, "node", "Manifest mismatch");
		expect(result.nextAction).toBe("fill-manifest");
		expect(result.nextTarget).toBe("manifest.json");
	});

	it("returns fill-command with runtime-specific entry file", () => {
		const artifacts = { ...allDone, command: { status: "ready" } };
		const result = deriveNextAction(artifacts, "browser");
		expect(result.nextAction).toBe("fill-command");
		expect(result.nextTarget).toBe("command.js");
	});

	it("returns fill-manifest when manifest is not done", () => {
		const artifacts = { ...allDone, manifest: { status: "ready" } };
		const result = deriveNextAction(artifacts, "node");
		expect(result.nextAction).toBe("fill-manifest");
		expect(result.nextTarget).toBe("manifest.json");
	});

	it("returns fill-readme when readme is not done", () => {
		const artifacts = { ...allDone, readme: { status: "ready" } };
		const result = deriveNextAction(artifacts, "node");
		expect(result.nextAction).toBe("fill-readme");
		expect(result.nextTarget).toBe("README.md");
	});

	it("returns fill-context when context is not done", () => {
		const artifacts = { ...allDone, context: { status: "ready" } };
		const result = deriveNextAction(artifacts, "node");
		expect(result.nextAction).toBe("fill-context");
		expect(result.nextTarget).toBe("context.md");
	});

	it("returns validate when validation is not done", () => {
		const artifacts = { ...allDone, validation: { status: "blocked", reason: "missing" } };
		const result = deriveNextAction(artifacts, "node");
		expect(result.nextAction).toBe("validate");
		expect(result.nextTarget).toBeUndefined();
	});

	it("returns finalize when all artifacts are done", () => {
		const result = deriveNextAction(allDone, "node");
		expect(result.nextAction).toBe("finalize");
		expect(result.nextTarget).toBeUndefined();
	});

	it("prioritizes evidence over manifest mismatch", () => {
		const artifacts = {
			...allDone,
			evidence: { status: "blocked", reason: "missing" },
			command: { status: "blocked", reason: "mismatch" },
		};
		const result = deriveNextAction(artifacts, "node", "Mismatch");
		expect(result.nextAction).toBe("fill-evidence");
	});
});
