# Capture Status 完整动线与返回规范

本文档描述当前 `capture status` / `capture validate` / `capture finalize` 的状态机行为。状态完全由 `.websculpt-captures/<name>/` 中的文件推导，不依赖内存状态。

---

## 1. Artifact 与状态规则

| Artifact | blocked | ready | done |
|----------|---------|-------|------|
| `evidence` | audit 失败（缺少标题或标题内容为空） | — | audit passed |
| `command` | evidence 未完成、manifest identity mismatch、入口文件缺失 | evidence done 且入口文件仍是模板 | 非模板 |
| `manifest` | command 未完成、manifest identity mismatch、manifest JSON 无效或缺失 | command done 但 `description` 为空 | `description` 非空 |
| `readme` | manifest 未完成、manifest identity mismatch、README 缺失 | manifest done 但 README.md 含 `TODO:` | 不含 `TODO:` |
| `context` | readme 未完成、manifest identity mismatch、context.md 缺失 | readme done 但 context.md 含 `TODO:` | 不含 `TODO:` |
| `validation` | 前面任一 artifact 未完成、manifest mismatch、`validation.json` 缺失/失败/过期 | — | `validation.json.success === true` 且 draft 指纹匹配当前文件 |

**`readyToFinalize`** = 全部 6 个 artifact 都是 `done`。

---

## 2. Next Action 推导

```text
evidence blocked                  → fill-evidence
manifest identity mismatch         → fill-manifest
command ready/blocked              → fill-command
manifest ready/blocked             → fill-manifest
readme ready/blocked               → fill-readme
context ready/blocked              → fill-context
validation blocked                 → validate
全部 done                          → request-user-confirmation
```

`next.target` 指向下一步应编辑或执行相关的文件：

| action | target |
|--------|--------|
| `fill-evidence` | `evidence.md` |
| `fill-command` | runtime entry file（如 `command.js`） |
| `fill-manifest` | `manifest.json` |
| `fill-readme` | `README.md` |
| `fill-context` | `context.md` |
| `validate` | 无 |
| `request-user-confirmation` | 无 |

---

## 3. Evidence Audit 规则

**L1 结构**：5 个 H2 标题必须精确存在。

```ts
const REQUIRED_H2 = [
  "Exploration Path",
  "Verified URLs",
  "Structural Evidence",
  "Failure Signals",
  "Capture Assessment",
];
```

**L2 内容**：每个 H2 段落内必须有实质内容（非空行、非 HTML 注释、非 Markdown 标题）。HTML 注释块（含多行）会被完整 strip 后再检查。

**L3 关键词**：字符串匹配，不 block，只作为 warning 返回：

| gap | 触发条件 |
|-----|----------|
| `guide-read` | browser runtime 且 evidence 不包含 `guide.md` |
| `verified-urls` | evidence 不包含 `http://` 或 `https://` |

**Audit 结果**：

```ts
interface EvidenceAuditResult {
  passed: boolean;
  missingHeadings: string[];
  emptyHeadings: string[];
  keywordGaps: string[];
}
```

---

## 4. 模板和身份检测规则

| 文件 | 检测规则 |
|------|----------|
| runtime entry file | 包含 `TODO: implement command logic` 或 `TODO: implement command logic using page` 视为模板 |
| `README.md` | 包含任意 `TODO:` 视为模板 |
| `context.md` | 包含任意 `TODO:` 视为模板 |
| `manifest.json` | `description` 缺失、非字符串或 trim 后为空时为 `ready` |

**Manifest identity mismatch**：`draft/manifest.json` 的 `domain` / `action` / `runtime` 任一字段与 `capture.yaml` 不一致时，`command` / `manifest` / `readme` / `context` / `validation` 全部为 `blocked`，`next.action` 为 `fill-manifest`。

**Invalid manifest JSON**：`draft/manifest.json` 无法解析或不是 object 时，`manifest` 为 `blocked`，`next.action` 为 `fill-manifest`。这用于支持 Agent 编辑过程中的中间状态，不会把整个 status 命令变成 `STATUS_ERROR`。

---

## 5. Validation 指纹规则

`capture validate <name>` 会：

1. 读取 `capture.yaml` 的 `domain/action/runtime`
2. 调用 `command validate` 校验 `draft/`
3. 额外检查 `draft/manifest.json` 的 `domain/action/runtime` 与 `capture.yaml` 一致
4. 计算 draft 指纹
5. 写入 `validation.json`

成功示例：

```json
{
  "success": true,
  "draftFingerprint": "sha256...",
  "warnings": [],
  "timestamp": "2026-05-08T14:05:00.000Z"
}
```

失败示例：

```json
{
  "success": false,
  "draftFingerprint": "sha256...",
  "errors": [
    {
      "code": "UNDECLARED_PARAM",
      "message": "Code accesses params.language but it is not declared in manifest.parameters",
      "level": "error"
    }
  ],
  "timestamp": "2026-05-08T14:00:00.000Z"
}
```

指纹覆盖：

- `capture.yaml` 的 `domain/action/runtime`
- `draft/manifest.json`
- runtime entry file（如 `command.js`）
- `draft/README.md`
- `draft/context.md`

如果 validate 成功后任一上述内容变化，`capture status` 会让 `validation` 回到 `blocked`，reason 为 `Draft changed after last validation`；`capture finalize` 会返回 `VALIDATION_STALE`。

---

## 6. 返回结构

当前 `capture status` JSON 返回 `artifacts` 对象，而不是数组：

```json
{
  "success": true,
  "capture": {
    "name": "github-trending",
    "path": "<absolute-path>/.websculpt-captures/github-trending"
  },
  "artifacts": {
    "evidence": { "status": "done", "detail": { "keywordGaps": [] } },
    "command": { "status": "done" },
    "manifest": { "status": "done" },
    "readme": { "status": "done" },
    "context": { "status": "done" },
    "validation": { "status": "done" }
  },
  "readyToFinalize": true,
  "next": {
    "action": "request-user-confirmation"
  }
}
```

失败或未完成状态通过各 artifact 的 `reason` 和可选 `detail` 表达：

```json
{
  "success": true,
  "capture": {
    "name": "github-trending",
    "path": "<absolute-path>/.websculpt-captures/github-trending"
  },
  "artifacts": {
    "evidence": {
      "status": "blocked",
      "reason": "Evidence audit failed",
      "detail": {
        "missingHeadings": ["Failure Signals"],
        "emptyHeadings": [],
        "keywordGaps": ["verified-urls"]
      }
    },
    "command": { "status": "blocked", "reason": "Evidence is not complete" },
    "manifest": { "status": "blocked", "reason": "Command is not complete" },
    "readme": { "status": "blocked", "reason": "Manifest is not complete" },
    "context": { "status": "blocked", "reason": "README is not complete" },
    "validation": { "status": "blocked", "reason": "Draft artifacts are not complete" }
  },
  "readyToFinalize": false,
  "next": {
    "action": "fill-evidence",
    "target": "evidence.md"
  },
  "warnings": [
    {
      "code": "VERIFIED_URLS",
      "message": "Keyword gap: verified-urls",
      "level": "warning"
    }
  ]
}
```

---

## 7. 完整动线

### Step 0: 创建工作区

```bash
websculpt capture new github-trending \
  --domain github --action list-trending --runtime browser
```

工作区：

```text
.websculpt-captures/github-trending/
├── capture.yaml
├── evidence.md
└── draft/
    ├── manifest.json
    ├── command.js
    ├── README.md
    └── context.md
```

Agent 必须先向用户汇报 `commandLibrarySnapshot` 的查重结果，用户确认后再进入状态循环。

### Step 1: fill-evidence

首次 `capture status` 通常返回 `next.action: "fill-evidence"`。Agent 填写 `evidence.md` 的 6 个 H2 段落，直到 evidence audit 通过。

### Step 2: fill-command

evidence done 后，`command` 进入 `ready`。Agent 实现 runtime entry file，并移除命令模板 TODO。

### Step 3: fill-manifest

command done 后，`manifest` 进入 `ready`。Agent 填写 `description`、`parameters`、`authRequired` 等字段，并保持 `domain/action/runtime` 与 `capture.yaml` 一致。

### Step 4: fill-readme

manifest done 后，`README.md` 进入 `ready`。Agent 编写 README，并移除所有 `TODO:`。

### Step 5: fill-context

README done 后，`context.md` 进入 `ready`。Agent 编写 context，并移除所有 `TODO:`。

### Step 6: validate

所有 draft artifact done 后，`validation` 为 blocked，`next.action: "validate"`。

```bash
websculpt capture validate github-trending
```

如果 validation 失败，Agent 修复对应文件后重新执行 `capture status` 和 `capture validate`。如果 validation 成功但 Agent 又修改了 draft，`validation` 会变为 stale，需要重新 validate。

### Step 7: request-user-confirmation

`readyToFinalize: true` 时，Agent 向用户展示摘要并请求确认。用户确认前不得执行 finalize。

### Step 8: finalize

```bash
websculpt capture finalize github-trending
```

如果 user 命令冲突是在 `capture new --force` 中明确允许的，finalize 默认会透传覆盖意图；也可以显式执行：

```bash
websculpt capture finalize github-trending --force
```

### Step 9: finalize 后测试

finalize 成功后，Agent 应执行 3-5 次不同参数组合的真实命令测试。若测试发现问题，应修改 `.websculpt-captures/<name>/draft/`，重新 `capture status` → `capture validate` → 用户确认 → `capture finalize` → 测试。

---

## 8. 边界情况返回

### 8.1 工作区不存在

```json
{
  "success": false,
  "error": {
    "code": "NOT_FOUND",
    "message": "Capture workspace not found: <absolute-path>"
  }
}
```

### 8.2 Manifest identity mismatch

```json
{
  "success": true,
  "artifacts": {
    "evidence": { "status": "done", "detail": { "keywordGaps": [] } },
    "command": {
      "status": "blocked",
      "reason": "Manifest runtime \"node\" does not match capture runtime \"browser\""
    },
    "manifest": {
      "status": "blocked",
      "reason": "Manifest runtime \"node\" does not match capture runtime \"browser\""
    },
    "readme": {
      "status": "blocked",
      "reason": "Manifest runtime \"node\" does not match capture runtime \"browser\""
    },
    "context": {
      "status": "blocked",
      "reason": "Manifest runtime \"node\" does not match capture runtime \"browser\""
    },
    "validation": {
      "status": "blocked",
      "reason": "Manifest runtime \"node\" does not match capture runtime \"browser\""
    }
  },
  "readyToFinalize": false,
  "next": {
    "action": "fill-manifest",
    "target": "manifest.json"
  }
}
```

### 8.3 Invalid manifest JSON

```json
{
  "success": true,
  "artifacts": {
    "manifest": {
      "status": "blocked",
      "reason": "Manifest JSON is invalid: ..."
    }
  },
  "readyToFinalize": false,
  "next": {
    "action": "fill-manifest",
    "target": "manifest.json"
  }
}
```

### 8.4 Stale validation

```json
{
  "success": true,
  "artifacts": {
    "validation": {
      "status": "blocked",
      "reason": "Draft changed after last validation",
      "detail": { "lastResult": "stale" }
    }
  },
  "readyToFinalize": false,
  "next": {
    "action": "validate"
  }
}
```

`capture finalize` 在同样场景下返回：

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_STALE",
    "message": "Draft files changed after the last successful validation. Run `capture validate` again."
  }
}
```

### 8.5 Finalize gate errors

| 场景 | error code |
|------|------------|
| 工作区不存在 | `NOT_FOUND` |
| `validation.json` 不存在或不可读 | `VALIDATION_NOT_FOUND` |
| 上次 validation 失败 | `VALIDATION_FAILED` |
| draft 在 validation 成功后变化 | `VALIDATION_STALE` |
| evidence audit 失败 | `EVIDENCE_NOT_READY` |
| status 尚未 `readyToFinalize` | `DRAFT_NOT_READY` |

