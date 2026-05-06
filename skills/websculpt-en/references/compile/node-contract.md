# Node Runtime Contract

> This document defines the authoring specifications for Node.js runtime extension commands.
> For general constraints applicable to all runtimes, see [`./contract.md`](./contract.md).

---

## 1. Module Format

- Entry file: `command.js`
- Standard ESM module, supports one of the following three export forms:
  - `export default async function (params) {...}` (recommended, consistent with `playwright-cli` runtime)
  - `export const command = async function (params) {...}`
  - `export async function command (params) {...}`
- Signature: `async (params: Record<string, string>) => unknown`

---

## 2. Parameter Passing

- Parameters are directly passed by runner as function arguments, **no** `/* PARAMS_INJECT */` placeholder needed
- All parameter values are strings, numbers need to be converted via `parseInt` / `parseFloat`
- Runner has already filled default values according to manifest. Parameters with declared `default` should not have fallback in code (e.g., `params.limit || 3`), parameters without declared `default` handle missing logic themselves

---

## 3. Return Value

- Directly `return result`, consumed by `command-runner.ts`
- Returned object must be serializable pure data
- Do not return functions, circular references, `undefined` values, or class instances
- If returning an array is needed, recommend wrapping in object: `return { items: [...] }`

---

## 4. Error Handling

Directly throw `Error`.

Business error codes are passed via `error.code` property, runner will read and pass through. Recommend including error code in error message for readability:

```js
const error = new Error("[NOT_FOUND] User not found");
error.code = "NOT_FOUND";
throw error;
```

For complete semantic list of business error codes, see [`./contract.md`](./contract.md).

---

## 5. Environment

- Full Node.js environment available (`fs`, `path`, `fetch`, `console`, etc.)
- Can read/write local file system

---

## 6. Complete Example

```js
export default async function (params) {
  const author = params.author;
  const limit = parseInt(params.limit, 10);

  // Validate parameters
  if (!author) {
    const error = new Error('[MISSING_PARAM] Parameter "author" is required.');
    error.code = "MISSING_PARAM";
    throw error;
  }

  // Fetch data
  const response = await fetch(
    "https://api.example.com/search?q=" + encodeURIComponent(author)
  );

  if (response.status === 404) {
    const error = new Error("[NOT_FOUND] No user found");
    error.code = "NOT_FOUND";
    throw error;
  }

  const data = await response.json();

  // Business error: empty result
  if (!data.items || data.items.length === 0) {
    const error = new Error("[EMPTY_RESULT] No relevant content found");
    error.code = "EMPTY_RESULT";
    throw error;
  }

  // Return success result
  return { items: data.items.slice(0, limit) };
}
```

---

## 7. Runtime-specific Checklist

General checklist items see Section 5 of [`./contract.md`](./contract.md).

- [ ] Entry file exports async function via `export default`
- [ ] Signature is `async (params: Record<string, string>) => unknown`
- [ ] No `/* PARAMS_INJECT */` placeholder in code
