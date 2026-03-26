# Universal Memory MCP — Phase 2 设计文档

> **目标：** 完全提取 memory-lancedb-pro 的所有记忆能力到独立 MCP Server
>
> **前提：** Phase 1 已完成（核心存储/检索/衰减链路，10 个 Tools）

---

## 设计决策

### LLM 调用方式
- **方案 A（已确认）**: 环境变量配 API Key，MCP Server 直接调 LLM API
- 新增环境变量: `LLM_API_KEY`, `LLM_MODEL`（默认 `gpt-4o-mini`）, `LLM_BASE_URL`（默认 OpenAI）
- 用 `openai` SDK 的 OpenAI-compatible 模式，支持任何供应商

### 模块处理策略
- **丢弃 7 个** OpenClaw 平台模块: `llm-oauth`, `clawteam-scope`, `identity-addressing`, `session-recovery`, `workspace-boundary`, `migrate`, `memory-upgrader`
- **暂缓 1 个**: `scopes`（高级权限隔离，当前基础 scope 过滤已够用）
- **重写 1 个**: `llm-client`（去 OpenClaw OAuth，改环境变量直连）
- **直接迁移 17 个**: 复制 + 适配导入路径 + 修复 strict 类型

---

## Phase A — LLM 基础层

**目标**: 建立独立的 LLM 调用能力，为 smart-extractor 和反思引擎提供基础。

### 模块清单

| Task | 文件 | 行数 | 类型 | 说明 |
|------|------|------|------|------|
| A1 | `src/core/llm-client.ts` | ~300 | 重写 | 去掉 OAuth，用环境变量 + OpenAI SDK |
| A2 | `src/core/extraction-prompts.ts` | 216 | 直接迁移 | 6 分类提取 prompt 模板 |
| A3 | `src/core/index.ts` 更新 | - | 修改 | 集成 LLM client 到 MemoryCore |

### A1 重写要点 (llm-client.ts)
- 删除: `buildOauthEndpoint`, `llm-oauth` 相关代码
- 保留: `chat()`, `jsonChat()`, `extractMemories()` 等 LLM 调用接口
- 新增: 从 `LLM_API_KEY` / `LLM_BASE_URL` / `LLM_MODEL` 初始化 OpenAI client
- 保留: 错误处理、重试逻辑、token 限制

### 验证标准
- `npx tsc` 编译通过
- LLM client 能正确调用 API 返回结果
- extraction-prompts 可被 smart-extractor 引用

---

## Phase B — 智能提取 + 准入控制

**目标**: 实现从对话自动提取记忆 + 质量门控，这是原生插件最核心的"智能"能力。

### 模块清单

| Task | 文件 | 行数 | 类型 | 说明 |
|------|------|------|------|------|
| B1 | `src/core/smart-extractor.ts` | 1292 | 迁移 + 适配 | LLM 驱动的记忆提取管道 |
| B2 | `src/core/admission-control.ts` | 748 | 迁移 + 适配 | 准入控制：去重 + 质量过滤 + fact-key 冲突检测 |
| B3 | `src/core/admission-stats.ts` | 332 | 直接迁移 | 准入统计 |
| B4 | `src/core/noise-prototypes.ts` | 163 | 直接迁移 | 增强噪声原型库 |
| B5 | `src/core/preference-slots.ts` | 76 | 直接迁移 | 偏好槽位管理 |
| B6 | `src/tools/extract.ts` | ~80 | 新建 | memory_extract 工具（手动触发提取） |

### B1 适配要点 (smart-extractor.ts)
- 导入: `llm-client.ts` 替换原来的 OpenClaw LLM 通道
- 删除: OpenClaw 的 `agentContext`, `eventLoop` 依赖
- 保留: 提取管道核心逻辑（对话 → LLM 提取 → 候选 → 去重 → 持久化）
- 新增: MCP 工具包装（memory_extract tool）

### B2 适配要点 (admission-control.ts)
- 删除: OpenClaw 的 scope 权限检查（用简化版替代）
- 保留: 语义去重、fact-key 冲突检测、质量评分

### 验证标准
- 手动调用 memory_extract tool 能从文本提取记忆
- admission-control 能正确去重（相似度 >0.95 拒绝）
- 端到端: 输入对话文本 → 自动提取 → 准入 → 存储

---

## Phase C — 反思引擎

**目标**: 实现记忆的自动总结、整合、一致性检查能力。

### 模块清单

| Task | 文件 | 行数 | 类型 | 说明 |
|------|------|------|------|------|
| C1 | `src/core/reflection-metadata.ts` | 22 | 直接迁移 | 类型定义 |
| C2 | `src/core/reflection-ranking.ts` | 32 | 直接迁移 | 反思排序 |
| C3 | `src/core/reflection-mapped-metadata.ts` | 83 | 直接迁移 | 映射元数据 |
| C4 | `src/core/reflection-event-store.ts` | 97 | 直接迁移 | 事件存储 |
| C5 | `src/core/reflection-item-store.ts` | 111 | 直接迁移 | 条目存储 |
| C6 | `src/core/reflection-retry.ts` | 180 | 直接迁移 | 重试逻辑 |
| C7 | `src/core/reflection-slices.ts` | 318 | 迁移 + 适配 | 反思切片 |
| C8 | `src/core/reflection-store.ts` | 604 | 迁移 + 适配 | 反思存储（依赖 llm-client） |

### 适配要点
- `reflection-store.ts` 和 `reflection-slices.ts` 依赖 `llm-client`，需要替换 LLM 调用方式
- 反思引擎的调度由 MCP Server 自行管理（不再依赖 OpenClaw 事件循环）

### 验证标准
- 反思引擎能读取现有记忆 → 调 LLM 生成总结
- 冲突检测能发现矛盾记忆并标记

---

## Phase D — 增强工具 + 高级检索

**目标**: 补全所有缺失的 Tools + 自适应检索 + 自我改进能力。

### 模块清单

| Task | 文件 | 行数 | 类型 | 说明 |
|------|------|------|------|------|
| D1 | `src/core/adaptive-retrieval.ts` | 97 | 直接迁移 | 自适应检索策略 |
| D2 | `src/core/self-improvement-files.ts` | 142 | 直接迁移 | 技能提取/存储 |
| D3 | `src/tools/archive.ts` | ~50 | 新建 | memory_archive 工具 |
| D4 | `src/tools/compact.ts` | ~80 | 新建 | memory_compact 工具（依赖 llm-client） |
| D5 | `src/tools/promote.ts` | ~50 | 新建 | memory_promote 工具 |
| D6 | `src/tools/explain-rank.ts` | ~60 | 新建 | memory_explain_rank 工具 |
| D7 | `src/tools/self-improvement.ts` | ~100 | 新建 | 3 个 self_improvement_* 工具 |

### 验证标准
- 所有 17+ 个 Tools 在 MCP Inspector 中可见
- memory_compact 能正确合并相似记忆
- self_improvement_extract_skill 能提取技能文件

---

## 环境变量（完整版）

| 变量 | 必须 | 默认值 | 说明 |
|------|------|--------|------|
| `JINA_API_KEY` | ✅ | - | Jina API (嵌入 + rerank) |
| `LLM_API_KEY` | ✅ | - | LLM API (提取 + 反思) |
| `LLM_MODEL` | ❌ | `gpt-4o-mini` | LLM 模型 |
| `LLM_BASE_URL` | ❌ | `https://api.openai.com/v1` | LLM API 地址 |
| `MEMORY_DB_PATH` | ❌ | `~/.openclaw/memory/lancedb-pro` | LanceDB 路径 |

---

## 工作量估计

| Phase | 模块数 | 代码量 | 预计时间 |
|-------|--------|--------|----------|
| A: LLM 基础层 | 3 | ~500 行 | 15 分钟 |
| B: 智能提取 | 6 | ~2,700 行 | 40 分钟 |
| C: 反思引擎 | 8 | ~1,450 行 | 30 分钟 |
| D: 增强工具 | 7 | ~580 行 | 20 分钟 |
| **总计** | **24 tasks** | **~5,230 行** | **~105 分钟** |
