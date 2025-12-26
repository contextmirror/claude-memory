/**
 * Briefing Generator - Deep project analysis for CLAUDE.md generation
 *
 * This is the core value-add of claude-memory Pro.
 * Free: Basic template-based CLAUDE.md
 * Pro: AI-enhanced deep analysis (future)
 */

import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join, basename, extname, relative } from 'path';
import { simpleGit } from 'simple-git';

export interface BriefingOptions {
  projectPath: string;
  includeFileContents?: boolean;  // For Pro: include key file snippets
  maxDepth?: number;
}

export interface ProjectBriefing {
  name: string;
  description: string;
  language: string;
  techStack: string[];
  structure: DirectoryNode;
  entryPoints: EntryPoint[];
  patterns: DetectedPattern[];
  dependencies: DependencyInfo[];
  gitInfo: GitInfo;
  keyFiles: KeyFile[];
  recentActivity: RecentChange[];
}

interface DirectoryNode {
  name: string;
  type: 'file' | 'directory';
  children?: DirectoryNode[];
  description?: string;  // Auto-detected purpose
}

interface EntryPoint {
  file: string;
  type: 'main' | 'cli' | 'server' | 'test' | 'config';
  description: string;
}

interface DetectedPattern {
  name: string;
  description: string;
  evidence: string[];
}

interface DependencyInfo {
  name: string;
  version: string;
  purpose: string;  // What it's used for
  isDev: boolean;
}

interface GitInfo {
  branch: string;
  isDirty: boolean;
  recentCommits: string[];
  contributors: string[];
}

interface KeyFile {
  path: string;
  purpose: string;
  summary?: string;
}

interface RecentChange {
  file: string;
  type: 'added' | 'modified' | 'deleted';
  when: string;
}

// Well-known file purposes
const FILE_PURPOSES: Record<string, string> = {
  'package.json': 'Node.js project config and dependencies',
  'tsconfig.json': 'TypeScript compiler configuration',
  'Cargo.toml': 'Rust project config and dependencies',
  'pyproject.toml': 'Python project config (PEP 518)',
  'requirements.txt': 'Python dependencies',
  'go.mod': 'Go module dependencies',
  '.env': 'Environment variables (DO NOT COMMIT)',
  '.env.example': 'Environment variable template',
  '.gitignore': 'Git ignore patterns',
  'Dockerfile': 'Docker container definition',
  'docker-compose.yml': 'Multi-container Docker setup',
  'README.md': 'Project documentation',
  'CLAUDE.md': 'AI assistant context',
  'LICENSE': 'License terms',
  '.eslintrc.js': 'ESLint configuration',
  '.prettierrc': 'Prettier configuration',
  'jest.config.js': 'Jest test configuration',
  'vitest.config.ts': 'Vitest test configuration',
  'vite.config.ts': 'Vite bundler configuration',
  'webpack.config.js': 'Webpack bundler configuration',
  'tailwind.config.js': 'Tailwind CSS configuration',
};

// Well-known directory purposes
const DIR_PURPOSES: Record<string, string> = {
  'src': 'Source code',
  'lib': 'Library code',
  'dist': 'Built/compiled output',
  'build': 'Build output',
  'test': 'Test files',
  'tests': 'Test files',
  '__tests__': 'Jest test files',
  'spec': 'Test specifications',
  'docs': 'Documentation',
  'scripts': 'Build/utility scripts',
  'config': 'Configuration files',
  'public': 'Static public assets',
  'assets': 'Static assets',
  'static': 'Static files',
  'components': 'UI components',
  'pages': 'Page components/routes',
  'api': 'API endpoints',
  'routes': 'Route handlers',
  'controllers': 'Controller logic',
  'models': 'Data models',
  'services': 'Business logic services',
  'utils': 'Utility functions',
  'helpers': 'Helper functions',
  'hooks': 'React/framework hooks',
  'types': 'TypeScript type definitions',
  'interfaces': 'Interface definitions',
  'middleware': 'Middleware functions',
  'migrations': 'Database migrations',
  'seeds': 'Database seed data',
  'fixtures': 'Test fixtures',
  'mocks': 'Mock data/functions',
};

// Dependency purposes (common packages)
const DEP_PURPOSES: Record<string, string> = {
  'react': 'UI component library',
  'react-dom': 'React DOM rendering',
  'vue': 'Vue.js framework',
  'next': 'Next.js React framework',
  'nuxt': 'Nuxt.js Vue framework',
  'express': 'Node.js web server',
  'fastify': 'Fast Node.js web server',
  'koa': 'Koa web framework',
  'typescript': 'TypeScript compiler',
  'vite': 'Fast build tool',
  'webpack': 'Module bundler',
  'esbuild': 'Fast JavaScript bundler',
  'jest': 'Testing framework',
  'vitest': 'Vite-native testing',
  'mocha': 'Testing framework',
  'chai': 'Assertion library',
  'prisma': 'Database ORM',
  'drizzle-orm': 'TypeScript ORM',
  'mongoose': 'MongoDB ODM',
  'sequelize': 'SQL ORM',
  'axios': 'HTTP client',
  'zod': 'Schema validation',
  'yup': 'Schema validation',
  'tailwindcss': 'Utility-first CSS',
  'styled-components': 'CSS-in-JS',
  'emotion': 'CSS-in-JS',
  '@anthropic-ai/sdk': 'Claude AI SDK',
  'openai': 'OpenAI SDK',
  '@modelcontextprotocol/sdk': 'MCP protocol SDK',
  'commander': 'CLI framework',
  'yargs': 'CLI argument parser',
  'inquirer': 'Interactive CLI prompts',
  'chalk': 'Terminal colors',
  'lodash': 'Utility functions',
  'date-fns': 'Date utilities',
  'moment': 'Date library (legacy)',
  'dayjs': 'Lightweight date library',
  'uuid': 'UUID generation',
  'dotenv': 'Environment variable loading',
  'cors': 'CORS middleware',
  'helmet': 'Security headers',
  'jsonwebtoken': 'JWT authentication',
  'bcrypt': 'Password hashing',
  'socket.io': 'Real-time websockets',
  'ws': 'WebSocket client/server',
  'redis': 'Redis client',
  'ioredis': 'Redis client',
  'pg': 'PostgreSQL client',
  'mysql2': 'MySQL client',
  'sqlite3': 'SQLite client',
  'glob': 'File pattern matching',
  'simple-git': 'Git operations',
};

/**
 * Generate a deep briefing for a project
 */
export async function generateBriefing(options: BriefingOptions): Promise<ProjectBriefing> {
  const { projectPath, maxDepth = 3 } = options;

  const name = detectName(projectPath);
  const description = detectDescription(projectPath);
  const { language, techStack } = detectStack(projectPath);
  const structure = buildStructure(projectPath, maxDepth);
  const entryPoints = detectEntryPoints(projectPath);
  const patterns = detectPatterns(projectPath);
  const dependencies = extractDependencies(projectPath);
  const gitInfo = await extractGitInfo(projectPath);
  const keyFiles = identifyKeyFiles(projectPath);
  const recentActivity = await getRecentActivity(projectPath);

  return {
    name,
    description,
    language,
    techStack,
    structure,
    entryPoints,
    patterns,
    dependencies,
    gitInfo,
    keyFiles,
    recentActivity,
  };
}

/**
 * Convert a briefing to CLAUDE.md format
 */
export function briefingToClaudeMd(briefing: ProjectBriefing): string {
  const lines: string[] = [];

  // Header
  lines.push(`# ${briefing.name}`);
  lines.push('');
  lines.push(briefing.description);
  lines.push('');

  // Tech Stack
  lines.push('## Tech Stack');
  lines.push('');
  lines.push(`- **Language:** ${briefing.language}`);
  lines.push(`- **Stack:** ${briefing.techStack.join(', ')}`);
  lines.push('');

  // Project Structure
  lines.push('## Project Structure');
  lines.push('');
  lines.push('```');
  lines.push(renderStructure(briefing.structure, ''));
  lines.push('```');
  lines.push('');

  // Entry Points
  if (briefing.entryPoints.length > 0) {
    lines.push('## Entry Points');
    lines.push('');
    for (const entry of briefing.entryPoints) {
      lines.push(`- **${entry.file}** - ${entry.description}`);
    }
    lines.push('');
  }

  // Key Files
  if (briefing.keyFiles.length > 0) {
    lines.push('## Key Files');
    lines.push('');
    for (const file of briefing.keyFiles) {
      lines.push(`- **${file.path}** - ${file.purpose}`);
    }
    lines.push('');
  }

  // Detected Patterns
  if (briefing.patterns.length > 0) {
    lines.push('## Patterns & Conventions');
    lines.push('');
    for (const pattern of briefing.patterns) {
      lines.push(`### ${pattern.name}`);
      lines.push('');
      lines.push(pattern.description);
      if (pattern.evidence.length > 0) {
        lines.push('');
        lines.push('Evidence:');
        for (const e of pattern.evidence) {
          lines.push(`- ${e}`);
        }
      }
      lines.push('');
    }
  }

  // Dependencies
  if (briefing.dependencies.length > 0) {
    lines.push('## Key Dependencies');
    lines.push('');
    lines.push('| Package | Version | Purpose |');
    lines.push('|---------|---------|---------|');
    for (const dep of briefing.dependencies.slice(0, 15)) {  // Top 15
      lines.push(`| ${dep.name} | ${dep.version} | ${dep.purpose} |`);
    }
    lines.push('');
  }

  // Git Info
  if (briefing.gitInfo.branch !== 'unknown') {
    lines.push('## Git Status');
    lines.push('');
    lines.push(`- **Branch:** ${briefing.gitInfo.branch}${briefing.gitInfo.isDirty ? ' (uncommitted changes)' : ''}`);
    if (briefing.gitInfo.recentCommits.length > 0) {
      lines.push('- **Recent commits:**');
      for (const commit of briefing.gitInfo.recentCommits.slice(0, 5)) {
        lines.push(`  - ${commit}`);
      }
    }
    lines.push('');
  }

  // Recent Activity
  if (briefing.recentActivity.length > 0) {
    lines.push('## Recent Activity');
    lines.push('');
    for (const change of briefing.recentActivity.slice(0, 10)) {
      lines.push(`- ${change.type}: ${change.file}`);
    }
    lines.push('');
  }

  // Footer
  lines.push('---');
  lines.push('');
  lines.push(`*Generated by [claude-memory](https://www.npmjs.com/package/@contextmirror/claude-memory) on ${new Date().toLocaleDateString()}*`);

  return lines.join('\n');
}

// Helper functions

function detectName(projectPath: string): string {
  const pkgPath = join(projectPath, 'package.json');
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
      if (pkg.name) return pkg.name;
    } catch {}
  }
  return basename(projectPath);
}

function detectDescription(projectPath: string): string {
  // Try package.json
  const pkgPath = join(projectPath, 'package.json');
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
      if (pkg.description) return pkg.description;
    } catch {}
  }

  // Try README first paragraph
  const readmePath = join(projectPath, 'README.md');
  if (existsSync(readmePath)) {
    try {
      const content = readFileSync(readmePath, 'utf-8');
      const lines = content.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#') && !trimmed.startsWith('!') && !trimmed.startsWith('[')) {
          return trimmed.slice(0, 200);
        }
      }
    } catch {}
  }

  return 'No description available';
}

function detectStack(projectPath: string): { language: string; techStack: string[] } {
  const techStack: string[] = [];
  let language = 'Unknown';

  const pkgPath = join(projectPath, 'package.json');
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };

      if (deps.typescript || existsSync(join(projectPath, 'tsconfig.json'))) {
        language = 'TypeScript';
        techStack.push('TypeScript');
      } else {
        language = 'JavaScript';
        techStack.push('JavaScript');
      }

      // Detect frameworks
      if (deps.react) techStack.push('React');
      if (deps.vue) techStack.push('Vue');
      if (deps.next) techStack.push('Next.js');
      if (deps.express) techStack.push('Express');
      if (deps.fastify) techStack.push('Fastify');
      if (deps['@modelcontextprotocol/sdk']) techStack.push('MCP');
    } catch {}
  }

  if (existsSync(join(projectPath, 'Cargo.toml'))) {
    language = 'Rust';
    techStack.push('Rust');
  }

  if (existsSync(join(projectPath, 'pyproject.toml')) || existsSync(join(projectPath, 'requirements.txt'))) {
    language = 'Python';
    techStack.push('Python');
  }

  if (existsSync(join(projectPath, 'go.mod'))) {
    language = 'Go';
    techStack.push('Go');
  }

  return { language, techStack };
}

function buildStructure(projectPath: string, maxDepth: number): DirectoryNode {
  const IGNORE = ['node_modules', '.git', 'dist', 'build', '__pycache__', 'target', '.next', '.nuxt', 'coverage', '.cache'];

  function walk(dir: string, depth: number): DirectoryNode {
    const name = basename(dir);
    const node: DirectoryNode = {
      name,
      type: 'directory',
      description: DIR_PURPOSES[name],
      children: [],
    };

    if (depth >= maxDepth) return node;

    try {
      const entries = readdirSync(dir).sort();
      for (const entry of entries) {
        if (IGNORE.includes(entry) || entry.startsWith('.')) continue;

        const fullPath = join(dir, entry);
        try {
          const stat = statSync(fullPath);
          if (stat.isDirectory()) {
            node.children!.push(walk(fullPath, depth + 1));
          } else {
            node.children!.push({
              name: entry,
              type: 'file',
              description: FILE_PURPOSES[entry],
            });
          }
        } catch {}
      }
    } catch {}

    return node;
  }

  return walk(projectPath, 0);
}

function renderStructure(node: DirectoryNode, indent: string): string {
  const lines: string[] = [];
  const prefix = node.type === 'directory' ? `${node.name}/` : node.name;
  const desc = node.description ? `  # ${node.description}` : '';
  lines.push(`${indent}${prefix}${desc}`);

  if (node.children) {
    for (const child of node.children) {
      lines.push(renderStructure(child, indent + '  '));
    }
  }

  return lines.join('\n');
}

function detectEntryPoints(projectPath: string): EntryPoint[] {
  const entries: EntryPoint[] = [];

  // Check package.json for main/bin
  const pkgPath = join(projectPath, 'package.json');
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));

      if (pkg.main) {
        entries.push({
          file: pkg.main,
          type: 'main',
          description: 'Main entry point',
        });
      }

      if (pkg.bin) {
        if (typeof pkg.bin === 'string') {
          entries.push({
            file: pkg.bin,
            type: 'cli',
            description: 'CLI entry point',
          });
        } else {
          for (const [name, path] of Object.entries(pkg.bin)) {
            entries.push({
              file: path as string,
              type: 'cli',
              description: `CLI command: ${name}`,
            });
          }
        }
      }

      // Check scripts for common patterns
      if (pkg.scripts) {
        if (pkg.scripts.start) {
          const match = pkg.scripts.start.match(/node\s+(\S+)/);
          if (match && !entries.find(e => e.file === match[1])) {
            entries.push({
              file: match[1],
              type: 'server',
              description: 'Server start script',
            });
          }
        }
      }
    } catch {}
  }

  // Look for common entry files
  const commonEntries = [
    { file: 'src/index.ts', type: 'main' as const, desc: 'Main source entry' },
    { file: 'src/index.js', type: 'main' as const, desc: 'Main source entry' },
    { file: 'src/main.ts', type: 'main' as const, desc: 'Main source entry' },
    { file: 'src/app.ts', type: 'server' as const, desc: 'Application entry' },
    { file: 'src/server.ts', type: 'server' as const, desc: 'Server entry' },
    { file: 'src/cli.ts', type: 'cli' as const, desc: 'CLI entry' },
    { file: 'index.ts', type: 'main' as const, desc: 'Root entry' },
    { file: 'index.js', type: 'main' as const, desc: 'Root entry' },
  ];

  for (const entry of commonEntries) {
    if (existsSync(join(projectPath, entry.file)) && !entries.find(e => e.file === entry.file)) {
      entries.push({
        file: entry.file,
        type: entry.type,
        description: entry.desc,
      });
    }
  }

  return entries;
}

function detectPatterns(projectPath: string): DetectedPattern[] {
  const patterns: DetectedPattern[] = [];

  // Check for MCP pattern
  if (existsSync(join(projectPath, 'src/mcp')) || existsSync(join(projectPath, '.mcp.json'))) {
    patterns.push({
      name: 'MCP Server',
      description: 'This project implements a Model Context Protocol server for AI assistant integration.',
      evidence: ['src/mcp/ directory exists', '.mcp.json configuration'],
    });
  }

  // Check for CLI pattern
  const pkgPath = join(projectPath, 'package.json');
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
      if (pkg.bin) {
        patterns.push({
          name: 'CLI Application',
          description: 'This project provides a command-line interface.',
          evidence: ['package.json has bin field'],
        });
      }
    } catch {}
  }

  // Check for monorepo pattern
  if (existsSync(join(projectPath, 'packages')) || existsSync(join(projectPath, 'lerna.json')) || existsSync(join(projectPath, 'pnpm-workspace.yaml'))) {
    patterns.push({
      name: 'Monorepo',
      description: 'This project uses a monorepo structure with multiple packages.',
      evidence: ['packages/ directory', 'workspace configuration'],
    });
  }

  // Check for VS Code extension
  if (existsSync(join(projectPath, '.vscode')) && existsSync(join(projectPath, 'package.json'))) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
      if (pkg.engines?.vscode) {
        patterns.push({
          name: 'VS Code Extension',
          description: 'This project is a Visual Studio Code extension.',
          evidence: ['package.json has vscode engine', '.vscode/ configuration'],
        });
      }
    } catch {}
  }

  return patterns;
}

function extractDependencies(projectPath: string): DependencyInfo[] {
  const deps: DependencyInfo[] = [];

  const pkgPath = join(projectPath, 'package.json');
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));

      for (const [name, version] of Object.entries(pkg.dependencies || {})) {
        deps.push({
          name,
          version: version as string,
          purpose: DEP_PURPOSES[name] || 'Dependency',
          isDev: false,
        });
      }

      for (const [name, version] of Object.entries(pkg.devDependencies || {})) {
        deps.push({
          name,
          version: version as string,
          purpose: DEP_PURPOSES[name] || 'Dev dependency',
          isDev: true,
        });
      }
    } catch {}
  }

  // Sort by importance (known purposes first)
  return deps.sort((a, b) => {
    const aKnown = DEP_PURPOSES[a.name] ? 0 : 1;
    const bKnown = DEP_PURPOSES[b.name] ? 0 : 1;
    return aKnown - bKnown;
  });
}

async function extractGitInfo(projectPath: string): Promise<GitInfo> {
  const info: GitInfo = {
    branch: 'unknown',
    isDirty: false,
    recentCommits: [],
    contributors: [],
  };

  if (!existsSync(join(projectPath, '.git'))) {
    return info;
  }

  try {
    const git = simpleGit(projectPath);

    const status = await git.status();
    info.branch = status.current || 'unknown';
    info.isDirty = !status.isClean();

    const log = await git.log({ maxCount: 10 });
    info.recentCommits = log.all.map(c => `${c.message.split('\n')[0]} (${c.author_name})`);

    // Get unique contributors
    const authors = new Set(log.all.map(c => c.author_name));
    info.contributors = Array.from(authors);
  } catch {}

  return info;
}

function identifyKeyFiles(projectPath: string): KeyFile[] {
  const keyFiles: KeyFile[] = [];

  for (const [file, purpose] of Object.entries(FILE_PURPOSES)) {
    if (existsSync(join(projectPath, file))) {
      keyFiles.push({ path: file, purpose });
    }
  }

  return keyFiles;
}

async function getRecentActivity(projectPath: string): Promise<RecentChange[]> {
  const changes: RecentChange[] = [];

  if (!existsSync(join(projectPath, '.git'))) {
    return changes;
  }

  try {
    const git = simpleGit(projectPath);
    const status = await git.status();

    for (const file of status.modified) {
      changes.push({ file, type: 'modified', when: 'uncommitted' });
    }
    for (const file of status.not_added) {
      changes.push({ file, type: 'added', when: 'uncommitted' });
    }
    for (const file of status.deleted) {
      changes.push({ file, type: 'deleted', when: 'uncommitted' });
    }
  } catch {}

  return changes;
}
