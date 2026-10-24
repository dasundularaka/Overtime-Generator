import { collection, doc, setDoc, getDocs, query, orderBy, limit } from 'firebase/firestore';
import { db } from '../firebase/config';
import { AuditLogEntry, AuditActionType, AuditFieldDiff } from '../types';
import { getActiveSession } from './localAuthManager';
import { sanitizeFirestoreData } from './firestoreUtils';

const AUDIT_STORAGE_KEY = 'ot_audit_logs_v2';
const MAX_LOCAL_LOGS = 500;

/**
 * Common human-friendly label dictionary for data model attributes
 */
const FIELD_LABEL_MAP: Record<string, string> = {
  name: 'Full Name',
  email: 'Email Address',
  employeeNumber: 'PF Number (Username)',
  pfNumber: 'PF Number',
  role: 'System Access Role',
  roleId: 'Assigned Role Designation',
  roleName: 'Role Title',
  claimType: 'Claim Type (OT / OP)',
  designation: 'Designation',
  branch: 'Branch / Office Location',
  branchCode: 'Branch Code',
  department: 'Department',
  hourlyRate: 'Hourly Rate - Working Days (Rs.)',
  daysPay: 'Day\'s Pay - Non-Working Days (Rs.)',
  hourlyRateNonWorkingDays: 'Hourly Rate - Non-Working Days (Rs.)',
  specialHourlyRate: 'Special Assigned Rate (Rs.)',
  totalRemuneration: 'Basic Remuneration / Salary (Rs.)',
  isRatesLocked: 'Rates Modification Lock',
  mustChangePassword: 'Force Password Change Flag',
  isFirstLogin: 'First Login Status',
  passwordMatchesPf: 'Password Matches PF Flag',
  maxOtHoursPerDay: 'Max Overtime Hours / Day',
  shiftStartTime: 'Standard Shift Start Time',
  shiftEndTime: 'Standard Shift End Time',
  assignedTemplateIds: 'Assigned Claim Templates',
  telephone: 'Telephone Number',
  address: 'Physical Address',
  notes: 'Internal Notes',
  mapLink: 'Google Maps Link',
  month: 'Claim Period Month',
  year: 'Claim Period Year',
  claimNumber: 'Claim Reference Number',
  totalHoursFormatted: 'Total Overtime Hours',
  totalMinutes: 'Total Overtime Minutes',
  totalDecimalHours: 'Decimal Hours',
  totalOtPayment: 'Total Overtime Payment (Rs.)',
  otPaymentDueA: 'Standard OT Payment A (Rs.)',
  daysPayTotal: 'Day\'s Pay Payment (Rs.)',
  otPaymentDueB: 'Special OT Payment B (Rs.)',
  otDaysCount: 'Number of Claimed OT Days',
  status: 'Claim Status',
  templateId: 'Used Template ID',
  timeFormat: 'Time Input Format',
  otDisplayFormat: 'OT Duration Display Format',
  defaultFont: 'Default PDF Font',
  globalPrinterOffsetX: 'Global Printer X Offset (mm)',
  globalPrinterOffsetY: 'Global Printer Y Offset (mm)',
  activeTemplateId: 'Active Organization Template',
  date: 'Holiday / Event Date',
  type: 'Holiday Classification',
  description: 'Description',
  targetEmail: 'Target Notification Email',
  method: 'Reset Verification Method',
  initialPassword: 'Default Temporary Password',
};

/**
 * Converts a raw property key into a readable capitalized label
 */
export function formatKeyToLabel(key: string, customLabels?: Record<string, string>): string {
  if (customLabels && customLabels[key]) return customLabels[key];
  if (FIELD_LABEL_MAP[key]) return FIELD_LABEL_MAP[key];

  // Convert camelCase or snake_case to Title Case
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/[_-]/g, ' ')
    .replace(/^\w/, c => c.toUpperCase())
    .trim();
}

/**
 * Formats any JavaScript value into a human-scannable string
 */
export function formatValue(val: any): string {
  if (val === undefined || val === null || val === '') {
    return '—';
  }
  if (typeof val === 'boolean') {
    return val ? 'Yes' : 'No';
  }
  if (typeof val === 'number') {
    return val.toLocaleString('en-US');
  }
  if (Array.isArray(val)) {
    if (val.length === 0) return 'None (0)';
    if (val.every(item => typeof item === 'string' || typeof item === 'number')) {
      return val.join(', ');
    }
    return `${val.length} entries`;
  }
  if (typeof val === 'object') {
    return JSON.stringify(val);
  }
  return String(val);
}

/**
 * Calculates genuine field-by-field modifications comparing previous state (before) with new state (after).
 * ONLY real changes where a previously existing value was altered to a different new value are included.
 * Initial entity creations, atomic events, and unedited properties are excluded.
 */
export function calculateObjectDiff(
  before: Record<string, any> | null | undefined,
  after: Record<string, any> | null | undefined,
  customLabels?: Record<string, string>,
  ignoredFields: string[] = ['updatedAt', 'createdAt', 'id', 'passwordHash', 'initialPassword', 'photoURL']
): AuditFieldDiff[] {
  // If either state is absent, this is an event/creation/deletion, NOT an in-place modification
  if (!before || !after) {
    return [];
  }

  const diffs: AuditFieldDiff[] = [];
  const b = before;
  const a = after;

  const allKeys = Array.from(new Set([...Object.keys(b), ...Object.keys(a)])).filter(
    k => !ignoredFields.includes(k)
  );

  for (const key of allKeys) {
    const valBefore = b[key];
    const valAfter = a[key];

    // Normalize empty values
    const isBeforeEmpty = valBefore === undefined || valBefore === null || valBefore === '';
    const isAfterEmpty = valAfter === undefined || valAfter === null || valAfter === '';

    // If both are empty or undefined, no real change occurred
    if (isBeforeEmpty && isAfterEmpty) continue;

    // Deep equality comparison
    const formattedB = formatValue(valBefore);
    const formattedA = formatValue(valAfter);

    if (formattedB === formattedA) continue;

    const isSame =
      valBefore === valAfter ||
      (typeof valBefore === 'object' &&
        typeof valAfter === 'object' &&
        JSON.stringify(valBefore) === JSON.stringify(valAfter)) ||
      (typeof valBefore === 'number' && typeof valAfter === 'number' && valBefore === valAfter) ||
      (String(valBefore ?? '').trim() === String(valAfter ?? '').trim());

    if (!isSame) {
      diffs.push({
        field: key,
        label: formatKeyToLabel(key, customLabels),
        before: valBefore ?? null,
        after: valAfter ?? null,
        formattedBefore: formattedB,
        formattedAfter: formattedA,
        type: isBeforeEmpty ? 'added' : isAfterEmpty ? 'removed' : 'changed',
      });
    }
  }

  return diffs;
}

/**
 * Extracts ONLY REAL, verified field modifications from an AuditLogEntry.
 * Excludes initial record creations, logins, exports, and generic details.
 */
export function extractDiffFromLog(log: AuditLogEntry): AuditFieldDiff[] {
  // 1. Direct diff array stored in log
  if (log.diff && Array.isArray(log.diff) && log.diff.length > 0) {
    return log.diff.filter(d => {
      if (!d) return false;
      // Exclude identical before/after
      if (d.formattedBefore === d.formattedAfter) return false;
      // Exclude creations where before is (New Record) unless user explicitly modified it
      if (d.formattedBefore === '(New Record)' || d.formattedBefore === '—') {
        return false;
      }
      return true;
    });
  }

  // 2. Computed from real beforeState and afterState
  if (log.beforeState && log.afterState) {
    return calculateObjectDiff(log.beforeState, log.afterState);
  }

  // 3. Fallback extraction ONLY if details has explicit before and after objects
  if (log.details && typeof log.details === 'object') {
    if (log.details.before && log.details.after) {
      return calculateObjectDiff(log.details.before, log.details.after);
    }
  }

  // Pure events (e.g. login, logout, create, export) have no real changes
  return [];
}

/**
 * Returns locally cached audit logs
 */
export function getLocalAuditLogs(): AuditLogEntry[] {
  try {
    const raw = localStorage.getItem(AUDIT_STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch (e) {
    console.warn('Could not read local audit logs', e);
    return [];
  }
}

/**
 * Saves an entry into local storage cache
 */
function saveLocalAuditLog(entry: AuditLogEntry): void {
  try {
    const current = getLocalAuditLogs();
    const updated = [entry, ...current].slice(0, MAX_LOCAL_LOGS);
    localStorage.setItem(AUDIT_STORAGE_KEY, JSON.stringify(updated));
  } catch (e) {
    console.warn('Could not save local audit log', e);
  }
}

/**
 * Records an administrative audit log entry to ensure traceability across the system.
 * Automatically captures Actor Name, PF No, Branch, Timestamp, Target details,
 * and exact Before vs After changes comparison.
 */
export async function recordAuditLog(
  params: {
    action: AuditActionType;
    actionLabel: string;
    targetType: AuditLogEntry['targetType'];
    targetDescription: string;
    targetId?: string;
    // Before vs After state comparison
    diff?: AuditFieldDiff[];
    beforeState?: Record<string, any>;
    afterState?: Record<string, any>;
    details?: Record<string, any>;
    // Optional overrides for actor
    userId?: string;
    userName?: string;
    userPfNumber?: string;
    userBranch?: string;
    userDepartment?: string;
  }
): Promise<AuditLogEntry> {
  const session = getActiveSession();
  const id = `log_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const timestamp = new Date().toISOString();

  // Compute diff if beforeState and afterState were provided but diff was omitted
  let finalDiff = params.diff;
  if (!finalDiff && (params.beforeState || params.afterState)) {
    finalDiff = calculateObjectDiff(params.beforeState, params.afterState);
  }

  const entry: AuditLogEntry = {
    id,
    action: params.action,
    actionLabel: params.actionLabel,
    timestamp,
    userId: params.userId || session?.id || 'system',
    userName: params.userName || session?.name || 'Administrator',
    userPfNumber: params.userPfNumber || session?.employeeNumber || session?.pfNumber || 'PF100000',
    userBranch: params.userBranch || session?.branch || 'Head Office',
    userDepartment: params.userDepartment || session?.department || 'IT Operations',
    userRole: session?.role || 'user',
    targetType: params.targetType,
    targetId: params.targetId,
    targetDescription: params.targetDescription,
    diff: finalDiff && finalDiff.length > 0 ? finalDiff : undefined,
    beforeState: params.beforeState,
    afterState: params.afterState,
    details: params.details || {},
  };

  // 1. Save in local storage cache
  saveLocalAuditLog(entry);

  // 2. Persist to Cloud Firestore auditLogs collection
  try {
    await setDoc(doc(db, 'auditLogs', id), sanitizeFirestoreData(entry));
  } catch (err) {
    console.warn('Audit log write to Firestore note (stored in local ledger):', err);
  }

  return entry;
}

/**
 * Fetches audit logs from Firestore, merging with local storage cache.
 */
export async function fetchAuditLogs(maxCount: number = 300): Promise<AuditLogEntry[]> {
  const localLogs = getLocalAuditLogs();
  const firestoreLogs: AuditLogEntry[] = [];

  try {
    const q = query(collection(db, 'auditLogs'), orderBy('timestamp', 'desc'), limit(maxCount));
    const snap = await getDocs(q);
    snap.forEach(d => {
      const data = d.data() as AuditLogEntry;
      firestoreLogs.push({ ...data, id: data.id || d.id });
    });
  } catch (err) {
    console.warn('Could not query Firestore audit logs, using local ledger', err);
  }

  // Merge and deduplicate by id
  const logMap = new Map<string, AuditLogEntry>();
  for (const log of localLogs) {
    logMap.set(log.id, log);
  }
  for (const log of firestoreLogs) {
    logMap.set(log.id, log);
  }

  const combined = Array.from(logMap.values());
  combined.sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));
  return combined.slice(0, maxCount);
}

/**
 * Exports audit logs into a CSV format string with Before vs After changes breakdown.
 */
export function exportAuditLogsToCsv(logs: AuditLogEntry[]): void {
  const headers = [
    'Log ID',
    'Timestamp',
    'Action Type',
    'Action Description',
    'Actor Name',
    'Actor PF No',
    'Actor Branch',
    'Actor Department',
    'Actor Role',
    'Target Type',
    'Target ID',
    'Target Description',
    'Changes (Before -> After)',
    'Details Summary',
  ];

  const rows = logs.map(l => {
    const diffs = extractDiffFromLog(l);
    const changesSummary = diffs
      .map(d => `${d.label}: ${d.formattedBefore} -> ${d.formattedAfter}`)
      .join(' | ')
      .replace(/"/g, '""');

    const detailsSummary = l.details ? JSON.stringify(l.details).replace(/"/g, '""') : '';

    return [
      `"${l.id}"`,
      `"${new Date(l.timestamp).toLocaleString('en-US')}"`,
      `"${l.action}"`,
      `"${(l.actionLabel || '').replace(/"/g, '""')}"`,
      `"${(l.userName || '').replace(/"/g, '""')}"`,
      `"${(l.userPfNumber || '').replace(/"/g, '""')}"`,
      `"${(l.userBranch || '').replace(/"/g, '""')}"`,
      `"${(l.userDepartment || '').replace(/"/g, '""')}"`,
      `"${l.userRole || ''}"`,
      `"${l.targetType}"`,
      `"${(l.targetId || '').replace(/"/g, '""')}"`,
      `"${(l.targetDescription || '').replace(/"/g, '""')}"`,
      `"${changesSummary}"`,
      `"${detailsSummary}"`,
    ].join(',');
  });

  const csvContent = [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `System_Audit_Log_${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
