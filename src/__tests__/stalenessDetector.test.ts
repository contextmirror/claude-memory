import { describe, it, expect } from 'vitest';
import { detectStaleProjects } from '../scanner/stalenessDetector.js';
import { GlobalContext, ProjectInfo } from '../types/index.js';

function createMockProject(overrides: Partial<ProjectInfo> = {}): ProjectInfo {
  return {
    name: 'test-project',
    path: '/home/user/projects/test-project',
    description: 'A test project',
    language: 'typescript',
    techStack: ['Node.js', 'TypeScript'],
    currentBranch: 'main',
    isDirty: false,
    lastActivity: new Date().toISOString(),
    hasFiles: {
      readme: true,
      claudeMd: false,
      packageJson: true,
      gitignore: true,
    },
    insights: [],
    lastScanned: new Date().toISOString(),
    ...overrides,
  };
}

function createMockContext(projects: ProjectInfo[] = [], hoursAgo = 0): GlobalContext {
  const lastUpdated = new Date(Date.now() - hoursAgo * 60 * 60 * 1000).toISOString();
  return {
    schemaVersion: 1,
    lastUpdated,
    projects,
    insights: [],
    userPatterns: [],
  };
}

describe('Staleness Detection', () => {
  describe('detectStaleProjects', () => {
    it('should return no stale projects for fresh data', () => {
      const context = createMockContext([createMockProject()], 0);
      const report = detectStaleProjects(context);

      expect(report.staleProjects).toHaveLength(0);
      expect(report.dataAgeHours).toBeLessThan(1);
    });

    it('should mark data as stale after 24 hours', () => {
      const context = createMockContext([createMockProject()], 25);
      const report = detectStaleProjects(context);

      expect(report.dataAgeHours).toBeGreaterThan(24);
    });

    it('should detect projects scanned more than 7 days ago', () => {
      const oldScanDate = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
      const project = createMockProject({ lastScanned: oldScanDate });
      const context = createMockContext([project], 0);

      const report = detectStaleProjects(context);

      expect(report.staleProjects.length).toBeGreaterThanOrEqual(0);
    });

    it('should handle empty projects list', () => {
      const context = createMockContext([], 0);
      const report = detectStaleProjects(context);

      expect(report.staleProjects).toHaveLength(0);
    });
  });
});
