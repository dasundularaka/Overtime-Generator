import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Bell,
  Building2,
  Check,
  CheckCheck,
  ChevronDown,
  Eye,
  ImagePlus,
  Inbox,
  Lock,
  Mail,
  Megaphone,
  Search,
  Send,
  Users,
  X,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Trash2,
} from 'lucide-react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useAuth } from '../context/AuthContext';
import {
  AppNotification,
  Branch,
  NotificationPriority,
  UserProfile,
} from '../types';
import { subscribeToBranches } from '../utils/branchRoleManager';
import {
  canUserDeleteNotification,
  compressNotificationImage,
  deleteNotificationById,
  getNotificationReadSummary,
  getPriorityMeta,
  getUserReadTimestamp,
  hasUserReadNotification,
  isNotificationForUser,
  isNotificationSender,
  isNotificationUnreadForUser,
  markAllNotificationsAsRead,
  markNotificationAsRead,
  sendNotification,
  subscribeToNotifications,
} from '../services/notificationService';
import { NotificationDetailModal } from './NotificationDetailModal';
import { ConfirmationModal } from './ConfirmationModal';
import { Skeleton } from './Skeleton';
import { hasGoogleWorkspaceToken } from '../services/googleWorkspaceService';

interface SearchableTargetBranchDropdownProps {
  branches: Branch[];
  selectedBranch: string; // 'ALL' or branch name
  isSuperAdmin: boolean;
  assignedBranch: string;
  assignedBranchCode?: string;
  onChange: (branchValue: string, branchCode?: string) => void;
}

const SearchableTargetBranchDropdown: React.FC<SearchableTargetBranchDropdownProps> = ({
  branches,
  selectedBranch,
  isSuperAdmin,
  assignedBranch,
  assignedBranchCode,
  onChange,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setTimeout(() => searchInputRef.current?.focus(), 40);
    }
  }, [isOpen]);

  // Always order branches by branch code (natural numeric order)
  const orderedBranches = useMemo(() => {
    return [...branches].sort((a, b) =>
      (a.branchCode || '').localeCompare(b.branchCode || '', undefined, {
        numeric: true,
        sensitivity: 'base',
      })
    );
  }, [branches]);

  const filteredBranches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return orderedBranches;
    return orderedBranches.filter(
      (b) =>
        (b.name || '').toLowerCase().includes(q) ||
        (b.branchCode || '').toLowerCase().includes(q)
    );
  }, [orderedBranches, query]);

  const selectedBranchObj = useMemo(() => {
    if (selectedBranch === 'ALL') return null;
    return orderedBranches.find(
      (b) => b.name.toLowerCase() === selectedBranch.toLowerCase()
    );
  }, [orderedBranches, selectedBranch]);

  // Admin: locked gray disabled styling preventing branch switching
  if (!isSuperAdmin) {
    const adminBranchDisplay = assignedBranch || 'Assigned Branch';
    const matchedAdminBranch = orderedBranches.find(
      (b) => b.name.toLowerCase() === adminBranchDisplay.toLowerCase()
    );
    const code = assignedBranchCode || matchedAdminBranch?.branchCode || '';

    return (
      <div className="relative">
        <button
          type="button"
          disabled
          aria-disabled="true"
          title="Administrators can only send notifications to their assigned branch"
          className="w-full rounded-xl border border-slate-200 bg-slate-100 px-3 py-2.5 text-left text-slate-500 flex items-center justify-between gap-2 cursor-not-allowed select-none"
        >
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <Building2 className="w-4 h-4 text-slate-400 shrink-0" />
            <span className="text-xs font-semibold truncate text-slate-600">
              {adminBranchDisplay}
            </span>
            {code && (
              <span className="font-mono text-[10px] font-bold text-slate-500 bg-slate-200/80 px-1.5 py-0.5 rounded shrink-0">
                #{code}
              </span>
            )}
          </div>
          <Lock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
        </button>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className={`w-full rounded-xl border px-3 py-2.5 text-left bg-white flex items-center justify-between gap-2 transition cursor-pointer ${
          isOpen
            ? 'border-indigo-500 ring-2 ring-indigo-500/20'
            : 'border-slate-300 hover:border-slate-400'
        }`}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <Building2 className="w-4 h-4 text-indigo-600 shrink-0" />
          {selectedBranch === 'ALL' ? (
            <span className="text-xs font-semibold text-slate-900 truncate">
              All Branches
            </span>
          ) : (
            <div className="flex items-center gap-1.5 min-w-0 flex-1">
              <span className="text-xs font-semibold text-slate-900 truncate">
                {selectedBranch}
              </span>
              {selectedBranchObj?.branchCode && (
                <span className="font-mono text-[10px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-1.5 py-0.5 rounded shrink-0">
                  #{selectedBranchObj.branchCode}
                </span>
              )}
            </div>
          )}
        </div>
        <ChevronDown
          className={`w-4 h-4 text-slate-400 transition-transform shrink-0 ${
            isOpen ? 'rotate-180 text-indigo-600' : ''
          }`}
        />
      </button>

      {isOpen && (
        <div
          className="fixed inset-0 z-[95] modal-backdrop-safe flex items-center justify-center p-3 sm:p-4 bg-slate-950/45 backdrop-blur-xs animate-fade-in"
          onClick={(e) => {
            e.stopPropagation();
            setIsOpen(false);
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full sm:max-w-md rounded-2xl bg-white border border-slate-200 shadow-2xl overflow-hidden animate-scale-in modal-panel-safe max-h-[82dvh] sm:max-h-[72dvh] flex flex-col"
          >
            <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/80 flex items-center justify-between gap-2 shrink-0">
              <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4 text-indigo-600" />
                <span className="text-xs font-bold text-slate-900">Select Target Branch</span>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition cursor-pointer"
                aria-label="Close branch selector"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 border-b border-slate-100 bg-white shrink-0">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search branch name or code..."
                  className="w-full pl-9 pr-8 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-slate-800"
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => setQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto divide-y divide-slate-100 py-1" role="listbox">
              {/* Show "All" option first */}
              {(!query.trim() || 'all branches'.includes(query.trim().toLowerCase())) && (
                <button
                  type="button"
                  onClick={() => {
                    onChange('ALL', '');
                    setIsOpen(false);
                  }}
                  className={`w-full px-4 py-2.5 text-left text-xs flex items-center justify-between gap-2 transition cursor-pointer ${
                    selectedBranch === 'ALL'
                      ? 'bg-indigo-50 text-indigo-900 font-bold'
                      : 'text-slate-700 hover:bg-slate-50 font-semibold'
                  }`}
                  role="option"
                  aria-selected={selectedBranch === 'ALL'}
                >
                  <span>All Branches (Organization-Wide)</span>
                  {selectedBranch === 'ALL' && <Check className="w-3.5 h-3.5 text-indigo-600 shrink-0" />}
                </button>
              )}

              {filteredBranches.map((b) => {
                const isSelected = selectedBranch.toLowerCase() === b.name.toLowerCase();
                return (
                  <button
                    key={b.id || b.name}
                    type="button"
                    onClick={() => {
                      onChange(b.name, b.branchCode);
                      setIsOpen(false);
                    }}
                    className={`w-full px-4 py-2.5 text-left text-xs flex items-center justify-between gap-2 transition cursor-pointer ${
                      isSelected
                        ? 'bg-indigo-50 text-indigo-900 font-bold'
                        : 'text-slate-700 hover:bg-slate-50'
                    }`}
                    role="option"
                    aria-selected={isSelected}
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <span className="font-mono text-[10px] font-bold text-slate-600 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded shrink-0 tabular-nums">
                        #{b.branchCode || '—'}
                      </span>
                      <span className="truncate">{b.name}</span>
                    </div>
                    {isSelected && <Check className="w-3.5 h-3.5 text-indigo-600 shrink-0" />}
                  </button>
                );
              })}

              {filteredBranches.length === 0 &&
                query.trim() &&
                !'all branches'.includes(query.trim().toLowerCase()) && (
                  <div className="p-4 text-center text-xs text-slate-500">
                    No branches match &quot;{query}&quot;
                  </div>
                )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

interface SearchableTargetUsersDropdownProps {
  users: UserProfile[];
  selectedUserIds: string[]; // ['ALL'] or specific user ids
  branchLabel: string;
  onChange: (userIds: string[]) => void;
}

const SearchableTargetUsersDropdown: React.FC<SearchableTargetUsersDropdownProps> = ({
  users,
  selectedUserIds,
  branchLabel,
  onChange,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setTimeout(() => searchInputRef.current?.focus(), 40);
    }
  }, [isOpen]);

  const sortedUsers = useMemo(() => {
    return [...users].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }, [users]);

  const filteredUsers = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sortedUsers;
    return sortedUsers.filter(
      (u) =>
        (u.name || '').toLowerCase().includes(q) ||
        (u.employeeNumber || u.pfNumber || '').toLowerCase().includes(q) ||
        (u.email || '').toLowerCase().includes(q) ||
        (u.branch || '').toLowerCase().includes(q)
    );
  }, [sortedUsers, query]);

  const isAllSelected = selectedUserIds.length === 0 || selectedUserIds.includes('ALL');

  const toggleUser = (userId: string) => {
    if (isAllSelected) {
      onChange([userId]);
      return;
    }
    if (selectedUserIds.includes(userId)) {
      const remaining = selectedUserIds.filter((id) => id !== userId);
      onChange(remaining.length === 0 ? ['ALL'] : remaining);
    } else {
      onChange([...selectedUserIds, userId]);
    }
  };

  const summaryText = useMemo(() => {
    if (isAllSelected) {
      return `All Users (${users.length})`;
    }
    if (selectedUserIds.length === 1) {
      const found = users.find((u) => u.id === selectedUserIds[0]);
      return found ? `${found.name} (${found.employeeNumber || found.pfNumber || 'User'})` : '1 Selected User';
    }
    return `${selectedUserIds.length} Selected Users`;
  }, [isAllSelected, selectedUserIds, users]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className={`w-full rounded-xl border px-3 py-2.5 text-left bg-white flex items-center justify-between gap-2 transition cursor-pointer ${
          isOpen
            ? 'border-indigo-500 ring-2 ring-indigo-500/20'
            : 'border-slate-300 hover:border-slate-400'
        }`}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <Users className="w-4 h-4 text-indigo-600 shrink-0" />
          <span className="text-xs font-semibold text-slate-900 truncate">
            {summaryText}
          </span>
        </div>
        <ChevronDown
          className={`w-4 h-4 text-slate-400 transition-transform shrink-0 ${
            isOpen ? 'rotate-180 text-indigo-600' : ''
          }`}
        />
      </button>

      {isOpen && (
        <div
          className="fixed inset-0 z-[95] modal-backdrop-safe flex items-center justify-center p-3 sm:p-4 bg-slate-950/45 backdrop-blur-xs animate-fade-in"
          onClick={(e) => {
            e.stopPropagation();
            setIsOpen(false);
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full sm:max-w-md rounded-2xl bg-white border border-slate-200 shadow-2xl overflow-hidden animate-scale-in modal-panel-safe max-h-[82dvh] sm:max-h-[72dvh] flex flex-col"
          >
            <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/80 flex items-center justify-between gap-2 shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <Users className="w-4 h-4 text-indigo-600 shrink-0" />
                <span className="text-xs font-bold text-slate-900 truncate">
                  Select Users ({branchLabel})
                </span>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition cursor-pointer shrink-0"
                aria-label="Close user selector"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 border-b border-slate-100 bg-white shrink-0">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search user name, PF, email..."
                  className="w-full pl-9 pr-8 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-slate-800"
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => setQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto divide-y divide-slate-100 py-1" role="listbox">
              <button
                type="button"
                onClick={() => {
                  onChange(['ALL']);
                  setIsOpen(false);
                }}
                className={`w-full px-4 py-2.5 text-left text-xs flex items-center justify-between gap-2 transition cursor-pointer ${
                  isAllSelected
                    ? 'bg-indigo-50 text-indigo-900 font-bold'
                    : 'text-slate-700 hover:bg-slate-50 font-semibold'
                }`}
                role="option"
                aria-selected={isAllSelected}
              >
                <span className="truncate">
                  All Users in {branchLabel} ({users.length})
                </span>
                {isAllSelected && <Check className="w-3.5 h-3.5 text-indigo-600 shrink-0" />}
              </button>

              {filteredUsers.map((u) => {
                const isSelected = !isAllSelected && selectedUserIds.includes(u.id);
                return (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => toggleUser(u.id)}
                    className={`w-full px-4 py-2.5 text-left text-xs flex items-center justify-between gap-2 transition cursor-pointer ${
                      isSelected
                        ? 'bg-indigo-50/80 text-indigo-950 font-semibold'
                        : 'text-slate-700 hover:bg-slate-50'
                    }`}
                    role="option"
                    aria-selected={isSelected}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate font-semibold">{u.name}</span>
                        {(u.employeeNumber || u.pfNumber) && (
                          <span className="font-mono text-[10px] text-slate-500 shrink-0">
                            {u.employeeNumber || u.pfNumber}
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-slate-400 truncate">
                        {u.branch || 'Head Office'}
                        {u.email ? ` · ${u.email}` : ''}
                      </div>
                    </div>
                    <div
                      className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                        isSelected
                          ? 'bg-indigo-600 border-indigo-600 text-white'
                          : 'border-slate-300 bg-white'
                      }`}
                    >
                      {isSelected && <Check className="w-3 h-3" />}
                    </div>
                  </button>
                );
              })}

              {filteredUsers.length === 0 && (
                <div className="p-4 text-center text-xs text-slate-500">
                  No users found in {branchLabel}
                </div>
              )}
            </div>

            <div className="px-4 py-3 border-t border-slate-100 bg-slate-50 flex items-center justify-between text-xs shrink-0">
              <span className="text-slate-600 font-medium tabular-nums">
                {isAllSelected ? `All (${users.length})` : `${selectedUserIds.length} selected`}
              </span>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="px-3.5 py-1.5 rounded-xl bg-indigo-600 text-white font-semibold cursor-pointer hover:bg-indigo-700 transition"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export const NotificationCenter: React.FC = () => {
  const { currentUser, userProfile, isSuperAdmin, isAdmin } = useAuth();
  const uid = userProfile?.id || currentUser?.uid || '';

  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // View Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [priorityFilter, setPriorityFilter] = useState<'all' | NotificationPriority>('all');
  const [sectionTab, setSectionTab] = useState<'both' | 'received' | 'sent'>('both');

  // Detail Modal (store ID so open modal reflects live Firestore read-receipt updates)
  const [selectedNotificationId, setSelectedNotificationId] = useState<string | null>(null);
  const [fallbackSelectedNotification, setFallbackSelectedNotification] =
    useState<AppNotification | null>(null);

  const selectedNotification = useMemo(() => {
    if (!selectedNotificationId) return null;
    return notifications.find((n) => n.id === selectedNotificationId) || fallbackSelectedNotification;
  }, [selectedNotificationId, notifications, fallbackSelectedNotification]);

  // Broadcast Modal State (Admin / Super Admin)
  const [isBroadcastOpen, setIsBroadcastOpen] = useState(false);
  const [heading, setHeading] = useState('');
  const [body, setBody] = useState('');
  const [priority, setPriority] = useState<NotificationPriority>('medium');
  const [imageUrl, setImageUrl] = useState('');
  const [isCompressingImage, setIsCompressingImage] = useState(false);
  const [targetBranch, setTargetBranch] = useState<string>(() =>
    isSuperAdmin ? 'ALL' : userProfile?.branch || ''
  );
  const [targetBranchCode, setTargetBranchCode] = useState<string>(() =>
    isSuperAdmin ? '' : userProfile?.branchCode || ''
  );
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>(['ALL']);
  const [sendViaApp, setSendViaApp] = useState(true);
  const [sendViaEmail, setSendViaEmail] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [statusBanner, setStatusBanner] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [notifPendingDelete, setNotifPendingDelete] = useState<AppNotification | null>(null);
  const [isDeletingNotif, setIsDeletingNotif] = useState(false);
  const imageFileInputRef = useRef<HTMLInputElement>(null);

  // Keep Admin's branch strictly locked to their assigned branch
  useEffect(() => {
    if (!isSuperAdmin && userProfile?.branch) {
      setTargetBranch(userProfile.branch);
      setTargetBranchCode(userProfile.branchCode || '');
    }
  }, [isSuperAdmin, userProfile?.branch, userProfile?.branchCode]);

  // Subscribe to Notifications
  useEffect(() => {
    const unsub = subscribeToNotifications((list) => {
      setNotifications(list);
      setIsLoading(false);
    });
    return () => unsub();
  }, []);

  // Subscribe to Branches & Users when admin/superadmin
  useEffect(() => {
    const unsubBranches = subscribeToBranches(setBranches);
    let unsubUsers = () => {};
    if (isAdmin) {
      unsubUsers = onSnapshot(
        collection(db, 'users'),
        (snap) => {
          const list = snap.docs.map((d) => {
            const data = d.data() as UserProfile;
            return { ...data, id: data.id || d.id };
          });
          setAllUsers(list);
        },
        () => {}
      );
    }
    return () => {
      unsubBranches();
      unsubUsers();
    };
  }, [isAdmin]);

  // Available users filtered strictly according to Branch dropdown & Role permissions
  const usersForSelectedBranch = useMemo(() => {
    if (!isSuperAdmin) {
      const assigned = (userProfile?.branch || '').trim().toLowerCase();
      return allUsers.filter((u) => (u.branch || '').trim().toLowerCase() === assigned);
    }
    if (targetBranch === 'ALL') {
      return allUsers;
    }
    return allUsers.filter(
      (u) => (u.branch || '').trim().toLowerCase() === targetBranch.trim().toLowerCase()
    );
  }, [allUsers, isSuperAdmin, userProfile?.branch, targetBranch]);

  // Reset user selection to ALL if selected users no longer belong to changed branch
  useEffect(() => {
    if (selectedUserIds.includes('ALL')) return;
    const validSet = new Set(usersForSelectedBranch.map((u) => u.id));
    const filtered = selectedUserIds.filter((id) => validSet.has(id));
    if (filtered.length !== selectedUserIds.length) {
      setSelectedUserIds(filtered.length > 0 ? filtered : ['ALL']);
    }
  }, [usersForSelectedBranch, selectedUserIds]);

  const filterFn = (n: AppNotification) => {
    if (priorityFilter !== 'all' && n.priority !== priorityFilter) return false;
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    return (
      n.heading.toLowerCase().includes(q) ||
      n.body.toLowerCase().includes(q) ||
      (n.senderName || '').toLowerCase().includes(q) ||
      (n.targetLabel || '').toLowerCase().includes(q)
    );
  };

  // Separate Received vs Sent Notifications
  const receivedNotifications = useMemo(() => {
    return notifications
      .filter((n) => isNotificationForUser(n, userProfile, uid))
      .filter(filterFn);
  }, [notifications, userProfile, uid, priorityFilter, searchQuery]);

  const sentNotifications = useMemo(() => {
    if (!isAdmin) return [];
    return notifications
      .filter((n) => {
        if (isSuperAdmin) return true;
        return isNotificationSender(n, userProfile, currentUser?.uid);
      })
      .filter(filterFn);
  }, [notifications, isAdmin, isSuperAdmin, userProfile, currentUser?.uid, priorityFilter, searchQuery]);

  const unreadReceivedCount = useMemo(() => {
    return notifications.filter(
      (n) => isNotificationForUser(n, userProfile, uid) && isNotificationUnreadForUser(n, uid)
    ).length;
  }, [notifications, userProfile, uid]);

  const handleOpenBroadcastModal = () => {
    setFormError(null);
    setHeading('');
    setBody('');
    setPriority('medium');
    setImageUrl('');
    if (isSuperAdmin) {
      setTargetBranch('ALL');
      setTargetBranchCode('');
    } else {
      setTargetBranch(userProfile?.branch || '');
      setTargetBranchCode(userProfile?.branchCode || '');
    }
    setSelectedUserIds(['ALL']);
    setSendViaApp(true);
    setSendViaEmail(false);
    setIsBroadcastOpen(true);
  };

  const handleImageFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFormError(null);
    setIsCompressingImage(true);
    try {
      const compressed = await compressNotificationImage(file);
      setImageUrl(compressed);
    } catch (err: any) {
      setFormError(err?.message || 'Could not process image file.');
    } finally {
      setIsCompressingImage(false);
      e.target.value = '';
    }
  };

  const handleSubmitBroadcast = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSending || !userProfile) return;

    setFormError(null);
    if (!heading.trim()) {
      setFormError('Please enter a notification heading.');
      return;
    }
    if (!body.trim()) {
      setFormError('Please enter the notification message body.');
      return;
    }
    if (!sendViaApp && !sendViaEmail) {
      setFormError('Please select at least one channel (App Notification or Email).');
      return;
    }

    setIsSending(true);
    try {
      const effectiveBranch = isSuperAdmin ? targetBranch : userProfile.branch || '';
      const scope =
        isSuperAdmin && effectiveBranch === 'ALL' && selectedUserIds.includes('ALL')
          ? 'all'
          : selectedUserIds.includes('ALL')
          ? 'branch'
          : 'users';

      const result = await sendNotification({
        heading,
        body,
        priority,
        imageUrl: imageUrl.trim() || undefined,
        targetScope: scope,
        targetBranch: effectiveBranch,
        targetBranchCode,
        selectedUserIds,
        allUsers,
        sendViaApp,
        sendViaEmail,
        sender: userProfile,
        isSuperAdmin,
      });

      setIsBroadcastOpen(false);
      const emailSummary = sendViaEmail
        ? result.emailError
          ? ` (Email note: ${result.emailError})`
          : ` and emailed to ${result.emailSentCount} recipient${result.emailSentCount === 1 ? '' : 's'}`
        : '';
      setStatusBanner({
        type: 'success',
        text: `Notification "${result.notification.heading}" sent to ${result.notification.targetLabel}${emailSummary}.`,
      });
      setTimeout(() => setStatusBanner(null), 5000);
    } catch (err: any) {
      setFormError(err?.message || 'Failed to send notification.');
    } finally {
      setIsSending(false);
    }
  };

  const handleOpenDetails = async (notif: AppNotification, markRead: boolean) => {
    setFallbackSelectedNotification(notif);
    setSelectedNotificationId(notif.id);
    if (markRead && uid && isNotificationUnreadForUser(notif, uid)) {
      await markNotificationAsRead(notif.id, uid, userProfile);
    }
  };

  const handleQuickMarkRead = async (e: React.MouseEvent, notif: AppNotification) => {
    e.stopPropagation();
    if (!uid || !isNotificationUnreadForUser(notif, uid)) return;
    await markNotificationAsRead(notif.id, uid, userProfile);
  };

  const handleRequestDeleteCard = (e: React.MouseEvent, notif: AppNotification) => {
    e.stopPropagation();
    setNotifPendingDelete(notif);
  };

  const handleConfirmDeleteNotification = async () => {
    if (!notifPendingDelete || isDeletingNotif) return;
    setIsDeletingNotif(true);
    try {
      const target = notifPendingDelete;
      await deleteNotificationById(target, {
        userProfile,
        fallbackUid: currentUser?.uid,
        isSuperAdmin,
      });
      setNotifications((prev) => prev.filter((item) => item.id !== target.id));
      if (selectedNotificationId === target.id) {
        setSelectedNotificationId(null);
        setFallbackSelectedNotification(null);
      }
      setNotifPendingDelete(null);
      setStatusBanner({
        type: 'success',
        text: `Deleted notification "${target.heading}".`,
      });
      setTimeout(() => setStatusBanner(null), 5000);
    } catch (err: any) {
      setNotifPendingDelete(null);
      setStatusBanner({
        type: 'error',
        text: err?.message || 'Failed to delete notification.',
      });
      setTimeout(() => setStatusBanner(null), 5000);
    } finally {
      setIsDeletingNotif(false);
    }
  };

  const renderNotificationCard = (notif: AppNotification, mode: 'received' | 'sent') => {
    const pMeta = getPriorityMeta(notif.priority);
    const isUnread = mode === 'received' && isNotificationUnreadForUser(notif, uid);
    const hasRead = mode === 'received' && hasUserReadNotification(notif, uid);
    const readTimestamp = mode === 'received' ? getUserReadTimestamp(notif, uid) : null;
    const readSummary = mode === 'sent' ? getNotificationReadSummary(notif, allUsers) : null;
    const allowDeleteCard =
      mode === 'sent' &&
      canUserDeleteNotification(notif, userProfile, currentUser?.uid, isSuperAdmin);

    return (
      <div
        key={`${mode}-${notif.id}`}
        onClick={() => handleOpenDetails(notif, mode === 'received')}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleOpenDetails(notif, mode === 'received');
          }
        }}
        className={`group rounded-2xl border transition-all duration-150 cursor-pointer overflow-hidden focus:outline-hidden focus:ring-2 focus:ring-indigo-500 ${
          isUnread
            ? 'bg-indigo-50/45 border-indigo-200 hover:border-indigo-300 shadow-xs'
            : 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-xs'
        }`}
      >
        <div className={`h-1 w-full ${pMeta.accentBarClass}`} />
        <div className="p-4 space-y-2.5">
          {/* Top Left Heading + Top Right Priority Color Indicator */}
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h3
                  className={`text-sm leading-snug break-words line-clamp-2 ${
                    isUnread ? 'font-bold text-slate-950' : 'font-semibold text-slate-900'
                  }`}
                >
                  {notif.heading}
                </h3>
                {isUnread && (
                  <span className="text-[10px] font-bold text-indigo-700 shrink-0">Unread</span>
                )}
              </div>
            </div>

            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg text-[11px] font-bold border shrink-0 ${pMeta.badgeClasses}`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${pMeta.dotColorClass}`} />
              <span>{pMeta.label}</span>
            </span>
          </div>

          {/* Body Preview + Optional Image Thumbnail */}
          <div className="flex items-start gap-3">
            <p className="text-xs text-slate-600 leading-relaxed line-clamp-2 flex-1 min-w-0">
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
                className="w-14 h-14 rounded-xl object-cover border border-slate-200 shrink-0 bg-slate-100"
              />
            )}
          </div>

          {/* Admin Read-Receipt Summary Strip on Sent Broadcasts */}
          {mode === 'sent' && readSummary && (
            <div className="pt-2 border-t border-slate-100 space-y-1.5">
              <div className="flex items-center justify-between gap-2 text-[11px] tabular-nums">
                <span className="inline-flex items-center gap-1.5 font-semibold text-slate-700">
                  <Eye className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span>
                    Opened by {readSummary.openedCount} of {readSummary.totalRecipients} recipient
                    {readSummary.totalRecipients === 1 ? '' : 's'} ({readSummary.openRatePercent}%)
                  </span>
                </span>
                <span className="text-indigo-600 font-semibold group-hover:underline shrink-0">
                  View receipts
                </span>
              </div>
              <div
                className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden"
                aria-hidden="true"
              >
                <div
                  className="h-full bg-emerald-600 rounded-full transition-all duration-300"
                  style={{ width: `${readSummary.openRatePercent}%` }}
                />
              </div>
            </div>
          )}

          {/* Quiet Unboxed Metadata & Read Receipt Controls */}
          <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
            <div className="flex flex-wrap items-center gap-1.5 min-w-0">
              {mode === 'received' ? (
                <>
                  <span className="font-medium text-slate-700 truncate">{notif.senderName}</span>
                  <span aria-hidden="true">&middot;</span>
                  <span className="truncate">{notif.senderBranch}</span>
                </>
              ) : (
                <>
                  <span className="font-medium text-slate-700 truncate">
                    To: {notif.targetLabel || notif.targetBranch}
                  </span>
                  <span aria-hidden="true">&middot;</span>
                  <span className="inline-flex items-center gap-1">
                    {notif.sendViaApp && <Bell className="w-3 h-3 text-indigo-500" />}
                    {notif.sendViaEmail && <Mail className="w-3 h-3 text-blue-500" />}
                    <span>
                      {[notif.sendViaApp ? 'App' : '', notif.sendViaEmail ? 'Email' : '']
                        .filter(Boolean)
                        .join(' & ')}
                    </span>
                  </span>
                </>
              )}
            </div>

            <div className="flex items-center gap-2.5 shrink-0">
              {mode === 'received' && isUnread && (
                <button
                  type="button"
                  onClick={(e) => handleQuickMarkRead(e, notif)}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-semibold transition cursor-pointer whitespace-nowrap"
                >
                  <CheckCircle2 className="w-3 h-3" />
                  <span>Mark as Read</span>
                </button>
              )}

              {mode === 'received' && !isUnread && hasRead && (
                <span className="inline-flex items-center gap-1 text-emerald-700 font-medium tabular-nums">
                  <CheckCheck className="w-3.5 h-3.5 shrink-0" />
                  <span>
                    Read
                    {readTimestamp
                      ? ` · ${new Date(readTimestamp).toLocaleTimeString(undefined, {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}`
                      : ''}
                  </span>
                </span>
              )}

              <span className="tabular-nums text-slate-400">
                {new Date(notif.createdAt).toLocaleString(undefined, {
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>

              {allowDeleteCard && (
                <button
                  type="button"
                  onClick={(e) => handleRequestDeleteCard(e, notif)}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-rose-200 bg-rose-50/70 hover:bg-rose-100 text-rose-700 font-semibold transition cursor-pointer whitespace-nowrap"
                  aria-label={`Delete notification ${notif.heading}`}
                  title="Delete sent notification"
                >
                  <Trash2 className="w-3 h-3 shrink-0" />
                  <span>Delete</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-5 pb-8 w-full max-w-7xl mx-auto animate-fade-in">
      {/* Top Header & Primary Broadcast Button */}
      <div className="rounded-2xl bg-white p-5 sm:p-6 shadow-xs border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3.5 min-w-0">
          <div className="w-11 h-11 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
            <Bell className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
              Notifications
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
              {isSuperAdmin
                ? 'Broadcast organization-wide or targeted branch notifications and monitor recipient read receipts.'
                : isAdmin
                ? `Send notifications to ${userProfile?.branch || 'your branch'} staff and track recipient open summaries.`
                : 'View important announcements and updates pushed by your branch and administrators.'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          {unreadReceivedCount > 0 && (
            <button
              type="button"
              onClick={() => markAllNotificationsAsRead(receivedNotifications, uid, userProfile)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-semibold transition cursor-pointer whitespace-nowrap"
            >
              <CheckCheck className="w-4 h-4 text-indigo-600" />
              <span>Mark All Read ({unreadReceivedCount})</span>
            </button>
          )}

          {isAdmin && (
            <button
              type="button"
              onClick={handleOpenBroadcastModal}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs sm:text-sm font-bold shadow-sm transition cursor-pointer whitespace-nowrap"
            >
              <Megaphone className="w-4 h-4" />
              <span>Broadcast a Notification</span>
            </button>
          )}
        </div>
      </div>

      {statusBanner && (
        <div
          className={`p-3.5 rounded-2xl border text-xs flex items-center justify-between gap-2 animate-fade-in ${
            statusBanner.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          <div className="flex items-center gap-2 min-w-0">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span className="font-medium">{statusBanner.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setStatusBanner(null)}
            className="p-1 rounded-lg hover:bg-black/5 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Filter & Search Bar */}
      <div className="rounded-2xl bg-white p-3.5 sm:p-4 border border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="relative flex-1 min-w-0">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search notifications by heading, message, sender, or target..."
            className="w-full pl-9 pr-8 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-slate-800"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Priority Filter */}
          <div className="inline-flex items-center p-1 rounded-xl bg-slate-100 text-xs">
            {(
              [
                { id: 'all', label: 'All Priority' },
                { id: 'high', label: 'High' },
                { id: 'medium', label: 'Medium' },
                { id: 'low', label: 'Low' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setPriorityFilter(opt.id)}
                className={`px-2.5 py-1.5 rounded-lg font-semibold transition cursor-pointer whitespace-nowrap ${
                  priorityFilter === opt.id
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Separate Sent & Received Switcher (Admin / Super Admin) */}
          {isAdmin && (
            <div className="inline-flex items-center p-1 rounded-xl bg-slate-100 text-xs">
              <button
                type="button"
                onClick={() => setSectionTab('both')}
                className={`px-2.5 py-1.5 rounded-lg font-semibold transition cursor-pointer whitespace-nowrap ${
                  sectionTab === 'both'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Split View
              </button>
              <button
                type="button"
                onClick={() => setSectionTab('received')}
                className={`px-2.5 py-1.5 rounded-lg font-semibold transition cursor-pointer whitespace-nowrap tabular-nums ${
                  sectionTab === 'received'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Received ({receivedNotifications.length})
              </button>
              <button
                type="button"
                onClick={() => setSectionTab('sent')}
                className={`px-2.5 py-1.5 rounded-lg font-semibold transition cursor-pointer whitespace-nowrap tabular-nums ${
                  sectionTab === 'sent'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Sent ({sentNotifications.length})
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Recent Notifications: Sent and Received Separate */}
      {isLoading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {[0, 1].map((col) => (
            <div key={col} className="rounded-2xl bg-white p-5 border border-slate-200 space-y-3">
              <Skeleton className="h-5 w-44" />
              <Skeleton className="h-24 w-full rounded-xl" />
              <Skeleton className="h-24 w-full rounded-xl" />
            </div>
          ))}
        </div>
      ) : (
        <div
          className={`grid gap-6 ${
            isAdmin && sectionTab === 'both' ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1'
          }`}
        >
          {/* RECEIVED NOTIFICATIONS */}
          {(!isAdmin || sectionTab === 'both' || sectionTab === 'received') && (
            <section className="rounded-2xl bg-white p-4 sm:p-5 border border-slate-200 shadow-xs space-y-4">
              <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <Inbox className="w-4 h-4 text-indigo-600" />
                  <h2 className="text-sm font-bold text-slate-900">Received Notifications</h2>
                </div>
                <span className="text-xs text-slate-500 font-medium tabular-nums">
                  {receivedNotifications.length} total
                  {unreadReceivedCount > 0 ? ` · ${unreadReceivedCount} unread` : ''}
                </span>
              </div>

              {receivedNotifications.length === 0 ? (
                <div className="py-10 px-4 text-center space-y-2">
                  <div className="w-11 h-11 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
                    <Inbox className="w-5 h-5" />
                  </div>
                  <p className="text-sm font-semibold text-slate-700">No received notifications</p>
                  <p className="text-xs text-slate-500 max-w-xs mx-auto">
                    Announcements sent to your branch or account will appear here in real time.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {receivedNotifications.map((n) => renderNotificationCard(n, 'received'))}
                </div>
              )}
            </section>
          )}

          {/* SENT NOTIFICATIONS (Admins & Super Admins) */}
          {isAdmin && (sectionTab === 'both' || sectionTab === 'sent') && (
            <section className="rounded-2xl bg-white p-4 sm:p-5 border border-slate-200 shadow-xs space-y-4">
              <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <Send className="w-4 h-4 text-emerald-600" />
                  <h2 className="text-sm font-bold text-slate-900">Sent Notifications</h2>
                </div>
                <span className="text-xs text-slate-500 font-medium tabular-nums">
                  {sentNotifications.length} sent
                </span>
              </div>

              {sentNotifications.length === 0 ? (
                <div className="py-10 px-4 text-center space-y-3">
                  <div className="w-11 h-11 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
                    <Megaphone className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-700">No notifications sent yet</p>
                    <p className="text-xs text-slate-500 max-w-xs mx-auto mt-0.5">
                      Use Broadcast a Notification above to send an alert via App or Email.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleOpenBroadcastModal}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-semibold transition cursor-pointer"
                  >
                    <Megaphone className="w-3.5 h-3.5" />
                    <span>Broadcast a Notification</span>
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {sentNotifications.map((n) => renderNotificationCard(n, 'sent'))}
                </div>
              )}
            </section>
          )}
        </div>
      )}

      {/* Centered Responsive Broadcast a Notification Submitting Panel Modal */}
      {isAdmin && isBroadcastOpen && (
        <div
          className="fixed inset-0 z-[60] modal-backdrop-safe flex items-center justify-center p-3 sm:p-4 md:p-6 bg-slate-950/65 backdrop-blur-xs animate-fade-in"
          onClick={() => !isSending && setIsBroadcastOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="broadcast-modal-title"
        >
          <div
            className="relative w-full sm:w-[min(94vw,44rem)] modal-panel-safe max-h-[90dvh] rounded-2xl bg-white border border-slate-200 shadow-2xl overflow-hidden animate-scale-in flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Pinned Modal Header */}
            <div className="px-4 py-3 sm:px-5 sm:py-4 border-b border-slate-100 flex items-center justify-between gap-3 bg-slate-50/80 shrink-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0">
                  <Megaphone className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <h2 id="broadcast-modal-title" className="text-sm sm:text-base font-bold text-slate-900 truncate">
                    Broadcast a Notification
                  </h2>
                  <p className="text-[11px] text-slate-500 truncate">
                    {isSuperAdmin
                      ? 'Send to all branches or select a specific branch and staff recipients'
                      : `Branch scope locked to ${userProfile?.branch || 'your assigned branch'}`}
                  </p>
                </div>
              </div>
              <button
                type="button"
                disabled={isSending}
                onClick={() => setIsBroadcastOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition cursor-pointer shrink-0"
                aria-label="Close broadcast panel"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmitBroadcast} className="flex flex-col flex-1 min-h-0">
              <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 sm:p-5 space-y-3.5 sm:space-y-4">
              {formError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              {/* Heading */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Heading <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={heading}
                  onChange={(e) => setHeading(e.target.value)}
                  maxLength={160}
                  required
                  placeholder="Enter notification heading..."
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>

              {/* Body */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Body <span className="text-rose-500">*</span>
                </label>
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={4}
                  maxLength={4000}
                  required
                  placeholder="Write the notification message..."
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 resize-y"
                />
              </div>

              {/* Priority */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Priority
                </label>
                <div className="grid grid-cols-3 gap-1.5 sm:gap-2.5">
                  {(
                    [
                      {
                        value: 'high' as const,
                        label: 'High',
                        dot: 'bg-red-600',
                        active: 'bg-red-50 border-red-500 text-red-800 ring-2 ring-red-500/20',
                      },
                      {
                        value: 'medium' as const,
                        label: 'Medium',
                        dot: 'bg-amber-500',
                        active: 'bg-amber-50 border-amber-500 text-amber-900 ring-2 ring-amber-500/20',
                      },
                      {
                        value: 'low' as const,
                        label: 'Low',
                        dot: 'bg-emerald-600',
                        active: 'bg-emerald-50 border-emerald-500 text-emerald-800 ring-2 ring-emerald-500/20',
                      },
                    ] as const
                  ).map((opt) => {
                    const isSelected = priority === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setPriority(opt.value)}
                        className={`px-2 py-2 sm:px-3 sm:py-2.5 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 sm:gap-2 transition cursor-pointer whitespace-nowrap ${
                          isSelected
                            ? opt.active
                            : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${opt.dot}`} />
                        <span>{opt.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Supported Image (Optional) */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-slate-700">
                    Supported Image <span className="text-slate-400 font-normal">(Optional)</span>
                  </label>
                  {imageUrl && (
                    <button
                      type="button"
                      onClick={() => setImageUrl('')}
                      className="text-[11px] font-semibold text-rose-600 hover:text-rose-700 cursor-pointer"
                    >
                      Remove Image
                    </button>
                  )}
                </div>

                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    value={imageUrl.startsWith('data:') ? 'Uploaded compressed image attached' : imageUrl}
                    readOnly={imageUrl.startsWith('data:')}
                    onChange={(e) => setImageUrl(e.target.value)}
                    placeholder="Paste image URL or upload an image file..."
                    className="flex-1 min-w-0 rounded-xl border border-slate-300 px-3 py-2 text-xs text-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  />
                  <button
                    type="button"
                    disabled={isCompressingImage}
                    onClick={() => imageFileInputRef.current?.click()}
                    className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-300 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-semibold transition cursor-pointer whitespace-nowrap shrink-0"
                  >
                    {isCompressingImage ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <ImagePlus className="w-3.5 h-3.5 text-indigo-600" />
                    )}
                    <span>{isCompressingImage ? 'Processing...' : 'Upload Image'}</span>
                  </button>
                  <input
                    ref={imageFileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleImageFileChange}
                  />
                </div>

                {imageUrl && (
                  <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50 p-2 flex items-center justify-center">
                    <img
                      src={imageUrl}
                      alt="Supported attachment preview"
                      referrerPolicy="no-referrer"
                      className="max-h-[24dvh] sm:max-h-36 rounded-lg object-contain"
                    />
                  </div>
                )}
              </div>

              {/* Target Section: Two Searchable Dropdowns in One Line (Branch + Users) */}
              <div className="space-y-2 pt-1">
                <label className="block text-xs font-bold text-slate-700">
                  Target Audience
                </label>
                <div className="grid grid-cols-2 gap-2 sm:gap-3">
                  <div>
                    <span className="block text-[11px] font-medium text-slate-500 mb-1">
                      Branch {isSuperAdmin ? '(Ordered by Code)' : '(Locked to Your Branch)'}
                    </span>
                    <SearchableTargetBranchDropdown
                      branches={branches}
                      selectedBranch={targetBranch}
                      isSuperAdmin={isSuperAdmin}
                      assignedBranch={userProfile?.branch || ''}
                      assignedBranchCode={userProfile?.branchCode}
                      onChange={(bVal, bCode) => {
                        setTargetBranch(bVal);
                        setTargetBranchCode(bCode || '');
                        setSelectedUserIds(['ALL']);
                      }}
                    />
                  </div>

                  <div>
                    <span className="block text-[11px] font-medium text-slate-500 mb-1">
                      Users
                    </span>
                    <SearchableTargetUsersDropdown
                      users={usersForSelectedBranch}
                      selectedUserIds={selectedUserIds}
                      branchLabel={
                        isSuperAdmin
                          ? targetBranch === 'ALL'
                            ? 'All Branches'
                            : targetBranch
                          : userProfile?.branch || 'Branch'
                      }
                      onChange={setSelectedUserIds}
                    />
                  </div>
                </div>
              </div>

              {/* Delivery Channels (App & Email) */}
              <div className="pt-1">
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Delivery Channels
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <label
                    className={`flex items-center gap-2.5 p-3 rounded-xl border cursor-pointer transition ${
                      sendViaApp
                        ? 'bg-indigo-50/70 border-indigo-300 text-indigo-950'
                        : 'bg-white border-slate-200 text-slate-700'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={sendViaApp}
                      onChange={(e) => setSendViaApp(e.target.checked)}
                      className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    <Bell className="w-4 h-4 text-indigo-600 shrink-0" />
                    <div className="min-w-0">
                      <span className="block text-xs font-bold">In-App Push</span>
                      <span className="block text-[10px] text-slate-500">
                        Instant animated alert inside the app
                      </span>
                    </div>
                  </label>

                  <label
                    className={`flex items-center gap-2.5 p-3 rounded-xl border cursor-pointer transition ${
                      sendViaEmail
                        ? 'bg-blue-50/70 border-blue-300 text-blue-950'
                        : 'bg-white border-slate-200 text-slate-700'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={sendViaEmail}
                      onChange={(e) => setSendViaEmail(e.target.checked)}
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                    <Mail className="w-4 h-4 text-blue-600 shrink-0" />
                    <div className="min-w-0">
                      <span className="block text-xs font-bold">Email (Gmail)</span>
                      <span className="block text-[10px] text-slate-500">
                        {hasGoogleWorkspaceToken()
                          ? 'Gmail connected for instant email send'
                          : 'Prompts Google sign-in if selected'}
                      </span>
                    </div>
                  </label>
                </div>
              </div>

              </div>

              {/* Pinned Modal Actions Footer */}
              <div className="px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] sm:px-5 sm:py-3.5 border-t border-slate-100 bg-slate-50/80 flex items-center justify-end gap-2 sm:gap-2.5 shrink-0">
                <button
                  type="button"
                  disabled={isSending}
                  onClick={() => setIsBroadcastOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 text-xs font-semibold transition cursor-pointer whitespace-nowrap"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSending}
                  className="inline-flex items-center gap-2 px-4 sm:px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-sm transition cursor-pointer disabled:opacity-60 whitespace-nowrap"
                >
                  {isSending ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Sending...</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      <span>Send Notification</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Centered Notification Full Details & Read Receipts Popup */}
      <NotificationDetailModal
        notification={selectedNotification}
        currentUserId={uid}
        currentUserProfile={userProfile}
        isAdminView={isAdmin}
        allUsers={allUsers}
        canDelete={canUserDeleteNotification(
          selectedNotification,
          userProfile,
          currentUser?.uid,
          isSuperAdmin
        )}
        onDeleted={(deletedId) => {
          setNotifications((prev) => prev.filter((item) => item.id !== deletedId));
          setStatusBanner({
            type: 'success',
            text: 'Sent notification deleted for all recipients.',
          });
          setTimeout(() => setStatusBanner(null), 5000);
        }}
        onClose={() => {
          setSelectedNotificationId(null);
          setFallbackSelectedNotification(null);
        }}
      />

      {/* Confirm Delete Sent Notification Modal */}
      <ConfirmationModal
        isOpen={Boolean(notifPendingDelete)}
        onClose={() => !isDeletingNotif && setNotifPendingDelete(null)}
        onConfirm={handleConfirmDeleteNotification}
        title="Delete Sent Notification"
        message="This will permanently remove the notification from your sent history and all recipient inboxes."
        confirmText="Delete Notification"
        cancelText="Keep Notification"
        variant="danger"
        isLoading={isDeletingNotif}
        details={
          notifPendingDelete
            ? [
                { label: 'Heading', value: notifPendingDelete.heading },
                {
                  label: 'Target',
                  value: notifPendingDelete.targetLabel || notifPendingDelete.targetBranch || 'Recipients',
                },
              ]
            : undefined
        }
      />
    </div>
  );
};
