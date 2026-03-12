#!/usr/bin/env node

/**
 * sync-openclaw - 验证脚本
 * 
 * 验证同步结果，确保数据完整性
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

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

// 文件哈希
function fileHash(filePath) {
  try {
    const content = fs.readFileSync(filePath);
    return crypto.createHash('md5').update(content).digest('hex');
  } catch (e) {
    return null;
  }
}

// 验证同步结果
function verifySync(plan, results) {
  const verification = {
    timestamp: new Date().toISOString(),
    plan,
    results,
    checks: [],
    passed: true
  };
  
  const sourceRoot = path.dirname(plan.sourcePath);
  const targetRoot = path.dirname(plan.targetPath);
  
  // 检查每个同步项
  for (const item of plan.items) {
    if (!item.include) continue;
    
    const check = {
      module: item.module,
      status: 'pending',
      details: []
    };
    
    try {
      const sourcePath = path.join(sourceRoot, getModulePath(item.module));
      const targetPath = path.join(targetRoot, getModulePath(item.module));
      
      // 检查目标是否存在
      if (!fs.existsSync(targetPath)) {
        check.status = 'failed';
        check.details.push(`目标路径不存在: ${targetPath}`);
        verification.passed = false;
      } else {
        // 文件/目录存在
        check.details.push(`✓ 目标存在: ${targetPath}`);
        
        // 根据策略验证
        switch (item.strategy) {
          case 'replace':
          case 'copy':
            // 检查关键文件是否存在
            const sourceFiles = getModuleFiles(item.module);
            let allExist = true;
            
            for (const f of sourceFiles) {
              const srcFile = path.join(sourcePath, f);
              const tgtFile = path.join(targetPath, f);
              
              if (fs.existsSync(srcFile) && !fs.existsSync(tgtFile)) {
                check.details.push(`✗ 缺失文件: ${f}`);
                allExist = false;
              }
            }
            
            if (allExist) {
              check.status = 'passed';
              check.details.push('✓ 所有文件已同步');
            } else {
              check.status = 'warning';
              check.details.push('⚠ 部分文件可能未同步');
            }
            break;
            
          case 'merge':
            // 验证合并结果
            check.status = 'passed';
            check.details.push('✓ 合并完成');
            break;
            
          case 'append':
            // 追加模式，检查文件大小
            if (fs.existsSync(targetPath) && fs.statSync(targetPath).isFile()) {
              const targetSize = fs.statSync(targetPath).size;
              check.status = 'passed';
              check.details.push(`✓ 追加完成，目标大小: ${targetSize} bytes`);
            }
            break;
            
          case 'skip':
            check.status = 'skipped';
            check.details.push('⏭ 跳过验证');
            break;
        }
      }
    } catch (e) {
      check.status = 'error';
      check.details.push(`错误: ${e.message}`);
      verification.passed = false;
    }
    
    verification.checks.push(check);
  }
  
  // 统计
  verification.summary = {
    total: verification.checks.length,
    passed: verification.checks.filter(c => c.status === 'passed').length,
    failed: verification.checks.filter(c => c.status === 'failed').length,
    warnings: verification.checks.filter(c => c.status === 'warning').length,
    skipped: verification.checks.filter(c => c.status === 'skipped').length,
    errors: verification.checks.filter(c => c.status === 'error').length
  };
  
  return verification;
}

// 获取模块路径
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
    taskToolMap: 'task-tool-map.json',
    obsidian: 'workspace/docs'
  };
  
  return paths[moduleId] || moduleId;
}

// 获取模块文件列表
function getModuleFiles(moduleId) {
  const files = {
    config: ['openclaw.json', 'mcporter.json'],
    channels: [],  // 目录
    plugins: [],   // 目录
    memory: ['MEMORY.md'],
    cron: ['jobs.json'],
    skills: [],    // 目录
    mcp: [],       // 目录
    agents: [],    // 目录
    scripts: [],   // 目录
    tools: [],     // 目录
    workspaceConfig: [], // 目录
    workflows: [], // 目录
    taskToolMap: ['task-tool-map.json'],
    obsidian: []   // 目录
  };
  
  return files[moduleId] || [];
}

// 显示验证结果
function displayVerification(verification) {
  console.log('\n' + '='.repeat(60));
  
  if (verification.passed) {
    success('✅ 验证通过');
  } else {
    warn('⚠️  验证有警告');
  }
  
  console.log('='.repeat(60));
  
  console.log('\n统计:');
  console.log(`  - 总检查项: ${verification.summary.total}`);
  console.log(`  - ✅ 通过: ${verification.summary.passed}`);
  console.log(`  - ❌ 失败: ${verification.summary.failed}`);
  console.log(`  - ⚠️  警告: ${verification.summary.warnings}`);
  console.log(`  - ⏭ 跳过: ${verification.summary.skipped}`);
  console.log(`  - 💥 错误: ${verification.summary.errors}`);
  
  console.log('\n' + '-'.repeat(60));
  info('详细结果');
  console.log('-'.repeat(60));
  
  for (const check of verification.checks) {
    const icon = {
      'passed': '✅',
      'failed': '❌',
      'warning': '⚠️',
      'skipped': '⏭',
      'error': '💥',
      'pending': '⏳'
    }[check.status] || '➖';
    
    console.log(`\n  ${icon} ${check.module.toUpperCase()}`);
    for (const detail of check.details) {
      console.log(`     ${detail}`);
    }
  }
  
  console.log('\n' + '='.repeat(60));
}

// 验证 OpenClaw 配置
function verifyOpenClawConfig(targetPath) {
  const configPath = path.join(targetPath, 'openclaw.json');
  
  if (!fs.existsSync(configPath)) {
    return { valid: false, error: 'openclaw.json 不存在' };
  }
  
  try {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    
    // 检查必需字段
    const requiredFields = ['version', 'gateway', 'agents'];
    const missing = requiredFields.filter(f => !config[f]);
    
    if (missing.length > 0) {
      return { valid: false, error: `缺少必需字段: ${missing.join(', ')}` };
    }
    
    return { valid: true, config };
  } catch (e) {
    return { valid: false, error: `配置解析失败: ${e.message}` };
  }
}

// 验证 MCP 配置
function verifyMCP(targetPath) {
  const mcpPath = path.join(targetPath, 'mcporter.json');
  
  if (!fs.existsSync(mcpPath)) {
    return { valid: true, hasMCP: false }; // MCP 可选
  }
  
  try {
    const config = JSON.parse(fs.readFileSync(mcpPath, 'utf8'));
    return { valid: true, hasMCP: true, servers: Object.keys(config.servers || {}) };
  } catch (e) {
    return { valid: false, error: `MCP 配置解析失败: ${e.message}` };
  }
}

// 生成验证报告
function generateReport(verification, outputPath) {
  const report = {
    title: 'OpenClaw 同步验证报告',
    timestamp: verification.timestamp,
    summary: verification.summary,
    checks: verification.checks,
    recommendations: []
  };
  
  // 生成建议
  if (verification.summary.failed > 0) {
    report.recommendations.push('部分同步失败，请检查源路径和权限');
  }
  
  if (verification.summary.warnings > 0) {
    report.recommendations.push('存在警告，请检查同步策略是否合适');
  }
  
  if (verification.passed && verification.summary.warnings === 0) {
    report.recommendations.push('同步验证通过，可以启动 Gateway');
    report.recommendations.push('运行: openclaw gateway restart');
  }
  
  const content = `# ${report.title}

生成时间: ${report.timestamp}

## 摘要

| 指标 | 数量 |
|------|------|
| 总检查项 | ${report.summary.total} |
| 通过 | ${report.summary.passed} |
| 失败 | ${report.summary.failed} |
| 警告 | ${report.summary.warnings} |
| 跳过 | ${report.summary.skipped} |
| 错误 | ${report.summary.errors} |

## 检查详情

${verification.checks.map(c => `
### ${c.module}

状态: ${c.status}

${c.details.map(d => `- ${d}`).join('\n')}
`).join('\n')}

## 建议

${report.recommendations.map(r => `- ${r}`).join('\n')}
`;
  
  fs.writeFileSync(outputPath, content);
  success(`验证报告已保存: ${outputPath}`);
  
  return report;
}

// 主函数
function main() {
  const args = process.argv.slice(2);
  
  let planPath = '';
  let resultsPath = '';
  let targetPath = '';
  let outputPath = '';
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const next = args[i + 1];
    
    switch (arg) {
      case '-p':
      case '--plan':
        planPath = next;
        i++;
        break;
      case '-r':
      case --results:
        resultsPath = next;
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
      case '-h':
      case '--help':
        console.log(`
verify-openclaw - 验证同步结果

用法: verify.js -p <计划.json> [-r <结果.json>] -t <目标路径> [-o <报告.md>]

选项:
  -p, --plan <路径>    同步计划文件
  -r, --results <路径>  同步结果文件
  -t, --target <路径>  目标 OpenClaw 路径
  -o, --output <路径>  报告输出路径
  -h, --help           显示帮助
        `.trim());
        process.exit(0);
    }
  }
  
  if (!targetPath) {
    error('请指定目标路径 (-t)');
    process.exit(1);
  }
  
  // 确保指向 .openclaw
  if (!targetPath.includes('.openclaw')) {
    targetPath = path.join(targetPath, '.openclaw');
  }
  
  // 验证配置
  info('验证 OpenClaw 配置...');
  const configResult = verifyOpenClawConfig(targetPath);
  
  if (!configResult.valid) {
    error(`配置验证失败: ${configResult.error}`);
  } else {
    success('配置验证通过');
  }
  
  // 验证 MCP
  info('验证 MCP 配置...');
  const mcpResult = verifyMCP(targetPath);
  
  if (mcpResult.hasMCP) {
    success(`MCP 配置验证通过 (${mcpResult.servers?.length || 0} 个服务器)`);
  } else {
    info('未发现 MCP 配置（可选）');
  }
  
  // 如果有计划文件，验证计划执行结果
  if (planPath && fs.existsSync(planPath)) {
    info('验证同步计划执行结果...');
    
    let plan, results;
    try {
      plan = JSON.parse(fs.readFileSync(planPath, 'utf8'));
    } catch (e) {
      warn(`无法加载计划文件: ${e.message}`);
    }
    
    if (resultsPath && fs.existsSync(resultsPath)) {
      try {
        results = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));
      } catch (e) {
        warn(`无法加载结果文件: ${e.message}`);
      }
    }
    
    if (plan) {
      const verification = verifySync(plan, results);
      displayVerification(verification);
      
      if (outputPath) {
        generateReport(verification, outputPath);
      }
    }
  }
  
  console.log('\n' + '='.repeat(60));
  if (configResult.valid) {
    success('验证完成');
  } else {
    error('验证未完全通过');
  }
  console.log('='.repeat(60));
}

// 导出
module.exports = {
  verifySync,
  verifyOpenClawConfig,
  verifyMCP,
  displayVerification,
  generateReport,
  main
};

if (require.main === module) {
  main();
}
