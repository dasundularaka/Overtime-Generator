import { collection, doc, setDoc, getDocs, query, orderBy, limit } from 'firebase/firestore';
import { db } from '../firebase/config';
import { AuditLogEntry, AuditActionType } from '../types';
import { getActiveSession } from './localAuthManager';
import { sanitizeFirestoreData } from './firestoreUtils';

const AUDIT_STORAGE_KEY = 'ot_audit_logs_v2';
const MAX_LOCAL_LOGS = 500;

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
 * Automatically captures Actor Name, PF No, Branch, Timestamp and Target details.
 */
export async function recordAuditLog(
  params: {
    action: AuditActionType;
    actionLabel: string;
    targetType: AuditLogEntry['targetType'];
    targetDescription: string;
    targetId?: string;
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
export async function fetchAuditLogs(maxCount: number = 200): Promise<AuditLogEntry[]> {
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
 * Exports audit logs into a CSV format string and triggers a browser download.
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
    'Details Summary',
  ];

  const rows = logs.map(l => {
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
