# Skill References Synchronization

`scripts/build-skills.js` copies the entire directories `src/explore/`, `src/access/playwright-cli/`, and `src/compile/` into `skills/websculpt/references/`.

Therefore, Markdown files in these directories must use relative paths relative to the file's own directory when linking to other documents. Absolute paths from the project root (such as `src/...`) are prohibited, as they will break after synchronization to references.

Examples:

- `src/explore/strategy.md` linking to `src/access/playwright-cli/guide.md` should use `../access/playwright-cli/guide.md`
- `src/access/playwright-cli/guide.md` linking to `src/explore/strategy.md` should use `../../explore/strategy.md`
- `src/compile/contract.md` linking to `src/explore/strategy.md` should use `../explore/strategy.md`
