import { doc, getDoc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '../firebase/config';

export interface EmailActivitySettings {
  id: 'emailActivitySettings';
  loginAlerts: boolean;
  passwordChangeAlerts: boolean;
  claimSubmissionAlerts: boolean;
  roleChangeAlerts: boolean;
  updatedAt: string;
  updatedBy?: string;
}

export type EmailActivitySettingKey =
  | 'loginAlerts'
  | 'passwordChangeAlerts'
  | 'claimSubmissionAlerts'
  | 'roleChangeAlerts';

const STORAGE_KEY = 'ot_email_activity_settings_v1';
const CONFIG_DOC_ID = 'emailActivitySettings';

export const DEFAULT_EMAIL_ACTIVITY_SETTINGS: EmailActivitySettings = {
  id: CONFIG_DOC_ID,
  loginAlerts: true,
  passwordChangeAlerts: true,
  claimSubmissionAlerts: true,
  roleChangeAlerts: true,
  updatedAt: '',
};

let inMemorySettings: EmailActivitySettings | null = null;

function normalizeSettings(raw?: Partial<EmailActivitySettings> | null): EmailActivitySettings {
  return {
    id: CONFIG_DOC_ID,
    loginAlerts: raw?.loginAlerts !== false,
    passwordChangeAlerts: raw?.passwordChangeAlerts !== false,
    claimSubmissionAlerts: raw?.claimSubmissionAlerts !== false,
    roleChangeAlerts: raw?.roleChangeAlerts !== false,
    updatedAt: typeof raw?.updatedAt === 'string' ? raw.updatedAt : '',
    ...(typeof raw?.updatedBy === 'string' && raw.updatedBy.trim()
      ? { updatedBy: raw.updatedBy.trim().slice(0, 120) }
      : {}),
  };
}

function writeCache(settings: EmailActivitySettings): void {
  inMemorySettings = settings;
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    }
  } catch {
    // Ignore storage quota or private browsing errors
  }
}

export function getCachedEmailActivitySettings(): EmailActivitySettings {
  if (inMemorySettings) return inMemorySettings;
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<EmailActivitySettings>;
        const normalized = normalizeSettings(parsed);
        inMemorySettings = normalized;
        return normalized;
      }
    }
  } catch {
    // Ignore malformed cache
  }
  inMemorySettings = DEFAULT_EMAIL_ACTIVITY_SETTINGS;
  return DEFAULT_EMAIL_ACTIVITY_SETTINGS;
}

export async function refreshEmailActivitySettingsFromFirestore(): Promise<EmailActivitySettings> {
  try {
    const snap = await getDoc(doc(db, 'systemConfig', CONFIG_DOC_ID));
    if (snap.exists()) {
      const normalized = normalizeSettings(snap.data() as Partial<EmailActivitySettings>);
      writeCache(normalized);
      return normalized;
    }
  } catch (err) {
    console.warn('Could not fetch email activity settings from Firestore:', err);
  }
  return getCachedEmailActivitySettings();
}

export function subscribeToEmailActivitySettings(
  onChange: (settings: EmailActivitySettings) => void
): () => void {
  onChange(getCachedEmailActivitySettings());

  const unsub = onSnapshot(
    doc(db, 'systemConfig', CONFIG_DOC_ID),
    (snap) => {
      if (snap.exists()) {
        const normalized = normalizeSettings(snap.data() as Partial<EmailActivitySettings>);
        writeCache(normalized);
        onChange(normalized);
      } else {
        const defaults = normalizeSettings(DEFAULT_EMAIL_ACTIVITY_SETTINGS);
        writeCache(defaults);
        onChange(defaults);
      }
    },
    (err) => {
      console.warn('Email activity settings subscription note:', err);
      onChange(getCachedEmailActivitySettings());
    }
  );

  return unsub;
}

export async function saveEmailActivitySettings(
  partial: Partial<Omit<EmailActivitySettings, 'id' | 'updatedAt'>>,
  updatedBy?: string
): Promise<EmailActivitySettings> {
  const current = getCachedEmailActivitySettings();
  const payload: EmailActivitySettings = {
    id: CONFIG_DOC_ID,
    loginAlerts: partial.loginAlerts !== undefined ? Boolean(partial.loginAlerts) : current.loginAlerts,
    passwordChangeAlerts:
      partial.passwordChangeAlerts !== undefined
        ? Boolean(partial.passwordChangeAlerts)
        : current.passwordChangeAlerts,
    claimSubmissionAlerts:
      partial.claimSubmissionAlerts !== undefined
        ? Boolean(partial.claimSubmissionAlerts)
        : current.claimSubmissionAlerts,
    roleChangeAlerts:
      partial.roleChangeAlerts !== undefined
        ? Boolean(partial.roleChangeAlerts)
        : current.roleChangeAlerts,
    updatedAt: new Date().toISOString(),
    ...(updatedBy && updatedBy.trim() ? { updatedBy: updatedBy.trim().slice(0, 120) } : {}),
  };

  writeCache(payload);
  await setDoc(doc(db, 'systemConfig', CONFIG_DOC_ID), payload);
  return payload;
}
