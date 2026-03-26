# Universal Memory MCP Server - 项目文档

**版本**: 1.0  
**创建日期**: 2026-03-26  
**状态**: 规划阶段  
**维护者**: Adam

---

## 1. 问题定义

### 1.1 核心痛点
AI 助手在不同工具间频繁"失忆"，导致：
- ❌ 切换工具时丢失项目上下文（OpenClaw → Claude → OpenCode → Antigravity）
- ❌ 新会话忘记技术决策和偏好
- ❌ 重复解释相同项目结构

### 1.2 现有方案局限
| 方案 | 局限 |
|------|------|
| memory-lancedb-pro | **仅 OpenClaw 可用**，其他工具无法访问 |
| AI_CONTEXT.md | 手动同步，被动记忆 |
| 各工具内置记忆 | 相互隔离，无法共享 |

---

## 2. 核心原则

| 原则 | 含义 |
|------|------|
| **不妥协** | 不接受"手动同步"或"部分工具用文本" |
| **长期解决** | 投入时间构建可持续方案 |
| **统一真相源** | 所有工具共享同一记忆数据库 |
| **MCP 标准** | 使用标准协议，避免 vendor lock-in |
| **保留资产** | 复用现有 96MB/353 条记忆数据 |

---

## 3. 方案决策

### 3.1 评估过的方案

#### 方案 A: 改造 Memory-LanceDB-Pro 为 MCP
- **可行性**: ✅ 完全可行
- **工作量**: 1-2 周
- **优点**: 零数据迁移，功能完整
- **缺点**: 需要维护 fork

#### 方案 B: 使用 OpenSpace
- **可行性**: ✅ 可行
- **工作量**: 1 周
- **优点**: 官方 MCP 支持，社区活跃
- **缺点**: 需要数据迁移，学习曲线陡峭

#### 方案 C: 基于官方 Memory MCP 扩展
- **可行性**: ✅ 可行
- **工作量**: 3-5 天
- **优点**: 官方维护
- **缺点**: 功能受限

#### 方案 D: 全新构建 Universal Memory MCP Server
- **可行性**: ✅ 可行
- **工作量**: 2-3 周
- **优点**: 为跨工具场景专门设计
- **缺点**: 工作量最大

### 3.2 最终选择

**采用方案 A 的改进版: Memory-LanceDB-Pro MCP Bridge**

**理由**:
1. ✅ **零数据迁移** - 直接使用现有 96MB 数据和 353 条记忆
2. ✅ **功能完整** - 保留 Hybrid RAG、生命周期管理等高级特性
3. ✅ **技术栈一致** - TypeScript/Node.js，易于维护
4. ✅ **渐进实施** - 可以先做 MVP，再迭代完善
5. ✅ **完全可控** - 自己的项目，可定制

---

## 4. 实施路线图

### Phase 1: 核心架构搭建（第 1-2 天）

**目标**: 让 MCP Server 跑起来，能连接 1 个工具

**任务清单**:
- [ ] 项目初始化（npm, typescript）
- [ ] 提取核心模块（store/retriever/embedder）
- [ ] 实现基础 MCP Server（3 个核心 Tools）
- [ ] stdio transport
- [ ] 在 OpenClaw 中测试

**验收标准**:
- [ ] 能在 OpenClaw 中 recall 到现有记忆
- [ ] 能 store 新记忆
- [ ] 数据写入原 LanceDB 目录

---

### Phase 2: 完整功能实现（第 3-4 天）

**目标**: 9 个完整 Tools，支持所有工具连接

**任务清单**:
- [ ] 实现全部 9 个 Tools
  - memory_recall - 混合检索
  - memory_store - 存储新记忆
  - memory_update - 更新记忆
  - memory_delete - 删除记忆
  - memory_forget - 批量删除
  - memory_stats - 统计信息
  - memory_list - 列出记忆
  - memory_reindex - 重建索引
  - memory_export - 导出记忆
- [ ] 添加 HTTP Transport (SSE)
- [ ] 独立配置系统（YAML）
- [ ] 在 Claude Code 中测试

**验收标准**:
- [ ] 所有 9 个 Tools 可用
- [ ] OpenClaw 和 Claude Code 都能连接
- [ ] 数据一致性验证

---

### Phase 3: 多工具验证和优化（第 5 天）

**目标**: 所有 4 个工具都能使用

**任务清单**:
- [ ] OpenCode 配置和测试
- [ ] Antigravity 配置和测试
- [ ] 性能优化（连接池、缓存）
- [ ] 错误处理和日志系统
- [ ] 健康检查 endpoint

**验收标准**:
- [ ] 4 个工具都能 recall/store
- [ ] 响应时间 < 500ms
- [ ] 错误率 < 1%

---

### Phase 4: 迁移和切换（第 6 天）

**目标**: 完全切换到新系统

**任务清单**:
- [ ] 数据备份
- [ ] 停用 OpenClaw 内置 memory-lancedb-pro
- [ ] 编写完整文档
  - README.md
  - 安装指南
  - 配置示例（4 个工具）
- [ ] 测试完整工作流
  - OpenClaw 存储 → Claude Code 读取 → OpenCode 更新 → Antigravity 验证

**验收标准**:
- [ ] 完全切换到新系统
- [ ] 所有历史记忆可用
- [ ] 跨工具记忆同步正常

---

## 5. 技术规范

### 5.1 项目结构

```
universal-memory-mcp/
├── src/
│   ├── server.ts              # MCP Server 入口
│   ├── tools/                 # MCP Tools 实现
│   │   ├── recall.ts
│   │   ├── store.ts
│   │   ├── update.ts
│   │   ├── delete.ts
│   │   ├── forget.ts
│   │   ├── stats.ts
│   │   ├── list.ts
│   │   ├── reindex.ts
│   │   └── export.ts
│   ├── core/                  # 核心模块（从 memory-lancedb-pro 提取）
│   │   ├── lancedb-store.ts   # 数据存储
│   │   ├── hybrid-retriever.ts # 混合检索
│   │   └── embedder.ts        # 嵌入生成
│   ├── config/                # 配置管理
│   │   └── loader.ts
│   └── transport/             # Transport 层
│       ├── stdio.ts
│       └── http.ts
├── config/
│   └── config.example.yaml    # 配置示例
├── tests/                     # 测试用例
├── package.json
├── tsconfig.json
└── README.md
```

### 5.2 数据库兼容性

**复用现有 LanceDB 数据**:
```typescript
const db = await lancedb.connect(
  path.resolve(os.homedir(), '.openclaw/memory/lancedb-pro')
);
```

**数据模型**:
- 表名: `memories`
- 列: `id`, `text`, `vector`, `category`, `scope`, `metadata`, `timestamp`, `importance`

### 5.3 MCP Tools 定义

#### memory_recall
```typescript
{
  name: "memory_recall",
  description: "Search memories using hybrid retrieval (vector + BM25)",
  inputSchema: {
    type: "object",
    properties: {
      query: { 
        type: "string", 
        description: "Search query" 
      },
      scope: { 
        type: "string", 
        description: "Memory scope (global, project, etc)",
        default: "global"
      },
      limit: { 
        type: "number", 
        default: 5,
        description: "Max number of results"
      },
      minScore: { 
        type: "number", 
        default: 0.6,
        description: "Minimum relevance score"
      }
    },
    required: ["query"]
  }
}
```

#### memory_store
```typescript
{
  name: "memory_store",
  description: "Store a new memory with auto-embedding",
  inputSchema: {
    type: "object",
    properties: {
      text: { 
        type: "string", 
        description: "Memory content" 
      },
      category: { 
        type: "string", 
        enum: ["profile", "fact", "decision", "preference", "entity", "pattern"],
        default: "fact"
      },
      scope: { 
        type: "string", 
        default: "global",
        description: "Memory scope"
      },
      importance: { 
        type: "number", 
        default: 0.7,
        minimum: 0,
        maximum: 1
      },
      metadata: {
        type: "object",
        description: "Additional metadata"
      }
    },
    required: ["text"]
  }
}
```

### 5.4 配置规范

**配置文件位置**: `~/.universal-memory/config.yaml`

```yaml
# 数据库配置
database:
  path: ~/.openclaw/memory/lancedb-pro
  backup_dir: ~/.universal-memory/backups
  auto_backup: true
  backup_interval: daily

# Embedding 配置
embedding:
  provider: jina  # 或 openai, azure, ollama
  api_key: ${JINA_API_KEY}
  model: jina-embeddings-v3
  dimensions: 1024
  batch_size: 10

# 检索配置
retrieval:
  mode: hybrid  # hybrid, vector, bm25
  vector_weight: 0.75
  bm25_weight: 0.25
  rerank: true
  rerank_provider: jina
  rerank_model: jina-reranker-v3
  candidate_pool_size: 50
  min_score: 0.6
  hard_min_score: 0.72

# 生命周期配置
lifecycle:
  recency_half_life_days: 14
  recency_weight: 0.25
  reinforcement_factor: 0.85

# MCP 配置
mcp:
  transport: stdio  # stdio 或 http
  http_port: 3001
  http_host: localhost
  
# 日志配置
logging:
  level: info  # debug, info, warning, error
  file: ~/.universal-memory/logs/server.log
  max_size: 100MB
  max_files: 5
```

**配置加载优先级**:
1. 命令行参数 (`--config /path/to/config.yaml`)
2. 环境变量 (`UNIVERSAL_MEMORY_CONFIG`)
3. 默认位置 (`~/.universal-memory/config.yaml`)

---

## 6. 工具配置示例

### 6.1 OpenClaw

```json
// ~/.openclaw/openclaw.json
{
  "plugins": {
    "entries": {
      "memory-lancedb-pro": {
        "enabled": false  // 停用内置插件
      }
    }
  },
  "mcpServers": {
    "universal-memory": {
      "command": "node",
      "args": ["/path/to/universal-memory-mcp/dist/server.js"],
      "env": {
        "CONFIG_PATH": "~/.universal-memory/config.yaml",
        "JINA_API_KEY": "jina_xxx"
      }
    }
  }
}
```

### 6.2 Claude Code

```json
// ~/.claude/mcp.json
{
  "mcpServers": {
    "universal-memory": {
      "command": "node",
      "args": ["/path/to/universal-memory-mcp/dist/server.js"],
      "env": {
        "CONFIG_PATH": "~/.universal-memory/config.yaml"
      }
    }
  }
}
```

### 6.3 OpenCode

```json
// ~/.opencode/mcp.json
{
  "mcpServers": {
    "universal-memory": {
      "command": "node",
      "args": ["/path/to/universal-memory-mcp/dist/server.js"],
      "env": {
        "CONFIG_PATH": "~/.universal-memory/config.yaml"
      }
    }
  }
}
```

### 6.4 Antigravity

```json
// ~/.antigravity/mcp.json
{
  "mcpServers": {
    "universal-memory": {
      "command": "node",
      "args": ["/path/to/universal-memory-mcp/dist/server.js"],
      "env": {
        "CONFIG_PATH": "~/.universal-memory/config.yaml"
      }
    }
  }
}
```

---

## 7. 风险和对策

| 风险 | 概率 | 影响 | 对策 |
|------|------|------|------|
| MCP 协议版本不兼容 | 低 | 高 | 使用稳定版 SDK，定期更新 |
| LanceDB 版本冲突 | 中 | 高 | 锁定版本，测试升级，保持兼容 |
| 性能瓶颈（大数据量） | 低 | 中 | 添加缓存、连接池、索引优化 |
| 数据损坏 | 低 | 高 | 自动备份、事务支持、数据校验 |
| 工具 MCP 支持差异 | 中 | 中 | 充分测试，准备 fallback 方案 |
| 维护负担 | 中 | 中 | 良好文档、自动化测试、社区参与 |

---

## 8. 维护计划

### 8.1 短期（第 1 个月）
- 完成 Phase 1-4 实施
- 编写完整文档
- 创建自动化测试
- 建立问题追踪

### 8.2 中期（第 2-3 个月）
- 性能优化
- 添加高级功能（可选）
  - 记忆可视化 Dashboard
  - 统计和分析
  - 导入/导出工具
- 开源发布（可选）

### 8.3 长期（持续）
- 定期更新依赖
- 跟进 MCP 协议更新
- 社区反馈处理
- 功能迭代

---

## 9. 附录

### 9.1 相关资源

- **MCP 协议规范**: https://modelcontextprotocol.io/
- **MCP TypeScript SDK**: https://github.com/modelcontextprotocol/typescript-sdk
- **LanceDB 文档**: https://lancedb.github.io/lancedb/
- **原 memory-lancedb-pro**: ~/.openclaw/workspace/plugins/memory-lancedb-pro/

### 9.2 决策记录

**2026-03-26**:
- ✅ 确定问题：跨工具记忆共享
- ✅ 确定原则：不妥协、统一真相源、MCP 标准
- ✅ 选择方案：改造 memory-lancedb-pro 为 MCP
- ✅ 确定技术栈：TypeScript/Node.js + LanceDB
- ✅ 制定路线图：4 个 Phase，6 天完成

### 9.3 待解决问题

- [ ] 验证 OpenCode 和 Antigravity 的 MCP 配置方式
- [ ] 确定是否需要同时支持 stdio 和 HTTP transport
- [ ] 评估是否需要添加认证机制（HTTP 模式）
- [ ] 决定是否开源该项目

---

**文档维护**: 每次重大决策后更新  
**下次审查**: Phase 1 完成后
