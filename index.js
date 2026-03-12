#!/usr/bin/env node

/**
 * sync-openclaw - 快速入口脚本
 * 
 * 提供简化的命令行接口
 */

const path = require('path');
const { spawn } = require('child_process');

// 获取技能目录（index.js 所在目录）
const SKILL_DIR = __dirname;
const SCRIPTS_DIR = path.join(SKILL_DIR, 'scripts');
const SYNC_SCRIPT = path.join(SCRIPTS_DIR, 'sync.js');
const COMPARE_SCRIPT = path.join(SCRIPTS_DIR, 'compare.js');
const PLAN_SCRIPT = path.join(SCRIPTS_DIR, 'plan.js');
const VERIFY_SCRIPT = path.join(SCRIPTS_DIR, 'verify.js');

// 命令映射
const COMMANDS = {
  sync: SYNC_SCRIPT,
  compare: COMPARE_SCRIPT,
  plan: PLAN_SCRIPT,
  verify: VERIFY_SCRIPT
};

function showHelp() {
  console.log(`
sync-openclaw - OpenClaw 增量同步向导

用法: sync-openclaw <命令> [选项]

命令:
  sync      执行同步（主命令）
  compare   对比两个 OpenClaw
  plan      生成同步计划
  verify    验证同步结果

同步模式:
  preview     只扫描对比，生成同步计划，不执行（默认）
  selective   用户选择要同步的模块和策略
  full        自动同步所有差异项
  minimal     只同步核心配置

同步策略:
  replace   直接替换目标文件
  merge     智能合并（JSON/配置文件）
  append    追加到目标
  skip      跳过不同步（默认策略，更安全）

示例:
  sync-openclaw sync -s /path/to/backup
  sync-openclaw sync -s /path/to/backup --mode full
  sync-openclaw sync -s /path/to/backup --dry-run
  sync-openclaw compare -s /path/to/source -t ~/.openclaw

查看完整帮助:
  sync-openclaw sync --help
  `.trim());
}

function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'sync';
  
  // 处理帮助选项
  if (command === 'help' || command === '-h' || command === '--help') {
    showHelp();
    return;
  }
  
  // 如果没有命令，显示帮助
  if (!COMMANDS[command]) {
    showHelp();
    return;
  }
  
  const scriptPath = COMMANDS[command];
  
  if (!scriptPath) {
    console.error(`未知命令: ${command}`);
    showHelp();
    process.exit(1);
  }
  
  // 启动子进程
  const child = spawn('node', [scriptPath, ...args.slice(1)], {
    stdio: 'inherit',
    cwd: SKILL_DIR
  });
  
  child.on('exit', (code) => {
    process.exit(code);
  });
}

main();
