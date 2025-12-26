/**
 * Setup Wizard - Runs after npm install to configure claude-memory
 *
 * Features:
 * 1. Scans for projects
 * 2. Offers to generate CLAUDE.md for projects without one
 * 3. Auto-configures MCP in ~/.claude.json
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { createInterface } from 'readline';
import { scanProjects } from '../scanner/projectScanner.js';
import { generateGlobalContext, writeGlobalContext } from '../scanner/contextGenerator.js';
import { generateBriefing, briefingToClaudeMd } from '../briefing/briefingGenerator.js';
import { MemoryConfig, DEFAULT_MEMORY_CONFIG } from '../types/index.js';

const CLAUDE_JSON_PATH = join(homedir(), '.claude.json');
const MEMORY_DIR = join(homedir(), '.claude-memory');
const CONFIG_PATH = join(MEMORY_DIR, 'config.json');

const MCP_SERVER_CONFIG = {
  command: 'claude-memory',
  args: ['mcp'],
};

interface SetupOptions {
  projectsDir?: string;
  skipMcp?: boolean;
  skipBriefing?: boolean;
  interactive?: boolean;
}

/**
 * Run the setup wizard
 */
export async function runSetupWizard(options: SetupOptions = {}): Promise<void> {
  const {
    projectsDir: providedDir,
    skipMcp = false,
    skipBriefing = false,
    interactive = true,
  } = options;

  console.log('');
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║         🧠 Claude Memory - Setup Wizard                  ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log('');

  // Determine projects directory
  let projectsDir = providedDir || guessProjectsDir();

  if (!projectsDir) {
    console.log('📍 Step 0: Locate your projects\n');
    console.log('   Could not auto-detect your projects directory.');
    console.log('   Common locations like ~/Projects, ~/Code, ~/dev were not found.\n');

    if (interactive) {
      const answer = await ask('   Enter your projects directory path: ');
      if (!answer || !existsSync(answer)) {
        console.log('\n   ❌ Invalid directory. Please run:');
        console.log('   claude-memory setup -d /path/to/your/projects');
        return;
      }
      projectsDir = answer;
    } else {
      console.log('   ❌ Cannot continue without a projects directory.');
      console.log('   Run: claude-memory setup -d /path/to/your/projects');
      return;
    }
  }

  // Step 1: Find projects
  console.log('📍 Step 1: Scanning for projects\n');
  console.log(`   Looking in: ${projectsDir}`);

  const projects = await scanProjects({
    rootDir: projectsDir,
    maxDepth: 2,
  });

  if (projects.length === 0) {
    console.log('\n   ⚠️  No projects found.');
    console.log(`   Make sure you have projects in ${projectsDir}`);
    console.log('   Or run: claude-memory scan /path/to/your/projects');
    return;
  }

  console.log(`\n   ✅ Found ${projects.length} project(s):\n`);

  const projectsWithoutClaudeMd = projects.filter(p => !p.hasFiles.claudeMd);
  const projectsWithClaudeMd = projects.filter(p => p.hasFiles.claudeMd);

  for (const p of projectsWithClaudeMd) {
    console.log(`   ✓ ${p.name} (${p.techStack.join(', ')}) - Has CLAUDE.md`);
  }
  for (const p of projectsWithoutClaudeMd) {
    console.log(`   ○ ${p.name} (${p.techStack.join(', ')}) - No CLAUDE.md`);
  }

  // Step 2: Generate CLAUDE.md for projects without one
  if (!skipBriefing && projectsWithoutClaudeMd.length > 0) {
    console.log('\n📍 Step 2: Generate CLAUDE.md files\n');

    if (interactive) {
      const answer = await ask(
        `   Generate CLAUDE.md for ${projectsWithoutClaudeMd.length} project(s)? (Y/n) `
      );

      if (answer.toLowerCase() !== 'n') {
        for (const project of projectsWithoutClaudeMd) {
          console.log(`\n   📝 Generating for ${project.name}...`);
          try {
            const briefing = await generateBriefing({ projectPath: project.path });
            const markdown = briefingToClaudeMd(briefing);
            const outputPath = join(project.path, 'CLAUDE.md');
            writeFileSync(outputPath, markdown, 'utf-8');
            console.log(`   ✅ Created: ${outputPath}`);
          } catch (err) {
            console.log(`   ❌ Failed: ${err}`);
          }
        }
      }
    } else {
      console.log(`   Skipping CLAUDE.md generation (non-interactive mode)`);
      console.log(`   Run: claude-memory briefing /path/to/project`);
    }
  } else if (projectsWithoutClaudeMd.length === 0) {
    console.log('\n📍 Step 2: Generate CLAUDE.md files\n');
    console.log('   ✅ All projects already have CLAUDE.md');
  }

  // Step 3: Save global context
  console.log('\n📍 Step 3: Saving global context\n');
  const context = generateGlobalContext(projects);
  writeGlobalContext(context);
  console.log('   ✅ Context saved to ~/.claude-memory/');

  // Step 4: Configure MCP
  if (!skipMcp) {
    console.log('\n📍 Step 4: Configuring Claude Code integration\n');

    const mcpConfigured = configureMcp();
    if (mcpConfigured) {
      console.log('   ✅ MCP server added to ~/.claude.json');
    } else {
      console.log('   ⚠️  Could not auto-configure MCP');
      console.log('   Add this to your Claude Code settings manually:');
      console.log('');
      console.log('   "mcpServers": {');
      console.log('     "claude-memory": {');
      console.log('       "command": "claude-memory",');
      console.log('       "args": ["mcp"]');
      console.log('     }');
      console.log('   }');
    }
  }

  // Step 5: Configure auto-detection
  console.log('\n📍 Step 5: Configure new project detection\n');

  if (interactive) {
    console.log('   When you create a new folder in your projects directory,');
    console.log('   Claude can automatically detect it and offer to set it up.');
    console.log('');

    const enableAutoDetect = await ask(
      '   Enable auto-detection of new projects? (Y/n) '
    );

    const config: MemoryConfig = {
      ...DEFAULT_MEMORY_CONFIG,
      watchedDirs: [projectsDir],
      autoDetectNewProjects: enableAutoDetect.toLowerCase() !== 'n',
      promptForClaudeMd: true,
      lastUpdated: new Date().toISOString(),
    };

    saveMemoryConfig(config);

    if (config.autoDetectNewProjects) {
      console.log('   ✅ Auto-detection enabled');
      console.log(`   📁 Watching: ${projectsDir}`);
      console.log('');
      console.log('   When you start Claude in a new folder under this directory,');
      console.log('   it will offer to generate a CLAUDE.md and add the project to memory.');
    } else {
      console.log('   ℹ️  Auto-detection disabled');
      console.log('   You can manually add projects with: claude-memory scan');
    }
  } else {
    // Non-interactive: enable with defaults
    const config: MemoryConfig = {
      ...DEFAULT_MEMORY_CONFIG,
      watchedDirs: [projectsDir],
      autoDetectNewProjects: true,
      promptForClaudeMd: true,
      lastUpdated: new Date().toISOString(),
    };
    saveMemoryConfig(config);
    console.log('   ✅ Auto-detection enabled (default)');
  }

  // Done!
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║                    ✅ Setup Complete!                    ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log('');
  console.log('   Next steps:');
  console.log('   1. Restart Claude Code to load the MCP server');
  console.log('   2. Ask Claude: "What projects do I have?"');
  console.log('   3. Claude now knows about all your projects!');
  console.log('');
  console.log('   Commands:');
  console.log('   • claude-memory scan [dir]   - Re-scan projects');
  console.log('   • claude-memory list         - Show known projects');
  console.log('   • claude-memory briefing     - Generate CLAUDE.md');
  console.log('');
}

/**
 * Guess the user's projects directory
 * Returns null if we can't find a reasonable guess (better than scanning home!)
 */
function guessProjectsDir(): string | null {
  const home = homedir();
  const candidates = [
    join(home, 'Projects'),
    join(home, 'Project'),
    join(home, 'projects'),
    join(home, 'Code'),
    join(home, 'code'),
    join(home, 'Development'),
    join(home, 'dev'),
    join(home, 'src'),
    join(home, 'repos'),
    join(home, 'git'),
    join(home, 'workspace'),
    join(home, 'Workspace'),
  ];

  for (const dir of candidates) {
    if (existsSync(dir)) {
      return dir;
    }
  }

  // Don't fall back to home - that scans way too much and causes issues
  // Return null and let the caller handle it
  return null;
}

/**
 * Save memory config to ~/.claude-memory/config.json
 */
function saveMemoryConfig(config: MemoryConfig): void {
  // Ensure directory exists
  if (!existsSync(MEMORY_DIR)) {
    mkdirSync(MEMORY_DIR, { recursive: true });
  }
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
}

/**
 * Configure MCP in ~/.claude.json
 */
function configureMcp(): boolean {
  try {
    let config: Record<string, unknown> = {};

    // Read existing config
    if (existsSync(CLAUDE_JSON_PATH)) {
      const content = readFileSync(CLAUDE_JSON_PATH, 'utf-8');
      config = JSON.parse(content);
    }

    // Check if already configured
    const mcpServers = (config.mcpServers as Record<string, unknown>) || {};
    if (mcpServers['claude-memory']) {
      console.log('   ℹ️  MCP server already configured');
      return true;
    }

    // Add our config
    mcpServers['claude-memory'] = MCP_SERVER_CONFIG;
    config.mcpServers = mcpServers;

    // Write back
    writeFileSync(CLAUDE_JSON_PATH, JSON.stringify(config, null, 2), 'utf-8');
    return true;
  } catch (err) {
    return false;
  }
}

/**
 * Simple async prompt
 */
function ask(question: string): Promise<string> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

/**
 * Check if this is running as a postinstall script
 */
export function isPostInstall(): boolean {
  return process.env.npm_lifecycle_event === 'postinstall';
}
