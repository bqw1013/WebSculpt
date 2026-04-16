# Tests Layout

The test suite is organized by feedback speed and boundary depth:

- `tests/unit`: fast module-level tests for pure logic and stable contracts.
- `tests/integration`: multi-module tests that can touch the filesystem or command registry without spawning the full CLI process.
- `tests/e2e`: CLI process tests for a small number of user-facing flows and output contracts.

Guidelines:

- Prefer `unit` or `integration` when a behavior can be verified without a full CLI spawn.
- Keep `e2e` focused on critical user journeys and process-level guarantees.
- Put shared helpers under the narrowest layer that needs them. Only place helpers in `tests/e2e/helpers` when they are specific to end-to-end CLI execution.
