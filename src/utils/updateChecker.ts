/**
 * Update checker for claude-memory
 * Checks npm registry for newer versions and caches result
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import https from 'https';

const MEMORY_DIR = join(homedir(), '.claude-memory');
const UPDATE_CACHE_FILE = join(MEMORY_DIR, 'update-check.json');
const PACKAGE_NAME = '@contextmirror/claude-memory';
const CHECK_INTERVAL_HOURS = 24;  // Check once per day

interface UpdateCache {
  lastChecked: string;
  latestVersion: string | null;
  currentVersion: string;
}

interface UpdateCheckResult {
  updateAvailable: boolean;
  currentVersion: string;
  latestVersion: string | null;
  message?: string;
}

/**
 * Fetch the latest version from npm registry
 */
function fetchLatestVersion(): Promise<string | null> {
  return new Promise((resolve) => {
    const url = `https://registry.npmjs.org/${PACKAGE_NAME}/latest`;

    const req = https.get(url, { timeout: 5000 }, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve(json.version || null);
        } catch {
          resolve(null);
        }
      });
    });

    req.on('error', () => {
      resolve(null);
    });

    req.on('timeout', () => {
      req.destroy();
      resolve(null);
    });
  });
}

/**
 * Load cached update check result
 */
function loadCache(): UpdateCache | null {
  try {
    if (existsSync(UPDATE_CACHE_FILE)) {
      return JSON.parse(readFileSync(UPDATE_CACHE_FILE, 'utf-8'));
    }
  } catch {
    // Ignore errors
  }
  return null;
}

/**
 * Save update check result to cache
 */
function saveCache(cache: UpdateCache): void {
  try {
    if (!existsSync(MEMORY_DIR)) {
      mkdirSync(MEMORY_DIR, { recursive: true });
    }
    writeFileSync(UPDATE_CACHE_FILE, JSON.stringify(cache, null, 2), 'utf-8');
  } catch {
    // Ignore errors
  }
}

/**
 * Compare semantic versions
 * Returns true if latestVersion is newer than currentVersion
 */
function isNewer(currentVersion: string, latestVersion: string): boolean {
  const current = currentVersion.split('.').map(Number);
  const latest = latestVersion.split('.').map(Number);

  for (let i = 0; i < 3; i++) {
    if ((latest[i] || 0) > (current[i] || 0)) return true;
    if ((latest[i] || 0) < (current[i] || 0)) return false;
  }
  return false;
}

/**
 * Check if an update is available
 * Uses cache to avoid checking too frequently
 */
export async function checkForUpdate(currentVersion: string): Promise<UpdateCheckResult> {
  const cache = loadCache();
  const now = new Date();

  // Check if we have a recent cache
  if (cache) {
    const lastChecked = new Date(cache.lastChecked);
    const hoursSinceCheck = (now.getTime() - lastChecked.getTime()) / (1000 * 60 * 60);

    if (hoursSinceCheck < CHECK_INTERVAL_HOURS && cache.latestVersion) {
      // Use cached result
      const updateAvailable = isNewer(currentVersion, cache.latestVersion);
      return {
        updateAvailable,
        currentVersion,
        latestVersion: cache.latestVersion,
        message: updateAvailable
          ? `⬆️ Update available: v${currentVersion} → v${cache.latestVersion}`
          : undefined,
      };
    }
  }

  // Fetch fresh version info
  const latestVersion = await fetchLatestVersion();

  // Save to cache
  saveCache({
    lastChecked: now.toISOString(),
    latestVersion,
    currentVersion,
  });

  if (!latestVersion) {
    return {
      updateAvailable: false,
      currentVersion,
      latestVersion: null,
    };
  }

  const updateAvailable = isNewer(currentVersion, latestVersion);

  return {
    updateAvailable,
    currentVersion,
    latestVersion,
    message: updateAvailable
      ? `⬆️ Update available: v${currentVersion} → v${latestVersion}`
      : undefined,
  };
}

/**
 * Format update message for MCP output
 */
export function formatUpdateMessage(result: UpdateCheckResult): string {
  if (!result.updateAvailable || !result.latestVersion) {
    return '';
  }

  return [
    '',
    '---',
    '',
    `### ${result.message}`,
    '',
    'Run to update:',
    '```bash',
    'npm update -g @contextmirror/claude-memory',
    '```',
    '',
    '> After updating, restart Claude Code to use the new version.',
  ].join('\n');
}
