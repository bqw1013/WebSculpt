# Skill References 同步规范

`scripts/build-skills.js` 会将 `src/explore/`、`src/access/playwright-cli/` 和 `src/compile/` 整目录复制到 `skills/websculpt/references/`。

因此，这些目录下的 Markdown 文件内部引用其他文档时，**必须使用相对于该文件所在目录的相对路径**。禁止使用从项目根目录开始的路径（如 `src/...`），否则同步到 references 后链接会断裂。

示例：

- `src/explore/strategy.md` 引用 `src/access/playwright-cli/guide.md` 时，应写为 `../access/playwright-cli/guide.md`
- `src/access/playwright-cli/guide.md` 引用 `src/explore/strategy.md` 时，应写为 `../../explore/strategy.md`
- `src/compile/contract.md` 引用 `src/explore/strategy.md` 时，应写为 `../explore/strategy.md`
