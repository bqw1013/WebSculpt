## 1. Output layer

- [x] 1.1 Add `renderOutput(result, format)` to `src/cli/output.ts` with JSON and human branches.
- [x] 1.2 Implement human renderers for create, remove, init, show, and list results.

## 2. Meta command handlers

- [x] 2.1 Refactor `handleCommandCreate` in `src/cli/meta/command.ts` to return result objects instead of calling `printJson`.
- [x] 2.2 Refactor `handleCommandRemove` in `src/cli/meta/command.ts` to return result objects instead of calling `printJson`.
- [x] 2.3 Refactor `handleCommandList` in `src/cli/meta/command.ts` to return a result object instead of printing a table.
- [x] 2.4 Refactor `handleCommandShow` in `src/cli/meta/command.ts` to return a result object instead of plain text.
- [x] 2.5 Refactor `handleConfigInit` in `src/cli/meta/config.ts` to return a result object instead of plain text.

## 3. CLI wiring

- [x] 3.1 Register `--format <human|json>` and `-f` shorthand on the root `program` in `src/cli/index.ts`.
- [x] 3.2 Update every meta command action wrapper in `src/cli/index.ts` to call `renderOutput` with the handler result and `program.opts().format`.

## 4. Tests and validation

- [x] 4.1 Update or add unit tests for `renderOutput` covering both JSON and human modes.
- [x] 4.2 Update tests for meta command handlers to assert on return values instead of stdout.
- [x] 4.3 Run the full test suite and fix any regressions.
- [x] 4.4 Run type check / lint and fix all errors.
