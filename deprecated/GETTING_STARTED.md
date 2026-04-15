# WebSculpt 上手与验证指南

本文档会带你从零开始理解 WebSculpt 的实现思路，并通过手动执行每一个功能来验证它的行为。

---

## 一、实现思路（为什么要这样设计）

WebSculpt 的核心理念是：**Agent 负责第一次的"探索"，WebSculpt 负责把探索成果变成可复用的"命令"**。

### 1.1 两种命令

我们把 CLI 里的所有能力分成两类：

- **元命令（Meta Commands）**：系统自带的管家命令，比如 `compile`、`command list`、`config init`。它们负责管理"扩展命令"本身。
- **扩展命令（Extended Commands）**：用户或 AI 创建的业务命令，比如 `example hello`、`httpbin get`、`zhihu hot`。它们才是实际干活的部分。

### 1.2 命令是怎么被找到的？

当你输入 `websculpt httpbin get` 时，程序会按这个顺序找命令：

1. 先看 **用户自定义目录** `~/.websculpt/commands/httpbin/get/` —— 这是你自己创建或固化的命令
2. 再看 **内置基础目录** `src/commands/builtin/httpbin/get/` —— 这是随项目发布的基础命令
3. 如果都没找到，返回 `suggestExplore: true`，告诉 Agent："我不会这个，你自己去探索吧"

### 1.3 一个完整的"固化"闭环长什么样？

```
用户: "帮我查一下 httpbin 的 get 接口"
  ↓
Agent 尝试: websculpt httpbin get
  ↓
WebSculpt 返回: { suggestExplore: true }  ← 没有这个命令
  ↓
Agent 用自带工具（curl/WebFetch）去请求 https://httpbin.org/get
  ↓
Agent 拿到结果，觉得这个动作可以复用
  ↓
Agent 调用: websculpt compile --context '{...}'
  ↓
WebSculpt 在 ~/.websculpt/pending/httpbin-get/ 生成命令草案
  ↓
用户确认后，Agent 调用: websculpt command approve httpbin-get
  ↓
命令被移动到 ~/.websculpt/commands/httpbin/get/
  ↓
下次用户再说"查 httpbin"，websculpt httpbin get 直接命中并执行
```

### 1.4 代码上的关键设计

- **`src/cli/index.ts`**：总入口。启动时会扫描所有扩展命令，并把它们动态注册成 `commander` 的子命令。所以你新增一个命令文件夹后，不需要改任何代码，CLI 就能识别。
- **`src/core/command-engine.ts`**：负责"找命令"。它只读文件系统，不执行任何逻辑。
- **`src/runner/command-runner.ts`**：负责"执行命令"。它加载 `command.js` 并运行。未来安全沙箱会加在这里。
- **`src/commands/builtin/`**：内置命令库。项目发布时带的基础能力。
- **`~/.websculpt/commands/`**：用户命令库。每个人的私有命令存在这里。

---

## 二、环境准备

确保你在项目根目录：

```bash
cd D:\code\WebSculpt
```

项目已经依赖了 `commander`，如果你刚拿到的是一个干净环境，确保安装依赖：

```bash
npm install
```

开发运行统一用 `tsx`（已经在 `devDependencies` 里）：

```bash
npx tsx src/cli/index.ts <命令>
```

---

## 三、一步一步手动验证

### 步骤 1：初始化本地目录

WebSculpt 需要 `~/.websculpt/` 来存放用户命令、配置和日志。

```bash
npx tsx src/cli/index.ts config init
```

**预期输出**：
```json
{
  "success": true,
  "message": "WebSculpt initialized."
}
```

**验证**：去你的用户目录下看看是否生成了 `.websculpt` 文件夹（Windows 一般在 `C:\Users\你的用户名\.websculpt`）。

---

### 步骤 2：执行内置扩展命令

项目自带了一个示例命令 `example hello`。

#### 2.1 直接调用（当作扩展命令）

```bash
npx tsx src/cli/index.ts example hello --param name=world
```

**预期输出**：
```json
{
  "success": true,
  "command": "example/hello",
  "data": {
    "message": "Hello, world!",
    "timestamp": "2026-04-14T08:57:07.492Z"
  },
  "meta": {
    "duration": 5
  }
}
```

**你可以去看看这个命令的实现**：
- `src/commands/builtin/example/hello/manifest.json`：定义了命令的 id、domain、action、参数列表
- `src/commands/builtin/example/hello/command.js`：实际执行的函数，接收 `params`，返回一个对象

---

### 步骤 3：手动创建一个扩展命令

这是理解 WebSculpt 最关键的一步。我们完全不用改项目代码，只在用户目录里新建两个文件。

#### 3.1 创建目录和文件

假设我们要创建一个命令 `mysite fetch`，它接收一个 `id` 参数。

**Windows PowerShell 方式**：

```powershell
$base = "$env:USERPROFILE\.websculpt\commands\mysite\fetch"
New-Item -ItemType Directory -Force -Path $base

@'
{
  "id": "mysite-fetch",
  "domain": "mysite",
  "action": "fetch",
  "description": "Fetch data from mysite",
  "parameters": ["id"]
}
'@ | Set-Content -Path "$base\manifest.json" -Encoding utf8

@'
export default async function(params) {
  return {
    id: params.id,
    data: "fake data for " + params.id,
    fetchedAt: new Date().toISOString()
  };
}
'@ | Set-Content -Path "$base\command.js" -Encoding utf8
```

**如果你用 bash（Git Bash / WSL）**：

```bash
mkdir -p ~/.websculpt/commands/mysite/fetch

cat > ~/.websculpt/commands/mysite/fetch/manifest.json <<'EOF'
{
  "id": "mysite-fetch",
  "domain": "mysite",
  "action": "fetch",
  "description": "Fetch data from mysite",
  "parameters": ["id"]
}
EOF

cat > ~/.websculpt/commands/mysite/fetch/command.js <<'EOF'
export default async function(params) {
  return {
    id: params.id,
    data: "fake data for " + params.id,
    fetchedAt: new Date().toISOString()
  };
}
EOF
```

#### 3.2 执行你刚创建的命令

```bash
npx tsx src/cli/index.ts mysite fetch --param id=123
```

**预期输出**：
```json
{
  "success": true,
  "command": "mysite/fetch",
  "data": {
    "id": "123",
    "data": "fake data for 123",
    "fetchedAt": "2026-04-14T09:00:00.000Z"
  },
  "meta": {
    "duration": 2
  }
}
```

**理解要点**：
- 用户自定义命令的优先级**高于**内置命令。
- `manifest.json` 里的 `parameters` 定义了这个命令接受哪些参数。如果参数没传，`command.js` 里收到的就是 `undefined`。
- `command.js` 必须是 **ESM 格式**（因为项目 `package.json` 里设置了 `"type": "module"`），所以用 `export default` 而不是 `module.exports =`。

#### 3.3 查看命令列表

```bash
npx tsx src/cli/index.ts command list
```

**预期输出**：
```json
{
  "builtin": [
    { "domain": "example", "action": "hello", ... }
  ],
  "user": [
    { "domain": "mysite", "action": "fetch", "id": "mysite-fetch", ... }
  ],
  "pending": []
}
```

---

### 步骤 4：compile → approve → 执行 闭环

这是 WebSculpt 的核心价值：把 Agent 的探索成果"固化"成本地命令。

#### 5.1 模拟 compile（生成命令草案）

由于 PowerShell 对 JSON 引号的解析很严格，直接传 `--context '{...}'` 容易报错。这里推荐用 Node 内联脚本的方式调用：

```bash
node -e "require('./src/cli/commands/compile.js').handleCompile({context:JSON.stringify({url:'https://httpbin.org/get',suggestedDomain:'httpbin',suggestedAction:'get',sample:{origin:'1.2.3.4'}})})"
```

**预期输出**：
```json
{
  "success": true,
  "message": "Command draft \"httpbin-get\" created in pending queue.",
  "manifest": {
    "id": "httpbin-get",
    "domain": "httpbin",
    "action": "get",
    ...
  }
}
```

**理解要点**：
- `compile` 不会在用户命令库里直接创建命令，而是把它放到 `~/.websculpt/pending/httpbin-get/` 里。
- 这相当于"草稿箱"，等待用户确认。

#### 5.2 查看待确认队列

```bash
npx tsx src/cli/index.ts command list
```

**预期输出**：
```json
{
  "builtin": [...],
  "user": [...],
  "pending": [
    { "id": "httpbin-get", "domain": "httpbin", "action": "get" }
  ]
}
```

#### 5.3 确认固化

```bash
npx tsx src/cli/index.ts command approve httpbin-get
```

**预期输出**：
```json
{
  "success": true,
  "message": "Command \"httpbin/get\" approved and moved to user commands."
}
```

**理解要点**：
- `approve` 会把 `~/.websculpt/pending/httpbin-get/` 移动到 `~/.websculpt/commands/httpbin/get/`。
- 一旦移动完成，这个命令就和"手动创建的命令"一样了。

#### 5.4 直接运行固化后的命令

```bash
npx tsx src/cli/index.ts httpbin get
```

**预期输出**：
```json
{
  "success": true,
  "command": "httpbin/get",
  "data": {
    "url": "https://httpbin.org/get",
    "params": {},
    "sample": { "origin": "1.2.3.4" }
  },
  "meta": { "duration": 150 }
}
```

**恭喜，你跑完了整个固化闭环。**

---

## 四、代码和功能的对应关系

如果你在看代码时想知道"这个功能在哪里实现的"，可以参考下表：

| 功能 | 核心代码文件 | 作用 |
|------|-------------|------|
| CLI 入口、命令注册 | `src/cli/index.ts` | 注册元命令，动态扫描并注册所有扩展命令 |
| 查找命令 | `src/core/command-engine.ts` | 按优先级扫描用户目录和内置目录 |
| 执行命令 | `src/runner/command-runner.ts` | 加载 `command.js`，注入参数并运行 |
| 输出 JSON | `src/cli/utils/output.ts` | 统一格式化输出 |
| 本地路径 | `src/infra/paths.ts` | 管理 `~/.websculpt/` 和内置命令目录 |
| 读写配置/日志 | `src/infra/store.ts` | 操作 `config.json`、`log.jsonl`、待确认队列 |
| 生成命令草案 | `src/cli/commands/compile.ts` | 从 JSON 上下文生成 `manifest.json` + `command.js` |

---

## 五、当前版本的已知限制

1. **PowerShell 下 `compile --context '{...}'` 传参困难**
   - 原因：PowerShell 对单引号和 JSON 的解析和 bash 不同。
   -  workaround：用 `node -e` 直接调用 `handleCompile`，或者把 JSON 写进文件再读。

2. **compile 生成的 `command.js` 只是一个占位模板**
   - 它不会自动把 Agent 的"探索逻辑"（比如 curl 的 URL、选择器）写进去。
   - 目前的阶段是验证"能不能生成并固化"，真正的智能生成需要后续引入 AI 辅助的 `compiler.ts`。

3. **没有安全沙箱**
   - `command.js` 目前运行在主进程里，可以访问 Node.js 的全局对象。
   - 这是刻意为之的 MVP 简化。后续会在 `src/runner/sandbox.ts` 里做上下文隔离。

---

## 六、推荐的学习路径

建议你按这个顺序手动尝试：

1. ✅ 执行 `example hello`（理解扩展命令是什么）
2. ✅ 手动创建一个 `mysite fetch`（理解命令的文件夹结构）
3. ✅ 走一遍 `compile → command list → approve → 执行`（理解固化闭环）
5. 🔄 修改一个已有的 `command.js`，看看改动是否立即生效
6. 🔄 尝试创建一个带多个参数的自定义命令

等你对这些操作都感到自然了，就可以开始往项目里加真正的功能（比如让 compile 生成更有意义的代码、加 Guard、写 SKILL.md）。
