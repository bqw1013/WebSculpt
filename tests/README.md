# Tests Layout

The test suite is organized by feedback speed and boundary depth:

- `tests/unit`: fast module-level tests for pure logic and stable contracts.
- `tests/integration`: multi-module tests that can touch the filesystem or command registry without spawning the full CLI process.
- `tests/e2e`: CLI process tests for a small number of user-facing flows and output contracts.

Guidelines:

- Prefer `unit` or `integration` when a behavior can be verified without a full CLI spawn.
- Keep `e2e` focused on critical user journeys and process-level guarantees.
- Put shared helpers under the narrowest layer that needs them. Only place helpers in `tests/e2e/helpers` when they are specific to end-to-end CLI execution.

## E2E Coverage Map

- `tests/e2e/config-init.test.ts`: verifies `config init` bootstraps a fresh `~/.websculpt` home with the default config and an empty command directory, and that the home is lazily initialized on the first CLI invocation even when `config init` is not explicitly run.
- `tests/e2e/example-hello.test.ts`: verifies `example hello` returns the expected JSON payload and appends an execution record to `log.jsonl`.
- `tests/e2e/command-create.test.ts`: verifies `command create` registers valid commands from a directory, rejects reserved domains (`command`, `config`, `daemon`, `capture`, `scope`, `explore`), rejects missing or malformed source files (`INVALID_PACKAGE`), fails with `ALREADY_EXISTS` when a command exists without `--force`, overwrites an existing command with `--force`, succeeds without warnings for fully documented packages, and injects missing identity fields (`id`, `domain`, `action`, `runtime`) into the installed manifest.
- `tests/e2e/capture-new.test.ts`: verifies `capture new` creates the capture workspace, writes `capture.yaml`, `evidence.md`, and runtime-specific draft files, returns snapshot data, rejects invalid names, reserved domains, duplicate workspaces, and user command conflicts, warns on builtin conflicts, and overwrites workspaces with `--force`.
- `tests/e2e/capture-status.test.ts`: verifies `capture status` computes artifact states from workspace files, reports next actions, blocks manifest identity mismatches and invalid manifest JSON without crashing, detects remaining TODO markers, invalidates stale validation results, and handles state regression.
- `tests/e2e/capture-validate.test.ts`: verifies `capture validate` delegates to command validation, persists success/failure records with draft fingerprints, overwrites previous validation results, rejects manifest identity mismatches, and handles missing workspaces.
- `tests/e2e/capture-finalize.test.ts`: verifies `capture finalize` installs only after fresh successful validation and evidence audit, rejects missing/failed/stale validation and incomplete evidence, preserves workspaces, and overwrites user-command conflicts that were explicitly allowed at capture creation.
- `tests/e2e/command-validate.test.ts`: verifies `command validate` preflight mode returns success or warnings (`MISSING_IDENTITY_FIELDS`, `MISSING_README`, `MISSING_CONTEXT`) for valid packages, injection-simulation mode treats missing identity fields as warnings while rejecting mismatches (`ID_MISMATCH`) and reserved domains (`RESERVED_DOMAIN`), and aggregates layered validation errors (L1-L3) into a single `VALIDATION_ERROR` response.
- `tests/e2e/command-draft.test.ts`: verifies `command draft` creates four files with correct runtime-specific structure, supports `--param` pre-filling of manifest and code, produces consumable output for `command create --from-dir`, rejects existing directories without `--force` and overwrites with `--force`, and returns `nextSteps` guidance in JSON mode.
- `tests/e2e/command-export.test.ts`: verifies `command export` exports all resolved commands, a single domain, a single domain/action, and a union of mixed identifiers, returns `NO_COMMANDS_MATCHED` when no commands match, rejects non-empty target directory without `--force` (`DIRECTORY_NOT_EMPTY`), overwrites with `--force`, and emits `EVIDENCE_INCLUDED` warning when commands contain `evidence.md`.
- `tests/e2e/command-import.test.ts`: verifies `command import` installs all commands with no conflicts (including identity field injection), skips existing commands by default, overwrites with `--force`, validates and reports conflicts without writing with `--dry-run`, rejects missing `commands/` directory (`MISSING_COMMANDS_DIR`), rejects `index.json` mismatches in both directions (`INDEX_MISMATCH`), aborts with `VALIDATION_ERROR` on failed commands with no side effects, discovers commands by scanning `commands/` when `index.json` is absent, and rejects reserved domain commands during validation.
- `tests/e2e/command-registry.test.ts`: verifies `command list` shows built-in and user commands, created user commands execute through the source CLI with passed or defaulted parameters, `command remove` deletes user commands while protecting built-ins, and the registry index is generated on first startup, reused when valid, rebuilt after `command create` and `command remove`, recovered when corrupted, and regenerated when the stored `appVersion` is stale.
- `tests/e2e/explore-new.test.ts`: verifies `explore new` creates an explore workspace with `explore.yaml` and `trace.md`, rejects invalid names, rejects duplicate workspaces without `--force`, and overwrites existing workspaces with `--force`.
- `tests/e2e/explore-assess.test.ts`: verifies `explore assess` passes for complete traces with or without candidate, fails on missing headings, empty headings, missing verified URLs, and missing browser guide acknowledgments, and persists assessment results to `explore.yaml`.
- `tests/e2e/scope.test.ts`: verifies `scope init` and `scope destroy` manage the local `.websculpt/scope.json`, `scope show` lists configured commands with validity markers, `scope add` and `scope remove` manage the whitelist, `command list` filters by nearest scope and supports `--all` to bypass filtering, empty scopes yield empty lists, builtin commands are also filtered, and `capture finalize` auto-appends the new command to the active scope.

Maintenance:

- Update this coverage map whenever an e2e file gains a new user-facing scenario or changes the scenario intent it documents.
