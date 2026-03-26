# Phase 2 完整迁移实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将 memory-lancedb-pro 全部记忆能力迁移到 Universal Memory MCP Server

**Architecture:** 4 阶段递进依赖：LLM 基础层 → 智能提取+准入 → 反思引擎 → 增强工具。每阶段完成后编译验证 + commit。LLM 调用用环境变量 `LLM_API_KEY` 直连 OpenAI-compatible API。

**Tech Stack:** TypeScript ESM, openai SDK, @lancedb/lancedb, @modelcontextprotocol/sdk

**Source Project:** `~/.openclaw/workspace/plugins/memory-lancedb-pro/`

---

## Phase A — LLM 基础层

---

### Task A1: 重写 llm-client.ts（去 OpenClaw OAuth）

**Files:**
- Create: `src/core/llm-client.ts`
- Source: `~/.openclaw/workspace/plugins/memory-lancedb-pro/src/llm-client.ts`

**Step 1: 复制源文件**

```bash
cp ~/.openclaw/workspace/plugins/memory-lancedb-pro/src/llm-client.ts src/core/llm-client.ts
```

**Step 2: 重写初始化逻辑**

删除所有 `llm-oauth.js` 相关导入和 `buildOauthEndpoint()` 调用。替换为：

```typescript
import OpenAI from "openai";

export interface LlmClientConfig {
  apiKey: string;
  model: string;
  baseURL?: string;
  maxTokens?: number;
  temperature?: number;
}

function createOpenAIClient(config: LlmClientConfig): OpenAI {
  return new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseURL || "https://api.openai.com/v1",
  });
}
```

保留所有业务方法：`chat()`, `jsonChat()` 等。将原来通过 OAuth 获取 OpenAI client 的代码全部替换为从 config 直接创建。

**Step 3: 编译验证**

```bash
npx tsc
```
Expected: 无错误

**Step 4: Commit**

```bash
git add -A && git commit -m "feat(core): rewrite llm-client for standalone API key auth"
```

---

### Task A2: 迁移 extraction-prompts.ts

**Files:**
- Create: `src/core/extraction-prompts.ts`
- Source: `~/.openclaw/workspace/plugins/memory-lancedb-pro/src/extraction-prompts.ts`

**Step 1: 直接复制**

此文件无外部依赖，直接复制即可。

```bash
cp ~/.openclaw/workspace/plugins/memory-lancedb-pro/src/extraction-prompts.ts src/core/extraction-prompts.ts
```

**Step 2: 编译验证**

```bash
npx tsc
```

**Step 3: Commit**

```bash
git add -A && git commit -m "feat(core): add extraction-prompts module"
```

---

### Task A3: 更新 core/index.ts 集成 LLM Client

**Files:**
- Modify: `src/core/index.ts`

**Step 1: 添加 LLM Client 到 MemoryCore**

在 `MemoryCoreConfig` 添加:
```typescript
llm?: Partial<LlmClientConfig>;
```

在 `MemoryCore` 接口添加:
```typescript
llmClient: LlmClient | null;
```

在 `createMemoryCoreFromEnv()` 添加:
```typescript
const llmApiKey = process.env.LLM_API_KEY;
let llmClient = null;
if (llmApiKey) {
  llmClient = createLlmClient({
    apiKey: llmApiKey,
    model: process.env.LLM_MODEL || "gpt-4o-mini",
    baseURL: process.env.LLM_BASE_URL,
  });
}
```

**Step 2: 编译验证**

```bash
npx tsc
```

**Step 3: Commit**

```bash
git add -A && git commit -m "feat(core): integrate LLM client into MemoryCore"
```

---

## ⏸️ Review Checkpoint A

编译通过，LLM client 初始化正常。

---

## Phase B — 智能提取 + 准入控制

---

### Task B1: 迁移 noise-prototypes.ts

**Files:**
- Create: `src/core/noise-prototypes.ts`
- Source: `~/.openclaw/workspace/plugins/memory-lancedb-pro/src/noise-prototypes.ts`

**Step 1: 复制并适配**

依赖 `./embedder.js`（已存在）。直接复制。

```bash
cp ~/.openclaw/workspace/plugins/memory-lancedb-pro/src/noise-prototypes.ts src/core/noise-prototypes.ts
```

**Step 2: 编译验证 + Commit**

```bash
npx tsc && git add -A && git commit -m "feat(core): add noise-prototypes module"
```

---

### Task B2: 迁移 preference-slots.ts

**Files:**
- Create: `src/core/preference-slots.ts`
- Source: `~/.openclaw/workspace/plugins/memory-lancedb-pro/src/preference-slots.ts`

**Step 1: 直接复制**（无外部依赖）

```bash
cp ~/.openclaw/workspace/plugins/memory-lancedb-pro/src/preference-slots.ts src/core/preference-slots.ts
```

**Step 2: 编译验证 + Commit**

```bash
npx tsc && git add -A && git commit -m "feat(core): add preference-slots module"
```

---

### Task B3: 迁移 admission-control.ts

**Files:**
- Create: `src/core/admission-control.ts`
- Source: `~/.openclaw/workspace/plugins/memory-lancedb-pro/src/admission-control.ts`

**Step 1: 复制并适配**

依赖: `llm-client.js`, `memory-categories.js`, `smart-metadata.js`, `store.js` — 全部已存在。直接复制。

```bash
cp ~/.openclaw/workspace/plugins/memory-lancedb-pro/src/admission-control.ts src/core/admission-control.ts
```

**Step 2: 修复导入**

确认所有导入路径正确。`llm-client.js` 的接口可能因重写而变化，需要适配。

**Step 3: 编译验证 + Commit**

```bash
npx tsc && git add -A && git commit -m "feat(core): add admission-control module"
```

---

### Task B4: 迁移 admission-stats.ts

**Files:**
- Create: `src/core/admission-stats.ts`
- Source: `~/.openclaw/workspace/plugins/memory-lancedb-pro/src/admission-stats.ts`

**Step 1: 复制（依赖 admission-control.js, smart-metadata.js）**

```bash
cp ~/.openclaw/workspace/plugins/memory-lancedb-pro/src/admission-stats.ts src/core/admission-stats.ts
```

**Step 2: 编译验证 + Commit**

```bash
npx tsc && git add -A && git commit -m "feat(core): add admission-stats module"
```

---

### Task B5: 迁移 smart-extractor.ts

**Files:**
- Create: `src/core/smart-extractor.ts`
- Source: `~/.openclaw/workspace/plugins/memory-lancedb-pro/src/smart-extractor.ts`

**Step 1: 复制**

```bash
cp ~/.openclaw/workspace/plugins/memory-lancedb-pro/src/smart-extractor.ts src/core/smart-extractor.ts
```

**Step 2: 适配（关键）**

这是最大的迁移任务（1292行）。需要：

1. 替换 `workspace-boundary.js` 导入 → 删除或用空函数占位（MCP 无工作区边界概念）
2. 确认 `llm-client.js` 的 API 与重写后一致
3. 确认 `admission-control.js`, `embedder.js`, `extraction-prompts.js`, `noise-filter.js`, `noise-prototypes.js`, `preference-slots.js`, `smart-metadata.js`, `store.js`, `memory-categories.js` 全部已存在
4. 删除 OpenClaw `agentContext` / `eventLoop` 相关代码

**Step 3: 编译验证 + Commit**

```bash
npx tsc && git add -A && git commit -m "feat(core): add smart-extractor module (LLM-powered extraction)"
```

---

### Task B6: 新建 memory_extract Tool

**Files:**
- Create: `src/tools/extract.ts`
- Modify: `src/index.ts`

**Step 1: 创建 extract tool**

```typescript
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { MemoryCore } from "../core/index.js";

export function registerExtractTool(server: McpServer, core: MemoryCore) {
  server.tool(
    "memory_extract",
    "Extract memories from a conversation text using LLM-powered analysis.",
    {
      text: z.string().describe("Conversation or text to extract memories from"),
      scope: z.string().optional().default("global").describe("Scope for extracted memories"),
    },
    async ({ text, scope }) => {
      // Call smart-extractor pipeline
      // Return extracted memory IDs
    }
  );
}
```

**Step 2: 注册到 index.ts + 编译验证**

**Step 3: Commit**

```bash
git add -A && git commit -m "feat(tools): add memory_extract tool (LLM-powered)"
```

---

## ⏸️ Review Checkpoint B

验证: memory_extract tool 在 MCP Inspector 中可见，调用后能从文本提取记忆。

---

## Phase C — 反思引擎

---

### Task C1: 迁移反思基础模块（类型 + 排序 + 元数据）

**Files:**
- Create: `src/core/reflection-metadata.ts` (22行)
- Create: `src/core/reflection-ranking.ts` (32行)
- Create: `src/core/reflection-slices.ts` (318行)
- Create: `src/core/reflection-mapped-metadata.ts` (83行, 依赖 reflection-slices)

**Step 1: 批量复制**

```bash
for f in reflection-metadata reflection-ranking reflection-slices reflection-mapped-metadata; do
  cp ~/.openclaw/workspace/plugins/memory-lancedb-pro/src/$f.ts src/core/$f.ts
done
```

**Step 2: 编译验证 + Commit**

```bash
npx tsc && git add -A && git commit -m "feat(core): add reflection base modules (metadata, ranking, slices)"
```

---

### Task C2: 迁移反思存储模块

**Files:**
- Create: `src/core/reflection-event-store.ts` (97行)
- Create: `src/core/reflection-item-store.ts` (111行, 依赖 reflection-slices)
- Create: `src/core/reflection-retry.ts` (180行)

**Step 1: 批量复制**

```bash
for f in reflection-event-store reflection-item-store reflection-retry; do
  cp ~/.openclaw/workspace/plugins/memory-lancedb-pro/src/$f.ts src/core/$f.ts
done
```

**Step 2: 编译验证 + Commit**

```bash
npx tsc && git add -A && git commit -m "feat(core): add reflection storage modules"
```

---

### Task C3: 迁移 reflection-store.ts（核心）

**Files:**
- Create: `src/core/reflection-store.ts` (604行)

**Step 1: 复制并适配**

```bash
cp ~/.openclaw/workspace/plugins/memory-lancedb-pro/src/reflection-store.ts src/core/reflection-store.ts
```

依赖全在前面已迁移（reflection-event-store, reflection-item-store, reflection-mapped-metadata, reflection-metadata, reflection-ranking, reflection-slices, store）。

**Step 2: 编译验证 + Commit**

```bash
npx tsc && git add -A && git commit -m "feat(core): add reflection-store (core reflection engine)"
```

---

## ⏸️ Review Checkpoint C

编译通过，反思引擎全部模块就位。

---

## Phase D — 增强工具 + 高级检索

---

### Task D1: 迁移 adaptive-retrieval.ts + self-improvement-files.ts

**Files:**
- Create: `src/core/adaptive-retrieval.ts` (97行, 无依赖)
- Create: `src/core/self-improvement-files.ts` (142行, 无依赖)

**Step 1: 批量复制**

```bash
for f in adaptive-retrieval self-improvement-files; do
  cp ~/.openclaw/workspace/plugins/memory-lancedb-pro/src/$f.ts src/core/$f.ts
done
```

**Step 2: 编译验证 + Commit**

```bash
npx tsc && git add -A && git commit -m "feat(core): add adaptive-retrieval and self-improvement modules"
```

---

### Task D2: 新建 memory_archive Tool

**Files:**
- Create: `src/tools/archive.ts`

**Step 1: 参考原 tools.ts 中 memory_archive 的实现，创建 MCP tool**

功能：将记忆标记为 archived 状态（设置 metadata.state = "archived"）。

**Step 2: 注册到 index.ts + 编译验证 + Commit**

```bash
npx tsc && git add -A && git commit -m "feat(tools): add memory_archive tool"
```

---

### Task D3: 新建 memory_compact Tool

**Files:**
- Create: `src/tools/compact.ts`

**Step 1: 参考原 tools.ts 中 memory_compact 的实现**

功能：找到语义相似的记忆，调 LLM 合并为一条摘要记忆，删除原始条目。依赖 llm-client。

**Step 2: 注册到 index.ts + 编译验证 + Commit**

```bash
npx tsc && git add -A && git commit -m "feat(tools): add memory_compact tool (LLM-powered merge)"
```

---

### Task D4: 新建 memory_promote + memory_explain_rank Tools

**Files:**
- Create: `src/tools/promote.ts`
- Create: `src/tools/explain-rank.ts`

**Step 1: memory_promote**

功能：手动提升/降低记忆层级（core ↔ working ↔ peripheral）。

**Step 2: memory_explain_rank**

功能：解释某条记忆在检索中的排序原因（各维度分数明细）。

**Step 3: 注册到 index.ts + 编译验证 + Commit**

```bash
npx tsc && git add -A && git commit -m "feat(tools): add memory_promote and memory_explain_rank tools"
```

---

### Task D5: 新建 self_improvement_* Tools

**Files:**
- Create: `src/tools/self-improvement.ts`

**Step 1: 实现 3 个 self_improvement 工具**

- `self_improvement_log` — 记录改进日志
- `self_improvement_review` — 回顾改进历史
- `self_improvement_extract_skill` — 从对话中提取可复用技能

**Step 2: 注册到 index.ts + 编译验证 + Commit**

```bash
npx tsc && git add -A && git commit -m "feat(tools): add self_improvement tools"
```

---

### Task D6: 最终集成 + 端到端验证

**Files:**
- Modify: `src/index.ts` (注册全部新 tools)
- Modify: `README.md` (更新工具清单)

**Step 1: 确保所有 tools 注册到 MCP Server**

**Step 2: 编译 + MCP Inspector 验证全部 17+ tools**

```bash
npx tsc && JINA_API_KEY=xxx LLM_API_KEY=xxx npx @modelcontextprotocol/inspector node dist/index.js
```

**Step 3: 端到端测试**

- memory_extract: 输入对话文本 → 提取出记忆
- memory_compact: 合并相似记忆
- memory_promote: 提升层级
- memory_explain_rank: 排名解释

**Step 4: 最终 Commit**

```bash
git add -A && git commit -m "feat: Phase 2 complete - full memory-lancedb-pro feature parity"
```

---

## ⏸️ Final Review

全部模块迁移完成，功能与原生 memory-lancedb-pro 完全对等（排除 7 个 OpenClaw 平台模块）。
