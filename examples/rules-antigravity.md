# 记忆管理规则 (Universal Memory MCP)

> 此文件是 Antigravity / OpenCode 等 AI 客户端的 AGENTS.md 规则模板。
> 复制到你的项目根目录的 `AGENTS.md` 中即可生效。

你已连接 `universal-memory` MCP Server。你**必须**在每次对话中主动管理用户记忆。

## 1. 对话开始 — 强制召回

用户发来第一条**实质性消息**时（非 hi/hello/继续），**必须立即**调用：
```
memory_recall(query=<用户消息核心意图>, limit=5)
```
将结果纳入你的回复上下文，但不要告知用户。

## 2. 对话过程 — 主动存储

发现以下**任何一种**信息时，**立即**调用 `memory_store` 静默存储：

| 信号 | category | 示例 |
|------|----------|------|
| 用户说"我喜欢/偏好/习惯…" | `preference` | "我喜欢用 Vue3" |
| 项目事实、技术栈、架构 | `fact` | "项目用的是 MySQL 8" |
| 选择方案 A 而非 B | `decision` | "决定用 Docker 部署" |
| 人名、项目名、服务地址 | `entity` | "线上地址是 xx.xx.xx" |
| bug 原因和解决方式 | `fact` | "超时原因是连接池不够" |

**判断技巧**：如果这条信息在下一次对话中可能有用，就存储它。宁多勿少。

## 3. 对话结束 — 强制回顾（最重要）

**在每次对话即将结束时，你必须执行以下检查**：

回顾本次对话，如果涉及了以下任何内容，调用对应工具：

- **有新的事实/偏好/决策**但还没存 → 补调 `memory_store`
- **超过 5 轮有深度的技术讨论** → 调用 `memory_extract(text=<对话摘要>)` 让 LLM 自动提取结构化记忆
- **有重要经验教训** → 调用 `self_improvement_log`
- **有反思性总结** → 调用 `memory_reflect`

> ⚠️ 这不是建议，是**强制要求**。每次对话至少产生一次 store 或 extract。

## 4. Scope 规则

存储时根据内容选择 scope：
- `global` — 通用知识、跨项目技能、通用偏好
- `project:<项目名>` — 特定项目知识（如 `project:my-app`）
- `personal` — 个人生活、习惯
- `learning` — 学习笔记、技术研究
- 不确定时用 `global`
- recall 时不传 scope 则搜索全部

## 5. 自我改进

遇到经验教训时调用 `self_improvement_log(type, summary, details)`：
- `type: "learning"` — 最佳实践、纠正的认知
- `type: "error"` — 工具故障、配置问题、踩坑记录

## 6. 禁止事项

- **不要**告知用户"已存储记忆"，所有操作静默执行
- **不要**存储临时调试信息或一次性指令（"帮我格式化这段代码"）
- **不要**对简单问候调用 memory_recall
