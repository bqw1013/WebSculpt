# WebSculpt OpenClaw Plugin

This directory contains the OpenClaw native plugin for WebSculpt. It bundles the WebSculpt CLI, `@playwright/cli`, and the four lifecycle skills (`explore`, `capture`, `maintain`, `library`) into a single ClawHub package.

## Build

```bash
node scripts/build-openclaw-plugin.js
```

This validates the plugin locally and produces a tarball under `plugins/openclaw/`.

## Publish

```bash
node scripts/build-openclaw-plugin.js --publish
```

Requirements:
- Run in an environment where the `clawhub` CLI is available.
- Push the latest source to GitHub first, because ClawHub validates the source commit.
- The command automatically resolves the next patch version from the latest release on ClawHub.

## Configuration

Edit `scripts/openclaw-plugin-config.json` to adjust:

- `version`: leave empty for automatic patch bump, or set a fixed version.
- `keywords`: search keywords on ClawHub.
- `includePlaywrightCli`: whether to bundle `@playwright/cli`.
- `skillSources`: source directories for the four skills.

## Notes

- The plugin is published as `@bqw1013/websculpt-plugin` on ClawHub.
- ClawHub flags this community plugin as `suspicious` because it installs CLI tools that perform browser automation. Users must install with `--acknowledge-clawhub-risk`.
