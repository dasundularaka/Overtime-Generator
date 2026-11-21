import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X, ArrowUpRight, Clock, CheckCircle2 } from 'lucide-react';
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
const RECENT_PUSH_WINDOW_MS = 2 * 60 * 1000; // 2 minutes for notifications sent just before opening

function readDismissedToastIds(userId: string): Set<string> {
  try {
    const raw = localStorage.getItem(`${DISMISSED_TOASTS_KEY_PREFIX}${userId}`);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? new Set(parsed) : new Set();
  } catch {
    return new Set();
  }
}

function saveDismissedToastId(userId: string, notifId: string): void {
  try {
    const existing = Array.from(readDismissedToastIds(userId));
    const next = Array.from(new Set([...existing, notifId])).slice(-150);
    localStorage.setItem(`${DISMISSED_TOASTS_KEY_PREFIX}${userId}`, JSON.stringify(next));
  } catch {
    // ignore storage errors
  }
}

export const LiveNotificationToast: React.FC = () => {
  const { currentUser, userProfile, isSuperAdmin, isAdmin } = useAuth();
  const [allNotifications, setAllNotifications] = useState<AppNotification[]>([]);
  const [activeToasts, setActiveToasts] = useState<AppNotification[]>([]);
  const [selectedNotificationId, setSelectedNotificationId] = useState<string | null>(null);
  const [fallbackSelectedNotification, setFallbackSelectedNotification] =
    useState<AppNotification | null>(null);
  const seenSessionIdsRef = useRef<Set<string>>(new Set());
  const mountedAtRef = useRef<number>(Date.now());
  const hoveredIdRef = useRef<string | null>(null);

  const uid = userProfile?.id || currentUser?.uid || '';

  useEffect(() => {
    if (!uid) {
      setAllNotifications([]);
      setActiveToasts([]);
      return;
    }

    const dismissed = readDismissedToastIds(uid);

    const unsubscribe = subscribeToNotifications((notificationsList, newlyAdded) => {
      setAllNotifications(notificationsList);
      const candidates: AppNotification[] = [];

      // 1. Live additions arriving via Firestore onSnapshot while tab is open
      newlyAdded.forEach((n) => {
        if (!seenSessionIdsRef.current.has(n.id)) {
          candidates.push(n);
        }
      });

      // 2. Also surface very recent unread push notifications (sent within last 2 mins) on load
      notificationsList.forEach((n) => {
        if (seenSessionIdsRef.current.has(n.id)) return;
        const createdMs = new Date(n.createdAt).getTime();
        if (
          !Number.isNaN(createdMs) &&
          mountedAtRef.current - createdMs <= RECENT_PUSH_WINDOW_MS &&
          isNotificationUnreadForUser(n, uid)
        ) {
          candidates.push(n);
        } else {
          seenSessionIdsRef.current.add(n.id);
        }
      });

      const validPushes = candidates.filter((n) => {
        seenSessionIdsRef.current.add(n.id);
        if (!n.sendViaApp) return false;
        if (dismissed.has(n.id)) return false;
        if (!isNotificationUnreadForUser(n, uid)) return false;
        if (!isNotificationForUser(n, userProfile, uid)) return false;
        // Skip popping a toast back to the sender unless they explicitly targeted themselves by user ID
        if (n.senderId === uid && n.targetScope !== 'users') return false;
        return true;
      });

      if (validPushes.length > 0) {
        setActiveToasts((prev) => {
          const existingIds = new Set(prev.map((p) => p.id));
          const merged = [...validPushes.filter((p) => !existingIds.has(p.id)), ...prev];
          return merged.slice(0, 3);
        });
      }
    });

    return () => unsubscribe();
  }, [uid, userProfile]);

  const selectedNotification = useMemo(() => {
    if (!selectedNotificationId) return null;
    return (
      allNotifications.find((n) => n.id === selectedNotificationId) || fallbackSelectedNotification
    );
  }, [selectedNotificationId, allNotifications, fallbackSelectedNotification]);

  // Auto-dismiss pushed notifications smoothly after 10s unless hovered
  useEffect(() => {
    if (activeToasts.length === 0 || !uid) return;
    const timer = setInterval(() => {
      setActiveToasts((prev) => {
        if (prev.length === 0) return prev;
        const oldest = prev[prev.length - 1];
        if (hoveredIdRef.current === oldest.id) return prev;
        saveDismissedToastId(uid, oldest.id);
        return prev.slice(0, -1);
      });
    }, 9500);
    return () => clearInterval(timer);
  }, [activeToasts.length, uid]);

  const dismissToast = (notifId: string) => {
    if (uid) saveDismissedToastId(uid, notifId);
    setActiveToasts((prev) => prev.filter((n) => n.id !== notifId));
  };

  const handleMarkReadToast = async (e: React.MouseEvent, notif: AppNotification) => {
    e.stopPropagation();
    dismissToast(notif.id);
    if (uid) {
      await markNotificationAsRead(notif.id, uid, userProfile);
    }
  };

  const openToastDetails = async (notif: AppNotification) => {
    dismissToast(notif.id);
    setFallbackSelectedNotification(notif);
    setSelectedNotificationId(notif.id);
    if (uid) {
      await markNotificationAsRead(notif.id, uid, userProfile);
    }
  };

  return (
    <>
      {activeToasts.length > 0 && (
        <div
          aria-live="polite"
          className="fixed top-3 sm:top-20 left-3 right-3 sm:left-auto sm:right-4 z-[75] flex flex-col gap-2.5 sm:w-[min(92vw,25rem)] max-w-[calc(100vw-1.5rem)] max-h-[calc(100dvh-2rem)] sm:max-h-[calc(100dvh-6rem)] overflow-y-auto pointer-events-none"
        >
          {activeToasts.map((notif) => {
            const pMeta = getPriorityMeta(notif.priority);
            return (
              <div
                key={notif.id}
                onMouseEnter={() => {
                  hoveredIdRef.current = notif.id;
                }}
                onMouseLeave={() => {
                  if (hoveredIdRef.current === notif.id) hoveredIdRef.current = null;
                }}
                onClick={() => openToastDetails(notif)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    openToastDetails(notif);
                  }
                }}
                className="pointer-events-auto group relative rounded-2xl bg-white/95 backdrop-blur-md border border-slate-200/90 shadow-2xl overflow-hidden cursor-pointer transition-transform duration-200 hover:-translate-y-0.5 animate-notification-pop focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
              >
                {/* Top Priority Accent Bar */}
                <div className={`h-1 w-full ${pMeta.accentBarClass}`} />

                <div className="p-3.5 sm:p-4 space-y-2.5">
                  {/* Top Row: Heading Left Top Corner, Priority Colour Right Top Corner */}
                  <div className="flex items-start justify-between gap-2.5">
                    <h4 className="text-xs sm:text-sm font-bold text-slate-900 leading-snug line-clamp-2 flex-1 min-w-0">
                      {notif.heading}
                    </h4>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold border ${pMeta.badgeClasses}`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${pMeta.dotColorClass}`} />
                        <span>{pMeta.label}</span>
                      </span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          dismissToast(notif.id);
                        }}
                        className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
                        aria-label="Dismiss notification"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Body + Optional Supported Image Preview */}
                  <div className="flex items-start gap-3">
                    <p className="text-xs text-slate-600 leading-relaxed line-clamp-3 flex-1 min-w-0">
                      {notif.body}
                    </p>
                    {notif.imageUrl && (
                      <img
                        src={notif.imageUrl}
                        alt=""
                        referrerPolicy="no-referrer"
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).style.display = 'none';
                        }}
                        className="w-12 h-12 rounded-xl object-cover border border-slate-200 shrink-0 bg-slate-100"
                      />
                    )}
                  </div>

                  {/* Quiet Footer Metadata + Mark Read Action */}
                  <div className="pt-1.5 border-t border-slate-100 flex items-center justify-between gap-2 text-[11px] text-slate-500">
                    <div className="truncate min-w-0">
                      <span className="font-medium text-slate-700">{notif.senderName}</span>
                      <span aria-hidden="true"> &middot; </span>
                      <span>{notif.senderBranch}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={(e) => handleMarkReadToast(e, notif)}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-semibold transition cursor-pointer whitespace-nowrap"
                      >
                        <CheckCircle2 className="w-3 h-3" />
                        <span>Mark Read</span>
                      </button>
                      <span className="inline-flex items-center gap-0.5 text-indigo-600 font-semibold group-hover:underline">
                        <Clock className="w-3 h-3 mr-0.5 text-slate-400" />
                        <span>View</span>
                        <ArrowUpRight className="w-3 h-3" />
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
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
          setActiveToasts((prev) => prev.filter((item) => item.id !== deletedId));
        }}
        onClose={() => {
          setSelectedNotificationId(null);
          setFallbackSelectedNotification(null);
        }}
      />
    </>
  );
};
