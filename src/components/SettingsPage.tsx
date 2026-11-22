import React, { useState, useRef, useEffect } from 'react';
import {
  Settings as SettingsIcon,
  Save,
  Download,
  Upload,
  AlertTriangle,
  Printer,
  Shield,
  HardDrive,
  Lock,
  Mail,
  ShieldCheck,
  KeyRound,
  Tag,
  Calendar as CalendarIcon,
  ChevronRight,
  ArrowLeft,
  Plus,
  Trash2,
  Palette,
  Sparkles,
  Check,
  CheckCircle2,
  SlidersHorizontal,
  FileText,
  Globe,
  CalendarDays,
  RefreshCw,
  Radio,
} from 'lucide-react';
import { collection, getDocs, query, where, doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { PasswordResetModal } from './PasswordResetModal';
import {
  AppSettings,
  FirstDayOfWeek,
  FontFamily,
  HolidayCategory,
  HolidayCategoryColorKey,
  OTDisplayFormat,
  TemplateConfig,
  TimeFormat,
} from '../types';
import {
  HOLIDAY_COLOR_PALETTE,
  subscribeToHolidayCategories,
  saveHolidayCategory,
  deleteHolidayCategory,
  getHolidayColorTheme,
} from '../services/holidayCategoryService';
import {
  subscribeToCalendarSettings,
  saveCalendarSettings,
  getFirstDayOfWeekLabel,
} from '../services/calendarSettingsService';
import { saveHoliday, seedStandardHolidays } from '../services/holidayService';
import {
  getSettings,
  saveSettings,
  getEmployees,
  exportAllData,
  importAllData,
  resetAllApplicationData,
  getActiveTemplate,
} from '../utils/storage';
import { DAYS_FULL, DAYS_SHORT } from '../utils/timeCalculations';
import { subscribeToTemplates, setDefaultTemplateInFirestore } from '../services/templateService';
import { useAuth } from '../context/AuthContext';
import { recordAuditLog } from '../utils/auditLogger';
import { ConfirmationModal } from './ConfirmationModal';
import {
  hasGoogleWorkspaceToken,
  connectGoogleWorkspace,
  setCachedGoogleToken,
} from '../services/googleWorkspaceService';

import {
  APP_BUILD_INFO,
  checkForOtaUpdateNow,
  getOtaState,
  OtaState,
  publishOtaReleaseSignal,
  subscribeOtaState,
} from '../services/otaUpdateService';

import {
  getMakeWebhookDisplayInfo,
  sendTestEmailViaMake,
} from '../services/makeEmailService';

type AdminSettingsCategoryId =
  | 'defaults'
  | 'formatting'
  | 'printer'
  | 'calendar'
  | 'ota'
  | 'email_automation'
  | 'workspace'
  | 'privacy';

type UserSettingsCategoryId = 'protection' | 'security' | 'export';

type AnySettingsCategoryId = AdminSettingsCategoryId | UserSettingsCategoryId;

type CalendarSubTabId = 'all' | 'week' | 'categories' | 'holidays';

interface SettingsCategoryItem {
  id: AnySettingsCategoryId;
  title: string;
  subtitle: string;
  description: string;
  icon: React.FC<{ className?: string }>;
  iconBgClass: string;
  iconTextClass: string;
  metaText?: string;
}

export const SettingsPage: React.FC = () => {
  const { currentUser, userProfile, isAdmin, isSuperAdmin, refreshUserProfile } = useAuth();
  const [employees, setEmployees] = useState(getEmployees());
  const [settings, setSettings] = useState<AppSettings>(getSettings());
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [backupStatus, setBackupStatus] = useState<string | null>(null);
  const [templates, setTemplates] = useState<TemplateConfig[]>([getActiveTemplate()]);
  const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false);
  const [isConfirmSaveSettingsOpen, setIsConfirmSaveSettingsOpen] = useState(false);
  const [isGoogleConnected, setIsGoogleConnected] = useState(hasGoogleWorkspaceToken());
  const [isConnectingGoogle, setIsConnectingGoogle] = useState(false);
  const [googleWorkspaceMessage, setGoogleWorkspaceMessage] = useState<string | null>(null);

  // Submenu Tab Navigation State (null = Main Categories Overview; non-null = Opened Submenu Tab)
  const [activeCategory, setActiveCategory] = useState<AnySettingsCategoryId | null>(null);
  const [calendarSubTab, setCalendarSubTab] = useState<CalendarSubTabId>('all');

  // Super Admin Only: Calendar Display Settings (First Day of Week) & Holiday Categories
  const [firstDayOfWeek, setFirstDayOfWeek] = useState<FirstDayOfWeek>(
    (getSettings().firstDayOfWeek ?? 0) as FirstDayOfWeek
  );
  const [isSavingFirstDay, setIsSavingFirstDay] = useState(false);
  const [holidayCategories, setHolidayCategories] = useState<HolidayCategory[]>([]);
  const [categoryNameEdits, setCategoryNameEdits] = useState<Record<string, string>>({});
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryColor, setNewCategoryColor] = useState<HolidayCategoryColorKey>('emerald');
  const [isSavingCategory, setIsSavingCategory] = useState(false);
  const [categoryStatusMsg, setCategoryStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [categoryToDelete, setCategoryToDelete] = useState<HolidayCategory | null>(null);
  const [isDeletingCategory, setIsDeletingCategory] = useState(false);
  const [isSeedHolidaysModalOpen, setIsSeedHolidaysModalOpen] = useState(false);
  const [isSeedingHolidays, setIsSeedingHolidays] = useState(false);
  const [quickHolidayDate, setQuickHolidayDate] = useState('');
  const [quickHolidayName, setQuickHolidayName] = useState('');
  const [quickHolidayCategory, setQuickHolidayCategory] = useState('poya');
  const [isAddingQuickHoliday, setIsAddingQuickHoliday] = useState(false);

  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [personalBackupStatus, setPersonalBackupStatus] = useState<string | null>(null);

  // Super Admin Only: Live OTA Update Broadcast & Version Sync
  const [otaState, setOtaState] = useState<OtaState>(getOtaState());
  const [otaReleaseNotesInput, setOtaReleaseNotesInput] = useState('');
  const [isBroadcastingOta, setIsBroadcastingOta] = useState(false);
  const [isCheckingOta, setIsCheckingOta] = useState(false);
  const [otaFeedback, setOtaFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Automated Email (Make Webhook) Test State
  const makeWebhookInfo = getMakeWebhookDisplayInfo();
  const [testEmailRecipient, setTestEmailRecipient] = useState(
    userProfile?.email || currentUser?.email || ''
  );
  const [isSendingTestEmail, setIsSendingTestEmail] = useState(false);
  const [makeEmailFeedback, setMakeEmailFeedback] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  useEffect(() => {
    setIsGoogleConnected(hasGoogleWorkspaceToken());
  }, []);

  useEffect(() => {
    const fallbackEmail = userProfile?.email || currentUser?.email || '';
    if (!testEmailRecipient && fallbackEmail) {
      setTestEmailRecipient(fallbackEmail);
    }
  }, [userProfile?.email, currentUser?.email, testEmailRecipient]);

  useEffect(() => {
    return subscribeOtaState(setOtaState);
  }, []);

  // Reset active category if role changes and an unavailable category was open
  useEffect(() => {
    if (!isAdmin && activeCategory && !['protection', 'security', 'export'].includes(activeCategory)) {
      setActiveCategory(null);
    } else if (isAdmin && !isSuperAdmin && (activeCategory === 'calendar' || activeCategory === 'ota')) {
      setActiveCategory(null);
    }
  }, [isAdmin, isSuperAdmin, activeCategory]);

  // Subscribe to Calendar Settings (First Day of Week) & Holiday Categories for Super Admin
  useEffect(() => {
    if (!isSuperAdmin) return;
    const unsubCal = subscribeToCalendarSettings((cfg) => {
      setFirstDayOfWeek(cfg.firstDayOfWeek);
      setSettings((prev) => ({ ...prev, firstDayOfWeek: cfg.firstDayOfWeek }));
    });
    const unsubCats = subscribeToHolidayCategories((cats) => {
      setHolidayCategories(cats);
      setCategoryNameEdits((prev) => {
        const next: Record<string, string> = {};
        cats.forEach((c) => {
          next[c.id] = prev[c.id] !== undefined ? prev[c.id] : c.name;
        });
        return next;
      });
      if (cats.length > 0 && !cats.some((c) => c.id === quickHolidayCategory)) {
        setQuickHolidayCategory(cats[0].id);
      }
    });
    return () => {
      unsubCal();
      unsubCats();
    };
  }, [isSuperAdmin]);

  useEffect(() => {
    if (!isAdmin) return;
    getDocs(collection(db, 'users'))
      .then((snap) => {
        const list = snap.docs.map((d) => {
          const data = d.data() as any;
          return {
            id: data.id || d.id,
            name: data.name || 'Staff Member',
            employeeNumber: data.employeeNumber || data.pfNumber || '',
            designation: data.designation || '',
            branch: data.branch || '',
            department: data.department || '',
            createdAt: data.createdAt || '',
          };
        });
        if (list.length > 0) {
          list.sort((a, b) => a.name.localeCompare(b.name));
          setEmployees(list);
        }
      })
      .catch(() => {});
  }, [isAdmin]);

  useEffect(() => {
    const unsub = subscribeToTemplates((list) => {
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

    const targetUid = userProfile?.id || currentUser?.uid;
    if (targetUid) {
      updateDoc(doc(db, 'users', targetUid), {
        defaultWeekdayReason: settings.defaultWeekdayReason || '',
        defaultSaturdayReason: settings.defaultSaturdayReason || 'Saturday Duty',
        defaultHolidayReason: settings.defaultHolidayReason || '',
        updatedAt: new Date().toISOString(),
      }).catch((err) => console.warn('Could not update user profile in Firestore:', err));
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

  const showCategoryFeedback = (type: 'success' | 'error', text: string) => {
    setCategoryStatusMsg({ type, text });
    setTimeout(() => setCategoryStatusMsg(null), 3500);
  };

  const handleChangeFirstDayOfWeek = async (dayIdx: FirstDayOfWeek) => {
    if (!isSuperAdmin || isSavingFirstDay || dayIdx === firstDayOfWeek) return;
    const prevDay = firstDayOfWeek;
    setIsSavingFirstDay(true);
    setFirstDayOfWeek(dayIdx);
    const updatedLocal = { ...settings, firstDayOfWeek: dayIdx };
    setSettings(updatedLocal);
    saveSettings(updatedLocal);

    try {
      await saveCalendarSettings({ firstDayOfWeek: dayIdx });
      recordAuditLog({
        action: 'CALENDAR_SETTINGS_UPDATE',
        actionLabel: 'Updated Integrated Calendar First Day of Week',
        targetType: 'settings',
        targetId: 'calendar_global',
        targetDescription: `${getFirstDayOfWeekLabel(prevDay)} -> ${getFirstDayOfWeekLabel(dayIdx)}`,
        beforeState: { firstDayOfWeek: getFirstDayOfWeekLabel(prevDay) },
        afterState: { firstDayOfWeek: getFirstDayOfWeekLabel(dayIdx) },
      });
      showCategoryFeedback(
        'success',
        `Calendar week now starts on ${getFirstDayOfWeekLabel(dayIdx)}.`
      );
    } catch (err: any) {
      setFirstDayOfWeek(prevDay);
      showCategoryFeedback('error', err.message || 'Failed to update first day of week.');
    } finally {
      setIsSavingFirstDay(false);
    }
  };

  const handleUpdateCategoryColor = async (cat: HolidayCategory, colorKey: HolidayCategoryColorKey) => {
    if (!isSuperAdmin || isSavingCategory) return;
    setIsSavingCategory(true);
    try {
      const updated = await saveHolidayCategory({
        ...cat,
        name: (categoryNameEdits[cat.id] ?? cat.name).trim() || cat.name,
        color: colorKey,
      });
      recordAuditLog({
        action: 'HOLIDAY_CATEGORY_UPDATE',
        actionLabel: 'Updated Holiday Category Color',
        targetType: 'holiday',
        targetId: updated.id,
        targetDescription: `${updated.name} -> ${colorKey}`,
        beforeState: { name: cat.name, color: cat.color },
        afterState: { name: updated.name, color: updated.color },
      });
      showCategoryFeedback('success', `Updated "${updated.name}" color.`);
    } catch (err: any) {
      showCategoryFeedback('error', err.message || 'Failed to update holiday category color.');
    } finally {
      setIsSavingCategory(false);
    }
  };

  const handleSaveCategoryName = async (cat: HolidayCategory) => {
    if (!isSuperAdmin || isSavingCategory) return;
    const trimmed = (categoryNameEdits[cat.id] ?? '').trim();
    if (!trimmed) {
      showCategoryFeedback('error', 'Category name cannot be empty.');
      return;
    }
    if (trimmed === cat.name) return;

    setIsSavingCategory(true);
    try {
      const updated = await saveHolidayCategory({
        ...cat,
        name: trimmed,
        shortName: trimmed,
      });
      recordAuditLog({
        action: 'HOLIDAY_CATEGORY_UPDATE',
        actionLabel: 'Renamed Holiday Category',
        targetType: 'holiday',
        targetId: updated.id,
        targetDescription: `${cat.name} -> ${updated.name}`,
        beforeState: { name: cat.name },
        afterState: { name: updated.name },
      });
      showCategoryFeedback('success', `Category renamed to "${updated.name}".`);
    } catch (err: any) {
      showCategoryFeedback('error', err.message || 'Failed to rename holiday category.');
    } finally {
      setIsSavingCategory(false);
    }
  };

  const handleAddHolidayCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isSuperAdmin || isSavingCategory) return;
    const cleanName = newCategoryName.trim();
    if (!cleanName) {
      showCategoryFeedback('error', 'Please enter a holiday category name.');
      return;
    }
    if (holidayCategories.some((c) => c.name.toLowerCase() === cleanName.toLowerCase())) {
      showCategoryFeedback('error', `Category "${cleanName}" already exists.`);
      return;
    }

    setIsSavingCategory(true);
    try {
      const maxOrder = holidayCategories.reduce((m, c) => Math.max(m, c.order || 0), 4);
      const created = await saveHolidayCategory({
        name: cleanName,
        shortName: cleanName,
        color: newCategoryColor,
        isDefault: false,
        order: maxOrder + 1,
      });
      recordAuditLog({
        action: 'HOLIDAY_CATEGORY_CREATE',
        actionLabel: 'Added Custom Holiday Category',
        targetType: 'holiday',
        targetId: created.id,
        targetDescription: `${created.name} (${created.color})`,
        afterState: created,
      });
      setNewCategoryName('');
      showCategoryFeedback('success', `Added new holiday category "${created.name}".`);
    } catch (err: any) {
      showCategoryFeedback('error', err.message || 'Failed to add holiday category.');
    } finally {
      setIsSavingCategory(false);
    }
  };

  const handleConfirmDeleteCategory = async () => {
    if (!isSuperAdmin || !categoryToDelete || isDeletingCategory) return;
    setIsDeletingCategory(true);
    try {
      await deleteHolidayCategory(categoryToDelete.id);
      recordAuditLog({
        action: 'HOLIDAY_CATEGORY_DELETE',
        actionLabel: 'Deleted Custom Holiday Category',
        targetType: 'holiday',
        targetId: categoryToDelete.id,
        targetDescription: categoryToDelete.name,
        beforeState: categoryToDelete,
      });
      setCategoryToDelete(null);
      showCategoryFeedback('success', `Deleted category "${categoryToDelete.name}".`);
    } catch (err: any) {
      showCategoryFeedback('error', err.message || 'Failed to delete holiday category.');
    } finally {
      setIsDeletingCategory(false);
    }
  };

  const handleConfirmSeedHolidays = async () => {
    if (!isSuperAdmin || isSeedingHolidays) return;
    setIsSeedingHolidays(true);
    try {
      const count = await seedStandardHolidays();
      recordAuditLog({
        action: 'HOLIDAY_IMPORT',
        actionLabel: 'Imported Sri Lanka Standard 2026 Holidays',
        targetType: 'holiday',
        targetDescription: `Imported ${count} public & bank holidays`,
        details: { count },
      });
      setIsSeedHolidaysModalOpen(false);
      showCategoryFeedback('success', `Imported ${count} standard holidays into Integrated Calendar.`);
    } catch (err: any) {
      showCategoryFeedback('error', err.message || 'Failed to import standard holidays.');
    } finally {
      setIsSeedingHolidays(false);
    }
  };

  const handleQuickAddHoliday = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isSuperAdmin || isAddingQuickHoliday) return;
    if (!quickHolidayDate || !quickHolidayName.trim()) {
      showCategoryFeedback('error', 'Please enter both holiday date and name.');
      return;
    }

    setIsAddingQuickHoliday(true);
    try {
      const saved = await saveHoliday({
        date: quickHolidayDate,
        name: quickHolidayName.trim(),
        type: quickHolidayCategory,
      });
      recordAuditLog({
        action: 'HOLIDAY_ADD',
        actionLabel: 'Added Calendar Holiday via Calendar Settings',
        targetType: 'holiday',
        targetId: saved.id,
        targetDescription: `${saved.name} (${saved.date})`,
        afterState: saved,
      });
      setQuickHolidayName('');
      setQuickHolidayDate('');
      showCategoryFeedback('success', `Added "${saved.name}" (${saved.date}) to Integrated Calendar.`);
    } catch (err: any) {
      showCategoryFeedback('error', err.message || 'Failed to add holiday.');
    } finally {
      setIsAddingQuickHoliday(false);
    }
  };

  const handleExportMyPersonalData = async () => {
    try {
      const myUid = currentUser?.uid;
      const myPf = (userProfile?.employeeNumber || userProfile?.pfNumber || '').toUpperCase().trim();

      const myClaims: any[] = [];
      if (myUid) {
        const snap = await getDocs(query(collection(db, 'claims'), where('userId', '==', myUid)));
        snap.forEach((d) => myClaims.push(d.data()));
      }
      if (myPf) {
        const snapPf = await getDocs(query(collection(db, 'claims'), where('employeeNumber', '==', myPf)));
        snapPf.forEach((d) => {
          const c = d.data();
          if (!myClaims.some((existing) => existing.id === c.id)) {
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
      a.download = `My_Personal_Claims_${myPf || 'Personal'}_${new Date().toISOString().split('T')[0]}.json`;
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

  const adminCategories: SettingsCategoryItem[] = [
    {
      id: 'defaults',
      title: 'Form Defaults',
      subtitle: 'Employee, Template & Reasons',
      description:
        'Configure default claimant profiles, branch, font family, cloud template, and weekday/weekend overtime reasons.',
      icon: SlidersHorizontal,
      iconBgClass: 'bg-indigo-50',
      iconTextClass: 'text-indigo-600',
      metaText: `${settings.defaultBranch || 'Headquarters'} · ${settings.defaultFont}`,
    },
    {
      id: 'formatting',
      title: 'Formatting & Output',
      subtitle: 'Time Rules & File Naming',
      description:
        'Choose 24-hour vs 12-hour input style, overtime duration display units, and automatic PDF export naming.',
      icon: FileText,
      iconBgClass: 'bg-sky-50',
      iconTextClass: 'text-sky-600',
      metaText: `${settings.timeFormat === '24h' ? '24-Hour' : '12-Hour'} · ${
        settings.otDisplayFormat === 'hhmm' ? 'HH:MM' : 'Decimal'
      }`,
    },
    {
      id: 'printer',
      title: 'Printer Calibration',
      subtitle: 'Global A4 Coordinate Offsets',
      description:
        'Adjust physical millimeter X and Y alignment offsets applied globally across all printed overtime sheets.',
      icon: Printer,
      iconBgClass: 'bg-violet-50',
      iconTextClass: 'text-violet-600',
      metaText: `X ${settings.globalPrinterOffsetX} mm · Y ${settings.globalPrinterOffsetY} mm`,
    },
    ...(isSuperAdmin
      ? [
          {
            id: 'calendar' as const,
            title: 'Calendar Settings',
            subtitle: 'Week Start, Categories & Holidays',
            description:
              'Set the first day of week, customize holiday category colors, add custom types, and import annual holidays.',
            icon: CalendarIcon,
            iconBgClass: 'bg-amber-50',
            iconTextClass: 'text-amber-600',
            metaText: `Super Admin · Starts ${getFirstDayOfWeekLabel(firstDayOfWeek)}`,
          },
          {
            id: 'ota' as const,
            title: 'Live OTA Updates',
            subtitle: 'Vercel & Firebase Instant Sync',
            description:
              'Inspect deployed build version, check CDN readiness, and broadcast live updates to all open browser tabs.',
            icon: Radio,
            iconBgClass: 'bg-rose-50',
            iconTextClass: 'text-rose-600',
            metaText: `Build ${APP_BUILD_INFO.commitSha} · Real-time Push`,
          },
        ]
      : []),
    {
      id: 'email_automation',
      title: 'Automated Email (Make)',
      subtitle: 'Webhook Delivery Without Gmail',
      description:
        'Automated delivery for broadcast notifications, welcome credentials, and password updates via Make.',
      icon: Mail,
      iconBgClass: 'bg-indigo-50',
      iconTextClass: 'text-indigo-600',
      metaText: `Connected · ${makeWebhookInfo.host}`,
    },
    {
      id: 'workspace',
      title: 'Google Drive Preview',
      subtitle: 'Interactive PDF Cloud Viewer',
      description:
        'Connect Google Workspace Drive access for interactive in-site A4 claim PDF report previews.',
      icon: Globe,
      iconBgClass: 'bg-blue-50',
      iconTextClass: 'text-blue-600',
      metaText: isGoogleConnected ? 'Connected · Drive preview active' : 'Not Connected',
    },
    {
      id: 'privacy',
      title: 'Privacy & Data Security',
      subtitle: 'Backup, Restore & Reset',
      description:
        'Export system JSON backups, restore saved snapshots, or execute a full local storage reset.',
      icon: Shield,
      iconBgClass: 'bg-emerald-50',
      iconTextClass: 'text-emerald-600',
      metaText: 'Cloud Firestore · Encrypted Local Cache',
    },
  ];

  const userCategories: SettingsCategoryItem[] = [
    {
      id: 'protection',
      title: 'Personal Data Protection',
      subtitle: 'Identity & Access Isolation',
      description:
        'Review your verified PF details, branch assignment, and strict personal claim isolation policies.',
      icon: ShieldCheck,
      iconBgClass: 'bg-emerald-50',
      iconTextClass: 'text-emerald-600',
      metaText: `${userProfile?.employeeNumber || userProfile?.pfNumber || 'Staff'} · ${
        userProfile?.branch || 'Head Office'
      }`,
    },
    {
      id: 'security',
      title: 'Account Security & Password',
      subtitle: 'Login Password Management',
      description:
        'Keep your overtime claim account secure by updating your personal sign-in password.',
      icon: KeyRound,
      iconBgClass: 'bg-indigo-50',
      iconTextClass: 'text-indigo-600',
      metaText: 'Account Credentials',
    },
    {
      id: 'export',
      title: 'My Personal Data Export',
      subtitle: 'Download Personal Records',
      description:
        'Export a private JSON archive containing exclusively your personal overtime claims and profile.',
      icon: HardDrive,
      iconBgClass: 'bg-blue-50',
      iconTextClass: 'text-blue-600',
      metaText: 'JSON Personal Archive',
    },
  ];

  const availableCategories = isAdmin ? adminCategories : userCategories;
  const activeCategoryMeta =
    availableCategories.find((c) => c.id === activeCategory) || null;

  const openCategoryTab = (categoryId: AnySettingsCategoryId) => {
    setActiveCategory(categoryId);
    if (categoryId === 'calendar') {
      setCalendarSubTab('all');
    }
  };

  // Live preview week column order for Calendar Settings -> First Day of Week
  const weekPreviewColumns = Array.from({ length: 7 }, (_, i) => {
    const idx = (firstDayOfWeek + i) % 7;
    return {
      idx,
      short: DAYS_SHORT[idx],
      isSunday: idx === 0,
      isSaturday: idx === 6,
    };
  });

  // Render Top Header & Submenu Tab Bar when a category is opened
  const renderSettingsHeader = () => (
    <div className="rounded-2xl bg-white p-4 sm:p-6 shadow-xs border border-slate-200 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          {activeCategoryMeta ? (
            <button
              type="button"
              onClick={() => setActiveCategory(null)}
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 transition cursor-pointer shrink-0"
              title="Back to All Settings"
              aria-label="Back to All Settings"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          ) : (
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 shrink-0">
              {isAdmin ? <SettingsIcon className="w-5 h-5" /> : <Shield className="w-5 h-5" />}
            </div>
          )}

          <div className="min-w-0">
            {activeCategoryMeta ? (
              <>
                <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500">
                  <button
                    type="button"
                    onClick={() => setActiveCategory(null)}
                    className="hover:text-indigo-600 transition cursor-pointer"
                  >
                    Settings
                  </button>
                  <span aria-hidden="true">/</span>
                  <span className="text-indigo-700 truncate">{activeCategoryMeta.title}</span>
                </div>
                <h1 className="text-lg sm:text-2xl font-bold text-slate-900 tracking-tight truncate">
                  {activeCategoryMeta.title}
                </h1>
              </>
            ) : (
              <>
                <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
                  {isAdmin ? 'Application Settings' : 'Privacy & Data Security'}
                </h1>
                <p className="text-xs sm:text-sm text-slate-500">
                  {isAdmin
                    ? 'Select a settings category below to open its submenu configuration tab.'
                    : 'Select a category below to manage your account protection, password, and data export.'}
                </p>
              </>
            )}
          </div>
        </div>

        {activeCategoryMeta && (
          <button
            type="button"
            onClick={() => setActiveCategory(null)}
            className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-semibold transition cursor-pointer whitespace-nowrap shrink-0 self-start sm:self-auto"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>All Categories</span>
          </button>
        )}
      </div>

      {/* Submenu Category Tab Strip when inside any opened Category Tab */}
      {activeCategoryMeta && (
        <nav
          aria-label="Settings categories submenu"
          className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pt-2 border-t border-slate-100"
        >
          {availableCategories.map((cat) => {
            const Icon = cat.icon;
            const isActive = cat.id === activeCategory;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => openCategoryTab(cat.id)}
                className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition whitespace-nowrap shrink-0 cursor-pointer min-h-[40px] ${
                  isActive
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'bg-slate-50 text-slate-600 hover:bg-slate-100 hover:text-slate-900 border border-slate-200/80'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 shrink-0 ${isActive ? 'text-white' : cat.iconTextClass}`} />
                <span>{cat.title}</span>
              </button>
            );
          })}
        </nav>
      )}

      {saveSuccess && (
        <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center gap-2 text-xs text-emerald-800 animate-fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>Settings saved successfully!</span>
        </div>
      )}
    </div>
  );

  // Main Settings Menu Hub (clicking any main category opens its submenu in a separate tab view)
  const renderCategoriesHub = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 animate-fade-in">
      {availableCategories.map((cat) => {
        const Icon = cat.icon;
        return (
          <button
            key={cat.id}
            type="button"
            onClick={() => openCategoryTab(cat.id)}
            className="group text-left rounded-2xl bg-white p-5 sm:p-6 border border-slate-200 hover:border-indigo-300 hover:shadow-sm transition flex flex-col justify-between gap-4 cursor-pointer focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
          >
            <div className="space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div
                  className={`flex h-11 w-11 items-center justify-center rounded-xl shrink-0 ${cat.iconBgClass} ${cat.iconTextClass}`}
                >
                  <Icon className="w-5 h-5" />
                </div>
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-400 group-hover:text-indigo-600 transition shrink-0 pt-1">
                  <span>Open</span>
                  <ChevronRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
                </span>
              </div>

              <div>
                <h2 className="text-base font-bold text-slate-900 group-hover:text-indigo-700 transition">
                  {cat.title}
                </h2>
                <p className="text-xs font-medium text-slate-500 mt-0.5">{cat.subtitle}</p>
              </div>

              <p className="text-xs text-slate-600 leading-relaxed">{cat.description}</p>
            </div>

            {cat.metaText && (
              <div className="pt-3 border-t border-slate-100 text-[11px] font-medium text-slate-500 truncate tabular-nums">
                {cat.metaText}
              </div>
            )}
          </button>
        );
      })}
    </div>
  );

  // Regular User View
  if (!isAdmin) {
    return (
      <div className="space-y-4 sm:space-y-6 pb-8 w-full max-w-6xl mx-auto">
        {renderSettingsHeader()}

        {activeCategory === null && renderCategoriesHub()}

        {activeCategory === 'protection' && (
          <div className="rounded-2xl bg-white p-5 sm:p-6 shadow-xs border border-slate-200 space-y-4 animate-fade-in">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-emerald-600" />
              <h2 className="text-sm font-bold text-emerald-700 uppercase tracking-wider">
                Personal Data Protection &amp; Access Isolation
              </h2>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              In compliance with corporate data protection standards, all timesheet submissions and overtime calculations are strictly private to your account.{' '}
              <strong>Regular staff members cannot access, view, or search other employees&apos; claims or records.</strong>
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
                <span className="font-bold text-indigo-700 font-mono tabular-nums">
                  {userProfile?.employeeNumber || userProfile?.pfNumber || 'PF Number'}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] font-bold uppercase tracking-wider">
                  Designation &amp; Department
                </span>
                <span className="font-semibold text-slate-700">
                  {userProfile?.designation || 'Staff Member'} &middot; {userProfile?.department || 'Operations'}
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
        )}

        {activeCategory === 'security' && (
          <div className="rounded-2xl bg-white p-5 sm:p-6 shadow-xs border border-slate-200 space-y-4 animate-fade-in">
            <div className="flex items-center gap-2">
              <KeyRound className="w-5 h-5 text-indigo-600" />
              <h2 className="text-sm font-bold text-indigo-700 uppercase tracking-wider">
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
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-xs transition cursor-pointer shrink-0 whitespace-nowrap"
              >
                <KeyRound className="w-3.5 h-3.5" />
                <span>Change Password</span>
              </button>
            </div>
          </div>
        )}

        {activeCategory === 'export' && (
          <div className="rounded-2xl bg-white p-5 sm:p-6 shadow-xs border border-slate-200 space-y-4 animate-fade-in">
            <div className="flex items-center gap-2">
              <HardDrive className="w-5 h-5 text-blue-600" />
              <h2 className="text-sm font-bold text-blue-700 uppercase tracking-wider">
                My Personal Data Export
              </h2>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Download an encrypted JSON export of your personal claim submissions and user particulars.{' '}
              <strong>This export contains strictly your personal data and no other staff records.</strong>
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
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs transition shrink-0 cursor-pointer whitespace-nowrap"
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
        )}

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

  // Admin & Super Admin View
  return (
    <div className="space-y-4 sm:space-y-6 pb-8 w-full max-w-6xl mx-auto">
      {renderSettingsHeader()}

      {/* Main Categories Hub */}
      {activeCategory === null && renderCategoriesHub()}

      {/* Submenu Tab 1: Form Defaults */}
      {activeCategory === 'defaults' && (
        <form onSubmit={handleSave} className="space-y-5 animate-fade-in">
          <div className="rounded-2xl bg-white p-5 sm:p-6 shadow-xs border border-slate-200 space-y-5">
            <div className="pb-3 border-b border-slate-100">
              <h2 className="text-sm font-bold text-indigo-700 uppercase tracking-wider">
                Claim &amp; Staff Defaults
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Standard claimant, branch, PDF typography, and organization form template preferences.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Default Claimant Employee
                </label>
                <select
                  value={settings.defaultEmployeeId || ''}
                  onChange={(e) =>
                    setSettings({ ...settings, defaultEmployeeId: e.target.value || undefined })
                  }
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                >
                  <option value="">-- None (Choose per claim) --</option>
                  {employees.map((emp) => (
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
                  onChange={(e) => setSettings({ ...settings, defaultDepartment: e.target.value })}
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
                  onChange={(e) => setSettings({ ...settings, defaultBranch: e.target.value })}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Default PDF Font Family
                </label>
                <select
                  value={settings.defaultFont}
                  onChange={(e) =>
                    setSettings({ ...settings, defaultFont: e.target.value as FontFamily })
                  }
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
                    onChange={(e) => {
                      const newId = e.target.value;
                      setSettings({ ...settings, activeTemplateId: newId });
                      if (newId) setDefaultTemplateInFirestore(newId).catch(console.error);
                    }}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-slate-800 font-medium focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  >
                    {templates.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} {t.isDefault ? '★ (Organization Default)' : ''}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-100 border border-slate-200 text-slate-700 font-semibold text-xs">
                    <div className="flex items-center gap-2">
                      <Lock className="w-3.5 h-3.5 text-slate-400" />
                      <span>
                        {templates.find((t) => t.id === settings.activeTemplateId)?.name ||
                          'Standard Official Form'}
                      </span>
                    </div>
                    <span className="text-[11px] text-indigo-700 font-semibold">Admin Managed</span>
                  </div>
                )}
                <p className="text-[11px] text-slate-500 mt-1">
                  Selected template loads by default across claim forms. Configure layouts in the Template Designer tab.
                </p>
              </div>
            </div>

            {/* Sub-section: Default Overtime Reasons */}
            <div className="pt-4 border-t border-slate-100 space-y-3">
              <div className="flex items-center gap-2">
                <Tag className="w-4 h-4 text-indigo-600" />
                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                  Default Overtime Reasons
                </h3>
              </div>
              <p className="text-[11px] text-slate-500">
                Automatically populated when creating claims, auto-filling full months, or adding timesheet rows.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 text-xs">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1 text-[11px]">
                    Weekdays (Mon - Fri) Reason
                  </label>
                  <input
                    type="text"
                    value={settings.defaultWeekdayReason || ''}
                    onChange={(e) =>
                      setSettings({ ...settings, defaultWeekdayReason: e.target.value })
                    }
                    placeholder="e.g. Regular Overtime"
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-slate-800 text-xs focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  />
                  <span className="text-[10px] text-slate-400 mt-0.5 block">
                    Applied to standard weekdays.
                  </span>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1 text-[11px]">
                    Saturdays Reason
                  </label>
                  <input
                    type="text"
                    value={settings.defaultSaturdayReason ?? 'Saturday Duty'}
                    onChange={(e) =>
                      setSettings({ ...settings, defaultSaturdayReason: e.target.value })
                    }
                    placeholder="e.g. Saturday Duty"
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-slate-800 text-xs focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  />
                  <span className="text-[10px] text-slate-400 mt-0.5 block">
                    Applied to all Saturday duties.
                  </span>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1 text-[11px]">
                    Other Holidays &amp; Sundays Reason
                  </label>
                  <input
                    type="text"
                    value={settings.defaultHolidayReason || ''}
                    onChange={(e) =>
                      setSettings({ ...settings, defaultHolidayReason: e.target.value })
                    }
                    placeholder="e.g. Holiday Duty (or blank for Name)"
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-slate-800 text-xs focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  />
                  <span className="text-[10px] text-slate-400 mt-0.5 block">
                    Leave blank to use official Holiday name.
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-xs transition cursor-pointer whitespace-nowrap"
            >
              <Save className="w-4 h-4" />
              <span>Save Form Defaults</span>
            </button>
          </div>
        </form>
      )}

      {/* Submenu Tab 2: Formatting & Output */}
      {activeCategory === 'formatting' && (
        <form onSubmit={handleSave} className="space-y-5 animate-fade-in">
          <div className="rounded-2xl bg-white p-5 sm:p-6 shadow-xs border border-slate-200 space-y-4">
            <div className="pb-3 border-b border-slate-100">
              <h2 className="text-sm font-bold text-indigo-700 uppercase tracking-wider">
                Formatting &amp; PDF Output Rules
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Control time input notation, duration rounding display, and generated filename templates.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Time Input Format
                </label>
                <select
                  value={settings.timeFormat}
                  onChange={(e) =>
                    setSettings({ ...settings, timeFormat: e.target.value as TimeFormat })
                  }
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
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      otDisplayFormat: e.target.value as OTDisplayFormat,
                    })
                  }
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
                  onChange={(e) =>
                    setSettings({ ...settings, pdfFilenamePattern: e.target.value })
                  }
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-slate-800 font-mono"
                />
                <span className="block text-[11px] text-slate-400 mt-1">
                  Available tags: [EmployeeName], [Month], [Year]. Example: Overtime_Claim_[EmployeeName]_[Month]_[Year].pdf
                </span>
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-xs transition cursor-pointer whitespace-nowrap"
            >
              <Save className="w-4 h-4" />
              <span>Save Formatting Settings</span>
            </button>
          </div>
        </form>
      )}

      {/* Submenu Tab 3: Printer Calibration */}
      {activeCategory === 'printer' && (
        <form onSubmit={handleSave} className="space-y-5 animate-fade-in">
          <div className="rounded-2xl bg-white p-5 sm:p-6 shadow-xs border border-slate-200 space-y-4">
            <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
              <Printer className="w-4 h-4 text-indigo-600" />
              <h2 className="text-sm font-bold text-indigo-700 uppercase tracking-wider">
                Global Hardware Printer Calibration
              </h2>
            </div>
            <p className="text-xs text-slate-500">
              Offsets configured here are globally added to all PDF coordinates during generation to correct for physical paper feed shifting on your office printer.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                <label className="block font-semibold text-slate-700 mb-1.5">
                  Global Horizontal Offset (X mm)
                </label>
                <input
                  type="number"
                  step="0.5"
                  value={settings.globalPrinterOffsetX}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      globalPrinterOffsetX: parseFloat(e.target.value) || 0,
                    })
                  }
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono tabular-nums text-center bg-white"
                />
                <span className="block text-[10px] text-slate-400 mt-1.5">
                  Shift right (+) or left (-) across the A4 page.
                </span>
              </div>

              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                <label className="block font-semibold text-slate-700 mb-1.5">
                  Global Vertical Offset (Y mm)
                </label>
                <input
                  type="number"
                  step="0.5"
                  value={settings.globalPrinterOffsetY}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      globalPrinterOffsetY: parseFloat(e.target.value) || 0,
                    })
                  }
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono tabular-nums text-center bg-white"
                />
                <span className="block text-[10px] text-slate-400 mt-1.5">
                  Shift down (+) or up (-) down the A4 page.
                </span>
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-xs transition cursor-pointer whitespace-nowrap"
            >
              <Save className="w-4 h-4" />
              <span>Save Printer Offsets</span>
            </button>
          </div>
        </form>
      )}

      {/* Submenu Tab 4: Calendar Settings (Super Admin Only — dedicated tab view, no dropdown!) */}
      {activeCategory === 'calendar' && isSuperAdmin && (
        <div className="space-y-5 animate-fade-in">
          {/* Calendar Submenu Filter Tabs */}
          <div className="rounded-2xl bg-white p-4 sm:p-5 shadow-xs border border-slate-200 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-bold text-slate-900">
                  Integrated Calendar Configuration
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Super Admin Only &middot; Configure week start order, holiday category colors, and calendar entries.
                </p>
              </div>
              <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100 overflow-x-auto no-scrollbar shrink-0">
                {[
                  { id: 'all', label: 'All Sections' },
                  { id: 'week', label: 'First Day of Week' },
                  { id: 'categories', label: 'Categories & Colors' },
                  { id: 'holidays', label: 'Holidays & Import' },
                ].map((sub) => (
                  <button
                    key={sub.id}
                    type="button"
                    onClick={() => setCalendarSubTab(sub.id as CalendarSubTabId)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition whitespace-nowrap shrink-0 cursor-pointer ${
                      calendarSubTab === sub.id
                        ? 'bg-white text-slate-900 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {sub.label}
                  </button>
                ))}
              </div>
            </div>

            {categoryStatusMsg && (
              <div
                className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${
                  categoryStatusMsg.type === 'success'
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                    : 'bg-rose-50 border-rose-200 text-rose-800'
                }`}
              >
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span className="font-medium">{categoryStatusMsg.text}</span>
              </div>
            )}
          </div>

          {/* Sub-Panel A: First Day of Week Setting */}
          {(calendarSubTab === 'all' || calendarSubTab === 'week') && (
            <div className="rounded-2xl bg-white p-5 sm:p-6 shadow-xs border border-slate-200 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <CalendarDays className="w-4 h-4 text-indigo-600" />
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900">
                    First Day of Week
                  </h3>
                </div>
                <span className="text-xs font-semibold text-indigo-700">
                  Active Start Day: {getFirstDayOfWeekLabel(firstDayOfWeek)}
                </span>
              </div>

              <p className="text-xs text-slate-600">
                Select which day begins each week row across the Integrated Calendar grid for all users. Saturday remains tinted soft grey and Sunday remains tinted soft red in any column position.
              </p>

              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
                {DAYS_FULL.map((dayName, idx) => {
                  const dayIndex = idx as FirstDayOfWeek;
                  const isSelected = firstDayOfWeek === dayIndex;
                  const isSunday = dayIndex === 0;
                  const isSaturday = dayIndex === 6;

                  return (
                    <button
                      key={dayName}
                      type="button"
                      disabled={isSavingFirstDay}
                      onClick={() => handleChangeFirstDayOfWeek(dayIndex)}
                      className={`px-3 py-2.5 rounded-xl border text-xs font-bold transition cursor-pointer flex items-center justify-center gap-1.5 min-h-[42px] disabled:opacity-60 ${
                        isSelected
                          ? 'bg-indigo-600 border-indigo-600 text-white shadow-xs'
                          : isSunday
                          ? 'bg-rose-50/70 border-rose-200 text-rose-700 hover:bg-rose-100/70'
                          : isSaturday
                          ? 'bg-slate-100 border-slate-200 text-slate-700 hover:bg-slate-200/70'
                          : 'bg-white border-slate-200 text-slate-700 hover:border-indigo-300 hover:bg-slate-50'
                      }`}
                    >
                      {isSelected && <Check className="w-3.5 h-3.5 shrink-0" />}
                      <span>{dayName}</span>
                    </button>
                  );
                })}
              </div>

              {/* Live Week Column Preview */}
              <div className="pt-2">
                <span className="block text-[11px] font-semibold text-slate-500 mb-2">
                  Calendar Column Order Preview
                </span>
                <div className="grid grid-cols-7 gap-1.5 text-center">
                  {weekPreviewColumns.map((col) => (
                    <div
                      key={col.short}
                      className={`py-2 rounded-lg text-[11px] font-bold uppercase tracking-wider border ${
                        col.isSunday
                          ? 'bg-rose-50 text-rose-700 border-rose-200'
                          : col.isSaturday
                          ? 'bg-slate-100 text-slate-700 border-slate-200'
                          : 'bg-white text-slate-600 border-slate-200'
                      }`}
                    >
                      {col.short}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Sub-Panel B: Holiday Categories & Date Colors */}
          {(calendarSubTab === 'all' || calendarSubTab === 'categories') && (
            <div className="rounded-2xl bg-white p-5 sm:p-6 shadow-xs border border-slate-200 space-y-5">
              <div className="space-y-3">
                <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
                  <Palette className="w-4 h-4 text-indigo-600" />
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900">
                    Holiday Categories &amp; Date Colors
                  </h3>
                </div>
                <p className="text-xs text-slate-500">
                  Changes made here update both the Integrated Calendar key marquee and holiday date circles immediately.
                </p>

                <div className="space-y-3">
                  {holidayCategories.map((cat) => {
                    const theme = getHolidayColorTheme(cat.color);
                    const draftName = categoryNameEdits[cat.id] ?? cat.name;
                    const hasNameChanged = draftName.trim() !== '' && draftName.trim() !== cat.name;

                    return (
                      <div
                        key={cat.id}
                        className="p-3.5 sm:p-4 rounded-xl border border-slate-200 bg-slate-50/60 flex flex-col gap-3"
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                          <div className="flex items-center gap-2.5 flex-1 min-w-0">
                            <span
                              className={`w-4 h-4 rounded-full shrink-0 ${theme.swatchClass}`}
                              title={theme.label}
                            />
                            <input
                              type="text"
                              value={draftName}
                              onChange={(e) =>
                                setCategoryNameEdits((prev) => ({
                                  ...prev,
                                  [cat.id]: e.target.value,
                                }))
                              }
                              aria-label={`Category name for ${cat.name}`}
                              className="flex-1 min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-900 focus:border-indigo-500 focus:outline-hidden"
                            />
                            {hasNameChanged && (
                              <button
                                type="button"
                                disabled={isSavingCategory}
                                onClick={() => handleSaveCategoryName(cat)}
                                className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold transition cursor-pointer shrink-0 disabled:opacity-60"
                              >
                                Save
                              </button>
                            )}
                          </div>

                          <div className="flex items-center justify-between sm:justify-end gap-2.5">
                            <div className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600">
                              <span>Preview:</span>
                              <span
                                className={`w-7 h-7 rounded-full inline-flex items-center justify-center text-white text-xs font-extrabold tabular-nums ${theme.swatchClass}`}
                              >
                                25
                              </span>
                            </div>
                            {!cat.isDefault && (
                              <button
                                type="button"
                                onClick={() => setCategoryToDelete(cat)}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                                title={`Delete ${cat.name}`}
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[11px] font-semibold text-slate-500 mr-1">
                            Color:
                          </span>
                          {HOLIDAY_COLOR_PALETTE.map((option) => {
                            const isSelected = cat.color === option.key;
                            return (
                              <button
                                key={option.key}
                                type="button"
                                disabled={isSavingCategory}
                                onClick={() => handleUpdateCategoryColor(cat, option.key)}
                                title={option.label}
                                aria-label={`Set ${cat.name} color to ${option.label}`}
                                className={`w-7 h-7 sm:w-6 sm:h-6 rounded-full flex items-center justify-center transition cursor-pointer ${option.swatchClass} ${
                                  isSelected
                                    ? 'ring-2 ring-offset-2 ring-slate-900 scale-110'
                                    : 'opacity-80 hover:opacity-100'
                                }`}
                              >
                                {isSelected && <Check className="w-3.5 h-3.5 text-white stroke-[3]" />}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Add New Custom Holiday Category */}
              <form
                onSubmit={handleAddHolidayCategory}
                className="p-4 rounded-xl border border-indigo-200/80 bg-indigo-50/40 space-y-3"
              >
                <h4 className="text-xs font-bold uppercase tracking-wider text-indigo-800 flex items-center gap-1.5">
                  <Plus className="w-4 h-4" />
                  <span>Add New Holiday Category</span>
                </h4>

                <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
                  <div className="md:col-span-5">
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Category Name
                    </label>
                    <input
                      type="text"
                      value={newCategoryName}
                      onChange={(e) => setNewCategoryName(e.target.value)}
                      placeholder="e.g. Company Holiday, Regional"
                      className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-indigo-500 focus:outline-hidden"
                    />
                  </div>

                  <div className="md:col-span-5">
                    <span className="block text-[11px] font-semibold text-slate-700 mb-1.5">
                      Category Color
                    </span>
                    <div className="flex flex-wrap items-center gap-2">
                      {HOLIDAY_COLOR_PALETTE.map((option) => {
                        const isSelected = newCategoryColor === option.key;
                        return (
                          <button
                            key={option.key}
                            type="button"
                            onClick={() => setNewCategoryColor(option.key)}
                            title={option.label}
                            className={`w-7 h-7 sm:w-6 sm:h-6 rounded-full flex items-center justify-center transition cursor-pointer ${option.swatchClass} ${
                              isSelected
                                ? 'ring-2 ring-offset-1 ring-slate-900 scale-110'
                                : 'opacity-75 hover:opacity-100'
                            }`}
                          >
                            {isSelected && <Check className="w-3 h-3 text-white stroke-[3]" />}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="md:col-span-2 flex justify-end">
                    <button
                      type="submit"
                      disabled={isSavingCategory}
                      className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-xs transition cursor-pointer disabled:opacity-60 whitespace-nowrap"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add</span>
                    </button>
                  </div>
                </div>
              </form>
            </div>
          )}

          {/* Sub-Panel C: Quick Holiday Add & Annual Seed */}
          {(calendarSubTab === 'all' || calendarSubTab === 'holidays') && (
            <div className="rounded-2xl bg-white p-5 sm:p-6 shadow-xs border border-slate-200 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900">
                    Calendar Entries &amp; Bulk Seed
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Add individual holidays directly or import the 2026 standard public &amp; bank holiday schedule.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsSeedHolidaysModalOpen(true)}
                  className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 text-xs font-bold transition cursor-pointer shrink-0 whitespace-nowrap"
                >
                  <Sparkles className="w-3.5 h-3.5 text-purple-600" />
                  <span>Import 2026 Holidays</span>
                </button>
              </div>

              <form
                onSubmit={handleQuickAddHoliday}
                className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end p-4 rounded-xl bg-slate-50 border border-slate-200"
              >
                <div className="md:col-span-3">
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Date
                  </label>
                  <input
                    type="date"
                    value={quickHolidayDate}
                    onChange={(e) => setQuickHolidayDate(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
                  />
                </div>
                <div className="md:col-span-4">
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Holiday Name
                  </label>
                  <input
                    type="text"
                    value={quickHolidayName}
                    onChange={(e) => setQuickHolidayName(e.target.value)}
                    placeholder="e.g. Company Anniversary"
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
                  />
                </div>
                <div className="md:col-span-3">
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Category
                  </label>
                  <select
                    value={quickHolidayCategory}
                    onChange={(e) => setQuickHolidayCategory(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
                  >
                    {holidayCategories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="md:col-span-2">
                  <button
                    type="submit"
                    disabled={isAddingQuickHoliday}
                    className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition cursor-pointer disabled:opacity-60 whitespace-nowrap"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>{isAddingQuickHoliday ? 'Adding...' : 'Add Date'}</span>
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      )}

      {/* Submenu Tab: Automated Email (Make Webhook) */}
      {activeCategory === 'email_automation' && (
        <div className="rounded-2xl bg-white p-5 sm:p-6 shadow-xs border border-slate-200 space-y-5 animate-fade-in">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <Mail className="w-5 h-5 text-indigo-600 shrink-0" />
              <h2 className="text-sm font-bold text-indigo-700 uppercase tracking-wider">
                Automated Email Delivery (Make Webhook)
              </h2>
            </div>
            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>Active · No Gmail Required</span>
            </span>
          </div>

          <p className="text-xs text-slate-600 leading-relaxed">
            All automated system emails—including <strong>Broadcast Notification Emails</strong>,{' '}
            <strong>New User Welcome Credentials</strong>, and <strong>Password Reset Notices</strong>—are dispatched directly through your configured Make webhook without requiring Gmail sign-in or Google OAuth popups.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Active Make Endpoint
              </div>
              <div className="font-mono font-bold text-slate-900 break-all">
                {makeWebhookInfo.maskedUrl}
              </div>
              <div className="text-[11px] text-slate-500">
                Region Host: <span className="font-semibold text-slate-700">{makeWebhookInfo.host}</span>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Recommended Make Email Mapping
              </div>
              <div className="text-[11px] text-slate-700 leading-relaxed space-y-1">
                <div>
                  <strong>To:</strong> <code className="font-mono bg-white px-1 py-0.5 rounded border border-slate-200">to</code>
                  {' · '}
                  <strong>Subject:</strong> <code className="font-mono bg-white px-1 py-0.5 rounded border border-slate-200">subject</code>
                </div>
                <div>
                  <strong>Content Type:</strong> <span className="font-semibold text-indigo-700">HTML</span>
                  {' · '}
                  <strong>Content:</strong> <code className="font-mono bg-white px-1 py-0.5 rounded border border-slate-200">html</code>
                </div>
              </div>
              <div className="text-[11px] text-slate-500">
                Map <code className="font-mono">html</code> (not <code className="font-mono">text</code>/<code className="font-mono">body</code>) in Make&apos;s HTML Content box to preserve cards, tables, and line breaks.
              </div>
            </div>
          </div>

          {makeEmailFeedback && (
            <div
              className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${
                makeEmailFeedback.type === 'success'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : 'bg-rose-50 border-rose-200 text-rose-800'
              }`}
            >
              {makeEmailFeedback.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              )}
              <span>{makeEmailFeedback.text}</span>
            </div>
          )}

          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (isSendingTestEmail) return;
              setIsSendingTestEmail(true);
              setMakeEmailFeedback(null);
              try {
                const res = await sendTestEmailViaMake({
                  to: testEmailRecipient,
                  recipientName: userProfile?.name || 'Administrator',
                  senderName: userProfile?.name || currentUser?.email || 'Administrator',
                  senderEmail: userProfile?.email || currentUser?.email || '',
                });
                if (res.success) {
                  setMakeEmailFeedback({
                    type: 'success',
                    text: `Test payload accepted by ${res.webhookHost} (${res.responseText || 'Accepted'}). Check your inbox or Make scenario execution log.`,
                  });
                  await recordAuditLog({
                    action: 'EMAIL_DISPATCH',
                    actionLabel: 'Sent Make Webhook Test Email',
                    targetType: 'settings',
                    targetDescription: `Test dispatch to ${testEmailRecipient}`,
                    details: {
                      recipientEmail: testEmailRecipient,
                      provider: 'make_webhook',
                      messageId: res.messageId,
                    },
                  });
                } else {
                  setMakeEmailFeedback({
                    type: 'error',
                    text: res.error || 'Make webhook test failed.',
                  });
                }
              } catch (err: any) {
                setMakeEmailFeedback({
                  type: 'error',
                  text: err?.message || 'Unable to reach Make webhook.',
                });
              } finally {
                setIsSendingTestEmail(false);
              }
            }}
            className="p-4 rounded-xl border border-indigo-200 bg-indigo-50/50 space-y-3"
          >
            <div>
              <h3 className="text-xs font-bold text-indigo-950">
                Verify Make Scenario With a Test Email
              </h3>
              <p className="text-[11px] text-indigo-800/80 mt-0.5">
                Triggers a live <code className="font-mono bg-white/80 px-1 py-0.5 rounded">test_email</code> webhook event so you can test email delivery or map fields in Make.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-2.5">
              <input
                type="email"
                required
                value={testEmailRecipient}
                onChange={(e) => setTestEmailRecipient(e.target.value)}
                placeholder="recipient@company.com"
                className="flex-1 rounded-xl border border-indigo-200 bg-white px-3 py-2 text-xs text-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              />
              <button
                type="submit"
                disabled={isSendingTestEmail}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-xs transition cursor-pointer whitespace-nowrap disabled:opacity-60"
              >
                <Mail className="w-3.5 h-3.5" />
                <span>{isSendingTestEmail ? 'Sending Test...' : 'Send Test Email'}</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Submenu Tab 5: Google Drive Preview Integration */}
      {activeCategory === 'workspace' && (
        <div className="rounded-2xl bg-white p-5 sm:p-6 shadow-xs border border-slate-200 space-y-4 animate-fade-in">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 shrink-0" viewBox="0 0 87.3 78" fill="currentColor">
                <path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.45z" fill="#0066da" />
                <path d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44c-.8 1.35-1.2 2.9-1.2 4.45h27.5z" fill="#00ac47" />
                <path d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.35 1.2-2.9 1.2-4.5h-27.5l5.85 10.15z" fill="#ea4335" />
                <path d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.2z" fill="#00832d" />
                <path d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z" fill="#2684fc" />
                <path d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 28h27.45c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00" />
              </svg>
              <h2 className="text-sm font-bold text-blue-700 uppercase tracking-wider">
                Google Workspace Integration (Drive PDF Preview)
              </h2>
            </div>
            <span
              className={`text-xs font-bold ${
                isGoogleConnected ? 'text-emerald-700' : 'text-slate-500'
              }`}
            >
              {isGoogleConnected ? 'Status: Connected' : 'Status: Not Connected'}
            </span>
          </div>

          <p className="text-xs text-slate-600 leading-relaxed">
            Google Drive integration provides an <strong>in-site Google Drive viewer</strong> for interactive A4 claim PDF report previews. Automated system emails no longer require Gmail and are routed independently through Make.
          </p>

          {googleWorkspaceMessage && (
            <div className="p-3 rounded-xl bg-blue-50 border border-blue-200 text-xs text-blue-800">
              {googleWorkspaceMessage}
            </div>
          )}

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
                    setGoogleWorkspaceMessage(
                      'Google Drive preview successfully connected!'
                    );
                    setTimeout(() => setGoogleWorkspaceMessage(null), 4000);

                    recordAuditLog({
                      action: 'GOOGLE_WORKSPACE_CONNECT',
                      actionLabel: 'Connected Google Drive Preview Account',
                      targetType: 'settings',
                      targetDescription: 'Authorized Drive PDF Preview',
                      beforeState: { googleConnected: false },
                      afterState: { googleConnected: true, scopes: 'drive.file' },
                    });
                  } catch (err: any) {
                    setGoogleWorkspaceMessage('Connection note: ' + err.message);
                  } finally {
                    setIsConnectingGoogle(false);
                  }
                }}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs transition cursor-pointer whitespace-nowrap"
              >
                <span>{isConnectingGoogle ? 'Connecting...' : 'Connect Google Drive Account'}</span>
              </button>
            ) : (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-emerald-700 font-semibold flex items-center gap-1">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Active session authorized for Google Drive preview</span>
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setCachedGoogleToken(null);
                    setIsGoogleConnected(false);
                    setGoogleWorkspaceMessage('Disconnected Google Drive session.');
                    setTimeout(() => setGoogleWorkspaceMessage(null), 3000);

                    recordAuditLog({
                      action: 'GOOGLE_WORKSPACE_DISCONNECT',
                      actionLabel: 'Disconnected Google Drive Account',
                      targetType: 'settings',
                      targetDescription: 'Revoked active Google Drive session token',
                      beforeState: { googleConnected: true },
                      afterState: { googleConnected: false },
                    });
                  }}
                  className="px-3 py-1.5 rounded-lg border border-slate-300 hover:bg-slate-100 text-slate-600 text-xs font-semibold transition cursor-pointer whitespace-nowrap"
                >
                  Disconnect
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Submenu Tab: Live OTA Updates (Super Admin Only) */}
      {isSuperAdmin && activeCategory === 'ota' && (
        <div className="rounded-2xl bg-white p-5 sm:p-6 shadow-xs border border-slate-200 space-y-5 animate-fade-in">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <Radio className="w-4 h-4 text-rose-600" />
              <h2 className="text-sm font-bold text-rose-700 uppercase tracking-wider">
                Live OTA Updates (Vercel + Firebase)
              </h2>
            </div>
            <span className="text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 font-mono tabular-nums self-start sm:self-auto">
              v{otaState.currentVersion}
            </span>
          </div>

          <p className="text-xs text-slate-600 leading-relaxed">
            Connected browser tabs listen to <strong>Firebase Firestore</strong> in real time and verify Vercel&apos;s{' '}
            <code className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-800 font-mono text-[11px]">/version.json</code>{' '}
            plus the Service Worker cache. Whenever a new build is live, idle tabs update automatically without users pressing Refresh, while active claim drafts are safely preserved.
          </p>

          {otaFeedback && (
            <div
              className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${
                otaFeedback.type === 'success'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : 'bg-rose-50 border-rose-200 text-rose-800'
              }`}
            >
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{otaFeedback.text}</span>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Running In This Tab
              </div>
              <div className="font-mono font-bold text-slate-900 break-all tabular-nums">
                {otaState.currentVersion}
              </div>
              <div className="text-[11px] text-slate-500">
                Commit: <span className="font-mono font-semibold text-slate-700">{otaState.currentCommitSha}</span>
                {' · '}
                Built: {new Date(otaState.currentBuildTime).toLocaleString()}
              </div>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Latest Firestore Broadcast Signal
              </div>
              <div className="font-mono font-bold text-indigo-700 break-all tabular-nums">
                {otaState.remoteRelease?.version || 'Not published yet'}
              </div>
              <div className="text-[11px] text-slate-500">
                {otaState.remoteRelease?.updatedAt
                  ? `Published ${new Date(otaState.remoteRelease.updatedAt).toLocaleString()} by ${otaState.remoteRelease.updatedBy || 'System'}`
                  : 'Push via GitHub Actions or click Broadcast below to notify open tabs.'}
              </div>
            </div>
          </div>

          <div className="p-4 rounded-xl border border-indigo-200 bg-indigo-50/50 space-y-3">
            <div>
              <h3 className="text-xs font-bold text-indigo-950">
                Broadcast Instant Update Signal to Open Tabs
              </h3>
              <p className="text-[11px] text-indigo-800/80 mt-0.5">
                Pushes the latest deployed Vercel version to Firestore so every open browser tab detects and applies it immediately.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-2.5">
              <input
                type="text"
                value={otaReleaseNotesInput}
                onChange={(e) => setOtaReleaseNotesInput(e.target.value)}
                placeholder="Optional release note (e.g. Updated OT calculation rules)"
                maxLength={200}
                className="flex-1 rounded-xl border border-indigo-200 bg-white px-3 py-2 text-xs text-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              />
              <button
                type="button"
                disabled={isCheckingOta || isBroadcastingOta}
                onClick={async () => {
                  setIsCheckingOta(true);
                  setOtaFeedback(null);
                  try {
                    const res = await checkForOtaUpdateNow();
                    setOtaFeedback({
                      type: 'success',
                      text: res.updateFound
                        ? `New version ${res.version} found and queued for update.`
                        : `This tab is up to date (${res.version}).`,
                    });
                  } catch (err: any) {
                    setOtaFeedback({
                      type: 'error',
                      text: err?.message || 'Unable to check live version manifest.',
                    });
                  } finally {
                    setIsCheckingOta(false);
                  }
                }}
                className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl border border-indigo-200 bg-white hover:bg-indigo-50 text-indigo-700 text-xs font-semibold transition cursor-pointer whitespace-nowrap disabled:opacity-60"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isCheckingOta ? 'animate-spin' : ''}`} />
                <span>{isCheckingOta ? 'Checking...' : 'Check Now'}</span>
              </button>
              <button
                type="button"
                disabled={isBroadcastingOta}
                onClick={async () => {
                  setIsBroadcastingOta(true);
                  setOtaFeedback(null);
                  try {
                    const published = await publishOtaReleaseSignal({
                      releaseNotes:
                        otaReleaseNotesInput.trim() || 'New production update available',
                      updatedBy: userProfile?.name || currentUser?.email || 'Super Admin',
                      forceImmediate: true,
                    });
                    setOtaReleaseNotesInput('');
                    setOtaFeedback({
                      type: 'success',
                      text: `Broadcasted live release v${published.version} to all connected tabs.`,
                    });
                  } catch (err: any) {
                    setOtaFeedback({
                      type: 'error',
                      text: err?.message || 'Failed to publish OTA release signal.',
                    });
                  } finally {
                    setIsBroadcastingOta(false);
                  }
                }}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-xs transition cursor-pointer whitespace-nowrap disabled:opacity-60"
              >
                <Radio className="w-3.5 h-3.5" />
                <span>{isBroadcastingOta ? 'Broadcasting...' : 'Broadcast OTA Update'}</span>
              </button>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-[11px] text-slate-600 space-y-1.5">
            <div className="font-bold text-slate-800">
              Automatic GitHub + Vercel Push Setup (1-Time Configuration)
            </div>
            <p>
              To trigger instant &lt;1 second updates automatically on every <code className="font-mono bg-white px-1 py-0.5 rounded border border-slate-200">git push</code> to Vercel, add a GitHub Repository Secret named{' '}
              <code className="font-mono bg-white px-1 py-0.5 rounded border border-slate-200">FIREBASE_SERVICE_ACCOUNT_JSON</code>{' '}
              containing your Firebase service account JSON. The included GitHub Actions workflow will automatically notify Firestore as soon as Vercel marks the Production deploy ready.
            </p>
          </div>
        </div>
      )}

      {/* Submenu Tab 6: Privacy & Data Security */}
      {activeCategory === 'privacy' && (
        <div className="rounded-2xl bg-white p-5 sm:p-6 shadow-xs border border-slate-200 space-y-4 animate-fade-in">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
            <Shield className="w-4 h-4 text-emerald-600" />
            <h2 className="text-sm font-bold text-emerald-700 uppercase tracking-wider">
              Privacy &amp; Data Security
            </h2>
          </div>
          <p className="text-xs text-slate-600 leading-relaxed">
            Overtime Claim Manager securely synchronizes claims, staff profiles, and calibrated templates with{' '}
            <strong>Cloud Firestore</strong> while maintaining an <strong>encrypted browser cache</strong> for fast offline PDF generation.
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
                type="button"
                onClick={handleExportBackup}
                className="mt-3 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-xs transition cursor-pointer whitespace-nowrap"
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
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="mt-3 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 text-xs font-semibold transition cursor-pointer whitespace-nowrap"
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
                type="button"
                onClick={() => setIsResetConfirmOpen(true)}
                className="px-3.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-xs transition shrink-0 cursor-pointer whitespace-nowrap"
              >
                Reset Application Data
              </button>
            </div>
          </div>
        </div>
      )}

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

      {/* Super Admin: Confirm Delete Custom Holiday Category */}
      {isSuperAdmin && (
        <ConfirmationModal
          isOpen={!!categoryToDelete}
          onClose={() => setCategoryToDelete(null)}
          onConfirm={handleConfirmDeleteCategory}
          title="Delete Holiday Category"
          message={`Remove custom category "${categoryToDelete?.name}"? Existing holidays assigned to it will display under Other Holidays.`}
          confirmText="Delete Category"
          cancelText="Cancel"
          variant="danger"
          isLoading={isDeletingCategory}
        />
      )}

      {/* Super Admin: Confirm Import 2026 Standard Holidays */}
      {isSuperAdmin && (
        <ConfirmationModal
          isOpen={isSeedHolidaysModalOpen}
          onClose={() => setIsSeedHolidaysModalOpen(false)}
          onConfirm={handleConfirmSeedHolidays}
          title="Import Standard 2026 Holidays"
          message="This will import the standard 2026 Sri Lankan Public, Poya, and Bank holidays into the Integrated Calendar."
          confirmText="Import Holidays"
          cancelText="Cancel"
          variant="info"
          isLoading={isSeedingHolidays}
        />
      )}
    </div>
  );
};
