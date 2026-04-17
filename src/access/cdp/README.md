## CDP Access Module

The CDP access module exposes a single public entrypoint, `ensureCDPProxy()`, which makes sure a local HTTP proxy is available for browser automation.

### Lifecycle Notes

- `ensureCDPProxy()` reads `cdpProxyPort` from `~/.websculpt/config.json`, defaulting to `3456`.
- The launcher first checks whether an existing proxy is already healthy before attempting to spawn a new process.
- If Chrome is not running with remote debugging enabled, the function returns a structured failure result instead of throwing.
- Detached proxy logs are appended to `~/.websculpt/logs/cdp-proxy.log`.
- The server process lazily reconnects to Chrome if the underlying WebSocket is dropped.

### HTTP Endpoints

| Endpoint | Method | Description |
| --- | --- | --- |
| `/health` | `GET` | Returns proxy status, connection state, active session count, and the detected Chrome port. |
| `/targets` | `GET` | Lists open page targets from Chrome. |
| `/new?url=` | `GET` | Creates a new background tab and waits for the page to finish loading. |
| `/close?target=` | `GET` | Closes the specified target. |
| `/navigate?target=&url=` | `GET` | Navigates an existing target and waits for the load to settle. |
| `/back?target=` | `GET` | Runs `history.back()` and waits for the page to settle. |
| `/info?target=` | `GET` | Returns the current page title, URL, and readiness state. |
| `/eval?target=` | `POST` | Evaluates arbitrary JavaScript in the target page. |
| `/click?target=` | `POST` | Clicks the first element matching the posted CSS selector. |
| `/clickAt?target=` | `POST` | Dispatches a browser-level click at the center of the matched element. |
| `/setFiles?target=` | `POST` | Sets local files on a matching file input element. |
| `/scroll?target=` | `GET` | Scrolls the page by offset or to a named direction. |
| `/screenshot?target=` | `GET` | Captures a page screenshot, optionally saving it to a file. |
