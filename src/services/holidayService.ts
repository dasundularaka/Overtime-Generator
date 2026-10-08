import {
  collection,
  doc,
  setDoc,
  getDocs,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { Holiday, HolidayType } from '../types';
import { sanitizeFirestoreData } from '../utils/firestoreUtils';

const HOLIDAYS_COLLECTION = 'holidays';

/**
 * Standard default holidays for seed / import
 */
export const DEFAULT_ANNUAL_HOLIDAYS: Array<{ date: string; name: string; type: HolidayType; description?: string }> = [
  // 2026 Public & Bank Holidays
  { date: '2026-01-03', name: 'Duruthu Full Moon Poya Day', type: 'public', description: 'Public, Bank & Mercantile' },
  { date: '2026-01-14', name: 'Tamil Thai Pongal Day', type: 'public', description: 'Public & Bank Holiday' },
  { date: '2026-02-01', name: 'Navam Full Moon Poya Day', type: 'public', description: 'Public, Bank & Mercantile' },
  { date: '2026-02-04', name: 'National Day (Independence Day)', type: 'public', description: 'Public, Bank & Mercantile' },
  { date: '2026-02-17', name: 'Mahasivarathri Day', type: 'bank', description: 'Public & Bank Holiday' },
  { date: '2026-03-03', name: 'Medin Full Moon Poya Day', type: 'public', description: 'Public, Bank & Mercantile' },
  { date: '2026-03-21', name: 'Id-Ul-Fitr (Ramazan Festival)', type: 'public', description: 'Public & Bank Holiday' },
  { date: '2026-04-01', name: 'Bak Full Moon Poya Day', type: 'public', description: 'Public, Bank & Mercantile' },
  { date: '2026-04-03', name: 'Good Friday', type: 'bank', description: 'Public & Bank Holiday' },
  { date: '2026-04-13', name: 'Day prior to Sinhala & Tamil New Year Day', type: 'public', description: 'Public, Bank & Mercantile' },
  { date: '2026-04-14', name: 'Sinhala & Tamil New Year Day', type: 'public', description: 'Public, Bank & Mercantile' },
  { date: '2026-05-01', name: 'May Day (International Workers\' Day)', type: 'public', description: 'Public, Bank & Mercantile' },
  { date: '2026-05-31', name: 'Vesak Full Moon Poya Day', type: 'public', description: 'Public, Bank & Mercantile' },
  { date: '2026-06-01', name: 'Day following Vesak Full Moon Poya Day', type: 'public', description: 'Public & Bank Holiday' },
  { date: '2026-06-29', name: 'Poson Full Moon Poya Day', type: 'public', description: 'Public, Bank & Mercantile' },
  { date: '2026-07-28', name: 'Esala Full Moon Poya Day', type: 'public', description: 'Public, Bank & Mercantile' },
  { date: '2026-08-27', name: 'Nikini Full Moon Poya Day', type: 'public', description: 'Public, Bank & Mercantile' },
  { date: '2026-09-25', name: 'Binara Full Moon Poya Day', type: 'public', description: 'Public, Bank & Mercantile' },
  { date: '2026-10-25', name: 'Vap Full Moon Poya Day', type: 'public', description: 'Public, Bank & Mercantile' },
  { date: '2026-11-08', name: 'Deepavali Festival Day', type: 'bank', description: 'Public & Bank Holiday' },
  { date: '2026-11-23', name: 'Il Full Moon Poya Day', type: 'public', description: 'Public, Bank & Mercantile' },
  { date: '2026-12-23', name: 'Unduvap Full Moon Poya Day', type: 'public', description: 'Public, Bank & Mercantile' },
  { date: '2026-12-25', name: 'Christmas Day', type: 'public', description: 'Public, Bank & Mercantile' },
];

/**
 * Subscribes to real-time holiday updates from Firestore.
 */
export function subscribeToHolidays(onUpdate: (holidays: Holiday[]) => void): () => void {
  try {
    const q = query(collection(db, HOLIDAYS_COLLECTION), orderBy('date', 'asc'));
    return onSnapshot(
      q,
      (snapshot) => {
        const list: Holiday[] = [];
        snapshot.forEach((docSnap) => {
          list.push({ ...docSnap.data(), id: docSnap.id } as Holiday);
        });
        onUpdate(list);
      },
      (error) => {
        console.warn('Could not subscribe to holidays collection, using local defaults', error);
        // Fallback to default annual holidays
        const defaults: Holiday[] = DEFAULT_ANNUAL_HOLIDAYS.map((h, i) => ({
          ...h,
          id: h.date || `hol_${i}`,
          createdAt: new Date().toISOString(),
        }));
        onUpdate(defaults);
      }
    );
  } catch (err) {
    console.warn('Fallback holidays due to error', err);
    onUpdate([]);
    return () => {};
  }
}

/**
 * Fetches all holidays once.
 */
export async function getHolidays(): Promise<Holiday[]> {
  try {
    const q = query(collection(db, HOLIDAYS_COLLECTION), orderBy('date', 'asc'));
    const snapshot = await getDocs(q);
    const list: Holiday[] = [];
    snapshot.forEach((docSnap) => {
      list.push({ ...docSnap.data(), id: docSnap.id } as Holiday);
    });
    return list;
  } catch (err) {
    console.warn('Error fetching holidays from Firestore', err);
    return DEFAULT_ANNUAL_HOLIDAYS.map((h, i) => ({
      ...h,
      id: h.date || `hol_${i}`,
      createdAt: new Date().toISOString(),
    }));
  }
}

/**
 * Adds or saves a single holiday.
 */
export async function saveHoliday(holiday: Partial<Holiday> & { date: string; name: string }): Promise<Holiday> {
  const id = holiday.id || holiday.date;
  const fullHoliday: Holiday = {
    id,
    date: holiday.date,
    name: holiday.name.trim(),
    type: holiday.type || 'public',
    description: holiday.description || '',
    isRecurringYearly: !!holiday.isRecurringYearly,
    createdAt: holiday.createdAt || new Date().toISOString(),
  };

  await setDoc(doc(db, HOLIDAYS_COLLECTION, id), sanitizeFirestoreData(fullHoliday));
  return fullHoliday;
}

/**
 * Deletes a holiday.
 */
export async function deleteHoliday(id: string): Promise<void> {
  await deleteDoc(doc(db, HOLIDAYS_COLLECTION, id));
}

/**
 * Seeds or imports an array of holidays into Firestore.
 */
export async function seedStandardHolidays(holidaysToSeed = DEFAULT_ANNUAL_HOLIDAYS): Promise<number> {
  let count = 0;
  for (const h of holidaysToSeed) {
    const id = h.date;
    const fullHoliday: Holiday = {
      id,
      date: h.date,
      name: h.name,
      type: h.type,
      description: h.description || '',
      createdAt: new Date().toISOString(),
    };
    await setDoc(doc(db, HOLIDAYS_COLLECTION, id), sanitizeFirestoreData(fullHoliday));
    count++;
  }
  return count;
}

/**
 * Checks if a date is a holiday in the provided list.
 */
export function checkIsHoliday(
  dateStr: string,
  holidaysList: Holiday[] = []
): { isHoliday: boolean; holidayName?: string; holidayType?: HolidayType } {
  if (!dateStr) return { isHoliday: false };

  // Check matching date in holidays list
  const match = holidaysList.find((h) => h.date === dateStr);
  if (match) {
    return {
      isHoliday: true,
      holidayName: match.name,
      holidayType: match.type,
    };
  }

  // Also check if day is Sunday
  const [year, month, day] = dateStr.split('-').map(Number);
  if (year && month && day) {
    const dt = new Date(year, month - 1, day);
    if (dt.getDay() === 0) {
      return {
        isHoliday: true,
        holidayName: 'Sunday Holiday',
        holidayType: 'public',
      };
    }
  }

  return { isHoliday: false };
}
