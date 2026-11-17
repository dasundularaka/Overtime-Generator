import React, { useState, useEffect, useMemo } from 'react';
import {
  Clock,
  FileText,
  Users,
  PlusCircle,
  Sparkles,
  Calendar,
  CheckCircle2,
  Shield,
  Banknote,
  Building2,
  Search,
  RotateCcw,
  Lock,
  Check,
  X,
} from 'lucide-react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase/config';
import { handleFirestoreError, OperationType } from '../firebase/errors';
import { ClaimRecord, Branch, UserProfile } from '../types';
import { MONTH_NAMES } from '../utils/timeCalculations';
import { NavigationTab } from './Navbar';
import { useAuth } from '../context/AuthContext';
import { subscribeToBranches } from '../utils/branchRoleManager';
import { KpiGridSkeleton } from './Skeleton';
import { MonthlyProgressChart, MonthlyProgressDatum } from './MonthlyProgressChart';

interface DashboardProps {
  onNavigate: (tab: NavigationTab) => void;
  onEditClaim?: (claim: ClaimRecord) => void;
  onOpenHelp?: () => void;
}

function getPreviousCalendarMonth(refDate: Date = new Date()): { month: string; monthIndex: number; year: number } {
  const prev = new Date(refDate.getFullYear(), refDate.getMonth() - 1, 1);
  const idx = prev.getMonth();
  return {
    month: MONTH_NAMES[idx],
    monthIndex: idx,
    year: prev.getFullYear(),
  };
}

function normalizeStr(val?: string | null): string {
  return (val || '').trim().toLowerCase();
}

function normalizeMonthIndex(monthVal: string | number | undefined): number {
  if (typeof monthVal === 'number' && Number.isFinite(monthVal)) {
    if (monthVal >= 1 && monthVal <= 12) return monthVal - 1;
    if (monthVal >= 0 && monthVal <= 11) return monthVal;
    return -1;
  }
  const clean = normalizeStr(String(monthVal || ''));
  if (!clean) return -1;
  const fullIdx = MONTH_NAMES.findIndex(m => m.toLowerCase() === clean);
  if (fullIdx >= 0) return fullIdx;
  const shortIdx = MONTH_NAMES.findIndex(m => m.slice(0, 3).toLowerCase() === clean);
  if (shortIdx >= 0) return shortIdx;
  const parsed = parseInt(clean, 10);
  if (Number.isFinite(parsed) && parsed >= 1 && parsed <= 12) return parsed - 1;
  return -1;
}

function getClaimAmount(c: ClaimRecord): number {
  if (typeof c.totalOtPayment === 'number' && Number.isFinite(c.totalOtPayment)) {
    return c.totalOtPayment;
  }
  const payA = typeof c.otPaymentDueA === 'number' && Number.isFinite(c.otPaymentDueA) ? c.otPaymentDueA : 0;
  const payB = typeof c.otPaymentDueB === 'number' && Number.isFinite(c.otPaymentDueB) ? c.otPaymentDueB : 0;
  const daysPay = typeof c.daysPayTotal === 'number' && Number.isFinite(c.daysPayTotal) ? c.daysPayTotal : 0;
  if (payA + payB + daysPay > 0) {
    return Math.round((payA + payB + daysPay) * 100) / 100;
  }
  if (c.hourlyRate && c.totalDecimalHours) {
    return Math.round(Number(c.hourlyRate) * Number(c.totalDecimalHours) * 100) / 100;
  }
  return 0;
}

export const Dashboard: React.FC<DashboardProps> = ({
  onNavigate,
}) => {
  const { currentUser, userProfile, isSuperAdmin, isAdmin } = useAuth();

  const lastMonthPeriod = useMemo(() => getPreviousCalendarMonth(), []);

  const [claims, setClaims] = useState<ClaimRecord[]>([]);
  const [directoryUsers, setDirectoryUsers] = useState<UserProfile[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);

  // Scoped filter state:
  // - Standard User: strictly own claims only (no user/branch filters)
  // - Admin: strictly same-branch users with 'all' | 'selected' mode
  // - Super Admin: All Branches / Selected Branch + All Users / Selected Users
  const [selectedBranchKey, setSelectedBranchKey] = useState<string>('ALL');
  const [userFilterMode, setUserFilterMode] = useState<'all' | 'selected'>('all');
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [userSearchQuery, setUserSearchQuery] = useState<string>('');
  const [chartYear, setChartYear] = useState<number>(lastMonthPeriod.year);

  const myUid = currentUser?.uid || '';
  const myProfileId = userProfile?.id || '';
  const myPf = normalizeStr(userProfile?.employeeNumber || userProfile?.pfNumber);
  const adminBranchNorm = normalizeStr(userProfile?.branch);
  const adminBranchCodeNorm = normalizeStr(userProfile?.branchCode);

  const isOwnClaim = (c: ClaimRecord): boolean => {
    if (myUid && c.userId === myUid) return true;
    if (myProfileId && c.userId === myProfileId) return true;
    const claimPf = normalizeStr(c.employeeNumber);
    if (myPf && claimPf && claimPf === myPf) return true;
    return false;
  };

  const isUserInBranch = (u: Pick<UserProfile, 'id' | 'branch' | 'branchCode'>, targetBranchName: string, targetBranchCode?: string): boolean => {
    const tName = normalizeStr(targetBranchName);
    const tCode = normalizeStr(targetBranchCode);
    const uBranch = normalizeStr(u.branch);
    const uCode = normalizeStr(u.branchCode);
    if (tName && uBranch && uBranch === tName) return true;
    if (tCode && uCode && uCode === tCode) return true;
    return false;
  };

  // Subscribe to branches for Super Admin filtering
  useEffect(() => {
    if (!isSuperAdmin) return;
    const unsub = subscribeToBranches(list => {
      setBranches(list);
    });
    return () => unsub();
  }, [isSuperAdmin]);

  // Fetch scoped users & claims strictly respecting RBAC role boundaries
  useEffect(() => {
    let active = true;
    const loadDashboardData = async () => {
      if (!currentUser) return;
      setLoading(true);
      try {
        if (isSuperAdmin) {
          const [claimsSnap, usersSnap] = await Promise.all([
            getDocs(collection(db, 'claims')),
            getDocs(collection(db, 'users')),
          ]);
          if (!active) return;

          const allClaims: ClaimRecord[] = [];
          claimsSnap.forEach(d => allClaims.push({ ...(d.data() as ClaimRecord), id: d.id }));

          const allUsersList: UserProfile[] = [];
          usersSnap.forEach(d => allUsersList.push({ ...(d.data() as UserProfile), id: d.id }));
          allUsersList.sort((a, b) => (a.name || '').localeCompare(b.name || ''));

          setClaims(allClaims);
          setDirectoryUsers(allUsersList);
        } else if (isAdmin) {
          const [claimsSnap, usersSnap] = await Promise.all([
            getDocs(collection(db, 'claims')),
            getDocs(collection(db, 'users')),
          ]);
          if (!active) return;

          // Admin strictly allowed ONLY same-branch users + own account
          const branchUsers: UserProfile[] = [];
          const allowedUserIds = new Set<string>();
          const allowedUserPfs = new Set<string>();
          if (myUid) allowedUserIds.add(myUid);
          if (myProfileId) allowedUserIds.add(myProfileId);
          if (myPf) allowedUserPfs.add(myPf);

          usersSnap.forEach(d => {
            const u = { ...(d.data() as UserProfile), id: d.id };
            const isSelf = u.id === myUid || (myProfileId && u.id === myProfileId);
            const sameBr = (adminBranchNorm || adminBranchCodeNorm)
              ? isUserInBranch(u, adminBranchNorm, adminBranchCodeNorm)
              : false;
            if (isSelf || sameBr) {
              branchUsers.push(u);
              allowedUserIds.add(u.id);
              const pf = normalizeStr(u.employeeNumber || u.pfNumber);
              if (pf) allowedUserPfs.add(pf);
            }
          });
          branchUsers.sort((a, b) => (a.name || '').localeCompare(b.name || ''));

          const branchClaims: ClaimRecord[] = [];
          claimsSnap.forEach(d => {
            const c = { ...(d.data() as ClaimRecord), id: d.id };
            const cBranch = normalizeStr(c.branch);
            const cCode = normalizeStr(c.branchCode);
            const cPf = normalizeStr(c.employeeNumber);
            const matchesBranchField =
              (adminBranchNorm && cBranch && cBranch === adminBranchNorm) ||
              (adminBranchCodeNorm && cCode && cCode === adminBranchCodeNorm);
            const matchesBranchUser =
              allowedUserIds.has(c.userId) || (cPf !== '' && allowedUserPfs.has(cPf));

            if (isOwnClaim(c) || matchesBranchField || matchesBranchUser) {
              branchClaims.push(c);
            }
          });

          setDirectoryUsers(branchUsers);
          setClaims(branchClaims);
        } else {
          // Standard non-admin user: fetch ONLY own claims
          const claimMap = new Map<string, ClaimRecord>();
          try {
            const snapUid = await getDocs(query(collection(db, 'claims'), where('userId', '==', myUid)));
            snapUid.forEach(d => claimMap.set(d.id, { ...(d.data() as ClaimRecord), id: d.id }));
          } catch (e) {
            console.warn('Dashboard user UID query notice:', e);
          }

          if (myProfileId && myProfileId !== myUid) {
            try {
              const snapProf = await getDocs(query(collection(db, 'claims'), where('userId', '==', myProfileId)));
              snapProf.forEach(d => claimMap.set(d.id, { ...(d.data() as ClaimRecord), id: d.id }));
            } catch {}
          }

          if (myPf) {
            try {
              const upperPf = (userProfile?.employeeNumber || userProfile?.pfNumber || '').trim();
              const snapPf = await getDocs(query(collection(db, 'claims'), where('employeeNumber', '==', upperPf)));
              snapPf.forEach(d => {
                const c = { ...(d.data() as ClaimRecord), id: d.id };
                if (normalizeStr(c.employeeNumber) === myPf) {
                  claimMap.set(d.id, c);
                }
              });
            } catch {}
          }

          if (!active) return;
          const strictOwnClaims = Array.from(claimMap.values()).filter(c => isOwnClaim(c));
          setDirectoryUsers([]);
          setClaims(strictOwnClaims);
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.LIST, 'claims');
      } finally {
        if (active) setLoading(false);
      }
    };

    loadDashboardData();
    return () => {
      active = false;
    };
  }, [currentUser, userProfile, isAdmin, isSuperAdmin, myUid, myProfileId, myPf, adminBranchNorm, adminBranchCodeNorm]);

  // Build unified Super Admin branch options (registered branches + any legacy branch names in claims/users)
  const branchOptions = useMemo(() => {
    const map = new Map<string, { key: string; label: string; code?: string }>();
    for (const b of branches) {
      const k = normalizeStr(b.name);
      if (k && !map.has(k)) {
        map.set(k, {
          key: b.name,
          label: b.branchCode ? `${b.branchCode} — ${b.name}` : b.name,
          code: b.branchCode,
        });
      }
    }
    for (const u of directoryUsers) {
      const k = normalizeStr(u.branch);
      if (k && !map.has(k)) {
        map.set(k, { key: u.branch, label: u.branch, code: u.branchCode });
      }
    }
    for (const c of claims) {
      const k = normalizeStr(c.branch);
      if (k && !map.has(k)) {
        map.set(k, { key: c.branch, label: c.branch, code: c.branchCode });
      }
    }
    return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [branches, directoryUsers, claims]);

  // Selected branch metadata for Super Admin
  const selectedBranchMeta = useMemo(() => {
    if (!isSuperAdmin || selectedBranchKey === 'ALL') return null;
    return branchOptions.find(b => normalizeStr(b.key) === normalizeStr(selectedBranchKey)) || {
      key: selectedBranchKey,
      label: selectedBranchKey,
      code: '',
    };
  }, [isSuperAdmin, selectedBranchKey, branchOptions]);

  // Eligible selectable users based on active branch scope (also includes claim-derived synthetic users if any user missing from directory)
  const selectableUsers = useMemo(() => {
    if (!isAdmin) return [];
    const userMap = new Map<string, { id: string; name: string; pf: string; branch: string; branchCode?: string }>();

    for (const u of directoryUsers) {
      if (isSuperAdmin && selectedBranchMeta) {
        if (!isUserInBranch(u, selectedBranchMeta.key, selectedBranchMeta.code)) continue;
      }
      userMap.set(u.id, {
        id: u.id,
        name: u.name || u.email || 'Staff Member',
        pf: (u.employeeNumber || u.pfNumber || '').trim(),
        branch: u.branch || '',
        branchCode: u.branchCode,
      });
    }

    // Ensure claim authors whose user doc was removed/archived still appear cleanly in filter list
    for (const c of claims) {
      if (isSuperAdmin && selectedBranchMeta) {
        const cBranch = normalizeStr(c.branch);
        const cCode = normalizeStr(c.branchCode);
        const matchB =
          (cBranch && cBranch === normalizeStr(selectedBranchMeta.key)) ||
          (selectedBranchMeta.code && cCode && cCode === normalizeStr(selectedBranchMeta.code));
        if (!matchB) continue;
      }
      if (c.userId && !userMap.has(c.userId)) {
        userMap.set(c.userId, {
          id: c.userId,
          name: c.employeeName || 'Staff Member',
          pf: (c.employeeNumber || '').trim(),
          branch: c.branch || '',
          branchCode: c.branchCode,
        });
      }
    }

    return Array.from(userMap.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [isAdmin, isSuperAdmin, directoryUsers, claims, selectedBranchMeta]);

  // Prune selectedUserIds if branch filter changes so selected users always match visible branch
  useEffect(() => {
    if (!isAdmin) return;
    if (selectedUserIds.length === 0) return;
    const validSet = new Set(selectableUsers.map(u => u.id));
    const pruned = selectedUserIds.filter(id => validSet.has(id));
    if (pruned.length !== selectedUserIds.length) {
      setSelectedUserIds(pruned);
    }
  }, [selectableUsers, isAdmin]);

  const filteredPickerUsers = useMemo(() => {
    const q = normalizeStr(userSearchQuery);
    if (!q) return selectableUsers;
    return selectableUsers.filter(
      u => normalizeStr(u.name).includes(q) || normalizeStr(u.pf).includes(q) || normalizeStr(u.branch).includes(q)
    );
  }, [selectableUsers, userSearchQuery]);

  // Fast map of selected user identifiers (IDs & PF numbers) for accurate claim matching
  const selectedUserMatchers = useMemo(() => {
    const idSet = new Set<string>(selectedUserIds);
    const pfSet = new Set<string>();
    for (const u of selectableUsers) {
      if (idSet.has(u.id) && u.pf) {
        pfSet.add(normalizeStr(u.pf));
      }
    }
    return { idSet, pfSet };
  }, [selectedUserIds, selectableUsers]);

  // Claims matching active Branch + User selection (excluding drafts & rejected claims)
  const scopedSubmittedClaims = useMemo(() => {
    const submittedOnly = claims.filter(c => c.status !== 'draft' && c.status !== 'rejected');

    if (!isAdmin) {
      return submittedOnly;
    }

    let result = submittedOnly;

    // 1. Branch filter for Super Admin (Regular Admin claims are already locked to own branch on fetch)
    if (isSuperAdmin && selectedBranchMeta) {
      const targetName = normalizeStr(selectedBranchMeta.key);
      const targetCode = normalizeStr(selectedBranchMeta.code);
      const branchUserIds = new Set(selectableUsers.map(u => u.id));
      const branchUserPfs = new Set(selectableUsers.map(u => normalizeStr(u.pf)).filter(Boolean));

      result = result.filter(c => {
        const cBranch = normalizeStr(c.branch);
        const cCode = normalizeStr(c.branchCode);
        const cPf = normalizeStr(c.employeeNumber);
        if (targetName && cBranch && cBranch === targetName) return true;
        if (targetCode && cCode && cCode === targetCode) return true;
        if (c.userId && branchUserIds.has(c.userId)) return true;
        if (cPf && branchUserPfs.has(cPf)) return true;
        return false;
      });
    }

    // 2. Selected Users filter for Admin / Super Admin
    if (userFilterMode === 'selected') {
      if (selectedUserMatchers.idSet.size === 0) {
        return [];
      }
      result = result.filter(c => {
        if (c.userId && selectedUserMatchers.idSet.has(c.userId)) return true;
        const cPf = normalizeStr(c.employeeNumber);
        if (cPf && selectedUserMatchers.pfSet.has(cPf)) return true;
        return false;
      });
    }

    return result;
  }, [claims, isAdmin, isSuperAdmin, selectedBranchMeta, selectableUsers, userFilterMode, selectedUserMatchers]);

  // Last Month Claimed Metrics (replacing all-time OT hours & OT pay cards)
  const lastMonthStats = useMemo(() => {
    const matching = scopedSubmittedClaims.filter(c => {
      const mIdx = normalizeMonthIndex(c.month);
      const y = Number(c.year);
      return mIdx === lastMonthPeriod.monthIndex && y === lastMonthPeriod.year;
    });

    let totalMinutes = 0;
    let totalEarnings = 0;
    let totalOtDays = 0;
    const uniqueClaimants = new Set<string>();

    for (const c of matching) {
      totalMinutes += c.totalMinutes || 0;
      totalEarnings += getClaimAmount(c);
      totalOtDays += c.otDaysCount || 0;
      const who = normalizeStr(c.employeeNumber) || c.userId || c.employeeName;
      if (who) uniqueClaimants.add(who);
    }

    const totalHours = Math.floor(totalMinutes / 60);
    const totalRemMinutes = Math.floor(totalMinutes % 60);
    const totalHoursFormatted = `${String(totalHours).padStart(2, '0')}:${String(totalRemMinutes).padStart(2, '0')}`;
    const totalDecimalHours = (totalMinutes / 60).toFixed(1);

    const latestStatus = matching[0]?.status;

    return {
      claimsCount: matching.length,
      totalHoursFormatted,
      totalDecimalHours,
      totalEarnings: Math.round(totalEarnings * 100) / 100,
      totalOtDays,
      uniqueUsersCount: uniqueClaimants.size,
      latestStatus,
    };
  }, [scopedSubmittedClaims, lastMonthPeriod]);

  // Available chart years (chronological descending)
  const availableChartYears = useMemo(() => {
    const set = new Set<number>([new Date().getFullYear(), lastMonthPeriod.year]);
    for (const c of claims) {
      const y = Number(c.year);
      if (Number.isFinite(y) && y >= 2000 && y <= 2100) set.add(y);
    }
    return Array.from(set).sort((a, b) => b - a);
  }, [claims, lastMonthPeriod.year]);

  // Monthly Progress Chart Data (X-Axis: Jan..Dec of chartYear, Y-Axis: Amount Rs.)
  const monthlyProgressData = useMemo<MonthlyProgressDatum[]>(() => {
    const buckets: MonthlyProgressDatum[] = MONTH_NAMES.map((mName, idx) => ({
      monthIndex: idx,
      monthName: mName,
      shortLabel: mName.slice(0, 3),
      amount: 0,
      minutes: 0,
      claimsCount: 0,
      isLastMonth: chartYear === lastMonthPeriod.year && idx === lastMonthPeriod.monthIndex,
    }));

    for (const c of scopedSubmittedClaims) {
      if (Number(c.year) !== chartYear) continue;
      const mIdx = normalizeMonthIndex(c.month);
      if (mIdx < 0 || mIdx > 11) continue;
      buckets[mIdx].amount = Math.round((buckets[mIdx].amount + getClaimAmount(c)) * 100) / 100;
      buckets[mIdx].minutes += c.totalMinutes || 0;
      buckets[mIdx].claimsCount += 1;
    }

    return buckets;
  }, [scopedSubmittedClaims, chartYear, lastMonthPeriod]);

  // Helpers for filter interactions
  const handleToggleUserSelection = (userId: string) => {
    setUserFilterMode('selected');
    setSelectedUserIds(prev =>
      prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
    );
  };

  const handleSelectPreset = (preset: 'all_branches_all_users' | 'branch_all_users' | 'branch_selected_users' | 'only_me') => {
    if (preset === 'all_branches_all_users') {
      setSelectedBranchKey('ALL');
      setUserFilterMode('all');
      setSelectedUserIds([]);
      setUserSearchQuery('');
    } else if (preset === 'branch_all_users') {
      if (isSuperAdmin && selectedBranchKey === 'ALL' && branchOptions.length > 0) {
        setSelectedBranchKey(branchOptions[0].key);
      }
      setUserFilterMode('all');
      setSelectedUserIds([]);
      setUserSearchQuery('');
    } else if (preset === 'branch_selected_users') {
      if (isSuperAdmin && selectedBranchKey === 'ALL' && branchOptions.length > 0) {
        setSelectedBranchKey(branchOptions[0].key);
      }
      setUserFilterMode('selected');
    } else if (preset === 'only_me') {
      if (isSuperAdmin) setSelectedBranchKey('ALL');
      setUserFilterMode('selected');
      const me = selectableUsers.find(u => u.id === myUid || u.id === myProfileId || (myPf && normalizeStr(u.pf) === myPf));
      setSelectedUserIds(me ? [me.id] : myUid ? [myUid] : []);
    }
  };

  // Dynamic Chart & KPI scope labels
  const activeScopeSummary = useMemo(() => {
    if (!isAdmin) {
      return {
        scopeTag: 'My Claims',
        chartTitle: 'My Monthly Overtime Progress',
        chartSubtitle: `Monthly claimed amount progression across ${chartYear} (X: Month, Y: Amount in Rs.)`,
        isMultiUser: false,
      };
    }

    if (isSuperAdmin) {
      const branchLabel = selectedBranchMeta ? selectedBranchMeta.key : 'All Branches';
      if (userFilterMode === 'all') {
        return {
          scopeTag: `${branchLabel} · All Users`,
          chartTitle: `Overtime Progress — ${branchLabel} (All Users)`,
          chartSubtitle: `Monthly claimed amount progression across ${chartYear} for all staff in ${branchLabel.toLowerCase()}`,
          isMultiUser: true,
        };
      }
      const count = selectedUserIds.length;
      const singleUser = count === 1 ? selectableUsers.find(u => u.id === selectedUserIds[0]) : null;
      const userLabel =
        count === 0
          ? 'No Users Selected'
          : count === 1 && singleUser
          ? `${singleUser.name}${singleUser.pf ? ` (${singleUser.pf})` : ''}`
          : `${count} Selected Users`;
      return {
        scopeTag: `${branchLabel} · ${userLabel}`,
        chartTitle: `Overtime Progress — ${userLabel}`,
        chartSubtitle: `${branchLabel} monthly claimed amount progression across ${chartYear}`,
        isMultiUser: count !== 1,
      };
    }

    // Regular Branch Admin (locked to own branch)
    const ownBranch = userProfile?.branch || 'My Branch';
    if (userFilterMode === 'all') {
      return {
        scopeTag: `${ownBranch} · All Users`,
        chartTitle: `Branch Overtime Progress — ${ownBranch}`,
        chartSubtitle: `Monthly claimed amount across ${chartYear} for all users in ${ownBranch}`,
        isMultiUser: true,
      };
    }
    const count = selectedUserIds.length;
    const singleUser = count === 1 ? selectableUsers.find(u => u.id === selectedUserIds[0]) : null;
    const userLabel =
      count === 0
        ? 'No Users Selected'
        : count === 1 && singleUser
        ? `${singleUser.name}${singleUser.pf ? ` (${singleUser.pf})` : ''}`
        : `${count} Selected Users`;
    return {
      scopeTag: `${ownBranch} · ${userLabel}`,
      chartTitle: `Overtime Progress — ${userLabel}`,
      chartSubtitle: `${ownBranch} branch · Monthly claimed amount across ${chartYear}`,
      isMultiUser: count !== 1,
    };
  }, [isAdmin, isSuperAdmin, selectedBranchMeta, userFilterMode, selectedUserIds, selectableUsers, userProfile?.branch, chartYear]);

  const userCap = userProfile?.maxOtHoursPerDay !== undefined ? userProfile.maxOtHoursPerDay : 2.0;
  const lastMonthHeading = `${lastMonthPeriod.month} ${lastMonthPeriod.year}`;

  return (
    <div className="space-y-5 sm:space-y-6 pb-10 w-full">
      {/* Welcome Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 p-5 sm:p-8 text-white shadow-xl border border-slate-800">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-5">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-500/20 text-indigo-300 text-xs font-semibold mb-3 border border-indigo-500/30">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Shift: 8:00 AM – 4:45 PM &bull; 15-Min Step Engine</span>
            </div>
            <h1 className="text-xl sm:text-3xl font-extrabold tracking-tight">
              Welcome, {userProfile?.name || 'User'}!
            </h1>
            <p className="mt-2 text-xs sm:text-sm text-slate-300 leading-relaxed">
              General shift is 8:00 AM to 4:45 PM. Overtime is automatically generated in 15-minute intervals only for time worked after 4:45 PM, capped at your assigned limit ({userCap} hrs max/day).
            </p>

            <div className="mt-4 flex flex-wrap items-center gap-2 text-[11px] font-medium text-slate-300">
              <span className="bg-slate-800/80 px-2.5 py-1 rounded-lg border border-slate-700">
                Shift: 08:00 - 16:45
              </span>
              <span className="bg-slate-800/80 px-2.5 py-1 rounded-lg border border-slate-700">
                OT Starts After 4:45 PM
              </span>
              <span className="bg-slate-800/80 px-2.5 py-1 rounded-lg border border-slate-700">
                Claim Period: {lastMonthHeading}
              </span>
              <span className="bg-emerald-500/20 text-emerald-300 px-2.5 py-1 rounded-lg border border-emerald-500/40">
                Daily Cap: {userCap}h
              </span>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row md:flex-col gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => onNavigate('new-claim')}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-2.5 text-xs font-bold shadow-md transition cursor-pointer"
            >
              <PlusCircle className="w-4 h-4" />
              <span>Claim {lastMonthPeriod.month} OT</span>
            </button>
            <button
              type="button"
              onClick={() => onNavigate('branches')}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-800/90 hover:bg-slate-700 text-slate-100 px-5 py-2.5 text-xs font-semibold border border-slate-700 shadow-md transition cursor-pointer"
              title="Access corporate bank branch network directory"
            >
              <Building2 className="w-4 h-4 text-emerald-400" />
              <span>Branch Network</span>
            </button>
          </div>
        </div>
      </div>

      {/* Role-Based Dashboard Scope & Chart Filter Bar (Admins: Same-Branch Only; Super Admins: All Branches & Users) */}
      {isAdmin && (
        <div className="rounded-2xl sm:rounded-3xl bg-white p-4 sm:p-5 shadow-xs border border-slate-200 space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2.5 min-w-0">
              <div
                className={`flex h-9 w-9 items-center justify-center rounded-xl shrink-0 border ${
                  isSuperAdmin
                    ? 'bg-amber-500/10 text-amber-600 border-amber-500/20'
                    : 'bg-indigo-50 text-indigo-600 border-indigo-200'
                }`}
              >
                {isSuperAdmin ? <Shield className="w-4 h-4" /> : <Users className="w-4 h-4" />}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-sm font-bold text-slate-900">
                    {isSuperAdmin ? 'Super Admin Analytics Filter' : 'Branch Analytics Filter'}
                  </h3>
                  {!isSuperAdmin && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 text-[11px] font-semibold border border-slate-200">
                      <Lock className="w-3 h-3 text-slate-500" />
                      <span>{userProfile?.branch || 'Assigned Branch'}</span>
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-500 mt-0.5 truncate">
                  {isSuperAdmin
                    ? 'Filter progress chart and last month claimed metrics by branch and selected staff.'
                    : `Inspect overtime progress for staff in ${userProfile?.branch || 'your branch'} only.`}
                </p>
              </div>
            </div>

            {/* Quick Scope Presets */}
            <div className="flex flex-wrap items-center gap-1.5">
              {isSuperAdmin ? (
                <>
                  <button
                    type="button"
                    onClick={() => handleSelectPreset('all_branches_all_users')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition cursor-pointer ${
                      selectedBranchKey === 'ALL' && userFilterMode === 'all'
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    All Branches · All Users
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSelectPreset('branch_all_users')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition cursor-pointer ${
                      selectedBranchKey !== 'ALL' && userFilterMode === 'all'
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    Selected Branch · All Users
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSelectPreset('branch_selected_users')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition cursor-pointer ${
                      selectedBranchKey !== 'ALL' && userFilterMode === 'selected'
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    Selected Branch · Selected Users
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => handleSelectPreset('branch_all_users')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition cursor-pointer ${
                      userFilterMode === 'all'
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    All Users (Same Branch)
                  </button>
                  <button
                    type="button"
                    onClick={() => setUserFilterMode('selected')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition cursor-pointer ${
                      userFilterMode === 'selected'
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    Selected Users
                  </button>
                </>
              )}

              <button
                type="button"
                onClick={() => handleSelectPreset('only_me')}
                className="px-3 py-1.5 rounded-xl text-xs font-semibold border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 transition cursor-pointer"
              >
                My Own Only
              </button>
            </div>
          </div>

          {/* Cascading Branch & User Filter Controls */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-start">
            {isSuperAdmin && (
              <div className="md:col-span-5">
                <label
                  htmlFor="dashboard-branch-select"
                  className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1"
                >
                  Branch Scope
                </label>
                <select
                  id="dashboard-branch-select"
                  value={selectedBranchKey}
                  onChange={(e) => setSelectedBranchKey(e.target.value)}
                  className="w-full h-10 px-3 rounded-xl border border-slate-300 bg-white text-xs sm:text-sm font-semibold text-slate-800 focus:outline-hidden focus:border-indigo-500 cursor-pointer"
                >
                  <option value="ALL">All Branches ({branchOptions.length})</option>
                  {branchOptions.map(b => (
                    <option key={b.key} value={b.key}>
                      {b.label}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className={isSuperAdmin ? 'md:col-span-4' : 'md:col-span-6'}>
              <label
                htmlFor="dashboard-user-mode"
                className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1"
              >
                User Scope
              </label>
              <select
                id="dashboard-user-mode"
                value={userFilterMode}
                onChange={(e) => setUserFilterMode(e.target.value as 'all' | 'selected')}
                className="w-full h-10 px-3 rounded-xl border border-slate-300 bg-white text-xs sm:text-sm font-semibold text-slate-800 focus:outline-hidden focus:border-indigo-500 cursor-pointer"
              >
                <option value="all">
                  All Users ({selectableUsers.length} in {isSuperAdmin && selectedBranchKey === 'ALL' ? 'All Branches' : isSuperAdmin ? selectedBranchKey : userProfile?.branch || 'Branch'})
                </option>
                <option value="selected">Selected Users ({selectedUserIds.length} chosen)</option>
              </select>
            </div>

            <div className={`${isSuperAdmin ? 'md:col-span-3' : 'md:col-span-6'} flex items-end justify-between md:justify-end gap-2 md:pt-5`}>
              <span className="text-xs text-slate-500 truncate">
                Active: <strong className="text-slate-800">{activeScopeSummary.scopeTag}</strong>
              </span>
              {((isSuperAdmin && selectedBranchKey !== 'ALL') || userFilterMode !== 'all' || selectedUserIds.length > 0) && (
                <button
                  type="button"
                  onClick={() => handleSelectPreset(isSuperAdmin ? 'all_branches_all_users' : 'branch_all_users')}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-rose-600 hover:text-rose-700 shrink-0 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Reset</span>
                </button>
              )}
            </div>
          </div>

          {/* Searchable Multi-User Picker (Expanded when Selected Users mode is active) */}
          {userFilterMode === 'selected' && (
            <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3.5 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="relative flex-1 min-w-0">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={userSearchQuery}
                    onChange={(e) => setUserSearchQuery(e.target.value)}
                    placeholder="Search staff by name or PF number..."
                    className="w-full h-9 pl-8 pr-3 rounded-xl border border-slate-300 bg-white text-xs text-slate-800 focus:outline-hidden focus:border-indigo-500"
                  />
                </div>
                <div className="flex items-center gap-2 shrink-0 text-xs">
                  <button
                    type="button"
                    onClick={() => setSelectedUserIds(filteredPickerUsers.map(u => u.id))}
                    className="px-2.5 py-1.5 rounded-lg bg-white border border-slate-300 text-slate-700 font-semibold hover:bg-slate-100 cursor-pointer"
                  >
                    Select Shown ({filteredPickerUsers.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedUserIds([])}
                    className="px-2.5 py-1.5 rounded-lg bg-white border border-slate-300 text-slate-600 font-semibold hover:bg-slate-100 cursor-pointer"
                  >
                    Clear
                  </button>
                </div>
              </div>

              {/* Selected User Chips */}
              {selectedUserIds.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  {selectedUserIds.map(uid => {
                    const u = selectableUsers.find(item => item.id === uid);
                    if (!u) return null;
                    return (
                      <button
                        key={uid}
                        type="button"
                        onClick={() => handleToggleUserSelection(uid)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-600 text-white text-[11px] font-semibold hover:bg-indigo-700 transition cursor-pointer"
                        title="Click to remove user"
                      >
                        <span className="truncate max-w-[160px]">{u.name}</span>
                        {u.pf && <span className="opacity-80 font-mono">({u.pf})</span>}
                        <X className="w-3 h-3 shrink-0" />
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Scrollable User Checklist */}
              {filteredPickerUsers.length === 0 ? (
                <div className="py-4 text-center text-xs text-slate-500">
                  No staff found matching your branch/search criteria.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-[min(14rem,32dvh)] overflow-y-auto pr-1">
                  {filteredPickerUsers.map(u => {
                    const isChecked = selectedUserIds.includes(u.id);
                    return (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => handleToggleUserSelection(u.id)}
                        className={`flex items-center justify-between gap-2 px-3 py-2 rounded-xl border text-left text-xs transition cursor-pointer ${
                          isChecked
                            ? 'bg-indigo-50 border-indigo-300 text-indigo-950 font-semibold'
                            : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="truncate font-semibold">{u.name}</div>
                          <div className="text-[10px] text-slate-500 truncate">
                            {u.pf || 'No PF'} {u.branch ? `· ${u.branch}` : ''}
                          </div>
                        </div>
                        <span
                          className={`w-4 h-4 rounded-md flex items-center justify-center shrink-0 border ${
                            isChecked
                              ? 'bg-indigo-600 border-indigo-600 text-white'
                              : 'border-slate-300 bg-white'
                          }`}
                        >
                          {isChecked && <Check className="w-3 h-3" />}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}

              {selectedUserIds.length === 0 && (
                <p className="text-[11px] font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                  Select one or more staff members above to display their Progress Chart and Last Month Claimed metrics.
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Last Month Claimed Details Metric KPI Cards */}
      {loading ? (
        <KpiGridSkeleton count={5} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3 sm:gap-4">
          {/* Card 1: Last Month Claimed OT Hours */}
          <div className="rounded-2xl bg-white p-4 sm:p-5 shadow-xs border border-slate-200">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 truncate">
                Last Month Claimed OT
              </span>
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 shrink-0">
                <Clock className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2 tabular-nums">
              <span className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
                {lastMonthStats.totalHoursFormatted}
              </span>
              <span className="text-xs font-medium text-slate-500">
                ({lastMonthStats.totalDecimalHours} hrs)
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-400 truncate">
              {lastMonthHeading} &bull; {lastMonthStats.totalOtDays} {lastMonthStats.totalOtDays === 1 ? 'day' : 'days'} claimed
            </p>
          </div>

          {/* Card 2: Last Month Claimed Pay */}
          <div className="rounded-2xl bg-white p-4 sm:p-5 shadow-xs border border-slate-200">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 truncate">
                {lastMonthPeriod.month} Claimed Pay
              </span>
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 shrink-0">
                <Banknote className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-1.5 tabular-nums">
              <span className="text-xl sm:text-2xl font-black text-emerald-700 tracking-tight truncate">
                Rs. {lastMonthStats.totalEarnings.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-400 truncate">
              {lastMonthHeading} Remuneration Due
            </p>
          </div>

          {/* Card 3: Last Month Claim Status & Count */}
          <div className="rounded-2xl bg-white p-4 sm:p-5 shadow-xs border border-slate-200 flex flex-col justify-between">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 truncate">
                {lastMonthPeriod.month} Claim Status
              </span>
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600 shrink-0">
                <FileText className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-2.5">
              {lastMonthStats.claimsCount > 0 ? (
                <div className="flex items-baseline gap-2 tabular-nums">
                  <span className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
                    {lastMonthStats.claimsCount}
                  </span>
                  <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>
                      {activeScopeSummary.isMultiUser
                        ? `${lastMonthStats.claimsCount === 1 ? 'Claim' : 'Claims'} (${lastMonthStats.uniqueUsersCount} Staff)`
                        : lastMonthStats.latestStatus === 'approved' || lastMonthStats.latestStatus === 'completed'
                        ? 'Approved'
                        : 'Submitted'}
                    </span>
                  </span>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-bold text-slate-700">
                    No {lastMonthPeriod.month} claim yet
                  </span>
                  {!activeScopeSummary.isMultiUser && (
                    <button
                      type="button"
                      onClick={() => onNavigate('new-claim')}
                      className="text-xs font-bold text-indigo-600 hover:text-indigo-800 hover:underline cursor-pointer shrink-0"
                    >
                      Claim Now
                    </button>
                  )}
                </div>
              )}
              <p className="mt-1 text-xs text-slate-400 truncate">
                Period: {lastMonthHeading} ({activeScopeSummary.scopeTag})
              </p>
            </div>
          </div>

          {/* Card 4: Assigned Overtime Limit */}
          <div className="rounded-2xl bg-white p-4 sm:p-5 shadow-xs border border-slate-200">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Assigned Daily Cap
              </span>
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 shrink-0">
                <Clock className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-1.5 tabular-nums">
              <span className="text-2xl sm:text-3xl font-black text-emerald-700 tracking-tight">
                {userCap}h
              </span>
              <span className="text-xs font-medium text-slate-500">max/day</span>
            </div>
            <p className="mt-1 text-xs text-slate-400 truncate">
              {isAdmin ? 'Admins can edit in User Admin' : 'Configured by Administrator'}
            </p>
          </div>

          {/* Card 5: Role & Claim Type */}
          <div className="rounded-2xl bg-white p-4 sm:p-5 shadow-xs border border-slate-200 flex flex-col justify-between sm:col-span-2 lg:col-span-1">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Role &amp; Claim Type
              </span>
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-purple-50 text-purple-600 shrink-0">
                <Shield className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`text-base font-bold capitalize ${isSuperAdmin ? 'text-amber-600' : 'text-slate-900'}`}>
                  {isSuperAdmin ? 'Super Admin' : userProfile?.role || 'User'}
                </span>
                <span className="text-xs font-bold px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200">
                  {userProfile?.claimType === 'OP' ? 'OP (Out of Pocket)' : 'OT (Overtime)'}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-1 truncate">
                {isSuperAdmin ? 'System Owner & Administrator' : userProfile?.branch || userProfile?.department}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Monthly Overtime Progress Chart (Replaces "My Recent Overtime Claims") */}
      <MonthlyProgressChart
        data={monthlyProgressData}
        selectedYear={chartYear}
        availableYears={availableChartYears}
        onYearChange={setChartYear}
        title={activeScopeSummary.chartTitle}
        subtitle={activeScopeSummary.chartSubtitle}
        loading={loading}
        onCreateClaim={() => onNavigate('new-claim')}
      />
    </div>
  );
};
