import { describe, it, expect } from 'vitest';

// Test version comparison logic
function isNewerVersion(current: string, latest: string): boolean {
  const currentParts = current.split('.').map(Number);
  const latestParts = latest.split('.').map(Number);

  for (let i = 0; i < 3; i++) {
    const curr = currentParts[i] || 0;
    const lat = latestParts[i] || 0;
    if (lat > curr) return true;
    if (lat < curr) return false;
  }
  return false;
}

describe('Update Checker', () => {
  describe('version comparison', () => {
    it('should detect newer major versions', () => {
      expect(isNewerVersion('0.4.2', '1.0.0')).toBe(true);
      expect(isNewerVersion('1.0.0', '2.0.0')).toBe(true);
    });

    it('should detect newer minor versions', () => {
      expect(isNewerVersion('0.4.2', '0.5.0')).toBe(true);
      expect(isNewerVersion('0.4.2', '0.5.1')).toBe(true);
    });

    it('should detect newer patch versions', () => {
      expect(isNewerVersion('0.4.2', '0.4.3')).toBe(true);
      expect(isNewerVersion('0.4.2', '0.4.10')).toBe(true);
    });

    it('should return false for same version', () => {
      expect(isNewerVersion('0.4.2', '0.4.2')).toBe(false);
    });

    it('should return false for older versions', () => {
      expect(isNewerVersion('0.4.2', '0.4.1')).toBe(false);
      expect(isNewerVersion('0.4.2', '0.3.9')).toBe(false);
      expect(isNewerVersion('1.0.0', '0.9.9')).toBe(false);
    });

    it('should handle missing patch version', () => {
      expect(isNewerVersion('0.4', '0.4.1')).toBe(true);
      expect(isNewerVersion('0.4.1', '0.5')).toBe(true);
    });
  });
});
