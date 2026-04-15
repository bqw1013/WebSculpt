# WebSculpt 开发路线图

> 基于 "先做一块、验证一块、再叠加一块" 的原则，把设计拆成 5 个可独立验证的 MVP 阶段。

---

## 开发原则

1. **只做补充，不做重复**：Agent 已经能做的事情（WebSearch、WebFetch、curl），WebSculpt 不再做。
2. **由内向外的命令扩展**：先做命令执行能力，再做命令匹配路由，最后做编译固化和 CLI 接口。
3. **每一步可验证**：每个 MVP 完成后，都能在命令行里跑一个具体命令，看到具体结果。
4. **不追完美**：先让流程跑通，细节（如沙箱安全、CDP 浏览器、AI 自动生成命令）放在 MVP 之后打磨。
5. **TypeScript 友好**：优先用简单类型，避免复杂的泛型和装饰器。

---

## 目录结构

```
src/
├── cli/                            # 元命令的实现
│   ├── index.ts                    # CLI 入口：元命令注册 + 扩展命令动态注册
│   ├── meta/                       # 元命令子命令（一个文件一个命令）
│   │   ├── compile.ts              # websculpt compile --context
│   │   ├── command.ts              # websculpt command list/approve/test/...
│   │   ├── config.ts               # websculpt config init/get/set
│   │   ├── log.ts                  # websculpt log recent/stats
│   │   └── doctor.ts               # websculpt doctor
│   └── utils/
│       └── output.ts               # 统一 JSON 输出格式化
│
├── core/                           # 核心业务逻辑（能力层 + 编排层）
│   ├── router.ts                   # 请求路由器：查库 → 命中/未命中
│   ├── command-engine.ts           # 命令引擎：扫描、匹配、参数注入
│   ├── fetcher.ts                  # 获取编排器：调用引擎 → 格式化输出
│   └── compiler.ts                 # 编译器：生成命令草案
│
├── runner/                         # 命令执行沙箱
│   ├── command-runner.ts           # 加载并执行 command.js
│   └── sandbox.ts                  # 安全上下文：包装 fetch、console 等
│
├── commands/                       # 扩展命令库（框架的"肌肉"）
│   └── builtin/                    # 内置基础命令（随项目发布）
│       └── example/
│           └── hello/
│               ├── manifest.json   # 命令元数据
│               └── command.js      # 命令实现
│
├── infra/                          # 基础设施
│   ├── paths.ts                    # 路径管理：~/.websculpt/ 目录结构
│   ├── store.ts                    # 本地存储：pending/config/logs
│   ├── guard.ts                    # 护栏：命名/安全/输出校验
│   └── schema.ts                   # manifest 等共享类型定义
│
└── types/
    └── index.ts                    # 全局 TypeScript 类型
```

### 构建配置建议

为了让 `src/commands/builtin/` 能正确进入 `dist/`，在 `package.json` 里加一条构建后复制脚本：

```json
{
  "scripts": {
    "build": "tsc && npm run copy:commands",
    "copy:commands": "node -e \"require('fs').cpSync('src/commands/builtin', 'dist/commands/builtin', {recursive:true})\"",
    "dev": "tsx src/cli/index.ts"
  }
}
```

这样 `npm run build` 后，`dist/commands/builtin/` 就和源码保持一致，运行时也能正确加载内置命令。

---

## MVP 1：命令引擎能执行手写命令

**目标**：让 `websculpt example hello --param name=world` 能跑通，执行内置库的手写命令并返回 JSON。

**为什么要先做这一步**：
- WebSculpt 的核心价值是"执行已固化的确定性命令"。如果这一步跑不通，其他都是虚的。
- 同时把命令仓库的目录规范、分层查找机制、执行机制定下来。

**具体工作**：
1. 实现 `Paths`（管理 `~/.websculpt/` 和内置命令目录）。
2. 定义命令仓库格式：
   ```
   src/commands/builtin/example/hello/
   ├── manifest.json
   └── command.js
   ```
3. 实现 `CommandEngine`：扫描命令目录、根据 `domain/action` 匹配、注入参数、分层查找（用户优先，内置兜底）。
4. 实现 `CommandRunner`：用 Node.js 加载并执行命令实现文件。
5. 实现 `sandbox.ts` 的占位版：先暴露原生 `fetch` 和 `console`，不做过多的安全限制。
6. 实现 CLI 入口对扩展命令的动态注册和参数传递。

**验证方式**：
```bash
# 1. 手动创建一个测试命令
mkdir -p src/commands/builtin/example/hello

cat > src/commands/builtin/example/hello/manifest.json <<EOF
{
  "id": "example-hello",
  "domain": "example",
  "action": "hello",
  "description": "Say hello",
  "parameters": ["name"]
}
EOF

cat > src/commands/builtin/example/hello/command.js <<EOF
module.exports = async function(params) {
  return { message: "Hello, " + params.name };
};
EOF

# 2. 执行它
npx tsx src/cli/index.ts example hello --param name=world
# 期望看到：
# {
#   "success": true,
#   "command": "example/hello",
#   "data": { "message": "Hello, world" }
# }
```

**涉及文件**：
- `src/infra/paths.ts`
- `src/core/command-engine.ts`
- `src/runner/command-runner.ts`
- `src/runner/sandbox.ts`
- `src/cli/index.ts`

---

## MVP 2：命令匹配路由跑通

**目标**：让 `websculpt example hello` 能正确走命令引擎，命中则执行，未命中则返回 `suggestExplore: true`。

**为什么要先做这一步**：
- 验证 "Router" 的编排能力：这是 WebSculpt 和 Agent 之间的分界线。
- WebSculpt 不发起网络请求，只做"查库 + 执行命令"。

**具体工作**：
1. 实现 `Router`：调用 `CommandEngine` 查匹配命令。
   - 命中 → 调用 `Fetcher` → 执行命令 → 返回结果。
   - 未命中 → 直接返回 `{ command: null, suggestExplore: true }`。
2. 实现简化版 `Fetcher`：调用 `CommandEngine` / `CommandRunner`，把结果包成标准 JSON。
3. 验证扩展命令和元命令的命名空间隔离，确保扩展命令不会覆盖元命令。

**验证方式**：
```bash
# 用 MVP1 创建的 example/hello 命令

# 情况 A: 命中命令
npx tsx src/cli/index.ts example hello --param name=world
# 期望看到：
# {
#   "success": true,
#   "command": "example/hello",
#   "data": { "message": "Hello, world" }
# }

# 情况 B: 未命中命令
npx tsx src/cli/index.ts unknown anything
# 期望看到：
# {
#   "success": true,
#   "command": null,
#   "suggestExplore": true
# }


```

**涉及文件**：
- `src/core/router.ts`
- `src/core/fetcher.ts`
- `src/cli/index.ts`（修改）

---

## MVP 3：编译器能从外部记录生成命令草案

**目标**：`websculpt compile --context '{...}'` 能生成一个命令草案，存入"待确认队列"。

**为什么要先做这一步**：
- 验证 "生成-缓存" 闭环的前半段：如何把 Agent 的探索成果变成本地可执行命令。
- 这是 WebSculpt 作为"确定性缓存层"的核心能力。

**具体工作**：
1. 实现 `Store`：维护 `~/.websculpt/pending.json`（待确认队列）和 `~/.websculpt/config.json`（用户配置）。
2. 实现简化版 `Compiler`：
   - 接收外部上下文（URL、策略、选择器、结果样本、建议的 domain/action 等）。
   - 生成最朴素的 `command.js`（把操作模式写死在代码里）。
   - 生成配套的 `manifest.json`（自动推导 `domain/action`、描述、参数）。
3. 实现 CLI 命令 `websculpt compile --context '{...}'`。

**验证方式**：
```bash
# 模拟 Agent 探索成功后的上下文
npx tsx src/cli/index.ts compile \
  --context '{"url":"https://httpbin.org/get","suggestedDomain":"httpbin","suggestedAction":"get","sample":{"origin":"1.2.3.4"}}'

# 查看生成的待确认命令
ls ~/.websculpt/pending/
# 应该看到类似 httpbin/get/ 的新文件夹，里面有 manifest.json 和 command.js
```

**涉及文件**：
- `src/infra/store.ts`
- `src/core/compiler.ts`
- `src/cli/commands/compile.ts`

---

## MVP 4：半自动固化闭环跑通

**目标**：能把待确认队列里的命令 approve 掉，之后直接调用就能命中它。

**为什么要先做这一步**：
- 这是整个 "生成-缓存-固化" 闭环的完整验证。
- 从"Agent 探索"到"下次直接命中命令"，端到端跑通。

**具体工作**：
1. 实现 CLI 命令：
   - `websculpt command list`：列出已固化和待确认的命令。
   - `websculpt command approve <pending-id>`：把 pending 命令移到 `~/.websculpt/commands/` 目录。
2. 实现 `Guard` 的占位版：只做最简单的校验（保留词检查、命名格式、`manifest.json` 格式正确、`command.js` 能被 `require`）。
3. `approve` 时走一遍 `Guard`，通过后才正式入库。
4. 验证 approve 后的命令能被动态注册并正确执行，返回 `command` 字段。

**验证方式**：
```bash
# 1. 模拟编译（如果 MVP3 已完成）
npx tsx src/cli/index.ts compile --context '{"url":"https://httpbin.org/get","suggestedDomain":"httpbin","suggestedAction":"get","sample":{"origin":"1.2.3.4"}}'

# 2. 查看待确认队列
npx tsx src/cli/index.ts command list
# -> 应该看到 pending 状态的 httpbin/get

# 3. 确认固化（pending-id 从上一步获取）
npx tsx src/cli/index.ts command approve <pending-id>

# 4. 再次执行，应该命中新命令
npx tsx src/cli/index.ts httpbin get
# -> command: "httpbin/get"
```

**涉及文件**：
- `src/cli/commands/command.ts`
- `src/infra/guard.ts`
- `src/core/compiler.ts`（修改：生成更合理的命令 id 和命名空间）

---

## MVP 5：Skill 说明书

**目标**：写一个 `SKILL.md`，教 AI 如何正确使用 WebSculpt。

**为什么要最后做**：
- 只有 CLI 的命令和输出稳定了，Skill 才有意义。
- Skill 是认知层说明书，依赖执行层行为已经确定。

**具体工作**：
1. 在项目中创建 `SKILL.md`（可以放在 `.claude/skills/websculpt/SKILL.md` 或项目根目录）。
2. 内容包含：
   - WebSculpt 的定位（Agent 的"命令缓存层"，不做重复网络请求）。
   - 标准使用流程：
     1. 用户有明确目标时，尝试 `websculpt <domain> <action>`
     2. 若命令未命中（返回 `suggestExplore: true`），用 Agent 自带工具探索
     3. 若返回 `suggestExplore: true`，用 Agent 自带工具探索
     4. 探索成功后，判断是否调用 `websculpt compile`
     5. 向用户建议"是否固化"，或根据配置自动 approve
   - 常用命令速查和输出 JSON 字段说明。
   - 漂移处理策略。

**验证方式**：
```bash
# 让 Agent 加载 Skill 后，通过聊天测试：
# "帮我查一下 example 的 hello"
# 观察 Agent 是否能：
# 1. 先尝试 websculpt example hello
# 2. 若未命中，用自带工具 fetch
# 3. 成功后调用 websculpt compile
# 4. 下次再次请求时直接命中命令
```

**涉及文件**：
- `SKILL.md`

---

## 总结：推荐执行顺序

| 阶段 | 核心验证点 | 建议时间 |
|------|-----------|---------|
| MVP 1 | 扩展命令能执行手写命令 | 1 天 |
| MVP 2 | 扩展命令能正确命中或返回 suggestExplore | 0.5 天 |
| MVP 3 | `compile` 能从上下文生成命令草案 | 1 天 |
| MVP 4 | 半自动固化闭环跑通 | 1 天 |
| MVP 5 | Skill 加载后聊天可用 | 0.5 天 |

**MVP 1~4 完成后，你就拥有了一个最小可用的 WebSculpt 核心**。它虽然简陋，但已经具备：
- 命令执行与参数注入
- 命令命中匹配（内置 + 用户自定义）
- 从外部上下文编译新命令
- 半自动确认与固化

之后的迭代方向可以是：
- 让 Compiler 接入 AI，自动生成更智能的命令实现
- 引入 CDP Driver（处理 Agent 搞不定的动态页面）
- 丰富内置基础命令库
- 加入定时调度器
- 强化 Guard 安全沙箱
- 迁移到 MCP Server 形态

---

## 给 TypeScript 新手的建议

1. **类型从宽开始**：先大量用 `any`，等逻辑跑通了再收紧类型。
2. **优先用 `interface` 不用 `type`**：更直观，错误信息也更友好。
3. **异步统一用 `async/await`**：避免回调地狱。
4. **文件系统用 `fs/promises`**：Node.js 内置，支持 Promise。
5. **调试用 `console.log`**：不用急着上断点调试器，先把数据流打出来。
6. **测试用 Vitest**：项目已经配好了，写测试就是写一个 `.test.ts` 文件，里面用 `test()` 和 `expect()`。
