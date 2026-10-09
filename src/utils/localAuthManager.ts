import { UserProfile, ClaimRecord, TemplateConfig } from '../types';
import { formatPfNumber } from './pfHelper';

const STORAGE_KEYS = {
  ACCOUNTS: 'ot_local_auth_accounts_v2',
  SESSION: 'ot_current_session_v2',
  ACTIVE_USER_ID: 'ot_active_user_id',
  CLAIMS_PREFIX: 'ot_user_claims_',
  TEMPLATES_PREFIX: 'ot_user_templates_',
};

export interface StoredAccount extends UserProfile {
  passwordHash?: string;
}

export const DEFAULT_STORED_ACCOUNTS: StoredAccount[] = [
  {
    id: 'usr_pf123456',
    name: 'Kasun Fernando',
    email: 'kasun.fernando@company.com',
    role: 'user',
    claimType: 'OT',
    employeeNumber: 'PF123456',
    pfNumber: 'PF123456',
    passwordHash: 'PF123456',
    designation: 'Technical Officer',
    branch: 'Head Office',
    department: 'IT & Infrastructure Operations',
    maxOtHoursPerDay: 2.0,
    hourlyRate: 1850,
    daysPay: 12500,
    assignedTemplateIds: ['standard-official-template-v1'],
    isFirstLogin: false,
    mustChangePassword: false,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'usr_pf654321',
    name: 'Nalaka Bandara',
    email: 'nalaka.bandara@company.com',
    role: 'user',
    claimType: 'OT',
    employeeNumber: 'PF654321',
    pfNumber: 'PF654321',
    passwordHash: 'PF654321',
    designation: 'Senior Systems Engineer',
    branch: 'Head Office',
    department: 'Network Operations',
    maxOtHoursPerDay: 2.0,
    hourlyRate: 2100,
    daysPay: 14000,
    assignedTemplateIds: ['standard-official-template-v1'],
    isFirstLogin: false,
    mustChangePassword: false,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'usr_admin_bootstrap',
    name: 'System Administrator',
    email: 'dasundularaka@gmail.com',
    role: 'admin',
    claimType: 'OT',
    employeeNumber: 'PF100000',
    pfNumber: 'PF100000',
    passwordHash: 'PF100000',
    designation: 'Lead Systems Administrator',
    branch: 'Head Office',
    department: 'IT & Infrastructure Operations',
    maxOtHoursPerDay: 2.0,
    hourlyRate: 2500,
    daysPay: 16000,
    assignedTemplateIds: ['standard-official-template-v1'],
    isFirstLogin: false,
    mustChangePassword: false,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
];

/**
 * Reads all locally stored accounts. Seeds default accounts if empty.
 */
export function getStoredAccounts(): StoredAccount[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.ACCOUNTS);
    if (!raw) {
      localStorage.setItem(STORAGE_KEYS.ACCOUNTS, JSON.stringify(DEFAULT_STORED_ACCOUNTS));
      return DEFAULT_STORED_ACCOUNTS;
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      localStorage.setItem(STORAGE_KEYS.ACCOUNTS, JSON.stringify(DEFAULT_STORED_ACCOUNTS));
      return DEFAULT_STORED_ACCOUNTS;
    }

    // Ensure seed PF123456 and bootstrap admin are always available if missing
    let modified = false;
    for (const def of DEFAULT_STORED_ACCOUNTS) {
      const exists = parsed.some(
        a =>
          a.id === def.id ||
          formatPfNumber(a.employeeNumber) === def.employeeNumber ||
          (def.email && a.email?.toLowerCase() === def.email.toLowerCase())
      );
      if (!exists) {
        parsed.push(def);
        modified = true;
      }
    }

    if (modified) {
      localStorage.setItem(STORAGE_KEYS.ACCOUNTS, JSON.stringify(parsed));
    }

    return parsed;
  } catch (e) {
    console.warn('Failed to read local accounts', e);
    return DEFAULT_STORED_ACCOUNTS;
  }
}

/**
 * Upserts a local account
 */
export function upsertStoredAccount(account: StoredAccount): void {
  try {
    const accounts = getStoredAccounts();
    const cleanPf = formatPfNumber(account.employeeNumber || account.pfNumber || '');
    const updatedAccount: StoredAccount = {
      ...account,
      employeeNumber: cleanPf || account.employeeNumber,
      pfNumber: cleanPf || account.pfNumber,
      updatedAt: new Date().toISOString(),
    };

    const idx = accounts.findIndex(
      a =>
        a.id === account.id ||
        (cleanPf && (formatPfNumber(a.employeeNumber) === cleanPf || formatPfNumber(a.pfNumber || '') === cleanPf)) ||
        (account.email && a.email?.toLowerCase() === account.email.toLowerCase())
    );

    if (idx >= 0) {
      accounts[idx] = {
        ...accounts[idx],
        ...updatedAccount,
        passwordHash: account.passwordHash || accounts[idx].passwordHash,
      };
    } else {
      accounts.push(updatedAccount);
    }

    localStorage.setItem(STORAGE_KEYS.ACCOUNTS, JSON.stringify(accounts));
  } catch (e) {
    console.warn('Failed to save local account', e);
  }
}

/**
 * Finds a stored account by PF Number or Email with flexible matching:
 * Supports PF123456, 123456, pf123456, PF-123456, or Email.
 */
export function findStoredAccount(identifier: string): StoredAccount | null {
  const clean = identifier.trim();
  if (!clean) return null;
  const accounts = getStoredAccounts();

  // 1. Direct Email match
  if (clean.includes('@')) {
    const emailLower = clean.toLowerCase();
    return accounts.find(a => a.email && a.email.toLowerCase() === emailLower) || null;
  }

  // 2. PF Number variations
  const cleanPf = formatPfNumber(clean);
  const rawDigits = clean.replace(/\D/g, '');
  const cleanUpper = clean.toUpperCase();

  return (
    accounts.find(a => {
      const aPf = formatPfNumber(a.employeeNumber || a.pfNumber || '');
      const aDigits = (a.employeeNumber || a.pfNumber || '').replace(/\D/g, '');
      const aUpper = (a.employeeNumber || '').toUpperCase();

      // Check formatted PF (e.g. PF123456)
      if (cleanPf && aPf === cleanPf) return true;
      // Check 6-digit match (e.g. 123456 matches PF123456)
      if (rawDigits.length >= 4 && aDigits.length >= 4 && aDigits.slice(-6) === rawDigits.slice(-6)) return true;
      // Check exact raw uppercase (e.g. EMP-0001)
      if (aUpper === cleanUpper) return true;
      // Check secondary pfNumber field
      if (a.pfNumber && a.pfNumber.toUpperCase() === cleanUpper) return true;
      return false;
    }) || null
  );
}

/**
 * Verifies a password for a stored account.
 * Supports exact match, stored hash, default PF Number (e.g. PF123456 or 123456), or demo fallbacks.
 */
export function verifyAccountPassword(account: StoredAccount, passwordGuess: string): boolean {
  if (!passwordGuess) return false;
  const cleanGuess = passwordGuess.trim();
  const pf = formatPfNumber(account.employeeNumber || account.pfNumber || '');
  const guessDigits = cleanGuess.replace(/\D/g, '');
  const pfDigits = (account.employeeNumber || account.pfNumber || '').replace(/\D/g, '');

  // 1. Direct password match with stored hash / password
  if (account.passwordHash && account.passwordHash === cleanGuess) {
    return true;
  }
  if (account.passwordHash && account.passwordHash.toLowerCase() === cleanGuess.toLowerCase()) {
    return true;
  }

  // 2. Default initial password is PF Number (e.g. PF123456 or 123456)
  if (pf && cleanGuess.toUpperCase() === pf) {
    return true;
  }
  if (guessDigits.length >= 6 && pfDigits.length >= 6 && guessDigits.slice(-6) === pfDigits.slice(-6)) {
    return true;
  }

  // 3. Fallback check on case-insensitive employeeNumber or standard demo passwords
  if (cleanGuess.toUpperCase() === (account.employeeNumber || '').toUpperCase()) {
    return true;
  }
  if (cleanGuess === 'password123' || cleanGuess === 'admin123' || cleanGuess === '123456') {
    return true;
  }

  return false;
}

/**
 * Active Session Management
 */
export function getActiveSession(): UserProfile | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.SESSION);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function setActiveSession(profile: UserProfile): void {
  try {
    localStorage.setItem(STORAGE_KEYS.SESSION, JSON.stringify(profile));
    localStorage.setItem('ot_active_user_id', profile.id);
  } catch (e) {
    console.warn('Could not save session', e);
  }
}

export function clearActiveSession(): void {
  try {
    localStorage.removeItem(STORAGE_KEYS.SESSION);
    localStorage.removeItem('ot_active_user_id');
  } catch (e) {
    console.warn('Could not clear session', e);
  }
}

/**
 * User-Scoped Data Helpers
 * Ensure each logged in user has their claims isolated
 */
export function getUserClaims(userId: string): ClaimRecord[] {
  try {
    const raw = localStorage.getItem(`${STORAGE_KEYS.CLAIMS_PREFIX}${userId}`);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function saveUserClaim(userId: string, claim: ClaimRecord): ClaimRecord[] {
  try {
    const claims = getUserClaims(userId);
    const idx = claims.findIndex(c => c.id === claim.id);
    let updated: ClaimRecord[];
    if (idx >= 0) {
      updated = [...claims];
      updated[idx] = { ...claim, updatedAt: new Date().toISOString() };
    } else {
      updated = [{ ...claim, updatedAt: new Date().toISOString() }, ...claims];
    }
    localStorage.setItem(`${STORAGE_KEYS.CLAIMS_PREFIX}${userId}`, JSON.stringify(updated));
    return updated;
  } catch {
    return [];
  }
}
