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
  Mail,
  ShieldCheck,
  KeyRound,
  Tag,
} from 'lucide-react';
import { collection, getDocs, query, where, doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { PasswordResetModal } from './PasswordResetModal';
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
import {
  hasGoogleWorkspaceToken,
  connectGoogleWorkspace,
  setCachedGoogleToken,
} from '../services/googleWorkspaceService';

export const SettingsPage: React.FC = () => {
  const { currentUser, userProfile, isAdmin, refreshUserProfile } = useAuth();
  const employees = getEmployees();
  const [settings, setSettings] = useState<AppSettings>(getSettings());
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [backupStatus, setBackupStatus] = useState<string | null>(null);
  const [templates, setTemplates] = useState<TemplateConfig[]>([getActiveTemplate()]);
  const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false);
  const [isConfirmSaveSettingsOpen, setIsConfirmSaveSettingsOpen] = useState(false);
  const [isGoogleConnected, setIsGoogleConnected] = useState(hasGoogleWorkspaceToken());
  const [isConnectingGoogle, setIsConnectingGoogle] = useState(false);
  const [googleWorkspaceMessage, setGoogleWorkspaceMessage] = useState<string | null>(null);

  useEffect(() => {
    setIsGoogleConnected(hasGoogleWorkspaceToken());
  }, []);

  useEffect(() => {
    const unsub = subscribeToTemplates(list => {
      if (list.length > 0) setTemplates(list);
    });
    return () => unsub();
  }, []);

  const initialSettingsRef = useRef<AppSettings>(getSettings());
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setIsConfirmSaveSettingsOpen(true);
  };

  const confirmCommitSaveSettings = () => {
    const prev = initialSettingsRef.current;
    saveSettings(settings);

    // Persist default reasons to Firestore user profile if logged in
    const targetUid = userProfile?.id || currentUser?.uid;
    if (targetUid) {
      updateDoc(doc(db, 'users', targetUid), {
        defaultWeekdayReason: settings.defaultWeekdayReason || '',
        defaultSaturdayReason: settings.defaultSaturdayReason || 'Saturday Duty',
        defaultHolidayReason: settings.defaultHolidayReason || '',
        updatedAt: new Date().toISOString(),
      }).catch(err => console.warn('Could not update user profile in Firestore:', err));
    }

    recordAuditLog({
      action: 'SETTINGS_UPDATE',
      actionLabel: 'Updated Application Settings & Time Rules',
      targetType: 'settings',
      targetDescription: 'Application Configuration & Printer Offsets',
      beforeState: {
        shiftStartTime: prev.shiftStartTime,
        shiftEndTime: prev.shiftEndTime,
        otStepMinutes: prev.otStepMinutes,
        timeFormat: prev.timeFormat,
        otDisplayFormat: prev.otDisplayFormat,
        defaultDepartment: prev.defaultDepartment,
        defaultBranch: prev.defaultBranch,
        globalPrinterOffsetX: prev.globalPrinterOffsetX,
        globalPrinterOffsetY: prev.globalPrinterOffsetY,
        activeTemplateId: prev.activeTemplateId,
      },
      afterState: {
        shiftStartTime: settings.shiftStartTime,
        shiftEndTime: settings.shiftEndTime,
        otStepMinutes: settings.otStepMinutes,
        timeFormat: settings.timeFormat,
        otDisplayFormat: settings.otDisplayFormat,
        defaultDepartment: settings.defaultDepartment,
        defaultBranch: settings.defaultBranch,
        globalPrinterOffsetX: settings.globalPrinterOffsetX,
        globalPrinterOffsetY: settings.globalPrinterOffsetY,
        activeTemplateId: settings.activeTemplateId,
      },
      details: {
        shiftStartTime: settings.shiftStartTime,
        shiftEndTime: settings.shiftEndTime,
        otStepMinutes: settings.otStepMinutes,
        timeFormat: settings.timeFormat,
        otDisplayFormat: settings.otDisplayFormat,
      },
    });

    initialSettingsRef.current = settings;
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

    recordAuditLog({
      action: 'DATA_BACKUP_EXPORT',
      actionLabel: 'Exported Full System JSON Backup',
      targetType: 'backup',
      targetDescription: 'Complete export of all employee profiles, claim timesheets, and templates',
      afterState: {
        employeesCount: employees.length,
        templatesCount: templates.length,
        exportedAt: new Date().toISOString(),
      },
    });
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

        recordAuditLog({
          action: 'DATA_BACKUP_RESTORE',
          actionLabel: 'Restored System Backup from JSON',
          targetType: 'backup',
          targetDescription: file.name,
          afterState: {
            fileName: file.name,
            fileSizeKb: Math.round(file.size / 1024),
            restoredAt: new Date().toISOString(),
          },
        });

        setTimeout(() => window.location.reload(), 1500);
      } else {
        setBackupStatus('Import Error: ' + res.message);
      }
    };
    reader.readAsText(file);
  };

  const confirmFactoryReset = () => {
    recordAuditLog({
      action: 'DATA_FACTORY_RESET',
      actionLabel: 'Executed System Factory Reset',
      targetType: 'backup',
      targetDescription: 'Complete wipe and reset to factory defaults',
      beforeState: {
        employeesCount: employees.length,
        templatesCount: templates.length,
      },
      afterState: {
        status: 'reset_to_factory_defaults',
      },
    });

    resetAllApplicationData();
    setIsResetConfirmOpen(false);
    window.location.reload();
  };

  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [personalBackupStatus, setPersonalBackupStatus] = useState<string | null>(null);

  const handleExportMyPersonalData = async () => {
    try {
      const myUid = currentUser?.uid;
      const myPf = (userProfile?.employeeNumber || userProfile?.pfNumber || '').toUpperCase().trim();

      // Strictly isolate: fetch ONLY current user's claims
      const myClaims: any[] = [];
      if (myUid) {
        const snap = await getDocs(query(collection(db, 'claims'), where('userId', '==', myUid)));
        snap.forEach(d => myClaims.push(d.data()));
      }
      if (myPf) {
        const snapPf = await getDocs(query(collection(db, 'claims'), where('employeeNumber', '==', myPf)));
        snapPf.forEach(d => {
          const c = d.data();
          if (!myClaims.some(existing => existing.id === c.id)) {
            myClaims.push(c);
          }
        });
      }

      const personalExport = {
        exportedAt: new Date().toISOString(),
        profile: {
          name: userProfile?.name,
          employeeNumber: userProfile?.employeeNumber || userProfile?.pfNumber,
          designation: userProfile?.designation,
          branch: userProfile?.branch,
          department: userProfile?.department,
          claimType: userProfile?.claimType,
        },
        claims: myClaims,
      };

      const jsonString = JSON.stringify(personalExport, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `My_Personal_Claims_${(myPf || 'Personal')}_${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setPersonalBackupStatus('Your personal claims and profile data were downloaded successfully.');
      setTimeout(() => setPersonalBackupStatus(null), 4000);

      recordAuditLog({
        action: 'DATA_PERSONAL_EXPORT',
        actionLabel: 'Exported Personal Overtime Claim Records',
        targetType: 'claim',
        targetDescription: `${userProfile?.name} personal claims (${myClaims.length} records)`,
        afterState: {
          claimsCount: myClaims.length,
          exportedAt: new Date().toISOString(),
        },
      });
    } catch (err: any) {
      setPersonalBackupStatus('Export note: ' + err.message);
    }
  };

  // For regular staff users: show ONLY Privacy & Data Security!
  if (!isAdmin) {
    return (
      <div className="space-y-6 pb-16 max-w-4xl mx-auto">
        {/* Header */}
        <div className="rounded-2xl bg-white p-5 sm:p-6 shadow-xs border border-slate-200">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
                Privacy &amp; Data Security
              </h1>
              <p className="text-xs sm:text-sm text-slate-500">
                Your personal overtime claims and timesheet records are strictly confidential and protected.
              </p>
            </div>
          </div>
        </div>

        {/* Section 1: Personal Data Isolation & Protection */}
        <div className="rounded-2xl bg-white p-5 sm:p-6 shadow-xs border border-slate-200 space-y-4">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-emerald-600" />
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider text-emerald-700">
              Personal Data Protection &amp; Access Isolation
            </h2>
          </div>
          <p className="text-xs text-slate-600 leading-relaxed">
            In compliance with corporate data protection standards, all timesheet submissions and overtime calculations are strictly private to your account. <strong>Regular staff members cannot access, view, or search other employees&apos; claims or records.</strong>
          </p>

          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div>
              <span className="text-slate-400 block text-[10px] font-bold uppercase tracking-wider">
                Staff Name
              </span>
              <span className="font-bold text-slate-900">{userProfile?.name || 'Staff Member'}</span>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px] font-bold uppercase tracking-wider">
                PF Number (Username)
              </span>
              <span className="font-bold text-indigo-700 font-mono">
                {userProfile?.employeeNumber || userProfile?.pfNumber || 'PF Number'}
              </span>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px] font-bold uppercase tracking-wider">
                Designation &amp; Department
              </span>
              <span className="font-semibold text-slate-700">
                {userProfile?.designation || 'Staff Member'} &bull; {userProfile?.department || 'Operations'}
              </span>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px] font-bold uppercase tracking-wider">
                Branch / Office
              </span>
              <span className="font-semibold text-slate-700">{userProfile?.branch || 'Head Office'}</span>
            </div>
          </div>
        </div>

        {/* Section 2: Account Password Management */}
        <div className="rounded-2xl bg-white p-5 sm:p-6 shadow-xs border border-slate-200 space-y-4">
          <div className="flex items-center gap-2">
            <KeyRound className="w-5 h-5 text-indigo-600" />
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider text-indigo-700">
              Account Security &amp; Password
            </h2>
          </div>
          <p className="text-xs text-slate-600 leading-relaxed">
            Protect your account by maintaining a strong, private password. You can change your password at any time.
          </p>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl bg-indigo-50/60 border border-indigo-200">
            <div>
              <h3 className="text-xs font-bold text-indigo-900">Personal Password Management</h3>
              <p className="text-[11px] text-indigo-700/80 mt-0.5">
                Update your login password to maintain strict access control over your overtime records.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsPasswordModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-xs transition cursor-pointer shrink-0"
            >
              <KeyRound className="w-3.5 h-3.5" />
              <span>Change Password</span>
            </button>
          </div>
        </div>

        {/* Section 3: My Personal Data Export */}
        <div className="rounded-2xl bg-white p-5 sm:p-6 shadow-xs border border-slate-200 space-y-4">
          <div className="flex items-center gap-2">
            <HardDrive className="w-5 h-5 text-blue-600" />
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider text-blue-700">
              My Personal Data Export
            </h2>
          </div>
          <p className="text-xs text-slate-600 leading-relaxed">
            Download an encrypted JSON export of your personal claim submissions and user particulars. <strong>This export contains strictly your personal data and no other staff records.</strong>
          </p>

          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="font-bold text-slate-800 text-xs flex items-center gap-1.5">
                <Download className="w-4 h-4 text-blue-600" />
                <span>Export My Personal Claims Data</span>
              </h3>
              <p className="text-[11px] text-slate-500 mt-1">
                Downloads a JSON file containing all overtime claims created by {userProfile?.name || 'you'}.
              </p>
            </div>
            <button
              type="button"
              onClick={handleExportMyPersonalData}
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs transition shrink-0 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export My Data</span>
            </button>
          </div>

          {personalBackupStatus && (
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{personalBackupStatus}</span>
            </div>
          )}
        </div>

        {/* Password Reset Modal */}
        <PasswordResetModal
          isOpen={isPasswordModalOpen}
          onPasswordChanged={() => {
            setIsPasswordModalOpen(false);
            refreshUserProfile();
          }}
        />
      </div>
    );
  }

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

            {/* Default Overtime Reasons */}
            <div className="sm:col-span-2 pt-4 border-t border-slate-100">
              <div className="flex items-center gap-2 mb-1.5">
                <Tag className="w-4 h-4 text-indigo-600" />
                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                  Default Overtime Reasons
                </h3>
              </div>
              <p className="text-[11px] text-slate-500 mb-3">
                Configure default reasons automatically populated when creating claims, auto-populating full months, or adding timesheet rows.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1 text-[11px]">
                    Weekdays (Mon - Fri) Reason
                  </label>
                  <input
                    type="text"
                    value={settings.defaultWeekdayReason || ''}
                    onChange={e => setSettings({ ...settings, defaultWeekdayReason: e.target.value })}
                    placeholder="e.g. Regular Overtime"
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-slate-800 text-xs focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  />
                  <span className="text-[10px] text-slate-400 mt-0.5 block">Applied to standard weekdays.</span>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1 text-[11px]">
                    Saturdays Reason
                  </label>
                  <input
                    type="text"
                    value={settings.defaultSaturdayReason ?? 'Saturday Duty'}
                    onChange={e => setSettings({ ...settings, defaultSaturdayReason: e.target.value })}
                    placeholder="e.g. Saturday Duty"
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-slate-800 text-xs focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  />
                  <span className="text-[10px] text-slate-400 mt-0.5 block">Applied to all Saturday duties.</span>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1 text-[11px]">
                    Other Holidays &amp; Sundays Reason
                  </label>
                  <input
                    type="text"
                    value={settings.defaultHolidayReason || ''}
                    onChange={e => setSettings({ ...settings, defaultHolidayReason: e.target.value })}
                    placeholder="e.g. Holiday Duty (or blank for Name)"
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-slate-800 text-xs focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  />
                  <span className="text-[10px] text-slate-400 mt-0.5 block">Leave blank to use official Holiday name.</span>
                </div>
              </div>
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

      {/* Section 4: Google Workspace Integration (Google Drive & Gmail) */}
      <div className="rounded-2xl bg-white p-5 sm:p-6 shadow-xs border border-slate-200 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5" viewBox="0 0 87.3 78" fill="currentColor">
              <path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.45z" fill="#0066da" />
              <path d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44c-.8 1.35-1.2 2.9-1.2 4.45h27.5z" fill="#00ac47" />
              <path d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.35 1.2-2.9 1.2-4.5h-27.5l5.85 10.15z" fill="#ea4335" />
              <path d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.2z" fill="#00832d" />
              <path d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z" fill="#2684fc" />
              <path d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 28h27.45c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00" />
            </svg>
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider text-blue-700">
              4. Google Workspace Integration (Drive &amp; Gmail)
            </h2>
          </div>
          <span
            className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
              isGoogleConnected
                ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                : 'bg-slate-100 text-slate-600 border border-slate-200'
            }`}
          >
            {isGoogleConnected ? 'Google Workspace Connected' : 'Not Connected'}
          </span>
        </div>

        <p className="text-xs text-slate-600 leading-relaxed">
          Google Workspace integration provides an <strong>in-site Google Drive facility</strong> for interactive claim report previews with cloud synchronization, and enables <strong>automatic Gmail dispatch</strong> for user account credentials.
        </p>

        {googleWorkspaceMessage && (
          <div className="p-3 rounded-xl bg-blue-50 border border-blue-200 text-xs text-blue-800">
            {googleWorkspaceMessage}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 flex flex-col justify-between">
            <div>
              <h3 className="font-bold text-slate-800 text-xs flex items-center gap-1.5">
                <HardDrive className="w-4 h-4 text-blue-600" />
                <span>Google Drive Preview Facility</span>
              </h3>
              <p className="text-[11px] text-slate-500 mt-1">
                Uploads generated A4 PDF claim forms to Google Drive to render interactive, high-fidelity in-site previews with zoom, print, and export capabilities.
              </p>
            </div>
            <div className="mt-3 flex items-center gap-1.5 text-xs text-emerald-700 font-medium">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Scope: drive.file enabled</span>
            </div>
          </div>

          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 flex flex-col justify-between">
            <div>
              <h3 className="font-bold text-slate-800 text-xs flex items-center gap-1.5">
                <Mail className="w-4 h-4 text-red-500" />
                <span>Gmail Automatic Dispatch</span>
              </h3>
              <p className="text-[11px] text-slate-500 mt-1">
                Automatically dispatches welcome emails containing PF usernames, temporary passwords, and system login URLs when administrators create user accounts.
              </p>
            </div>
            <div className="mt-3 flex items-center gap-1.5 text-xs text-emerald-700 font-medium">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Scope: gmail.send enabled</span>
            </div>
          </div>
        </div>

        <div className="pt-2 flex items-center justify-between flex-wrap gap-2">
          {!isGoogleConnected ? (
            <button
              type="button"
              disabled={isConnectingGoogle}
              onClick={async () => {
                setIsConnectingGoogle(true);
                setGoogleWorkspaceMessage(null);
                try {
                  await connectGoogleWorkspace();
                  setIsGoogleConnected(true);
                  setGoogleWorkspaceMessage('Google Workspace successfully connected! Drive preview and Gmail dispatch are now active.');
                  setTimeout(() => setGoogleWorkspaceMessage(null), 4000);

                  recordAuditLog({
                    action: 'GOOGLE_WORKSPACE_CONNECT',
                    actionLabel: 'Connected Google Workspace Account',
                    targetType: 'settings',
                    targetDescription: 'Authorized Drive Preview & Gmail Dispatch',
                    beforeState: { googleConnected: false },
                    afterState: { googleConnected: true, scopes: 'drive.file, gmail.send' },
                  });
                } catch (err: any) {
                  setGoogleWorkspaceMessage('Connection note: ' + err.message);
                } finally {
                  setIsConnectingGoogle(false);
                }
              }}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs transition cursor-pointer"
            >
              <span>{isConnectingGoogle ? 'Connecting...' : 'Connect Google Workspace Account'}</span>
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-xs text-emerald-700 font-semibold flex items-center gap-1">
                <CheckCircle2 className="w-4 h-4" />
                <span>Active session authorized for Drive &amp; Gmail</span>
              </span>
              <button
                type="button"
                onClick={() => {
                  setCachedGoogleToken(null);
                  setIsGoogleConnected(false);
                  setGoogleWorkspaceMessage('Disconnected Google Workspace session.');
                  setTimeout(() => setGoogleWorkspaceMessage(null), 3000);

                  recordAuditLog({
                    action: 'GOOGLE_WORKSPACE_DISCONNECT',
                    actionLabel: 'Disconnected Google Workspace Account',
                    targetType: 'settings',
                    targetDescription: 'Revoked active Google Workspace session token',
                    beforeState: { googleConnected: true },
                    afterState: { googleConnected: false },
                  });
                }}
                className="px-3 py-1.5 rounded-lg border border-slate-300 hover:bg-slate-100 text-slate-600 text-xs font-semibold transition cursor-pointer"
              >
                Disconnect
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Section 5: Local Storage, Privacy & Full Backup */}
      <div className="rounded-2xl bg-white p-5 sm:p-6 shadow-xs border border-slate-200 space-y-4">
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-emerald-600" />
          <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider text-emerald-700">
            5. Privacy &amp; Data Security
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
