# WebSculpt 快速开始

这是一个最小可运行的版本，支持元命令和扩展命令。

## 1. 初始化

第一次使用前，先初始化本地目录：

```bash
npx tsx src/cli/index.ts config init
```

这会在你的用户目录下创建 `~/.websculpt/`，用于存放用户自定义命令和配置。

## 2. 执行内置扩展命令

项目自带了一个示例命令 `example hello`：

```bash
npx tsx src/cli/index.ts example hello --param name=world
```

输出示例：
```json
{
  "success": true,
  "command": "example/hello",
  "data": {
    "message": "Hello, world!",
    "timestamp": "2026-04-14T08:30:00.000Z"
  },
  "meta": {
    "duration": 2
  }
}
```

## 3. 手动创建一个扩展命令

### 步骤 1：确定命令的 domain 和 action

比如你想创建一个命令 `websculpt mysite fetch`。

### 步骤 2：在用户目录下创建文件夹

```bash
mkdir -p ~/.websculpt/commands/mysite/fetch
```

### 步骤 3：编写 manifest.json

```bash
cat > ~/.websculpt/commands/mysite/fetch/manifest.json <<EOF
{
  "id": "mysite-fetch",
  "domain": "mysite",
  "action": "fetch",
  "description": "Fetch data from mysite",
  "parameters": ["id"]
}
EOF
```

### 步骤 4：编写 command.js

```bash
cat > ~/.websculpt/commands/mysite/fetch/command.js <<EOF
export default async function(params) {
  return {
    id: params.id,
    data: "fake data for " + params.id
  };
}
EOF
```

### 步骤 5：直接运行

```bash
npx tsx src/cli/index.ts mysite fetch --param id=123
```

输出：
```json
{
  "success": true,
  "command": "mysite/fetch",
  "data": {
    "id": "123",
    "data": "fake data for 123"
  },
  "meta": {
    "duration": 1
  }
}
```

> **注意**：不需要重新编译 WebSculpt！用户自定义命令是动态加载的，创建文件后立即生效。

## 5. 使用 compile 生成命令草案（模拟 AI 固化）

你可以模拟 Agent 探索成功后的上下文，让 WebSculpt 自动生成一个命令草案：

```bash
npx tsx src/cli/index.ts compile --context '{"url":"https://httpbin.org/get","suggestedDomain":"httpbin","suggestedAction":"get","sample":{"origin":"1.2.3.4"}}'
```

这会在 `~/.websculpt/pending/httpbin-get/` 下生成 `manifest.json` 和 `command.js`。

查看待确认队列：

```bash
npx tsx src/cli/index.ts command list
```

确认固化（把它变成正式的扩展命令）：

```bash
npx tsx src/cli/index.ts command approve httpbin-get
```

固化后就可以直接运行：

```bash
npx tsx src/cli/index.ts httpbin get
```

## 6. 查看所有命令

```bash
npx tsx src/cli/index.ts command list
```

输出会分成三类：
- `builtin`：随项目发布的基础命令
- `user`：用户自己创建或固化的命令
- `pending`：待确认的编译草案

## 7. 常见操作速查

| 操作 | 命令 |
|------|------|
| 初始化 | `npx tsx src/cli/index.ts config init` |
| 执行内置命令 | `npx tsx src/cli/index.ts example hello --param name=xxx` |
| 编译草案 | `npx tsx src/cli/index.ts compile --context '{...}'` |
| 列出命令 | `npx tsx src/cli/index.ts command list` |
| 确认固化 | `npx tsx src/cli/index.ts command approve <id>` |
