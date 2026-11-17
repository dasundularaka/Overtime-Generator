import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { auth, db } from '../firebase/config';
import { CalendarDisplaySettings, FirstDayOfWeek } from '../types';
import { sanitizeFirestoreData } from '../utils/firestoreUtils';
import { DAYS_FULL } from '../utils/timeCalculations';

const CALENDAR_SETTINGS_COLLECTION = 'calendarSettings';
const GLOBAL_SETTINGS_DOC_ID = 'global';
const LOCAL_CACHE_KEY = 'ot_claim_calendar_settings_v1';

export const DEFAULT_CALENDAR_DISPLAY_SETTINGS: CalendarDisplaySettings = {
  id: GLOBAL_SETTINGS_DOC_ID,
  firstDayOfWeek: 0, // Sunday
};

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export function normalizeFirstDayOfWeek(val: unknown): FirstDayOfWeek {
  const num = Number(val);
  if (Number.isInteger(num) && num >= 0 && num <= 6) {
    return num as FirstDayOfWeek;
  }
  return 0;
}

export function getFirstDayOfWeekLabel(dayIndex: FirstDayOfWeek): string {
  return DAYS_FULL[dayIndex] || 'Sunday';
}

export function readCachedCalendarSettings(): CalendarDisplaySettings {
  try {
    const raw = localStorage.getItem(LOCAL_CACHE_KEY);
    if (!raw) return DEFAULT_CALENDAR_DISPLAY_SETTINGS;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      return {
        id: GLOBAL_SETTINGS_DOC_ID,
        firstDayOfWeek: normalizeFirstDayOfWeek(parsed.firstDayOfWeek),
        updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : undefined,
      };
    }
  } catch {
    // ignore storage errors
  }
  return DEFAULT_CALENDAR_DISPLAY_SETTINGS;
}

function writeCachedCalendarSettings(settings: CalendarDisplaySettings): void {
  try {
    localStorage.setItem(LOCAL_CACHE_KEY, JSON.stringify(settings));
  } catch {
    // ignore storage errors
  }
}

/**
 * Real-time subscription to global Calendar Display Settings (such as First Day of Week).
 * Falls back cleanly to local cache while syncing across devices from Firestore.
 */
export function subscribeToCalendarSettings(
  onUpdate: (settings: CalendarDisplaySettings) => void
): () => void {
  onUpdate(readCachedCalendarSettings());

  const docPath = `${CALENDAR_SETTINGS_COLLECTION}/${GLOBAL_SETTINGS_DOC_ID}`;
  try {
    const ref = doc(db, CALENDAR_SETTINGS_COLLECTION, GLOBAL_SETTINGS_DOC_ID);
    return onSnapshot(
      ref,
      (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data() as Partial<CalendarDisplaySettings>;
          const normalized: CalendarDisplaySettings = {
            id: GLOBAL_SETTINGS_DOC_ID,
            firstDayOfWeek: normalizeFirstDayOfWeek(data.firstDayOfWeek),
            updatedAt: data.updatedAt,
          };
          writeCachedCalendarSettings(normalized);
          onUpdate(normalized);
        } else {
          onUpdate(readCachedCalendarSettings());
        }
      },
      (error) => {
        console.warn('Calendar settings subscription fallback to cache:', docPath, error);
        onUpdate(readCachedCalendarSettings());
      }
    );
  } catch (err) {
    console.warn('Could not subscribe to calendarSettings, using cache', err);
    onUpdate(readCachedCalendarSettings());
    return () => {};
  }
}

/**
 * Saves global Calendar Display Settings (Super Admin action).
 */
export async function saveCalendarSettings(
  updates: Partial<Omit<CalendarDisplaySettings, 'id'>>
): Promise<CalendarDisplaySettings> {
  const current = readCachedCalendarSettings();
  const fullSettings: CalendarDisplaySettings = {
    id: GLOBAL_SETTINGS_DOC_ID,
    firstDayOfWeek:
      updates.firstDayOfWeek !== undefined
        ? normalizeFirstDayOfWeek(updates.firstDayOfWeek)
        : current.firstDayOfWeek,
    updatedAt: new Date().toISOString(),
  };

  writeCachedCalendarSettings(fullSettings);
  const docPath = `${CALENDAR_SETTINGS_COLLECTION}/${GLOBAL_SETTINGS_DOC_ID}`;
  try {
    await setDoc(
      doc(db, CALENDAR_SETTINGS_COLLECTION, GLOBAL_SETTINGS_DOC_ID),
      sanitizeFirestoreData(fullSettings)
    );
    return fullSettings;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, docPath);
  }
}
