import React, { useEffect, useMemo, useState } from 'react';
import {
  X,
  Mail,
  Bell,
  Clock,
  Building2,
  User,
  Users,
  Trash2,
  CheckCircle2,
  CheckCheck,
  ImageOff,
  Eye,
  Search,
  ChevronDown,
  AlertCircle,
} from 'lucide-react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase/config';
import { AppNotification, UserProfile } from '../types';
import {
  deleteNotificationById,
  getNotificationReadSummary,
  getPriorityMeta,
  getUserReadTimestamp,
  hasUserReadNotification,
  isNotificationForUser,
  markNotificationAsRead,
  ReaderProfileSummary,
} from '../services/notificationService';

interface NotificationDetailModalProps {
  notification: AppNotification | null;
  currentUserId?: string | null;
  currentUserProfile?: (ReaderProfileSummary & Partial<UserProfile>) | null;
  isAdminView?: boolean;
  allUsers?: UserProfile[];
  canDelete?: boolean;
  onClose: () => void;
  onDeleted?: (id: string) => void;
}

export const NotificationDetailModal: React.FC<NotificationDetailModalProps> = ({
  notification,
  currentUserId,
  currentUserProfile,
  isAdminView = false,
  allUsers,
  canDelete = false,
  onClose,
  onDeleted,
}) => {
  const [imageError, setImageError] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isMarkingRead, setIsMarkingRead] = useState(false);
  const [optimisticReadAt, setOptimisticReadAt] = useState<string | null>(null);
  const [fallbackUsers, setFallbackUsers] = useState<UserProfile[]>([]);
  const [receiptFilter, setReceiptFilter] = useState<'all' | 'opened' | 'unopened'>('all');
  const [receiptSearch, setReceiptSearch] = useState('');
  const [showRecipientList, setShowRecipientList] = useState(true);

  useEffect(() => {
    setImageError(false);
    setConfirmingDelete(false);
    setDeleteError(null);
    setOptimisticReadAt(null);
    setReceiptFilter('all');
    setReceiptSearch('');
    setShowRecipientList(true);
  }, [notification?.id]);

  // If opened outside NotificationCenter (e.g. from LiveNotificationToast) by an admin, load user directory for recipient breakdown
  useEffect(() => {
    if (!notification || !isAdminView || (allUsers && allUsers.length > 0)) {
      return;
    }
    const unsub = onSnapshot(
      collection(db, 'users'),
      (snap) => {
        setFallbackUsers(
          snap.docs.map((d) => {
            const data = d.data() as UserProfile;
            return { ...data, id: data.id || d.id };
          })
        );
      },
      () => {}
    );
    return () => unsub();
  }, [notification?.id, isAdminView, allUsers]);

  const effectiveUsers = allUsers && allUsers.length > 0 ? allUsers : fallbackUsers;

  const readSummary = useMemo(() => {
    if (!notification || !isAdminView) return null;
    return getNotificationReadSummary(notification, effectiveUsers);
  }, [notification, isAdminView, effectiveUsers]);

  const filteredRecipients = useMemo(() => {
    if (!readSummary) return [];
    const q = receiptSearch.trim().toLowerCase();
    return readSummary.recipients.filter((r) => {
      if (receiptFilter === 'opened' && !r.hasRead) return false;
      if (receiptFilter === 'unopened' && r.hasRead) return false;
      if (!q) return true;
      return (
        r.name.toLowerCase().includes(q) ||
        (r.pfNumber || '').toLowerCase().includes(q) ||
        (r.branch || '').toLowerCase().includes(q)
      );
    });
  }, [readSummary, receiptFilter, receiptSearch]);

  if (!notification) return null;

  const priorityMeta = getPriorityMeta(notification.priority);
  const hasReadInDb = hasUserReadNotification(notification, currentUserId);
  const hasRead = hasReadInDb || Boolean(optimisticReadAt);
  const readAtIso = getUserReadTimestamp(notification, currentUserId) || optimisticReadAt;
  const isSenderBroadcast =
    Boolean(currentUserId) &&
    notification.senderId === currentUserId &&
    notification.targetScope !== 'users';
  const isRecipientOfNotification =
    Boolean(currentUserId) &&
    !isSenderBroadcast &&
    (isNotificationForUser(notification, (currentUserProfile as UserProfile) || null, currentUserId || '') ||
      (notification.targetUserIds || []).includes(currentUserId || ''));

  const handleMarkRead = async () => {
    if (!currentUserId || hasRead || isMarkingRead) return;
    setIsMarkingRead(true);
    try {
      const nowIso = new Date().toISOString();
      setOptimisticReadAt(nowIso);
      await markNotificationAsRead(notification.id, currentUserId, currentUserProfile);
    } finally {
      setIsMarkingRead(false);
    }
  };

  const handleDelete = async () => {
    if (!canDelete || isDeleting) return;
    setDeleteError(null);
    setIsDeleting(true);
    try {
      await deleteNotificationById(notification);
      setConfirmingDelete(false);
      onDeleted?.(notification.id);
      onClose();
    } catch (err: any) {
      console.error('Failed to delete notification:', err);
      setDeleteError(err?.message || 'Could not delete this notification. Please try again.');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] modal-backdrop-safe flex items-center justify-center p-3 sm:p-4 md:p-6 bg-slate-950/65 backdrop-blur-xs animate-fade-in"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="notification-detail-heading"
    >
      <div
        className="relative w-full sm:w-[min(94vw,44rem)] modal-panel-safe max-h-[90dvh] rounded-2xl bg-white border border-slate-200 shadow-2xl overflow-hidden animate-scale-in flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Accent Line matching Priority */}
        <div className={`h-1.5 w-full shrink-0 ${priorityMeta.accentBarClass}`} />

        {/* Pinned Header: Heading Top-Left & Priority Color + Close Top-Right */}
        <div className="px-4 pt-3.5 pb-3 sm:px-5 sm:pt-4 sm:pb-3 border-b border-slate-100 flex items-start justify-between gap-3 shrink-0">
          <div className="min-w-0 flex-1">
            <h2
              id="notification-detail-heading"
              className="text-base sm:text-lg font-bold text-slate-900 leading-snug break-words"
            >
              {notification.heading}
            </h2>
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <span className="inline-flex items-center gap-1">
                <User className="w-3.5 h-3.5 text-slate-400" />
                <span className="font-medium text-slate-700">{notification.senderName}</span>
              </span>
              <span aria-hidden="true">&middot;</span>
              <span className="inline-flex items-center gap-1">
                <Building2 className="w-3.5 h-3.5 text-slate-400" />
                <span>{notification.senderBranch}</span>
              </span>
              <span aria-hidden="true">&middot;</span>
              <span className="inline-flex items-center gap-1 tabular-nums">
                <Clock className="w-3.5 h-3.5 text-slate-400" />
                <span>{new Date(notification.createdAt).toLocaleString()}</span>
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold border ${priorityMeta.badgeClasses}`}
            >
              <span className={`w-2 h-2 rounded-full ${priorityMeta.dotColorClass}`} />
              <span>{priorityMeta.label}</span>
            </span>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
              aria-label="Close notification details"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Scrollable Content Body */}
        <div className="p-4 sm:p-5 space-y-4 overflow-y-auto overscroll-contain flex-1 min-h-0">
          {/* Supported Image (if attached) */}
          {notification.imageUrl && (
            <div className="rounded-xl overflow-hidden border border-slate-200 bg-slate-50">
              {!imageError ? (
                <img
                  src={notification.imageUrl}
                  alt={notification.heading}
                  referrerPolicy="no-referrer"
                  onError={() => setImageError(true)}
                  className="w-full max-h-[34dvh] sm:max-h-72 object-contain bg-slate-100"
                />
              ) : (
                <div className="h-36 flex flex-col items-center justify-center gap-1.5 text-slate-400 text-xs p-4">
                  <ImageOff className="w-6 h-6" />
                  <span>Attached image preview unavailable</span>
                </div>
              )}
            </div>
          )}

          {/* Full Message Body */}
          <div className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap break-words">
            {notification.body}
          </div>

          {/* Delivery & Target Details */}
          <div className="pt-3 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div>
              <span className="text-[11px] font-semibold text-slate-400 block">Target Audience</span>
              <span className="mt-0.5 inline-flex items-center gap-1.5 font-semibold text-slate-800">
                <Users className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                <span>{notification.targetLabel || notification.targetBranch || 'Targeted Staff'}</span>
              </span>
            </div>

            <div>
              <span className="text-[11px] font-semibold text-slate-400 block">Delivery Channels</span>
              <div className="mt-0.5 flex flex-wrap items-center gap-3 text-slate-700 font-medium">
                {notification.sendViaApp && (
                  <span className="inline-flex items-center gap-1">
                    <Bell className="w-3.5 h-3.5 text-indigo-600" />
                    <span>In-App Push</span>
                  </span>
                )}
                {notification.sendViaEmail && (
                  <span className="inline-flex items-center gap-1">
                    <Mail className="w-3.5 h-3.5 text-blue-600" />
                    <span>
                      Email (Make)
                      {typeof notification.emailDispatchedCount === 'number' &&
                      notification.emailDispatchedCount > 0
                        ? ` (${notification.emailDispatchedCount} sent)`
                        : notification.emailDispatchStatus === 'failed'
                        ? ' (Dispatch failed)'
                        : ''}
                    </span>
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Admin Read-Receipt Summary Section */}
          {isAdminView && readSummary && (
            <div className="pt-4 border-t border-slate-200 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Eye className="w-4 h-4 text-indigo-600 shrink-0" />
                  <h3 className="text-xs font-bold text-slate-900">Recipient Read Receipts</h3>
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-600 tabular-nums">
                  <span className="font-bold text-emerald-700">
                    {readSummary.openedCount} of {readSummary.totalRecipients} opened
                  </span>
                  <span aria-hidden="true">&middot;</span>
                  <span className="font-semibold text-slate-700">
                    {readSummary.openRatePercent}% rate
                  </span>
                  <span aria-hidden="true">&middot;</span>
                  <span className="text-slate-500">{readSummary.unopenedCount} unopened</span>
                </div>
              </div>

              {/* Progress Bar */}
              <div
                className="h-2 w-full rounded-full bg-slate-100 overflow-hidden"
                role="progressbar"
                aria-valuenow={readSummary.openRatePercent}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Notification open rate"
              >
                <div
                  className="h-full bg-emerald-600 rounded-full transition-all duration-300"
                  style={{ width: `${readSummary.openRatePercent}%` }}
                />
              </div>

              {/* Recipient Breakdown Controls */}
              {readSummary.recipients.length > 0 && (
                <div className="space-y-2.5 pt-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="inline-flex items-center p-0.5 rounded-lg bg-slate-100 text-[11px]">
                      <button
                        type="button"
                        onClick={() => setReceiptFilter('all')}
                        className={`px-2.5 py-1 rounded-md font-semibold transition cursor-pointer tabular-nums whitespace-nowrap ${
                          receiptFilter === 'all'
                            ? 'bg-white text-slate-900 shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        All ({readSummary.totalRecipients})
                      </button>
                      <button
                        type="button"
                        onClick={() => setReceiptFilter('opened')}
                        className={`px-2.5 py-1 rounded-md font-semibold transition cursor-pointer tabular-nums whitespace-nowrap ${
                          receiptFilter === 'opened'
                            ? 'bg-white text-emerald-700 shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        Opened ({readSummary.openedCount})
                      </button>
                      <button
                        type="button"
                        onClick={() => setReceiptFilter('unopened')}
                        className={`px-2.5 py-1 rounded-md font-semibold transition cursor-pointer tabular-nums whitespace-nowrap ${
                          receiptFilter === 'unopened'
                            ? 'bg-white text-slate-900 shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        Unopened ({readSummary.unopenedCount})
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => setShowRecipientList((prev) => !prev)}
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-600 hover:text-indigo-700 cursor-pointer whitespace-nowrap"
                    >
                      <span>{showRecipientList ? 'Hide list' : 'Show list'}</span>
                      <ChevronDown
                        className={`w-3.5 h-3.5 transition-transform ${
                          showRecipientList ? 'rotate-180' : ''
                        }`}
                      />
                    </button>
                  </div>

                  {showRecipientList && (
                    <div className="space-y-2">
                      {readSummary.recipients.length > 5 && (
                        <div className="relative">
                          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                          <input
                            type="text"
                            value={receiptSearch}
                            onChange={(e) => setReceiptSearch(e.target.value)}
                            placeholder="Filter recipients by name, PF number, or branch..."
                            className="w-full pl-8 pr-7 py-1.5 text-xs rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-slate-800"
                          />
                          {receiptSearch && (
                            <button
                              type="button"
                              onClick={() => setReceiptSearch('')}
                              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      )}

                      <div className="max-h-[30dvh] sm:max-h-52 overflow-y-auto divide-y divide-slate-100 rounded-xl border border-slate-200 bg-slate-50/40">
                        {filteredRecipients.length === 0 ? (
                          <div className="p-4 text-center text-xs text-slate-500">
                            No recipients match the current filter.
                          </div>
                        ) : (
                          filteredRecipients.map((recipient) => (
                            <div
                              key={recipient.userId}
                              className="px-3 py-2 flex items-center justify-between gap-2 text-xs bg-white/80"
                            >
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5 min-w-0">
                                  <span className="font-semibold text-slate-800 truncate">
                                    {recipient.name}
                                  </span>
                                  {recipient.pfNumber && (
                                    <span className="font-mono text-[10px] text-slate-500 shrink-0">
                                      {recipient.pfNumber}
                                    </span>
                                  )}
                                </div>
                                {recipient.branch && (
                                  <div className="text-[11px] text-slate-400 truncate">
                                    {recipient.branch}
                                  </div>
                                )}
                              </div>

                              <div className="shrink-0 text-right tabular-nums">
                                {recipient.hasRead ? (
                                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700">
                                    <CheckCheck className="w-3.5 h-3.5 shrink-0" />
                                    <span>
                                      Opened
                                      {recipient.readAt
                                        ? ` · ${new Date(recipient.readAt).toLocaleString(undefined, {
                                            month: 'short',
                                            day: 'numeric',
                                            hour: '2-digit',
                                            minute: '2-digit',
                                          })}`
                                        : ''}
                                    </span>
                                  </span>
                                ) : (
                                  <span className="text-[11px] font-medium text-slate-400">
                                    Unopened
                                  </span>
                                )}
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Pinned Footer */}
        <div className="px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] sm:px-5 sm:py-3.5 border-t border-slate-100 bg-slate-50/70 space-y-2 shrink-0">
          {deleteError && (
            <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 flex items-center gap-2 text-xs text-rose-700 font-medium">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
              <span className="min-w-0 flex-1">{deleteError}</span>
            </div>
          )}

          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2 flex-wrap">
              {canDelete && (
                confirmingDelete ? (
                  <>
                    <button
                      type="button"
                      disabled={isDeleting}
                      onClick={handleDelete}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold transition cursor-pointer disabled:opacity-60 whitespace-nowrap"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>{isDeleting ? 'Deleting...' : 'Confirm Delete'}</span>
                    </button>
                    <button
                      type="button"
                      disabled={isDeleting}
                      onClick={() => setConfirmingDelete(false)}
                      className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 text-xs font-semibold transition cursor-pointer disabled:opacity-60 whitespace-nowrap"
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    disabled={isDeleting}
                    onClick={() => {
                      setDeleteError(null);
                      setConfirmingDelete(true);
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-rose-200 bg-white hover:bg-rose-50 text-rose-700 text-xs font-semibold transition cursor-pointer disabled:opacity-60 whitespace-nowrap"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete</span>
                  </button>
                )
              )}
            </div>

          <div className="flex items-center gap-2.5 ml-auto flex-wrap">
            {isRecipientOfNotification && currentUserId && (
              hasRead ? (
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 tabular-nums">
                  <CheckCheck className="w-4 h-4 shrink-0" />
                  <span>
                    Read
                    {readAtIso
                      ? ` · ${new Date(readAtIso).toLocaleTimeString(undefined, {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}`
                      : ''}
                  </span>
                </span>
              ) : (
                <button
                  type="button"
                  disabled={isMarkingRead}
                  onClick={handleMarkRead}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-semibold transition cursor-pointer disabled:opacity-60"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>{isMarkingRead ? 'Marking Read...' : 'Mark as Read'}</span>
                </button>
              )
            )}
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition cursor-pointer"
            >
              Close
            </button>
          </div>
          </div>
        </div>
      </div>
    </div>
  );
};
