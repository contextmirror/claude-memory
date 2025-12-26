/**
 * Core types for Claude Memory
 */

/** Current schema version - increment when making breaking changes */
export const SCHEMA_VERSION = 1;

export interface ProjectInfo {
  /** Absolute path to project root */
  path: string;

  /** Project name (from package.json, Cargo.toml, or folder name) */
  name: string;

  /** Short description (from package.json, README first line, etc.) */
  description: string;

  /** Detected tech stack */
  techStack: string[];

  /** Primary language */
  language: 'typescript' | 'javascript' | 'python' | 'rust' | 'go' | 'other';

  /** Last git commit date */
  lastActivity: string;

  /** Current git branch */
  currentBranch: string;

  /** Has uncommitted changes */
  isDirty: boolean;

  /** Key files that exist */
  hasFiles: {
    claudeMd: boolean;
    readme: boolean;
    packageJson: boolean;
    gitignore: boolean;
  };

  /** Extracted insights (patterns, conventions, notable things) */
  insights: ProjectInsight[];

  /** When this project was last scanned */
  lastScanned: string;
}

export interface ProjectInsight {
  /** What kind of insight */
  type: 'pattern' | 'convention' | 'architecture' | 'notable' | 'todo';

  /** Short title */
  title: string;

  /** Description */
  description: string;

  /** Source file (if applicable) */
  source?: string;

  /** When discovered */
  discoveredAt: string;
}

export interface GlobalContext {
  /** Schema version for migration support */
  schemaVersion: number;

  /** When the global context was last updated */
  lastUpdated: string;

  /** All scanned projects */
  projects: ProjectInfo[];

  /** Cross-project insights (preserved across rescans) */
  insights: GlobalInsight[];

  /** User preferences/patterns observed */
  userPatterns: UserPattern[];

  /** Projects to exclude from scanning (by path) */
  excludedProjects?: string[];
}

export interface GlobalInsight {
  /** Insight content */
  content: string;

  /** Which projects this relates to */
  relatedProjects: string[];

  /** When discovered */
  discoveredAt: string;
}

export interface UserPattern {
  /** Pattern name */
  name: string;

  /** Description */
  description: string;

  /** Examples from projects */
  examples: Array<{
    project: string;
    file: string;
    snippet?: string;
  }>;
}

export interface ScanOptions {
  /** Root directory to scan (default: ~/Projects) */
  rootDir: string;

  /** Max depth to search for projects */
  maxDepth: number;

  /** Patterns to ignore */
  ignore: string[];

  /** Whether to generate CLAUDE.md files */
  generateClaudeMd: boolean;

  /** Whether to overwrite existing CLAUDE.md */
  overwriteClaudeMd: boolean;
}

/**
 * Get a sensible default projects directory
 * Checks common locations, doesn't fall back to home
 */
function getDefaultProjectsDir(): string {
  const home = process.env.HOME || '';
  if (!home) return './projects';

  const candidates = [
    `${home}/Projects`,
    `${home}/Project`,
    `${home}/projects`,
    `${home}/Code`,
    `${home}/code`,
    `${home}/dev`,
  ];

  // Import fs dynamically to avoid issues
  try {
    const fs = require('fs');
    for (const dir of candidates) {
      if (fs.existsSync(dir)) {
        return dir;
      }
    }
  } catch {
    // fs not available, use first candidate
  }

  // Default to ~/Projects (most common convention)
  return `${home}/Projects`;
}

export const DEFAULT_SCAN_OPTIONS: ScanOptions = {
  rootDir: getDefaultProjectsDir(),
  maxDepth: 2,
  ignore: ['node_modules', '.git', 'dist', 'build', '__pycache__', 'target', '.venv', 'venv', 'coverage', '.next'],
  generateClaudeMd: false,
  overwriteClaudeMd: false,
};

/**
 * Configuration for claude-memory behavior
 */
export interface MemoryConfig {
  /** Directories to watch for new projects */
  watchedDirs: string[];

  /** Whether to auto-detect new projects in watched dirs */
  autoDetectNewProjects: boolean;

  /** Whether to prompt for CLAUDE.md generation on new projects */
  promptForClaudeMd: boolean;

  /** When config was last updated */
  lastUpdated: string;
}

export const DEFAULT_MEMORY_CONFIG: MemoryConfig = {
  watchedDirs: [],
  autoDetectNewProjects: true,
  promptForClaudeMd: true,
  lastUpdated: new Date().toISOString(),
};

/**
 * Status of the current working directory
 */
export interface CurrentDirectoryStatus {
  /** The path being checked */
  path: string;

  /** Status of this directory */
  status: 'known_project' | 'new_project' | 'outside_workspace' | 'not_a_project';

  /** Project name if it's a known project */
  projectName?: string;

  /** Whether this directory needs setup */
  needsSetup?: boolean;

  /** Suggested action for Claude to take */
  suggestedAction?: 'none' | 'offer_setup' | 'offer_scan';
}

