/**
 * Code search utility for Pro feature
 */

import { readdirSync, readFileSync, statSync } from 'fs';
import { join, extname, relative } from 'path';
import { IGNORE_DIRS } from '../constants.js';

export interface SearchResult {
  project: string;
  projectPath: string;
  file: string;
  relativePath: string;
  line: number;
  content: string;
  context: {
    before: string;
    after: string;
  };
}

export interface SearchOptions {
  filePattern?: string;
  maxResults?: number;
  caseSensitive?: boolean;
  contextLines?: number;
}

const DEFAULT_OPTIONS: SearchOptions = {
  maxResults: 50,
  caseSensitive: false,
  contextLines: 1,
};

// File extensions to search
const SEARCHABLE_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.py', '.pyw',
  '.rs',
  '.go',
  '.java', '.kt', '.scala',
  '.c', '.cpp', '.h', '.hpp',
  '.rb',
  '.php',
  '.swift',
  '.cs',
  '.vue', '.svelte',
  '.json', '.yaml', '.yml', '.toml',
  '.md', '.txt',
  '.sql',
  '.sh', '.bash', '.zsh',
  '.css', '.scss', '.sass', '.less',
  '.html', '.htm',
  '.xml',
]);

// Max file size to search (1MB)
const MAX_FILE_SIZE = 1024 * 1024;

/**
 * Check if a file should be searched based on extension
 */
function shouldSearchFile(filePath: string, filePattern?: string): boolean {
  const ext = extname(filePath).toLowerCase();

  // If a pattern is specified, use glob-like matching
  if (filePattern) {
    if (filePattern.startsWith('*.')) {
      const patternExt = filePattern.slice(1);
      return ext === patternExt;
    }
    return filePath.includes(filePattern);
  }

  return SEARCHABLE_EXTENSIONS.has(ext);
}

/**
 * Search for a pattern in a file
 */
function searchFile(
  filePath: string,
  query: string,
  options: SearchOptions
): Array<{ line: number; content: string; context: { before: string; after: string } }> {
  const results: Array<{ line: number; content: string; context: { before: string; after: string } }> = [];

  try {
    const stat = statSync(filePath);
    if (stat.size > MAX_FILE_SIZE) {
      return results;
    }

    const content = readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');

    const searchQuery = options.caseSensitive ? query : query.toLowerCase();

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const searchLine = options.caseSensitive ? line : line.toLowerCase();

      if (searchLine.includes(searchQuery)) {
        const contextLines = options.contextLines || 1;
        const beforeLines = lines.slice(Math.max(0, i - contextLines), i);
        const afterLines = lines.slice(i + 1, Math.min(lines.length, i + 1 + contextLines));

        results.push({
          line: i + 1,
          content: line.trim(),
          context: {
            before: beforeLines.join('\n'),
            after: afterLines.join('\n'),
          },
        });
      }
    }
  } catch {
    // Skip files that can't be read
  }

  return results;
}

/**
 * Recursively search a directory
 */
function searchDirectory(
  dir: string,
  query: string,
  projectName: string,
  projectPath: string,
  options: SearchOptions,
  results: SearchResult[]
): void {
  if (results.length >= (options.maxResults || DEFAULT_OPTIONS.maxResults!)) {
    return;
  }

  try {
    const entries = readdirSync(dir);

    for (const entry of entries) {
      if (results.length >= (options.maxResults || DEFAULT_OPTIONS.maxResults!)) {
        return;
      }

      if (IGNORE_DIRS.includes(entry) || entry.startsWith('.')) {
        continue;
      }

      const fullPath = join(dir, entry);

      try {
        const stat = statSync(fullPath);

        if (stat.isDirectory()) {
          searchDirectory(fullPath, query, projectName, projectPath, options, results);
        } else if (stat.isFile() && shouldSearchFile(fullPath, options.filePattern)) {
          const fileResults = searchFile(fullPath, query, options);

          for (const result of fileResults) {
            if (results.length >= (options.maxResults || DEFAULT_OPTIONS.maxResults!)) {
              return;
            }

            results.push({
              project: projectName,
              projectPath,
              file: fullPath,
              relativePath: relative(projectPath, fullPath),
              line: result.line,
              content: result.content,
              context: result.context,
            });
          }
        }
      } catch {
        // Skip inaccessible files
      }
    }
  } catch {
    // Skip inaccessible directories
  }
}

/**
 * Search for code across multiple projects
 */
export function searchCode(
  projects: Array<{ name: string; path: string }>,
  query: string,
  options: SearchOptions = {}
): SearchResult[] {
  const mergedOptions = { ...DEFAULT_OPTIONS, ...options };
  const results: SearchResult[] = [];

  for (const project of projects) {
    if (results.length >= mergedOptions.maxResults!) {
      break;
    }

    searchDirectory(
      project.path,
      query,
      project.name,
      project.path,
      mergedOptions,
      results
    );
  }

  return results;
}

/**
 * Format search results for display
 */
export function formatSearchResults(results: SearchResult[], query: string): string {
  if (results.length === 0) {
    return `No results found for "${query}".`;
  }

  const lines: string[] = [
    `# Code Search Results for "${query}"`,
    '',
    `Found ${results.length} result${results.length === 1 ? '' : 's'}:`,
    '',
  ];

  // Group by project
  const byProject = new Map<string, SearchResult[]>();
  for (const result of results) {
    const existing = byProject.get(result.project) || [];
    existing.push(result);
    byProject.set(result.project, existing);
  }

  for (const [project, projectResults] of byProject) {
    lines.push(`## ${project}`);
    lines.push('');

    for (const result of projectResults) {
      lines.push(`### ${result.relativePath}:${result.line}`);
      lines.push('```');
      if (result.context.before) {
        lines.push(result.context.before);
      }
      lines.push(`> ${result.content}`);
      if (result.context.after) {
        lines.push(result.context.after);
      }
      lines.push('```');
      lines.push('');
    }
  }

  return lines.join('\n');
}
