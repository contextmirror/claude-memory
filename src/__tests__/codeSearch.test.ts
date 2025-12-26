import { describe, it, expect } from 'vitest';
import { formatSearchResults, SearchResult } from '../utils/codeSearch.js';

describe('Code Search', () => {
  describe('formatSearchResults', () => {
    it('should format empty results correctly', () => {
      const result = formatSearchResults([], 'test');
      expect(result).toBe('No results found for "test".');
    });

    it('should format single result correctly', () => {
      const results: SearchResult[] = [{
        project: 'my-project',
        projectPath: '/home/user/my-project',
        file: '/home/user/my-project/src/index.ts',
        relativePath: 'src/index.ts',
        line: 10,
        content: 'const test = "hello";',
        context: {
          before: 'import { something } from "./lib";',
          after: 'export default test;',
        },
      }];

      const result = formatSearchResults(results, 'test');

      expect(result).toContain('# Code Search Results for "test"');
      expect(result).toContain('Found 1 result');
      expect(result).toContain('## my-project');
      expect(result).toContain('src/index.ts:10');
      expect(result).toContain('const test = "hello";');
    });

    it('should group results by project', () => {
      const results: SearchResult[] = [
        {
          project: 'project-a',
          projectPath: '/path/a',
          file: '/path/a/file1.ts',
          relativePath: 'file1.ts',
          line: 1,
          content: 'line 1',
          context: { before: '', after: '' },
        },
        {
          project: 'project-b',
          projectPath: '/path/b',
          file: '/path/b/file2.ts',
          relativePath: 'file2.ts',
          line: 2,
          content: 'line 2',
          context: { before: '', after: '' },
        },
        {
          project: 'project-a',
          projectPath: '/path/a',
          file: '/path/a/file3.ts',
          relativePath: 'file3.ts',
          line: 3,
          content: 'line 3',
          context: { before: '', after: '' },
        },
      ];

      const result = formatSearchResults(results, 'query');

      expect(result).toContain('Found 3 results');
      expect(result).toContain('## project-a');
      expect(result).toContain('## project-b');
    });
  });
});
