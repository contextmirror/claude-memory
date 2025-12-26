/**
 * Context Generator - Produces markdown context files
 */

import { writeFileSync, mkdirSync, existsSync, readFileSync, renameSync, unlinkSync, copyFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { ProjectInfo, GlobalContext, GlobalInsight, UserPattern, SCHEMA_VERSION } from '../types/index.js';

const MEMORY_DIR = join(homedir(), '.claude-memory');

/**
 * Load existing context from disk (if any)
 */
export function loadExistingContext(): GlobalContext | null {
  const jsonPath = join(MEMORY_DIR, 'context.json');
  if (!existsSync(jsonPath)) {
    return null;
  }
  try {
    const data = JSON.parse(readFileSync(jsonPath, 'utf-8'));
    return migrateContext(data);
  } catch {
    return null;
  }
}

/**
 * Migrate old context format to current schema
 */
function migrateContext(data: Record<string, unknown>): GlobalContext {
  const version = (data.schemaVersion as number) || 0;

  // Migration from v0 (no version) to v1
  if (version < 1) {
    // v0 didn't have schemaVersion, excludedProjects
    return {
      schemaVersion: SCHEMA_VERSION,
      lastUpdated: (data.lastUpdated as string) || new Date().toISOString(),
      projects: (data.projects as ProjectInfo[]) || [],
      insights: (data.insights as GlobalInsight[]) || [],
      userPatterns: (data.userPatterns as UserPattern[]) || [],
      excludedProjects: [],
    };
  }

  // Already current version
  return data as unknown as GlobalContext;
}

/**
 * Generate global context from scanned projects
 * Preserves existing insights and user patterns
 */
export function generateGlobalContext(projects: ProjectInfo[]): GlobalContext {
  // Load existing context to preserve insights
  const existing = loadExistingContext();

  return {
    schemaVersion: SCHEMA_VERSION,
    lastUpdated: new Date().toISOString(),
    projects,
    // Preserve existing insights and patterns!
    insights: existing?.insights || [],
    userPatterns: existing?.userPatterns || [],
    excludedProjects: existing?.excludedProjects || [],
  };
}

/**
 * Write global context to ~/.claude-memory/
 * Uses atomic write (write to temp, then rename) to prevent corruption
 * Creates backup before overwriting
 */
export function writeGlobalContext(context: GlobalContext): void {
  // Ensure directory exists
  if (!existsSync(MEMORY_DIR)) {
    mkdirSync(MEMORY_DIR, { recursive: true });
  }

  const jsonPath = join(MEMORY_DIR, 'context.json');
  const mdPath = join(MEMORY_DIR, 'global-context.md');
  const jsonTempPath = join(MEMORY_DIR, 'context.json.tmp');
  const mdTempPath = join(MEMORY_DIR, 'global-context.md.tmp');
  const jsonBackupPath = join(MEMORY_DIR, 'context.json.bak');

  try {
    // Create backup of existing context before overwriting
    if (existsSync(jsonPath)) {
      try {
        copyFileSync(jsonPath, jsonBackupPath);
      } catch {
        // Backup failed, but continue anyway
        console.warn('   ⚠️  Could not create backup');
      }
    }

    // Write to temp files first (atomic write pattern)
    const jsonContent = JSON.stringify(context, null, 2);
    writeFileSync(jsonTempPath, jsonContent, 'utf-8');

    const mdContent = formatGlobalContextMarkdown(context);
    writeFileSync(mdTempPath, mdContent, 'utf-8');

    // Verify JSON can be parsed back
    const verification = JSON.parse(readFileSync(jsonTempPath, 'utf-8'));
    if (verification.projects.length !== context.projects.length) {
      throw new Error(
        `Write verification failed: expected ${context.projects.length} projects, got ${verification.projects.length}`
      );
    }

    // Atomic rename (much safer than direct write)
    renameSync(jsonTempPath, jsonPath);
    renameSync(mdTempPath, mdPath);

    console.log(`\n📝 Written to:`);
    console.log(`   ${jsonPath} (${context.projects.length} projects)`);
    console.log(`   ${mdPath}`);
  } catch (err) {
    // Clean up temp files if they exist
    try {
      if (existsSync(jsonTempPath)) unlinkSync(jsonTempPath);
      if (existsSync(mdTempPath)) unlinkSync(mdTempPath);
    } catch {
      // Ignore cleanup errors
    }

    console.error(`\n❌ Failed to write context:`);
    console.error(`   ${err instanceof Error ? err.message : 'Unknown error'}`);
    if (existsSync(jsonBackupPath)) {
      console.error(`   💾 Backup available at: ${jsonBackupPath}`);
    }
    throw err; // Re-throw so caller knows it failed
  }
}

/**
 * Format global context as markdown
 */
function formatGlobalContextMarkdown(context: GlobalContext): string {
  const lines: string[] = [
    '# Claude Global Memory',
    '',
    `> Last updated: ${new Date(context.lastUpdated).toLocaleString()}`,
    '',
    '## Your Projects',
    '',
  ];

  // Sort by last activity (most recent first)
  const sorted = [...context.projects].sort(
    (a, b) => new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime()
  );

  for (const project of sorted) {
    const activityDate = new Date(project.lastActivity).toLocaleDateString();
    const dirty = project.isDirty ? ' ⚠️ uncommitted changes' : '';

    lines.push(`### ${project.name}`);
    lines.push('');
    lines.push(`**Path:** \`${project.path}\``);
    lines.push(`**Stack:** ${project.techStack.join(', ') || 'Unknown'}`);
    lines.push(`**Branch:** ${project.currentBranch}${dirty}`);
    lines.push(`**Last Activity:** ${activityDate}`);
    lines.push('');
    lines.push(`> ${project.description}`);
    lines.push('');

    // Key files
    const keyFiles: string[] = [];
    if (project.hasFiles.claudeMd) keyFiles.push('CLAUDE.md');
    if (project.hasFiles.readme) keyFiles.push('README.md');
    if (keyFiles.length > 0) {
      lines.push(`📄 Has: ${keyFiles.join(', ')}`);
      lines.push('');
    }

    lines.push('---');
    lines.push('');
  }

  // Summary stats
  lines.push('## Summary');
  lines.push('');
  lines.push(`- **Total Projects:** ${context.projects.length}`);

  const byLanguage = context.projects.reduce(
    (acc, p) => {
      acc[p.language] = (acc[p.language] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );
  lines.push(`- **Languages:** ${Object.entries(byLanguage).map(([l, c]) => `${l} (${c})`).join(', ')}`);

  const withClaudeMd = context.projects.filter((p) => p.hasFiles.claudeMd).length;
  lines.push(`- **With CLAUDE.md:** ${withClaudeMd}/${context.projects.length}`);

  const dirty = context.projects.filter((p) => p.isDirty).length;
  if (dirty > 0) {
    lines.push(`- **⚠️ Uncommitted Changes:** ${dirty} projects`);
  }

  return lines.join('\n');
}

/**
 * Get the memory directory path
 */
export function getMemoryDir(): string {
  return MEMORY_DIR;
}
