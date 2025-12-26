/**
 * Centralized constants for Claude Memory
 */

// Timeouts
export const GIT_TIMEOUT_MS = 10000;
export const UPDATE_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

// Staleness thresholds
export const STALE_DATA_HOURS = 24;
export const STALE_PROJECT_DAYS = 7;

// File limits
export const MAX_README_CHARS = 3000;
export const MAX_DESCRIPTION_CHARS = 200;

// URLs
export const PRODUCT_URL = 'https://claude-memory.dev';
export const DISCORD_URL = 'https://discord.gg/JBpsSFB7EQ';
export const NPM_REGISTRY_URL = 'https://registry.npmjs.org/@contextmirror/claude-memory';
export const LEMONSQUEEZY_VALIDATE_URL = 'https://api.lemonsqueezy.com/v1/licenses/validate';

// Paths
export const MEMORY_DIR_NAME = '.claude-memory';
export const CONTEXT_FILE = 'context.json';
export const CONTEXT_BACKUP_FILE = 'context.json.bak';
export const CONFIG_FILE = 'config.json';
export const LICENSE_FILE = 'license.json';
export const UPDATE_CACHE_FILE = 'update-check.json';
export const GLOBAL_CONTEXT_MD = 'global-context.md';

// Project detection patterns
export const PROJECT_MARKERS = [
  'package.json',
  'Cargo.toml',
  'pyproject.toml',
  'go.mod',
  '.git',
  'requirements.txt',
];

// Directories to ignore during scanning
export const IGNORE_DIRS = [
  'node_modules',
  '.git',
  'dist',
  'build',
  '__pycache__',
  'target',
  '.venv',
  'venv',
  'coverage',
  '.next',
  '.nuxt',
  '.cache',
];

// Exit codes
export const EXIT_SUCCESS = 0;
export const EXIT_ERROR = 1;
export const EXIT_INVALID_ARGS = 2;
