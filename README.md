# Universal Memory MCP Server

> **基于 [memory-lancedb-pro](https://github.com/CortexReach/memory-lancedb-pro) 构建** — 将其生产级记忆引擎从 OpenClaw 原生插件移植为标准 MCP Server，让 **任何支持 MCP 的 AI 工具** (Antigravity, OpenCode, Cursor, Claude Desktop 等) 都能共享同一份智能记忆。

[![Based on memory-lancedb-pro](https://img.shields.io/badge/Based%20on-memory--lancedb--pro-blue)](https://github.com/CortexReach/memory-lancedb-pro)
[![MCP](https://img.shields.io/badge/Protocol-MCP-green)](https://modelcontextprotocol.io)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

---

## ⚠️ 与 OpenClaw 原生插件的区别

原生 `memory-lancedb-pro` 插件运行在 OpenClaw Gateway 内部，可以**自动拦截消息流**（通过 hooks），实现完全无感知的记忆管理。而 MCP Server 是一个**被动工具服务**，AI 需要主动调用 tool 才能存取记忆。

| 能力 | OpenClaw 原生插件 | MCP Server (本项目) |
|------|:---:|:---:|
| 手动存储/召回 | ✅ | ✅ 18 个 MCP Tools |
| LLM 智能提取 | ✅ 自动 (hook) | ✅ 手动调用 `memory_extract` |
| 会话反思 | ✅ 自动 (hook) | ✅ 手动调用 `memory_reflect` |
| **对话前自动注入记忆** | ✅ `before_agent_start` | ❌ 需要 Rules 引导 AI 主动调用 |
| **对话后自动提取** | ✅ `agent_end` | ❌ 需要 Rules 引导 AI 主动调用 |
| 衰减/分层/治理 | ✅ 内嵌 | ✅ 完全移植 |
| 跨工具共享 | ❌ OpenClaw 专属 | ✅ 任何 MCP 客户端 |
| 远程多设备接入 | ❌ | ✅ HTTP/SSE 模式 |
| 数据兼容 | - | ✅ 共享同一份 LanceDB |

### 如何弥补 autoRecall / autoCapture 的差距？

通过在 AI 工具的 **System Prompt / Rules** 中引导 AI 主动使用记忆工具。项目提供了现成的规则文件（见下方 [规则示例](#-规则示例rules)），效果约覆盖原生体验的 80-90%。

> 💡 **未来展望**: 当 MCP 客户端支持 [Sampling](https://modelcontextprotocol.io/specification/2025-11-25/client/sampling) 后，MCP Server 将可以主动请求 AI 做事，从而实现与原生插件完全等价的自动记忆管理。

---

## 🚀 快速开始

### 1. 安装

```bash
git clone https://github.com/your-username/universal-memory-mcp.git
cd universal-memory-mcp
npm install && npm run build
```

### 2. 配置

复制默认配置并填入你的 API Key：

```bash
cp config.default.json config.json
```

编辑 `config.json`，至少填入 Jina API Key：

```json
{
  "embedding": {
    "apiKey": "jina_你的key"
  },
  "retrieval": {
    "rerankApiKey": "jina_你的key"
  }
}
```

> 📝 `config.json` 只需要写你要覆盖的字段，其余自动继承 `config.default.json` 的生产默认值。
> 
> 📝 获取 Jina API Key: https://jina.ai/api-key (有免费额度)

### 3. 接入 AI 工具

**stdio 模式**（本地单机，推荐）：

```json
{
  "mcpServers": {
    "universal-memory": {
      "command": "node",
      "args": ["/path/to/universal-memory-mcp/dist/index.js"]
    }
  }
}
```

**HTTP 模式**（远程多设备共享）：

```bash
MCP_MODE=http MCP_AUTH_TOKEN="your-secret" node dist/index.js
```

客户端配置：
```json
{
  "mcpServers": {
    "universal-memory": {
      "url": "http://your-server:3100/mcp",
      "headers": { "Authorization": "Bearer your-secret" }
    }
  }
}
```

---

## 📖 规则示例（Rules）

由于 MCP 无法像原生插件那样自动拦截消息流，需要通过 **Rules 引导 AI 主动使用记忆工具**。以下是现成的规则文件，直接复制到你的项目中即可。

### Antigravity / Gemini

将以下内容添加到你项目的 `.agents/rules/memory-rules.md` 或全局 rules 中：

```markdown
# 记忆管理规则 (Universal Memory MCP)

你已连接 `universal-memory` MCP Server。请在对话中自动管理用户记忆。

## 对话开始时 — 自动召回
当用户发来第一条消息时（非简单问候），立即调用 `memory_recall` 检索相关记忆：
- 用消息核心意图作为 query，limit 设为 5
- 将召回的记忆纳入回复上下文（不需要告知用户）

## 对话过程中 — 自动存储
发现以下信息时静默存储：
- 偏好 → `memory_store(text, category="preference")`
- 事实 → `memory_store(text, category="fact")`
- 决策 → `memory_store(text, category="decision")`
- 实体 → `memory_store(text, category="entity")`

## Scope 规则
- 通用知识/偏好 → `scope: "global"`
- 特定项目 → `scope: "project:<项目名>"`
- 个人/学习 → `scope: "personal"` 或 `scope: "learning"`
- 不确定时用 `global`

## 对话结束时 — 反思总结
涉及较多技术讨论或重要决策时，调用 `memory_reflect` 总结。

## 禁止
- 不要告知用户"已存储记忆"，静默执行
- 不要存储临时调试信息或一次性指令
- 不要对简单问候调用 memory_recall
```

### OpenCode / Claude Code

将以下内容添加到项目根目录的 `AGENTS.md`：

```markdown
# Universal Memory MCP — Agent 指令

## 记忆管理
你已连接 `universal-memory` MCP Server。请在对话中自动管理用户记忆。

### 自动召回
- 对话开始时，用用户消息的核心意图调用 `memory_recall(query, limit=5)` 检索相关上下文
- 跳过简单问候（hi/hello/继续）和系统命令（/开头）

### 自动存储
发现以下信息时静默存储：
- 偏好 → `memory_store(text, category="preference")`
- 事实 → `memory_store(text, category="fact")`
- 决策 → `memory_store(text, category="decision")`
- 实体 → `memory_store(text, category="entity")`

### Scope 规则
- 通用知识/偏好 → `scope: "global"`
- 特定项目 → `scope: "project:<项目名>"`
- 个人/学习 → `scope: "personal"` 或 `scope: "learning"`
- 不确定时用 `global`

### 自我改进
遇到经验教训时调用 `self_improvement_log(type, summary, details)`

### 禁止
- 不要告知用户"已存储记忆"，静默执行
- 不要存储临时调试信息或一次性指令
```

### Cursor

在 Cursor Settings → Rules 中添加同样的规则内容。

---

## 🔧 18 个 MCP Tools

### 核心工具

| Tool | 说明 |
|------|------|
| `memory_ping` | 连通性测试 |
| `memory_recall` | 混合检索 (向量 + BM25 + Jina rerank) |
| `memory_store` | 存储记忆 (自动嵌入 + 去重 + 降噪) |
| `memory_delete` | 按 ID 删除 |
| `memory_update` | 更新记忆 (文本变更时自动重新嵌入) |
| `memory_forget` | 批量删除 (按 scope + 时间) |
| `memory_stats` | 统计信息 |
| `memory_list` | 分页列表 |
| `memory_reindex` | 重建 FTS 索引 |
| `memory_export` | JSON 导出 |

### 智能工具

| Tool | 说明 |
|------|------|
| `memory_extract` | LLM 智能提取 — 从对话文本中自动识别并提取结构化记忆 |
| `memory_reflect` | 反思引擎 — 解析反思文本为不变式和衍生知识 |

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

---

## ⚙️ 配置系统

配置优先级：`config.json` > `config.default.json`（环境变量也可覆盖关键参数）

```bash
config.default.json  ← 全部默认值（不要修改，跟随代码更新）
config.json          ← 你的配置（只写要覆盖的部分，已 gitignore）
```

### 完整配置参数

查看 [`config.default.json`](config.default.json) 获取所有可配置参数，包括：

| 模块 | 关键参数 | 说明 |
|------|---------|------|
| `embedding` | model, dimensions, taskQuery | Jina v3/v5 或 OpenAI embedding |
| `llm` | model, baseURL, timeoutMs | 智能提取用的 LLM |
| `retrieval` | vectorWeight, hardMinScore, rerank | 混合检索 + rerank 参数 |
| `decay` | recencyHalfLifeDays, betaCore/Working/Peripheral | 记忆衰减引擎 |
| `tier` | coreAccessThreshold, peripheralAgeDays | core/working/peripheral 分层 |
| `admissionControl` | preset, weights, typePriors | 新记忆准入控制 |

### 环境变量

| 变量 | 说明 |
|------|------|
| `MCP_MODE` | `stdio` (默认) 或 `http` (远程) |
| `MCP_PORT` | HTTP 监听端口 (默认 3100) |
| `MCP_AUTH_TOKEN` | HTTP 模式认证 token |
| `MCP_CONFIG_PATH` | 自定义配置文件路径 |

---

## 🌐 远程部署 (HTTP 模式)

将 MCP Server 部署为中央记忆服务，多台设备共享同一份记忆。

### Docker 部署

```bash
# 1. 准备配置
cp config.default.json config.json  # 编辑填入 API keys
echo "MCP_AUTH_TOKEN=your-secret" > .env

# 2. 启动
docker compose up -d

# 3. 验证
curl http://your-server:3100/health
```

### 架构

```
┌─ 服务器 ──────────────────────────────────┐
│  Universal Memory MCP Server               │
│  http://0.0.0.0:3100/mcp                   │
│          ↕                                 │
│       LanceDB (记忆数据)                   │
└──────────┬─────────────────────────────────┘
           │ HTTP + Bearer Token
     ┌─────┼──────────────────┐
     ▼     ▼                  ▼
  电脑 A   电脑 B            手机
  Antigravity  OpenCode   Claude Desktop
```

---

## 🏗️ 架构

```
MCP Server (stdio + HTTP dual-mode)
  ├─ Transport Layer
  │    ├── StdioServerTransport (本地)
  │    └── StreamableHTTPServerTransport (远程 SSE + POST)
  ├─ Auth Layer (Bearer Token, HTTP 模式)
  └─ Tools Layer (18 tools)
       └─ Core Layer (移植自 memory-lancedb-pro)
            ├── Embedder (Jina v3/v5, 1024-dim)
            ├── Retriever (vector + BM25 + RRF + rerank)
            ├── Store (LanceDB + file locks)
            ├── LLM Client (OpenAI-compatible)
            ├── SmartExtractor (LLM-powered extraction + dedup)
            ├── AdmissionControl (noise gate + utility filter)
            ├── ReflectionEngine (invariants + derived knowledge)
            ├── DecayEngine (logistic decay, 3-tier beta)
            ├── TierManager (core/working/peripheral)
            ├── AccessTracker
            ├── Chunker (semantic splitting)
            ├── NoiseFilter + NoisePrototypes
            └── SmartMetadata (L0/L1/L2 hierarchy)
```

---

## 📋 致谢

本项目的核心记忆引擎完整移植自 **[memory-lancedb-pro](https://github.com/CortexReach/memory-lancedb-pro)** — 由 [CortexReach](https://github.com/CortexReach) 开发的生产级长期记忆系统。包括但不限于：

- 混合检索引擎 (向量 + BM25 + RRF + cross-encoder reranking)
- LLM 智能提取与准入控制
- 衰减引擎 (logistic decay with 3-tier beta weights)
- 分层管理 (core / working / peripheral)
- 反思引擎 (invariants + derived knowledge)
- 自我改进治理

本项目在此基础上增加了：
- 标准 MCP 协议封装（18 个 Tools）
- HTTP/SSE 远程传输模式
- Bearer Token 认证
- Docker 部署支持
- AI 工具 Rules 引导（弥补 autoRecall/autoCapture）

---

## 📄 License

MIT
