import { AppSettings, ClaimRecord, Employee, TemplateConfig } from '../types';
import { DEFAULT_TEMPLATE } from './defaultTemplate';

const STORAGE_KEYS = {
  EMPLOYEES: 'ot_manager_employees_v1',
  CLAIMS: 'ot_manager_claims_v1',
  TEMPLATES: 'ot_manager_templates_v1',
  SETTINGS: 'ot_manager_settings_v1',
  DRAFT_CLAIM: 'ot_manager_draft_claim_v1',
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

export const SAMPLE_EMPLOYEES: Employee[] = [
  {
    id: 'emp-1',
    name: 'Dasun Ramasingha',
    employeeNumber: 'EMP-4892',
    designation: 'Senior Technical Officer',
    branch: 'Headquarters',
    department: 'IT & Infrastructure Operations',
    createdAt: '2026-01-15T08:00:00Z',
  },
  {
    id: 'emp-2',
    name: 'Kavindi Perera',
    employeeNumber: 'EMP-5104',
    designation: 'Systems Administrator',
    branch: 'Regional Hub - Colombo',
    department: 'Network Operations',
    createdAt: '2026-02-01T09:30:00Z',
  },
  {
    id: 'emp-3',
    name: 'Nuwan Jayawardena',
    employeeNumber: 'EMP-3920',
    designation: 'Operations Coordinator',
    branch: 'Logistics Facility',
    department: 'Supply Chain & Dispatch',
    createdAt: '2026-02-10T11:00:00Z',
  },
];

// ---------------- Employees ----------------

export function getEmployees(): Employee[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.EMPLOYEES);
    if (!raw) {
      // Seed initial sample employees
      localStorage.setItem(STORAGE_KEYS.EMPLOYEES, JSON.stringify(SAMPLE_EMPLOYEES));
      return SAMPLE_EMPLOYEES;
    }
    return JSON.parse(raw);
  } catch (err) {
    console.error('Failed to read employees from storage', err);
    return SAMPLE_EMPLOYEES;
  }
}

export function saveEmployee(employee: Employee): Employee[] {
  const list = getEmployees();
  const index = list.findIndex(e => e.id === employee.id);
  let updated: Employee[];
  if (index >= 0) {
    updated = [...list];
    updated[index] = employee;
  } else {
    updated = [employee, ...list];
  }
  localStorage.setItem(STORAGE_KEYS.EMPLOYEES, JSON.stringify(updated));
  return updated;
}

export function deleteEmployee(id: string): Employee[] {
  const list = getEmployees().filter(e => e.id !== id);
  localStorage.setItem(STORAGE_KEYS.EMPLOYEES, JSON.stringify(list));
  return list;
}

// ---------------- Templates ----------------

export function getTemplates(): TemplateConfig[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.TEMPLATES);
    if (!raw) {
      localStorage.setItem(STORAGE_KEYS.TEMPLATES, JSON.stringify([DEFAULT_TEMPLATE]));
      return [DEFAULT_TEMPLATE];
    }
    const list = JSON.parse(raw);
    if (!Array.isArray(list) || list.length === 0) {
      localStorage.setItem(STORAGE_KEYS.TEMPLATES, JSON.stringify([DEFAULT_TEMPLATE]));
      return [DEFAULT_TEMPLATE];
    }
    return list;
  } catch (err) {
    console.error('Failed to read templates', err);
    return [DEFAULT_TEMPLATE];
  }
}

export function getActiveTemplate(): TemplateConfig {
  const settings = getSettings();
  const templates = getTemplates();
  const found = templates.find(t => t.id === settings.activeTemplateId);
  return found || templates[0] || DEFAULT_TEMPLATE;
}

export function saveTemplate(template: TemplateConfig): TemplateConfig[] {
  const templates = getTemplates();
  const index = templates.findIndex(t => t.id === template.id);
  let updated: TemplateConfig[];
  if (index >= 0) {
    updated = [...templates];
    updated[index] = { ...template, updatedAt: new Date().toISOString() };
  } else {
    updated = [...templates, { ...template, updatedAt: new Date().toISOString() }];
  }
  localStorage.setItem(STORAGE_KEYS.TEMPLATES, JSON.stringify(updated));
  return updated;
}

export function resetTemplateToDefault(): TemplateConfig {
  const templates = getTemplates().filter(t => t.id !== DEFAULT_TEMPLATE.id);
  const updated = [DEFAULT_TEMPLATE, ...templates];
  localStorage.setItem(STORAGE_KEYS.TEMPLATES, JSON.stringify(updated));
  const settings = getSettings();
  saveSettings({ ...settings, activeTemplateId: DEFAULT_TEMPLATE.id });
  return DEFAULT_TEMPLATE;
}

// ---------------- Claims / History ----------------

export function getClaims(): ClaimRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.CLAIMS);
    if (!raw) {
      // Seed a sample past claim for demo purposes
      const sampleClaim: ClaimRecord = {
        id: 'claim-sample-1',
        userId: 'usr_sample',
        claimNumber: 'CLM-2026-03-001',
        employeeId: 'emp-1',
        employeeName: 'Dasun Ramasingha',
        employeeNumber: 'EMP-4892',
        designation: 'Senior Technical Officer',
        branch: 'Headquarters',
        department: 'IT & Infrastructure Operations',
        claimType: 'OT',
        month: 'March',
        year: 2026,
        claimDate: '2026-03-25',
        rows: [
          {
            id: 'r-1',
            date: '2026-03-02',
            dayOfWeek: 'Mon',
            startTime: '17:30',
            endTime: '20:30',
            breakMinutes: 0,
            isOvernight: false,
            totalWorkMinutes: 180,
            rawOtMinutes: 180,
            totalMinutes: 180,
            totalFormatted: '03:00',
            reason: 'Quarterly server infrastructure maintenance & security patch deployment',
          },
          {
            id: 'r-2',
            date: '2026-03-06',
            dayOfWeek: 'Fri',
            startTime: '17:30',
            endTime: '21:00',
            breakMinutes: 30,
            isOvernight: false,
            totalWorkMinutes: 210,
            rawOtMinutes: 180,
            totalMinutes: 180,
            totalFormatted: '03:00',
            reason: 'Emergency database failover testing and backup integrity check',
          },
          {
            id: 'r-3',
            date: '2026-03-14',
            dayOfWeek: 'Sat',
            startTime: '09:00',
            endTime: '15:30',
            breakMinutes: 60,
            isOvernight: false,
            totalWorkMinutes: 390,
            rawOtMinutes: 330,
            totalMinutes: 330,
            totalFormatted: '05:30',
            reason: 'Weekend core router upgrade and regional fiber link switchover',
          },
        ],
        totalMinutes: 690,
        totalHoursFormatted: '11:30',
        totalDecimalHours: 11.5,
        otDaysCount: 3,
        status: 'completed',
        templateId: DEFAULT_TEMPLATE.id,
        createdAt: '2026-03-25T14:20:00Z',
        updatedAt: '2026-03-25T14:20:00Z',
      };
      localStorage.setItem(STORAGE_KEYS.CLAIMS, JSON.stringify([sampleClaim]));
      return [sampleClaim];
    }
    return JSON.parse(raw);
  } catch (err) {
    console.error('Failed to read claims', err);
    return [];
  }
}

export function saveClaim(claim: ClaimRecord): ClaimRecord[] {
  const claims = getClaims();
  const index = claims.findIndex(c => c.id === claim.id);
  let updated: ClaimRecord[];
  if (index >= 0) {
    updated = [...claims];
    updated[index] = { ...claim, updatedAt: new Date().toISOString() };
  } else {
    updated = [{ ...claim, updatedAt: new Date().toISOString() }, ...claims];
  }
  localStorage.setItem(STORAGE_KEYS.CLAIMS, JSON.stringify(updated));
  return updated;
}

export function deleteClaim(id: string): ClaimRecord[] {
  const claims = getClaims().filter(c => c.id !== id);
  localStorage.setItem(STORAGE_KEYS.CLAIMS, JSON.stringify(claims));
  return claims;
}

// ---------------- Draft Claim ----------------

export function getDraftClaim(): Partial<ClaimRecord> | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.DRAFT_CLAIM);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function saveDraftClaim(draft: Partial<ClaimRecord>): void {
  try {
    localStorage.setItem(STORAGE_KEYS.DRAFT_CLAIM, JSON.stringify(draft));
  } catch (e) {
    console.warn('Could not save draft claim', e);
  }
}

export function clearDraftClaim(): void {
  localStorage.removeItem(STORAGE_KEYS.DRAFT_CLAIM);
}

// ---------------- Settings ----------------

export function getSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.SETTINGS);
    if (!raw) {
      localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(DEFAULT_SETTINGS));
      return DEFAULT_SETTINGS;
    }
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch (err) {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: AppSettings): AppSettings {
  localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
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
