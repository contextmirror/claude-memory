/**
 * License management for Claude Memory Pro
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync, unlinkSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { License, LicenseStatus, LicenseValidationResult } from './types.js';
import { LEMONSQUEEZY_VALIDATE_URL } from '../constants.js';

const MEMORY_DIR = join(homedir(), '.claude-memory');
const LICENSE_PATH = join(MEMORY_DIR, 'license.json');

// License key formats:
// - LemonSqueezy: UUID format (xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)
// - Legacy: CM-XXXX-XXXX-XXXX (alphanumeric)
const LEMONSQUEEZY_KEY_PATTERN = /^[A-F0-9]{8}-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{12}$/i;
const LEGACY_KEY_PATTERN = /^CM-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/i;

/**
 * Ensure the memory directory exists
 */
function ensureMemoryDir(): void {
  if (!existsSync(MEMORY_DIR)) {
    mkdirSync(MEMORY_DIR, { recursive: true });
  }
}

/**
 * Load license from disk
 */
export function loadLicense(): License | null {
  if (!existsSync(LICENSE_PATH)) {
    return null;
  }

  try {
    const data = readFileSync(LICENSE_PATH, 'utf-8');
    return JSON.parse(data) as License;
  } catch {
    return null;
  }
}

/**
 * Save license to disk
 */
export function saveLicense(license: License): void {
  ensureMemoryDir();
  writeFileSync(LICENSE_PATH, JSON.stringify(license, null, 2), 'utf-8');
}

/**
 * Check if user has Pro license
 */
export function isPro(): boolean {
  const license = loadLicense();

  if (!license) {
    return false;
  }

  if (license.plan !== 'pro') {
    return false;
  }

  // Check expiration
  if (license.expiresAt) {
    const expiresAt = new Date(license.expiresAt);
    if (expiresAt < new Date()) {
      return false;
    }
  }

  return true;
}

/**
 * Check if key is LemonSqueezy format
 */
export function isLemonSqueezyKey(key: string): boolean {
  return LEMONSQUEEZY_KEY_PATTERN.test(key);
}

/**
 * Validate a license key format (accepts both LemonSqueezy and legacy formats)
 */
export function validateKeyFormat(key: string): boolean {
  return LEMONSQUEEZY_KEY_PATTERN.test(key) || LEGACY_KEY_PATTERN.test(key);
}

/**
 * Validate license key with LemonSqueezy API
 */
async function validateWithLemonSqueezy(key: string): Promise<{
  valid: boolean;
  error?: string;
  email?: string;
}> {
  try {
    const response = await fetch(LEMONSQUEEZY_VALIDATE_URL, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        license_key: key,
      }),
    });

    const data = await response.json();

    if (data.valid) {
      return {
        valid: true,
        email: data.meta?.customer_email,
      };
    } else {
      return {
        valid: false,
        error: data.error || 'License key is not valid',
      };
    }
  } catch (err) {
    // Network error - allow offline activation with warning
    return {
      valid: true, // Allow offline - will revalidate later
      error: 'Could not reach license server. Activating offline.',
    };
  }
}

/**
 * Activate a license key
 *
 * For LemonSqueezy keys: Validates against their API
 * For legacy keys: Format check only (backwards compatibility)
 */
export async function activateLicense(key: string): Promise<LicenseValidationResult> {
  // Normalize key (LemonSqueezy keys are uppercase hex)
  const normalizedKey = key.toUpperCase();

  // Validate format
  if (!validateKeyFormat(normalizedKey)) {
    return {
      valid: false,
      error: 'Invalid license key format. Get your key from https://contextmirror.lemonsqueezy.com',
    };
  }

  let email: string | undefined;

  // Validate LemonSqueezy keys with their API
  if (isLemonSqueezyKey(normalizedKey)) {
    const result = await validateWithLemonSqueezy(normalizedKey);

    if (!result.valid) {
      return {
        valid: false,
        error: result.error || 'License validation failed',
      };
    }

    email = result.email;

    // Show offline warning if applicable
    if (result.error) {
      console.log(`⚠️  ${result.error}`);
    }
  }

  const license: License = {
    key: normalizedKey,
    plan: 'pro',
    activatedAt: new Date().toISOString(),
    email,
    // Subscription licenses don't expire locally - LemonSqueezy handles this
  };

  saveLicense(license);

  return {
    valid: true,
    license,
  };
}

/**
 * Deactivate (remove) the current license
 */
export function deactivateLicense(): boolean {
  if (!existsSync(LICENSE_PATH)) {
    return false;
  }

  try {
    unlinkSync(LICENSE_PATH);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get current license status
 */
export function getLicenseStatus(): LicenseStatus {
  const license = loadLicense();

  if (!license) {
    return {
      isPro: false,
      plan: 'free',
    };
  }

  let daysRemaining: number | undefined;
  let isExpired = false;

  if (license.expiresAt) {
    const expiresAt = new Date(license.expiresAt);
    const now = new Date();
    const diffMs = expiresAt.getTime() - now.getTime();
    daysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    isExpired = daysRemaining < 0;
  }

  return {
    isPro: license.plan === 'pro' && !isExpired,
    plan: isExpired ? 'free' : license.plan,
    email: license.email,
    expiresAt: license.expiresAt,
    daysRemaining: daysRemaining && daysRemaining > 0 ? daysRemaining : undefined,
    activatedAt: license.activatedAt,
  };
}

/**
 * Get a user-friendly error message for Pro features
 */
export function getProFeatureMessage(featureName: string): string {
  return `${featureName} is a Pro feature.

Upgrade at https://contextmirror.lemonsqueezy.com or activate your license:
  claude-memory activate <your-key>`;
}
