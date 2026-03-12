#!/usr/bin/env node

/**
 * sync-openclaw - 同步计划生成脚本
 * 
 * 基于对比结果生成可执行的同步计划
 * 支持多种策略配置
 */

const fs = require('fs');
const path = require('path');

// 默认策略配置 - 保守策略，与 sync.js 保持一致
const DEFAULT_STRATEGIES = {
  config: 'merge',        // 配置用 merge，更安全
  channels: 'skip',      // 通道配置可能包含 secrets，默认跳过
  plugins: 'merge',      // 插件配置用 merge
  memory: 'append',      // 记忆用追加模式
  cron: 'merge',         // cron 用 merge
  skills: 'skip',        // 技能默认跳过（太大太杂）
  mcp: 'merge',          // MCP 配置用 merge
  agents: 'skip',       // 代理配置默认跳过（可能包含本地定制）
  scripts: 'skip',       // 脚本默认跳过（可能包含本地路径）
  tools: 'skip',         // 工具默认跳过
  workspaceConfig: 'merge', // 工作区配置用 merge
  workflows: 'skip',     // 工作流默认跳过
  taskToolMap: 'merge',  // 任务工具映射用 merge
  obsidian: 'skip'       // Obsidian 联动默认跳过
};

// 模块优先级
const PRIORITIES = {
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
  taskToolMap: 2,
  obsidian: 3
};

// 彩色输出
const colors = {
  reset: '\x1b[0m',
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
function warn(msg) { log(colors.yellow, msg); }
function success(msg) { log(colors.green, msg); }
function error(msg) { log(colors.red, msg); }

// 从对比结果生成同步计划
function generatePlan(comparison, options = {}) {
  const {
    mode = 'selective',     // preview, selective, full, minimal
    strategies = DEFAULT_STRATEGIES,
    customModules = null    // 自定义模块配置
  } = options;
  
  const plan = {
    timestamp: new Date().toISOString(),
    sourcePath: comparison.sourcePath,
    targetPath: comparison.targetPath,
    mode,
    dryRun: options.dryRun || false,
    items: [],
    conflicts: [],
    warnings: []
  };
  
  // 按模块组织差异
  const moduleMap = organizeByModule(comparison);
  
  // 处理每个模块
  for (const [modId, modItems] of Object.entries(moduleMap)) {
    if (modItems.length === 0) continue;
    
    // 获取该模块的策略
    const strategy = strategies[modId] || 'skip';
    
    // 计算模块级别的差异
    const newItems = modItems.filter(i => i.status === 'new_in_source');
    const missingItems = modItems.filter(i => i.status === 'missing_in_source');
    const differentItems = modItems.filter(i => i.status === 'different');
    
    // 跳过完全相同的模块
    if (newItems.length === 0 && missingItems.length === 0 && differentItems.length === 0) {
      continue;
    }
    
    // 判断是否包含
    let include = false;
    let reason = '';
    
    switch (mode) {
      case 'full':
        // 包含所有有差异的
        include = true;
        reason = '完整同步模式';
        break;
        
      case 'minimal':
        // 只包含 P0-P1
        include = PRIORITIES[modId] <= 1;
        reason = include ? '最小同步模式 (P0-P1)' : '超出最小同步范围';
        break;
        
      case 'selective':
        // 用户稍后选择
        include = true;
        reason = '选择性同步模式';
        break;
        
      case 'preview':
        // 预览模式，包含所有
        include = true;
        reason = '预览模式';
        break;
    }
    
    // 检测冲突（目标有更新的文件）
    const conflicts = modItems.filter(i => i.status === 'different' && 
      i.target && i.source && i.target.mtime > i.source.mtime);
    
    if (conflicts.length > 0) {
      plan.warnings.push({
        module: modId,
        message: `${modId} 模块有 ${conflicts.length} 个文件目标比源更新`,
        conflicts: conflicts.map(c => c.relativePath)
      });
      
      // 默认策略对冲突的处理
      if (strategy === 'replace' && conflicts.length > 0) {
        plan.warnings.push({
          module: modId,
          message: `⚠️  ${modId} 使用 replace 策略，将覆盖目标更新的文件`
        });
      }
    }
    
    // 添加模块到计划
    const planItem = {
      module: modId,
      priority: PRIORITIES[modId] || 99,
      strategy,
      include,
      reason,
      diff: {
        new: newItems.length,
        missing: missingItems.length,
        different: differentItems.length
      },
      files: modItems.map(i => ({
        path: i.relativePath,
        status: i.status,
        sourceSize: i.source?.size,
        targetSize: i.target?.size,
        sourceMtime: i.source?.mtime,
        targetMtime: i.target?.mtime
      }))
    };
    
    plan.items.push(planItem);
  }
  
  // 按优先级排序
  plan.items.sort((a, b) => a.priority - b.priority);
  
  // 统计
  plan.summary = {
    totalModules: plan.items.length,
    includedModules: plan.items.filter(i => i.include).length,
    totalFiles: plan.items.reduce((sum, i) => sum + i.files.length, 0),
    conflicts: plan.conflicts.length,
    warnings: plan.warnings.length
  };
  
  return plan;
}

// 按模块组织对比结果
function organizeByModule(comparison) {
  const modules = {};
  
  const modulePatterns = {
    config: ['openclaw.json', 'mcporter.json'],
    channels: ['channels'],
    plugins: ['plugins'],
    memory: ['MEMORY.md', 'memory/', '.learnings', 'memory.db'],
    cron: ['cron/'],
    skills: ['skills/'],
    mcp: ['MCP/', 'extensions/'],
    agents: ['agents/'],
    scripts: ['workspace/scripts'],
    tools: ['workspace/tools'],
    workspaceConfig: ['workspace/config'],
    workflows: ['workspace/workflows'],
    taskToolMap: ['task-tool-map.json']
  };
  
  for (const item of comparison.items) {
    let assigned = false;
    
    for (const [modId, patterns] of Object.entries(modulePatterns)) {
      if (patterns.some(p => item.relativePath.startsWith(p))) {
        if (!modules[modId]) modules[modId] = [];
        modules[modId].push(item);
        assigned = true;
        break;
      }
    }
    
    if (!assigned) {
      if (!modules.obsidian) modules.obsidian = [];
      modules.obsidian.push(item);
    }
  }
  
  return modules;
}

// 显示计划
function displayPlan(plan) {
  console.log('\n' + '='.repeat(60));
  info('📋 同步计划');
  console.log('='.repeat(60));
  
  console.log(`\n模式: ${plan.mode}`);
  console.log(`源: ${plan.sourcePath}`);
  console.log(`目标: ${plan.targetPath}`);
  
  console.log(`\n统计:`);
  console.log(`  - 模块总数: ${plan.summary.totalModules}`);
  console.log(`  - 包含模块: ${plan.summary.includedModules}`);
  console.log(`  - 文件总数: ${plan.summary.totalFiles}`);
  
  if (plan.summary.conflicts > 0) {
    console.log(`  - ⚠️  冲突: ${plan.summary.conflicts}`);
  }
  if (plan.summary.warnings > 0) {
    console.log(`  - ⚡ 警告: ${plan.summary.warnings}`);
  }
  
  console.log('\n' + '-'.repeat(60));
  
  for (const item of plan.items) {
    if (!item.include) {
      console.log(`\n  ⏭️  ${item.module.toUpperCase()} (已跳过)`);
      continue;
    }
    
    const diffInfo = `🆕${item.diff.new} 📝${item.diff.different} 📤${item.diff.missing}`;
    const strategyIcon = {
      'replace': '🔄',
      'merge': '🔀',
      'append': '➕',
      'skip': '⏭️'
    }[item.strategy] || '➖';
    
    console.log(`\n  ${strategyIcon} ${item.module.toUpperCase()} (${item.strategy})`);
    console.log(`     差异: ${diffInfo}`);
    
    // 显示部分文件
    if (item.files.length > 0) {
      const diffFiles = item.files.filter(f => f.status !== 'same').slice(0, 3);
      for (const f of diffFiles) {
        const icon = {
          'new_in_source': '🆕',
          'missing_in_source': '📤',
          'different': '📝'
        }[f.status] || '➖';
        console.log(`       ${icon} ${f.path}`);
      }
      if (item.files.length > 3) {
        console.log(`       ... 还有 ${item.files.length - 3} 个文件`);
      }
    }
  }
  
  console.log('\n' + '='.repeat(60));
}

// 保存计划到文件
function savePlan(plan, outputPath) {
  fs.writeFileSync(outputPath, JSON.stringify(plan, null, 2));
  info(`计划已保存: ${outputPath}`);
}

// 加载计划
function loadPlan(inputPath) {
  if (!fs.existsSync(inputPath)) {
    error(`计划文件不存在: ${inputPath}`);
    return null;
  }
  
  try {
    return JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  } catch (e) {
    error(`无法解析计划文件: ${e.message}`);
    return null;
  }
}

// 更新计划项
function updatePlanItem(plan, moduleId, updates) {
  const item = plan.items.find(i => i.module === moduleId);
  if (item) {
    Object.assign(item, updates);
  }
  return plan;
}

// 选择性更新
function selectItems(plan, moduleIds) {
  // 先全部取消选择
  for (const item of plan.items) {
    item.include = false;
  }
  
  // 选择指定的模块
  for (const modId of moduleIds) {
    const item = plan.items.find(i => i.module === modId);
    if (item) {
      item.include = true;
    }
  }
  
  // 更新统计
  plan.summary.includedModules = plan.items.filter(i => i.include).length;
  
  return plan;
}

// 交互式选择
async function interactiveSelect(plan) {
  console.log('\n' + '='.repeat(60));
  info('🎯 交互式选择同步模块');
  console.log('='.repeat(60));
  
  console.log('\n可用模块:');
  for (let i = 0; i < plan.items.length; i++) {
    const item = plan.items[i];
    const diffInfo = `🆕${item.diff.new} 📝${item.diff.different}`;
    console.log(`  ${i + 1}. ${item.module} (${item.strategy}) - ${diffInfo}`);
  }
  
  console.log('\n输入要同步的模块编号（逗号分隔），或 "all" 全部: ');
  // 这里简化处理，实际应该读取 stdin
  
  return plan;
}

// 主函数
function main() {
  const args = process.argv.slice(2);
  
  let comparisonPath = '';
  let outputPath = '';
  let mode = 'selective';
  let dryRun = false;
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const next = args[i + 1];
    
    switch (arg) {
      case '-i':
      case '--input':
        comparisonPath = next;
        i++;
        break;
      case '-o':
      case '--output':
        outputPath = next;
        i++;
        break;
      case '-m':
      case '--mode':
        mode = next;
        i++;
        break;
      case '-n':
      case '--dry-run':
        dryRun = true;
        break;
      case '-h':
      case '--help':
        console.log(`
plan-openclaw - 生成同步计划

用法: plan.js -i <对比结果.json> [-o <计划输出.json>] [-m <模式>]

选项:
  -i, --input <路径>   对比结果 JSON 文件
  -o, --output <路径>  计划输出路径
  -m, --mode <模式>    模式: preview, selective, full, minimal
  -n, --dry-run        预览模式
  -h, --help           显示帮助
        `.trim());
        process.exit(0);
    }
  }
  
  if (!comparisonPath) {
    error('请指定对比结果文件 (-i)');
    process.exit(1);
  }
  
  // 加载对比结果
  let comparison;
  try {
    comparison = JSON.parse(fs.readFileSync(comparisonPath, 'utf8'));
  } catch (e) {
    error(`无法加载对比结果: ${e.message}`);
    process.exit(1);
  }
  
  // 生成计划
  const plan = generatePlan(comparison, { mode, dryRun });
  
  // 显示计划
  displayPlan(plan);
  
  // 保存计划
  if (outputPath) {
    savePlan(plan, outputPath);
  }
  
  return plan;
}

// 导出
module.exports = {
  generatePlan,
  displayPlan,
  savePlan,
  loadPlan,
  updatePlanItem,
  selectItems,
  DEFAULT_STRATEGIES,
  PRIORITIES,
  main
};

if (require.main === module) {
  main();
}
