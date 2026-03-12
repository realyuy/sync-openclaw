#!/usr/bin/env node

/**
 * sync-openclaw - 对比脚本
 * 
 * 负责对比源 OpenClaw 和目标 OpenClaw 的差异
 * 生成详细的差异报告
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// 配置
const DEFAULT_SCAN_DEPTH = 25;
const IGNORE_PATTERNS = [
  'node_modules',
  '.git',
  '.DS_Store',
  '*.log',
  '*.tmp',
  '*.bak',
  '.openclaw/logs',
  '.openclaw/.state'
];

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
function error(msg) { log(colors.red, msg); }

// 文件哈希（用于精确对比）
function fileHash(filePath) {
  try {
    const content = fs.readFileSync(filePath);
    return crypto.createHash('md5').update(content).digest('hex');
  } catch (e) {
    return null;
  }
}

// 递归扫描目录
function scanDir(dirPath, depth = 0, maxDepth = DEFAULT_SCAN_DEPTH) {
  const results = [];
  
  if (depth > maxDepth) return results;
  if (!fs.existsSync(dirPath)) return results;
  
  // 进度提示：每层目录显示一次
  if (depth === 0) {
    info(`🔍 正在扫描源目录 (深度: ${maxDepth})...`);
  }
  
  // 检查是否应该忽略
  const dirName = path.basename(dirPath);
  if (IGNORE_PATTERNS.some(p => {
    if (p.includes('*')) {
      const regex = new RegExp('^' + p.replace('*', '.*') + '$');
      return regex.test(dirName);
    }
    return p === dirName;
  })) {
    return results;
  }
  
  try {
    const items = fs.readdirSync(dirPath);
    
    // 进度提示：每处理 100 个条目显示一次
    let itemCount = 0;
    const progressInterval = 100;
    
    for (const item of items) {
      // 显示进度
      itemCount++;
      if (depth === 0 && itemCount % progressInterval === 0) {
        process.stdout.write(`\r📂 已扫描 ${itemCount} 个条目...`);
      }
      
      const itemPath = path.join(dirPath, item);
      
      // 忽略检查
      if (IGNORE_PATTERNS.some(p => {
        if (p.includes('*')) {
          const regex = new RegExp('^' + p.replace('*', '.*') + '$');
          return regex.test(item);
        }
        return p === item;
      })) {
        continue;
      }
      
      try {
        const stat = fs.statSync(itemPath);
        
        const entry = {
          path: itemPath,
          relativePath: path.relative(dirPath, itemPath),
          name: item,
          isDirectory: stat.isDirectory(),
          size: stat.size,
          mtime: stat.mtimeMs,
          hash: null
        };
        
        if (stat.isFile()) {
          entry.hash = fileHash(itemPath);
        }
        
        results.push(entry);
        
        // 递归扫描子目录
        if (stat.isDirectory()) {
          const subResults = scanDir(itemPath, depth + 1, maxDepth);
          results.push(...subResults);
        }
      } catch (e) {
        // 权限问题等
      }
    }
  } catch (e) {
    error(`无法读取目录: ${dirPath}`);
  }
  
  // 进度完成提示
  if (depth === 0) {
    process.stdout.write('\r' + ' '.repeat(50) + '\r'); // 清除进度行
    info(`✅ 扫描完成: ${results.length} 个文件/目录`);
  }
  
  return results;
}

// 对比两个目录
function compareDirs(sourceDir, targetDir) {
  info(`对比目录:`);
  info(`  源: ${sourceDir}`);
  info(`  目标: ${targetDir}`);
  
  console.log('\n📊 正在扫描目录...\n');
  
  const sourceFiles = scanDir(sourceDir);
  const targetFiles = scanDir(targetDir);
  
  // 转换为 Map 方便查找
  const sourceMap = new Map();
  const targetMap = new Map();
  
  for (const f of sourceFiles) {
    sourceMap.set(f.relativePath, f);
  }
  
  for (const f of targetFiles) {
    targetMap.set(f.relativePath, f);
  }
  
  const comparison = {
    sourcePath: sourceDir,
    targetPath: targetDir,
    timestamp: new Date().toISOString(),
    summary: {
      sourceTotal: sourceFiles.length,
      targetTotal: targetFiles.length,
      newInSource: 0,
      missingInSource: 0,
      different: 0,
      same: 0
    },
    items: []
  };
  
  // 检查源中有而目标中没有的
  for (const [relativePath, sourceFile] of sourceMap) {
    const targetFile = targetMap.get(relativePath);
    
    if (!targetFile) {
      // 目标中没有
      comparison.items.push({
        relativePath,
        status: 'new_in_source',
        source: sourceFile,
        target: null
      });
      comparison.summary.newInSource++;
    } else if (sourceFile.isDirectory !== targetFile.isDirectory) {
      // 类型不同
      comparison.items.push({
        relativePath,
        status: 'type_mismatch',
        source: sourceFile,
        target: targetFile
      });
      comparison.summary.different++;
    } else if (!sourceFile.isDirectory) {
      // 都是文件，对比内容
      if (sourceFile.hash !== targetFile.hash) {
        // 内容不同
        comparison.items.push({
          relativePath,
          status: 'different',
          source: sourceFile,
          target: targetFile,
          sourceHash: sourceFile.hash,
          targetHash: targetFile.hash
        });
        comparison.summary.different++;
      } else {
        // 相同
        comparison.items.push({
          relativePath,
          status: 'same',
          source: sourceFile,
          target: targetFile
        });
        comparison.summary.same++;
      }
    }
  }
  
  // 检查目标中有而源中没有的
  for (const [relativePath, targetFile] of targetMap) {
    if (!sourceMap.has(relativePath)) {
      comparison.items.push({
        relativePath,
        status: 'missing_in_source',
        source: null,
        target: targetFile
      });
      comparison.summary.missingInSource++;
    }
  }
  
  return comparison;
}

// 按模块组织对比结果
function organizeByModule(comparison) {
  const modules = {
    config: { items: [], priority: 0 },
    channels: { items: [], priority: 0 },
    plugins: { items: [], priority: 0 },
    memory: { items: [], priority: 1 },
    cron: { items: [], priority: 1 },
    skills: { items: [], priority: 2 },
    mcp: { items: [], priority: 2 },
    agents: { items: [], priority: 2 },
    scripts: { items: [], priority: 2 },
    tools: { items: [], priority: 2 },
    workspaceConfig: { items: [], priority: 2 },
    workflows: { items: [], priority: 2 },
    taskToolMap: { items: [], priority: 2 },
    obsidian: { items: [], priority: 3 },
    other: { items: [], priority: 99 }
  };
  
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
        modules[modId].items.push(item);
        assigned = true;
        break;
      }
    }
    
    if (!assigned) {
      modules.other.items.push(item);
    }
  }
  
  return modules;
}

// 格式化输出
function formatComparison(comparison) {
  const modules = organizeByModule(comparison);
  
  console.log('\n' + '='.repeat(60));
  info('📊 对比结果摘要');
  console.log('='.repeat(60));
  
  console.log(`\n源文件数: ${comparison.summary.sourceTotal}`);
  console.log(`目标文件数: ${comparison.summary.targetTotal}`);
  console.log(`新增（源有目标无）: ${comparison.summary.newInSource}`);
  console.log(`缺失（目标有源无）: ${comparison.summary.missingInSource}`);
  console.log(`不同: ${comparison.summary.different}`);
  console.log(`相同: ${comparison.summary.same}`);
  
  console.log('\n' + '-'.repeat(60));
  info('📦 按模块统计');
  console.log('-'.repeat(60));
  
  const modOrder = ['config', 'channels', 'plugins', 'memory', 'cron', 'skills', 'mcp', 'agents', 'scripts', 'tools', 'workspaceConfig', 'workflows', 'taskToolMap', 'obsidian', 'other'];
  
  for (const modId of modOrder) {
    const mod = modules[modId];
    if (mod.items.length > 0) {
      const different = mod.items.filter(i => i.status !== 'same').length;
      console.log(`\n  ${modId.toUpperCase()} (${mod.items.length} 项, ${different} 不同)`);
      
      // 显示前几个差异
      const diffs = mod.items.filter(i => i.status !== 'same').slice(0, 5);
      for (const item of diffs) {
        const icon = {
          'new_in_source': '🆕',
          'missing_in_source': '📤',
          'different': '📝',
          'type_mismatch': '⚠️'
        }[item.status] || '➖';
        
        console.log(`    ${icon} ${item.relativePath}`);
      }
      
      if (mod.items.length > 5) {
        console.log(`    ... 还有 ${mod.items.length - 5} 项`);
      }
    }
  }
  
  console.log('\n' + '='.repeat(60));
  
  return modules;
}

// 生成 JSON 报告
function generateJSONReport(comparison, outputPath) {
  const report = {
    timestamp: comparison.timestamp,
    source: comparison.sourcePath,
    target: comparison.targetPath,
    sourcePath: comparison.sourcePath,
    targetPath: comparison.targetPath,
    summary: comparison.summary,
    items: comparison.items.map(i => ({
      relativePath: i.relativePath,
      status: i.status,
      sourceSize: i.source?.size || null,
      targetSize: i.target?.size || null,
      sourceHash: i.source?.hash || null,
      targetHash: i.target?.hash || null,
      source: i.source,
      target: i.target
    }))
  };
  
  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));
  info(`JSON 报告已保存: ${outputPath}`);
  
  return report;
}

// 主函数
function main() {
  const args = process.argv.slice(2);
  
  let sourcePath = '';
  let targetPath = '';
  let outputPath = '';
  let format = 'text';
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const next = args[i + 1];
    
    switch (arg) {
      case '-s':
      case '--source':
        sourcePath = next;
        i++;
        break;
      case '-t':
      case '--target':
        targetPath = next;
        i++;
        break;
      case '-o':
      case '--output':
        outputPath = next;
        i++;
        break;
      case '-f':
      case '--format':
        format = next;
        i++;
        break;
      case '-h':
      case '--help':
        console.log(`
compare-openclaw - 对比两个 OpenClaw 目录

用法: compare.js -s <源路径> -t <目标路径> [-o <输出路径>]

选项:
  -s, --source <路径>   源 OpenClaw 路径
  -t, --target <路径>   目标 OpenClaw 路径
  -o, --output <路径>   输出 JSON 报告路径
  -f, --format         输出格式: text, json, both
  -h, --help           显示帮助
        `.trim());
        process.exit(0);
    }
  }
  
  if (!sourcePath || !targetPath) {
    error('请指定源路径和目标路径');
    process.exit(1);
  }
  
  // 确保指向 .openclaw 目录
  if (!sourcePath.includes('.openclaw')) {
    sourcePath = path.join(sourcePath, '.openclaw');
  }
  if (!targetPath.includes('.openclaw')) {
    targetPath = path.join(targetPath, '.openclaw');
  }
  
  // 执行对比
  const comparison = compareDirs(sourcePath, targetPath);
  
  // 输出结果
  if (format === 'text' || format === 'both') {
    formatComparison(comparison);
  }
  
  if (format === 'json' || format === 'both') {
    if (!outputPath) {
      outputPath = path.join(process.env.HOME || '/tmp', 'openclaw-comparison.json');
    }
    generateJSONReport(comparison, outputPath);
  }
  
  return comparison;
}

// 导出
module.exports = { 
  compareDirs, 
  scanDir, 
  organizeByModule, 
  formatComparison, 
  generateJSONReport,
  main 
};

if (require.main === module) {
  main();
}
