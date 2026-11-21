import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { AppNotification } from '../types';
import { useAuth } from '../context/AuthContext';
import {
  canUserDeleteNotification,
  getPriorityMeta,
  isNotificationForUser,
  isNotificationUnreadForUser,
  markNotificationAsRead,
  subscribeToNotifications,
} from '../services/notificationService';
import { NotificationDetailModal } from './NotificationDetailModal';

const DISMISSED_TOASTS_KEY_PREFIX = 'ot_dismissed_push_toasts_';
const SESSION_SHOWN_ISLAND_PREFIX = 'ot_shown_island_';
const RECENT_PUSH_WINDOW_MS = 2 * 60 * 1000;

// Module-level session deduplication guard so re-mounts, StrictMode, or snapshot updates
// never replay the Dynamic Island animation twice for the same notification ID.
const shownIslandIdsSession = new Set<string>();

function readIdSet(storage: Storage, key: string): Set<string> {
  try {
    const raw = storage.getItem(key);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? new Set(parsed) : new Set();
  } catch {
    return new Set();
  }
}

function appendStoredId(storage: Storage, key: string, id: string): void {
  try {
    const existing = Array.from(readIdSet(storage, key));
    const next = Array.from(new Set([...existing, id])).slice(-200);
    storage.setItem(key, JSON.stringify(next));
  } catch {
    // ignore storage errors
  }
}

function hasShownIsland(userId: string, notifId: string): boolean {
  const compositeKey = `${userId}:${notifId}`;
  if (shownIslandIdsSession.has(compositeKey)) return true;
  const sessionIds = readIdSet(sessionStorage, `${SESSION_SHOWN_ISLAND_PREFIX}${userId}`);
  if (sessionIds.has(notifId)) {
    shownIslandIdsSession.add(compositeKey);
    return true;
  }
  const dismissedIds = readIdSet(localStorage, `${DISMISSED_TOASTS_KEY_PREFIX}${userId}`);
  return dismissedIds.has(notifId);
}

function markIslandShown(userId: string, notifId: string): void {
  shownIslandIdsSession.add(`${userId}:${notifId}`);
  appendStoredId(sessionStorage, `${SESSION_SHOWN_ISLAND_PREFIX}${userId}`, notifId);
}

type IslandPhase = 'dot' | 'expanded' | 'closing';

export const LiveNotificationToast: React.FC = () => {
  const { currentUser, userProfile, isSuperAdmin, isAdmin } = useAuth();
  const [allNotifications, setAllNotifications] = useState<AppNotification[]>([]);
  const [queue, setQueue] = useState<AppNotification[]>([]);
  const [islandPhase, setIslandPhase] = useState<IslandPhase>('dot');
  const [isPaused, setIsPaused] = useState(false);
  const [selectedNotificationId, setSelectedNotificationId] = useState<string | null>(null);
  const [fallbackSelectedNotification, setFallbackSelectedNotification] =
    useState<AppNotification | null>(null);

  const userProfileRef = useRef(userProfile);
  userProfileRef.current = userProfile;

  const mountedAtRef = useRef<number>(Date.now());
  const uid = userProfile?.id || currentUser?.uid || '';

  useEffect(() => {
    if (!uid) {
      setAllNotifications([]);
      setQueue([]);
      return;
    }

    mountedAtRef.current = Date.now();

    const unsubscribe = subscribeToNotifications((notificationsList, newlyAdded) => {
      setAllNotifications(notificationsList);
      const profileSnapshot = userProfileRef.current;
      const candidates: AppNotification[] = [];

      // 1. Live additions arriving via Firestore onSnapshot while session is active
      newlyAdded.forEach((n) => {
        if (!hasShownIsland(uid, n.id)) {
          candidates.push(n);
        }
      });

      // 2. Very recent unread notifications sent within the last 2 minutes on initial load
      notificationsList.forEach((n) => {
        if (hasShownIsland(uid, n.id)) return;
        const createdMs = new Date(n.createdAt).getTime();
        if (
          !Number.isNaN(createdMs) &&
          mountedAtRef.current - createdMs <= RECENT_PUSH_WINDOW_MS &&
          isNotificationUnreadForUser(n, uid)
        ) {
          candidates.push(n);
        } else {
          // Record older existing notifications so they do not pop later
          markIslandShown(uid, n.id);
        }
      });

      const validPushes: AppNotification[] = [];
      candidates.forEach((n) => {
        if (hasShownIsland(uid, n.id)) return;
        markIslandShown(uid, n.id);

        if (!n.sendViaApp) return;
        if (!isNotificationUnreadForUser(n, uid)) return;
        if (!isNotificationForUser(n, profileSnapshot, uid)) return;
        // Skip pushing back to sender unless they explicitly targeted themselves
        if (n.senderId === uid && n.targetScope !== 'users') return;

        validPushes.push(n);
      });

      if (validPushes.length > 0) {
        setQueue((prev) => {
          const existingIds = new Set(prev.map((item) => item.id));
          const uniqueIncoming = validPushes.filter((item) => !existingIds.has(item.id));
          if (uniqueIncoming.length === 0) return prev;
          return [...prev, ...uniqueIncoming].slice(0, 5);
        });
      }
    });

    return () => unsubscribe();
  }, [uid]);

  const activeNotif = queue[0] || null;

  // Drive single-shot Dynamic Island sequence: top-center dot -> smooth horizontal expansion
  useEffect(() => {
    if (!activeNotif) return;

    setIslandPhase('dot');
    setIsPaused(false);

    const expandTimer = setTimeout(() => {
      setIslandPhase('expanded');
    }, 150);

    return () => clearTimeout(expandTimer);
  }, [activeNotif?.id]);

  // Smooth auto-dismiss collapse after 6 seconds (unless hovered/focused)
  useEffect(() => {
    if (!activeNotif || islandPhase !== 'expanded' || isPaused) return;

    const closeTimer = setTimeout(() => {
      setIslandPhase('closing');
    }, 6200);

    return () => clearTimeout(closeTimer);
  }, [activeNotif?.id, islandPhase, isPaused]);

  // Remove current item once collapse transition finishes
  useEffect(() => {
    if (!activeNotif || islandPhase !== 'closing') return;

    const removeTimer = setTimeout(() => {
      if (uid) {
        appendStoredId(localStorage, `${DISMISSED_TOASTS_KEY_PREFIX}${uid}`, activeNotif.id);
      }
      setQueue((prev) => prev.filter((item) => item.id !== activeNotif.id));
    }, 320);

    return () => clearTimeout(removeTimer);
  }, [activeNotif?.id, islandPhase, uid]);

  const selectedNotification = useMemo(() => {
    if (!selectedNotificationId) return null;
    return (
      allNotifications.find((n) => n.id === selectedNotificationId) || fallbackSelectedNotification
    );
  }, [selectedNotificationId, allNotifications, fallbackSelectedNotification]);

  const dismissCurrent = (notifId: string) => {
    if (uid) {
      appendStoredId(localStorage, `${DISMISSED_TOASTS_KEY_PREFIX}${uid}`, notifId);
    }
    setIslandPhase('closing');
  };

  const openDetails = async (notif: AppNotification) => {
    if (uid) {
      appendStoredId(localStorage, `${DISMISSED_TOASTS_KEY_PREFIX}${uid}`, notif.id);
    }
    setQueue((prev) => prev.filter((item) => item.id !== notif.id));
    setFallbackSelectedNotification(notif);
    setSelectedNotificationId(notif.id);
    if (uid) {
      await markNotificationAsRead(notif.id, uid, userProfileRef.current);
    }
  };

  const priorityMeta = activeNotif ? getPriorityMeta(activeNotif.priority) : null;
  const isExpanded = islandPhase === 'expanded';
  const isClosing = islandPhase === 'closing';

  return (
    <>
      {activeNotif && priorityMeta && (
        <div
          aria-live="polite"
          className="fixed top-2.5 sm:top-3.5 left-1/2 -translate-x-1/2 z-[110] pointer-events-none flex justify-center w-full px-3"
        >
          <div
            key={activeNotif.id}
            role="button"
            tabIndex={0}
            onMouseEnter={() => setIsPaused(true)}
            onMouseLeave={() => setIsPaused(false)}
            onFocus={() => setIsPaused(true)}
            onBlur={() => setIsPaused(false)}
            onClick={() => openDetails(activeNotif)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                openDetails(activeNotif);
              }
            }}
            aria-label={`New notification: ${activeNotif.heading}. Click to view full details.`}
            className={`pointer-events-auto animate-dynamic-island-dot flex items-center justify-center overflow-hidden rounded-full bg-slate-950/95 text-white border border-slate-700/80 shadow-[0_14px_34px_rgba(2,6,23,0.48)] backdrop-blur-md cursor-pointer select-none focus:outline-hidden focus:ring-2 focus:ring-indigo-400 transition-[min-width,max-width,height,padding,opacity,transform] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${
              isExpanded
                ? 'h-10 sm:h-11 w-fit min-w-[min(64vw,15rem)] max-w-[min(92vw,26rem)] px-3.5 sm:px-4 gap-2.5 opacity-100 scale-100'
                : isClosing
                ? 'h-9 w-fit min-w-[2.25rem] max-w-[2.25rem] px-0 gap-0 opacity-0 scale-75'
                : 'h-9 w-fit min-w-[2.25rem] max-w-[2.25rem] px-0 gap-0 opacity-100 scale-100'
            }`}
          >
            {/* Priority Color Dot */}
            <span
              className={`w-2.5 h-2.5 rounded-full shrink-0 transition-transform duration-300 ${priorityMeta.dotColorClass} ${
                isExpanded ? 'scale-100' : 'scale-125'
              }`}
            />

            {/* Heading Only (Smoothly Revealed During Horizontal Expansion) */}
            <span
              className={`text-xs sm:text-sm font-semibold text-white truncate transition-opacity duration-300 ${
                isExpanded ? 'opacity-100 flex-1 min-w-0 delay-100' : 'opacity-0 w-0 overflow-hidden'
              }`}
            >
              {activeNotif.heading}
            </span>

            {/* Subtle Dismiss Control */}
            {isExpanded && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  dismissCurrent(activeNotif.id);
                }}
                className="p-1 -mr-1 rounded-full text-slate-400 hover:text-white hover:bg-white/10 transition cursor-pointer shrink-0"
                aria-label="Dismiss notification"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      )}

      <NotificationDetailModal
        notification={selectedNotification}
        currentUserId={uid}
        currentUserProfile={userProfile}
        isAdminView={isAdmin}
        canDelete={canUserDeleteNotification(
          selectedNotification,
          userProfile,
          currentUser?.uid,
          isSuperAdmin
        )}
        onDeleted={(deletedId) => {
          setAllNotifications((prev) => prev.filter((item) => item.id !== deletedId));
          setQueue((prev) => prev.filter((item) => item.id !== deletedId));
        }}
        onClose={() => {
          setSelectedNotificationId(null);
          setFallbackSelectedNotification(null);
        }}
      />
    </>
  );
};
