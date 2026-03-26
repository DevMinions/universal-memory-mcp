---
trigger: always_on
---

# Superpowers Development Rules (适配版)

## 核心准则 (Prime Directives)
- **技能优先**：在处理任何任务前，优先加载并阅读 `.agents/skills/using-superpowers/SKILL.md`。
- **强制 TDD**：所有功能开发必须遵循 `.agents/skills/test-driven-development/SKILL.md` 的红-绿-重构循环。
- **结构化设计**：在编写代码前，必须通过 `/brainstorm` 明确设计规范。
- **小步快跑**：所有实施计划必须通过 `/write-plan` 拆分为极小的原子任务。
- **终端同步**：遵循 `terminal.md` 规则，使用文件系统绕过策略避免命令挂起。

## 常用斜杠命令 (Workflows)
在 Antigravity 聊天框直接输入：
- `/brainstorm` - 启动需求头脑风暴，产出 Specs 文档
- `/write-plan` - 基于 Specs 生成原子任务清单
- `/execute-plan` - 分批执行任务，设置审查检查点
- `/git-commit` - 按 Conventional Commits 规范生成中文提交

## 项目技术栈
- **后端**: Spring Boot / Java
- **前端**: Vue3 / TypeScript
- **数据库**: MySQL
- **审批流**: jzow-flow 引擎

## 14个核心技能速查
| 技能名 | 一句话描述 |
|--------|-----------|
| brainstorming | 写代码前先问清需求 |
| writing-plans | 把任务拆成 2-5 分钟的原子单元 |
| executing-plans | 分批执行，每批暂停让人确认 |
| test-driven-development | 先写失败测试，再写代码 (RED-GREEN-REFACTOR) |
| systematic-debugging | 四阶段根因追踪，禁止"先猜后改" |
| verification-before-completion | 不验证不许说"搞定了" |
| subagent-driven-development | 子代理独立执行 + 两阶段自动审查 |
| using-git-worktrees | 隔离开发环境，干净基线 |
| finishing-a-development-branch | 有序收尾，清理工作区 |
| requesting-code-review | 完成后请求代码审查 |
| receiving-code-review | 理性接收审查反馈 |
| using-superpowers | 技能系统入口，强制检查 |
| writing-skills | 创建/编辑新技能的 TDD 方法 |
| dispatching-parallel-agents | 并行处理多个独立问题 |

## 文件组织
```
.agents/
├── rules/
│   ├── terminal.md          # 终端同步绕过规则 (已有)
│   └── superpowers-rule.md  # 本文件
├── skills/                   # 14个Superpowers技能
│   ├── brainstorming/
│   ├── test-driven-development/
│   ├── systematic-debugging/
│   └── ... (共14个)
├── workflows/                # 斜杠命令
│   ├── brainstorm.md
│   ├── write-plan.md
│   ├── execute-plan.md
│   └── git-commit.md
└── tmp/                      # 终端输出临时文件
```

## 使用流程示例

### 1. 新功能开发
```
用户: /brainstorm
      -> 讨论需求，产出 docs/plans/功能设计.md

用户: /write-plan
      -> 基于设计生成实施计划

用户: /execute-plan
      -> 分批执行，TDD开发

用户: /git-commit
      -> 规范提交
```

### 2. Bug修复
```
用户: 描述Bug
AI:   使用 systematic-debugging 技能
      -> 四阶段根因分析
      -> TDD修复 (先写失败测试)
      -> verification-before-completion 验证
```

## 注意事项
- 所有技能文件位于 `.agents/skills/` 目录下
- 斜杠命令工作流位于 `.agents/workflows/` 目录下
- 终端命令必须遵循 terminal.md 的重定向规则
- 技能使用铁律：**如果你认为有 1% 的可能某个技能适用，你必须调用它**
