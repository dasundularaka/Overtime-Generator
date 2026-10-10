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
} from 'lucide-react';
import { AuditLogEntry, AuditActionType } from '../types';
import { fetchAuditLogs, exportAuditLogsToCsv } from '../utils/auditLogger';

export const AuditLogViewer: React.FC = () => {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedActionCategory, setSelectedActionCategory] = useState<string>('ALL');
  const [selectedBranch, setSelectedBranch] = useState<string>('ALL');
  const [selectedLogForDetails, setSelectedLogForDetails] = useState<AuditLogEntry | null>(null);

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

        if (!matchesName && !matchesPf && !matchesBranch && !matchesDesc && !matchesLabel && !matchesTargetId) {
          return false;
        }
      }

      // 2. Action Category
      if (selectedActionCategory !== 'ALL') {
        if (selectedActionCategory === 'USERS' && !log.action.startsWith('USER_')) return false;
        if (selectedActionCategory === 'PASSWORDS' && !log.action.startsWith('PASSWORD_')) return false;
        if (selectedActionCategory === 'CLAIMS' && !log.action.startsWith('CLAIM_')) return false;
        if (selectedActionCategory === 'TEMPLATES' && !log.action.startsWith('TEMPLATE_')) return false;
        if (selectedActionCategory === 'SYSTEM' && (log.action.startsWith('USER_') || log.action.startsWith('CLAIM_') || log.action.startsWith('PASSWORD_'))) return false;
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
      userEvents: logs.filter(l => l.action.startsWith('USER_')).length,
      passwordEvents: logs.filter(l => l.action.startsWith('PASSWORD_')).length,
      claimEvents: logs.filter(l => l.action.startsWith('CLAIM_')).length,
      templateEvents: logs.filter(l => l.action.startsWith('TEMPLATE_')).length,
    };
  }, [logs]);

  const getActionBadgeColor = (action: AuditActionType) => {
    if (action.includes('CREATE') || action.includes('LOGIN')) {
      return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    }
    if (action.includes('DELETE')) {
      return 'bg-rose-50 text-rose-700 border-rose-200';
    }
    if (action.includes('PASSWORD')) {
      return 'bg-amber-50 text-amber-700 border-amber-200';
    }
    if (action.includes('UPDATE') || action.includes('EDIT')) {
      return 'bg-blue-50 text-blue-700 border-blue-200';
    }
    return 'bg-purple-50 text-purple-700 border-purple-200';
  };

  const getActionIcon = (action: AuditActionType) => {
    if (action.startsWith('USER_CREATE')) return <UserPlus className="w-3.5 h-3.5" />;
    if (action.startsWith('USER_DELETE')) return <Trash2 className="w-3.5 h-3.5" />;
    if (action.startsWith('PASSWORD')) return <KeyRound className="w-3.5 h-3.5" />;
    if (action.startsWith('CLAIM_')) return <FileText className="w-3.5 h-3.5" />;
    if (action.startsWith('TEMPLATE_')) return <Sliders className="w-3.5 h-3.5" />;
    if (action.includes('UPDATE')) return <Edit2 className="w-3.5 h-3.5" />;
    return <Activity className="w-3.5 h-3.5" />;
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
    <div className="space-y-6 pb-20 md:pb-10">
      {/* Header Banner */}
      <div className="rounded-3xl bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 p-6 sm:p-8 text-white shadow-xl border border-slate-800">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-500/20 text-indigo-300 text-xs font-semibold mb-2.5 border border-indigo-500/30">
              <ShieldCheck className="w-4 h-4 text-indigo-400" />
              <span>Administrative Traceability &amp; Governance</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              System Audit Logs
            </h1>
            <p className="mt-1.5 text-xs sm:text-sm text-slate-300 max-w-2xl leading-relaxed">
              Complete, immutable audit trail of all CRUD actions across user management, claim edits, password resets, and template configurations with actor PF Numbers and branches.
            </p>
          </div>

          <div className="flex items-center gap-2.5 self-start md:self-center">
            <button
              onClick={() => exportAuditLogsToCsv(filteredLogs)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold border border-white/20 transition cursor-pointer"
              title="Download filtered logs as CSV"
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
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {/* Quick KPI Cards */}
        <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-3 text-slate-200">
          <div className="bg-slate-800/60 p-3 rounded-2xl border border-slate-700/60">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Total Activities</span>
            <span className="text-xl font-extrabold text-white">{stats.total}</span>
          </div>
          <div className="bg-slate-800/60 p-3 rounded-2xl border border-slate-700/60">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Claim Edits</span>
            <span className="text-xl font-extrabold text-indigo-300">{stats.claimEvents}</span>
          </div>
          <div className="bg-slate-800/60 p-3 rounded-2xl border border-slate-700/60">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">User Changes</span>
            <span className="text-xl font-extrabold text-emerald-300">{stats.userEvents}</span>
          </div>
          <div className="bg-slate-800/60 p-3 rounded-2xl border border-slate-700/60">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Password Resets</span>
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
            placeholder="Search by User Name, PF No (e.g. PF123456), Branch, or Target..."
            className="w-full rounded-xl border border-slate-200 bg-slate-50/50 py-2 pl-9 pr-3 text-xs text-slate-800 focus:bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
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
              <option value="CLAIMS">Claim Edits &amp; Creates</option>
              <option value="USERS">User Accounts</option>
              <option value="PASSWORDS">Password Resets</option>
              <option value="TEMPLATES">Template Changes</option>
              <option value="SYSTEM">System &amp; Calendar</option>
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
              : 'Audit log entries will appear here as users create accounts, edit claims, and reset passwords.'}
          </p>
        </div>
      ) : (
        <div className="rounded-2xl bg-white shadow-xs border border-slate-200 overflow-hidden">
          {/* Mobile Card View (< md) */}
          <div className="block md:hidden divide-y divide-slate-100">
            {filteredLogs.map(log => {
              const { date, time } = formatTimestamp(log.timestamp);
              return (
                <div key={log.id} className="p-4 space-y-2 hover:bg-slate-50/50 transition">
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

                  <div>
                    <p className="text-xs font-bold text-slate-800 leading-snug">
                      {log.targetDescription}
                    </p>
                  </div>

                  <div className="flex items-center justify-between pt-1 border-t border-slate-50 text-[11px] text-slate-500">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-700">{log.userName}</span>
                      <span className="font-mono text-indigo-600 font-bold bg-indigo-50 px-1.5 py-0.2 rounded text-[10px]">
                        {log.userPfNumber}
                      </span>
                      <span>&bull;</span>
                      <span>{log.userBranch}</span>
                    </div>

                    {log.details && Object.keys(log.details).length > 0 && (
                      <button
                        onClick={() => setSelectedLogForDetails(log)}
                        className="text-indigo-600 font-bold text-[11px] hover:underline"
                      >
                        Inspect
                      </button>
                    )}
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
                  <th className="py-3 px-3.5 w-44">Action</th>
                  <th className="py-3 px-3.5 w-60">Performed By (Actor)</th>
                  <th className="py-3 px-3.5">Target &amp; Activity</th>
                  <th className="py-3 px-3.5 w-24 text-center">Inspect</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredLogs.map(log => {
                  const { date, time } = formatTimestamp(log.timestamp);
                  return (
                    <tr key={log.id} className="hover:bg-slate-50/70 transition">
                      {/* Timestamp */}
                      <td className="py-3 px-3.5 font-mono text-[11px] text-slate-600 whitespace-nowrap">
                        <div className="font-bold text-slate-800">{date}</div>
                        <div className="text-[10px] text-slate-400">{time}</div>
                      </td>

                      {/* Action Pill */}
                      <td className="py-3 px-3.5">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold border ${getActionBadgeColor(
                            log.action
                          )}`}
                        >
                          {getActionIcon(log.action)}
                          <span>{log.actionLabel || log.action}</span>
                        </span>
                      </td>

                      {/* User Identifiers (Name, PF No, Branch) */}
                      <td className="py-3 px-3.5">
                        <div className="flex flex-col">
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-slate-900">{log.userName}</span>
                            <span className="font-mono text-[10px] font-extrabold text-indigo-700 bg-indigo-50 border border-indigo-200 px-1.5 py-0.2 rounded">
                              {log.userPfNumber}
                            </span>
                          </div>
                          <div className="flex items-center gap-1 text-[11px] text-slate-500 mt-0.5">
                            <Building2 className="w-3 h-3 text-slate-400" />
                            <span>{log.userBranch}</span>
                            {log.userDepartment && (
                              <span className="text-slate-400">&bull; {log.userDepartment}</span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Description & Target */}
                      <td className="py-3 px-3.5 text-slate-800 font-medium">
                        <div className="leading-relaxed">{log.targetDescription}</div>
                        {log.targetId && (
                          <div className="text-[10px] font-mono text-slate-400 mt-0.5">
                            Target ID: {log.targetId}
                          </div>
                        )}
                      </td>

                      {/* Inspect Details */}
                      <td className="py-3 px-3.5 text-center">
                        <button
                          onClick={() => setSelectedLogForDetails(log)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 text-slate-600 text-[11px] font-semibold transition cursor-pointer"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>View</span>
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

      {/* Details Inspection Modal */}
      {selectedLogForDetails && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in">
          <div className="w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-indigo-400" />
                <h3 className="font-bold text-sm">Audit Record Traceability Details</h3>
              </div>
              <button
                onClick={() => setSelectedLogForDetails(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-4 overflow-y-auto text-xs">
              <div className="grid grid-cols-2 gap-3 p-3.5 rounded-2xl bg-slate-50 border border-slate-200">
                <div>
                  <span className="text-[10px] font-bold uppercase text-slate-400 block">Action</span>
                  <span className="font-bold text-slate-800">{selectedLogForDetails.actionLabel}</span>
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase text-slate-400 block">Timestamp</span>
                  <span className="font-mono text-slate-700">
                    {new Date(selectedLogForDetails.timestamp).toLocaleString('en-US')}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase text-slate-400 block">Actor Name</span>
                  <span className="font-semibold text-slate-800">{selectedLogForDetails.userName}</span>
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase text-slate-400 block">Actor PF Number</span>
                  <span className="font-mono font-bold text-indigo-600">{selectedLogForDetails.userPfNumber}</span>
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase text-slate-400 block">Branch</span>
                  <span className="text-slate-700">{selectedLogForDetails.userBranch}</span>
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase text-slate-400 block">Role</span>
                  <span className="text-slate-700 uppercase">{selectedLogForDetails.userRole || 'User'}</span>
                </div>
              </div>

              <div>
                <span className="text-[11px] font-bold text-slate-700 block mb-1">Activity Summary:</span>
                <p className="p-3 rounded-xl bg-indigo-50/50 border border-indigo-100 text-slate-800 leading-relaxed font-medium">
                  {selectedLogForDetails.targetDescription}
                </p>
              </div>

              {selectedLogForDetails.details && Object.keys(selectedLogForDetails.details).length > 0 && (
                <div>
                  <span className="text-[11px] font-bold text-slate-700 block mb-1">Payload / Field Changes:</span>
                  <pre className="p-3.5 rounded-xl bg-slate-900 text-emerald-400 font-mono text-[11px] overflow-x-auto max-h-48 border border-slate-800">
                    {JSON.stringify(selectedLogForDetails.details, null, 2)}
                  </pre>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex justify-end">
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
