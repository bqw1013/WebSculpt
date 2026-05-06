# Agent Guidelines

## Code Quality

- Avoid using the `any` type unless absolutely necessary.
- Consult type definitions for external APIs in `node_modules`; do not guess.
- **Never use inline imports** — do not use `await import("./foo.js")`, `import("pkg").Type` in type positions, or dynamic imports for types. Always use standard top-level imports.
- Do not remove or downgrade code to fix type errors caused by outdated dependencies; upgrade the dependencies instead.
- Ask before deleting functionality or code that appears intentional.
- Do not preserve backward compatibility unless explicitly requested.

### Comment Standards

- **All code comments must be in English.**
- **Prefer self-explanatory types and names; avoid pointless comments.** Do not write uninformative comments like `// create a variable`.
- **Complex or non-obvious logic must have inline comments explaining "why", not "what".**
- **`export`ed public functions / interfaces / types should include JSDoc**, describing their responsibilities and key parameters.
- **Do not keep old commented-out code in the codebase.** Use Git for historical versions; do not leave it in files as a backup.

## Cross-Platform Compatibility

- Code must run on both Windows and Linux/macOS.
- In npm scripts, chain commands with `&&`; do not use `;` (not supported by Windows cmd).
- Use Node.js `path` / `os` modules for file paths; do not hardcode Windows paths (e.g., `C:\`) or concatenate paths with backslashes.
- Avoid committing Windows-specific scripts (`.bat`, `.cmd`, `.ps1`). If platform-specific logic is necessary, use `process.platform` for compatibility.

## Command Execution

- After code changes (except documentation changes): run the project's type-checking / validation / lint commands, and fix all errors before finishing.
- Run specific tests only when instructed; if you create or modify test files, you **must** run the test and iterate until it passes.

## E2E Test Readability

- When modifying or adding e2e tests, group by command or capability first; when one file covers multiple related scenarios, use `describe(...)` to clarify hierarchy.
- `describe(...)` and `it(...)` names should directly express the primary user-visible behavior or result, not read like step-by-step execution logs.
- When an `it(...)` title carries multiple parallel primary objectives, prefer splitting it into multiple cases; keep them together only when they cannot be separated in the workflow context.
- Add a brief English comment explaining why only when a setup block's purpose is non-obvious and it exists solely to support subsequent assertions; do not use comments to restate obvious execution steps.
- When e2e coverage changes substantially, or the intended scenarios in an e2e file change, update the `E2E Coverage Map` in `tests/README.md` within the same change.

## Tool Usage

- **Never use `sed`/`cat` to read files or specific ranges of a file.** Always use dedicated read tools (use offset + limit for large reads).
- **Before editing, you must read every file you intend to modify in full.**

## Git

- **Only commit files you modified in this session.**
- Never use `git add -A` or `git add .` — this will commit changes from other agents as well.
- Always use `git add <specific-file-path>`, listing only the files you modified.
- Before committing, run `git status` to confirm the staging area contains only your files.
- Record files created / modified / deleted in this session.

## Communication Style

- Keep answers short and concise.
- Do not use emoji in commits, issues, PR comments, or code.
- Do not write filler or overly enthusiastic fluff.
- Use technical language only; be friendly but direct.
