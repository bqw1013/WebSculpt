import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
	createIsolatedHome,
	parseJsonOutput,
	printHeader,
	printSection,
	printSummary,
	removeTempDir,
	runSourceCli,
} from "./_helpers.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
let stepsTotal = 0;
let stepsPassed = 0;

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

async function run() {
	printHeader("Scope");

	const homeDir = await createIsolatedHome();
	const workDir = join(homeDir, "project");
	const subDir = join(workDir, "src");
	await mkdir(subDir, { recursive: true });

	// Register a user command for later filtering tests.
	printSection("Register user command (notes/save)");
	const draftResult = await runSourceCli(
		["command", "draft", "notes", "save", "--runtime", "node", "--to", join(workDir, "draft-cmd"), "--force"],
		homeDir,
	);
	if (draftResult.exitCode !== 0) stepFail(`draft exit ${draftResult.exitCode}`);

	const draftManifestPath = join(workDir, "draft-cmd", "manifest.json");
	const draftManifest = JSON.parse(await readFile(draftManifestPath, "utf8"));
	draftManifest.description = "Smoke-test note save";
	await writeFile(draftManifestPath, JSON.stringify(draftManifest, null, 2));

	const createResult = await runSourceCli(
		[
			"command",
			"create",
			"notes",
			"save",
			"--from-dir",
			join(workDir, "draft-cmd"),
			"--force",
			"--format",
			"json",
		],
		homeDir,
	);
	const createPayload = parseJsonOutput(createResult.stdout);
	if (!createPayload.success) stepFail("command create failed");
	stepOk();

	// scope init
	printSection("scope init");
	const initResult = await runSourceCli(["scope", "init"], homeDir, { cwd: workDir });
	console.log(initResult.stdout);
	if (initResult.exitCode !== 0) stepFail(`exit ${initResult.exitCode}`);
	stepOk();

	// scope init again -> SCOPE_ALREADY_EXISTS
	printSection("scope init again (expect SCOPE_ALREADY_EXISTS)");
	const initAgain = await runSourceCli(["scope", "init", "--format", "json"], homeDir, { cwd: workDir });
	const initAgainPayload = parseJsonOutput(initAgain.stdout);
	if (initAgainPayload.success !== false || initAgainPayload.error?.code !== "SCOPE_ALREADY_EXISTS") {
		stepFail("expected SCOPE_ALREADY_EXISTS");
	}
	stepOk();

	// command list with empty scope
	printSection("command list with empty scope");
	const listEmpty = await runSourceCli(["command", "list", "--format", "json"], homeDir, { cwd: workDir });
	const listEmptyPayload = parseJsonOutput(listEmpty.stdout);
	if (listEmptyPayload.commands.length !== 0) stepFail("expected empty command list");
	stepOk();

	// command list --all
	printSection("command list --all (bypass scope)");
	const listAll = await runSourceCli(["command", "list", "--all", "--format", "json"], homeDir, { cwd: workDir });
	const listAllPayload = parseJsonOutput(listAll.stdout);
	if (listAllPayload.commands.length === 0) stepFail("expected non-empty command list");
	stepOk();

	// scope add zhihu (builtin domain snapshot)
	printSection("scope add zhihu (builtin domain)");
	const addExample = await runSourceCli(["scope", "add", "zhihu"], homeDir, { cwd: workDir });
	if (addExample.exitCode !== 0) stepFail(`exit ${addExample.exitCode}`);
	stepOk();

	// scope add notes/save (single user command)
	printSection("scope add notes/save");
	const addNote = await runSourceCli(["scope", "add", "notes/save"], homeDir, { cwd: workDir });
	if (addNote.exitCode !== 0) stepFail(`exit ${addNote.exitCode}`);
	stepOk();

	// command list filtered
	printSection("command list (filtered by scope)");
	const listFiltered = await runSourceCli(["command", "list", "--format", "json"], homeDir, { cwd: workDir });
	const listFilteredPayload = parseJsonOutput(listFiltered.stdout);
	const ids = listFilteredPayload.commands.map((c) => `${c.domain}/${c.action}`);
	if (!ids.includes("zhihu/get-hot")) stepFail("missing zhihu/get-hot");
	if (!ids.includes("notes/save")) stepFail("missing notes/save");
	if (ids.includes("github/get-trending")) stepFail("github/get-trending should be filtered out");
	stepOk();

	// scope show
	printSection("scope show");
	const showResult = await runSourceCli(["scope", "show", "--format", "json"], homeDir, { cwd: workDir });
	const showPayload = parseJsonOutput(showResult.stdout);
	if (!showPayload.scopeCommands?.some((c) => c.command === "zhihu/get-hot" && c.valid)) {
		stepFail("missing valid zhihu/get-hot");
	}
	if (!showPayload.scopeCommands?.some((c) => c.command === "notes/save" && c.valid)) {
		stepFail("missing valid notes/save");
	}
	stepOk();

	// command list from subdirectory (inherits parent scope)
	printSection("command list from subdirectory (inherits parent scope)");
	const listSub = await runSourceCli(["command", "list", "--format", "json"], homeDir, { cwd: subDir });
	const listSubPayload = parseJsonOutput(listSub.stdout);
	const subIds = listSubPayload.commands.map((c) => `${c.domain}/${c.action}`);
	if (!subIds.includes("zhihu/get-hot")) stepFail("missing zhihu/get-hot in subdir");
	if (!subIds.includes("notes/save")) stepFail("missing notes/save in subdir");
	stepOk();

	// scope remove zhihu/get-hot
	printSection("scope remove zhihu/get-hot");
	const removeExample = await runSourceCli(["scope", "remove", "zhihu/get-hot"], homeDir, { cwd: workDir });
	if (removeExample.exitCode !== 0) stepFail(`exit ${removeExample.exitCode}`);
	stepOk();

	// command list after remove
	printSection("command list after removing zhihu/get-hot");
	const listAfterRemove = await runSourceCli(["command", "list", "--format", "json"], homeDir, { cwd: workDir });
	const listAfterRemovePayload = parseJsonOutput(listAfterRemove.stdout);
	const idsAfter = listAfterRemovePayload.commands.map((c) => `${c.domain}/${c.action}`);
	if (idsAfter.includes("zhihu/get-hot")) stepFail("zhihu/get-hot should be removed");
	if (!idsAfter.includes("notes/save")) stepFail("missing notes/save");
	stepOk();

	// scope destroy
	printSection("scope destroy");
	const destroyResult = await runSourceCli(["scope", "destroy"], homeDir, { cwd: workDir });
	if (destroyResult.exitCode !== 0) stepFail(`exit ${destroyResult.exitCode}`);
	stepOk();

	// command list after destroy (back to full visibility)
	printSection("command list after destroy (full visibility)");
	const listFull = await runSourceCli(["command", "list", "--format", "json"], homeDir, { cwd: workDir });
	const listFullPayload = parseJsonOutput(listFull.stdout);
	if (listFullPayload.commands.length === 0) stepFail("expected full command list");
	stepOk();

	// Cleanup
	printSection("Cleanup temp dir");
	await removeTempDir(homeDir);
	stepOk();

	printSummary(stepsTotal, stepsPassed);
}

run().catch((e) => {
	console.error(e);
	process.exit(1);
});
