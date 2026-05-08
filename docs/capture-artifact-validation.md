# Capture Artifact Validation Logic

本文档描述 `capture status` 状态机中各 artifact 的校验逻辑。

---

## Evidence 校验

实现文件：`src/cli/meta/capture/lib/evidence-audit.ts`

Evidence 校验是对 `evidence.md` 的三层 Markdown 审核。

### L1：Required Heading Structure（硬规则）

文档必须精确包含以下 5 个 H2 标题：

- `## Exploration Path`
- `## Verified URLs`
- `## Structural Evidence`
- `## Failure Signals`
- `## Capture Assessment`

分析前会先移除所有 HTML 注释。缺少任一标题都会阻断审核。

### L2：Non-Empty Content Under Each Heading（硬规则）

每个 H2 标题下必须至少包含一行满足以下条件的内容：

- `trim()` 后非空
- 不是子标题（不以 `#` 开头）

不满足的标题会被记录为 `emptyHeadings`，同样会阻断审核。

### L3：Keyword Gap Warnings（软规则）

Keyword gaps **不会**阻断审核，仅以 `warnings` 形式通过 `keywordGaps` 返回：

| Gap | 触发条件 |
|-----|---------|
| `guide-read` | `runtime === "browser"` 且内容不包含 `guide.md` |
| `verified-urls` | 内容不包含 `http://` 或 `https://` |

> **注意：** `command-list-check` 已从 L3 移除，因为僵化的正则匹配导致大量误报，并诱导 AI 进行 keyword stuffing。

### 审核结果

```ts
interface EvidenceAuditResult {
  passed: boolean;           // 仅 L1 和 L2 同时通过时为 true
  missingHeadings: string[];
  emptyHeadings: string[];
  keywordGaps: string[];
}
```

### 状态映射

| 条件 | `evidence` ArtifactState |
|------|--------------------------|
| `passed === true` | `status: "done"`, `detail.keywordGaps` |
| `passed === false` | `status: "blocked"`, `reason: "Missing headings: X; Empty headings: Y"` |

---

## Command 校验

实现文件：`src/cli/meta/capture/lib/capture-status-computer.ts`

Command artifact 校验 draft 目录下的入口文件（如 `index.ts`）。

### 状态判定链（短路求值）

按严格优先级顺序判定：

| 优先级 | 条件 | 状态 | Reason |
|--------|------|------|--------|
| 1 | Evidence 审核未通过 | `blocked` | `"Evidence is not complete"` |
| 2 | Manifest identity 不匹配 | `blocked` | Mismatch 详情消息 |
| 3 | Command 文件不存在或为空 | `blocked` | `"Command file not found"` |
| 4 | 内容仍包含 TODO marker | `ready` | 无 |
| 5 | 以上均不满足 | `done` | 无 |

### 模板检测

如果文件内容包含以下任一 marker，则认为仍是模板：

- `TODO: implement command logic`
- `TODO: implement command logic using page`

```ts
function isCommandTemplate(content: string): boolean {
  return COMMAND_TODO_MARKERS.some((marker) => content.includes(marker));
}
```

删除或替换这些 marker 即可将状态从 `ready` 转为 `done`。

### 关键设计决策

1. **Evidence 是硬性前置条件。** Command 在 evidence 通过之前无法离开 `blocked` 状态。
2. **Manifest mismatch 提前阻断 Command。** 即使 command 文件本身已完整，只要 `capture.yaml` 与 `draft/manifest.json` 的 identity 字段不匹配，command 就会被阻断。
3. **不做语法或逻辑校验。** `capture status` 仅检查 TODO marker，更深层的校验由 `capture validate` 负责。

---

## Manifest 校验

实现文件：`src/cli/meta/capture/lib/capture-status-computer.ts`

Manifest artifact 校验 `draft/manifest.json` 的存在性、有效性和内容完整性。

### 状态判定链（短路求值）

按严格优先级顺序判定：

| 优先级 | 条件 | 状态 | Reason |
|--------|------|------|--------|
| 1 | Manifest identity 不匹配 | `blocked` | Mismatch 详情消息 |
| 2 | Command 未完成 | `blocked` | `"Command is not complete"` |
| 3 | Manifest 文件无效或不存在 | `blocked` | `"Manifest file not found"` 或 JSON 解析错误 |
| 4 | `description` 为空或未定义 | `ready` | 无 |
| 5 | 以上均不满足 | `done` | 无 |

### 模板检测

Manifest 没有明确的 TODO marker，以 `description` 字段是否非空作为完成标准：

```ts
if (
    typeof manifestInspection.manifest.description !== "string" ||
    manifestInspection.manifest.description.trim().length === 0
) {
    return { status: "ready" };
}
return { status: "done" };
```

### 身份一致性检查

`inspectCaptureDraftManifest`（位于 `capture-utils.ts`）会对比 `manifest.json` 与 `capture.yaml` 的三个 identity 字段：

- `domain`
- `action`
- `runtime`

任一字段不匹配都会返回 `mismatch`，该 mismatch 会阻断 command、manifest、readme、context 和 validation 全部后续 artifact。

### 关键设计决策

1. **Command 是 Manifest 的前置条件。** Manifest 必须在 command 完成后才能推进，因为 README 和后续文档依赖 manifest 中的元数据。
2. **Description 是唯一决定 `ready` vs `done` 的字段。** Manifest 的结构完整性（如 `parameters`、`inputSchema` 等）由 `capture validate` 负责，status 只看最基础的描述是否已填写。
3. **JSON 解析错误优先于文件不存在。** 如果文件存在但内容不是合法 JSON，会返回具体的解析错误原因而非简单的 `"Manifest file not found"`。

---

## README 校验

实现文件：`src/cli/meta/capture/lib/capture-status-computer.ts`

README artifact 校验 `draft/README.md` 的存在性和内容完成度。

### 状态判定链（短路求值）

按严格优先级顺序判定：

| 优先级 | 条件 | 状态 | Reason |
|--------|------|------|--------|
| 1 | Manifest identity 不匹配 | `blocked` | Mismatch 详情消息 |
| 2 | Manifest 未完成 | `blocked` | `"Manifest is not complete"` |
| 3 | README 文件不存在或为空 | `blocked` | `"README file not found"` |
| 4 | 内容仍包含 `TODO:` | `ready` | 无 |
| 5 | 以上均不满足 | `done` | 无 |

### 模板检测

README 使用通用的文档模板检测：

```ts
function isDocumentTemplate(content: string): boolean {
    return content.includes("TODO:");
}
```

与 command 的特定 marker 检测不同，README 检测更宽松——**只要全文任意位置出现 `TODO:` 四个字符，就认为仍是模板**。

### 关键设计决策

1. **Manifest 是 README 的前置条件。** 必须先完成 manifest（description 非空），才能推进 README。
2. **不检查 heading 结构或内容长度。** Status 不关心 README 写得好不好，只关心"有没有把模板里的 TODO 改掉"。
3. **`TODO:` 检测较敏感。** 如果用户在 README 中自然提到 "TODO list" 等词汇，会触发 `ready` 状态，但实际写作中这种误触概率不高。

---

## Context 校验

实现文件：`src/cli/meta/capture/lib/capture-status-computer.ts`

Context artifact 校验 `draft/context.md` 的存在性和内容完成度。

### 状态判定链（短路求值）

按严格优先级顺序判定：

| 优先级 | 条件 | 状态 | Reason |
|--------|------|------|--------|
| 1 | Manifest identity 不匹配 | `blocked` | Mismatch 详情消息 |
| 2 | README 未完成 | `blocked` | `"README is not complete"` |
| 3 | Context 文件不存在或为空 | `blocked` | `"Context file not found"` |
| 4 | 内容仍包含 `TODO:` | `ready` | 无 |
| 5 | 以上均不满足 | `done` | 无 |

### 模板检测

Context 与 README 共用同一个 `isDocumentTemplate` 检测：

```ts
function isDocumentTemplate(content: string): boolean {
    return content.includes("TODO:");
}
```

### 关键设计决策

1. **README 是 Context 的前置条件。** Context 作为命令的补充说明文档，必须在 README 完成后才能推进。
2. **检测逻辑与 README 完全一致。** 两者的唯一区别是前置条件不同（readme done vs manifest done），其余判定链完全相同。

---

## Validation 校验

实现文件：`src/cli/meta/capture/lib/capture-status-computer.ts`

Validation artifact 校验 `validation.json` 的存在性、通过状态以及 draft 文件在验证后是否被篡改过。它是整个 capture 流水线的最后一道关卡。

### 前置条件

Validation 要求 **command、manifest、readme、context 四个 draft artifact 全部达到 `done`**。注意这里不包含 evidence——evidence 的完成已在 command 的依赖链中间接保证。

```ts
const draftArtifactsDone =
    commandState.status === "done" &&
    manifestState.status === "done" &&
    readmeState.status === "done" &&
    contextState.status === "done";
```

### 状态判定链（短路求值）

按严格优先级顺序判定：

| 优先级 | 条件 | 状态 | Reason |
|--------|------|------|--------|
| 1 | Manifest identity 不匹配 | `blocked` | Mismatch 详情消息 |
| 2 | 四个 draft artifact 有任何一个未 `done` | `blocked` | `"Draft artifacts are not complete"` |
| 3 | `validation.json` 不存在 | `blocked` | `"Run \`capture validate\`"` |
| 4 | `validation.json` 中 `success !== true` | `blocked` | `"Last validation failed"` |
| 5 | draft fingerprint 不匹配 | `blocked` | `"Draft changed after last validation"` |
| 6 | 以上均不满足 | `done` | — |

### `validation.json` 的三层检查

当 draft artifacts 全部 `done` 后，进入 `validation.json` 的详细检查：

#### 第一层：文件存在性

如果 `validation.json` 不存在，直接返回：

```ts
{ status: "blocked", reason: "Run `capture validate`" }
```

这是新 workspace 最常见状态——尚未执行过 `capture validate`。

#### 第二层：验证是否通过

```ts
if (validationRecord.success !== true) {
    validationState = {
        status: "blocked",
        reason: "Last validation failed",
        detail: { lastResult: "failed" },
    };
}
```

`success` 必须严格为 `true`，否则认为上次验证失败。

#### 第三层：Fingerprint 防篡改

```ts
} else if (
    validationRecord.draftFingerprint !==
    (await computeCaptureDraftFingerprint(name, captureYaml, baseDir))
) {
    validationState = {
        status: "blocked",
        reason: "Draft changed after last validation",
        detail: { lastResult: "stale" },
    };
}
```

即使上次验证通过了，如果用户在验证后又修改了 draft 文件，validation 状态会回退到 `blocked`。

### Fingerprint 计算

实现文件：`src/cli/meta/capture/lib/capture-utils.ts`

`computeCaptureDraftFingerprint` 对以下文件做 SHA256 哈希：

- `manifest.json`
- 入口文件（如 `index.ts`，由 `resolveEntryFile(runtime)` 决定）
- `README.md`
- `context.md`

外加 `capture.yaml` 的 `domain`、`action`、`runtime` 作为 salt。

```ts
hash.update(
    JSON.stringify({ domain: captureYaml.domain, action: captureYaml.action, runtime: captureYaml.runtime })
);
hash.update("\0");
for (const file of files) {
    hash.update(file);
    hash.update("\0");
    try {
        hash.update(await readFile(join(draftPath, file), "utf8"));
    } catch (err) {
        hash.update(`missing:${err.code}`);
    }
    hash.update("\0");
}
```

### 关键设计决策

1. **Validation 是 gatekeeper。** 它是唯一一个状态不由"内容有没有写"决定、而由外部动作（是否执行过 `capture validate` 且通过）决定的 artifact。

2. **Fingerprint 机制防止 stale validation。** 没有 fingerprint 的话，用户可能验证通过后偷偷改代码，然后直接 `finalize`，绕过验证。

3. **不检查 evidence。** Validation 的前置只关心 draft artifacts（command/manifest/readme/context），evidence 的完整性在更早阶段已经被 command 的依赖链保证。

4. **`"Run \`capture validate\`"` 作为 reason。** 这是一个直接的行动指令，告诉用户下一步该做什么。

---

## Artifact 依赖关系

```
evidence (done)
    |
    v
command (ready / done / blocked)
    |
    v
manifest (ready / done / blocked)
    |
    v
readme (ready / done / blocked)
    |
    v
context (ready / done / blocked)
    |
    v
validation (blocked / done)
```

- 每个 artifact 必须等待前序 artifact 达到 `done` 才能离开 `blocked`。
- 如果前序 artifact 回退（例如标题被删除、TODO 被重新添加），后续所有 artifact 会立即连锁回退到 `blocked`。
- Manifest identity mismatch 是全局阻断器，会同时阻断 command、manifest、readme、context 和 validation。
