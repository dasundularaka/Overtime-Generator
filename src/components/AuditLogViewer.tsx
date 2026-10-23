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
} from 'lucide-react';
import { AuditLogEntry, AuditActionType, AuditFieldDiff } from '../types';
import { fetchAuditLogs, exportAuditLogsToCsv, extractDiffFromLog } from '../utils/auditLogger';

export const AuditLogViewer: React.FC = () => {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedActionCategory, setSelectedActionCategory] = useState<string>('ALL');
  const [selectedBranch, setSelectedBranch] = useState<string>('ALL');
  const [selectedLogForDetails, setSelectedLogForDetails] = useState<AuditLogEntry | null>(null);
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const [activeModalTab, setActiveModalTab] = useState<'diff' | 'raw'>('diff');

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

  // Distinct branches for filtering
  const availableBranches = useMemo(() => {
    const set = new Set<string>();
    logs.forEach(l => {
      if (l.userBranch) set.add(l.userBranch);
    });
    return Array.from(set).sort();
  }, [logs]);

  // Filtered logs
  const filteredLogs = useMemo(() => {
    return logs.filter(log => {
      // 1. Search Query
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const matchesName = (log.userName || '').toLowerCase().includes(query);
        const matchesPf = (log.userPfNumber || '').toLowerCase().includes(query);
        const matchesBranch = (log.userBranch || '').toLowerCase().includes(query);
        const matchesDesc = (log.targetDescription || '').toLowerCase().includes(query);
        const matchesLabel = (log.actionLabel || '').toLowerCase().includes(query);
        const matchesTargetId = (log.targetId || '').toLowerCase().includes(query);
        const matchesAction = (log.action || '').toLowerCase().includes(query);

        // Also check if any diff field or values match the search
        const diffs = extractDiffFromLog(log);
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

      // 2. Action Category Filter
      if (selectedActionCategory !== 'ALL') {
        const act = log.action;
        if (selectedActionCategory === 'USERS' && !act.startsWith('USER_') && !act.startsWith('EMPLOYEE_')) return false;
        if (
          selectedActionCategory === 'PASSWORDS' &&
          !act.includes('PASSWORD')
        )
          return false;
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

      // 3. Branch Filter
      if (selectedBranch !== 'ALL' && log.userBranch !== selectedBranch) {
        return false;
      }

      return true;
    });
  }, [logs, searchQuery, selectedActionCategory, selectedBranch]);

  // Statistics
  const stats = useMemo(() => {
    return {
      total: logs.length,
      claimEvents: logs.filter(l => l.action.startsWith('CLAIM_')).length,
      userEvents: logs.filter(l => l.action.startsWith('USER_') || l.action.startsWith('EMPLOYEE_')).length,
      passwordEvents: logs.filter(l => l.action.includes('PASSWORD')).length,
      systemEvents: logs.filter(
        l =>
          l.action.startsWith('BRANCH_') ||
          l.action.startsWith('ROLE_') ||
          l.action.startsWith('TEMPLATE_') ||
          l.action.startsWith('HOLIDAY_') ||
          l.action.startsWith('SETTINGS_') ||
          l.action.startsWith('DATA_')
      ).length,
    };
  }, [logs]);

  const getActionBadgeColor = (action: AuditActionType) => {
    if (action.includes('CREATE') || action.includes('ADD') || action.includes('IMPORT') || action.includes('RESTORE')) {
      return 'bg-emerald-50 text-emerald-800 border-emerald-300';
    }
    if (action.includes('DELETE') || action.includes('RESET') && action.includes('FACTORY')) {
      return 'bg-rose-50 text-rose-800 border-rose-300';
    }
    if (action.includes('PASSWORD')) {
      return 'bg-amber-50 text-amber-900 border-amber-300';
    }
    if (action.includes('UPDATE') || action.includes('EDIT') || action.includes('TOGGLE')) {
      return 'bg-blue-50 text-blue-800 border-blue-300';
    }
    if (action.includes('LOGIN') || action.includes('LOGOUT')) {
      return 'bg-slate-100 text-slate-800 border-slate-300';
    }
    if (action.includes('EXPORT') || action.includes('DOWNLOAD') || action.includes('PDF')) {
      return 'bg-indigo-50 text-indigo-800 border-indigo-300';
    }
    if (action.includes('GOOGLE') || action.includes('EMAIL')) {
      return 'bg-sky-50 text-sky-800 border-sky-300';
    }
    return 'bg-purple-50 text-purple-800 border-purple-300';
  };

  const getActionIcon = (action: AuditActionType) => {
    if (action.startsWith('USER_CREATE') || action.startsWith('EMPLOYEE_CREATE')) return <UserPlus className="w-3.5 h-3.5 text-emerald-600" />;
    if (action.includes('DELETE')) return <Trash2 className="w-3.5 h-3.5 text-rose-600" />;
    if (action.includes('PASSWORD')) return <KeyRound className="w-3.5 h-3.5 text-amber-600" />;
    if (action.startsWith('CLAIM_EXPORT')) return <Download className="w-3.5 h-3.5 text-indigo-600" />;
    if (action.startsWith('CLAIM_')) return <FileText className="w-3.5 h-3.5 text-blue-600" />;
    if (action.startsWith('BRANCH_')) return <Building2 className="w-3.5 h-3.5 text-purple-600" />;
    if (action.startsWith('ROLE_')) return <Layers className="w-3.5 h-3.5 text-indigo-600" />;
    if (action.startsWith('HOLIDAY_')) return <Calendar className="w-3.5 h-3.5 text-orange-600" />;
    if (action.startsWith('TEMPLATE_')) return <Sliders className="w-3.5 h-3.5 text-teal-600" />;
    if (action.includes('UPDATE')) return <Edit2 className="w-3.5 h-3.5 text-blue-600" />;
    if (action.includes('BACKUP') || action.includes('RESTORE')) return <Database className="w-3.5 h-3.5 text-indigo-600" />;
    if (action.includes('GOOGLE')) return <Globe className="w-3.5 h-3.5 text-sky-600" />;
    if (action.includes('EMAIL')) return <Mail className="w-3.5 h-3.5 text-red-500" />;
    return <Activity className="w-3.5 h-3.5 text-slate-600" />;
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

  return (
    <div className="space-y-6 pb-20 md:pb-10 font-sans">
      {/* Header Banner */}
      <div className="rounded-3xl bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 p-6 sm:p-8 text-white shadow-xl border border-slate-800">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-500/20 text-indigo-300 text-xs font-semibold mb-2.5 border border-indigo-500/30">
              <ShieldCheck className="w-4 h-4 text-indigo-400" />
              <span>Administrative Traceability &amp; Change Governance</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              System Audit Logs &amp; Change Compare
            </h1>
            <p className="mt-1.5 text-xs sm:text-sm text-slate-300 max-w-2xl leading-relaxed">
              Every system event is registered with a unique, distinct action name and complete Before vs. After state comparisons for absolute audit compliance.
            </p>
          </div>

          <div className="flex items-center gap-2.5 self-start md:self-center">
            <button
              onClick={() => exportAuditLogsToCsv(filteredLogs)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold border border-white/20 transition cursor-pointer"
              title="Download filtered logs as CSV with Before/After Diff Breakdown"
            >
              <Download className="w-4 h-4" />
              <span>Export CSV (With Diff)</span>
            </button>
            <button
              onClick={loadLogs}
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {/* Quick KPI Cards */}
        <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-3 text-slate-200">
          <div className="bg-slate-800/60 p-3.5 rounded-2xl border border-slate-700/60">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Total Activities</span>
            <span className="text-xl font-extrabold text-white">{stats.total}</span>
          </div>
          <div className="bg-slate-800/60 p-3.5 rounded-2xl border border-slate-700/60">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Claim Events</span>
            <span className="text-xl font-extrabold text-indigo-300">{stats.claimEvents}</span>
          </div>
          <div className="bg-slate-800/60 p-3.5 rounded-2xl border border-slate-700/60">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">User Account Edits</span>
            <span className="text-xl font-extrabold text-emerald-300">{stats.userEvents}</span>
          </div>
          <div className="bg-slate-800/60 p-3.5 rounded-2xl border border-slate-700/60">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Password &amp; Security</span>
            <span className="text-xl font-extrabold text-amber-300">{stats.passwordEvents}</span>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="rounded-2xl bg-white p-4 shadow-xs border border-slate-200 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 text-xs">
        {/* Search Input */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search by User Name, PF No (e.g. PF123456), Branch, Action, or Changed Values..."
            className="w-full rounded-xl border border-slate-200 bg-slate-50/50 py-2 pl-9 pr-8 text-xs text-slate-800 focus:bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
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

        {/* Category & Branch Filters */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={selectedActionCategory}
              onChange={e => setSelectedActionCategory(e.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-800 font-semibold focus:ring-1 focus:ring-indigo-500"
            >
              <option value="ALL">All Categories</option>
              <option value="CLAIMS">Claims (Create, Update, Delete, Export)</option>
              <option value="USERS">Users (Create, Update, Delete, Login)</option>
              <option value="PASSWORDS">Passwords (Reset, Change, Recovery)</option>
              <option value="ROLES">Staff Roles &amp; OT Rates</option>
              <option value="BRANCHES">Branch Network</option>
              <option value="DEPARTMENTS">Departments</option>
              <option value="TEMPLATES">A4 Form Templates</option>
              <option value="CALENDAR">Calendar &amp; Holidays</option>
              <option value="SYSTEM">System Settings &amp; Backups</option>
            </select>
          </div>

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
        </div>
      </div>

      {/* Main Logs Display */}
      {loading ? (
        <div className="rounded-2xl bg-white p-12 text-center shadow-xs border border-slate-200">
          <RefreshCw className="w-8 h-8 text-indigo-600 animate-spin mx-auto mb-3" />
          <p className="text-xs font-semibold text-slate-600">Retrieving system audit logs...</p>
        </div>
      ) : filteredLogs.length === 0 ? (
        <div className="rounded-2xl bg-white p-12 text-center shadow-xs border border-slate-200">
          <AlertCircle className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <h3 className="text-sm font-bold text-slate-800">No audit records found</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            {searchQuery
              ? 'No activity matches your current search criteria. Try a different query.'
              : 'Audit log entries will appear here as users create accounts, edit claims, and update system configurations.'}
          </p>
        </div>
      ) : (
        <div className="rounded-2xl bg-white shadow-xs border border-slate-200 overflow-hidden">
          {/* Mobile Card View (< md) */}
          <div className="block md:hidden divide-y divide-slate-100">
            {filteredLogs.map(log => {
              const { date, time } = formatTimestamp(log.timestamp);
              const diffs = extractDiffFromLog(log);
              const isExpanded = expandedLogId === log.id;

              return (
                <div key={log.id} className="p-4 space-y-2.5 hover:bg-slate-50/50 transition">
                  {/* Action and Time Header */}
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${getActionBadgeColor(
                        log.action
                      )}`}
                    >
                      {getActionIcon(log.action)}
                      <span>{log.actionLabel || log.action}</span>
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">
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

                  {/* Changes Summary Preview */}
                  {diffs.length > 0 && (
                    <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-700 flex items-center gap-1">
                          <GitCompare className="w-3 h-3 text-indigo-600" />
                          <span>{diffs.length} Field{diffs.length === 1 ? '' : 's'} Changed</span>
                        </span>
                        <button
                          onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                          className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-0.5"
                        >
                          <span>{isExpanded ? 'Collapse' : 'Compare'}</span>
                          {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                        </button>
                      </div>

                      {/* Top 2 changes pills preview */}
                      {!isExpanded && (
                        <div className="space-y-1">
                          {diffs.slice(0, 2).map((d, i) => (
                            <div key={i} className="flex items-center gap-1.5 text-[11px] truncate">
                              <span className="font-semibold text-slate-700">{d.label}:</span>
                              <span className="text-rose-700 bg-rose-50 px-1 py-0.2 rounded font-mono text-[10px] line-through truncate max-w-[100px]">
                                {d.formattedBefore}
                              </span>
                              <ArrowRight className="w-2.5 h-2.5 text-slate-400 shrink-0" />
                              <span className="text-emerald-700 bg-emerald-50 px-1 py-0.2 rounded font-mono font-bold text-[10px] truncate max-w-[100px]">
                                {d.formattedAfter}
                              </span>
                            </div>
                          ))}
                          {diffs.length > 2 && (
                            <span className="text-[10px] text-slate-400 italic block">
                              +{diffs.length - 2} more modified fields...
                            </span>
                          )}
                        </div>
                      )}

                      {/* Full in-place expanded diff */}
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

                  {/* Actor details footer */}
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
                      <span>Inspect</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Desktop Table View (>= md) */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-100/90 text-slate-700 text-[11px] font-bold uppercase tracking-wider border-b border-slate-200">
                  <th className="py-3 px-3.5 w-36">Timestamp</th>
                  <th className="py-3 px-3.5 w-52">Action Type &amp; Name</th>
                  <th className="py-3 px-3.5 w-56">Performed By (Actor)</th>
                  <th className="py-3 px-3.5">Target &amp; Before / After Changes</th>
                  <th className="py-3 px-3.5 w-28 text-center">Inspect</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredLogs.map(log => {
                  const { date, time } = formatTimestamp(log.timestamp);
                  const diffs = extractDiffFromLog(log);

                  return (
                    <tr key={log.id} className="hover:bg-slate-50/70 transition">
                      {/* Timestamp */}
                      <td className="py-3 px-3.5 font-mono text-[11px] text-slate-600 whitespace-nowrap align-top">
                        <div className="font-bold text-slate-800">{date}</div>
                        <div className="text-[10px] text-slate-400">{time}</div>
                      </td>

                      {/* Unique Action Pill */}
                      <td className="py-3 px-3.5 align-top">
                        <div className="flex flex-col gap-1">
                          <span
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold border ${getActionBadgeColor(
                              log.action
                            )}`}
                          >
                            {getActionIcon(log.action)}
                            <span>{log.actionLabel || log.action}</span>
                          </span>
                          <span className="font-mono text-[9px] text-slate-400 pl-1 uppercase tracking-wider">
                            {log.action}
                          </span>
                        </div>
                      </td>

                      {/* User Identifiers (Name, PF No, Branch) */}
                      <td className="py-3 px-3.5 align-top">
                        <div className="flex flex-col">
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-slate-900">{log.userName}</span>
                            <span className="font-mono text-[10px] font-extrabold text-indigo-700 bg-indigo-50 border border-indigo-200 px-1.5 py-0.2 rounded">
                              {log.userPfNumber}
                            </span>
                          </div>
                          <div className="flex items-center gap-1 text-[11px] text-slate-500 mt-0.5">
                            <Building2 className="w-3 h-3 text-slate-400 shrink-0" />
                            <span>{log.userBranch}</span>
                            {log.userDepartment && (
                              <span className="text-slate-400">&bull; {log.userDepartment}</span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Description & Before vs After Changes Compare */}
                      <td className="py-3 px-3.5 text-slate-800 font-medium align-top">
                        <div className="leading-relaxed font-semibold text-slate-900">{log.targetDescription}</div>
                        {log.targetId && (
                          <div className="text-[10px] font-mono text-slate-400 mt-0.5">
                            Target ID: {log.targetId}
                          </div>
                        )}

                        {/* Inline Before vs After Changes Pill View */}
                        {diffs.length > 0 && (
                          <div className="mt-2 p-2 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1.5 max-w-xl">
                            <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-indigo-700">
                              <span className="flex items-center gap-1">
                                <GitCompare className="w-3 h-3" />
                                <span>Changes ({diffs.length} Modified Field{diffs.length === 1 ? '' : 's'})</span>
                              </span>
                              <span className="text-slate-400 font-normal">Before &rarr; After</span>
                            </div>

                            <div className="grid grid-cols-1 gap-1">
                              {diffs.slice(0, 3).map((d, i) => (
                                <div
                                  key={i}
                                  className="flex items-center justify-between gap-2 p-1.5 rounded-lg bg-white border border-slate-200 text-[11px]"
                                >
                                  <span className="font-semibold text-slate-700 truncate max-w-[130px]">
                                    {d.label}
                                  </span>
                                  <div className="flex items-center gap-1.5 shrink-0">
                                    <span className="px-1.5 py-0.5 rounded bg-rose-50 text-rose-800 font-mono text-[10px] line-through truncate max-w-[120px] border border-rose-200">
                                      {d.formattedBefore}
                                    </span>
                                    <ArrowRight className="w-3 h-3 text-slate-400 shrink-0" />
                                    <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-800 font-mono font-bold text-[10px] truncate max-w-[120px] border border-emerald-200">
                                      {d.formattedAfter}
                                    </span>
                                  </div>
                                </div>
                              ))}
                              {diffs.length > 3 && (
                                <div className="text-[10px] text-slate-500 italic pl-1">
                                  +{diffs.length - 3} additional field changes (click Inspect to view all)
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </td>

                      {/* Inspect Details Button */}
                      <td className="py-3 px-3.5 text-center align-top">
                        <button
                          onClick={() => {
                            setSelectedLogForDetails(log);
                            setActiveModalTab('diff');
                          }}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-600 hover:text-white text-indigo-700 text-[11px] font-bold border border-indigo-200 transition cursor-pointer"
                        >
                          <GitCompare className="w-3.5 h-3.5" />
                          <span>Compare</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Details & Before/After Comparison Inspection Modal */}
      {selectedLogForDetails && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in">
          <div className="w-full max-w-2xl bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-indigo-400" />
                <div>
                  <h3 className="font-bold text-sm">System Action Traceability &amp; Change Diff</h3>
                  <p className="text-[11px] text-slate-300">
                    Log Record ID: <span className="font-mono text-indigo-300">{selectedLogForDetails.id}</span>
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedLogForDetails(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
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
                <span>Before &amp; After Changes Compare</span>
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
                <span>Raw Audit Payload</span>
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-4 overflow-y-auto text-xs">
              {/* Event Metadata Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-3.5 rounded-2xl bg-slate-50 border border-slate-200">
                <div>
                  <span className="text-[10px] font-bold uppercase text-slate-400 block">Action Type</span>
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold border mt-0.5 ${getActionBadgeColor(
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
                  <span className="text-[10px] font-bold uppercase text-slate-400 block">Actor Name</span>
                  <span className="font-semibold text-slate-900 block mt-0.5">{selectedLogForDetails.userName}</span>
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase text-slate-400 block">Actor PF Number</span>
                  <span className="font-mono font-bold text-indigo-600 block mt-0.5">
                    {selectedLogForDetails.userPfNumber}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase text-slate-400 block">Actor Branch</span>
                  <span className="text-slate-700 block mt-0.5">{selectedLogForDetails.userBranch}</span>
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase text-slate-400 block">Target Type</span>
                  <span className="text-slate-700 uppercase font-mono text-[10px] block mt-0.5">
                    {selectedLogForDetails.targetType}
                  </span>
                </div>
              </div>

              {/* Target Description */}
              <div>
                <span className="text-[11px] font-bold text-slate-700 block mb-1">Target Entity:</span>
                <p className="p-3 rounded-xl bg-indigo-50/60 border border-indigo-100 text-slate-900 leading-relaxed font-semibold">
                  {selectedLogForDetails.targetDescription}
                </p>
              </div>

              {/* TAB 1: Visual Before vs After Compare Table */}
              {activeModalTab === 'diff' && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                      <GitCompare className="w-4 h-4 text-indigo-600" />
                      <span>Before Changes vs. After Changes Comparison Matrix</span>
                    </span>
                    <span className="text-[10px] text-slate-400">
                      Red: Previous State &bull; Green: New State
                    </span>
                  </div>

                  {(() => {
                    const diffs = extractDiffFromLog(selectedLogForDetails);

                    if (diffs.length === 0) {
                      return (
                        <div className="p-6 text-center rounded-2xl bg-slate-50 border border-slate-200 text-slate-500">
                          <CheckCircle2 className="w-6 h-6 text-emerald-500 mx-auto mb-1.5" />
                          <p className="text-xs font-semibold">No field modifications detected for this single-step action.</p>
                          <p className="text-[11px] text-slate-400 mt-0.5">
                            This action executed as an atomic event ({selectedLogForDetails.actionLabel}).
                          </p>
                        </div>
                      );
                    }

                    return (
                      <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
                        <table className="w-full text-left border-collapse text-xs">
                          <thead>
                            <tr className="bg-slate-100/90 text-slate-700 text-[10px] font-bold uppercase tracking-wider border-b border-slate-200">
                              <th className="py-2.5 px-3 w-40">Attribute</th>
                              <th className="py-2.5 px-3">Before Changes (Previous)</th>
                              <th className="py-2.5 px-2 w-8 text-center"></th>
                              <th className="py-2.5 px-3">After Changes (New)</th>
                              <th className="py-2.5 px-3 w-20 text-center">Status</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {diffs.map((d, index) => (
                              <tr key={index} className="hover:bg-slate-50/50">
                                {/* Attribute Label */}
                                <td className="py-2.5 px-3 font-semibold text-slate-800 align-top">
                                  {d.label}
                                  <span className="text-[9px] font-mono text-slate-400 block">{d.field}</span>
                                </td>

                                {/* Before State */}
                                <td className="py-2.5 px-3 align-top">
                                  <div className="p-2 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 font-mono text-[11px] flex items-start gap-1.5">
                                    <MinusCircle className="w-3.5 h-3.5 text-rose-500 shrink-0 mt-0.5" />
                                    <span className="break-all leading-relaxed">
                                      {d.formattedBefore || '(None / Not Set)'}
                                    </span>
                                  </div>
                                </td>

                                {/* Arrow */}
                                <td className="py-2.5 px-1 text-center align-middle">
                                  <ArrowRight className="w-4 h-4 text-slate-400 mx-auto" />
                                </td>

                                {/* After State */}
                                <td className="py-2.5 px-3 align-top">
                                  <div className="p-2 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-950 font-mono font-bold text-[11px] flex items-start gap-1.5">
                                    <PlusCircle className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                                    <span className="break-all leading-relaxed">
                                      {d.formattedAfter || '(Deleted)'}
                                    </span>
                                  </div>
                                </td>

                                {/* Status Badge */}
                                <td className="py-2.5 px-3 text-center align-middle">
                                  <span
                                    className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                      d.type === 'added'
                                        ? 'bg-emerald-100 text-emerald-800'
                                        : d.type === 'removed'
                                        ? 'bg-rose-100 text-rose-800'
                                        : 'bg-blue-100 text-blue-800'
                                    }`}
                                  >
                                    {d.type === 'added' ? 'Added' : d.type === 'removed' ? 'Removed' : 'Updated'}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* TAB 2: Raw Audit Payload */}
              {activeModalTab === 'raw' && (
                <div>
                  <span className="text-[11px] font-bold text-slate-700 block mb-1">Raw Audit Document:</span>
                  <pre className="p-4 rounded-2xl bg-slate-900 text-emerald-400 font-mono text-[11px] overflow-x-auto max-h-64 border border-slate-800">
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
            <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
              <span className="text-[11px] text-slate-400">
                Action: <strong className="text-slate-700 font-mono">{selectedLogForDetails.action}</strong>
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
