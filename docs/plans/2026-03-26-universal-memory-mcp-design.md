# Universal Memory MCP Server - 设计文档

**日期**: 2026-03-26
**状态**: 已确认，待实施
**目标**: 将 memory-lancedb-pro 改造为 MCP Server，实现跨工具记忆共享

---

## 1. 背景与目标

### 核心问题
AI 助手在 OpenClaw、Claude Code、OpenCode、Antigravity 四个工具间无法共享记忆，每次切换工具都需要重新解释上下文。

### 解决方案
将现有 OpenClaw 专用的 `memory-lancedb-pro` 插件的核心逻辑提取出来，包装为标准 MCP Server，让所有支持 MCP 协议的工具都能连接同一个记忆数据库。

### 关键约束
- **零数据迁移**: 直接复用现有 LanceDB 数据（`~/.openclaw/memory/lancedb-pro`，353 条记忆）
- **行为一致**: Core 层完整复刻 memory-lancedb-pro，不改变任何算法
- **并发安全**: 与现有 OpenClaw 插件共存，通过 `proper-lockfile` 保证数据安全
- **增量交付**: 每完成一个功能模块就验证，降低风险

---

## 2. 总体架构

```
┌─────────────────────────────────────────────────────┐
│                MCP Client 层                         │
│  OpenClaw / Claude Code / OpenCode / Antigravity     │
└──────────────────────┬──────────────────────────────┘
                       │ MCP Protocol (stdio / HTTP)
┌──────────────────────▼──────────────────────────────┐
│              MCP Server 层 (index.ts)                │
│  • Tool 注册与分发                                    │
│  • 参数校验                                          │
│  • Transport 管理 (stdio优先, HTTP后加)               │
└──────────────────────┬──────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────┐
│              Tools 层 (tools/*.ts)                    │
│  recall / store / update / delete / forget           │
│  stats / list / reindex / export                     │
└──────────────────────┬──────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────┐
│              Core 层 (core/*.ts)                     │
│  从 memory-lancedb-pro 完整提取                       │
│  store / retriever / embedder / chunker              │
│  smart-metadata / decay-engine / tier-manager        │
│  access-tracker / noise-filter / admission-control   │
└──────────────────────┬──────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────┐
│              Data 层                                 │
│  LanceDB @ ~/.openclaw/memory/lancedb-pro           │
│  (共享现有数据，跨进程文件锁保护)                      │
└─────────────────────────────────────────────────────┘
```

**架构原则**:
- Core 层是纯逻辑提取，不改变任何算法，确保行为一致
- Tools 层是薄包装，负责 MCP schema 定义 → 调用 Core → 格式化返回
- 跨进程文件锁（`proper-lockfile`）保证与现有 OpenClaw 插件并发安全

---

## 3. 增量实施计划

### Step 1: 项目骨架 + MCP Server 空壳

**任务**:
- npm init, tsconfig 配置
- 安装依赖: `@modelcontextprotocol/sdk`, `@lancedb/lancedb`, `openai`, `apache-arrow`, `proper-lockfile`
- 搭建 MCP Server 入口（stdio transport），注册一个 `memory_ping` tool

**验证**: 用 `npx @modelcontextprotocol/inspector` 连接，确认 tool 列表可见

---

### Step 2: Core 层提取 - Store + Embedder

**任务**:
- 提取 `store.ts`, `embedder.ts`, `chunker.ts`, `smart-metadata.ts`
- 去掉 OpenClaw 特有的依赖（如 plugin manifest），保持核心逻辑不变
- 适配构建系统（ESM, 路径）

**验证**: 写测试脚本，连接现有 LanceDB，读取一条记忆并打印

---

### Step 3: 实现 recall / store / delete

**任务**:
- 提取 `retriever.ts`（不带 decay/tier，先用 fallback 逻辑）
- 包装为 3 个 MCP Tools: `memory_recall`, `memory_store`, `memory_delete`

**验证**: 通过 MCP Inspector:
- recall 查到现有记忆
- store 新记忆
- delete 删除该记忆

---

### Step 4: 补全剩余 6 个 Tools

**任务**:
- 实现 `memory_update`, `memory_forget`, `memory_stats`, `memory_list`, `memory_reindex`, `memory_export`

**验证**: 全部 9 个 Tools 可通过 Inspector 调用并返回正确结果

---

### Step 5: 补全高级 Core 模块

**任务**:
- 逐个加入: `decay-engine.ts`, `tier-manager.ts`, `access-tracker.ts`, `noise-filter.ts`, `admission-control.ts` 等
- 接入 retriever，启用完整检索流水线

**验证**: recall 结果排序与原插件一致

---

### Step 6: 多工具接入 + HTTP Transport

**任务**:
- 配置 OpenClaw / Claude Code / OpenCode / Antigravity 连接
- 添加 HTTP(SSE) transport（可选）
- 编写完整文档

**验证**: 跨工具端到端测试 — OpenClaw store → Claude Code recall，数据一致

---

## 4. 技术规格

### 4.1 项目结构

```
universal-memory-mcp/
├── src/
│   ├── index.ts              # MCP Server 入口 + stdio transport
│   ├── tools/                # MCP Tools（薄包装层）
│   │   ├── recall.ts
│   │   ├── store.ts
│   │   ├── update.ts
│   │   ├── delete.ts
│   │   ├── forget.ts
│   │   ├── stats.ts
│   │   ├── list.ts
│   │   ├── reindex.ts
│   │   └── export.ts
│   └── core/                 # 从 memory-lancedb-pro 提取
│       ├── store.ts
│       ├── retriever.ts
│       ├── embedder.ts
│       ├── chunker.ts
│       ├── smart-metadata.ts
│       ├── noise-filter.ts       # Step 5
│       ├── decay-engine.ts       # Step 5
│       ├── tier-manager.ts       # Step 5
│       └── access-tracker.ts     # Step 5
├── tests/
├── package.json
├── tsconfig.json
└── README.md
```

### 4.2 核心依赖（锁定与原项目相同版本）

| 包 | 版本 | 用途 |
|---|---|---|
| `@modelcontextprotocol/sdk` | latest | MCP 协议 SDK |
| `@lancedb/lancedb` | `^0.26.2` | 向量数据库 |
| `apache-arrow` | `18.1.0` | LanceDB 数据格式 |
| `openai` | `^6.21.0` | Embedding API 客户端 |
| `proper-lockfile` | `^4.1.2` | 跨进程文件锁 |
| `typescript` | `^5.9.3` | 编译 |

### 4.3 环境变量（Phase 1 配置方式）

| 变量 | 默认值 | 说明 |
|---|---|---|
| `JINA_API_KEY` | **必填** | Jina Embedding + Rerank API Key |
| `MEMORY_DB_PATH` | `~/.openclaw/memory/lancedb-pro` | LanceDB 数据目录 |
| `EMBEDDING_MODEL` | `jina-embeddings-v3` | Embedding 模型名 |
| `EMBEDDING_DIMENSIONS` | `1024` | 向量维度 |

### 4.4 现有 Embedding 配置（必须完全匹配）

```
Provider:    Jina
Model:       jina-embeddings-v3
Dimensions:  1024
BaseURL:     https://api.jina.ai/v1
TaskQuery:   retrieval.query
TaskPassage: retrieval.passage
Normalized:  true
Chunking:    true
```

### 4.5 现有检索配置

```
Mode:             hybrid (Vector 0.75 + BM25 0.25)
MinScore:         0.6
HardMinScore:     0.72
Rerank:           cross-encoder
RerankProvider:   jina
RerankModel:      jina-reranker-v3
RerankEndpoint:   https://api.jina.ai/v1/rerank
CandidatePool:    50
RecencyHalfLife:  10 days
RecencyWeight:    0.25
FilterNoise:      true
LengthNormAnchor: 400
```

---

## 5. MCP Tools 定义

### 9 个 Tools 概览

| Tool | 描述 | Step |
|------|------|------|
| `memory_recall` | 混合检索记忆 (Vector + BM25 + Rerank) | 3 |
| `memory_store` | 存储新记忆（自动 embedding） | 3 |
| `memory_delete` | 删除记忆（支持 ID 前缀匹配） | 3 |
| `memory_update` | 更新记忆内容/元数据 | 4 |
| `memory_forget` | 批量删除（按条件） | 4 |
| `memory_stats` | 统计信息（数量、分类、scope） | 4 |
| `memory_list` | 列出记忆（分页、过滤） | 4 |
| `memory_reindex` | 重建 FTS 索引 | 4 |
| `memory_export` | 导出记忆数据 | 4 |

---

## 6. 错误处理

### MCP 返回格式

```typescript
// 成功
{ content: [{ type: "text", text: JSON.stringify(result) }] }

// 失败
{ content: [{ type: "text", text: "Error: ..." }], isError: true }
```

### 关键错误场景

| 场景 | 处理方式 |
|------|---------|
| LanceDB 连接失败 | 明确提示路径、权限问题 |
| Embedding API 失败 | 复用 `formatEmbeddingProviderError`，给出修复建议 |
| 向量维度不匹配 | 启动时校验，立即报错 |
| 并发写入冲突 | `proper-lockfile` 自动重试，超时报错 |

---

## 7. 不做的事情 (YAGNI)

- ❌ Web UI / Dashboard（后续可选）
- ❌ 认证机制（stdio 模式不需要）
- ❌ YAML 配置系统（Phase 1 用环境变量）
- ❌ smart-extractor / reflection（OpenClaw 插件层功能，不属于 MCP Server 职责）

---

## 8. 验证矩阵

| Step | 验证方式 | 通过标准 |
|------|---------|---------|
| 1 | MCP Inspector | tool 列表可见 |
| 2 | 测试脚本 | 读到现有记忆 |
| 3 | MCP Inspector | recall/store/delete 正常 |
| 4 | MCP Inspector | 9 个 tools 均可调用 |
| 5 | 对比测试 | 排序与原插件一致 |
| 6 | 跨工具测试 | store→recall 数据一致 |

---

**文档维护**: 每个 Step 完成后更新状态
**源项目**: `~/.openclaw/workspace/plugins/memory-lancedb-pro/`
