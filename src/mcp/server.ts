/**
 * Claude Memory MCP Server
 *
 * Exposes tools for Claude Code to query cross-project context:
 * - get_global_context: Overview of all projects
 * - get_project_summary: Details about a specific project
 * - search_projects: Search across all projects
 * - record_insight: Save a cross-project insight
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { readFileSync, existsSync, readdirSync, statSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';
import { fileURLToPath } from 'url';
import { GlobalContext, MemoryConfig, CurrentDirectoryStatus, DEFAULT_MEMORY_CONFIG } from '../types/index.js';
import { isPro, getProFeatureMessage } from '../license/index.js';
import { detectStaleProjects, checkCurrentProjectStaleness, formatStalenessForMcp } from '../scanner/stalenessDetector.js';
import { checkForUpdate, formatUpdateMessage } from '../utils/updateChecker.js';
import { searchCode, formatSearchResults } from '../utils/codeSearch.js';

const MEMORY_DIR = join(homedir(), '.claude-memory');

// Read version from package.json to ensure single source of truth
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageJsonPath = join(__dirname, '../../package.json');
const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
const CURRENT_VERSION = packageJson.version;

// Tool definitions
const tools: Tool[] = [
  {
    name: 'get_global_context',
    description:
      'Get an overview of all projects the user is working on. Returns project names, descriptions, tech stacks, and recent activity. Use this at the start of conversations to understand the user\'s development environment.',
    inputSchema: {
      type: 'object',
      properties: {
        cwd: {
          type: 'string',
          description: 'Current working directory. If provided, will check if this is a known project or a new project that needs setup.',
        },
      },
      required: [],
    },
  },
  {
    name: 'get_project_summary',
    description:
      'Get detailed information about a specific project. Includes description, tech stack, current branch, and any recorded insights.',
    inputSchema: {
      type: 'object',
      properties: {
        project: {
          type: 'string',
          description: 'Project name or partial path',
        },
      },
      required: ['project'],
    },
  },
  {
    name: 'search_projects',
    description:
      'Search across all projects for mentions of a term. Useful for finding where patterns are implemented or features exist.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search term (searches names, descriptions, tech stacks)',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'record_insight',
    description:
      'Record a cross-project insight or pattern for future reference. Use this when you discover something that could be useful in other projects.',
    inputSchema: {
      type: 'object',
      properties: {
        content: {
          type: 'string',
          description: 'The insight to record',
        },
        relatedProjects: {
          type: 'array',
          items: { type: 'string' },
          description: 'Names of related projects',
        },
      },
      required: ['content'],
    },
  },
  {
    name: 'get_project_analysis',
    description:
      'Get deep analysis of a project for CLAUDE.md generation. Returns directory structure, README content, package.json details, and key file locations. Use this when the user asks you to generate or write a CLAUDE.md for a project.',
    inputSchema: {
      type: 'object',
      properties: {
        project: {
          type: 'string',
          description: 'Project name or path',
        },
      },
      required: ['project'],
    },
  },
  // Pro tools
  {
    name: 'search_code',
    description:
      '[PRO] Search for code patterns across all your projects. Find implementations, discover how you solved similar problems before. Requires Pro license.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Code pattern or text to search for',
        },
        filePattern: {
          type: 'string',
          description: 'File pattern to search (e.g., "*.ts", "*.py"). Optional.',
        },
      },
      required: ['query'],
    },
  },
];

function loadContext(): GlobalContext | null {
  const contextPath = join(MEMORY_DIR, 'context.json');
  if (!existsSync(contextPath)) {
    return null;
  }
  try {
    return JSON.parse(readFileSync(contextPath, 'utf-8'));
  } catch {
    return null;
  }
}

function loadConfig(): MemoryConfig {
  const configPath = join(MEMORY_DIR, 'config.json');
  if (!existsSync(configPath)) {
    return DEFAULT_MEMORY_CONFIG;
  }
  try {
    return JSON.parse(readFileSync(configPath, 'utf-8'));
  } catch {
    return DEFAULT_MEMORY_CONFIG;
  }
}

function saveConfig(config: MemoryConfig): void {
  const configPath = join(MEMORY_DIR, 'config.json');
  config.lastUpdated = new Date().toISOString();
  writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
}

/**
 * Check if a directory looks like a project (has project markers)
 */
function looksLikeProject(dir: string): boolean {
  try {
    const entries = readdirSync(dir);
    return (
      entries.includes('package.json') ||
      entries.includes('Cargo.toml') ||
      entries.includes('pyproject.toml') ||
      entries.includes('go.mod') ||
      entries.includes('.git') ||
      entries.includes('requirements.txt')
    );
  } catch {
    return false;
  }
}

/**
 * Check if a path is under any of the watched directories
 */
function isUnderWatchedDir(path: string, watchedDirs: string[]): boolean {
  const normalizedPath = path.replace(/\/$/, '');
  return watchedDirs.some(watchedDir => {
    const normalizedWatched = watchedDir.replace(/\/$/, '');
    return normalizedPath.startsWith(normalizedWatched);
  });
}

/**
 * Detect the status of the current working directory
 */
function detectCurrentDirectoryStatus(cwd: string, context: GlobalContext | null, config: MemoryConfig): CurrentDirectoryStatus {
  const normalizedCwd = cwd.replace(/\/$/, '');

  // Check if it's a known project
  if (context) {
    const knownProject = context.projects.find(p =>
      normalizedCwd === p.path.replace(/\/$/, '') ||
      normalizedCwd.startsWith(p.path.replace(/\/$/, '') + '/')
    );

    if (knownProject) {
      return {
        path: cwd,
        status: 'known_project',
        projectName: knownProject.name,
        needsSetup: !knownProject.hasFiles.claudeMd,
        suggestedAction: knownProject.hasFiles.claudeMd ? 'none' : 'offer_setup',
      };
    }
  }

  // Check if it's under a watched directory
  if (config.autoDetectNewProjects && isUnderWatchedDir(cwd, config.watchedDirs)) {
    // It's under a watched dir but not a known project
    if (looksLikeProject(cwd)) {
      return {
        path: cwd,
        status: 'new_project',
        needsSetup: true,
        suggestedAction: 'offer_setup',
      };
    } else {
      // Empty or non-project directory under watched area
      return {
        path: cwd,
        status: 'new_project',
        needsSetup: true,
        suggestedAction: 'offer_setup',
      };
    }
  }

  // Not under watched directories
  if (looksLikeProject(cwd)) {
    return {
      path: cwd,
      status: 'outside_workspace',
      needsSetup: false,
      suggestedAction: 'offer_scan',
    };
  }

  return {
    path: cwd,
    status: 'not_a_project',
    needsSetup: false,
    suggestedAction: 'none',
  };
}

async function handleGetGlobalContext(cwd?: string): Promise<string> {
  const context = loadContext();
  const config = loadConfig();

  const lines: string[] = [];

  // Check for updates (cached, won't block)
  const updateResult = await checkForUpdate(CURRENT_VERSION);
  if (updateResult.updateAvailable) {
    lines.push(formatUpdateMessage(updateResult));
    lines.push('');
  }

  // If cwd is provided, check the current directory status first
  if (cwd) {
    const cwdStatus = detectCurrentDirectoryStatus(cwd, context, config);

    lines.push('# Current Directory Status');
    lines.push('');
    lines.push(`**Path:** ${cwdStatus.path}`);
    lines.push(`**Status:** ${cwdStatus.status}`);

    if (cwdStatus.projectName) {
      lines.push(`**Project:** ${cwdStatus.projectName}`);

      // Check if current project is stale
      if (context) {
        const currentStaleness = checkCurrentProjectStaleness(context, cwd);
        if (currentStaleness.isStale && currentStaleness.reason) {
          lines.push(`**⚠️ Stale:** ${currentStaleness.reason}`);
        }
      }
    }

    if (cwdStatus.needsSetup) {
      lines.push(`**Needs Setup:** Yes`);
    }

    // Add actionable guidance for Claude
    if (cwdStatus.suggestedAction === 'offer_setup') {
      lines.push('');
      lines.push('> 🆕 **New Project Detected!** This directory is not yet registered.');
      lines.push('> Ask the user if they would like you to:');
      lines.push('> 1. Generate a CLAUDE.md file for this project');
      lines.push('> 2. Add this project to the memory index');
    } else if (cwdStatus.suggestedAction === 'offer_scan') {
      lines.push('');
      lines.push('> ℹ️ This looks like a project but is outside your watched directories.');
      lines.push('> You may want to run `claude-memory scan` to add it.');
    }

    lines.push('');
    lines.push('---');
    lines.push('');
  }

  if (!context) {
    lines.push('No projects scanned yet. Run `claude-memory scan` first.');
    return lines.join('\n');
  }

  // Check for stale data
  const hoursSinceUpdate = (Date.now() - new Date(context.lastUpdated).getTime()) / (1000 * 60 * 60);

  lines.push('# Your Development Environment');
  lines.push('');
  lines.push(`Last scanned: ${new Date(context.lastUpdated).toLocaleString()} | claude-memory v${CURRENT_VERSION}`);

  // Run detailed staleness check
  const stalenessReport = detectStaleProjects(context);

  // Add staleness warnings if needed
  if (stalenessReport.staleProjects.length > 0) {
    lines.push('');
    lines.push(formatStalenessForMcp(stalenessReport));
  } else if (hoursSinceUpdate > 24) {
    lines.push('');
    lines.push(`> ⚠️ **Data may be stale** (${Math.floor(hoursSinceUpdate)} hours old). Run \`claude-memory scan\` to refresh.`);
  }
  lines.push('');
  lines.push('## Active Projects');
  lines.push('');

  // Sort by activity
  const sorted = [...context.projects].sort(
    (a, b) => new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime()
  );

  for (const p of sorted) {
    const dirty = p.isDirty ? ' ⚠️' : '';
    lines.push(`### ${p.name}${dirty}`);
    lines.push(`- **Path:** ${p.path}`);
    lines.push(`- **Stack:** ${p.techStack.join(', ')}`);
    lines.push(`- **Branch:** ${p.currentBranch}`);
    lines.push(`- **Description:** ${p.description}`);
    lines.push('');
  }

  // Add config info
  if (config.watchedDirs.length > 0) {
    lines.push('## Watched Directories');
    lines.push('');
    for (const dir of config.watchedDirs) {
      lines.push(`- ${dir}`);
    }
    lines.push('');
    lines.push(`Auto-detect new projects: ${config.autoDetectNewProjects ? 'Yes' : 'No'}`);
  }

  return lines.join('\n');
}

function handleGetProjectSummary(projectQuery: string): string {
  const context = loadContext();
  if (!context) {
    return 'No projects scanned yet. Run `claude-memory scan` first.';
  }

  const project = context.projects.find(
    (p) =>
      p.name.toLowerCase() === projectQuery.toLowerCase() ||
      p.path.toLowerCase().includes(projectQuery.toLowerCase())
  );

  if (!project) {
    const names = context.projects.map((p) => p.name).join(', ');
    return `Project "${projectQuery}" not found. Known projects: ${names}`;
  }

  return [
    `# ${project.name}`,
    '',
    `**Path:** ${project.path}`,
    `**Language:** ${project.language}`,
    `**Tech Stack:** ${project.techStack.join(', ')}`,
    `**Branch:** ${project.currentBranch}${project.isDirty ? ' (uncommitted changes)' : ''}`,
    `**Last Activity:** ${new Date(project.lastActivity).toLocaleString()}`,
    '',
    '## Description',
    project.description,
    '',
    '## Key Files',
    `- CLAUDE.md: ${project.hasFiles.claudeMd ? '✓ exists' : '✗ missing'}`,
    `- README.md: ${project.hasFiles.readme ? '✓ exists' : '✗ missing'}`,
    '',
    project.insights.length > 0
      ? ['## Insights', ...project.insights.map((i) => `- **${i.title}:** ${i.description}`)].join(
          '\n'
        )
      : '',
  ].join('\n');
}

function handleSearchProjects(query: string): string {
  const context = loadContext();
  if (!context) {
    return 'No projects scanned yet. Run `claude-memory scan` first.';
  }

  const q = query.toLowerCase();
  const matches = context.projects.filter(
    (p) =>
      p.name.toLowerCase().includes(q) ||
      p.description.toLowerCase().includes(q) ||
      p.techStack.some((t) => t.toLowerCase().includes(q))
  );

  if (matches.length === 0) {
    return `No projects match "${query}".`;
  }

  const lines = [`# Search Results for "${query}"`, ''];
  for (const p of matches) {
    lines.push(`- **${p.name}** - ${p.techStack.join(', ')}`);
    lines.push(`  ${p.description.slice(0, 100)}...`);
  }

  return lines.join('\n');
}

function handleRecordInsight(content: string, relatedProjects?: string[]): string {
  const contextPath = join(MEMORY_DIR, 'context.json');

  if (!existsSync(contextPath)) {
    return 'No context file found. Run `claude-memory scan` first.';
  }

  try {
    const context: GlobalContext = JSON.parse(readFileSync(contextPath, 'utf-8'));

    // Add the new insight
    context.insights.push({
      content,
      relatedProjects: relatedProjects || [],
      discoveredAt: new Date().toISOString(),
    });

    // Write back
    writeFileSync(contextPath, JSON.stringify(context, null, 2), 'utf-8');

    return `✅ Insight recorded: "${content.slice(0, 100)}..."${relatedProjects?.length ? ` (related to: ${relatedProjects.join(', ')})` : ''}`;
  } catch (err) {
    return `Failed to record insight: ${err instanceof Error ? err.message : 'Unknown error'}`;
  }
}

/**
 * Pro feature: Search code across all projects
 */
function handleSearchCode(query: string, filePattern?: string): string {
  // Check Pro license
  if (!isPro()) {
    return getProFeatureMessage('Cross-project code search');
  }

  const context = loadContext();
  if (!context) {
    return 'No projects scanned yet. Run `claude-memory scan` first.';
  }

  if (!query || query.trim().length === 0) {
    return 'Please provide a search query.';
  }

  // Map projects to the format expected by searchCode
  const projects = context.projects.map(p => ({
    name: p.name,
    path: p.path,
  }));

  // Perform the search
  const results = searchCode(projects, query, {
    filePattern,
    maxResults: 50,
    caseSensitive: false,
    contextLines: 1,
  });

  return formatSearchResults(results, query);
}

function handleGetProjectAnalysis(projectQuery: string): string {
  const context = loadContext();
  if (!context) {
    return 'No projects scanned yet. Run `claude-memory scan` first.';
  }

  const project = context.projects.find(
    (p) =>
      p.name.toLowerCase() === projectQuery.toLowerCase() ||
      p.path.toLowerCase().includes(projectQuery.toLowerCase())
  );

  if (!project) {
    const names = context.projects.map((p) => p.name).join(', ');
    return `Project "${projectQuery}" not found. Known projects: ${names}`;
  }

  const lines: string[] = [
    '# Project Analysis for CLAUDE.md Generation',
    '',
    `## Basic Info`,
    `- **Name:** ${project.name}`,
    `- **Path:** ${project.path}`,
    `- **Language:** ${project.language}`,
    `- **Tech Stack:** ${project.techStack.join(', ')}`,
    `- **Branch:** ${project.currentBranch}${project.isDirty ? ' (uncommitted changes)' : ''}`,
    `- **Last Activity:** ${new Date(project.lastActivity).toLocaleString()}`,
    '',
  ];

  // Directory structure
  lines.push('## Directory Structure');
  lines.push('```');
  lines.push(getDirectoryStructure(project.path, 3));
  lines.push('```');
  lines.push('');

  // README content
  const readmePath = join(project.path, 'README.md');
  if (existsSync(readmePath)) {
    try {
      const readme = readFileSync(readmePath, 'utf-8').slice(0, 3000);
      lines.push('## README.md Content');
      lines.push('```markdown');
      lines.push(readme);
      lines.push('```');
      lines.push('');
    } catch {
      // Skip if can't read
    }
  }

  // Package.json info
  const pkgPath = join(project.path, 'package.json');
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
      lines.push('## package.json');
      lines.push(`- **Name:** ${pkg.name || 'unnamed'}`);
      lines.push(`- **Description:** ${pkg.description || 'none'}`);
      if (pkg.scripts) {
        lines.push('- **Scripts:**');
        for (const [name, cmd] of Object.entries(pkg.scripts)) {
          lines.push(`  - \`${name}\`: ${cmd}`);
        }
      }
      if (pkg.dependencies) {
        lines.push(`- **Dependencies:** ${Object.keys(pkg.dependencies).join(', ')}`);
      }
      lines.push('');
    } catch {
      // Skip if can't read
    }
  }

  // Key files
  lines.push('## Key Entry Files');
  const keyPatterns = [
    'src/index.ts', 'src/index.js', 'src/main.ts', 'src/main.js',
    'src/app.ts', 'src/app.js', 'src/cli.ts', 'src/cli.js',
    'index.ts', 'index.js', 'main.ts', 'main.js',
    'main.py', 'app.py', '__main__.py',
    'src/lib.rs', 'src/main.rs', 'main.go',
  ];
  for (const pattern of keyPatterns) {
    if (existsSync(join(project.path, pattern))) {
      lines.push(`- ${pattern}`);
    }
  }
  lines.push('');

  lines.push('## Instructions');
  lines.push('Based on the above analysis, please generate a CLAUDE.md file that includes:');
  lines.push('1. Project title and one-line description');
  lines.push('2. What the project does (2-3 sentences)');
  lines.push('3. Tech stack overview');
  lines.push('4. Project structure explanation');
  lines.push('5. How to run/build');
  lines.push('6. Any important context for future Claude sessions');

  return lines.join('\n');
}

function getDirectoryStructure(dir: string, maxDepth: number, prefix = '', depth = 0): string {
  if (depth >= maxDepth) return '';

  const ignore = ['node_modules', '.git', 'dist', 'build', '__pycache__', 'target', '.next', '.nuxt', 'coverage', '.cache', '.venv', 'venv'];
  let result = '';

  try {
    const entries = readdirSync(dir).filter(e => !ignore.includes(e) && !e.startsWith('.'));
    entries.sort((a, b) => {
      const aIsDir = statSync(join(dir, a)).isDirectory();
      const bIsDir = statSync(join(dir, b)).isDirectory();
      if (aIsDir && !bIsDir) return -1;
      if (!aIsDir && bIsDir) return 1;
      return a.localeCompare(b);
    });

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      const fullPath = join(dir, entry);
      const isLast = i === entries.length - 1;
      const connector = isLast ? '└── ' : '├── ';
      const newPrefix = prefix + (isLast ? '    ' : '│   ');

      try {
        const stat = statSync(fullPath);
        if (stat.isDirectory()) {
          result += `${prefix}${connector}${entry}/\n`;
          result += getDirectoryStructure(fullPath, maxDepth, newPrefix, depth + 1);
        } else {
          result += `${prefix}${connector}${entry}\n`;
        }
      } catch {
        // Skip inaccessible
      }
    }
  } catch {
    // Skip inaccessible
  }

  return result;
}

async function main() {
  const server = new Server(
    {
      name: 'claude-memory',
      version: CURRENT_VERSION,
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // List tools
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools,
  }));

  // Handle tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      let result: string;

      switch (name) {
        case 'get_global_context':
          result = await handleGetGlobalContext((args as { cwd?: string }).cwd);
          break;
        case 'get_project_summary':
          result = handleGetProjectSummary((args as { project: string }).project);
          break;
        case 'search_projects':
          result = handleSearchProjects((args as { query: string }).query);
          break;
        case 'record_insight':
          result = handleRecordInsight(
            (args as { content: string }).content,
            (args as { relatedProjects?: string[] }).relatedProjects
          );
          break;
        case 'get_project_analysis':
          result = handleGetProjectAnalysis((args as { project: string }).project);
          break;
        case 'search_code':
          result = handleSearchCode(
            (args as { query: string }).query,
            (args as { filePattern?: string }).filePattern
          );
          break;
        default:
          throw new Error(`Unknown tool: ${name}`);
      }

      return {
        content: [{ type: 'text', text: result }],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
        isError: true,
      };
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Claude Memory MCP server running');
}

main().catch(console.error);
