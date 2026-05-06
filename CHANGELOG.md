# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- **Breaking**: Renamed the browser automation runtime identifier from `playwright-cli` to `browser` across the entire framework. The `playwright-cli` shell binary and `@playwright/cli` npm package names remain unchanged.

### Fixed

- Registry index now correctly rebuilds when a builtin command's `runtime` field changes, preventing stale cached values from causing runtime mis-dispatch.

## [0.1.0] - 2026-05-01

### Added

- Initial open-source release of the WebSculpt CLI framework.
- Supported runtimes: `node` and `playwright-cli`.
- Command lifecycle: `draft`, `validate`, `create`, and execution.
- L1-L3 validation pipeline for command packages (structure, compliance, contract).
- Registry index caching via `~/.websculpt/registry-index.json` for fast command discovery.
- Built-in meta commands: `command`, `config`, `skill`.
- Command precipitation workflow with mandatory proposal and human confirmation.
- Playwright CLI access layer with behavioral constraints and connection guides.
- Exploration strategy documentation for multi-tool orchestration.

### Known Limitations

- `shell` and `python` runtimes are reserved but not yet executable.
- Self-healing loop is designed but not automated (no periodic checks or version diffing).
- Configuration system generates `~/.websculpt/config.json` but no business logic consumes it yet.
- No log rotation or cleanup for `~/.websculpt/log.jsonl`.
- `skill status` lacks a `--format json` output mode.
- Command precipitation proposals exist only in the interaction context; no persistent storage.
