import { deleteField, FieldValue } from 'firebase/firestore';

/**
 * Strips any undefined fields from an object so Firestore operations
 * (setDoc, updateDoc, etc.) never fail with:
 * "Unsupported field value: undefined".
 * 
 * Preserves Firestore FieldValue sentinels like deleteField() or serverTimestamp().
 */
export function sanitizeFirestoreData<T extends Record<string, any>>(obj: T): T {
  if (!obj || typeof obj !== 'object') return obj;

  const result: any = Array.isArray(obj) ? [] : {};

  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined) {
      continue;
    }

    if (value !== null && typeof value === 'object') {
      // Check if it's a Firestore sentinel (deleteField, serverTimestamp, etc.)
      if (
        value instanceof FieldValue ||
        typeof (value as any).isEqual === 'function' ||
        (value as any)._methodName
      ) {
        result[key] = value;
      } else if (value instanceof Date) {
        result[key] = value;
      } else if (Array.isArray(value)) {
        result[key] = value
          .filter(item => item !== undefined)
          .map(item => (typeof item === 'object' && item !== null ? sanitizeFirestoreData(item) : item));
      } else {
        result[key] = sanitizeFirestoreData(value);
      }
    } else {
      result[key] = value;
    }
  }

  return result;
}

/**
 * Prepares payload for updateDoc by converting undefined values to deleteField()
 * if removeUndefinedAsDeleteField is true, or omitting them if false.
 */
export function cleanUpdatePayload(data: Record<string, any>): Record<string, any> {
  const cleaned: Record<string, any> = {};
  for (const [key, val] of Object.entries(data)) {
    if (val === undefined) {
      cleaned[key] = deleteField();
    } else {
      cleaned[key] = val;
    }
  }
  return cleaned;
}
