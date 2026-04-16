## 1. Core Implementation

- [x] 1.1 Implement `handleCommandRemove` in `src/cli/meta/command.ts`
  - Resolve the command via `findCommand` and reject built-ins with `CANNOT_REMOVE_BUILTIN`
  - Recursively delete the action directory (`~/.websculpt/commands/<domain>/<action>/`)
  - Clean up the empty parent domain directory if applicable
  - Return structured JSON on success (`{ success: true, command: "domain/action" }`)
  - Return structured JSON on errors (`NOT_FOUND`, `REMOVE_ERROR`)

## 2. Testing

- [x] 2.1 Add e2e test for successful command removal (create -> remove -> list confirms absence)
- [x] 2.2 Add e2e test for forbidden built-in command removal
- [x] 2.3 Run the full test suite and fix any failures

## 3. Verification

- [x] 3.1 Run TypeScript type checking and ensure no errors
- [x] 3.2 Run lint / format checks and ensure no errors
