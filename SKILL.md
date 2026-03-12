---
name: sync-openclaw
description: Compare another OpenClaw instance or backup source against the current installation, match both sides to their release docs, generate a dry-run sync plan, warn about local custom modules like Obsidian/multi-agent/self-evolution files, and guide the user through TUI-friendly merge/append/replace/skip decisions with verification and a final sync report.
---

# sync-openclaw Skill

> OpenClaw 增量同步向导 - 交互式双端对比同步工具

## 概述

`sync-openclaw` 是一个交互式同步向导，用于在两个 OpenClaw 实例之间进行增量对比和同步。与 `revive-openclaw`（专注于从备份恢复）不同，本 skill 专注于**双向对比、增量同步**场景。

## 核心差异（与 revive-openclaw）

| 维度 | revive-openclaw | sync-openclaw |
|------|-----------------|---------------|
| 场景 | 从备份恢复损坏的系统 | 双端对比增量同步 |
| 方向 | 单向（备份→本机） | 双向可选（源→目标） |
| 核心能力 | 恢复验证 | 对比分析 + 冲突检测 + 增量同步 |
| 交互模式 | 选择恢复模块 | 选择同步模块 + 策略选择 + 预览确认 |

## 功能特性

- **版本对照同步**：先识别源端和目标端版本，再对照 release / docs / breaking changes，避免跨版本乱同步
- **双端对比**：扫描并对比源 OpenClaw 与本机 OpenClaw 的差异
- **增量同步**：只同步源端有而本机缺失或更新的内容
- **冲突检测**：检测两端都修改过的文件，提示用户选择保留策略
- **策略框架**：支持 merge / append / replace / skip 四种同步策略
- **Dry-Run / Preview**：执行前预览同步计划，归纳源端已有资料和本地缺口，确认无误后再执行
- **交互式向导**：一步步引导用户完成同步流程，适合 TUI / SSH 场景
- **Resume-Safe 设计**：Gateway 重启/中断后可继续同步流程
- **同步报告**：生成详细的同步结果报告

## 同步范围

### 核心配置 (P0)
- `openclaw.json` - 核心配置
- `mcporter.json` - MCP 服务器配置
- `channels/` - 通道配置
- `plugins/` - 插件配置

### 记忆系统 (P1)
- `MEMORY.md` - 长期记忆
- `memory/*.md` - 每日记忆
- `memory.db` - 记忆数据库
- `.learnings` - 学习记录

### 定时任务 (P1)
- `cron/jobs.json` - 定时任务配置

### 技能与扩展 (P2)
- `skills/` - 自定义技能
- `MCP/` - MCP 服务器配置
- `extensions/` - 扩展配置

### 多代理配置 (P2)
- `agents/` - 代理配置目录
- `workspace/docs/multi-agent-framework.md` - 多代理架构

### 自我进化机制 (P3)
- `workspace/scripts/self-improving*.py`
- `workspace/scripts/skill-outcome-tracker.py`
- `workspace/scripts/pattern-detector.sh`

### 工作空间 (P2)
- `workspace/scripts/` - 自动化脚本
- `workspace/tools/` - 工具配置
- `workspace/config/` - 配置文件
- `workspace/workflows/` - 工作流
- `task-tool-map.json` - 任务工具映射

### 可选同步项
- Obsidian 侧关键联动文件

## 前置条件

- 已安装 OpenClaw CLI，本机和源端至少能完成目录级读取
- 最好已经安装完目标 OpenClaw 本体；否则只能做对比和计划，不能做完整验证
- 若要做验证，至少要有一个可用 provider / model，或保留 verify-only 模式
- 已明确哪些配置属于通用 OpenClaw 模块，哪些是本地定制扩展

## 通用化边界

`sync-openclaw` 也必须区分：

- **通用 OpenClaw 模块**：配置、cron、skills、memory、workspace/config
- **本地定制模块**：Obsidian、目标驱动、多代理、自我学习、投资/微信等联动目录

运行时应明确提示：哪些模块能作为通用同步模板，哪些只是当前源机的本地扩展，目标机不一定需要。

## 使用方式

### 基本命令

```bash
# 启动交互式同步向导（TUI/SSH 友好）
node scripts/sync.js --source /path/to/other

# 指定同步模式
node scripts/sync.js --source /path/to/other --mode preview
node scripts/sync.js --source /path/to/other --mode full
node scripts/sync.js --source /path/to/other --mode selective

# 预览模式（不执行）
node scripts/sync.js --source /path/to/other --dry-run

# 跳过确认
node scripts/sync.js --source /path/to/other --force

# 指定配置文件
node scripts/sync.js --source /path/to/other --config /path/to/sync-config.json
```

### 同步模式

| 模式 | 说明 | 适用场景 |
|------|------|----------|
| `preview` | 只扫描对比，生成同步计划，不执行 | 了解差异后决定 |
| `selective` | 用户选择要同步的模块和策略 | 有特殊需求时 |
| `full` | 自动同步所有差异项 | 快速同步，推荐首次使用 |
| `minimal` | 只同步核心配置 | 紧急同步 |

### 同步策略

对于每个同步项，用户可以选择：

| 策略 | 说明 | 适用场景 |
|------|------|----------|
| `merge` | 智能合并（JSON/配置文件） | 需要保留两端修改 |
| `append` | 追加模式（文本/列表） | 日志、记忆等 |
| `replace` | 直接替换（覆盖本机） | 确认源端为最新 |
| `skip` | 跳过不同步 | 有冲突但不急于解决 |

## 交互流程

```
1. 指定源 OpenClaw
   ↓
2. 双端扫描（对比差异）
   ↓
3. 生成差异报告
   ↓
4. 选择同步模式
   ↓
5. 选择同步模块（如 selective）
   ↓
6. 为每个模块选择同步策略
   ↓
7. 预览同步计划 (dry-run)
   ↓
8. 用户确认（输入 "SYNC"）
   ↓
9. 执行同步
   ↓
10. 验证结果 + 生成报告
```

## 用户参与点

同步过程中需要用户参与的步骤会被显式标注：

- ✅ **自动处理**：无需用户介入
- ⚠️ **需要确认**：等待用户输入
- 🔧 **手动处理**：提示用户后续手动操作

### Secrets / Channel 规则

- 如果源端 `openclaw.json` 已包含 channel token、provider key、Brave Search key 等秘密值，可以在用户明确选择对应策略时同步
- 如果源端没有对应 secrets，只能同步配置框架，不能把“缺 key”写成成功同步
- OAuth、session、设备绑定登录态默认保守处理，不应直接覆盖目标机

### 需要手动处理的项

1. **缺失的 API Keys / Tokens**：敏感凭证缺失时需要用户补齐
2. **外部服务配对**：Discord / Feishu / BlueBubbles 等可能需要重新配对
3. **环境差异**：不同机器的环境变量、路径、launchd / systemd 等
4. **SSH 密钥**：检查权限和可用性
5. **版本差异决策**：跨版本同步前必须先过 release / docs 对照

## 状态文件

同步进度保存在 `.sync-state.json`，支持中断后继续：

```json
{
  "sourcePath": "/path/to/other/openclaw",
  "targetPath": "/Users/yuyuan/.openclaw",
  "currentStep": 3,
  "completedModules": ["config", "memory"],
  "remainingModules": ["cron", "skills"],
  "syncPlan": {...},
  "dryRun": true,
  "timestamp": "2026-03-12T10:30:00Z"
}
```

## 输出报告

同步完成后生成 `SYNC-REPORT.md` 报告，包含：

- 同步时间、源路径
- 每个模块的同步状态
- 冲突解决记录
- 需要手动处理的事项
- 下一步建议

## 安全特性

1. **默认保守策略**：敏感项默认不自动同步
2. **Dry-Run 预览**：先看效果再执行
3. **冲突检测**：检测并提示冲突项
4. **不做未经确认的删除/移动**：所有破坏性操作需要用户确认
5. **双向可选**：支持从源拉取，也支持本地修改后推送

## 与 revive-openclaw 的协同

- `revive-openclaw`：从备份恢复（单向）
- `sync-openclaw`：双端对比同步（多向）

两者共享：
- 相同的文件扫描框架
- 相同的验证模块
- 相同的报告格式

## 技术细节

- **主脚本**：`scripts/sync.js`
- **对比脚本**：`scripts/compare.js`
- **计划生成**：`scripts/plan.js`
- **验证脚本**：`scripts/verify.js`
- **配置**：`scripts/config.json`
- **参考**：`references/sync-checklist.md`

## 依赖

- Node.js 18+
- OpenClaw CLI (用于验证)
- diff 工具（用于文件对比）

## 测试与验收

至少按三层测试：

1. **Preview / Dry-Run**：只对比并归纳源端有哪些资料、本地缺什么、哪里有冲突
2. **临时目录同步**：把计划应用到临时目录，验证 JSON、路径、报告和冲突策略是否合理
3. **真实机最小验收**：验证 `openclaw status`、gateway、cron、mcporter、memory、skills 是否仍然正常

## 限制

- 本 skill 专注于**增量同步**，不是粗暴覆盖器
- 跨版本迁移需要额外处理
- 敏感凭证需要手动处理
- 同步前必须先对照源端和目标端版本的 release / docs
