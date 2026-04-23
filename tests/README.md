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
- `tests/e2e/command-lifecycle.test.ts`: verifies `command list` shows built-ins and created user commands, `command create` registers valid commands from a directory and rejects reserved domains and invalid manifests (returning structured `VALIDATION_ERROR`), includes asset completeness warnings on success, created user commands execute through the source CLI, `command validate` performs preflight validation with and without domain/action arguments, and `command remove` deletes user commands while protecting built-ins.

Maintenance:

- Update this coverage map whenever an e2e file gains a new user-facing scenario or changes the scenario intent it documents.
