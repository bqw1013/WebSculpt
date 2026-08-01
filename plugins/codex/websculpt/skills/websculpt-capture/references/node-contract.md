# Node Runtime Contract

> Applicable to WebSculpt commands with `runtime: "node"`.

## 1. Module Format

The entry file is `command.js`, using standard ESM.

One of the following three export styles is supported:

```js
// Style 1: default export (recommended)
export default async function (params) {
  return {};
}

// Style 2: named export (const)
export const command = async (params) => {
  return {};
};

// Style 3: named export (function)
export async function command(params) {
  return {};
}
```

Allowed signature:

```text
async (params: Record<string, string>) => unknown
```

## 2. Parameters

The runner passes `params` directly; all values are strings. Use `parseInt` or `parseFloat` for numbers, and `params.flag === "true"` for booleans.

For parameters that already have `default` declared in the manifest, do not write fallback in code (e.g., `params.foo || "default"`).

`params.xxx` accessed in code must be declared in `manifest.json`'s `parameters`; otherwise `capture validate` will report an `UNDECLARED_PARAM` error.

## 3. Environment

Node runtime can use the following capabilities:

- Global APIs: `fetch`, `console`
- Node.js built-in modules (including `node:` prefix)

Prohibited:

- Importing any third-party modules
- Inline dynamic import (`await import(...)`)

## 4. Code Compliance Constraints

The following constraints are automatically checked during the `capture validate` phase; failure to meet them will directly cause errors:

| Rule | Description | Error Code |
|------|-------------|------------|
| Code length limit | `command.js` must not exceed 1000 lines | `CODE_TOO_LONG` |
| Prohibit temporary snapshot refs | Code must not contain temporary snapshot references like `e1`, `e15` | `TEMP_REF_FOUND` |
| Prohibit browser connection keywords | Must not use `launch`, `connect`, `connectOverCDP`, `newBrowser`, `chrome-remote-interface` | `BROWSER_CONNECTION_FORBIDDEN` |
| Prohibit inline import | Must not use dynamic imports in the form of `await import(...)` | `INLINE_IMPORT_FORBIDDEN` |
| Prohibit illegal module imports | Can only import Node.js built-in modules | `ILLEGAL_IMPORT_FORBIDDEN` |
| Parameter declaration consistency | `params.xxx` must be declared in `manifest.parameters` | `UNDECLARED_PARAM` |

## 5. Return Value

Directly `return` serializable pure data. The return value will be serialized by `JSON.stringify` and written into the execution log, so please ensure the returned structure can be safely serialized.

Recommended:

```js
return { items, count: items.length };
```

Avoid:

- Returning functions (silently discarded by `JSON.stringify`)
- Returning class instances (non-enumerable properties such as methods will be lost)
- Returning circular references (will cause `JSON.stringify` to throw an exception, and command execution will be marked as failed)
- Returning structures containing `undefined` (properties in objects will be omitted, elements in arrays will become `null`)

## 6. Errors

Business errors should set `error.code` and include the error code in the message. If not set, command failure will fallback to `COMMAND_EXECUTION_ERROR`.

```js
const error = new Error("[NOT_FOUND] User not found");
error.code = "NOT_FOUND";
throw error;
```

## 7. Checklist

### Code Quality

- [ ] Use standard ESM to export an async function (`export default` or `export command`).
- [ ] Signature is `async (params) => unknown`.
- [ ] Parameter conversion is explicit.
- [ ] No in-code default overrides manifest default.
- [ ] Return value is serializable.
- [ ] Error codes are explicit.
- [ ] Implementation does not go beyond evidence.

### Compliance Constraints

- [ ] Code does not exceed 1000 lines.
- [ ] No temporary snapshot references.
- [ ] No inline dynamic import.
- [ ] Only import Node.js built-in modules.
- [ ] All `params.xxx` are already declared in the manifest.
