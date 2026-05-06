import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
	parseJsonOutput,
	printHeader,
	printSection,
	printSummary,
	removeTempDir,
	runSourceCli,
} from "./_helpers.mjs";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..", "..", "..");
const TMP_DIR = resolve(REPO_ROOT, ".tmp/manual-meta-command");
let stepsTotal = 0;
let stepsPassed = 0;

// ---------------------------------------------------------------------------
// Step helpers
// ---------------------------------------------------------------------------
function stepOk() {
	stepsTotal++;
	stepsPassed++;
	console.log("Result: OK");
}

function stepFail(reason) {
	stepsTotal++;
	console.log(`Result: FAIL — ${reason}`);
	process.exit(1);
}

// ---------------------------------------------------------------------------
// Execution
// ---------------------------------------------------------------------------
async function run() {
	printHeader("Meta Commands");

	printSection("Cleanup temp dir");
	await removeTempDir(TMP_DIR);
	await mkdir(TMP_DIR, { recursive: true });
	stepOk();

	printSection("command list");
	const listResult = await runSourceCli(["command", "list"]);
	console.log(listResult.stdout);
	if (listResult.exitCode !== 0) stepFail(`exit ${listResult.exitCode}`);
	stepOk();

	printSection("command show github list-trending");
	const show1 = await runSourceCli(["command", "show", "github", "list-trending"]);
	console.log(show1.stdout);
	if (show1.exitCode !== 0) stepFail(`exit ${show1.exitCode}`);
	stepOk();

	printSection("command show hackernews list-top --include-readme");
	const show2 = await runSourceCli(["command", "show", "hackernews", "list-top", "--include-readme"]);
	console.log(show2.stdout);
	if (show2.exitCode !== 0) stepFail(`exit ${show2.exitCode}`);
	stepOk();

	printSection("command draft");
	const draftResult = await runSourceCli([
		"command", "draft", "manual-draft", "draft-cmd",
		"--runtime", "node",
		"--to", `${TMP_DIR}/draft-cmd`,
		"--force",
	]);
	console.log(draftResult.stdout);
	if (draftResult.exitCode !== 0) stepFail(`exit ${draftResult.exitCode}`);
	stepOk();

	printSection("validate freshly drafted command");
	// Draft manifest has no description by design; inject one so we can verify
	// the template-generated README/context sections do not produce unexpected warnings.
	const draftManifestPath = `${TMP_DIR}/draft-cmd/manifest.json`;
	const draftManifest = JSON.parse(await readFile(draftManifestPath, "utf8"));
	draftManifest.description = "Smoke-test draft command";
	await writeFile(draftManifestPath, JSON.stringify(draftManifest, null, 2));

	const draftValidateResult = await runSourceCli([
		"command", "validate", "--from-dir", `${TMP_DIR}/draft-cmd`, "--format", "json",
	]);
	console.log(draftValidateResult.stdout);
	stepsTotal++;
	const draftValidatePayload = parseJsonOutput(draftValidateResult.stdout);
	if (draftValidatePayload.success === false) {
		console.log("Result: FAIL — draft validate returned success=false");
		process.exit(1);
	}
	const unexpectedWarnings = (draftValidatePayload.warnings || []).filter(
		(w) => w.code === "MISSING_CONTEXT_SECTION" || w.code === "MISSING_README_SECTION",
	);
	if (unexpectedWarnings.length > 0) {
		console.log("Result: FAIL — unexpected section warnings from draft template:", JSON.stringify(unexpectedWarnings));
		process.exit(1);
	}
	stepsPassed++;
	console.log("Result: OK");

	printSection("verify draft files exist");
	try {
		await readFile(`${TMP_DIR}/draft-cmd/manifest.json`);
		await readFile(`${TMP_DIR}/draft-cmd/command.js`);
		await readFile(`${TMP_DIR}/draft-cmd/README.md`);
		await readFile(`${TMP_DIR}/draft-cmd/context.md`);
		stepOk();
	} catch (e) {
		stepFail(e.message);
	}

	printSection("prepare validate target (copy builtin hackernews/list-top)");
	const builtinDir = resolve(REPO_ROOT, "src/cli/builtin/hackernews/list-top");
	const validateDir = `${TMP_DIR}/validate-cmd`;
	await mkdir(validateDir, { recursive: true });
	// Node >=16.7.0 supports fs.cp via fs/promises in Node 18+
	const { cp } = await import("node:fs/promises");
	await cp(builtinDir, validateDir, { recursive: true, force: true });

	const manifestPath = join(validateDir, "manifest.json");
	const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
	manifest.id = "manualvalidate-cmd";
	manifest.domain = "manualvalidate";
	manifest.action = "cmd";
	await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
	console.log("manifest updated:", JSON.stringify({ id: manifest.id, domain: manifest.domain, action: manifest.action }));
	stepOk();

	printSection("command validate");
	const validateResult = await runSourceCli([
		"command", "validate", "manualvalidate", "cmd",
		"--from-dir", validateDir,
		"--format", "json",
	]);
	console.log(validateResult.stdout);
	stepsTotal++;
	const validatePayload = parseJsonOutput(validateResult.stdout);
	if (validatePayload.success === false) {
		console.log("Result: FAIL — validate returned success=false");
		process.exit(1);
	}
	stepsPassed++;
	console.log("Result: OK");

	printSection("command create");
	const createResult = await runSourceCli([
		"command", "create", "manualvalidate", "cmd",
		"--from-dir", validateDir,
		"--force",
		"--format", "json",
	]);
	console.log(createResult.stdout);
	stepsTotal++;
	const createPayload = parseJsonOutput(createResult.stdout);
	if (createPayload.success === false) {
		console.log("Result: FAIL — create returned success=false");
		process.exit(1);
	}
	stepsPassed++;
	console.log("Result: OK");

	printSection("command show created");
	const showCreated = await runSourceCli(["command", "show", "manualvalidate", "cmd"]);
	console.log(showCreated.stdout);
	if (showCreated.exitCode !== 0) stepFail(`exit ${showCreated.exitCode}`);
	stepOk();

	printSection("command list after create");
	const listAfterCreate = await runSourceCli(["command", "list"]);
	console.log(listAfterCreate.stdout);
	if (listAfterCreate.exitCode !== 0) stepFail(`exit ${listAfterCreate.exitCode}`);
	stepOk();

	printSection("command remove");
	const removeResult = await runSourceCli(["command", "remove", "manualvalidate", "cmd"]);
	console.log(removeResult.stdout);
	if (removeResult.exitCode !== 0) stepFail(`exit ${removeResult.exitCode}`);
	stepOk();

	printSection("command list after remove");
	const listAfterRemove = await runSourceCli(["command", "list"]);
	console.log(listAfterRemove.stdout);
	if (listAfterRemove.exitCode !== 0) stepFail(`exit ${listAfterRemove.exitCode}`);
	stepOk();

	printSection("Cleanup temp dir");
	await removeTempDir(TMP_DIR);
	stepOk();

	printSummary(stepsTotal, stepsPassed);
}

run().catch((e) => {
	console.error(e);
	process.exit(1);
});
