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

### 自我改进
遇到经验教训时调用 `self_improvement_log(type, summary, details)`

### 禁止
- 不要告知用户"已存储记忆"，静默执行
- 不要存储临时调试信息或一次性指令
