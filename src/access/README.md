## Access Layer

The access layer is responsible for preparing infrastructure that higher-level agent workflows depend on before they try to interact with an external system.

### Contract

- Access modules expose programmatic `ensure*` functions instead of CLI entrypoints.
- An `ensure*` function should be safe to call repeatedly and avoid duplicate background processes.
- Access modules return structured result objects so callers can reason about failures without parsing console output.
- Long-lived helper processes write their logs under `~/.websculpt/logs/`.

### Available Tools

| Module | Public API | Purpose | Status |
| --- | --- | --- | --- |
| `src/access/cdp/` | `ensureCDPProxy()` | Ensures a local CDP HTTP bridge is running against the user's Chrome instance. | Implemented |
