import React, { useState, useEffect, useMemo } from 'react';
import {
  ShieldCheck,
  Search,
  Filter,
  Download,
  RefreshCw,
  Clock,
  User,
  Building2,
  FileText,
  KeyRound,
  Trash2,
  Edit2,
  UserPlus,
  Sliders,
  Calendar,
  AlertCircle,
  Eye,
  X,
  CheckCircle2,
  Activity,
  Layers,
  ArrowRight,
  GitCompare,
  PlusCircle,
  MinusCircle,
  FileSpreadsheet,
  Globe,
  Database,
  Lock,
  Mail,
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
  SlidersHorizontal,
} from 'lucide-react';
import { AuditLogEntry, AuditActionType, AuditFieldDiff } from '../types';
import { fetchAuditLogs, exportAuditLogsToCsv, extractDiffFromLog } from '../utils/auditLogger';

export const AuditLogViewer: React.FC = () => {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedActionCategory, setSelectedActionCategory] = useState<string>('ALL');
  const [selectedBranch, setSelectedBranch] = useState<string>('ALL');
  const [onlyRealChanges, setOnlyRealChanges] = useState<boolean>(false);
  const [selectedLogForDetails, setSelectedLogForDetails] = useState<AuditLogEntry | null>(null);
  const [expandedMobileLogId, setExpandedMobileLogId] = useState<string | null>(null);
  const [activeModalTab, setActiveModalTab] = useState<'diff' | 'raw'>('diff');
  const [copiedRaw, setCopiedRaw] = useState(false);

  const loadLogs = async () => {
    setLoading(true);
    try {
      const data = await fetchAuditLogs(300);
      setLogs(data);
    } catch (e) {
      console.error('Failed to load audit logs', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLogs();
  }, []);

  // Close modal on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && selectedLogForDetails) {
        setSelectedLogForDetails(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedLogForDetails]);

  // Distinct branches for filtering
  const availableBranches = useMemo(() => {
    const set = new Set<string>();
    logs.forEach(l => {
      if (l.userBranch) set.add(l.userBranch);
    });
    return Array.from(set).sort();
  }, [logs]);

  // Precompute genuine diffs for all logs to avoid recomputation
  const logDiffMap = useMemo(() => {
    const map = new Map<string, AuditFieldDiff[]>();
    logs.forEach(log => {
      map.set(log.id, extractDiffFromLog(log));
    });
    return map;
  }, [logs]);

  // Count logs with genuine changes
  const realChangesCount = useMemo(() => {
    let count = 0;
    logs.forEach(log => {
      const diffs = logDiffMap.get(log.id) || [];
      if (diffs.length > 0) count++;
    });
    return count;
  }, [logs, logDiffMap]);

  // Filtered logs
  const filteredLogs = useMemo(() => {
    return logs.filter(log => {
      const diffs = logDiffMap.get(log.id) || [];

      // 1. Only Real Changes Filter
      if (onlyRealChanges && diffs.length === 0) {
        return false;
      }

      // 2. Search Query
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const matchesName = (log.userName || '').toLowerCase().includes(query);
        const matchesPf = (log.userPfNumber || '').toLowerCase().includes(query);
        const matchesBranch = (log.userBranch || '').toLowerCase().includes(query);
        const matchesDesc = (log.targetDescription || '').toLowerCase().includes(query);
        const matchesLabel = (log.actionLabel || '').toLowerCase().includes(query);
        const matchesTargetId = (log.targetId || '').toLowerCase().includes(query);
        const matchesAction = (log.action || '').toLowerCase().includes(query);

        // Check if any genuine diff matches
        const matchesDiff = diffs.some(
          d =>
            d.label.toLowerCase().includes(query) ||
            (d.formattedBefore && d.formattedBefore.toLowerCase().includes(query)) ||
            (d.formattedAfter && d.formattedAfter.toLowerCase().includes(query))
        );

        if (
          !matchesName &&
          !matchesPf &&
          !matchesBranch &&
          !matchesDesc &&
          !matchesLabel &&
          !matchesTargetId &&
          !matchesAction &&
          !matchesDiff
        ) {
          return false;
        }
      }

      // 3. Action Category Filter
      if (selectedActionCategory !== 'ALL') {
        const act = log.action;
        if (selectedActionCategory === 'USERS' && !act.startsWith('USER_') && !act.startsWith('EMPLOYEE_')) return false;
        if (selectedActionCategory === 'PASSWORDS' && !act.includes('PASSWORD')) return false;
        if (selectedActionCategory === 'CLAIMS' && !act.startsWith('CLAIM_')) return false;
        if (selectedActionCategory === 'ROLES' && !act.startsWith('ROLE_')) return false;
        if (selectedActionCategory === 'BRANCHES' && !act.startsWith('BRANCH_')) return false;
        if (selectedActionCategory === 'DEPARTMENTS' && !act.startsWith('DEPARTMENT_')) return false;
        if (selectedActionCategory === 'TEMPLATES' && !act.startsWith('TEMPLATE_')) return false;
        if (selectedActionCategory === 'CALENDAR' && !act.startsWith('HOLIDAY_')) return false;
        if (
          selectedActionCategory === 'SYSTEM' &&
          !act.startsWith('SETTINGS_') &&
          !act.startsWith('DATA_') &&
          !act.startsWith('GOOGLE_') &&
          !act.includes('EMAIL')
        )
          return false;
      }

      // 4. Branch Filter
      if (selectedBranch !== 'ALL' && log.userBranch !== selectedBranch) {
        return false;
      }

      return true;
    });
  }, [logs, searchQuery, selectedActionCategory, selectedBranch, onlyRealChanges, logDiffMap]);

  // Statistics
  const stats = useMemo(() => {
    return {
      total: logs.length,
      realChanges: realChangesCount,
      claimEvents: logs.filter(l => l.action.startsWith('CLAIM_')).length,
      userSecurityEvents: logs.filter(
        l =>
          l.action.startsWith('USER_') ||
          l.action.startsWith('EMPLOYEE_') ||
          l.action.includes('PASSWORD')
      ).length,
    };
  }, [logs, realChangesCount]);

  const getActionBadgeColor = (action: AuditActionType) => {
    if (action.includes('CREATE') || action.includes('ADD') || action.includes('IMPORT') || action.includes('RESTORE')) {
      return 'bg-emerald-50 text-emerald-800 border-emerald-200';
    }
    if (action.includes('DELETE') || (action.includes('RESET') && action.includes('FACTORY'))) {
      return 'bg-rose-50 text-rose-800 border-rose-200';
    }
    if (action.includes('PASSWORD')) {
      return 'bg-amber-50 text-amber-900 border-amber-200';
    }
    if (action.includes('UPDATE') || action.includes('EDIT') || action.includes('TOGGLE')) {
      return 'bg-blue-50 text-blue-800 border-blue-200';
    }
    if (action.includes('LOGIN') || action.includes('LOGOUT')) {
      return 'bg-slate-100 text-slate-800 border-slate-200';
    }
    if (action.includes('EXPORT') || action.includes('DOWNLOAD') || action.includes('PDF')) {
      return 'bg-indigo-50 text-indigo-800 border-indigo-200';
    }
    if (action.includes('GOOGLE') || action.includes('EMAIL')) {
      return 'bg-sky-50 text-sky-800 border-sky-200';
    }
    return 'bg-purple-50 text-purple-800 border-purple-200';
  };

  const getActionIcon = (action: AuditActionType) => {
    if (action.startsWith('USER_CREATE') || action.startsWith('EMPLOYEE_CREATE'))
      return <UserPlus className="w-3.5 h-3.5 text-emerald-600 shrink-0" />;
    if (action.includes('DELETE')) return <Trash2 className="w-3.5 h-3.5 text-rose-600 shrink-0" />;
    if (action.includes('PASSWORD')) return <KeyRound className="w-3.5 h-3.5 text-amber-600 shrink-0" />;
    if (action.startsWith('CLAIM_EXPORT')) return <Download className="w-3.5 h-3.5 text-indigo-600 shrink-0" />;
    if (action.startsWith('CLAIM_')) return <FileText className="w-3.5 h-3.5 text-blue-600 shrink-0" />;
    if (action.startsWith('BRANCH_')) return <Building2 className="w-3.5 h-3.5 text-purple-600 shrink-0" />;
    if (action.startsWith('ROLE_')) return <Layers className="w-3.5 h-3.5 text-indigo-600 shrink-0" />;
    if (action.startsWith('HOLIDAY_')) return <Calendar className="w-3.5 h-3.5 text-orange-600 shrink-0" />;
    if (action.startsWith('TEMPLATE_')) return <Sliders className="w-3.5 h-3.5 text-teal-600 shrink-0" />;
    if (action.includes('UPDATE')) return <Edit2 className="w-3.5 h-3.5 text-blue-600 shrink-0" />;
    if (action.includes('BACKUP') || action.includes('RESTORE'))
      return <Database className="w-3.5 h-3.5 text-indigo-600 shrink-0" />;
    if (action.includes('GOOGLE')) return <Globe className="w-3.5 h-3.5 text-sky-600 shrink-0" />;
    if (action.includes('EMAIL')) return <Mail className="w-3.5 h-3.5 text-red-500 shrink-0" />;
    return <Activity className="w-3.5 h-3.5 text-slate-600 shrink-0" />;
  };

  const formatTimestamp = (iso: string) => {
    try {
      const d = new Date(iso);
      return {
        date: d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: '2-digit' }),
        time: d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      };
    } catch {
      return { date: iso, time: '' };
    }
  };

  const copyRawPayload = (payload: any) => {
    navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
    setCopiedRaw(true);
    setTimeout(() => setCopiedRaw(false), 2000);
  };

  return (
    <div className="space-y-6 pb-20 md:pb-10 font-sans w-full max-w-full">
      {/* Header Banner - Gradual layout & responsive typography */}
      <div className="rounded-3xl bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 p-5 sm:p-7 md:p-8 text-white shadow-xl border border-slate-800">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-500/20 text-indigo-300 text-xs font-semibold border border-indigo-500/30">
              <ShieldCheck className="w-4 h-4 text-indigo-400" />
              <span>Administrative Traceability &amp; Change Governance</span>
            </div>
            <h1 className="text-xl sm:text-2xl lg:text-3xl font-extrabold tracking-tight">
              System Audit Logs &amp; Real Change Compare
            </h1>
            <p className="text-xs sm:text-sm text-slate-300 max-w-2xl leading-relaxed">
              Every system event is registered with a unique action code. Real field modifications are precisely tracked with side-by-side Before and After comparisons.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 sm:self-start lg:self-center">
            <button
              onClick={() => exportAuditLogsToCsv(filteredLogs)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold border border-white/20 transition cursor-pointer"
              title="Download filtered logs as CSV with Before/After Diff Breakdown"
            >
              <Download className="w-4 h-4" />
              <span>Export CSV</span>
            </button>
            <button
              onClick={loadLogs}
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh Ledger</span>
            </button>
          </div>
        </div>

        {/* Gradual Responsive KPI Cards Grid */}
        <div className="mt-6 grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 text-slate-200">
          <div className="bg-slate-800/70 p-3.5 sm:p-4 rounded-2xl border border-slate-700/70 flex flex-col justify-between">
            <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
              Total Recorded Events
            </span>
            <span className="text-xl sm:text-2xl font-extrabold text-white mt-1">{stats.total}</span>
          </div>

          <div
            onClick={() => setOnlyRealChanges(!onlyRealChanges)}
            className={`p-3.5 sm:p-4 rounded-2xl border transition cursor-pointer flex flex-col justify-between ${
              onlyRealChanges
                ? 'bg-indigo-600/30 border-indigo-400 ring-2 ring-indigo-400/50'
                : 'bg-slate-800/70 border-slate-700/70 hover:border-slate-600'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-indigo-300 block">
                Modified Records (Real Changes)
              </span>
              <GitCompare className="w-3.5 h-3.5 text-indigo-400" />
            </div>
            <div className="flex items-baseline justify-between mt-1">
              <span className="text-xl sm:text-2xl font-extrabold text-indigo-300">{stats.realChanges}</span>
              <span className="text-[10px] font-semibold text-indigo-200/80 underline">
                {onlyRealChanges ? 'Filtering active' : 'Click to filter'}
              </span>
            </div>
          </div>

          <div className="bg-slate-800/70 p-3.5 sm:p-4 rounded-2xl border border-slate-700/70 flex flex-col justify-between">
            <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
              Claim Processing Events
            </span>
            <span className="text-xl sm:text-2xl font-extrabold text-blue-300 mt-1">{stats.claimEvents}</span>
          </div>

          <div className="bg-slate-800/70 p-3.5 sm:p-4 rounded-2xl border border-slate-700/70 flex flex-col justify-between">
            <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
              Security &amp; User Accounts
            </span>
            <span className="text-xl sm:text-2xl font-extrabold text-amber-300 mt-1">{stats.userSecurityEvents}</span>
          </div>
        </div>
      </div>

      {/* Filter and Control Bar - Perfectly auto-adjusting for desktop & mobile */}
      <div className="rounded-2xl bg-white p-3.5 sm:p-4 shadow-xs border border-slate-200 flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 text-xs">
        {/* Search Input */}
        <div className="relative flex-1 min-w-[240px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search by User Name, PF No (e.g. PF123456), Branch, Action, or Modified Values..."
            className="w-full rounded-xl border border-slate-200 bg-slate-50/60 py-2 pl-9 pr-8 text-xs text-slate-800 placeholder:text-slate-400 focus:bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Filter Controls Row */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Quick Real Changes Toggle Button */}
          <button
            onClick={() => setOnlyRealChanges(!onlyRealChanges)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer border ${
              onlyRealChanges
                ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'
            }`}
            title="Toggle to view only audit records where real changes occurred"
          >
            <GitCompare className="w-3.5 h-3.5" />
            <span>Real Changes Only</span>
            <span
              className={`ml-0.5 px-1.5 py-0.2 rounded-full text-[10px] font-extrabold ${
                onlyRealChanges ? 'bg-white text-indigo-700' : 'bg-slate-200 text-slate-800'
              }`}
            >
              {stats.realChanges}
            </span>
          </button>

          {/* Category Dropdown */}
          <div className="flex items-center gap-1.5">
            <Filter className="w-3.5 h-3.5 text-slate-400 hidden sm:block" />
            <select
              value={selectedActionCategory}
              onChange={e => setSelectedActionCategory(e.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-800 font-semibold focus:ring-1 focus:ring-indigo-500"
            >
              <option value="ALL">All Categories</option>
              <option value="CLAIMS">Claims (Create, Edit, Delete, Export)</option>
              <option value="USERS">Users (Create, Update, Delete, Login)</option>
              <option value="PASSWORDS">Passwords (Reset, Change, Auth)</option>
              <option value="ROLES">Staff Roles &amp; OT Rates</option>
              <option value="BRANCHES">Branch Network</option>
              <option value="DEPARTMENTS">Departments</option>
              <option value="TEMPLATES">A4 Form Templates</option>
              <option value="CALENDAR">Calendar &amp; Holidays</option>
              <option value="SYSTEM">System Settings &amp; Backups</option>
            </select>
          </div>

          {/* Branch Dropdown */}
          {availableBranches.length > 0 && (
            <select
              value={selectedBranch}
              onChange={e => setSelectedBranch(e.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-800 font-semibold focus:ring-1 focus:ring-indigo-500"
            >
              <option value="ALL">All Branches</option>
              {availableBranches.map(b => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          )}

          {/* Clear all active filters if applied */}
          {(searchQuery || selectedActionCategory !== 'ALL' || selectedBranch !== 'ALL' || onlyRealChanges) && (
            <button
              onClick={() => {
                setSearchQuery('');
                setSelectedActionCategory('ALL');
                setSelectedBranch('ALL');
                setOnlyRealChanges(false);
              }}
              className="text-slate-500 hover:text-slate-800 text-[11px] font-semibold px-2 py-1 underline"
            >
              Reset
            </button>
          )}
        </div>
      </div>

      {/* Main Ledger Display */}
      {loading ? (
        <div className="rounded-2xl bg-white p-12 text-center shadow-xs border border-slate-200">
          <RefreshCw className="w-8 h-8 text-indigo-600 animate-spin mx-auto mb-3" />
          <p className="text-xs font-semibold text-slate-600">Retrieving system audit logs...</p>
        </div>
      ) : filteredLogs.length === 0 ? (
        <div className="rounded-2xl bg-white p-12 text-center shadow-xs border border-slate-200">
          <AlertCircle className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <h3 className="text-sm font-bold text-slate-800">No matching audit records</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
            {onlyRealChanges
              ? 'No records with genuine field modifications match your criteria.'
              : searchQuery
              ? 'No audit log entries match your current search criteria. Try a different query or reset filters.'
              : 'Audit log entries will appear here as users create accounts, edit claims, and update system configurations.'}
          </p>
          {(searchQuery || selectedActionCategory !== 'ALL' || selectedBranch !== 'ALL' || onlyRealChanges) && (
            <button
              onClick={() => {
                setSearchQuery('');
                setSelectedActionCategory('ALL');
                setSelectedBranch('ALL');
                setOnlyRealChanges(false);
              }}
              className="mt-4 px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold transition"
            >
              Clear Filters
            </button>
          )}
        </div>
      ) : (
        <div className="rounded-2xl bg-white shadow-xs border border-slate-200 overflow-hidden">
          {/* ========================================================================= */}
          {/* DESKTOP TABLE VIEW (>= md screens) - Structured, Gradual, Proportional   */}
          {/* ========================================================================= */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs table-fixed">
              <thead>
                <tr className="bg-slate-50 text-slate-600 text-[11px] font-bold uppercase tracking-wider border-b border-slate-200 select-none">
                  <th className="py-3 px-3.5 w-32">Timestamp</th>
                  <th className="py-3 px-3.5 w-44">Action</th>
                  <th className="py-3 px-3.5 w-48">Performed By</th>
                  <th className="py-3 px-3.5 w-60">Target Entity</th>
                  <th className="py-3 px-3.5 w-64">Real Changes (Diff)</th>
                  <th className="py-3 px-3.5 w-24 text-center">Inspect</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredLogs.map(log => {
                  const { date, time } = formatTimestamp(log.timestamp);
                  const diffs = logDiffMap.get(log.id) || [];
                  const hasRealChanges = diffs.length > 0;

                  return (
                    <tr
                      key={log.id}
                      className="hover:bg-slate-50/80 transition-colors group"
                    >
                      {/* 1. Timestamp */}
                      <td className="py-3 px-3.5 align-middle">
                        <div className="font-semibold text-slate-900 text-[11px]">{date}</div>
                        <div className="font-mono text-[10px] text-slate-400 mt-0.5">{time}</div>
                      </td>

                      {/* 2. Unique Action Badge */}
                      <td className="py-3 px-3.5 align-middle">
                        <div className="flex flex-col items-start gap-1">
                          <span
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold border max-w-full truncate ${getActionBadgeColor(
                              log.action
                            )}`}
                            title={log.action}
                          >
                            {getActionIcon(log.action)}
                            <span className="truncate">{log.actionLabel || log.action}</span>
                          </span>
                          <span className="font-mono text-[9px] text-slate-400 pl-0.5 tracking-wider truncate max-w-full">
                            {log.action}
                          </span>
                        </div>
                      </td>

                      {/* 3. Actor Details (Name, PF Number, Branch) */}
                      <td className="py-3 px-3.5 align-middle">
                        <div className="flex flex-col">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-bold text-slate-900 truncate max-w-[120px]">
                              {log.userName}
                            </span>
                            <span className="font-mono text-[10px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-1 py-0.2 rounded shrink-0">
                              {log.userPfNumber}
                            </span>
                          </div>
                          <div className="flex items-center gap-1 text-[11px] text-slate-500 mt-0.5 truncate">
                            <Building2 className="w-3 h-3 text-slate-400 shrink-0" />
                            <span className="truncate">{log.userBranch}</span>
                            {log.userDepartment && (
                              <span className="text-slate-400 truncate">&bull; {log.userDepartment}</span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* 4. Target Entity (Clean description + Target ID) */}
                      <td className="py-3 px-3.5 align-middle">
                        <div
                          className="font-medium text-slate-800 line-clamp-2 leading-relaxed"
                          title={log.targetDescription}
                        >
                          {log.targetDescription}
                        </div>
                        {log.targetId && (
                          <div className="font-mono text-[10px] text-slate-400 mt-0.5 truncate">
                            ID: {log.targetId}
                          </div>
                        )}
                      </td>

                      {/* 5. Real Changes Column - Strictly Real Changes Only */}
                      <td className="py-3 px-3.5 align-middle">
                        {hasRealChanges ? (
                          <div className="space-y-1">
                            <div className="flex items-center gap-1.5">
                              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-700">
                                <GitCompare className="w-3 h-3 text-indigo-600 shrink-0" />
                                <span>
                                  {diffs.length} modified field{diffs.length === 1 ? '' : 's'}
                                </span>
                              </span>
                            </div>

                            {/* Concise 1-line Before -> After Preview */}
                            <div className="flex items-center gap-1 text-[10px] truncate max-w-full">
                              <span className="font-semibold text-slate-700 truncate max-w-[70px]">
                                {diffs[0].label}:
                              </span>
                              <span className="px-1 py-0.2 rounded bg-rose-50 text-rose-700 font-mono line-through truncate max-w-[75px] border border-rose-100">
                                {diffs[0].formattedBefore}
                              </span>
                              <ArrowRight className="w-2.5 h-2.5 text-slate-400 shrink-0" />
                              <span className="px-1 py-0.2 rounded bg-emerald-50 text-emerald-800 font-mono font-bold truncate max-w-[75px] border border-emerald-100">
                                {diffs[0].formattedAfter}
                              </span>
                            </div>

                            {diffs.length > 1 && (
                              <span className="text-[10px] text-slate-400 block italic">
                                +{diffs.length - 1} more fields modified
                              </span>
                            )}
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 text-slate-400 text-[11px]">
                            <span className="text-slate-300 select-none">&mdash;</span>
                            <span className="text-[11px] text-slate-400 font-normal">No field changes</span>
                          </div>
                        )}
                      </td>

                      {/* 6. Inspect Action Button */}
                      <td className="py-3 px-3.5 text-center align-middle">
                        <button
                          onClick={() => {
                            setSelectedLogForDetails(log);
                            setActiveModalTab('diff');
                          }}
                          className={`inline-flex items-center justify-center gap-1 px-3 py-1.5 rounded-xl text-[11px] font-bold transition cursor-pointer ${
                            hasRealChanges
                              ? 'bg-indigo-50 hover:bg-indigo-600 hover:text-white text-indigo-700 border border-indigo-200'
                              : 'bg-slate-100 hover:bg-slate-200 text-slate-600 border border-slate-200'
                          }`}
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>{hasRealChanges ? 'Compare' : 'Inspect'}</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* ========================================================================= */}
          {/* MOBILE CARD VIEW (< md screens) - Fully Responsive Auto-Adjusting        */}
          {/* ========================================================================= */}
          <div className="block md:hidden divide-y divide-slate-100">
            {filteredLogs.map(log => {
              const { date, time } = formatTimestamp(log.timestamp);
              const diffs = logDiffMap.get(log.id) || [];
              const hasRealChanges = diffs.length > 0;
              const isExpanded = expandedMobileLogId === log.id;

              return (
                <div key={log.id} className="p-4 space-y-2.5 hover:bg-slate-50/50 transition">
                  {/* Top Bar: Action Badge + Timestamp */}
                  <div className="flex items-start justify-between gap-2">
                    <span
                      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${getActionBadgeColor(
                        log.action
                      )}`}
                    >
                      {getActionIcon(log.action)}
                      <span>{log.actionLabel || log.action}</span>
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono shrink-0">
                      {date} {time}
                    </span>
                  </div>

                  {/* Target Description */}
                  <div>
                    <p className="text-xs font-bold text-slate-800 leading-snug">
                      {log.targetDescription}
                    </p>
                    {log.targetId && (
                      <span className="text-[10px] font-mono text-slate-400 block mt-0.5">
                        ID: {log.targetId}
                      </span>
                    )}
                  </div>

                  {/* Real Changes Section - ONLY shown if real changes exist */}
                  {hasRealChanges && (
                    <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-700 flex items-center gap-1">
                          <GitCompare className="w-3 h-3 text-indigo-600" />
                          <span>
                            {diffs.length} Modified Field{diffs.length === 1 ? '' : 's'}
                          </span>
                        </span>
                        <button
                          onClick={() => setExpandedMobileLogId(isExpanded ? null : log.id)}
                          className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-0.5"
                        >
                          <span>{isExpanded ? 'Hide' : 'Quick View'}</span>
                          {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                        </button>
                      </div>

                      {/* Collapsed top change preview */}
                      {!isExpanded && (
                        <div className="flex items-center gap-1.5 text-[11px] truncate">
                          <span className="font-semibold text-slate-700">{diffs[0].label}:</span>
                          <span className="text-rose-700 bg-rose-50 px-1 py-0.2 rounded font-mono text-[10px] line-through truncate max-w-[100px]">
                            {diffs[0].formattedBefore}
                          </span>
                          <ArrowRight className="w-2.5 h-2.5 text-slate-400 shrink-0" />
                          <span className="text-emerald-700 bg-emerald-50 px-1 py-0.2 rounded font-mono font-bold text-[10px] truncate max-w-[100px]">
                            {diffs[0].formattedAfter}
                          </span>
                        </div>
                      )}

                      {/* Expanded In-Place Diff View */}
                      {isExpanded && (
                        <div className="mt-2 space-y-2 border-t border-slate-200 pt-2">
                          {diffs.map((d, i) => (
                            <div key={i} className="p-2 rounded-lg bg-white border border-slate-200 space-y-1">
                              <span className="text-[10px] font-bold text-slate-700 block">{d.label}</span>
                              <div className="flex items-center gap-1.5 text-[11px]">
                                <span className="p-1 rounded bg-rose-50 text-rose-800 font-mono text-[10px] line-through flex-1 text-center truncate">
                                  {d.formattedBefore}
                                </span>
                                <ArrowRight className="w-3 h-3 text-slate-400 shrink-0" />
                                <span className="p-1 rounded bg-emerald-50 text-emerald-800 font-mono font-bold text-[10px] flex-1 text-center truncate">
                                  {d.formattedAfter}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Actor Details Footer */}
                  <div className="flex items-center justify-between pt-1 border-t border-slate-50 text-[11px] text-slate-500">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-semibold text-slate-700">{log.userName}</span>
                      <span className="font-mono text-indigo-600 font-bold bg-indigo-50 px-1.5 py-0.2 rounded text-[10px]">
                        {log.userPfNumber}
                      </span>
                      <span>&bull;</span>
                      <span>{log.userBranch}</span>
                    </div>

                    <button
                      onClick={() => {
                        setSelectedLogForDetails(log);
                        setActiveModalTab('diff');
                      }}
                      className="inline-flex items-center gap-1 text-indigo-600 font-bold text-[11px] hover:underline"
                    >
                      <Eye className="w-3 h-3" />
                      <span>Compare</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* BEFORE VS AFTER CHANGE COMPARE MODAL - Auto-Adjusting & Gradual Matrix    */}
      {/* ========================================================================= */}
      {selectedLogForDetails && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-900/60 backdrop-blur-xs animate-fade-in">
          <div className="w-full max-w-4xl bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden flex flex-col max-h-[92vh]">
            {/* Modal Header */}
            <div className="px-5 sm:px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <ShieldCheck className="w-5 h-5 text-indigo-400 shrink-0" />
                <div>
                  <h3 className="font-bold text-sm sm:text-base">System Action &amp; Change Diff</h3>
                  <p className="text-[11px] text-slate-300">
                    Log Record ID: <span className="font-mono text-indigo-300">{selectedLogForDetails.id}</span>
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedLogForDetails(null)}
                className="text-slate-400 hover:text-white p-1.5 rounded-xl hover:bg-slate-800 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Subnav Tabs */}
            <div className="flex items-center gap-2 px-6 pt-3 border-b border-slate-200 bg-slate-50 text-xs">
              <button
                onClick={() => setActiveModalTab('diff')}
                className={`pb-2.5 px-3 font-bold border-b-2 flex items-center gap-1.5 transition cursor-pointer ${
                  activeModalTab === 'diff'
                    ? 'border-indigo-600 text-indigo-600'
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                <GitCompare className="w-3.5 h-3.5" />
                <span>Before &amp; After Compare</span>
              </button>
              <button
                onClick={() => setActiveModalTab('raw')}
                className={`pb-2.5 px-3 font-bold border-b-2 flex items-center gap-1.5 transition cursor-pointer ${
                  activeModalTab === 'raw'
                    ? 'border-indigo-600 text-indigo-600'
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Raw Audit Document</span>
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 sm:p-6 space-y-4 overflow-y-auto text-xs">
              {/* Event Metadata Strip */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3.5 rounded-2xl bg-slate-50 border border-slate-200">
                <div>
                  <span className="text-[10px] font-bold uppercase text-slate-400 block">Action</span>
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold border mt-0.5 truncate max-w-full ${getActionBadgeColor(
                      selectedLogForDetails.action
                    )}`}
                  >
                    {selectedLogForDetails.actionLabel || selectedLogForDetails.action}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase text-slate-400 block">Timestamp</span>
                  <span className="font-mono text-slate-700 text-[11px] block mt-0.5">
                    {new Date(selectedLogForDetails.timestamp).toLocaleString('en-US')}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase text-slate-400 block">Actor</span>
                  <span className="font-semibold text-slate-900 block mt-0.5">
                    {selectedLogForDetails.userName} ({selectedLogForDetails.userPfNumber})
                  </span>
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase text-slate-400 block">Branch / Unit</span>
                  <span className="text-slate-700 block mt-0.5 truncate">
                    {selectedLogForDetails.userBranch}
                    {selectedLogForDetails.userDepartment ? ` &bull; ${selectedLogForDetails.userDepartment}` : ''}
                  </span>
                </div>
              </div>

              {/* Target Entity Card */}
              <div>
                <span className="text-[11px] font-bold text-slate-700 block mb-1">Target Entity:</span>
                <div className="p-3 rounded-xl bg-indigo-50/60 border border-indigo-100 text-slate-900 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <span className="font-semibold">{selectedLogForDetails.targetDescription}</span>
                  {selectedLogForDetails.targetId && (
                    <span className="font-mono text-[10px] text-indigo-700 bg-white border border-indigo-200 px-2 py-0.5 rounded-lg shrink-0">
                      ID: {selectedLogForDetails.targetId}
                    </span>
                  )}
                </div>
              </div>

              {/* TAB 1: Visual Before vs After Compare Table */}
              {activeModalTab === 'diff' && (
                <div>
                  {(() => {
                    const diffs = extractDiffFromLog(selectedLogForDetails);

                    if (diffs.length === 0) {
                      return (
                        <div className="p-8 text-center rounded-2xl bg-slate-50 border border-slate-200 text-slate-500">
                          <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
                          <h4 className="text-xs font-bold text-slate-800">
                            No Field Modifications (Atomic System Event)
                          </h4>
                          <p className="text-[11px] text-slate-500 mt-1 max-w-md mx-auto">
                            This action ({selectedLogForDetails.actionLabel || selectedLogForDetails.action}) executed as an event record without modifying fields in an existing entity.
                          </p>
                        </div>
                      );
                    }

                    return (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-xs font-bold text-slate-800">
                          <span className="flex items-center gap-1.5">
                            <GitCompare className="w-4 h-4 text-indigo-600" />
                            <span>
                              {diffs.length} Modified Field{diffs.length === 1 ? '' : 's'} (Before vs After)
                            </span>
                          </span>
                          <span className="text-[10px] font-normal text-slate-400">
                            Red: Previous Value &bull; Green: New Value
                          </span>
                        </div>

                        {/* Responsive Matrix: Side-by-side on desktop, cards on mobile */}
                        <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
                          {/* Desktop Compare Table */}
                          <div className="hidden sm:block overflow-x-auto">
                            <table className="w-full text-left border-collapse text-xs table-fixed">
                              <thead>
                                <tr className="bg-slate-100/90 text-slate-700 text-[10px] font-bold uppercase tracking-wider border-b border-slate-200">
                                  <th className="py-2.5 px-3 w-44">Attribute</th>
                                  <th className="py-2.5 px-3">Before Changes (Previous)</th>
                                  <th className="py-2.5 px-1 w-6 text-center"></th>
                                  <th className="py-2.5 px-3">After Changes (New)</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                {diffs.map((d, index) => (
                                  <tr key={index} className="hover:bg-slate-50/50">
                                    {/* Attribute Label */}
                                    <td className="py-3 px-3 font-semibold text-slate-800 align-top">
                                      <div className="font-bold text-slate-900">{d.label}</div>
                                      <div className="text-[10px] font-mono text-slate-400">{d.field}</div>
                                    </td>

                                    {/* Before State */}
                                    <td className="py-3 px-3 align-top">
                                      <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 font-mono text-[11px] flex items-start gap-1.5">
                                        <MinusCircle className="w-3.5 h-3.5 text-rose-500 shrink-0 mt-0.5" />
                                        <span className="break-all leading-relaxed">
                                          {d.formattedBefore || '(None / Not Set)'}
                                        </span>
                                      </div>
                                    </td>

                                    {/* Direction Arrow */}
                                    <td className="py-3 px-1 text-center align-middle">
                                      <ArrowRight className="w-4 h-4 text-slate-400 mx-auto" />
                                    </td>

                                    {/* After State */}
                                    <td className="py-3 px-3 align-top">
                                      <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-950 font-mono font-bold text-[11px] flex items-start gap-1.5">
                                        <PlusCircle className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                                        <span className="break-all leading-relaxed">
                                          {d.formattedAfter || '(Deleted)'}
                                        </span>
                                      </div>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>

                          {/* Mobile Compare Cards */}
                          <div className="block sm:hidden divide-y divide-slate-100 p-3 space-y-3">
                            {diffs.map((d, index) => (
                              <div key={index} className="space-y-1.5 pt-2 first:pt-0">
                                <div className="font-bold text-slate-800 text-[11px] flex items-center justify-between">
                                  <span>{d.label}</span>
                                  <span className="font-mono text-[9px] text-slate-400">{d.field}</span>
                                </div>
                                <div className="space-y-1">
                                  <div className="p-2 rounded-lg bg-rose-50 border border-rose-200 text-rose-900 font-mono text-[10px] flex items-center gap-1.5">
                                    <MinusCircle className="w-3 h-3 text-rose-500 shrink-0" />
                                    <span className="truncate">
                                      {d.formattedBefore || '(None / Not Set)'}
                                    </span>
                                  </div>
                                  <div className="p-2 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-950 font-mono font-bold text-[10px] flex items-center gap-1.5">
                                    <PlusCircle className="w-3 h-3 text-emerald-600 shrink-0" />
                                    <span className="truncate">
                                      {d.formattedAfter || '(Deleted)'}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* TAB 2: Raw Audit Payload */}
              {activeModalTab === 'raw' && (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[11px] font-bold text-slate-700">Audit Document Payload (JSON):</span>
                    <button
                      onClick={() =>
                        copyRawPayload({
                          id: selectedLogForDetails.id,
                          action: selectedLogForDetails.action,
                          actionLabel: selectedLogForDetails.actionLabel,
                          timestamp: selectedLogForDetails.timestamp,
                          actor: {
                            name: selectedLogForDetails.userName,
                            pfNumber: selectedLogForDetails.userPfNumber,
                            branch: selectedLogForDetails.userBranch,
                            department: selectedLogForDetails.userDepartment,
                            role: selectedLogForDetails.userRole,
                          },
                          target: {
                            type: selectedLogForDetails.targetType,
                            id: selectedLogForDetails.targetId,
                            description: selectedLogForDetails.targetDescription,
                          },
                          diff: selectedLogForDetails.diff,
                          beforeState: selectedLogForDetails.beforeState,
                          afterState: selectedLogForDetails.afterState,
                          details: selectedLogForDetails.details,
                        })
                      }
                      className="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-600 hover:text-indigo-800 cursor-pointer"
                    >
                      {copiedRaw ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                          <span className="text-emerald-600">Copied!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copy JSON</span>
                        </>
                      )}
                    </button>
                  </div>
                  <pre className="p-4 rounded-2xl bg-slate-900 text-emerald-400 font-mono text-[11px] overflow-x-auto max-h-72 border border-slate-800 leading-relaxed">
                    {JSON.stringify(
                      {
                        id: selectedLogForDetails.id,
                        action: selectedLogForDetails.action,
                        actionLabel: selectedLogForDetails.actionLabel,
                        timestamp: selectedLogForDetails.timestamp,
                        actor: {
                          name: selectedLogForDetails.userName,
                          pfNumber: selectedLogForDetails.userPfNumber,
                          branch: selectedLogForDetails.userBranch,
                          department: selectedLogForDetails.userDepartment,
                          role: selectedLogForDetails.userRole,
                        },
                        target: {
                          type: selectedLogForDetails.targetType,
                          id: selectedLogForDetails.targetId,
                          description: selectedLogForDetails.targetDescription,
                        },
                        diff: selectedLogForDetails.diff,
                        beforeState: selectedLogForDetails.beforeState,
                        afterState: selectedLogForDetails.afterState,
                        details: selectedLogForDetails.details,
                      },
                      null,
                      2
                    )}
                  </pre>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-5 sm:px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
              <span className="text-[11px] text-slate-400">
                Action Code: <strong className="text-slate-700 font-mono">{selectedLogForDetails.action}</strong>
              </span>
              <button
                onClick={() => setSelectedLogForDetails(null)}
                className="px-4 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold text-xs transition cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
