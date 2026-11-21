import { doc, getDocFromServer, onSnapshot, setDoc } from 'firebase/firestore';
import { registerSW } from 'virtual:pwa-register';
import { db } from '../firebase/config';
import { OperationType, handleFirestoreError } from '../firebase/errors';
import { sanitizeFirestoreData } from '../utils/firestoreUtils';

export interface OtaReleaseSignal {
  id: string;
  version: string;
  buildTime?: string;
  commitSha?: string;
  releaseNotes?: string;
  forceImmediate?: boolean;
  broadcastId?: string;
  updatedAt: string;
  updatedBy?: string;
}

export type OtaUpdateStatus =
  | 'idle'
  | 'checking'
  | 'downloading'
  | 'ready_with_unsaved'
  | 'applying'
  | 'up_to_date';

export interface OtaState {
  currentVersion: string;
  currentBuildTime: string;
  currentCommitSha: string;
  remoteRelease: OtaReleaseSignal | null;
  availableVersion: string | null;
  releaseNotes: string | null;
  status: OtaUpdateStatus;
  hasUnsavedWork: boolean;
  lastCheckedAt: string | null;
  error: string | null;
}

export const APP_BUILD_INFO = {
  version: typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev-local',
  buildTime: typeof __APP_BUILD_TIME__ !== 'undefined' ? __APP_BUILD_TIME__ : new Date().toISOString(),
  commitSha: typeof __APP_COMMIT_SHA__ !== 'undefined' ? __APP_COMMIT_SHA__ : 'local',
};

const SYSTEM_CONFIG_COLLECTION = 'systemConfig';
const APP_RELEASE_DOC_ID = 'appRelease';
const TAB_RESTORE_KEY = 'ot_ota_restore_tab';
const LAST_RELOADED_VERSION_KEY = 'ot_ota_last_reloaded_version';
const LAST_RELOADED_AT_KEY = 'ot_ota_last_reloaded_at';
const RELOAD_COOLDOWN_MS = 25000;
const FALLBACK_POLL_INTERVAL_MS = 60000;

let state: OtaState = {
  currentVersion: APP_BUILD_INFO.version,
  currentBuildTime: APP_BUILD_INFO.buildTime,
  currentCommitSha: APP_BUILD_INFO.commitSha,
  remoteRelease: null,
  availableVersion: null,
  releaseNotes: null,
  status: 'idle',
  hasUnsavedWork: false,
  lastCheckedAt: null,
  error: null,
};

const listeners = new Set<(next: OtaState) => void>();
let swRegistration: ServiceWorkerRegistration | null = null;
let updateSWFn: ((reloadPage?: boolean) => Promise<void>) | null = null;
let isApplyingUpdate = false;
let activeTabProvider: (() => string) | null = null;
let autoApplyTimer: ReturnType<typeof setTimeout> | null = null;

function emitState(partial?: Partial<OtaState>) {
  if (partial) {
    state = { ...state, ...partial };
  }
  const snapshot = { ...state };
  listeners.forEach((cb) => {
    try {
      cb(snapshot);
    } catch {
      // ignore subscriber errors
    }
  });
}

export function getOtaState(): OtaState {
  return { ...state };
}

export function subscribeOtaState(listener: (next: OtaState) => void): () => void {
  listeners.add(listener);
  listener({ ...state });
  return () => {
    listeners.delete(listener);
  };
}

export function registerOtaTabProvider(provider: () => string): () => void {
  activeTabProvider = provider;
  return () => {
    if (activeTabProvider === provider) {
      activeTabProvider = null;
    }
  };
}

export function consumeRestoredTabAfterOta(): string | null {
  try {
    const saved = sessionStorage.getItem(TAB_RESTORE_KEY);
    if (saved) {
      sessionStorage.removeItem(TAB_RESTORE_KEY);
      return saved;
    }
  } catch {
    // ignore storage access issues
  }
  return null;
}

export function setOtaUnsavedWork(hasUnsaved: boolean): void {
  if (state.hasUnsavedWork === hasUnsaved) return;
  emitState({ hasUnsavedWork: hasUnsaved });

  // As soon as unsaved work is cleared/saved while an update was waiting, apply automatically
  if (!hasUnsaved && state.status === 'ready_with_unsaved' && state.availableVersion) {
    applyOtaUpdate();
  }
}

function wasRecentlyReloadedFor(version: string): boolean {
  try {
    const lastVer = sessionStorage.getItem(LAST_RELOADED_VERSION_KEY);
    const lastAt = Number(sessionStorage.getItem(LAST_RELOADED_AT_KEY) || '0');
    if (lastVer === version && Date.now() - lastAt < RELOAD_COOLDOWN_MS) {
      return true;
    }
  } catch {
    // ignore sessionStorage issues
  }
  return false;
}

function markReloadAttempted(version: string): void {
  try {
    sessionStorage.setItem(LAST_RELOADED_VERSION_KEY, version);
    sessionStorage.setItem(LAST_RELOADED_AT_KEY, String(Date.now()));
  } catch {
    // ignore sessionStorage issues
  }
}

async function fetchLiveVersionManifest(): Promise<{ version: string; buildTime?: string; commitSha?: string } | null> {
  try {
    const res = await fetch(`/version.json?t=${Date.now()}`, {
      cache: 'no-store',
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        Pragma: 'no-cache',
      },
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data && typeof data.version === 'string' && data.version.trim()) {
      return data;
    }
  } catch {
    // offline or transient network error
  }
  return null;
}

async function warmServiceWorkerAssets(): Promise<void> {
  if (!swRegistration) return;
  try {
    await swRegistration.update();
    if (swRegistration.waiting) {
      swRegistration.waiting.postMessage({ type: 'SKIP_WAITING' });
    }
  } catch {
    // non-fatal; reload will still fetch fresh index.html
  }
}

export async function applyOtaUpdate(): Promise<void> {
  if (isApplyingUpdate) return;
  const targetVersion = state.availableVersion || 'latest';

  if (wasRecentlyReloadedFor(targetVersion)) {
    emitState({
      status: 'idle',
      error: 'Update already applied; waiting for CDN edge sync.',
    });
    return;
  }

  isApplyingUpdate = true;
  if (autoApplyTimer) {
    clearTimeout(autoApplyTimer);
    autoApplyTimer = null;
  }

  emitState({ status: 'applying', error: null });

  try {
    if (activeTabProvider) {
      const currentTab = activeTabProvider();
      if (currentTab) {
        sessionStorage.setItem(TAB_RESTORE_KEY, currentTab);
      }
    }
  } catch {
    // ignore sessionStorage error
  }

  markReloadAttempted(targetVersion);

  await warmServiceWorkerAssets();

  setTimeout(async () => {
    try {
      if (updateSWFn) {
        await updateSWFn(true);
      }
    } catch {
      // fallback to standard reload below
    }
    window.location.reload();
  }, 450);
}

async function handleNewVersionDetected(
  newVersion: string,
  releaseNotes?: string | null,
  skipConfirmWait = false
): Promise<void> {
  if (!newVersion || newVersion === APP_BUILD_INFO.version) return;
  if (wasRecentlyReloadedFor(newVersion)) return;
  if (isApplyingUpdate) return;

  emitState({
    availableVersion: newVersion,
    releaseNotes: releaseNotes || state.releaseNotes || 'A new application version has been deployed.',
    status: 'downloading',
    error: null,
  });

  // Pre-fetch the new Service Worker & assets silently in the background
  await warmServiceWorkerAssets();

  if (state.hasUnsavedWork && !skipConfirmWait) {
    emitState({ status: 'ready_with_unsaved' });
    return;
  }

  // User is idle / viewing non-dirty screen: apply seamlessly without requiring manual refresh
  if (autoApplyTimer) clearTimeout(autoApplyTimer);
  autoApplyTimer = setTimeout(() => {
    if (state.hasUnsavedWork && !skipConfirmWait) {
      emitState({ status: 'ready_with_unsaved' });
      return;
    }
    applyOtaUpdate();
  }, 350);
}

export async function checkForOtaUpdateNow(): Promise<{ updateFound: boolean; version: string | null }> {
  if (isApplyingUpdate) {
    return { updateFound: true, version: state.availableVersion };
  }

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return { updateFound: false, version: null };
  }

  emitState({
    status: state.status === 'ready_with_unsaved' ? 'ready_with_unsaved' : 'checking',
    error: null,
  });

  const manifest = await fetchLiveVersionManifest();
  const checkedAt = new Date().toISOString();

  if (manifest && manifest.version && manifest.version !== APP_BUILD_INFO.version) {
    emitState({ lastCheckedAt: checkedAt });
    await handleNewVersionDetected(manifest.version, state.remoteRelease?.releaseNotes);
    return { updateFound: true, version: manifest.version };
  }

  if (swRegistration) {
    try {
      await swRegistration.update();
    } catch {
      // ignore SW update check error when offline
    }
  }

  emitState({
    lastCheckedAt: checkedAt,
    status: state.status === 'ready_with_unsaved' ? 'ready_with_unsaved' : 'up_to_date',
  });

  return { updateFound: false, version: APP_BUILD_INFO.version };
}

/**
 * Publishes an instant OTA release signal to Firestore (`systemConfig/appRelease`).
 * All currently open browser tabs receive this via `onSnapshot` in < 1 second.
 */
export async function publishOtaReleaseSignal(options?: {
  releaseNotes?: string;
  updatedBy?: string;
  forceImmediate?: boolean;
}): Promise<OtaReleaseSignal> {
  const manifest = await fetchLiveVersionManifest();
  const latestVersion = manifest?.version || APP_BUILD_INFO.version;
  const nowIso = new Date().toISOString();

  const payload: OtaReleaseSignal = {
    id: APP_RELEASE_DOC_ID,
    version: latestVersion,
    buildTime: manifest?.buildTime || APP_BUILD_INFO.buildTime,
    commitSha: manifest?.commitSha || APP_BUILD_INFO.commitSha,
    releaseNotes: (options?.releaseNotes || 'Live application update published').trim().slice(0, 280),
    forceImmediate: options?.forceImmediate ?? true,
    broadcastId: `rel_${Date.now()}`,
    updatedAt: nowIso,
    updatedBy: (options?.updatedBy || 'Super Admin').trim().slice(0, 100),
  };

  const docPath = `${SYSTEM_CONFIG_COLLECTION}/${APP_RELEASE_DOC_ID}`;
  try {
    await setDoc(
      doc(db, SYSTEM_CONFIG_COLLECTION, APP_RELEASE_DOC_ID),
      sanitizeFirestoreData(payload)
    );
    emitState({ remoteRelease: payload });
    return payload;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, docPath);
  }
}

/**
 * Initializes the multi-layer OTA Updater:
 * 1. Service Worker (`vite-plugin-pwa`) auto-update + `controllerchange` listener
 * 2. Real-time Firestore `onSnapshot` push listener on `systemConfig/appRelease`
 * 3. Lightweight `/version.json` validation on visibility/focus + 60s fallback
 */
export function initOtaUpdater(): () => void {
  const cleanups: Array<() => void> = [];
  let lastHandledBroadcastId: string | null = null;
  let cdnVerifyTimer: ReturnType<typeof setTimeout> | null = null;

  // 1. Validate Firestore connectivity unobtrusively
  getDocFromServer(doc(db, 'test', 'connection')).catch((error) => {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn('Firestore connection offline during OTA init.');
    }
  });

  // 2. Register Service Worker in production builds
  if (import.meta.env.PROD && typeof window !== 'undefined' && 'serviceWorker' in navigator) {
    try {
      const updateSW = registerSW({
        immediate: true,
        onRegisteredSW(_swUrl, registration) {
          if (registration) {
            swRegistration = registration;
          }
        },
        onNeedRefresh() {
          // Workbox found a new precache manifest on Vercel
          fetchLiveVersionManifest().then((manifest) => {
            const targetVer = manifest?.version || `sw-${Date.now()}`;
            if (targetVer !== APP_BUILD_INFO.version) {
              handleNewVersionDetected(targetVer, state.remoteRelease?.releaseNotes);
            }
          });
        },
        onRegisterError(err) {
          console.warn('Service worker registration note:', err);
        },
      });
      updateSWFn = updateSW;

      let refreshingOnControllerChange = false;
      const handleControllerChange = () => {
        if (refreshingOnControllerChange || isApplyingUpdate) return;
        if (state.hasUnsavedWork) {
          emitState({ status: 'ready_with_unsaved' });
          return;
        }
        refreshingOnControllerChange = true;
        applyOtaUpdate();
      };
      navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange);
      cleanups.push(() =>
        navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange)
      );
    } catch (err) {
      console.warn('PWA register skipped:', err);
    }
  }

  // 3. Real-time Firestore Push Listener (<1s notification when Vercel deployment completes)
  const docPath = `${SYSTEM_CONFIG_COLLECTION}/${APP_RELEASE_DOC_ID}`;
  try {
    const unsubFirestore = onSnapshot(
      doc(db, SYSTEM_CONFIG_COLLECTION, APP_RELEASE_DOC_ID),
      (snapshot) => {
        if (!snapshot.exists()) return;
        const remote = snapshot.data() as OtaReleaseSignal;
        emitState({ remoteRelease: remote });

        const isNewBroadcast =
          Boolean(remote.broadcastId) && remote.broadcastId !== lastHandledBroadcastId;
        const isDifferentVersion =
          Boolean(remote.version) && remote.version !== APP_BUILD_INFO.version;

        if (!isDifferentVersion && !isNewBroadcast) return;
        if (remote.broadcastId) {
          lastHandledBroadcastId = remote.broadcastId;
        }

        // Verify the hosting CDN (/version.json) is actively serving the new build before reloading
        // so open tabs never reload into a stale edge cache or loop in dev preview.
        let attempts = 0;
        const verifyAndApply = async () => {
          attempts += 1;
          const live = await fetchLiveVersionManifest();
          if (live && live.version !== APP_BUILD_INFO.version) {
            await handleNewVersionDetected(live.version, remote.releaseNotes);
            return;
          }
          if (isDifferentVersion && attempts < 4) {
            cdnVerifyTimer = setTimeout(verifyAndApply, 2500);
          }
        };

        verifyAndApply();
      },
      (error) => {
        console.warn('OTA Firestore listener note:', docPath, error);
      }
    );
    cleanups.push(unsubFirestore);
  } catch (err) {
    console.warn('Could not attach OTA Firestore listener:', err);
  }

  // 4. Automatic fallback check on tab focus, visibility restore, online reconnect, and 60s timer
  const handleCheck = () => {
    if (document.visibilityState === 'visible') {
      checkForOtaUpdateNow();
    }
  };

  window.addEventListener('focus', handleCheck);
  document.addEventListener('visibilitychange', handleCheck);
  window.addEventListener('online', handleCheck);
  cleanups.push(() => {
    window.removeEventListener('focus', handleCheck);
    document.removeEventListener('visibilitychange', handleCheck);
    window.removeEventListener('online', handleCheck);
  });

  const pollId = setInterval(() => {
    if (document.visibilityState === 'visible' && navigator.onLine) {
      checkForOtaUpdateNow();
    }
  }, FALLBACK_POLL_INTERVAL_MS);
  cleanups.push(() => clearInterval(pollId));

  // Run an initial background version check shortly after boot
  const bootCheckTimer = setTimeout(() => {
    checkForOtaUpdateNow();
  }, 4000);
  cleanups.push(() => clearTimeout(bootCheckTimer));

  return () => {
    if (cdnVerifyTimer) clearTimeout(cdnVerifyTimer);
    if (autoApplyTimer) clearTimeout(autoApplyTimer);
    cleanups.forEach((fn) => fn());
  };
}
