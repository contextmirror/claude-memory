/**
 * License types for Claude Memory Pro
 */

export interface License {
  /** License key (format: CM-XXXX-XXXX-XXXX) */
  key: string;

  /** Email associated with the license */
  email?: string;

  /** License plan */
  plan: 'free' | 'pro';

  /** When the license was activated */
  activatedAt: string;

  /** When the license expires (if applicable) */
  expiresAt?: string;
}

export interface LicenseStatus {
  /** Whether the user has Pro features */
  isPro: boolean;

  /** Current plan */
  plan: 'free' | 'pro';

  /** Email associated with license */
  email?: string;

  /** Expiration date */
  expiresAt?: string;

  /** Days remaining until expiration */
  daysRemaining?: number;

  /** When activated */
  activatedAt?: string;
}

export interface LicenseValidationResult {
  /** Whether the key is valid */
  valid: boolean;

  /** Error message if invalid */
  error?: string;

  /** License details if valid */
  license?: License;
}
