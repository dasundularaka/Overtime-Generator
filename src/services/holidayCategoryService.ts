import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  onSnapshot,
  getDocs,
  query,
  orderBy,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { HolidayCategory, HolidayCategoryColorKey } from '../types';
import { sanitizeFirestoreData } from '../utils/firestoreUtils';

const HOLIDAY_CATEGORIES_COLLECTION = 'holidayCategories';
const LOCAL_CACHE_KEY = 'ot_claim_holiday_categories_v1';

export interface HolidayColorTheme {
  key: HolidayCategoryColorKey;
  label: string;
  textClass: string;
  swatchClass: string;
  softBgClass: string;
  softTextClass: string;
  borderClass: string;
  ringClass: string;
  hex: string;
}

export const HOLIDAY_COLOR_PALETTE: HolidayColorTheme[] = [
  {
    key: 'purple',
    label: 'Purple',
    textClass: 'text-purple-700',
    swatchClass: 'bg-purple-600',
    softBgClass: 'bg-purple-50',
    softTextClass: 'text-purple-800',
    borderClass: 'border-purple-200',
    ringClass: 'ring-purple-500',
    hex: '#9333ea',
  },
  {
    key: 'amber',
    label: 'Amber Gold',
    textClass: 'text-amber-600',
    swatchClass: 'bg-amber-500',
    softBgClass: 'bg-amber-50',
    softTextClass: 'text-amber-800',
    borderClass: 'border-amber-200',
    ringClass: 'ring-amber-500',
    hex: '#d97706',
  },
  {
    key: 'sky',
    label: 'Sky Blue',
    textClass: 'text-sky-600',
    swatchClass: 'bg-sky-500',
    softBgClass: 'bg-sky-50',
    softTextClass: 'text-sky-800',
    borderClass: 'border-sky-200',
    ringClass: 'ring-sky-500',
    hex: '#0284c7',
  },
  {
    key: 'rose',
    label: 'Crimson Rose',
    textClass: 'text-rose-600',
    swatchClass: 'bg-rose-500',
    softBgClass: 'bg-rose-50',
    softTextClass: 'text-rose-800',
    borderClass: 'border-rose-200',
    ringClass: 'ring-rose-500',
    hex: '#e11d48',
  },
  {
    key: 'emerald',
    label: 'Emerald Green',
    textClass: 'text-emerald-700',
    swatchClass: 'bg-emerald-600',
    softBgClass: 'bg-emerald-50',
    softTextClass: 'text-emerald-800',
    borderClass: 'border-emerald-200',
    ringClass: 'ring-emerald-500',
    hex: '#059669',
  },
  {
    key: 'indigo',
    label: 'Indigo',
    textClass: 'text-indigo-700',
    swatchClass: 'bg-indigo-600',
    softBgClass: 'bg-indigo-50',
    softTextClass: 'text-indigo-800',
    borderClass: 'border-indigo-200',
    ringClass: 'ring-indigo-500',
    hex: '#4f46e5',
  },
  {
    key: 'orange',
    label: 'Tangerine',
    textClass: 'text-orange-600',
    swatchClass: 'bg-orange-500',
    softBgClass: 'bg-orange-50',
    softTextClass: 'text-orange-800',
    borderClass: 'border-orange-200',
    ringClass: 'ring-orange-500',
    hex: '#ea580c',
  },
  {
    key: 'teal',
    label: 'Teal',
    textClass: 'text-teal-700',
    swatchClass: 'bg-teal-600',
    softBgClass: 'bg-teal-50',
    softTextClass: 'text-teal-800',
    borderClass: 'border-teal-200',
    ringClass: 'ring-teal-500',
    hex: '#0d9488',
  },
  {
    key: 'pink',
    label: 'Magenta Pink',
    textClass: 'text-pink-600',
    swatchClass: 'bg-pink-500',
    softBgClass: 'bg-pink-50',
    softTextClass: 'text-pink-800',
    borderClass: 'border-pink-200',
    ringClass: 'ring-pink-500',
    hex: '#db2777',
  },
  {
    key: 'slate',
    label: 'Slate Charcoal',
    textClass: 'text-slate-700',
    swatchClass: 'bg-slate-700',
    softBgClass: 'bg-slate-100',
    softTextClass: 'text-slate-800',
    borderClass: 'border-slate-300',
    ringClass: 'ring-slate-600',
    hex: '#334155',
  },
];

export const DEFAULT_HOLIDAY_CATEGORIES: HolidayCategory[] = [
  {
    id: 'poya',
    name: 'Poya',
    shortName: 'Poya',
    color: 'purple',
    isDefault: true,
    order: 1,
  },
  {
    id: 'bank',
    name: 'Bank',
    shortName: 'Bank',
    color: 'amber',
    isDefault: true,
    order: 2,
  },
  {
    id: 'mercantile',
    name: 'Mercantile',
    shortName: 'Mercantile',
    color: 'sky',
    isDefault: true,
    order: 3,
  },
  {
    id: 'other',
    name: 'Other Holidays',
    shortName: 'Other Holidays',
    color: 'rose',
    isDefault: true,
    order: 4,
  },
];

export function getHolidayColorTheme(colorKey?: string): HolidayColorTheme {
  const found = HOLIDAY_COLOR_PALETTE.find(
    (c) => c.key === colorKey || c.hex.toLowerCase() === (colorKey || '').toLowerCase()
  );
  return found || HOLIDAY_COLOR_PALETTE[0];
}

function readCachedCategories(): HolidayCategory[] {
  try {
    const raw = localStorage.getItem(LOCAL_CACHE_KEY);
    if (!raw) return DEFAULT_HOLIDAY_CATEGORIES;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return sortCategories(parsed);
    }
  } catch {
    // ignore storage errors
  }
  return DEFAULT_HOLIDAY_CATEGORIES;
}

function writeCachedCategories(categories: HolidayCategory[]): void {
  try {
    localStorage.setItem(LOCAL_CACHE_KEY, JSON.stringify(categories));
  } catch {
    // ignore storage errors
  }
}

export function sortCategories(list: HolidayCategory[]): HolidayCategory[] {
  return [...list].sort((a, b) => {
    const oa = typeof a.order === 'number' ? a.order : 999;
    const ob = typeof b.order === 'number' ? b.order : 999;
    if (oa !== ob) return oa - ob;
    return a.name.localeCompare(b.name);
  });
}

/**
 * Merges Firestore custom/configured categories with the 4 baseline default categories
 * so default categories remain available even before first Firestore write.
 */
function mergeWithDefaults(firestoreList: HolidayCategory[]): HolidayCategory[] {
  if (firestoreList.length === 0) return DEFAULT_HOLIDAY_CATEGORIES;

  const map = new Map<string, HolidayCategory>();
  for (const def of DEFAULT_HOLIDAY_CATEGORIES) {
    map.set(def.id, def);
  }
  for (const item of firestoreList) {
    if (!item?.id) continue;
    const existing = map.get(item.id);
    map.set(item.id, existing ? { ...existing, ...item } : item);
  }
  return sortCategories(Array.from(map.values()));
}

/**
 * Resolves any Holiday record (legacy or newly created) to its matching HolidayCategory.
 */
export function resolveHolidayCategory(
  holiday: { type?: string; name?: string; description?: string },
  categories: HolidayCategory[] = DEFAULT_HOLIDAY_CATEGORIES
): HolidayCategory {
  const safeList = categories.length > 0 ? categories : DEFAULT_HOLIDAY_CATEGORIES;
  const rawType = (holiday.type || '').trim().toLowerCase();
  const nameLower = (holiday.name || '').toLowerCase();

  // 1. Exact category ID match (e.g. 'poya', 'bank', 'mercantile', 'other', or custom slug)
  const exact = safeList.find((c) => c.id.toLowerCase() === rawType);
  if (exact) return exact;

  // 2. Smart legacy mapping: 'public' -> 'poya' if name includes "poya", else 'other'
  if (rawType === 'public') {
    if (nameLower.includes('poya')) {
      const poyaCat = safeList.find((c) => c.id === 'poya');
      if (poyaCat) return poyaCat;
    }
    const otherCat = safeList.find((c) => c.id === 'other');
    if (otherCat) return otherCat;
  }

  // 3. 'special' maps to 'other' unless there's a custom category named 'special'
  if (rawType === 'special') {
    const otherCat = safeList.find((c) => c.id === 'other');
    if (otherCat) return otherCat;
  }

  // 4. Fallback to 'other' or first available category
  return safeList.find((c) => c.id === 'other') || safeList[0];
}

/**
 * Real-time subscription to Holiday Categories.
 */
export function subscribeToHolidayCategories(
  onUpdate: (categories: HolidayCategory[]) => void
): () => void {
  // Emit cached/default immediately to prevent flicker
  onUpdate(readCachedCategories());

  try {
    const q = query(collection(db, HOLIDAY_CATEGORIES_COLLECTION), orderBy('order', 'asc'));
    return onSnapshot(
      q,
      (snapshot) => {
        const remote: HolidayCategory[] = [];
        snapshot.forEach((docSnap) => {
          remote.push({ ...(docSnap.data() as HolidayCategory), id: docSnap.id });
        });
        const merged = mergeWithDefaults(remote);
        writeCachedCategories(merged);
        onUpdate(merged);
      },
      (error) => {
        console.warn('Could not subscribe to holidayCategories collection, using cached defaults', error);
        onUpdate(readCachedCategories());
      }
    );
  } catch (err) {
    console.warn('Holiday category subscription fallback', err);
    onUpdate(readCachedCategories());
    return () => {};
  }
}

export async function getHolidayCategories(): Promise<HolidayCategory[]> {
  try {
    const q = query(collection(db, HOLIDAY_CATEGORIES_COLLECTION), orderBy('order', 'asc'));
    const snap = await getDocs(q);
    const remote: HolidayCategory[] = [];
    snap.forEach((docSnap) => {
      remote.push({ ...(docSnap.data() as HolidayCategory), id: docSnap.id });
    });
    const merged = mergeWithDefaults(remote);
    writeCachedCategories(merged);
    return merged;
  } catch {
    return readCachedCategories();
  }
}

export function slugifyCategoryId(name: string): string {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return base || `custom_${Date.now()}`;
}

export async function saveHolidayCategory(
  category: Omit<HolidayCategory, 'id'> & { id?: string }
): Promise<HolidayCategory> {
  const cleanName = category.name.trim();
  const id = category.id || slugifyCategoryId(cleanName);
  const nowIso = new Date().toISOString();

  const fullCategory: HolidayCategory = {
    id,
    name: cleanName,
    shortName: category.shortName?.trim() || cleanName,
    color: category.color || 'indigo',
    isDefault: !!category.isDefault,
    order: typeof category.order === 'number' ? category.order : 10,
    createdAt: category.createdAt || nowIso,
    updatedAt: nowIso,
  };

  // Update local cache immediately for crisp UX
  const current = readCachedCategories();
  const idx = current.findIndex((c) => c.id === id);
  const next = idx >= 0
    ? current.map((c) => (c.id === id ? fullCategory : c))
    : [...current, fullCategory];
  writeCachedCategories(sortCategories(next));

  await setDoc(
    doc(db, HOLIDAY_CATEGORIES_COLLECTION, id),
    sanitizeFirestoreData(fullCategory)
  );
  return fullCategory;
}

export async function deleteHolidayCategory(id: string): Promise<void> {
  const current = readCachedCategories().filter((c) => c.id !== id);
  writeCachedCategories(current);
  await deleteDoc(doc(db, HOLIDAY_CATEGORIES_COLLECTION, id));
}
