# Universal Memory MCP Server 实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将 memory-lancedb-pro 的核心功能提取为独立 MCP Server，实现跨工具记忆共享

**Architecture:** 4 层架构（MCP Server → Tools → Core → Data），Core 层从 memory-lancedb-pro 完整提取，Tools 层做薄包装转换为 MCP 标准协议。增量交付，每步验证。

**Tech Stack:** TypeScript, @modelcontextprotocol/sdk v1.27.x, @lancedb/lancedb ^0.26.2, openai ^6.21.0, proper-lockfile ^4.1.2

**Source Project:** `~/.openclaw/workspace/plugins/memory-lancedb-pro/`

---

## Task 1: 项目初始化

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`

**Step 1: 初始化 npm 项目**

Run:
```bash
cd /home/adamyu/workspace/universal-memory-mcp && npm init -y
```

修改 `package.json`:

```json
{
  "name": "universal-memory-mcp",
  "version": "0.1.0",
  "description": "Universal Memory MCP Server - cross-tool memory sharing via MCP protocol",
  "type": "module",
  "main": "dist/index.js",
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js",
    "dev": "tsc --watch",
    "inspect": "npx @modelcontextprotocol/inspector node dist/index.js"
  },
  "author": "Adam",
  "license": "MIT"
}
```

**Step 2: 安装依赖**

Run:
```bash
cd /home/adamyu/workspace/universal-memory-mcp && npm install @modelcontextprotocol/sdk @lancedb/lancedb@^0.26.2 apache-arrow@18.1.0 openai@^6.21.0 proper-lockfile@^4.1.2 && npm install -D typescript@^5.9.3 @types/node @types/proper-lockfile
```

**Step 3: 创建 tsconfig.json**

Create: `tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "resolveJsonModule": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

**Step 4: 创建 .gitignore**

Create: `.gitignore`

```
node_modules/
dist/
*.js.map
.env
```

**Step 5: 验证编译环境**

Run:
```bash
cd /home/adamyu/workspace/universal-memory-mcp && npx tsc --version
```
Expected: TypeScript 5.9.x

**Step 6: Commit**

```bash
cd /home/adamyu/workspace/universal-memory-mcp && git add -A && git commit -m "chore: initialize project with dependencies and tsconfig"
```

---

## Task 2: MCP Server 空壳 + Ping Tool

**Files:**
- Create: `src/index.ts`

**Step 1: 创建 MCP Server 入口**

Create: `src/index.ts`

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer({
  name: "universal-memory",
  version: "0.1.0",
  capabilities: {
    tools: {},
  },
});

// Ping tool for connectivity testing
server.tool("memory_ping", "Test connectivity to Universal Memory MCP Server", {}, async () => {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({
          status: "ok",
          server: "universal-memory-mcp",
          version: "0.1.0",
          timestamp: new Date().toISOString(),
        }),
      },
    ],
  };
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Universal Memory MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
```

**Step 2: 安装 zod（MCP SDK 依赖）**

Run:
```bash
cd /home/adamyu/workspace/universal-memory-mcp && npm install zod
```

**Step 3: 编译**

Run:
```bash
cd /home/adamyu/workspace/universal-memory-mcp && npx tsc
```
Expected: 无错误，生成 `dist/index.js`

**Step 4: 用 MCP Inspector 验证**

Run:
```bash
cd /home/adamyu/workspace/universal-memory-mcp && npx @modelcontextprotocol/inspector node dist/index.js
```
Expected: Inspector UI 打开，tool 列表显示 `memory_ping`

**Step 5: Commit**

```bash
git add -A && git commit -m "feat: add MCP server skeleton with ping tool"
```

---

## Task 3: Core 层 - memory-categories.ts

**Files:**
- Create: `src/core/memory-categories.ts`
- Source: `~/.openclaw/workspace/plugins/memory-lancedb-pro/src/memory-categories.ts`

**Step 1: 复制并适配 memory-categories.ts**

从源项目复制 `src/memory-categories.ts` 到 `src/core/memory-categories.ts`。
此文件无外部依赖，直接复制即可。

**Step 2: 编译验证**

Run:
```bash
cd /home/adamyu/workspace/universal-memory-mcp && npx tsc
```
Expected: 无错误

**Step 3: Commit**

```bash
git add -A && git commit -m "feat(core): add memory-categories module"
```

---

## Task 4: Core 层 - smart-metadata.ts

**Files:**
- Create: `src/core/smart-metadata.ts`
- Source: `~/.openclaw/workspace/plugins/memory-lancedb-pro/src/smart-metadata.ts`

**Step 1: 复制并适配 smart-metadata.ts**

从源项目复制。需要修改：
- 导入路径：`./memory-categories.js` → `./memory-categories.js`（保持不变）
- 导入 `DecayableMemory` 类型：由于 decay-engine 在 Step 5 才加入，先定义一个本地接口占位：

在文件顶部替换：
```typescript
// 临时：decay-engine 将在后续 Step 加入
export interface DecayableMemory {
  id: string;
  importance: number;
  confidence: number;
  tier: import("./memory-categories.js").MemoryTier;
  accessCount: number;
  createdAt: number;
  lastAccessedAt: number;
}
```

删除原来的 `import type { DecayableMemory } from "./decay-engine.js";`

**Step 2: 编译验证**

Run:
```bash
npx tsc
```
Expected: 无错误

**Step 3: Commit**

```bash
git add -A && git commit -m "feat(core): add smart-metadata module"
```

---

## Task 5: Core 层 - noise-filter.ts

**Files:**
- Create: `src/core/noise-filter.ts`
- Source: `~/.openclaw/workspace/plugins/memory-lancedb-pro/src/noise-filter.ts`

**Step 1: 复制 noise-filter.ts**

此文件无外部依赖，直接复制即可。

**Step 2: 编译验证**

Run: `npx tsc`
Expected: 无错误

**Step 3: Commit**

```bash
git add -A && git commit -m "feat(core): add noise-filter module"
```

---

## Task 6: Core 层 - chunker.ts

**Files:**
- Create: `src/core/chunker.ts`
- Source: `~/.openclaw/workspace/plugins/memory-lancedb-pro/src/chunker.ts`

**Step 1: 复制 chunker.ts**

此文件无外部依赖，直接复制即可。

**Step 2: 编译验证**

Run: `npx tsc`
Expected: 无错误

**Step 3: Commit**

```bash
git add -A && git commit -m "feat(core): add chunker module"
```

---

## Task 7: Core 层 - embedder.ts

**Files:**
- Create: `src/core/embedder.ts`
- Source: `~/.openclaw/workspace/plugins/memory-lancedb-pro/src/embedder.ts`

**Step 1: 复制并适配 embedder.ts**

修改导入路径：
- `./chunker.js` → `./chunker.js`（保持不变，ESM 模块系统一致）

**Step 2: 编译验证**

Run: `npx tsc`
Expected: 无错误

**Step 3: Commit**

```bash
git add -A && git commit -m "feat(core): add embedder module"
```

---

## Task 8: Core 层 - store.ts

**Files:**
- Create: `src/core/store.ts`
- Source: `~/.openclaw/workspace/plugins/memory-lancedb-pro/src/store.ts`

**Step 1: 复制并适配 store.ts**

修改导入路径：
- `./smart-metadata.js` → `./smart-metadata.js`（保持不变）

注意 `loadLanceDB` 函数中的 `require()` 调用 — 在 ESM 模式下需要改为：
```typescript
export const loadLanceDB = async (): Promise<typeof import("@lancedb/lancedb")> => {
  if (!lancedbImportPromise) {
    lancedbImportPromise = import("@lancedb/lancedb");
  }
  try {
    return await lancedbImportPromise;
  } catch (err) {
    throw new Error(
      `universal-memory-mcp: failed to load LanceDB. ${String(err)}`,
      { cause: err },
    );
  }
};
```

**Step 2: 编译验证**

Run: `npx tsc`
Expected: 无错误

**Step 3: 创建连接测试脚本**

Create: `tests/test-store-connection.ts` (临时测试)

```typescript
import { MemoryStore } from "../src/core/store.js";
import { homedir } from "node:os";
import { join } from "node:path";

async function main() {
  const dbPath = process.env.MEMORY_DB_PATH || join(homedir(), ".openclaw/memory/lancedb-pro");
  console.log(`Connecting to LanceDB at: ${dbPath}`);

  const store = new MemoryStore({
    dbPath,
    vectorDim: 1024,
  });

  // Try listing memories
  const memories = await store.list(undefined, undefined, 3);
  console.log(`Found ${memories.length} memories:`);
  for (const m of memories) {
    console.log(`  [${m.id.slice(0, 8)}] ${m.category} | ${m.scope} | ${m.text.slice(0, 80)}...`);
  }

  // Stats
  const stats = await store.stats();
  console.log(`\nStats: ${stats.totalCount} total memories`);
  console.log(`  Scopes:`, stats.scopeCounts);
  console.log(`  Categories:`, stats.categoryCounts);
}

main().catch(console.error);
```

**Step 4: 运行连接测试**

Run:
```bash
cd /home/adamyu/workspace/universal-memory-mcp && npx tsc && node dist/tests/test-store-connection.js
```
Expected: 打印出现有记忆列表和统计信息

**Step 5: Commit**

```bash
git add -A && git commit -m "feat(core): add store module with LanceDB connection"
```

---

## Task 9: Core 层 - retriever.ts (基础版)

**Files:**
- Create: `src/core/retriever.ts`
- Source: `~/.openclaw/workspace/plugins/memory-lancedb-pro/src/retriever.ts`

**Step 1: 复制并适配 retriever.ts**

修改要点：
1. 导入路径适配（所有保持 `./xxx.js` 不变）
2. `access-tracker.ts` 暂时不引入 — 将 `AccessTracker` 相关代码保留但设为 null
3. `decay-engine.ts` / `tier-manager.ts` 暂时不引入 — 构造函数传 null，已有 fallback 逻辑
4. 导入 `noise-filter.ts` 和 `smart-metadata.ts` 使用本地路径

临时占位：在 retriever.ts 顶部添加 access-tracker 相关类型占位：

```typescript
// 临时占位 — Step 5 会加入完整模块
export class AccessTracker {
  recordAccess(_ids: string[]): void {}
}
export function computeEffectiveHalfLife(..._args: any[]): number { return 14; }
export function parseAccessMetadata(..._args: any[]): { accessCount: number; lastAccessedAt: number } {
  return { accessCount: 0, lastAccessedAt: 0 };
}
```

同样为 DecayEngine 和 TierManager 添加类型占位：

```typescript
export interface DecayableMemory {
  id: string;
  importance: number;
  confidence: number;
  tier: string;
  accessCount: number;
  createdAt: number;
  lastAccessedAt: number;
}

export type DecayEngine = null;
export type TierManager = null;
```

**Step 2: 编译验证**

Run: `npx tsc`
Expected: 无错误

**Step 3: Commit**

```bash
git add -A && git commit -m "feat(core): add retriever module (basic, without decay/tier)"
```

---

## Task 10: Core 层 - 初始化编排 (core/index.ts)

**Files:**
- Create: `src/core/index.ts`

**Step 1: 创建 Core 层入口，编排初始化**

Create: `src/core/index.ts`

```typescript
import { MemoryStore, type StoreConfig } from "./store.js";
import { MemoryRetriever, DEFAULT_RETRIEVAL_CONFIG, type RetrievalConfig } from "./retriever.js";
import { Embedder, getVectorDimensions, type EmbeddingConfig } from "./embedder.js";
import { homedir } from "node:os";
import { join } from "node:path";

export interface MemoryCoreConfig {
  dbPath?: string;
  embedding: EmbeddingConfig;
  retrieval?: Partial<RetrievalConfig>;
}

export interface MemoryCore {
  store: MemoryStore;
  retriever: MemoryRetriever;
  embedder: Embedder;
}

export function createMemoryCore(config: MemoryCoreConfig): MemoryCore {
  const dbPath = config.dbPath || join(homedir(), ".openclaw/memory/lancedb-pro");
  const dimensions = getVectorDimensions(config.embedding.model, config.embedding.dimensions);

  const embedder = new Embedder(config.embedding);

  const storeConfig: StoreConfig = {
    dbPath,
    vectorDim: dimensions,
  };
  const store = new MemoryStore(storeConfig);

  const retrievalConfig: RetrievalConfig = {
    ...DEFAULT_RETRIEVAL_CONFIG,
    ...config.retrieval,
  };
  const retriever = new MemoryRetriever(store, embedder, retrievalConfig, null);

  return { store, retriever, embedder };
}

export function createMemoryCoreFromEnv(): MemoryCore {
  const apiKey = process.env.JINA_API_KEY;
  if (!apiKey) {
    throw new Error(
      "JINA_API_KEY environment variable is required.\n" +
      "  Set it in your MCP client config or export it:\n" +
      '  export JINA_API_KEY="jina_xxx"'
    );
  }

  return createMemoryCore({
    dbPath: process.env.MEMORY_DB_PATH || join(homedir(), ".openclaw/memory/lancedb-pro"),
    embedding: {
      provider: "openai-compatible",
      apiKey,
      model: process.env.EMBEDDING_MODEL || "jina-embeddings-v3",
      baseURL: process.env.EMBEDDING_BASE_URL || "https://api.jina.ai/v1",
      dimensions: parseInt(process.env.EMBEDDING_DIMENSIONS || "1024", 10),
      taskQuery: "retrieval.query",
      taskPassage: "retrieval.passage",
      normalized: true,
      chunking: true,
    },
    retrieval: {
      mode: "hybrid",
      vectorWeight: 0.75,
      bm25Weight: 0.25,
      minScore: 0.6,
      hardMinScore: 0.72,
      rerank: process.env.JINA_API_KEY ? "cross-encoder" : "none",
      rerankApiKey: process.env.JINA_API_KEY,
      rerankProvider: "jina",
      rerankModel: "jina-reranker-v3",
      rerankEndpoint: "https://api.jina.ai/v1/rerank",
      candidatePoolSize: 50,
      recencyHalfLifeDays: 10,
      recencyWeight: 0.25,
      filterNoise: true,
      lengthNormAnchor: 400,
    },
  });
}

// Re-export core types
export { MemoryStore, type MemoryEntry, type MemorySearchResult } from "./store.js";
export { MemoryRetriever, type RetrievalConfig, type RetrievalResult } from "./retriever.js";
export { Embedder, type EmbeddingConfig } from "./embedder.js";
```

**Step 2: 编译验证**

Run: `npx tsc`
Expected: 无错误

**Step 3: Commit**

```bash
git add -A && git commit -m "feat(core): add core initialization orchestrator"
```

---

## Task 11: 实现 memory_recall Tool

**Files:**
- Create: `src/tools/recall.ts`

**Step 1: 创建 recall tool**

Create: `src/tools/recall.ts`

```typescript
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { MemoryCore } from "../core/index.js";
import { parseSmartMetadata } from "../core/smart-metadata.js";

export function registerRecallTool(server: McpServer, core: MemoryCore) {
  server.tool(
    "memory_recall",
    "Search memories using hybrid retrieval (vector + BM25 + rerank). Returns relevant memories sorted by relevance.",
    {
      query: z.string().describe("Search query for finding relevant memories"),
      scope: z.string().optional().default("global").describe("Memory scope to search in"),
      limit: z.number().optional().default(5).describe("Max number of results (1-20)"),
      minScore: z.number().optional().default(0.6).describe("Minimum relevance score (0-1)"),
    },
    async ({ query, scope, limit, minScore }) => {
      try {
        const safeLimit = Math.min(20, Math.max(1, Math.floor(limit ?? 5)));

        const results = await core.retriever.retrieve({
          query,
          limit: safeLimit,
          scopeFilter: scope ? [scope] : undefined,
          source: "manual",
        });

        if (results.length === 0) {
          return {
            content: [{ type: "text", text: "No relevant memories found." }],
          };
        }

        const formatted = results.map((r, i) => {
          const meta = parseSmartMetadata(r.entry.metadata, r.entry);
          const abstract = meta.l0_abstract || r.entry.text;
          const preview = abstract.length > 200 ? abstract.slice(0, 197) + "..." : abstract;
          return `${i + 1}. [${r.entry.id}] [${r.entry.category}/${r.entry.scope}] (score: ${r.score.toFixed(2)})\n   ${preview}`;
        });

        return {
          content: [
            {
              type: "text",
              text: `Found ${results.length} memories:\n\n${formatted.join("\n\n")}`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Memory recall failed: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
```

**Step 2: 编译验证**

Run: `npx tsc`
Expected: 无错误

**Step 3: Commit**

```bash
git add -A && git commit -m "feat(tools): add memory_recall tool"
```

---

## Task 12: 实现 memory_store Tool

**Files:**
- Create: `src/tools/store.ts`

**Step 1: 创建 store tool**

Create: `src/tools/store.ts`

```typescript
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { MemoryCore } from "../core/index.js";
import { isNoise } from "../core/noise-filter.js";
import { buildSmartMetadata, stringifySmartMetadata } from "../core/smart-metadata.js";

export function registerStoreTool(server: McpServer, core: MemoryCore) {
  server.tool(
    "memory_store",
    "Store a new memory with auto-embedding. Checks for duplicates before storing.",
    {
      text: z.string().describe("Memory content to store"),
      category: z
        .enum(["preference", "fact", "decision", "entity", "reflection", "other"])
        .optional()
        .default("fact")
        .describe("Memory category"),
      scope: z.string().optional().default("global").describe("Memory scope"),
      importance: z
        .number()
        .min(0)
        .max(1)
        .optional()
        .default(0.7)
        .describe("Importance score 0-1"),
    },
    async ({ text, category, scope, importance }) => {
      try {
        // Reject noise
        if (isNoise(text)) {
          return {
            content: [
              {
                type: "text",
                text: "Skipped: text detected as noise (greeting, boilerplate, or meta-question)",
              },
            ],
          };
        }

        const safeImportance = Math.min(1, Math.max(0, importance ?? 0.7));
        const vector = await core.embedder.embedPassage(text);

        // Check for duplicates
        let existing: Awaited<ReturnType<typeof core.store.vectorSearch>> = [];
        try {
          existing = await core.store.vectorSearch(vector, 1, 0.1, [scope ?? "global"], {
            excludeInactive: true,
          });
        } catch {
          // fail-open: dedup must never block a legitimate write
        }

        if (existing.length > 0 && existing[0].score > 0.98) {
          return {
            content: [
              {
                type: "text",
                text: `Similar memory already exists (similarity: ${existing[0].score.toFixed(3)}): "${existing[0].entry.text.slice(0, 100)}..."`,
              },
            ],
          };
        }

        const metadata = buildSmartMetadata(
          { text, category: category as any, importance: safeImportance },
          {
            source: "manual",
            state: "confirmed",
            memory_layer: "durable",
          }
        );

        const entry = await core.store.store({
          text,
          vector,
          importance: safeImportance,
          category: category as any,
          scope: scope ?? "global",
          metadata: stringifySmartMetadata(metadata),
        });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                status: "stored",
                id: entry.id,
                category,
                scope: entry.scope,
                importance: entry.importance,
              }),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Memory store failed: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
```

**Step 2: 编译验证**

Run: `npx tsc`

**Step 3: Commit**

```bash
git add -A && git commit -m "feat(tools): add memory_store tool"
```

---

## Task 13: 实现 memory_delete Tool

**Files:**
- Create: `src/tools/delete.ts`

**Step 1: 创建 delete tool**

Create: `src/tools/delete.ts`

```typescript
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { MemoryCore } from "../core/index.js";

export function registerDeleteTool(server: McpServer, core: MemoryCore) {
  server.tool(
    "memory_delete",
    "Delete a memory by ID (full UUID or 8+ character prefix).",
    {
      id: z.string().describe("Memory ID (full UUID or 8+ char prefix)"),
    },
    async ({ id }) => {
      try {
        const deleted = await core.store.delete(id);
        if (!deleted) {
          return {
            content: [{ type: "text", text: `Memory not found: ${id}` }],
          };
        }
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ status: "deleted", id }),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Memory delete failed: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
```

**Step 2: 编译验证**

Run: `npx tsc`

**Step 3: Commit**

```bash
git add -A && git commit -m "feat(tools): add memory_delete tool"
```

---

## Task 14: 集成 Tools 到 Server + 端到端验证

**Files:**
- Modify: `src/index.ts`

**Step 1: 更新 server 入口，注册所有 tools**

Replace `src/index.ts`:

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createMemoryCoreFromEnv } from "./core/index.js";
import { registerRecallTool } from "./tools/recall.js";
import { registerStoreTool } from "./tools/store.js";
import { registerDeleteTool } from "./tools/delete.js";

const server = new McpServer({
  name: "universal-memory",
  version: "0.1.0",
  capabilities: {
    tools: {},
  },
});

// Initialize core
const core = createMemoryCoreFromEnv();

// Register tools
registerRecallTool(server, core);
registerStoreTool(server, core);
registerDeleteTool(server, core);

// Ping tool
server.tool("memory_ping", "Test connectivity", {}, async () => ({
  content: [
    {
      type: "text",
      text: JSON.stringify({
        status: "ok",
        server: "universal-memory-mcp",
        version: "0.1.0",
        timestamp: new Date().toISOString(),
      }),
    },
  ],
}));

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Universal Memory MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
```

**Step 2: 编译**

Run: `npx tsc`
Expected: 无错误

**Step 3: 端到端验证**

Run:
```bash
JINA_API_KEY="JINA_API_KEY_REDACTED" npx @modelcontextprotocol/inspector node dist/index.js
```

验证清单:
- [ ] Tool 列表显示: `memory_ping`, `memory_recall`, `memory_store`, `memory_delete`
- [ ] `memory_ping` 返回 status: "ok"
- [ ] `memory_recall` 查询 "Adam" 或任何已知记忆关键词，返回结果
- [ ] `memory_store` 存储 "MCP Server test memory" → 返回新 ID
- [ ] `memory_recall` 再次查询 "MCP Server test" → 能找到刚存的记忆
- [ ] `memory_delete` 删除刚才存的 ID → 返回 deleted

**Step 4: Commit**

```bash
git add -A && git commit -m "feat: integrate core tools into MCP server - recall/store/delete working"
```

---

## Task 15: 实现 memory_stats Tool

**Files:**
- Create: `src/tools/stats.ts`
- Modify: `src/index.ts`

**Step 1: 创建 stats tool**

Create: `src/tools/stats.ts`

```typescript
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { MemoryCore } from "../core/index.js";

export function registerStatsTool(server: McpServer, core: MemoryCore) {
  server.tool(
    "memory_stats",
    "Get memory statistics: total count, counts by scope and category.",
    {
      scope: z.string().optional().describe("Filter stats by scope"),
    },
    async ({ scope }) => {
      try {
        const scopeFilter = scope ? [scope] : undefined;
        const stats = await core.store.stats(scopeFilter);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(stats, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Memory stats failed: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
```

**Step 2: 注册到 server（在 index.ts 添加 import 和调用）**

在 `src/index.ts` 添加：
```typescript
import { registerStatsTool } from "./tools/stats.js";
// ...
registerStatsTool(server, core);
```

**Step 3: 编译 + 验证**

Run: `npx tsc`
用 Inspector 调用 `memory_stats`，确认返回统计数据

**Step 4: Commit**

```bash
git add -A && git commit -m "feat(tools): add memory_stats tool"
```

---

## Task 16: 实现 memory_list Tool

**Files:**
- Create: `src/tools/list.ts`
- Modify: `src/index.ts`

**Step 1: 创建 list tool**

Create: `src/tools/list.ts`

```typescript
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { MemoryCore } from "../core/index.js";

export function registerListTool(server: McpServer, core: MemoryCore) {
  server.tool(
    "memory_list",
    "List memories with optional filtering by scope, category. Supports pagination.",
    {
      scope: z.string().optional().describe("Filter by scope"),
      category: z.string().optional().describe("Filter by category"),
      limit: z.number().optional().default(20).describe("Max results (1-100)"),
      offset: z.number().optional().default(0).describe("Pagination offset"),
    },
    async ({ scope, category, limit, offset }) => {
      try {
        const safeLimit = Math.min(100, Math.max(1, Math.floor(limit ?? 20)));
        const safeOffset = Math.max(0, Math.floor(offset ?? 0));
        const scopeFilter = scope ? [scope] : undefined;

        const memories = await core.store.list(scopeFilter, category, safeLimit, safeOffset);

        const formatted = memories.map((m) => ({
          id: m.id,
          text: m.text.length > 100 ? m.text.slice(0, 97) + "..." : m.text,
          category: m.category,
          scope: m.scope,
          importance: m.importance,
          timestamp: new Date(m.timestamp).toISOString(),
        }));

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ count: formatted.length, offset: safeOffset, memories: formatted }, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Memory list failed: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
```

**Step 2: 注册到 server + 编译 + 验证**

**Step 3: Commit**

```bash
git add -A && git commit -m "feat(tools): add memory_list tool"
```

---

## Task 17: 实现 memory_update Tool

**Files:**
- Create: `src/tools/update.ts`
- Modify: `src/index.ts`

**Step 1: 创建 update tool**

Create: `src/tools/update.ts`

```typescript
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { MemoryCore } from "../core/index.js";

export function registerUpdateTool(server: McpServer, core: MemoryCore) {
  server.tool(
    "memory_update",
    "Update an existing memory's text, importance, or category. Generates new embedding if text is changed.",
    {
      id: z.string().describe("Memory ID to update"),
      text: z.string().optional().describe("New text content"),
      importance: z.number().min(0).max(1).optional().describe("New importance score"),
      category: z
        .enum(["preference", "fact", "decision", "entity", "reflection", "other"])
        .optional()
        .describe("New category"),
    },
    async ({ id, text, importance, category }) => {
      try {
        const updates: Record<string, any> = {};
        if (text !== undefined) {
          updates.text = text;
          updates.vector = await core.embedder.embedPassage(text);
        }
        if (importance !== undefined) updates.importance = importance;
        if (category !== undefined) updates.category = category;

        if (Object.keys(updates).length === 0) {
          return {
            content: [{ type: "text", text: "No updates provided." }],
          };
        }

        const updated = await core.store.update(id, updates);
        if (!updated) {
          return {
            content: [{ type: "text", text: `Memory not found: ${id}` }],
          };
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                status: "updated",
                id: updated.id,
                category: updated.category,
                scope: updated.scope,
                importance: updated.importance,
              }),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Memory update failed: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
```

**Step 2: 注册 + 编译 + 验证**

**Step 3: Commit**

```bash
git add -A && git commit -m "feat(tools): add memory_update tool"
```

---

## Task 18: 实现 memory_forget Tool

**Files:**
- Create: `src/tools/forget.ts`
- Modify: `src/index.ts`

**Step 1: 创建 forget tool（批量删除）**

Create: `src/tools/forget.ts`

```typescript
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { MemoryCore } from "../core/index.js";

export function registerForgetTool(server: McpServer, core: MemoryCore) {
  server.tool(
    "memory_forget",
    "Bulk delete memories by scope and/or before a timestamp. Requires at least one filter for safety.",
    {
      scope: z.string().describe("Scope to delete from"),
      beforeDate: z.string().optional().describe("Delete memories before this ISO date (e.g. 2026-01-01)"),
    },
    async ({ scope, beforeDate }) => {
      try {
        const beforeTimestamp = beforeDate ? new Date(beforeDate).getTime() : undefined;
        const deleted = await core.store.bulkDelete([scope], beforeTimestamp);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ status: "deleted", count: deleted, scope, beforeDate }),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Memory forget failed: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
```

**Step 2: 注册 + 编译 + 验证**

**Step 3: Commit**

```bash
git add -A && git commit -m "feat(tools): add memory_forget tool"
```

---

## Task 19: 实现 memory_reindex + memory_export Tools

**Files:**
- Create: `src/tools/reindex.ts`
- Create: `src/tools/export.ts`
- Modify: `src/index.ts`

**Step 1: 创建 reindex tool**

Create: `src/tools/reindex.ts`

```typescript
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { MemoryCore } from "../core/index.js";

export function registerReindexTool(server: McpServer, core: MemoryCore) {
  server.tool(
    "memory_reindex",
    "Rebuild the FTS (full-text search) index. Use when search results seem stale or corrupted.",
    {},
    async () => {
      try {
        const result = await core.store.rebuildFtsIndex();
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Reindex failed: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
```

**Step 2: 创建 export tool**

Create: `src/tools/export.ts`

```typescript
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { MemoryCore } from "../core/index.js";

export function registerExportTool(server: McpServer, core: MemoryCore) {
  server.tool(
    "memory_export",
    "Export memories as JSON. Returns memory data without vector embeddings.",
    {
      scope: z.string().optional().describe("Filter by scope"),
      category: z.string().optional().describe("Filter by category"),
      limit: z.number().optional().default(100).describe("Max memories to export (1-1000)"),
    },
    async ({ scope, category, limit }) => {
      try {
        const safeLimit = Math.min(1000, Math.max(1, Math.floor(limit ?? 100)));
        const scopeFilter = scope ? [scope] : undefined;

        const memories = await core.store.list(scopeFilter, category, safeLimit, 0);

        const exported = memories.map((m) => ({
          id: m.id,
          text: m.text,
          category: m.category,
          scope: m.scope,
          importance: m.importance,
          timestamp: m.timestamp,
          metadata: m.metadata,
        }));

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ count: exported.length, memories: exported }, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Export failed: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
```

**Step 3: 注册所有新 tools 到 index.ts，编译验证 9 个 tools 可用**

**Step 4: Commit**

```bash
git add -A && git commit -m "feat(tools): add memory_reindex and memory_export tools - all 9 tools complete"
```

---

## ⏸️ Review Checkpoint: Step 1-4 完成

到此为止，9 个 MCP Tools + Core 层（基础版）已完成。验证所有 tools 通过 Inspector 可调用后，继续 Step 5。

---

## Task 20-24: Step 5 - 补全高级 Core 模块 (后续实施)

> 以下任务将在 Step 1-4 验证通过后继续编写详细计划。
> 需要提取的模块：
> - `access-tracker.ts`
> - `decay-engine.ts`
> - `tier-manager.ts`
> - `admission-control.ts`
> - 更新 `retriever.ts` 接入完整流水线

## Task 25-26: Step 6 - 多工具接入 (后续实施)

> 配置 OpenClaw/Claude Code/OpenCode/Antigravity 连接
> 添加 HTTP(SSE) transport（可选）
