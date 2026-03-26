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
export JINA_API_KEY="jina_xxx"  # 必须
```

### 3. 配置客户端

**Antigravity** — 已配置在 `~/.gemini/antigravity/mcp_config.json`

**OpenCode** — 已配置在项目根目录 `opencode.json`

**其他 MCP 客户端** — 使用标准 stdio 配置：
```json
{
  "command": "node",
  "args": ["/home/adamyu/workspace/universal-memory-mcp/dist/index.js"],
  "env": { "JINA_API_KEY": "jina_xxx" }
}
```

## 🔧 10 个 Tools

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

## 📦 环境变量

| 变量 | 必须 | 默认值 | 说明 |
|------|------|--------|------|
| `JINA_API_KEY` | ✅ | - | Jina API 密钥 (嵌入 + rerank) |
| `MEMORY_DB_PATH` | ❌ | `~/.openclaw/memory/lancedb-pro` | LanceDB 数据库路径 |
| `EMBEDDING_MODEL` | ❌ | `jina-embeddings-v3` | 嵌入模型 |
| `EMBEDDING_BASE_URL` | ❌ | `https://api.jina.ai/v1` | 嵌入 API 地址 |
| `EMBEDDING_DIMENSIONS` | ❌ | `1024` | 向量维度 |

## 🏗️ 架构

```
MCP Server (stdio)
  └─ Tools Layer (10 tools)
       └─ Core Layer
            ├── Embedder (Jina v3, 1024-dim)
            ├── Retriever (vector + BM25 + RRF + rerank)
            ├── Store (LanceDB + file locks)
            ├── Chunker (semantic splitting)
            ├── NoiseFilter
            └── SmartMetadata
```

**数据兼容性**：直接使用 OpenClaw memory-lancedb-pro 的 LanceDB 数据库，零迁移。
