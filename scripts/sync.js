#!/usr/bin/env node

/**
 * sync-openclaw - 主同步脚本 (v1.2)
 * 
 * 改进:
 * - 完整的交互式选择
 * - --resume 中断恢复支持
 * - 更详细的进度显示
 * - 修复硬编码路径和报告时间戳
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

// 配置路径
const SKILL_DIR = path.dirname(__dirname);
const SCRIPTS_DIR = path.join(SKILL_DIR, 'scripts');

// 检查 HOME 环境变量
if (!process.env.HOME) {
  console.error('❌ 错误：HOME 环境变量未设置');
  console.error('请设置 HOME 环境变量后再运行 sync-openclaw');
  console.error('示例: export HOME=/Users/yourname');
  process.exit(1);
}

const STATE_FILE = path.join(process.env.HOME, '.openclaw', '.sync-state.json');

// 彩色输出
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m'
};

function log(color, msg) {
  console.log(`${color}${msg}${colors.reset}`);
}

function info(msg) { log(colors.blue, msg); }
function success(msg) { log(colors.green, `✅ ${msg}`); }
function warn(msg) { log(colors.yellow, `⚠️  ${msg}`); }
function error(msg) { log(colors.red, `❌ ${msg}`); }
function step(msg) { log(colors.cyan, `🔄 ${msg}`); }

// 创建 readline 接口
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// 异步输入
function prompt(question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer.trim());
    });
  });
}

// 默认配置 - 保守策略
const DEFAULT_CONFIG = {
  sourcePath: '',
  targetPath: process.env.HOME,
  openclawDir: '.openclaw',
  mode: 'preview',  // 默认预览模式，更安全
  dryRun: false,
  force: false,
  resume: false,
  // 保守的默认策略 - 避免直接覆盖
  strategies: {
    config: 'merge',       // 配置用 merge，更安全
    channels: 'skip',     // 通道配置可能包含 secrets，默认跳过
    plugins: 'merge',      // 插件配置用 merge
    memory: 'append',     // 记忆用追加模式
    cron: 'merge',         // cron 用 merge
    skills: 'skip',       // 技能默认跳过（太大太杂）
    mcp: 'merge',         // MCP 配置用 merge
    agents: 'skip',       // 代理配置默认跳过（可能包含本地定制）
    scripts: 'skip',      // 脚本默认跳过（可能包含本地路径）
    tools: 'skip',        // 工具默认跳过
    workspaceConfig: 'merge', // 工作区配置用 merge
    workflows: 'skip',    // 工作流默认跳过
    obsidian: 'skip'      // Obsidian 联动默认跳过
  }
};

const PRIORITY = {
  config: 0,
  channels: 0,
  plugins: 0,
  memory: 1,
  cron: 1,
  skills: 2,
  mcp: 2,
  agents: 2,
  scripts: 2,
  tools: 2,
  workspaceConfig: 2,
  workflows: 2,
  obsidian: 3
};

// 解析命令行参数
function parseArgs() {
  const args = process.argv.slice(2);
  const config = { ...DEFAULT_CONFIG };
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const next = args[i + 1];
    
    switch (arg) {
      case '--source':
      case '-s':
        config.sourcePath = next;
        i++;
        break;
      case '--target':
      case '-t':
        config.targetPath = next;
        i++;
        break;
      case '--mode':
      case '-m':
        if (['preview', 'selective', 'full', 'minimal'].includes(next)) {
          config.mode = next;
        }
        i++;
        break;
      case '--dry-run':
      case '-n':
        config.dryRun = true;
        break;
      case '--force':
      case '-f':
        config.force = true;
        break;
      case '--resume':
        config.resume = true;
        break;
      case '--config':
      case '-c':
        if (fs.existsSync(next)) {
          const userConfig = JSON.parse(fs.readFileSync(next, 'utf8'));
          Object.assign(config, userConfig);
        }
        i++;
        break;
      case '--help':
      case '-h':
        showHelp();
        process.exit(0);
    }
  }
  
  // 确保路径正确 - 用户传入的可能已经是 .openclaw 目录
  if (config.sourcePath) {
    // 如果已经是 .openclaw 结尾，直接使用；否则添加 .openclaw
    if (config.sourcePath.endsWith('/.openclaw') || config.sourcePath.endsWith('\\.openclaw')) {
      config.sourceOpenclaw = config.sourcePath;
    } else {
      config.sourceOpenclaw = path.join(config.sourcePath, config.openclawDir);
    }
  }
  
  if (config.targetPath) {
    if (config.targetPath.endsWith('/.openclaw') || config.targetPath.endsWith('\\.openclaw')) {
      config.targetOpenclaw = config.targetPath;
    } else {
      config.targetOpenclaw = path.join(config.targetPath, config.openclawDir);
    }
  }
  
  return config;
}

function showHelp() {
  console.log(`
sync-openclaw - OpenClaw 增量同步向导

用法: sync-openclaw [选项]

选项:
  -s, --source <路径>     源 OpenClaw 路径（必填）
  -t, --target <路径>     目标 OpenClaw 路径（默认: ~/.openclaw）
  -m, --mode <模式>       同步模式: preview, selective, full, minimal
  -n, --dry-run           预览模式，不执行
  -f, --force             跳过确认
  --resume                从中断状态恢复
  -c, --config <文件>     指定配置文件
  -h, --help              显示帮助
  `.trim());
}

// 加载/保存状态
function loadState() {
  if (fs.existsSync(STATE_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    } catch (e) {
      return null;
    }
  }
  return null;
}

function saveState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  info(`状态已保存: ${STATE_FILE}`);
}

function clearState() {
  if (fs.existsSync(STATE_FILE)) {
    fs.unlinkSync(STATE_FILE);
    info('状态已清除');
  }
}

// 检查路径
function checkPaths(config) {
  if (!config.sourceOpenclaw) {
    error('请指定源 OpenClaw 路径 (--source)');
    process.exit(1);
  }
  
  if (!fs.existsSync(config.sourceOpenclaw)) {
    error(`源路径不存在: ${config.sourceOpenclaw}`);
    process.exit(1);
  }
  
  if (!fs.existsSync(config.targetOpenclaw)) {
    error(`目标路径不存在: ${config.targetOpenclaw}`);
    process.exit(1);
  }
  
  success(`源路径: ${config.sourceOpenclaw}`);
  success(`目标路径: ${config.targetOpenclaw}`);
}

// 扫描模块
function scanModules(config) {
  step('扫描模块差异...');
  
  const modules = [
    { id: 'config', name: '核心配置', files: ['openclaw.json', 'config/mcporter.json'], priority: 0 },
    { id: 'channels', name: '通道配置', files: ['channels'], priority: 0 },
    { id: 'plugins', name: '插件配置', files: ['plugins'], priority: 0 },
    { id: 'memory', name: '记忆系统', files: ['workspace/MEMORY.md', 'workspace/memory'], priority: 1 },
    { id: 'cron', name: '定时任务', files: ['cron/jobs.json', 'cron'], priority: 1 },
    { id: 'skills', name: '技能', files: ['skills'], priority: 2 },
    { id: 'mcp', name: 'MCP', files: ['MCP', 'extensions'], priority: 2 },
    { id: 'agents', name: '多代理', files: ['agents', 'workspace/docs/multi-agent-framework.md'], priority: 2 },
    { id: 'scripts', name: '脚本', files: ['workspace/scripts'], priority: 2 },
    { id: 'tools', name: '工具', files: ['workspace/tools'], priority: 2 },
    { id: 'workspaceConfig', name: '工作区配置', files: ['workspace/config'], priority: 2 },
    { id: 'workflows', name: '工作流', files: ['workspace/workflows'], priority: 2 },
    { id: 'obsidian', name: 'Obsidian 联动', files: ['workspace/vaults', 'workspace/docs'], priority: 3 }
  ];
  
  // 使用正确的根路径（不包含 .openclaw 后缀）
  const sourceRoot = config.sourcePath || path.dirname(config.sourceOpenclaw);
  const targetRoot = config.targetPath || path.dirname(config.targetOpenclaw);
  
  for (const mod of modules) {
    mod.existsSource = false;
    mod.existsTarget = false;
    mod.diff = 'none';
    mod.strategy = config.strategies[mod.id] || 'skip';
    
    for (const file of mod.files) {
      const sourcePath = path.join(sourceRoot, file);
      const targetPath = path.join(targetRoot, file);
      
      if (fs.existsSync(sourcePath)) mod.existsSource = true;
      if (fs.existsSync(targetPath)) mod.existsTarget = true;
    }
    
    if (mod.existsSource && !mod.existsTarget) {
      mod.diff = 'new';
    } else if (!mod.existsSource && mod.existsTarget) {
      mod.diff = 'missing';
    } else if (mod.existsSource && mod.existsTarget) {
      const sourceMod = getLatestModTime(sourceRoot, mod.files);
      const targetMod = getLatestModTime(targetRoot, mod.files);
      
      if (sourceMod > targetMod + 1000) {
        mod.diff = 'updated';
      } else if (targetMod > sourceMod + 1000) {
        mod.diff = 'older';
      } else {
        mod.diff = 'same';
      }
    }
  }
  
  return modules;
}

function getLatestModTime(basePath, files) {
  let latest = 0;
  for (const file of files) {
    const filePath = path.join(basePath, file);
    if (fs.existsSync(filePath)) {
      const stat = fs.statSync(filePath);
      if (stat.mtimeMs > latest) latest = stat.mtimeMs;
      
      if (stat.isDirectory()) {
        try {
          const items = fs.readdirSync(filePath);
          for (const item of items) {
            const itemPath = path.join(filePath, item);
            const itemStat = fs.statSync(itemPath);
            if (itemStat.mtimeMs > latest) latest = itemStat.mtimeMs;
          }
        } catch (e) {}
      }
    }
  }
  return latest;
}

// 生成同步计划
function generateSyncPlan(modules, config) {
  const plan = {
    timestamp: new Date().toISOString(),
    source: config.sourceOpenclaw,
    target: config.targetOpenclaw,
    mode: config.mode,
    dryRun: config.dryRun,
    items: []
  };
  
  for (const mod of modules) {
    let include = false;
    
    switch (config.mode) {
      case 'full':
        include = mod.diff !== 'same' && mod.diff !== 'missing';
        break;
      case 'minimal':
        include = mod.priority <= 1 && mod.diff !== 'same' && mod.diff !== 'missing';
        break;
      case 'selective':
        include = true;
        break;
      case 'preview':
        include = mod.diff !== 'same';
        break;
    }
    
    if (include) {
      plan.items.push({
        module: mod.id,
        name: mod.name,
        diff: mod.diff,
        strategy: mod.strategy,
        priority: mod.priority,
        include: config.mode !== 'selective'
      });
    }
  }
  
  plan.items.sort((a, b) => a.priority - b.priority);
  return plan;
}

// 显示同步计划
function displaySyncPlan(plan, modules) {
  console.log('\n' + '='.repeat(60));
  info('📋 同步计划预览');
  console.log('='.repeat(60));
  
  console.log(`\n源: ${plan.source}`);
  console.log(`目标: ${plan.target}`);
  console.log(`模式: ${plan.mode}`);
  console.log(`预览模式: ${plan.dryRun ? '是' : '否'}`);
  
  // 源端内容分析
  console.log('\n📊 源端内容分析:');
  console.log('-'.repeat(60));
  
  const sourceModules = modules.filter(m => m.existsSource);
  const targetOnlyModules = modules.filter(m => m.existsTarget && !m.existsSource);
  const bothHaveModules = modules.filter(m => m.existsSource && m.existsTarget);
  
  if (sourceModules.length > 0) {
    console.log('\n  源端存在的模块 (可同步):');
    for (const mod of sourceModules) {
      const icon = {
        'new': '🆕',
        'updated': '📝',
        'older': '📥',
        'same': '✅'
      }[mod.diff] || '➖';
      console.log(`    ${icon} ${mod.name} (${mod.diff || '存在'})`);
    }
  }
  
  if (targetOnlyModules.length > 0) {
    console.log('\n  仅目标端存在的模块:');
    for (const mod of targetOnlyModules) {
      console.log(`    📤 ${mod.name} (目标有，源无)`);
    }
  }
  
  // 本地定制提醒
  const localCustomModules = ['agents', 'scripts', 'tools', 'obsidian', 'workflows'];
  const localCustom = modules.filter(m => localCustomModules.includes(m.id) && m.existsSource);
  if (localCustom.length > 0) {
    console.log('\n  ⚠️  本地定制模块 (建议跳过或手动处理):');
    for (const mod of localCustom) {
      console.log(`    🔶 ${mod.name} - 可能包含机器特定配置`);
    }
  }
  
  console.log('\n同步项:');
  console.log('-'.repeat(60));
  
  const included = plan.items.filter(i => i.include);
  const excluded = plan.items.filter(i => !i.include);
  
  if (included.length === 0) {
    warn('没有需要同步的项目');
  } else {
    for (const item of included) {
      const diffIcon = {
        'new': '🆕',
        'updated': '📝',
        'missing': '📤',
        'older': '📥'
      }[item.diff] || '➖';
      
      // 标记保守策略
      const safeIcon = ['skip', 'merge'].includes(item.strategy) ? '🛡️' : '⚡';
      console.log(`  ${diffIcon} ${item.name} (${item.diff}) - ${safeIcon} 策略: ${item.strategy}`);
    }
  }
  
  if (excluded.length > 0 && plan.mode === 'selective') {
    console.log('\n未选择的项目:');
    for (const item of excluded) {
      console.log(`  ⏭️  ${item.name} (${item.diff})`);
    }
  }
  
  console.log('-'.repeat(60));
}

// 交互式选择（改进版）
async function interactiveSelect(plan) {
  console.log('\n' + '='.repeat(60));
  info('🎯 交互式选择同步模块');
  console.log('='.repeat(60));
  
  // 显示所有模块
  console.log('\n可用模块:');
  for (let i = 0; i < plan.items.length; i++) {
    const item = plan.items[i];
    const diffIcon = {
      'new': '🆕',
      'updated': '📝',
      'missing': '📤',
      'older': '📥'
    }[item.diff] || '➖';
    
    const current = item.include ? '✓' : ' ';
    console.log(`  ${current} ${i + 1}. ${diffIcon} ${item.name} (${item.diff}) - 策略: ${item.strategy}`);
  }
  
  console.log('\n操作说明:');
  console.log('  - 输入编号选择/取消选择 (如: 1,3,5)');
  console.log('  - 输入 "all" 选择全部');
  console.log('  - 输入 "none" 取消全部');
  console.log('  - 输入策略编号更改策略 (1=replace, 2=merge, 3=append, 4=skip)');
  console.log('  - 输入 "done" 完成选择');
  
  let done = false;
  while (!done) {
    const input = await prompt('\n请选择: ');
    
    if (input === 'done' || input === 'd') {
      done = true;
    } else if (input === 'all' || input === 'a') {
      for (const item of plan.items) {
        item.include = true;
      }
      console.log('  ✓ 已选择全部模块');
    } else if (input === 'none' || input === 'n') {
      for (const item of plan.items) {
        item.include = false;
      }
      console.log('  ✓ 已取消全部选择');
    } else if (/^\d+$/.test(input)) {
      // 单个编号
      const idx = parseInt(input) - 1;
      if (idx >= 0 && idx < plan.items.length) {
        plan.items[idx].include = !plan.items[idx].include;
        const icon = plan.items[idx].include ? '✓' : ' ';
        console.log(`  ${icon} ${plan.items[idx].name} - ${plan.items[idx].include ? '已选择' : '已取消'}`);
      }
    } else if (/^[\d,]+$/.test(input)) {
      // 多个编号
      const indices = input.split(',').map(s => parseInt(s.trim()) - 1);
      for (const idx of indices) {
        if (idx >= 0 && idx < plan.items.length) {
          plan.items[idx].include = true;
        }
      }
      console.log(`  ✓ 已选择编号: ${input}`);
    } else if (/^s(\d+)\s*=\s*(\d+)$/.test(input)) {
      // 策略更改 s1=2 表示模块1使用策略2
      const match = input.match(/^s(\d+)\s*=\s*(\d+)$/);
      if (match) {
        const idx = parseInt(match[1]) - 1;
        const strat = parseInt(match[2]);
        const strategies = ['replace', 'merge', 'append', 'skip'];
        if (idx >= 0 && idx < plan.items.length && strat >= 1 && strat <= 4) {
          plan.items[idx].strategy = strategies[strat - 1];
          console.log(`  ✓ ${plan.items[idx].name} 策略改为: ${plan.items[idx].strategy}`);
        }
      }
    }
    
    // 显示当前选择状态
    console.log('\n当前选择:');
    for (let i = 0; i < plan.items.length; i++) {
      const item = plan.items[i];
      if (item.include) {
        console.log(`  ✓ ${item.name} (${item.strategy})`);
      }
    }
  }
  
  return plan;
}

// 交互式策略选择
async function selectStrategies(plan) {
  console.log('\n' + '='.repeat(60));
  info('⚙️  策略配置');
  console.log('='.repeat(60));
  
  console.log('\n策略说明:');
  console.log('  1. replace - 直接替换目标文件');
  console.log('  2. merge   - 智能合并（JSON）');
  console.log('  3. append  - 追加到目标');
  console.log('  4. skip    - 跳过不同步');
  
  const included = plan.items.filter(i => i.include);
  
  for (const item of included) {
    const input = await prompt(`\n${item.name} [${item.strategy}] (1-4): `);
    if (input && '1234'.includes(input)) {
      const strategies = ['replace', 'merge', 'append', 'skip'];
      item.strategy = strategies[parseInt(input) - 1];
    }
  }
  
  return plan;
}

// 执行同步
function executeSync(plan, config) {
  if (plan.dryRun) {
    warn('⚠️  预览模式 - 不会实际执行同步');
    return { success: true, dryRun: true };
  }
  
  step('开始执行同步...');
  
  const results = {
    timestamp: new Date().toISOString(),
    items: [],
    errors: [],
    warnings: []
  };
  
  const sourceRoot = path.dirname(plan.source);
  const targetRoot = path.dirname(plan.target);
  
  for (const item of plan.items) {
    if (!item.include) continue;
    
    const itemResult = {
      module: item.module,
      name: item.name,
      status: 'pending'
    };
    
    try {
      const sourcePath = path.join(sourceRoot, getModulePath(item.module));
      const targetPath = path.join(targetRoot, getModulePath(item.module));
      
      switch (item.strategy) {
        case 'replace':
          if (fs.existsSync(sourcePath)) {
            copyRecursive(sourcePath, targetPath, true);
            itemResult.status = 'replaced';
          }
          break;
          
        case 'merge':
          if (fs.existsSync(sourcePath) && fs.existsSync(targetPath)) {
            try {
              const sourceData = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
              const targetData = JSON.parse(fs.readFileSync(targetPath, 'utf8'));
              const merged = { ...targetData, ...sourceData };
              fs.writeFileSync(targetPath, JSON.stringify(merged, null, 2));
              itemResult.status = 'merged';
            } catch (e) {
              // JSON 解析失败，使用替换
              copyRecursive(sourcePath, targetPath, true);
              itemResult.status = 'replaced';
            }
          } else if (fs.existsSync(sourcePath)) {
            copyRecursive(sourcePath, targetPath, true);
            itemResult.status = 'copied';
          }
          break;
          
        case 'append':
          if (fs.existsSync(sourcePath) && fs.existsSync(targetPath)) {
            const sourceContent = fs.readFileSync(sourcePath, 'utf8');
            fs.appendFileSync(targetPath, '\n--- Sync Appended ---\n' + sourceContent);
            itemResult.status = 'appended';
          } else if (fs.existsSync(sourcePath)) {
            copyRecursive(sourcePath, targetPath, false);
            itemResult.status = 'copied';
          }
          break;
          
        case 'skip':
          itemResult.status = 'skipped';
          results.warnings.push(`跳过: ${item.name}`);
          break;
      }
      
      success(`✓ ${item.name}: ${itemResult.status}`);
      results.items.push(itemResult);
      
    } catch (err) {
      error(`✗ ${item.name}: ${err.message}`);
      results.errors.push({ module: item.module, error: err.message });
      itemResult.status = 'error';
      itemResult.error = err.message;
      results.items.push(itemResult);
    }
  }
  
  results.success = results.errors.length === 0;
  return results;
}

function getModulePath(moduleId) {
  const paths = {
    config: 'openclaw.json',
    channels: 'channels',
    plugins: 'plugins',
    memory: 'MEMORY.md',
    cron: 'cron',
    skills: 'skills',
    mcp: 'MCP',
    agents: 'agents',
    scripts: 'workspace/scripts',
    tools: 'workspace/tools',
    workspaceConfig: 'workspace/config',
    workflows: 'workspace/workflows',
    obsidian: 'workspace/docs'
  };
  return paths[moduleId] || moduleId;
}

function copyRecursive(src, dest, overwrite) {
  if (!fs.existsSync(src)) return;
  
  const stat = fs.statSync(src);
  
  if (stat.isDirectory()) {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
    
    const items = fs.readdirSync(src);
    for (const item of items) {
      copyRecursive(path.join(src, item), path.join(dest, item), overwrite);
    }
  } else {
    if (overwrite || !fs.existsSync(dest)) {
      const destDir = path.dirname(dest);
      if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
      }
      fs.copyFileSync(src, dest);
    }
  }
}

// 生成报告
function generateReport(plan, results) {
  // 生成带时间戳的报告文件名
  const now = new Date();
  const timestamp = now.toISOString().replace(/[-:]/g, '').replace('T', '-').substring(0, 15);
  const reportFileName = `SYNC-REPORT-${timestamp}.md`;
  const reportPath = path.join(process.env.HOME, '.openclaw', reportFileName);
  
  let report = `# OpenClaw 同步报告

生成时间: ${results.timestamp || new Date().toISOString()}

## 同步概览

- **源**: ${plan.source}
- **目标**: ${plan.target}
- **模式**: ${plan.mode}
- **预览模式**: ${plan.dryRun ? '是' : '否'}

## 同步结果

`;
  
  if (results.dryRun) {
    report += '> ⚠️  预览模式 - 未执行实际同步\n\n';
  }
  
  // 安全地处理 items 数组
  const items = results.items || [];
  if (items.length === 0) {
    report += '没有需要同步的项目。\n';
  } else {
    report += '| 模块 | 状态 | 策略 |\n|------|------|------|\n';
    for (const item of items) {
      const statusIcon = {
        'replaced': '✅',
        'merged': '🔄',
        'appended': '➕',
        'copied': '📋',
        'skipped': '⏭️',
        'error': '❌',
        'pending': '⏳'
      }[item.status] || '➖';
      
      report += `| ${item.name} | ${statusIcon} ${item.status} | - |\n`;
    }
  }
  
  const errors = results.errors || [];
  if (errors.length > 0) {
    report += '\n## 错误\n\n';
    for (const err of errors) {
      report += `- ${err.module}: ${err.error}\n`;
    }
  }
  
  const warnings = results.warnings || [];
  if (warnings.length > 0) {
    report += '\n## 警告\n\n';
    for (const warn of warnings) {
      report += `- ${warn}\n`;
    }
  }
  
  report += '\n## 下一步\n\n';
  if (!plan.dryRun && results.success) {
    report += '1. 运行 `openclaw gateway restart` 重启 Gateway\n';
    report += '2. 检查同步的配置文件是否正确\n';
    report += '3. 验证各模块功能正常\n';
  } else if (plan.dryRun) {
    report += '1. 确认同步计划无误\n';
    report += '2. 去掉 --dry-run 参数重新执行\n';
  }
  
  fs.writeFileSync(reportPath, report);
  success(`报告已生成: ${reportPath}`);
  
  return reportPath;
}

// 主函数
async function main() {
  console.log('\n' + '='.repeat(60));
  log(colors.bright, '🔄 sync-openclaw - OpenClaw 增量同步向导 v1.1');
  console.log('='.repeat(60));
  
  // 解析参数
  const config = parseArgs();
  
  // 检查是否有保存的状态（恢复模式）
  if (config.resume) {
    const savedState = loadState();
    if (savedState) {
      info('发现保存的同步状态');
      const resume = await prompt('是否恢复? (y/n): ');
      if (resume.toLowerCase() === 'y') {
        // 恢复状态继续执行
        config.sourceOpenclaw = savedState.sourceOpenclaw;
        config.targetOpenclaw = savedState.targetOpenclaw;
        // 继续执行...
      }
    }
  }
  
  // 检查路径
  checkPaths(config);
  
  // 保存初始状态
  const state = {
    sourceOpenclaw: config.sourceOpenclaw,
    targetOpenclaw: config.targetOpenclaw,
    startTime: new Date().toISOString(),
    mode: config.mode,
    dryRun: config.dryRun
  };
  saveState(state);
  
  // 扫描模块
  const modules = scanModules(config);
  
  // 生成计划
  const plan = generateSyncPlan(modules, config);
  
  // 显示计划（包含模块分析）
  displaySyncPlan(plan, modules);
  
  // 交互式选择（仅在 selective 模式）
  if (config.mode === 'selective') {
    await interactiveSelect(plan);
    await selectStrategies(plan);
    // 再次显示计划
    displaySyncPlan(plan, modules);
  }
  
  // 确认执行
  if (!config.dryRun && !config.force) {
    const confirm = await prompt('\n输入 "SYNC" 确认执行同步: ');
    if (confirm !== 'SYNC') {
      console.log('已取消同步');
      clearState();
      rl.close();
      return;
    }
  }
  
  // 执行同步
  const results = executeSync(plan, config);
  
  // 生成报告
  const reportPath = generateReport(plan, results);
  
  // 清除状态
  clearState();
  
  // 完成
  console.log('\n' + '='.repeat(60));
  if (results.success) {
    success('同步完成！');
  } else {
    warn('同步完成，但有错误');
  }
  console.log('='.repeat(60));
  
  rl.close();
  return { config, plan, results, reportPath };
}

// 导出
module.exports = { main, parseArgs, scanModules, generateSyncPlan, executeSync };

// 运行
if (require.main === module) {
  main().catch(err => {
    error(err.message);
    process.exit(1);
  });
}
