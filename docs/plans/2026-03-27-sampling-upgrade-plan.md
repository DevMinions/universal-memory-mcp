# MCP Sampling 升级计划 — 实现全自动记忆管理

> **状态**: 🟡 等待上游工具支持
> **优先级**: 高 — 这是达到 OpenClaw 原生插件级记忆体验的唯一技术路径
> **创建日期**: 2026-03-27
> **最后更新**: 2026-03-27

---

## 1. 背景与动机

### 当前状态

Universal Memory MCP Server 已完成全部 18 个工具的迁移，但只能通过 **被动方式**（AI 工具主动调用 tool）来存取记忆。而 OpenClaw 原生插件通过 **hook 机制**（`before_agent_start` / `agent_end`）实现了全自动的记忆注入和提取，用户完全无感知。

### 差距分析

| 能力 | OpenClaw 插件 (hook) | MCP 被动模式 | MCP + Sampling (目标) |
|------|:---:|:---:|:---:|
| 对话前自动注入记忆 | ✅ `before_agent_start` | ❌ 依赖 AI "自觉" | ✅ Server 主动触发 |
| 对话后自动提取记忆 | ✅ `agent_end` | ❌ 依赖 Rules 引导 | ✅ Server 主动触发 |
| 会话结束自动反思 | ✅ `command:new` | ❌ 依赖 Rules 引导 | ✅ Server 主动触发 |
| 去重/准入控制 | ✅ 内嵌 pipeline | ✅ tool 内集成 | ✅ |
| 跨工具数据共享 | ❌ OpenClaw only | ✅ 任何 MCP 客户端 | ✅ |

### 为什么 Sampling 是关键

MCP Sampling (`createMessage`) 允许 **Server 主动请求 Client 的 LLM 做事情**，而不是被动等待调用。这意味着我们的 Memory MCP Server 可以：

1. 在收到 tool 调用时，**主动请求 AI 总结对话**并提取记忆
2. 利用 Client 的 LLM 做智能提取，**不需要自己维护 LLM API Key**
3. 实现与 OpenClaw hook 完全等价的 **自动记忆生命周期管理**

---

## 2. 上游工具 Sampling 支持跟踪

| 工具 | Sampling 支持 | 跟踪链接 | 备注 |
|------|:---:|------|------|
| VS Code + Copilot | ✅ 已支持 | - | 通过 AI SDK MCP Sampling Provider |
| OpenCode | ❌ 开发中 | [Issue #11948](https://github.com/anomalyco/opencode/issues/11948) | 已 assign 给核心开发者 thdxr，协议版本 2025-11-25 |
| Claude Desktop | ❌ 跟踪中 | - | 官方表示将支持 |
| Cursor | ❌ 跟踪中 | - | - |
| Antigravity | ❌ 未知 | - | Google 内部工具，需要关注更新 |
| Windsurf | ❌ 未知 | - | - |

### 触发条件

当以下任一工具正式支持 Sampling 时，即可开始实施：

- [ ] OpenCode 合并 #11948
- [ ] Claude Desktop 宣布 Sampling 支持
- [ ] Antigravity 支持 Sampling

---

## 3. 实施方案

### Phase 1: 声明 Sampling Capability

在 MCP Server 初始化时声明 sampling 能力：

```typescript
// src/index.ts
const server = new McpServer({
  name: "universal-memory",
  version: "0.2.0",
  capabilities: {
    sampling: {},  // 声明支持 sampling
  },
});
```

### Phase 2: 实现 autoRecall — 对话前记忆注入

当 Client 支持 sampling 后，在 `memory_recall` 被调用时，可以主动向 Client 请求对话上下文：

```typescript
// 伪代码 - 利用 sampling 实现 autoRecall
server.setRequestHandler(CreateMessageRequestSchema, async (request) => {
  // 1. 从 Client 获取当前对话上下文
  const context = request.params.messages;
  
  // 2. 提取核心查询意图
  const lastUserMessage = context.filter(m => m.role === "user").pop();
  
  // 3. 自动检索记忆
  const memories = await core.retriever.retrieve({
    query: lastUserMessage.content,
    limit: 5,
  });
  
  // 4. 将记忆作为上下文返回给 Client
  return {
    role: "assistant",
    content: formatMemoriesAsContext(memories),
    model: "memory-context",
    stopReason: "endTurn",
  };
});
```

### Phase 3: 实现 autoCapture — 对话后记忆提取

利用 sampling 在工具调用结束后主动请求提取：

```typescript
// 伪代码 - 利用 sampling 实现 autoCapture
async function autoCapture(conversationMessages: Message[]) {
  // 1. 向 Client 的 LLM 发送 sampling 请求
  const extractionResult = await client.createMessage({
    messages: conversationMessages,
    systemPrompt: EXTRACTION_SYSTEM_PROMPT,
    maxTokens: 2000,
    // 使用 Client 的 LLM，不需要自己的 API Key!
  });
  
  // 2. 解析提取结果并存储
  const memories = parseExtractedMemories(extractionResult.content);
  for (const memory of memories) {
    await core.store.store(memory);
  }
}
```

### Phase 4: 实现 autoReflect — 会话结束自动反思

```typescript
// 伪代码 - 会话结束时自动触发反思
async function autoReflect(sessionMessages: Message[]) {
  const reflectionResult = await client.createMessage({
    messages: [{
      role: "user",
      content: `请对以下对话进行反思总结，按照以下格式输出：
      
## Invariants
- 不变的规则和原则

## Derived  
- 本次对话的衍生知识

对话内容：
${formatMessages(sessionMessages)}`
    }],
    systemPrompt: REFLECTION_SYSTEM_PROMPT,
    maxTokens: 3000,
  });
  
  // 存储反思结果
  await storeReflectionToLanceDB({
    reflectionText: reflectionResult.content,
    ...reflectionParams,
  });
}
```

---

## 4. 关键优势：Sampling 模式 vs 当前模式

### 不再需要 LLM API Key

当前我们的 `memory_extract` 工具需要自己维护 LLM API Key（OpenRouter free）来做智能提取。有了 Sampling 后：

- ❌ **当前**: MCP Server 自己调 OpenRouter → 需要管理 API Key，受限于免费额度
- ✅ **Sampling**: 利用 Client 的 LLM（用户已经在用的 Gemini/Claude/GPT），零额外成本

### 模型更强

- ❌ **当前**: `openrouter/free`（质量不稳定）
- ✅ **Sampling**: 直接用 Client 正在使用的顶级模型（Gemini Pro, Claude Sonnet, GPT-4o）

### 完全自动

- ❌ **当前**: 依赖 Rules 引导 AI 主动调用 tool（成功率 ~80-90%）
- ✅ **Sampling**: Server 主动发起，100% 确定执行

---

## 5. 临时方案回顾（当前在用）

在 Sampling 可用之前，使用 Rules 引导：

| 文件 | 适用工具 | 作用 |
|------|---------|------|
| `.agents/rules/memory-rules.md` | Antigravity | 引导 Gemini 自动 recall/store |
| `AGENTS.md` | OpenCode | 引导 AI 自动 recall/store |

这些 rules 在 Sampling 实现后可以**保留**（作为兜底），不冲突。

---

## 6. 待办清单

- [ ] 跟踪 OpenCode #11948 合并状态
- [ ] 跟踪 Claude Desktop Sampling 公告
- [ ] 跟踪 Antigravity Sampling 支持
- [ ] 当首个工具支持时：实现 Phase 1（声明 capability）
- [ ] 实现 Phase 2（autoRecall via sampling）
- [ ] 实现 Phase 3（autoCapture via sampling）
- [ ] 实现 Phase 4（autoReflect via sampling）
- [ ] 评估是否可以移除内置 LLM API Key（改为全部走 sampling）
- [ ] 端到端测试（在支持的工具上验证）

---

## 7. 参考资料

- [MCP Sampling 规范 (2025-11-25)](https://modelcontextprotocol.io/specification/2025-11-25/client/sampling)
- [SEP-1577: Sampling With Tools](https://modelcontextprotocol.io/community/seps/1577--sampling-with-tools.md)
- [OpenCode Issue #11948](https://github.com/anomalyco/opencode/issues/11948)
- [AI SDK MCP Sampling Provider](https://ai-sdk.dev/docs/ai-sdk-core/mcp-sampling)
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
