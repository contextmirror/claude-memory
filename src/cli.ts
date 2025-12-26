#!/usr/bin/env node
/**
 * Claude Memory CLI
 *
 * Usage:
 *   claude-memory scan [directory]    Scan projects and update global context
 *   claude-memory list                List known projects
 *   claude-memory show <project>      Show details for a project
 *   claude-memory mcp                 Start MCP server
 */

import { Command } from 'commander';
import { readFileSync, existsSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';
import { fileURLToPath } from 'url';
import { scanProjects } from './scanner/projectScanner.js';
import { generateGlobalContext, writeGlobalContext, getMemoryDir } from './scanner/contextGenerator.js';
import { GlobalContext } from './types/index.js';
import { generateBriefing, briefingToClaudeMd } from './briefing/briefingGenerator.js';
import { runSetupWizard } from './setup/setupWizard.js';
import { activateLicense, deactivateLicense, getLicenseStatus } from './license/index.js';
import { detectStaleProjects } from './scanner/stalenessDetector.js';

// Get version from package.json
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageJsonPath = join(__dirname, '../package.json');
const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
const VERSION = packageJson.version;

const program = new Command();

program
  .name('claude-memory')
  .description('Cross-project memory for Claude Code')
  .version(VERSION);

// Scan command
program
  .command('scan')
  .description('Scan projects and update global context')
  .argument('[directory]', 'Root directory to scan', `${homedir()}/Project`)
  .option('-d, --depth <number>', 'Max depth to search', '2')
  .option('--generate-claude-md', 'Generate CLAUDE.md for projects without one')
  .option('-q, --quick', 'Only rescan stale projects (faster)')
  .option('--check', 'Only check for stale projects, don\'t scan')
  .action(async (directory, options) => {
    // Check-only mode: just report staleness
    if (options.check) {
      const context = loadContext();
      if (!context) {
        console.log('❌ No projects scanned yet.\n');
        console.log('Get started:');
        console.log('  claude-memory setup           # Interactive wizard (recommended)');
        console.log('  claude-memory scan ~/Projects # Scan a specific directory');
        return;
      }

      const report = detectStaleProjects(context);
      console.log('🧠 Claude Memory - Staleness Check\n');
      console.log(`Last full scan: ${new Date(context.lastUpdated).toLocaleString()}`);
      console.log(`Data age: ${report.dataAgeHours} hours\n`);

      if (report.staleProjects.length === 0) {
        console.log('✅ All projects are up to date!');
      } else {
        console.log(`⚠️  ${report.staleProjects.length} project(s) need updating:\n`);
        for (const p of report.staleProjects) {
          const icon = p.reason === 'git_activity' ? '📝' :
                       p.reason === 'file_changed' ? '📄' : '⏰';
          console.log(`  ${icon} ${p.name}`);
          console.log(`     ${p.details}`);
        }
        console.log(`\n${report.freshCount} project(s) are fresh.`);
        console.log('\nRun `claude-memory scan --quick` to refresh only stale projects.');
      }
      return;
    }

    console.log('🧠 Claude Memory Scanner\n');

    // Quick mode: only scan stale projects
    let projectsToScan: string[] | undefined;
    if (options.quick) {
      const existingContext = loadContext();
      if (existingContext) {
        const report = detectStaleProjects(existingContext);
        if (report.staleProjects.length === 0) {
          console.log('✅ All projects are up to date! Nothing to scan.');
          return;
        }
        projectsToScan = report.staleProjects.map(p => p.path);
        console.log(`🔄 Quick mode: Rescanning ${projectsToScan.length} stale project(s)...\n`);
      }
    }

    const projects = await scanProjects({
      rootDir: directory,
      maxDepth: parseInt(options.depth, 10),
      generateClaudeMd: options.generateClaudeMd,
      onlyPaths: projectsToScan,
    });

    if (projects.length === 0) {
      console.log('\n⚠️  No projects found. Context not updated.');
      console.log('   Check the directory path and try again.');
      return;
    }

    // For quick mode, merge with existing context
    let context: GlobalContext;
    if (options.quick && projectsToScan) {
      const existingContext = loadContext();
      if (existingContext) {
        // Replace only the rescanned projects
        const rescannedPaths = new Set(projects.map(p => p.path));
        const unchangedProjects = existingContext.projects.filter(p => !rescannedPaths.has(p.path));
        context = {
          ...existingContext,
          lastUpdated: new Date().toISOString(),
          projects: [...unchangedProjects, ...projects],
        };
      } else {
        context = generateGlobalContext(projects);
      }
    } else {
      context = generateGlobalContext(projects);
    }

    writeGlobalContext(context);

    console.log('\n✅ Done! Global context updated.');
    console.log('\nTo use with Claude Code, add the MCP server to your config:');
    console.log('  claude-memory mcp');
  });

// List command
program
  .command('list')
  .description('List known projects')
  .action(() => {
    const context = loadContext();
    if (!context) {
      console.log('❌ No projects scanned yet.\n');
      console.log('Get started:');
      console.log('  claude-memory setup           # Interactive wizard (recommended)');
      console.log('  claude-memory scan ~/Projects # Scan a specific directory');
      return;
    }

    console.log('🧠 Known Projects\n');
    for (const project of context.projects) {
      const dirty = project.isDirty ? ' ⚠️' : '';
      console.log(`  ${project.name}${dirty}`);
      console.log(`    ${project.path}`);
      console.log(`    ${project.techStack.join(', ')}`);
      console.log('');
    }
  });

// Show command
program
  .command('show')
  .description('Show details for a project')
  .argument('<project>', 'Project name or path')
  .action((projectName) => {
    const context = loadContext();
    if (!context) {
      console.log('❌ No projects scanned yet.\n');
      console.log('Get started:');
      console.log('  claude-memory setup           # Interactive wizard (recommended)');
      console.log('  claude-memory scan ~/Projects # Scan a specific directory');
      return;
    }

    const project = context.projects.find(
      (p) => p.name.toLowerCase() === projectName.toLowerCase() || p.path.includes(projectName)
    );

    if (!project) {
      console.log(`❌ Project not found: "${projectName}"\n`);
      console.log('Did you mean one of these?\n');
      // Show projects sorted by similarity to the query
      const lowerQuery = projectName.toLowerCase();
      const sorted = [...context.projects].sort((a, b) => {
        const aScore = a.name.toLowerCase().includes(lowerQuery) ? 1 : 0;
        const bScore = b.name.toLowerCase().includes(lowerQuery) ? 1 : 0;
        return bScore - aScore;
      });
      sorted.slice(0, 5).forEach((p) => console.log(`  ${p.name}  (${p.path})`));
      if (context.projects.length > 5) {
        console.log(`\n  ... and ${context.projects.length - 5} more. Run 'claude-memory list' to see all.`);
      }
      return;
    }

    console.log(`\n📁 ${project.name}\n`);
    console.log(`Path: ${project.path}`);
    console.log(`Language: ${project.language}`);
    console.log(`Stack: ${project.techStack.join(', ')}`);
    console.log(`Branch: ${project.currentBranch}${project.isDirty ? ' (dirty)' : ''}`);
    console.log(`Last Activity: ${new Date(project.lastActivity).toLocaleString()}`);
    console.log(`\nDescription:\n  ${project.description}`);
    console.log(`\nKey Files:`);
    console.log(`  CLAUDE.md: ${project.hasFiles.claudeMd ? '✓' : '✗'}`);
    console.log(`  README.md: ${project.hasFiles.readme ? '✓' : '✗'}`);
  });

// Exclude command - exclude a project from scanning
program
  .command('exclude')
  .description('Exclude a project from future scans')
  .argument('<project>', 'Project path or name')
  .action((projectQuery) => {
    const context = loadContext();
    if (!context) {
      console.log('❌ No projects scanned yet.\n');
      console.log('Get started:');
      console.log('  claude-memory setup           # Interactive wizard (recommended)');
      console.log('  claude-memory scan ~/Projects # Scan a specific directory');
      return;
    }

    // Find the project
    const project = context.projects.find(
      (p) => p.name.toLowerCase() === projectQuery.toLowerCase() || p.path.includes(projectQuery)
    );

    if (!project) {
      // Maybe it's a direct path
      if (existsSync(projectQuery)) {
        addExclusion(projectQuery);
        console.log(`✅ Excluded: ${projectQuery}`);
        console.log('   This project will be skipped in future scans.');
        return;
      }
      console.log(`❌ Project not found: "${projectQuery}"\n`);
      console.log('Tip: Use the project name or path. Run "claude-memory list" to see all projects.');
      return;
    }

    addExclusion(project.path);
    console.log(`✅ Excluded: ${project.name}`);
    console.log(`   Path: ${project.path}`);
    console.log('   This project will be skipped in future scans.');
    console.log('   Run `claude-memory include` to re-add it.');
  });

// Include command - remove a project from exclusion list
program
  .command('include')
  .description('Remove a project from the exclusion list')
  .argument('<project>', 'Project path or name')
  .action((projectQuery) => {
    const context = loadContext();
    if (!context) {
      console.log('❌ No projects scanned yet.\n');
      console.log('Get started:');
      console.log('  claude-memory setup           # Interactive wizard (recommended)');
      console.log('  claude-memory scan ~/Projects # Scan a specific directory');
      return;
    }

    const excluded = context.excludedProjects || [];
    const match = excluded.find(p =>
      p.toLowerCase().includes(projectQuery.toLowerCase())
    );

    if (!match) {
      console.log(`❌ Project not in exclusion list: "${projectQuery}"\n`);
      if (excluded.length > 0) {
        console.log('Currently excluded:');
        excluded.forEach(p => console.log(`  ${p}`));
        console.log('\nRun "claude-memory excluded" to see all excluded projects.');
      } else {
        console.log('No projects are currently excluded.');
      }
      return;
    }

    removeExclusion(match);
    console.log(`✅ Removed from exclusion list: ${match}`);
    console.log('   Run `claude-memory scan` to add it back to your projects.');
  });

// Excluded command - list excluded projects
program
  .command('excluded')
  .description('List excluded projects')
  .action(() => {
    const context = loadContext();
    const excluded = context?.excludedProjects || [];

    if (excluded.length === 0) {
      console.log('No excluded projects.');
      console.log('Use `claude-memory exclude <project>` to exclude a project.');
      return;
    }

    console.log('🚫 Excluded Projects\n');
    excluded.forEach(p => console.log(`  ${p}`));
    console.log('\nUse `claude-memory include <project>` to re-add.');
  });

function addExclusion(projectPath: string): void {
  const contextPath = join(getMemoryDir(), 'context.json');
  if (!existsSync(contextPath)) return;

  try {
    const context = JSON.parse(readFileSync(contextPath, 'utf-8'));
    context.excludedProjects = context.excludedProjects || [];
    if (!context.excludedProjects.includes(projectPath)) {
      context.excludedProjects.push(projectPath);
      writeFileSync(contextPath, JSON.stringify(context, null, 2), 'utf-8');
    }
  } catch {
    console.error('Failed to update exclusion list');
  }
}

function removeExclusion(projectPath: string): void {
  const contextPath = join(getMemoryDir(), 'context.json');
  if (!existsSync(contextPath)) return;

  try {
    const context = JSON.parse(readFileSync(contextPath, 'utf-8'));
    context.excludedProjects = (context.excludedProjects || []).filter(
      (p: string) => p !== projectPath
    );
    writeFileSync(contextPath, JSON.stringify(context, null, 2), 'utf-8');
  } catch {
    console.error('Failed to update exclusion list');
  }
}

// Briefing command - deep project analysis and CLAUDE.md generation
program
  .command('briefing')
  .description('Generate a detailed CLAUDE.md briefing for a project')
  .argument('[directory]', 'Project directory', process.cwd())
  .option('-o, --output <file>', 'Output file (default: CLAUDE.md in project)')
  .option('--stdout', 'Print to stdout instead of file')
  .option('--force', 'Overwrite existing CLAUDE.md')
  .action(async (directory, options) => {
    const projectPath = directory.startsWith('/') ? directory : join(process.cwd(), directory);

    console.log('🧠 Claude Memory - Project Briefing\n');
    console.log(`📁 Analyzing: ${projectPath}\n`);

    // Check if project exists
    if (!existsSync(projectPath)) {
      console.log(`❌ Directory not found: ${projectPath}`);
      return;
    }

    // Check for existing CLAUDE.md
    const claudeMdPath = options.output || join(projectPath, 'CLAUDE.md');
    if (existsSync(claudeMdPath) && !options.force && !options.stdout) {
      console.log(`⚠️  CLAUDE.md already exists at ${claudeMdPath}`);
      console.log('   Use --force to overwrite, or --stdout to preview');
      return;
    }

    try {
      console.log('📊 Scanning project structure...');
      const briefing = await generateBriefing({ projectPath });

      console.log(`   Name: ${briefing.name}`);
      console.log(`   Language: ${briefing.language}`);
      console.log(`   Stack: ${briefing.techStack.join(', ')}`);
      console.log(`   Entry points: ${briefing.entryPoints.length}`);
      console.log(`   Patterns detected: ${briefing.patterns.length}`);
      console.log(`   Dependencies: ${briefing.dependencies.length}`);

      console.log('\n📝 Generating CLAUDE.md...');
      const markdown = briefingToClaudeMd(briefing);

      if (options.stdout) {
        console.log('\n' + '='.repeat(60) + '\n');
        console.log(markdown);
      } else {
        writeFileSync(claudeMdPath, markdown, 'utf-8');
        console.log(`\n✅ Written to: ${claudeMdPath}`);
      }

      console.log('\n💡 Pro tip: Run `claude-memory scan` to update your global context');
    } catch (err) {
      console.error('❌ Failed to generate briefing:', err);
    }
  });

// Init command - alias for briefing (backwards compatibility)
program
  .command('init')
  .description('Generate CLAUDE.md for the current project (alias for briefing)')
  .action(async () => {
    // Just run the briefing command
    const projectPath = process.cwd();
    console.log('🧠 Claude Memory - Project Briefing\n');
    console.log(`📁 Analyzing: ${projectPath}\n`);

    const claudeMdPath = join(projectPath, 'CLAUDE.md');
    if (existsSync(claudeMdPath)) {
      console.log(`⚠️  CLAUDE.md already exists`);
      console.log('   Use `claude-memory briefing --force` to overwrite');
      console.log('   Use `claude-memory briefing --stdout` to preview');
      return;
    }

    try {
      console.log('📊 Scanning project structure...');
      const briefing = await generateBriefing({ projectPath });

      console.log(`   Name: ${briefing.name}`);
      console.log(`   Language: ${briefing.language}`);
      console.log(`   Stack: ${briefing.techStack.join(', ')}`);

      console.log('\n📝 Generating CLAUDE.md...');
      const markdown = briefingToClaudeMd(briefing);

      writeFileSync(claudeMdPath, markdown, 'utf-8');
      console.log(`\n✅ Written to: ${claudeMdPath}`);
    } catch (err) {
      console.error('❌ Failed to generate briefing:', err);
    }
  });

// MCP command - start the MCP server
program
  .command('mcp')
  .description('Start MCP server for Claude Code integration')
  .action(async () => {
    // Import and run the MCP server
    await import('./mcp/server.js');
  });

// Setup command - interactive setup wizard
program
  .command('setup')
  .description('Run the interactive setup wizard')
  .option('-d, --directory <dir>', 'Projects directory to scan')
  .option('--skip-mcp', 'Skip MCP configuration')
  .option('--skip-briefing', 'Skip CLAUDE.md generation')
  .option('--non-interactive', 'Run without prompts (useful for CI)')
  .action(async (options) => {
    await runSetupWizard({
      projectsDir: options.directory,
      skipMcp: options.skipMcp,
      skipBriefing: options.skipBriefing,
      interactive: !options.nonInteractive,
    });
  });

// Activate command - activate a Pro license
program
  .command('activate')
  .description('Activate a Pro license key')
  .argument('<key>', 'License key (format: CM-XXXX-XXXX-XXXX)')
  .action(async (key) => {
    console.log('Activating license...\n');

    const result = await activateLicense(key);

    if (!result.valid) {
      console.log(`❌ ${result.error}`);
      return;
    }

    console.log('✅ License activated successfully!');
    console.log(`   Plan: Pro`);
    if (result.license?.email) {
      console.log(`   Email: ${result.license.email}`);
    }
    console.log('\nPro features are now unlocked.');
  });

// Status command - show license status
program
  .command('status')
  .description('Show license status')
  .action(() => {
    const status = getLicenseStatus();

    console.log('🧠 Claude Memory License Status\n');
    console.log(`   Plan: ${status.plan === 'pro' ? 'Pro' : 'Free'}`);

    if (status.isPro) {
      if (status.email) {
        console.log(`   Email: ${status.email}`);
      }
      if (status.activatedAt) {
        console.log(`   Activated: ${new Date(status.activatedAt).toLocaleDateString()}`);
      }
      if (status.expiresAt) {
        console.log(`   Expires: ${new Date(status.expiresAt).toLocaleDateString()}`);
        if (status.daysRemaining) {
          console.log(`   Days remaining: ${status.daysRemaining}`);
        }
      }
      console.log(`   Status: Active`);
    } else {
      console.log(`   Status: ${status.expiresAt ? 'Expired' : 'Not activated'}`);
      console.log('\n   Upgrade at https://claude-memory.dev');
      console.log('   Or run: claude-memory activate <your-key>');
    }
  });

// Deactivate command - remove license
program
  .command('deactivate')
  .description('Remove Pro license')
  .action(() => {
    const removed = deactivateLicense();

    if (removed) {
      console.log('✅ License removed.');
      console.log('   You are now on the Free plan.');
    } else {
      console.log('No license to remove.');
    }
  });

function loadContext(): GlobalContext | null {
  const contextPath = join(getMemoryDir(), 'context.json');
  if (!existsSync(contextPath)) {
    return null;
  }
  try {
    return JSON.parse(readFileSync(contextPath, 'utf-8'));
  } catch {
    return null;
  }
}

program.parse();
