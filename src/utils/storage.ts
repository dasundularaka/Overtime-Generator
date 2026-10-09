import { AppSettings, ClaimRecord, Employee, TemplateConfig, UserProfile } from '../types';
import { DEFAULT_TEMPLATE } from './defaultTemplate';
import { getActiveSession } from './localAuthManager';

/**
 * Returns the currently authenticated user's ID to ensure complete data isolation in localStorage.
 */
export function getActiveUserId(): string {
  try {
    const directId = localStorage.getItem('ot_active_user_id');
    if (directId) return directId;
    const session = getActiveSession();
    if (session?.id) return session.id;
  } catch {}
  return 'default';
}

function getUserStorageKey(base: string, customUserId?: string): string {
  const uid = customUserId || getActiveUserId();
  return `${base}_usr_${uid}`;
}

const STORAGE_KEYS = {
  EMPLOYEES: 'ot_manager_employees_v2',
  CLAIMS: 'ot_manager_claims_v2',
  TEMPLATES: 'ot_manager_templates_v2',
  SETTINGS: 'ot_manager_settings_v2',
  DRAFT_CLAIM: 'ot_manager_draft_claim_v2',
};

const DEFAULT_SETTINGS: AppSettings = {
  defaultDepartment: 'IT & Infrastructure Operations',
  defaultBranch: 'Headquarters',
  timeFormat: '24h',
  otDisplayFormat: 'hhmm',
  defaultFont: 'Helvetica',
  pdfFilenamePattern: 'Overtime_Claim_[EmployeeName]_[Month]_[Year]',
  globalPrinterOffsetX: 0,
  globalPrinterOffsetY: 0,
  activeTemplateId: DEFAULT_TEMPLATE.id,
  hasSeenOnboarding: false,
  shiftStartTime: '08:00',
  shiftEndTime: '16:45',
  otStepMinutes: 15,
};

// ---------------- Employees (User Isolated) ----------------

export function getEmployees(customUserId?: string): Employee[] {
  try {
    const key = getUserStorageKey(STORAGE_KEYS.EMPLOYEES, customUserId);
    const raw = localStorage.getItem(key);
    if (!raw) {
      // Seed employee profile from the active user's session
      const session = getActiveSession();
      if (session) {
        const userEmp: Employee = {
          id: session.id,
          name: session.name,
          employeeNumber: session.employeeNumber || session.pfNumber || 'PF123456',
          designation: session.designation || 'Staff Member',
          branch: session.branch || 'Head Office',
          department: session.department || 'IT & Infrastructure Operations',
          createdAt: session.createdAt || new Date().toISOString(),
        };
        localStorage.setItem(key, JSON.stringify([userEmp]));
        return [userEmp];
      }
      return [];
    }
    return JSON.parse(raw);
  } catch (err) {
    console.error('Failed to read user employees from storage', err);
    return [];
  }
}

export function saveEmployee(employee: Employee, customUserId?: string): Employee[] {
  const key = getUserStorageKey(STORAGE_KEYS.EMPLOYEES, customUserId);
  const list = getEmployees(customUserId);
  const index = list.findIndex(e => e.id === employee.id);
  let updated: Employee[];
  if (index >= 0) {
    updated = [...list];
    updated[index] = employee;
  } else {
    updated = [employee, ...list];
  }
  localStorage.setItem(key, JSON.stringify(updated));
  return updated;
}

export function deleteEmployee(id: string, customUserId?: string): Employee[] {
  const key = getUserStorageKey(STORAGE_KEYS.EMPLOYEES, customUserId);
  const list = getEmployees(customUserId).filter(e => e.id !== id);
  localStorage.setItem(key, JSON.stringify(list));
  return list;
}

// ---------------- Templates (Strictly Filter Unassigned Templates) ----------------

/**
 * Returns available templates.
 * Rule: Non-admin users must NEVER see unassigned templates!
 */
export function getTemplates(activeProfile?: UserProfile | null): TemplateConfig[] {
  try {
    // 1. Read global template pool
    const globalRaw = localStorage.getItem('ot_manager_templates_global_v2');
    let allTemplates: TemplateConfig[] = [DEFAULT_TEMPLATE];
    if (globalRaw) {
      const parsed = JSON.parse(globalRaw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        allTemplates = parsed;
      }
    } else {
      localStorage.setItem('ot_manager_templates_global_v2', JSON.stringify([DEFAULT_TEMPLATE]));
    }

    const session = activeProfile || getActiveSession();
    // If admin, all templates are visible
    if (session?.role === 'admin') {
      return allTemplates;
    }

    // If regular user: strictly restrict to assignedTemplateIds only!
    if (session?.assignedTemplateIds && session.assignedTemplateIds.length > 0) {
      return allTemplates.filter(t => session.assignedTemplateIds!.includes(t.id));
    }

    // If user has NO assigned templates configured by admin:
    // Do NOT show unassigned templates to users!
    return [];
  } catch (err) {
    console.error('Failed to read templates', err);
    return [DEFAULT_TEMPLATE];
  }
}

export function getActiveTemplate(activeProfile?: UserProfile | null): TemplateConfig {
  const settings = getSettings();
  const templates = getTemplates(activeProfile);
  const found = templates.find(t => t.id === settings.activeTemplateId);
  return found || templates[0] || DEFAULT_TEMPLATE;
}

export function saveTemplate(template: TemplateConfig): TemplateConfig[] {
  const globalRaw = localStorage.getItem('ot_manager_templates_global_v2');
  let templates: TemplateConfig[] = [DEFAULT_TEMPLATE];
  if (globalRaw) {
    try {
      templates = JSON.parse(globalRaw);
    } catch {}
  }

  const index = templates.findIndex(t => t.id === template.id);
  let updated: TemplateConfig[];
  if (index >= 0) {
    updated = [...templates];
    updated[index] = { ...template, updatedAt: new Date().toISOString() };
  } else {
    updated = [...templates, { ...template, updatedAt: new Date().toISOString() }];
  }
  localStorage.setItem('ot_manager_templates_global_v2', JSON.stringify(updated));
  return updated;
}

export function deleteTemplate(templateId: string): TemplateConfig[] {
  const globalRaw = localStorage.getItem('ot_manager_templates_global_v2');
  let templates: TemplateConfig[] = [DEFAULT_TEMPLATE];
  if (globalRaw) {
    try {
      templates = JSON.parse(globalRaw);
    } catch {}
  }
  const updated = templates.filter(t => t.id !== templateId);
  const finalTemplates = updated.length > 0 ? updated : [DEFAULT_TEMPLATE];
  localStorage.setItem('ot_manager_templates_global_v2', JSON.stringify(finalTemplates));
  return finalTemplates;
}

export function resetTemplateToDefault(): TemplateConfig {
  const globalRaw = localStorage.getItem('ot_manager_templates_global_v2');
  let templates: TemplateConfig[] = [];
  if (globalRaw) {
    try {
      templates = JSON.parse(globalRaw).filter((t: TemplateConfig) => t.id !== DEFAULT_TEMPLATE.id);
    } catch {}
  }
  const updated = [DEFAULT_TEMPLATE, ...templates];
  localStorage.setItem('ot_manager_templates_global_v2', JSON.stringify(updated));
  const settings = getSettings();
  saveSettings({ ...settings, activeTemplateId: DEFAULT_TEMPLATE.id });
  return DEFAULT_TEMPLATE;
}

// ---------------- Claims (User Isolated) ----------------

export function getClaims(customUserId?: string): ClaimRecord[] {
  try {
    const key = getUserStorageKey(STORAGE_KEYS.CLAIMS, customUserId);
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch (err) {
    console.error('Failed to read claims', err);
    return [];
  }
}

export function saveClaim(claim: ClaimRecord, customUserId?: string): ClaimRecord[] {
  const key = getUserStorageKey(STORAGE_KEYS.CLAIMS, customUserId || claim.userId);
  const claims = getClaims(customUserId || claim.userId);
  const index = claims.findIndex(c => c.id === claim.id);
  let updated: ClaimRecord[];
  if (index >= 0) {
    updated = [...claims];
    updated[index] = { ...claim, updatedAt: new Date().toISOString() };
  } else {
    updated = [{ ...claim, updatedAt: new Date().toISOString() }, ...claims];
  }
  localStorage.setItem(key, JSON.stringify(updated));
  return updated;
}

export function deleteClaim(id: string, customUserId?: string): ClaimRecord[] {
  const key = getUserStorageKey(STORAGE_KEYS.CLAIMS, customUserId);
  const claims = getClaims(customUserId).filter(c => c.id !== id);
  localStorage.setItem(key, JSON.stringify(claims));
  return claims;
}

// ---------------- Draft Claim (User Isolated) ----------------

export function getDraftClaim(customUserId?: string): Partial<ClaimRecord> | null {
  try {
    const key = getUserStorageKey(STORAGE_KEYS.DRAFT_CLAIM, customUserId);
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function saveDraftClaim(draft: Partial<ClaimRecord>, customUserId?: string): void {
  try {
    const key = getUserStorageKey(STORAGE_KEYS.DRAFT_CLAIM, customUserId);
    localStorage.setItem(key, JSON.stringify(draft));
  } catch (e) {
    console.warn('Could not save draft claim', e);
  }
}

export function clearDraftClaim(customUserId?: string): void {
  const key = getUserStorageKey(STORAGE_KEYS.DRAFT_CLAIM, customUserId);
  localStorage.removeItem(key);
}

// ---------------- Settings (User Isolated) ----------------

export function getSettings(customUserId?: string): AppSettings {
  try {
    const key = getUserStorageKey(STORAGE_KEYS.SETTINGS, customUserId);
    const raw = localStorage.getItem(key);
    if (!raw) {
      localStorage.setItem(key, JSON.stringify(DEFAULT_SETTINGS));
      return DEFAULT_SETTINGS;
    }
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: AppSettings, customUserId?: string): AppSettings {
  const key = getUserStorageKey(STORAGE_KEYS.SETTINGS, customUserId);
  localStorage.setItem(key, JSON.stringify(settings));
  return settings;
}

// ---------------- Backup & Restore ----------------

export interface AppBackupData {
  version: 1;
  exportedAt: string;
  employees: Employee[];
  claims: ClaimRecord[];
  templates: TemplateConfig[];
  settings: AppSettings;
}

export function exportAllData(): string {
  const data: AppBackupData = {
    version: 1,
    exportedAt: new Date().toISOString(),
    employees: getEmployees(),
    claims: getClaims(),
    templates: getTemplates(),
    settings: getSettings(),
  };
  return JSON.stringify(data, null, 2);
}

export function importAllData(jsonString: string): { success: boolean; message: string } {
  try {
    const parsed = JSON.parse(jsonString);
    if (!parsed || typeof parsed !== 'object') {
      return { success: false, message: 'Invalid backup file structure.' };
    }

    if (Array.isArray(parsed.employees)) {
      localStorage.setItem(STORAGE_KEYS.EMPLOYEES, JSON.stringify(parsed.employees));
    }
    if (Array.isArray(parsed.claims)) {
      localStorage.setItem(STORAGE_KEYS.CLAIMS, JSON.stringify(parsed.claims));
    }
    if (Array.isArray(parsed.templates) && parsed.templates.length > 0) {
      localStorage.setItem(STORAGE_KEYS.TEMPLATES, JSON.stringify(parsed.templates));
    }
    if (parsed.settings && typeof parsed.settings === 'object') {
      localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(parsed.settings));
    }

    return { success: true, message: 'All overtime claims, templates, and employee records restored successfully!' };
  } catch (err) {
    return { success: false, message: 'Failed to parse JSON file. Please ensure it is a valid backup export.' };
  }
}

export function resetAllApplicationData(): void {
  localStorage.removeItem(STORAGE_KEYS.EMPLOYEES);
  localStorage.removeItem(STORAGE_KEYS.CLAIMS);
  localStorage.removeItem(STORAGE_KEYS.TEMPLATES);
  localStorage.removeItem(STORAGE_KEYS.SETTINGS);
  localStorage.removeItem(STORAGE_KEYS.DRAFT_CLAIM);
}
