/** Names of files that make up a capture workspace and its draft. */
export const ARTIFACT_FILES = {
	captureYaml: "capture.yaml",
	evidence: "evidence.md",
	manifest: "manifest.json",
	readme: "README.md",
	context: "context.md",
	validation: "validation.json",
} as const;

/** Markers that indicate the command entry file is still a template. */
export const COMMAND_TODO_MARKERS = [
	"TODO: implement command logic",
	"TODO: implement command logic using page",
] as const;
