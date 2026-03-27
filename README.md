# Universal Memory MCP Server

跨工具记忆共享 MCP Server — 让 OpenClaw、Antigravity、OpenCode 等 AI 工具共享同一份记忆。

## 🚀 快速开始

### 1. 安装依赖

```bash
cd /home/adamyu/workspace/universal-memory-mcp
npm install && npm run build
```

### 2. 设置环境变量

```bash
export JINA_API_KEY="jina_xxx"  # 必须：嵌入 + rerank
export LLM_API_KEY="sk-xxx"     # 可选：智能提取 + 反思引擎
```

### 3. 配置客户端

**Antigravity** — 已配置在 `~/.gemini/antigravity/mcp_config.json`

**OpenCode** — 已配置在项目根目录 `opencode.json`

**其他 MCP 客户端** — 使用标准 stdio 配置：
```json
{
  "command": "node",
  "args": ["/home/adamyu/workspace/universal-memory-mcp/dist/index.js"],
  "env": { "JINA_API_KEY": "jina_xxx", "LLM_API_KEY": "sk-xxx" }
}
```

## 🔧 18 个 Tools

### 核心工具

| Tool | 说明 |
|------|------|
| `memory_ping` | 连通性测试 |
| `memory_recall` | 混合检索 (向量 + BM25 + rerank) |
| `memory_store` | 存储记忆 (自动嵌入 + 去重 + 降噪) |
| `memory_delete` | 按 ID 删除 |
| `memory_update` | 更新记忆 (文本变更时自动重新嵌入) |
| `memory_forget` | 批量删除 (按 scope + 时间) |
| `memory_stats` | 统计信息 |
| `memory_list` | 分页列表 |
| `memory_reindex` | 重建 FTS 索引 |
| `memory_export` | JSON 导出 |

### 智能工具 (需要 `LLM_API_KEY`)

| Tool | 说明 |
|------|------|
| `memory_extract` | LLM 智能提取 — 从对话文本中自动识别并提取记忆 |
| `memory_reflect` | 反思引擎 — 解析反思文本为结构化不变式和衍生知识 |

### 治理工具

| Tool | 说明 |
|------|------|
| `memory_archive` | 归档记忆 — 从自动召回中移除但保留历史 |
| `memory_promote` | 提升记忆状态 — 手动确认/提升记忆层级 |
| `memory_compact` | 压缩去重 — 发现并归档重复记忆 |
| `memory_explain_rank` | 排名解释 — 展示检索排序的详细治理元数据 |

### 自我改进工具

| Tool | 说明 |
|------|------|
| `self_improvement_log` | 记录学习/错误日志 |
| `self_improvement_review` | 回顾改进历史 |

## 📦 环境变量

| 变量 | 必须 | 默认值 | 说明 |
|------|------|--------|------|
| `JINA_API_KEY` | ✅ | - | Jina API 密钥 (嵌入 + rerank) |
| `LLM_API_KEY` | ❌ | - | LLM API 密钥 (智能提取 + 反思引擎) |
| `LLM_MODEL` | ❌ | `gpt-4o-mini` | LLM 模型名 |
| `LLM_BASE_URL` | ❌ | `https://api.openai.com/v1` | LLM API 地址 |
| `MEMORY_DB_PATH` | ❌ | `~/.openclaw/memory/lancedb-pro` | LanceDB 数据库路径 |
| `EMBEDDING_MODEL` | ❌ | `jina-embeddings-v3` | 嵌入模型 |
| `EMBEDDING_BASE_URL` | ❌ | `https://api.jina.ai/v1` | 嵌入 API 地址 |
| `EMBEDDING_DIMENSIONS` | ❌ | `1024` | 向量维度 |

## 🏗️ 架构

```
MCP Server (stdio)
  └─ Tools Layer (18 tools)
       └─ Core Layer
            ├── Embedder (Jina v3, 1024-dim)
            ├── Retriever (vector + BM25 + RRF + rerank)
            ├── Store (LanceDB + file locks)
            ├── LLM Client (OpenAI-compatible)
            ├── SmartExtractor (LLM-powered extraction + dedup)
            ├── AdmissionControl (noise gate + utility filter)
            ├── ReflectionEngine (invariants + derived knowledge)
            ├── DecayEngine (logistic decay)
            ├── TierManager (core/working/peripheral)
            ├── AccessTracker
            ├── Chunker (semantic splitting)
            ├── NoiseFilter + NoisePrototypes
            └── SmartMetadata (L0/L1/L2 hierarchy)
```

**数据兼容性**：直接使用 OpenClaw memory-lancedb-pro 的 LanceDB 数据库，零迁移。
