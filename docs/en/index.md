# WebSculpt

A self-evolving browser-use harness built on CLI procedural memory. Distill the paths an Agent explores successfully in the browser into local commands; the library grows with every use.

The system runs a three-stage loop of **explore → capture → command**: exploring completes the task and surfaces reusable paths, capture freezes a path into a command asset, and the command stage lets the CLI discover, schedule, and reuse it.

## Start Here

- [CLI Reference](CLI.md) — Usage, parameters, output contracts, and known limitations for all Meta commands
- [Architecture](Architecture.md) — Four-layer architecture, runtime model, and directory layout
- [Capture](Capture.md) — Design intent of the distillation workflow: six-artifact pipeline, state machine, hard gates
- [Daemon](Daemon.md) — Background browser process, IPC protocol, and resource management

## Install

```bash
npm install -g websculpt
websculpt skill install
```

Full installation steps, a first run, and the design rationale live in the [root README](https://github.com/bqw1013/websculpt#readme).
