# sync-openclaw 同步检查清单

## 先做版本对照

在任何真实同步前，先确认：

1. 源端 OpenClaw 版本
2. 目标端 OpenClaw 版本
3. 双方对应 release / docs / breaking changes

如果任一方版本较新，先看对应 release 文档，再决定是否允许 `replace` / `merge`。

## 前置条件

- [ ] 源路径可读
- [ ] 目标路径可写
- [ ] OpenClaw CLI 可用
- [ ] shell/TUI 可用，适合 SSH 场景
- [ ] 如需验证，至少有一个可用 provider / model

## Dry-Run / Preview 必须做什么

预览不能只给一个差异计数，至少要归纳：

- [ ] 源端存在哪些配置、memory、cron、skills、workspace 资料
- [ ] 目标端缺失哪些模块
- [ ] 哪些模块是通用 OpenClaw 模块
- [ ] 哪些模块是源机本地定制扩展
- [ ] 哪些 secrets 在源端已有，哪些仍需人工补齐
- [ ] 哪些地方存在版本风险或冲突

预览输出至少包含：
- 可同步模块
- 冲突模块
- 推荐策略（merge / append / replace / skip）
- 本地定制提醒
- 需人工补全的 secrets

## 通用 vs 本地定制

### 通用 OpenClaw 模块
- `openclaw.json`
- `config/mcporter.json`
- `cron/jobs.json`
- `workspace/MEMORY.md`
- `workspace/memory/`
- `skills/`
- `workspace/config/`

### 本地定制模块
- Obsidian 联动
- 目标驱动 / 多代理工作文档
- 自我学习 / 进化脚本
- 投资 / 微信等本地自动化目录

如果源端存在本地定制模块，必须提示用户：
- 它们不一定适用于目标机
- 可以同步，也可以保留为建议项

## 策略选择

### replace
只在这些前提下使用：
- 版本兼容已确认
- 用户明确接受覆盖
- 目标机不需要保留现有改动

### merge
适合：
- JSON 配置
- 任务映射
- 代理配置

### append
适合：
- memory 文本追加
- 学习记录
- 某些列表式资料

### skip
适合：
- 本地特有目录
- 无法确认的版本冲突
- secrets / session / OAuth

## Secrets / Channels 规则

- [ ] 源端 `openclaw.json` 已有的 token / API key 可在用户确认下同步
- [ ] 源端没有的 secrets 不得假装同步成功
- [ ] OAuth / session / device-bound auth 默认保守处理
- [ ] 报告中必须列出“需人工补全项”

## TUI / SSH 友好要求

- [ ] 提供纯命令行入口
- [ ] 支持 `--dry-run`
- [ ] 支持 `--resume`
- [ ] 支持编号选择和策略切换
- [ ] 生成 Markdown 报告和状态文件

## 同步后验证

- [ ] `openclaw status`
- [ ] gateway 可启动
- [ ] `openclaw cron list`
- [ ] `mcporter list` / 关键 MCP 可读
- [ ] `workspace/MEMORY.md` 与 `workspace/memory/` 可读
- [ ] 关键 skills 存在
- [ ] 同步报告列出成功项、冲突项、需人工项

## 紧急原则

- 先 preview，再真实同步
- 版本不一致先看 release 文档
- 不要把本地定制模块强行同步成“标准模块"
