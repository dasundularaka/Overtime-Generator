import React, { useState, useRef, useEffect } from 'react';
import {
  Settings as SettingsIcon,
  Save,
  Download,
  Upload,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  Printer,
  Shield,
  FileCode,
  HardDrive,
  Lock,
} from 'lucide-react';
import { AppSettings, FontFamily, OTDisplayFormat, TemplateConfig, TimeFormat } from '../types';
import {
  getSettings,
  saveSettings,
  getEmployees,
  exportAllData,
  importAllData,
  resetAllApplicationData,
  getActiveTemplate,
} from '../utils/storage';
import { subscribeToTemplates, setDefaultTemplateInFirestore } from '../services/templateService';
import { useAuth } from '../context/AuthContext';
import { recordAuditLog } from '../utils/auditLogger';
import { ConfirmationModal } from './ConfirmationModal';

export const SettingsPage: React.FC = () => {
  const { isAdmin } = useAuth();
  const employees = getEmployees();
  const [settings, setSettings] = useState<AppSettings>(getSettings());
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [backupStatus, setBackupStatus] = useState<string | null>(null);
  const [templates, setTemplates] = useState<TemplateConfig[]>([getActiveTemplate()]);
  const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false);
  const [isConfirmSaveSettingsOpen, setIsConfirmSaveSettingsOpen] = useState(false);

  useEffect(() => {
    const unsub = subscribeToTemplates(list => {
      if (list.length > 0) setTemplates(list);
    });
    return () => unsub();
  }, []);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setIsConfirmSaveSettingsOpen(true);
  };

  const confirmCommitSaveSettings = () => {
    saveSettings(settings);

    recordAuditLog({
      action: 'SETTINGS_UPDATE',
      actionLabel: 'Updated application settings and time rules',
      targetType: 'settings',
      targetDescription: 'Application Configuration',
      details: {
        shiftStartTime: settings.shiftStartTime,
        shiftEndTime: settings.shiftEndTime,
        otStepMinutes: settings.otStepMinutes,
        timeFormat: settings.timeFormat,
        otDisplayFormat: settings.otDisplayFormat,
      },
    });

    setSaveSuccess(true);
    setIsConfirmSaveSettingsOpen(false);
    setTimeout(() => setSaveSuccess(false), 2500);
  };

  const handleExportBackup = () => {
    const jsonString = exportAllData();
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Overtime_Claim_Manager_Backup_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setBackupStatus('All records, claims, and templates exported into JSON backup.');
  };

  const handleImportBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      const res = importAllData(content);
      if (res.success) {
        setSettings(getSettings());
        setBackupStatus(res.message);
        setTimeout(() => window.location.reload(), 1500);
      } else {
        setBackupStatus('Import Error: ' + res.message);
      }
    };
    reader.readAsText(file);
  };

  const confirmFactoryReset = () => {
    resetAllApplicationData();
    setIsResetConfirmOpen(false);
    window.location.reload();
  };

  return (
    <div className="space-y-6 pb-16 max-w-4xl mx-auto">
      {/* Header */}
      <div className="rounded-2xl bg-white p-5 sm:p-6 shadow-xs border border-slate-200">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
            <SettingsIcon className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
              Application Settings
            </h1>
            <p className="text-xs sm:text-sm text-slate-500">
              Configure system defaults, printer offsets, data backups, and privacy.
            </p>
          </div>
        </div>

        {saveSuccess && (
          <div className="mt-4 p-3 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center gap-2 text-xs text-emerald-800">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>Settings saved successfully!</span>
          </div>
        )}
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        {/* Section 1: Default Values */}
        <div className="rounded-2xl bg-white p-5 sm:p-6 shadow-xs border border-slate-200 space-y-4">
          <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider text-indigo-700">
            1. Form Defaults
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Default Claimant Employee
              </label>
              <select
                value={settings.defaultEmployeeId || ''}
                onChange={e => setSettings({ ...settings, defaultEmployeeId: e.target.value || undefined })}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              >
                <option value="">-- None (Choose per claim) --</option>
                {employees.map(emp => (
                  <option key={emp.id} value={emp.id}>
                    {emp.name} ({emp.employeeNumber})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Default Department
              </label>
              <input
                type="text"
                value={settings.defaultDepartment}
                onChange={e => setSettings({ ...settings, defaultDepartment: e.target.value })}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Default Branch / Office
              </label>
              <input
                type="text"
                value={settings.defaultBranch}
                onChange={e => setSettings({ ...settings, defaultBranch: e.target.value })}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Default PDF Font Family
              </label>
              <select
                value={settings.defaultFont}
                onChange={e => setSettings({ ...settings, defaultFont: e.target.value as FontFamily })}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              >
                <option value="Helvetica">Helvetica (Standard Corporate)</option>
                <option value="TimesRoman">Times Roman (Formal Serif)</option>
                <option value="Courier">Courier (Monospace Matrix)</option>
              </select>
            </div>

            <div className="sm:col-span-2">
              <label className="block font-semibold text-slate-700 mb-1">
                Default Form Template (Cloud)
              </label>
              {isAdmin ? (
                <select
                  value={settings.activeTemplateId || ''}
                  onChange={e => {
                    const newId = e.target.value;
                    setSettings({ ...settings, activeTemplateId: newId });
                    if (newId) setDefaultTemplateInFirestore(newId).catch(console.error);
                  }}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-slate-800 font-medium focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                >
                  {templates.map(t => (
                    <option key={t.id} value={t.id}>
                      {t.name} {t.isDefault ? '★ (Organization Default)' : ''}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-100 border border-slate-200 text-slate-700 font-semibold text-xs">
                  <div className="flex items-center gap-2">
                    <Lock className="w-3.5 h-3.5 text-slate-400" />
                    <span>{templates.find(t => t.id === settings.activeTemplateId)?.name || 'Standard Official Form'}</span>
                  </div>
                  <span className="text-[10px] text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-full font-bold">
                    Admin Managed
                  </span>
                </div>
              )}
              <p className="text-[11px] text-slate-500 mt-1">
                {isAdmin
                  ? 'Selected template is loaded by default across all employee claim forms. Configure layouts and printer offsets in the Template Designer tab.'
                  : 'Organization template assigned by system administrator.'}
              </p>
            </div>
          </div>
        </div>

        {/* Section 2: Formats & Filename */}
        <div className="rounded-2xl bg-white p-5 sm:p-6 shadow-xs border border-slate-200 space-y-4">
          <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider text-indigo-700">
            2. Formatting &amp; Output
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Time Input Format
              </label>
              <select
                value={settings.timeFormat}
                onChange={e => setSettings({ ...settings, timeFormat: e.target.value as TimeFormat })}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              >
                <option value="24h">24-Hour Military Format (e.g. 17:30, 21:00)</option>
                <option value="12h">12-Hour AM/PM Format</option>
              </select>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Overtime Duration Display
              </label>
              <select
                value={settings.otDisplayFormat}
                onChange={e => setSettings({ ...settings, otDisplayFormat: e.target.value as OTDisplayFormat })}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              >
                <option value="hhmm">Hours &amp; Minutes (e.g. 02:30)</option>
                <option value="decimal">Decimal Hours (e.g. 2.50)</option>
              </select>
            </div>

            <div className="sm:col-span-2">
              <label className="block font-semibold text-slate-700 mb-1">
                PDF Generated Filename Pattern
              </label>
              <input
                type="text"
                value={settings.pdfFilenamePattern}
                onChange={e => setSettings({ ...settings, pdfFilenamePattern: e.target.value })}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-slate-800 font-mono"
              />
              <span className="block text-[11px] text-slate-400 mt-1">
                Available tags: [EmployeeName], [Month], [Year]. Example: Overtime_Claim_[EmployeeName]_[Month]_[Year].pdf
              </span>
            </div>
          </div>
        </div>

        {/* Section 3: Global Hardware Printer Calibration */}
        <div className="rounded-2xl bg-white p-5 sm:p-6 shadow-xs border border-slate-200 space-y-4">
          <div className="flex items-center gap-2">
            <Printer className="w-4 h-4 text-indigo-600" />
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider text-indigo-700">
              3. Global Hardware Printer Calibration
            </h2>
          </div>
          <p className="text-xs text-slate-500">
            Offsets configured here are globally added to all PDF coordinates during generation to correct for physical paper feed shifting on your office printer.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
              <label className="block font-semibold text-slate-700 mb-1">
                Global Horizontal Offset (X mm)
              </label>
              <input
                type="number"
                step="0.5"
                value={settings.globalPrinterOffsetX}
                onChange={e => setSettings({ ...settings, globalPrinterOffsetX: parseFloat(e.target.value) || 0 })}
                className="w-full rounded-lg border border-slate-300 px-3 py-1.5 font-mono text-center bg-white"
              />
              <span className="block text-[10px] text-slate-400 mt-1">
                Shift right (+) or left (-) across the A4 page.
              </span>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
              <label className="block font-semibold text-slate-700 mb-1">
                Global Vertical Offset (Y mm)
              </label>
              <input
                type="number"
                step="0.5"
                value={settings.globalPrinterOffsetY}
                onChange={e => setSettings({ ...settings, globalPrinterOffsetY: parseFloat(e.target.value) || 0 })}
                className="w-full rounded-lg border border-slate-300 px-3 py-1.5 font-mono text-center bg-white"
              />
              <span className="block text-[10px] text-slate-400 mt-1">
                Shift down (+) or up (-) down the A4 page.
              </span>
            </div>
          </div>
        </div>

        {/* Save Settings Button */}
        <div className="flex justify-end">
          <button
            type="submit"
            className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-xs transition"
          >
            <Save className="w-4 h-4" />
            <span>Save All Settings</span>
          </button>
        </div>
      </form>

      {/* Section 4: Local Storage, Privacy & Full Backup */}
      <div className="rounded-2xl bg-white p-5 sm:p-6 shadow-xs border border-slate-200 space-y-4">
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-emerald-600" />
          <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider text-emerald-700">
            4. Privacy &amp; Data Security
          </h2>
        </div>
        <p className="text-xs text-slate-600 leading-relaxed">
          Overtime Claim Manager operates <strong>100% locally in your web browser</strong>. All employee details, overtime hours, and custom templates are stored securely in browser storage. No data is transmitted to external servers.
        </p>

        {backupStatus && (
          <div className="p-3 rounded-xl bg-blue-50 border border-blue-200 text-xs text-blue-800">
            {backupStatus}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 flex flex-col justify-between">
            <div>
              <h3 className="font-bold text-slate-800 text-xs flex items-center gap-1.5">
                <HardDrive className="w-4 h-4 text-indigo-600" />
                <span>Export Data Backup</span>
              </h3>
              <p className="text-[11px] text-slate-500 mt-1">
                Downloads a single JSON backup containing all employee profiles, claim history, and template calibrations.
              </p>
            </div>
            <button
              onClick={handleExportBackup}
              className="mt-3 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-xs transition"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export JSON Backup</span>
            </button>
          </div>

          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 flex flex-col justify-between">
            <div>
              <h3 className="font-bold text-slate-800 text-xs flex items-center gap-1.5">
                <Upload className="w-4 h-4 text-blue-600" />
                <span>Restore Data Backup</span>
              </h3>
              <p className="text-[11px] text-slate-500 mt-1">
                Restore claims, employees, and templates from a previous JSON backup file.
              </p>
            </div>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="mt-3 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 text-xs font-semibold transition"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Select Backup File</span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              className="hidden"
              onChange={handleImportBackup}
            />
          </div>
        </div>

        {/* Danger Zone */}
        <div className="mt-6 pt-5 border-t border-rose-100">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl bg-rose-50/60 border border-rose-200">
            <div>
              <h4 className="text-xs font-bold text-rose-800 flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-rose-600" />
                <span>Factory Reset</span>
              </h4>
              <p className="text-[11px] text-rose-700/80 mt-0.5">
                Clear all local storage and revert application to first-time state.
              </p>
            </div>
            <button
              onClick={() => setIsResetConfirmOpen(true)}
              className="px-3.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-xs transition shrink-0"
            >
              Reset Application Data
            </button>
          </div>
        </div>
      </div>

      {/* Confirmation Modal for Factory Reset */}
      <ConfirmationModal
        isOpen={isResetConfirmOpen}
        onClose={() => setIsResetConfirmOpen(false)}
        onConfirm={confirmFactoryReset}
        title="Factory Reset Application"
        message="WARNING: This will wipe all local overtime claims, employee profiles, and template customizations, returning the application to first-run state. Are you sure you want to proceed?"
        confirmText="Confirm Reset"
        cancelText="Cancel"
        variant="danger"
      />

      {/* Confirmation Modal for Save Settings */}
      <ConfirmationModal
        isOpen={isConfirmSaveSettingsOpen}
        onClose={() => setIsConfirmSaveSettingsOpen(false)}
        onConfirm={confirmCommitSaveSettings}
        title="Save Application Settings"
        message="Are you sure you want to save these updated system preferences and printer offsets?"
        confirmText="Save Settings"
        cancelText="Cancel"
        variant="info"
        details={[
          { label: 'Default Branch', value: settings.defaultBranch || 'Headquarters' },
          { label: 'Time Format', value: settings.timeFormat },
          { label: 'Printer X Offset', value: `${settings.globalPrinterOffsetX} mm` },
          { label: 'Printer Y Offset', value: `${settings.globalPrinterOffsetY} mm` },
        ]}
      />
    </div>
  );
};
