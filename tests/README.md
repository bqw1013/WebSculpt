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

- `tests/e2e/config-init.test.ts`: verifies `config init` bootstraps a fresh `~/.websculpt` home with the default config and an empty command directory.
- `tests/e2e/example-hello.test.ts`: verifies `example hello` returns the expected JSON payload and appends an execution record to `log.jsonl`.
- `tests/e2e/command-create.test.ts`: verifies `command create` registers valid commands from a directory, rejects reserved domains (`command`, `config`), rejects missing or malformed source files (`FILE_NOT_FOUND`, `PARSE_ERROR`, `INVALID_PACKAGE`), fails with `ALREADY_EXISTS` when a command exists without `--force`, overwrites an existing command with `--force`, succeeds without warnings for fully documented packages, and injects missing identity fields (`id`, `domain`, `action`, `runtime`) into the installed manifest.
- `tests/e2e/command-validate.test.ts`: verifies `command validate` preflight mode returns success or warnings (`MISSING_IDENTITY_FIELDS`, `MISSING_README`, `MISSING_CONTEXT`) for valid packages, injection-simulation mode treats missing identity fields as warnings while rejecting mismatches (`ID_MISMATCH`) and reserved domains (`RESERVED_DOMAIN`), and aggregates layered validation errors (L1-L3) into a single `VALIDATION_ERROR` response.
- `tests/e2e/command-draft.test.ts`: verifies `command draft` creates four files with correct runtime-specific structure, supports `--param` pre-filling of manifest and code, produces consumable output for `command create --from-dir`, rejects existing directories without `--force` and overwrites with `--force`, and returns `nextSteps` guidance in JSON mode.
- `tests/e2e/command-registry.test.ts`: verifies `command list` shows built-in and user commands, created user commands execute through the source CLI with passed or defaulted parameters, `command remove` deletes user commands while protecting built-ins.

Maintenance:

- Update this coverage map whenever an e2e file gains a new user-facing scenario or changes the scenario intent it documents.
