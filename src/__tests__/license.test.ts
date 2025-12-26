import { describe, it, expect } from 'vitest';
import { validateKeyFormat, isLemonSqueezyKey } from '../license/index.js';

describe('License Key Validation', () => {
  describe('validateKeyFormat', () => {
    it('should accept valid LemonSqueezy UUID keys', () => {
      expect(validateKeyFormat('A1B2C3D4-E5F6-7890-ABCD-EF1234567890')).toBe(true);
      expect(validateKeyFormat('a1b2c3d4-e5f6-7890-abcd-ef1234567890')).toBe(true);
    });

    it('should accept valid legacy CM- keys', () => {
      expect(validateKeyFormat('CM-ABCD-1234-WXYZ')).toBe(true);
      expect(validateKeyFormat('cm-abcd-1234-wxyz')).toBe(true);
    });

    it('should reject invalid key formats', () => {
      expect(validateKeyFormat('')).toBe(false);
      expect(validateKeyFormat('invalid-key')).toBe(false);
      expect(validateKeyFormat('CM-ABC-1234-WXYZ')).toBe(false); // Wrong segment length
      expect(validateKeyFormat('12345678-1234-1234-1234-123456789')).toBe(false); // Too short
    });
  });

  describe('isLemonSqueezyKey', () => {
    it('should identify LemonSqueezy UUID keys', () => {
      expect(isLemonSqueezyKey('A1B2C3D4-E5F6-7890-ABCD-EF1234567890')).toBe(true);
    });

    it('should not identify legacy keys as LemonSqueezy', () => {
      expect(isLemonSqueezyKey('CM-ABCD-1234-WXYZ')).toBe(false);
    });
  });
});
