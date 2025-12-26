/**
 * Staleness detection for claude-memory
 * Detects which projects need rescanning based on age and git activity
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { GlobalContext, ProjectInfo } from '../types/index.js';

export interface StaleProject {
  name: string;
  path: string;
  daysSinceScanned: number;
  reason: 'age' | 'git_activity' | 'file_changed' | 'never_scanned';
  details?: string;
}

export interface StalenessReport {
  /** Overall data age in hours */
  dataAgeHours: number;

  /** Projects that need rescanning */
  staleProjects: StaleProject[];

  /** Projects that are fresh */
  freshCount: number;

  /** Human-readable summary */
  summary: string;

  /** Suggested CLI command */
  suggestion?: string;
}

/** Thresholds for staleness (in days) */
const STALENESS_THRESHOLDS = {
  WARNING: 3,    // Yellow warning
  STALE: 7,      // Orange warning
  CRITICAL: 14,  // Red warning
};

/**
 * Check if a project has new git commits since last scan
 */
function hasNewCommits(projectPath: string, lastScanned: string): boolean {
  try {
    const gitDir = path.join(projectPath, '.git');
    if (!fs.existsSync(gitDir)) return false;

    // Get latest commit date
    const result = execSync(
      'git log -1 --format=%cI 2>/dev/null || echo ""',
      { cwd: projectPath, timeout: 5000, encoding: 'utf-8' }
    ).trim();

    if (!result) return false;

    const lastCommitDate = new Date(result);
    const lastScannedDate = new Date(lastScanned);

    return lastCommitDate > lastScannedDate;
  } catch {
    return false;
  }
}

/**
 * Check if key project files have been modified since last scan
 */
function hasModifiedFiles(projectPath: string, lastScanned: string): boolean {
  const keyFiles = [
    'package.json',
    'CLAUDE.md',
    'README.md',
    'Cargo.toml',
    'pyproject.toml',
    'go.mod',
  ];

  const lastScannedTime = new Date(lastScanned).getTime();

  for (const file of keyFiles) {
    try {
      const filePath = path.join(projectPath, file);
      if (fs.existsSync(filePath)) {
        const stat = fs.statSync(filePath);
        if (stat.mtimeMs > lastScannedTime) {
          return true;
        }
      }
    } catch {
      // Ignore errors
    }
  }

  return false;
}

/**
 * Analyze a single project for staleness
 */
function analyzeProjectStaleness(project: ProjectInfo): StaleProject | null {
  const now = new Date();
  const lastScanned = new Date(project.lastScanned);
  const daysSinceScanned = Math.floor(
    (now.getTime() - lastScanned.getTime()) / (1000 * 60 * 60 * 24)
  );

  // Check for git activity first (most reliable signal)
  if (hasNewCommits(project.path, project.lastScanned)) {
    return {
      name: project.name,
      path: project.path,
      daysSinceScanned,
      reason: 'git_activity',
      details: 'New commits since last scan',
    };
  }

  // Check for modified key files
  if (hasModifiedFiles(project.path, project.lastScanned)) {
    return {
      name: project.name,
      path: project.path,
      daysSinceScanned,
      reason: 'file_changed',
      details: 'Key files modified since last scan',
    };
  }

  // Check age threshold
  if (daysSinceScanned >= STALENESS_THRESHOLDS.STALE) {
    return {
      name: project.name,
      path: project.path,
      daysSinceScanned,
      reason: 'age',
      details: `Not scanned in ${daysSinceScanned} days`,
    };
  }

  return null;
}

/**
 * Detect all stale projects in the global context
 */
export function detectStaleProjects(context: GlobalContext): StalenessReport {
  const now = new Date();
  const lastUpdated = new Date(context.lastUpdated);
  const dataAgeHours = Math.floor(
    (now.getTime() - lastUpdated.getTime()) / (1000 * 60 * 60)
  );

  const staleProjects: StaleProject[] = [];

  for (const project of context.projects) {
    const staleness = analyzeProjectStaleness(project);
    if (staleness) {
      staleProjects.push(staleness);
    }
  }

  // Sort by days since scanned (most stale first)
  staleProjects.sort((a, b) => b.daysSinceScanned - a.daysSinceScanned);

  const freshCount = context.projects.length - staleProjects.length;

  // Generate summary
  let summary: string;
  let suggestion: string | undefined;

  if (staleProjects.length === 0) {
    summary = `All ${context.projects.length} projects are up to date.`;
  } else if (staleProjects.length === 1) {
    const p = staleProjects[0];
    summary = `1 project needs updating: ${p.name} (${p.details})`;
    suggestion = `claude-memory scan --quick`;
  } else {
    const critical = staleProjects.filter(
      p => p.daysSinceScanned >= STALENESS_THRESHOLDS.CRITICAL
    );
    if (critical.length > 0) {
      summary = `⚠️ ${staleProjects.length} projects need updating (${critical.length} critical)`;
    } else {
      summary = `${staleProjects.length} projects could use a refresh`;
    }
    suggestion = `claude-memory scan --quick`;
  }

  return {
    dataAgeHours,
    staleProjects,
    freshCount,
    summary,
    suggestion,
  };
}

/**
 * Get a quick staleness check for the current working directory
 */
export function checkCurrentProjectStaleness(
  context: GlobalContext,
  cwd: string
): { isStale: boolean; project?: ProjectInfo; reason?: string } {
  // Find the project that matches the cwd
  const project = context.projects.find(p =>
    cwd.startsWith(p.path) || p.path.startsWith(cwd)
  );

  if (!project) {
    return { isStale: false };
  }

  const staleness = analyzeProjectStaleness(project);

  if (staleness) {
    return {
      isStale: true,
      project,
      reason: staleness.details,
    };
  }

  return { isStale: false, project };
}

/**
 * Format staleness report for MCP output
 */
export function formatStalenessForMcp(report: StalenessReport): string {
  const lines: string[] = [];

  if (report.staleProjects.length === 0) {
    return '';  // Don't add noise if everything is fresh
  }

  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('### 🔄 Data Freshness');
  lines.push('');
  lines.push(report.summary);

  if (report.staleProjects.length > 0 && report.staleProjects.length <= 5) {
    lines.push('');
    for (const p of report.staleProjects) {
      const icon = p.reason === 'git_activity' ? '📝' :
                   p.reason === 'file_changed' ? '📄' : '⏰';
      lines.push(`- ${icon} **${p.name}**: ${p.details}`);
    }
  } else if (report.staleProjects.length > 5) {
    lines.push('');
    lines.push(`Stale projects: ${report.staleProjects.map(p => p.name).join(', ')}`);
  }

  if (report.suggestion) {
    lines.push('');
    lines.push(`> Run \`${report.suggestion}\` to refresh`);
  }

  return lines.join('\n');
}
