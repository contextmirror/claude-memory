/**
 * Project Scanner - Discovers and analyzes projects
 */

import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join, basename } from 'path';
import { simpleGit, SimpleGit } from 'simple-git';
import { ProjectInfo, ProjectInsight, ScanOptions, DEFAULT_SCAN_OPTIONS } from '../types/index.js';
import { loadExistingContext } from './contextGenerator.js';

/**
 * Extended scan options with onlyPaths support
 */
interface ExtendedScanOptions extends Partial<ScanOptions> {
  /** If provided, only scan these specific paths (for quick/incremental scan) */
  onlyPaths?: string[];
}

/**
 * Scan a directory for projects and extract information
 */
export async function scanProjects(options: ExtendedScanOptions = {}): Promise<ProjectInfo[]> {
  const opts = { ...DEFAULT_SCAN_OPTIONS, ...options };
  const projects: ProjectInfo[] = [];
  const errors: Array<{ path: string; error: string }> = [];

  // Quick mode: only scan specific paths
  if (options.onlyPaths && options.onlyPaths.length > 0) {
    console.log(`🔍 Quick scan: ${options.onlyPaths.length} project(s)...`);

    for (const projectPath of options.onlyPaths) {
      if (!existsSync(projectPath)) {
        console.warn(`  ⚠ Path not found: ${projectPath}`);
        continue;
      }

      try {
        const info = await analyzeProject(projectPath);
        if (info) {
          projects.push(info);
          console.log(`  ✓ ${info.name} (${info.language})`);
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Unknown error';
        errors.push({ path: projectPath, error: errorMsg });
        console.warn(`  ⚠ Failed: ${basename(projectPath)} - ${errorMsg}`);
      }
    }

    console.log(`\n📊 Quick scan results: ${projects.length} project(s) updated`);
    return projects;
  }

  // Full scan mode
  console.log(`🔍 Scanning ${opts.rootDir} for projects...`);

  // Verify root directory exists
  if (!existsSync(opts.rootDir)) {
    console.error(`❌ Directory does not exist: ${opts.rootDir}`);
    console.error(`   Check the path and try again.`);
    return [];
  }

  const candidates = findProjectRoots(opts.rootDir, opts.maxDepth, opts.ignore);

  if (candidates.length === 0) {
    console.log(`   No project directories found in ${opts.rootDir}`);
    console.log(`   Looking for: package.json, Cargo.toml, pyproject.toml, go.mod, or .git`);
    return [];
  }

  // Load excluded projects from existing context
  const existingContext = loadExistingContext();
  const excludedProjects = new Set(existingContext?.excludedProjects || []);

  // Filter out excluded projects
  const filteredCandidates = candidates.filter(path => {
    if (excludedProjects.has(path)) {
      console.log(`   ⊘ Skipping excluded: ${basename(path)}`);
      return false;
    }
    return true;
  });

  console.log(`   Found ${filteredCandidates.length} candidate directories\n`);
  if (excludedProjects.size > 0) {
    console.log(`   (${excludedProjects.size} excluded)\n`);
  }

  for (const projectPath of filteredCandidates) {
    try {
      const info = await analyzeProject(projectPath);
      if (info) {
        projects.push(info);
        console.log(`  ✓ ${info.name} (${info.language}) - ${info.techStack.join(', ') || 'no stack detected'}`);
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      errors.push({ path: projectPath, error: errorMsg });
      console.warn(`  ⚠ Failed: ${basename(projectPath)} - ${errorMsg}`);
    }
  }

  console.log(`\n📊 Results:`);
  console.log(`   ✅ Successfully scanned: ${projects.length}`);
  if (errors.length > 0) {
    console.log(`   ⚠️  Failed to scan: ${errors.length}`);
  }

  return projects;
}

/**
 * Find directories that look like project roots
 */
function findProjectRoots(rootDir: string, maxDepth: number, ignore: string[]): string[] {
  const roots: string[] = [];

  function walk(dir: string, depth: number) {
    if (depth > maxDepth) return;

    try {
      const entries = readdirSync(dir);

      // Check if this is a project root
      const isProject =
        entries.includes('package.json') ||
        entries.includes('Cargo.toml') ||
        entries.includes('pyproject.toml') ||
        entries.includes('go.mod') ||
        entries.includes('.git');

      if (isProject) {
        roots.push(dir);
        return; // Don't recurse into project subdirectories
      }

      // Recurse into subdirectories
      for (const entry of entries) {
        if (ignore.includes(entry)) continue;

        const fullPath = join(dir, entry);
        try {
          if (statSync(fullPath).isDirectory()) {
            walk(fullPath, depth + 1);
          }
        } catch {
          // Skip inaccessible directories
        }
      }
    } catch {
      // Skip inaccessible directories
    }
  }

  walk(rootDir, 0);
  return roots;
}

/**
 * Analyze a single project
 */
async function analyzeProject(projectPath: string): Promise<ProjectInfo | null> {
  const name = detectProjectName(projectPath);
  const description = detectDescription(projectPath);
  const { language, techStack } = detectTechStack(projectPath);

  // Git info with timeout to prevent hanging on large/slow repos
  let lastActivity = new Date().toISOString();
  let currentBranch = 'unknown';
  let isDirty = false;

  if (existsSync(join(projectPath, '.git'))) {
    try {
      // 10 second timeout for git operations
      const git: SimpleGit = simpleGit(projectPath, { timeout: { block: 10000 } });

      // Wrap in Promise.race for extra safety
      const gitOps = async () => {
        const log = await git.log({ maxCount: 1 });
        if (log.latest) {
          lastActivity = log.latest.date;
        }
        const status = await git.status();
        currentBranch = status.current || 'unknown';
        isDirty = !status.isClean();
      };

      const timeout = new Promise<void>((_, reject) =>
        setTimeout(() => reject(new Error('Git timeout')), 10000)
      );

      await Promise.race([gitOps(), timeout]);
    } catch (err) {
      // Git operations failed or timed out, use defaults
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      if (errorMsg.includes('timeout') || errorMsg.includes('Timeout')) {
        console.warn(`   ⚠️  Git timeout for ${basename(projectPath)} - using defaults`);
      }
    }
  }

  // Extract insights from CLAUDE.md if it exists
  const insights = extractInsightsFromClaudeMd(projectPath);

  return {
    path: projectPath,
    name,
    description,
    techStack,
    language,
    lastActivity,
    currentBranch,
    isDirty,
    hasFiles: {
      claudeMd: existsSync(join(projectPath, 'CLAUDE.md')),
      readme: existsSync(join(projectPath, 'README.md')),
      packageJson: existsSync(join(projectPath, 'package.json')),
      gitignore: existsSync(join(projectPath, '.gitignore')),
    },
    insights,
    lastScanned: new Date().toISOString(),
  };
}

/**
 * Detect project name from various sources
 */
function detectProjectName(projectPath: string): string {
  // Try package.json
  const pkgPath = join(projectPath, 'package.json');
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
      if (pkg.name) return pkg.name;
    } catch {
      // Invalid JSON
    }
  }

  // Try Cargo.toml
  const cargoPath = join(projectPath, 'Cargo.toml');
  if (existsSync(cargoPath)) {
    try {
      const cargo = readFileSync(cargoPath, 'utf-8');
      const match = cargo.match(/name\s*=\s*"([^"]+)"/);
      if (match) return match[1];
    } catch {
      // Read failed
    }
  }

  // Fall back to folder name
  return basename(projectPath);
}

/**
 * Detect project description
 */
function detectDescription(projectPath: string): string {
  // Try package.json
  const pkgPath = join(projectPath, 'package.json');
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
      if (pkg.description) return pkg.description;
    } catch {
      // Invalid JSON
    }
  }

  // Try README first line
  const readmePath = join(projectPath, 'README.md');
  if (existsSync(readmePath)) {
    try {
      const readme = readFileSync(readmePath, 'utf-8');
      const lines = readme.split('\n').filter((l) => l.trim() && !l.startsWith('#'));
      if (lines[0]) return lines[0].slice(0, 200);
    } catch {
      // Read failed
    }
  }

  // Try CLAUDE.md first paragraph
  const claudePath = join(projectPath, 'CLAUDE.md');
  if (existsSync(claudePath)) {
    try {
      const claude = readFileSync(claudePath, 'utf-8');
      const match = claude.match(/##\s*Project Overview\s*\n+([^\n]+)/i);
      if (match) return match[1].slice(0, 200);
    } catch {
      // Read failed
    }
  }

  return 'No description available';
}

/**
 * Detect tech stack and primary language
 */
function detectTechStack(projectPath: string): {
  language: ProjectInfo['language'];
  techStack: string[];
} {
  const techStack: string[] = [];
  let language: ProjectInfo['language'] = 'other';

  // Check package.json
  const pkgPath = join(projectPath, 'package.json');
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };

      // Detect TypeScript
      if (deps.typescript || existsSync(join(projectPath, 'tsconfig.json'))) {
        language = 'typescript';
        techStack.push('TypeScript');
      } else {
        language = 'javascript';
        techStack.push('JavaScript');
      }

      // Detect frameworks
      if (deps.react) techStack.push('React');
      if (deps.vue) techStack.push('Vue');
      if (deps.next) techStack.push('Next.js');
      if (deps.express) techStack.push('Express');
      if (deps.fastify) techStack.push('Fastify');
      if (deps['@anthropic-ai/sdk']) techStack.push('Claude SDK');
      if (deps['@modelcontextprotocol/sdk']) techStack.push('MCP');
    } catch {
      // Invalid JSON
    }
  }

  // Check Cargo.toml
  if (existsSync(join(projectPath, 'Cargo.toml'))) {
    language = 'rust';
    techStack.push('Rust');
  }

  // Check pyproject.toml or requirements.txt
  if (
    existsSync(join(projectPath, 'pyproject.toml')) ||
    existsSync(join(projectPath, 'requirements.txt'))
  ) {
    language = 'python';
    techStack.push('Python');
  }

  // Check go.mod
  if (existsSync(join(projectPath, 'go.mod'))) {
    language = 'go';
    techStack.push('Go');
  }

  return { language, techStack };
}

/**
 * Extract insights from CLAUDE.md file
 * Looks for patterns like:
 * - ## Session Context / ## Current State sections
 * - Key architectural decisions
 * - TODOs and next steps
 */
function extractInsightsFromClaudeMd(projectPath: string): ProjectInsight[] {
  const claudePath = join(projectPath, 'CLAUDE.md');
  if (!existsSync(claudePath)) {
    return [];
  }

  const insights: ProjectInsight[] = [];

  try {
    const content = readFileSync(claudePath, 'utf-8');

    // Extract "Session Context" or "Current State" sections
    const sessionMatch = content.match(/##\s*(Session Context|Current State|Where we left off)[^\n]*\n([\s\S]*?)(?=\n##|$)/i);
    if (sessionMatch) {
      insights.push({
        type: 'notable',
        title: 'Session Context',
        description: sessionMatch[2].trim().slice(0, 500),
        source: 'CLAUDE.md',
        discoveredAt: new Date().toISOString(),
      });
    }

    // Extract "What's Been Built" or similar sections
    const builtMatch = content.match(/##\s*(What's Been Built|Features|Implemented)[^\n]*\n([\s\S]*?)(?=\n##|$)/i);
    if (builtMatch) {
      insights.push({
        type: 'architecture',
        title: 'What\'s Built',
        description: builtMatch[2].trim().slice(0, 500),
        source: 'CLAUDE.md',
        discoveredAt: new Date().toISOString(),
      });
    }

    // Extract "Next Steps" or "TODO" sections
    const todoMatch = content.match(/##\s*(Next Steps|TODO|Roadmap|Immediate)[^\n]*\n([\s\S]*?)(?=\n##|$)/i);
    if (todoMatch) {
      insights.push({
        type: 'todo',
        title: 'Next Steps',
        description: todoMatch[2].trim().slice(0, 500),
        source: 'CLAUDE.md',
        discoveredAt: new Date().toISOString(),
      });
    }

    // Extract architecture/tech decisions
    const archMatch = content.match(/##\s*(Architecture|Tech Stack|Design)[^\n]*\n([\s\S]*?)(?=\n##|$)/i);
    if (archMatch) {
      insights.push({
        type: 'architecture',
        title: 'Architecture',
        description: archMatch[2].trim().slice(0, 500),
        source: 'CLAUDE.md',
        discoveredAt: new Date().toISOString(),
      });
    }

  } catch {
    // Failed to read or parse
  }

  return insights;
}
