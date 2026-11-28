import React, { useState, useRef, useEffect, useMemo } from 'react';
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
  Search,
  RotateCcw,
  Minus,
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
  MakeTestEmailTemplateMode,
  sendTestEmailViaMake,
} from '../services/makeEmailService';
import {
  DEFAULT_EMAIL_ACTIVITY_SETTINGS,
  EmailActivitySettingKey,
  EmailActivitySettings,
  saveEmailActivitySettings,
  subscribeToEmailActivitySettings,
} from '../services/emailActivityService';
import { getCallingName } from '../utils/userNameHelper';

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

type NavGroupId = 'claim' | 'workspace' | 'security' | 'account';

interface SettingsCategoryItem {
  id: AnySettingsCategoryId;
  group: NavGroupId;
  title: string;
  shortTitle: string;
  subtitle: string;
  description: string;
  icon: React.FC<{ className?: string }>;
  iconAccentClass: string;
  metaText?: string;
}

const NAV_GROUP_LABELS: Record<NavGroupId, string> = {
  claim: 'Claim & Output',
  workspace: 'Workspace & Sync',
  security: 'Data & Security',
  account: 'Account & Privacy',
};

export const SettingsPage: React.FC = () => {
  const { currentUser, userProfile, isAdmin, isSuperAdmin, refreshUserProfile } = useAuth();
  const [employees, setEmployees] = useState(getEmployees());
  const [settings, setSettings] = useState<AppSettings>(getSettings());
  const [savedSnapshot, setSavedSnapshot] = useState<AppSettings>(getSettings());
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [backupStatus, setBackupStatus] = useState<string | null>(null);
  const [templates, setTemplates] = useState<TemplateConfig[]>([getActiveTemplate()]);
  const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false);
  const [isConfirmSaveSettingsOpen, setIsConfirmSaveSettingsOpen] = useState(false);
  const [isGoogleConnected, setIsGoogleConnected] = useState(hasGoogleWorkspaceToken());
  const [isConnectingGoogle, setIsConnectingGoogle] = useState(false);
  const [googleWorkspaceMessage, setGoogleWorkspaceMessage] = useState<string | null>(null);

  const [activeCategory, setActiveCategory] = useState<AnySettingsCategoryId>(() =>
    isAdmin ? 'defaults' : 'protection'
  );
  const [navQuery, setNavQuery] = useState('');
  const [calendarSubTab, setCalendarSubTab] = useState<CalendarSubTabId>('all');

  // Super Admin Only: Calendar Display Settings & Holiday Categories
  const [firstDayOfWeek, setFirstDayOfWeek] = useState<FirstDayOfWeek>(
    (getSettings().firstDayOfWeek ?? 0) as FirstDayOfWeek
  );
  const [isSavingFirstDay, setIsSavingFirstDay] = useState(false);
  const [holidayCategories, setHolidayCategories] = useState<HolidayCategory[]>([]);
  const [categoryNameEdits, setCategoryNameEdits] = useState<Record<string, string>>({});
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryColor, setNewCategoryColor] = useState<HolidayCategoryColorKey>('emerald');
  const [isSavingCategory, setIsSavingCategory] = useState(false);
  const [categoryStatusMsg, setCategoryStatusMsg] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
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
  const [otaFeedback, setOtaFeedback] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  // Automated Email (Make Webhook) Test & Activity Alert Settings State
  const makeWebhookInfo = getMakeWebhookDisplayInfo();
  const [activityEmailSettings, setActivityEmailSettings] = useState<EmailActivitySettings>(
    DEFAULT_EMAIL_ACTIVITY_SETTINGS
  );
  const [savingActivityKey, setSavingActivityKey] = useState<EmailActivitySettingKey | null>(null);
  const [testEmailRecipient, setTestEmailRecipient] = useState(
    userProfile?.email || currentUser?.email || ''
  );
  const [testEmailTemplateMode, setTestEmailTemplateMode] =
    useState<MakeTestEmailTemplateMode>('standard');
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

  useEffect(() => {
    return subscribeToEmailActivitySettings(setActivityEmailSettings);
  }, []);

  // Keep activeCategory valid across async role changes
  useEffect(() => {
    if (!isAdmin && !['protection', 'security', 'export'].includes(activeCategory)) {
      setActiveCategory('protection');
    } else if (
      isAdmin &&
      ![
        'defaults',
        'formatting',
        'printer',
        'calendar',
        'ota',
        'email_automation',
        'workspace',
        'privacy',
      ].includes(activeCategory)
    ) {
      setActiveCategory('defaults');
    } else if (
      isAdmin &&
      !isSuperAdmin &&
      (activeCategory === 'calendar' || activeCategory === 'ota')
    ) {
      setActiveCategory('defaults');
    }
  }, [isAdmin, isSuperAdmin, activeCategory]);

  // Subscribe to Calendar Settings & Holiday Categories for Super Admin
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

  const hasUnsavedSettings = useMemo(() => {
    return (
      (settings.defaultEmployeeId || '') !== (savedSnapshot.defaultEmployeeId || '') ||
      settings.defaultDepartment !== savedSnapshot.defaultDepartment ||
      settings.defaultBranch !== savedSnapshot.defaultBranch ||
      settings.defaultFont !== savedSnapshot.defaultFont ||
      (settings.activeTemplateId || '') !== (savedSnapshot.activeTemplateId || '') ||
      (settings.defaultWeekdayReason || '') !== (savedSnapshot.defaultWeekdayReason || '') ||
      (settings.defaultSaturdayReason ?? 'Saturday Duty') !==
        (savedSnapshot.defaultSaturdayReason ?? 'Saturday Duty') ||
      (settings.defaultHolidayReason || '') !== (savedSnapshot.defaultHolidayReason || '') ||
      settings.timeFormat !== savedSnapshot.timeFormat ||
      settings.otDisplayFormat !== savedSnapshot.otDisplayFormat ||
      settings.pdfFilenamePattern !== savedSnapshot.pdfFilenamePattern ||
      settings.globalPrinterOffsetX !== savedSnapshot.globalPrinterOffsetX ||
      settings.globalPrinterOffsetY !== savedSnapshot.globalPrinterOffsetY
    );
  }, [settings, savedSnapshot]);

  const handleSave = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setIsConfirmSaveSettingsOpen(true);
  };

  const handleDiscardSettings = () => {
    setSettings(savedSnapshot);
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
    setSavedSnapshot(settings);
    setSaveSuccess(true);
    setIsConfirmSaveSettingsOpen(false);
    setTimeout(() => setSaveSuccess(false), 3000);
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
        const reloaded = getSettings();
        setSettings(reloaded);
        setSavedSnapshot(reloaded);
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
    setSavedSnapshot((prev) => ({ ...prev, firstDayOfWeek: dayIdx }));
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

  const handleUpdateCategoryColor = async (
    cat: HolidayCategory,
    colorKey: HolidayCategoryColorKey
  ) => {
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
      group: 'claim',
      title: 'Form Defaults',
      shortTitle: 'Form Defaults',
      subtitle: 'Employee, template & default OT reasons',
      description:
        'Configure default claimant profiles, branch, PDF typography, cloud template, and weekday or weekend overtime reasons.',
      icon: SlidersHorizontal,
      iconAccentClass: 'text-indigo-600',
      metaText: `${settings.defaultBranch || 'Headquarters'} · ${settings.defaultFont}`,
    },
    {
      id: 'formatting',
      group: 'claim',
      title: 'Formatting & Output',
      shortTitle: 'Formatting',
      subtitle: 'Time rules & PDF filename pattern',
      description:
        'Choose 24-hour vs 12-hour input style, overtime duration display units, and automatic PDF export naming.',
      icon: FileText,
      iconAccentClass: 'text-sky-600',
      metaText: `${settings.timeFormat === '24h' ? '24-Hour' : '12-Hour'} · ${
        settings.otDisplayFormat === 'hhmm' ? 'HH:MM' : 'Decimal'
      }`,
    },
    {
      id: 'printer',
      group: 'claim',
      title: 'Printer Calibration',
      shortTitle: 'Printer',
      subtitle: 'Global A4 coordinate offsets',
      description:
        'Adjust physical millimeter X and Y alignment offsets applied globally across all printed overtime sheets.',
      icon: Printer,
      iconAccentClass: 'text-violet-600',
      metaText: `X ${settings.globalPrinterOffsetX} mm · Y ${settings.globalPrinterOffsetY} mm`,
    },
    ...(isSuperAdmin
      ? [
          {
            id: 'calendar' as const,
            group: 'workspace' as const,
            title: 'Calendar Settings',
            shortTitle: 'Calendar',
            subtitle: 'Week start, categories & holidays',
            description:
              'Set the first day of week, customize holiday category colors, add custom types, and import annual holidays.',
            icon: CalendarIcon,
            iconAccentClass: 'text-amber-600',
            metaText: `Super Admin · Starts ${getFirstDayOfWeekLabel(firstDayOfWeek)}`,
          },
        ]
      : []),
    {
      id: 'email_automation',
      group: 'workspace',
      title: 'Automated Email',
      shortTitle: 'Email',
      subtitle: 'Make webhook triggers & previews',
      description:
        'Control automated activity emails and verify live HTML email delivery templates through Make.',
      icon: Mail,
      iconAccentClass: 'text-indigo-600',
      metaText: `Connected · ${makeWebhookInfo.host}`,
    },
    {
      id: 'workspace',
      group: 'workspace',
      title: 'Google Drive Preview',
      shortTitle: 'Google Drive',
      subtitle: 'Interactive PDF cloud viewer',
      description:
        'Connect Google Workspace Drive access for interactive in-site A4 claim PDF report previews.',
      icon: Globe,
      iconAccentClass: 'text-blue-600',
      metaText: isGoogleConnected ? 'Connected · Drive preview active' : 'Not Connected',
    },
    ...(isSuperAdmin
      ? [
          {
            id: 'ota' as const,
            group: 'workspace' as const,
            title: 'Live OTA Updates',
            shortTitle: 'OTA Updates',
            subtitle: 'Vercel & Firebase instant sync',
            description:
              'Inspect deployed build version, check CDN readiness, and broadcast live updates to all open browser tabs.',
            icon: Radio,
            iconAccentClass: 'text-rose-600',
            metaText: `Build ${APP_BUILD_INFO.commitSha} · Real-time Push`,
          },
        ]
      : []),
    {
      id: 'privacy',
      group: 'security',
      title: 'Privacy & Data Security',
      shortTitle: 'Data & Backup',
      subtitle: 'Backup, restore & factory reset',
      description:
        'Export system JSON backups, restore saved snapshots, or execute a full local storage reset.',
      icon: Shield,
      iconAccentClass: 'text-emerald-600',
      metaText: 'Cloud Firestore · Encrypted Local Cache',
    },
  ];

  const userCategories: SettingsCategoryItem[] = [
    {
      id: 'protection',
      group: 'account',
      title: 'Personal Data Protection',
      shortTitle: 'Protection',
      subtitle: 'Identity & access isolation',
      description:
        'Review your verified PF details, branch assignment, and strict personal claim isolation policies.',
      icon: ShieldCheck,
      iconAccentClass: 'text-emerald-600',
      metaText: `${userProfile?.employeeNumber || userProfile?.pfNumber || 'Staff'} · ${
        userProfile?.branch || 'Head Office'
      }`,
    },
    {
      id: 'security',
      group: 'account',
      title: 'Account Security & Password',
      shortTitle: 'Password',
      subtitle: 'Login password management',
      description:
        'Keep your overtime claim account secure by updating your personal sign-in password.',
      icon: KeyRound,
      iconAccentClass: 'text-indigo-600',
      metaText: 'Account Credentials',
    },
    {
      id: 'export',
      group: 'account',
      title: 'My Personal Data Export',
      shortTitle: 'Data Export',
      subtitle: 'Download personal records',
      description:
        'Export a private JSON archive containing exclusively your personal overtime claims and profile.',
      icon: HardDrive,
      iconAccentClass: 'text-blue-600',
      metaText: 'JSON Personal Archive',
    },
  ];

  const availableCategories = isAdmin ? adminCategories : userCategories;

  const filteredCategories = useMemo(() => {
    const q = navQuery.trim().toLowerCase();
    if (!q) return availableCategories;
    return availableCategories.filter(
      (c) =>
        c.title.toLowerCase().includes(q) ||
        c.subtitle.toLowerCase().includes(q) ||
        c.description.toLowerCase().includes(q)
    );
  }, [availableCategories, navQuery]);

  const groupedNav = useMemo(() => {
    const order: NavGroupId[] = isAdmin ? ['claim', 'workspace', 'security'] : ['account'];
    return order
      .map((group) => ({
        group,
        label: NAV_GROUP_LABELS[group],
        items: filteredCategories.filter((item) => item.group === group),
      }))
      .filter((section) => section.items.length > 0);
  }, [filteredCategories, isAdmin]);

  const activeCategoryMeta =
    availableCategories.find((c) => c.id === activeCategory) || availableCategories[0];

  const isFormSettingsCategory =
    activeCategory === 'defaults' ||
    activeCategory === 'formatting' ||
    activeCategory === 'printer';

  const openCategoryTab = (categoryId: AnySettingsCategoryId) => {
    setActiveCategory(categoryId);
    if (categoryId === 'calendar') {
      setCalendarSubTab('all');
    }
  };

  const weekPreviewColumns = Array.from({ length: 7 }, (_, i) => {
    const idx = (firstDayOfWeek + i) % 7;
    return {
      idx,
      short: DAYS_SHORT[idx],
      isSunday: idx === 0,
      isSaturday: idx === 6,
    };
  });

  const sampleFilenamePreview = useMemo(() => {
    const pattern = settings.pdfFilenamePattern || 'Overtime_Claim_[EmployeeName]_[Month]_[Year].pdf';
    return pattern
      .replace(/\[EmployeeName\]/g, 'Nimal_Perera')
      .replace(/\[Month\]/g, 'November')
      .replace(/\[Year\]/g, String(new Date().getFullYear()));
  }, [settings.pdfFilenamePattern]);

  const ActiveIcon = activeCategoryMeta.icon;

  return (
    <div className="w-full max-w-6xl mx-auto pb-10 space-y-5">
      {/* Clean SaaS Top Page Header */}
      <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-4 border-b border-slate-200/90">
        <div className="flex items-start gap-3.5 min-w-0">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 text-white shrink-0 mt-0.5">
            {isAdmin ? <SettingsIcon className="w-5 h-5" /> : <Shield className="w-5 h-5" />}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
              <span>Settings</span>
              <span aria-hidden="true">/</span>
              <span className="text-slate-800 truncate">{activeCategoryMeta.title}</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight mt-0.5">
              {isAdmin ? 'Workspace Settings' : 'Account & Privacy Settings'}
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
              {isAdmin
                ? 'Manage claim defaults, formatting, calendar rules, automated email triggers, and backups.'
                : 'Manage personal access protection, password security, and private record exports.'}
            </p>
          </div>
        </div>

        {/* Contextual Header Actions for Form-Backed Sections */}
        {isAdmin && isFormSettingsCategory && (
          <div className="flex items-center gap-2.5 shrink-0 self-start sm:self-end">
            {hasUnsavedSettings && (
              <>
                <span className="text-xs font-medium text-amber-700 hidden sm:inline">
                  Unsaved changes
                </span>
                <button
                  type="button"
                  onClick={handleDiscardSettings}
                  className="inline-flex items-center gap-1.5 px-3 min-h-[40px] rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold transition cursor-pointer whitespace-nowrap shrink-0"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Discard</span>
                </button>
              </>
            )}
            <button
              type="button"
              onClick={() => handleSave()}
              className="inline-flex items-center gap-2 px-4 min-h-[40px] rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition cursor-pointer whitespace-nowrap shrink-0"
            >
              <Save className="w-3.5 h-3.5" />
              <span>Save Changes</span>
            </button>
          </div>
        )}
      </header>

      {saveSuccess && (
        <div className="px-4 py-3 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center gap-2.5 text-xs font-medium text-emerald-800 animate-fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>Settings saved and synchronized across your workspace.</span>
        </div>
      )}

      {/* Mobile & Tablet Horizontal Navigation Strip */}
      <nav
        aria-label="Settings sections"
        className="lg:hidden flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1"
      >
        {availableCategories.map((cat) => {
          const Icon = cat.icon;
          const isActive = cat.id === activeCategoryMeta.id;
          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => openCategoryTab(cat.id)}
              className={`inline-flex items-center gap-2 px-3.5 min-h-[44px] rounded-xl text-xs font-semibold transition whitespace-nowrap shrink-0 cursor-pointer border ${
                isActive
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : cat.iconAccentClass}`} />
              <span>{cat.shortTitle}</span>
            </button>
          );
        })}
      </nav>

      {/* Two-Pane Desktop Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-[248px_minmax(0,1fr)] gap-6 lg:gap-8 items-start">
        {/* Left Vertical Navigation Rail (Desktop) */}
        <aside className="hidden lg:block sticky top-20 space-y-5">
          {availableCategories.length > 4 && (
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="search"
                value={navQuery}
                onChange={(e) => setNavQuery(e.target.value)}
                placeholder="Filter settings..."
                aria-label="Filter settings sections"
                className="w-full pl-8 pr-3 h-9 rounded-xl border border-slate-200 bg-white text-xs text-slate-800 placeholder:text-slate-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-hidden"
              />
            </div>
          )}

          <nav aria-label="Settings navigation" className="space-y-5">
            {groupedNav.length === 0 ? (
              <div className="px-3 py-4 text-xs text-slate-500">
                No sections match &ldquo;{navQuery}&rdquo;.
              </div>
            ) : (
              groupedNav.map((section) => (
                <div key={section.group} className="space-y-1">
                  <div className="px-2.5 pb-1 text-xs font-medium text-slate-400">
                    {section.label}
                  </div>
                  <div className="space-y-0.5">
                    {section.items.map((cat) => {
                      const Icon = cat.icon;
                      const isActive = cat.id === activeCategoryMeta.id;
                      return (
                        <button
                          key={cat.id}
                          type="button"
                          onClick={() => openCategoryTab(cat.id)}
                          className={`w-full flex items-center gap-2.5 px-3 min-h-[40px] rounded-xl text-left text-[13px] transition cursor-pointer whitespace-nowrap ${
                            isActive
                              ? 'bg-white text-slate-900 font-semibold border border-slate-200/90 shadow-2xs'
                              : 'text-slate-600 font-medium border border-transparent hover:bg-slate-100/70 hover:text-slate-900'
                          }`}
                        >
                          <Icon
                            className={`w-4 h-4 shrink-0 ${
                              isActive ? cat.iconAccentClass : 'text-slate-400'
                            }`}
                          />
                          <span className="truncate">{cat.title}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </nav>

          {activeCategoryMeta.metaText && (
            <div className="px-3 pt-4 border-t border-slate-200/80 space-y-1">
              <div className="text-[11px] font-medium text-slate-400">Active configuration</div>
              <div className="text-xs font-medium text-slate-700 tabular-nums leading-snug">
                {activeCategoryMeta.metaText}
              </div>
            </div>
          )}
        </aside>

        {/* Right-Hand Configuration Canvas */}
        <main className="min-w-0">
          <div className="rounded-2xl bg-white border border-slate-200/90 shadow-2xs overflow-hidden">
            {/* Active Section Intro Banner */}
            <div className="px-5 py-4 sm:px-6 sm:py-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start gap-3 min-w-0">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-50 border border-slate-200/80 shrink-0 mt-0.5">
                  <ActiveIcon className={`w-4 h-4 ${activeCategoryMeta.iconAccentClass}`} />
                </div>
                <div className="min-w-0">
                  <h2 className="text-base font-bold text-slate-900 tracking-tight">
                    {activeCategoryMeta.title}
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                    {activeCategoryMeta.description}
                  </p>
                </div>
              </div>
              {activeCategoryMeta.metaText && (
                <div className="text-xs font-medium text-slate-500 tabular-nums shrink-0">
                  {activeCategoryMeta.metaText}
                </div>
              )}
            </div>

            {/* ================= STANDARD USER VIEWS ================= */}
            {!isAdmin && activeCategoryMeta.id === 'protection' && (
              <div className="divide-y divide-slate-100 animate-fade-in">
                <div className="px-5 py-5 sm:px-6">
                  <div className="flex items-start gap-3">
                    <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <h3 className="text-sm font-semibold text-slate-900">
                        Strict Personal Access Isolation
                      </h3>
                      <p className="text-xs text-slate-600 leading-relaxed">
                        In compliance with corporate data protection standards, all timesheet
                        submissions and overtime calculations are strictly private to your account.
                        Regular staff members cannot view or search other employees&apos; claims or
                        records.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="px-5 py-4 sm:px-6 grid grid-cols-1 md:grid-cols-12 gap-2 md:gap-6 items-center">
                  <div className="md:col-span-5">
                    <div className="text-xs font-semibold text-slate-800">Staff Name</div>
                    <div className="text-xs text-slate-500">Registered account display name</div>
                  </div>
                  <div className="md:col-span-7 text-sm font-semibold text-slate-900">
                    {getCallingName(userProfile, 'Staff Member')}
                  </div>
                </div>

                <div className="px-5 py-4 sm:px-6 grid grid-cols-1 md:grid-cols-12 gap-2 md:gap-6 items-center">
                  <div className="md:col-span-5">
                    <div className="text-xs font-semibold text-slate-800">
                      PF Number (Username)
                    </div>
                    <div className="text-xs text-slate-500">Unique staff login identifier</div>
                  </div>
                  <div className="md:col-span-7 text-sm font-semibold text-indigo-700 font-mono tabular-nums">
                    {userProfile?.employeeNumber || userProfile?.pfNumber || 'PF Number'}
                  </div>
                </div>

                <div className="px-5 py-4 sm:px-6 grid grid-cols-1 md:grid-cols-12 gap-2 md:gap-6 items-center">
                  <div className="md:col-span-5">
                    <div className="text-xs font-semibold text-slate-800">
                      Designation &amp; Department
                    </div>
                    <div className="text-xs text-slate-500">Assigned operational unit</div>
                  </div>
                  <div className="md:col-span-7 text-sm font-medium text-slate-700">
                    {userProfile?.designation || 'Staff Member'} &middot;{' '}
                    {userProfile?.department || 'Operations'}
                  </div>
                </div>

                <div className="px-5 py-4 sm:px-6 grid grid-cols-1 md:grid-cols-12 gap-2 md:gap-6 items-center">
                  <div className="md:col-span-5">
                    <div className="text-xs font-semibold text-slate-800">Branch / Office</div>
                    <div className="text-xs text-slate-500">Primary reporting branch</div>
                  </div>
                  <div className="md:col-span-7 text-sm font-medium text-slate-700">
                    {userProfile?.branch || 'Head Office'}
                  </div>
                </div>
              </div>
            )}

            {!isAdmin && activeCategoryMeta.id === 'security' && (
              <div className="divide-y divide-slate-100 animate-fade-in">
                <div className="px-5 py-5 sm:px-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="space-y-1 max-w-lg">
                    <h3 className="text-sm font-semibold text-slate-900">
                      Personal Password Management
                    </h3>
                    <p className="text-xs text-slate-500 leading-relaxed">
                      Update your personal sign-in password at any time to keep your overtime claim
                      submissions protected.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsPasswordModalOpen(true)}
                    className="inline-flex items-center justify-center gap-2 px-4 min-h-[42px] rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition cursor-pointer shrink-0 whitespace-nowrap"
                  >
                    <KeyRound className="w-3.5 h-3.5" />
                    <span>Change Password</span>
                  </button>
                </div>
              </div>
            )}

            {!isAdmin && activeCategoryMeta.id === 'export' && (
              <div className="divide-y divide-slate-100 animate-fade-in">
                <div className="px-5 py-5 sm:px-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="space-y-1 max-w-lg">
                    <h3 className="text-sm font-semibold text-slate-900">
                      Export My Personal Claims Archive
                    </h3>
                    <p className="text-xs text-slate-500 leading-relaxed">
                      Downloads a JSON archive containing exclusively your personal profile and
                      overtime claims created by {getCallingName(userProfile, 'you')}. No other
                      staff records are included.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleExportMyPersonalData}
                    className="inline-flex items-center justify-center gap-2 px-4 min-h-[42px] rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold transition shrink-0 cursor-pointer whitespace-nowrap"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Export My Data</span>
                  </button>
                </div>

                {personalBackupStatus && (
                  <div className="px-5 py-4 sm:px-6">
                    <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-medium text-emerald-800 flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>{personalBackupStatus}</span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ================= ADMIN & SUPER ADMIN VIEWS ================= */}
            {isAdmin && activeCategoryMeta.id === 'defaults' && (
              <form onSubmit={handleSave} className="divide-y divide-slate-100 animate-fade-in">
                {/* Row 1: Default Claimant Employee */}
                <div className="px-5 py-4 sm:px-6 grid grid-cols-1 md:grid-cols-12 gap-3 md:gap-6 items-center">
                  <div className="md:col-span-5">
                    <label
                      htmlFor="defaultEmployeeId"
                      className="block text-xs font-semibold text-slate-800"
                    >
                      Default Claimant Employee
                    </label>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Pre-selected staff member when opening a new claim draft.
                    </p>
                  </div>
                  <div className="md:col-span-7">
                    <select
                      id="defaultEmployeeId"
                      value={settings.defaultEmployeeId || ''}
                      onChange={(e) =>
                        setSettings({ ...settings, defaultEmployeeId: e.target.value || undefined })
                      }
                      className="w-full h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-medium text-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-hidden"
                    >
                      <option value="">-- None (Choose per claim) --</option>
                      {employees.map((emp) => (
                        <option key={emp.id} value={emp.id}>
                          {emp.name} ({emp.employeeNumber})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Row 2: Department & Branch */}
                <div className="px-5 py-4 sm:px-6 grid grid-cols-1 md:grid-cols-12 gap-3 md:gap-6 items-start">
                  <div className="md:col-span-5">
                    <div className="text-xs font-semibold text-slate-800">
                      Organization Unit &amp; Branch
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Default department and branch printed on official overtime sheets.
                    </p>
                  </div>
                  <div className="md:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-medium text-slate-500 mb-1">
                        Department
                      </label>
                      <input
                        type="text"
                        value={settings.defaultDepartment}
                        onChange={(e) =>
                          setSettings({ ...settings, defaultDepartment: e.target.value })
                        }
                        className="w-full h-10 rounded-xl border border-slate-200 px-3 text-xs font-medium text-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-hidden"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-slate-500 mb-1">
                        Branch / Office
                      </label>
                      <input
                        type="text"
                        value={settings.defaultBranch}
                        onChange={(e) =>
                          setSettings({ ...settings, defaultBranch: e.target.value })
                        }
                        className="w-full h-10 rounded-xl border border-slate-200 px-3 text-xs font-medium text-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-hidden"
                      />
                    </div>
                  </div>
                </div>

                {/* Row 3: Default PDF Font Family */}
                <div className="px-5 py-4 sm:px-6 grid grid-cols-1 md:grid-cols-12 gap-3 md:gap-6 items-center">
                  <div className="md:col-span-5">
                    <label
                      htmlFor="defaultFont"
                      className="block text-xs font-semibold text-slate-800"
                    >
                      Default PDF Font Family
                    </label>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Typography used when rendering field overlays onto A4 claims.
                    </p>
                  </div>
                  <div className="md:col-span-7">
                    <select
                      id="defaultFont"
                      value={settings.defaultFont}
                      onChange={(e) =>
                        setSettings({ ...settings, defaultFont: e.target.value as FontFamily })
                      }
                      className="w-full h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-medium text-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-hidden"
                    >
                      <option value="Helvetica">Helvetica (Standard Corporate)</option>
                      <option value="TimesRoman">Times Roman (Formal Serif)</option>
                      <option value="Courier">Courier (Monospace Matrix)</option>
                    </select>
                  </div>
                </div>

                {/* Row 4: Default Form Template (Cloud) */}
                <div className="px-5 py-4 sm:px-6 grid grid-cols-1 md:grid-cols-12 gap-3 md:gap-6 items-start">
                  <div className="md:col-span-5">
                    <label
                      htmlFor="activeTemplateId"
                      className="block text-xs font-semibold text-slate-800"
                    >
                      Default Form Template (Cloud)
                    </label>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Organization-wide template loaded by default. Edit coordinates in Template
                      Designer.
                    </p>
                  </div>
                  <div className="md:col-span-7">
                    {isAdmin ? (
                      <select
                        id="activeTemplateId"
                        value={settings.activeTemplateId || ''}
                        onChange={(e) => {
                          const newId = e.target.value;
                          setSettings({ ...settings, activeTemplateId: newId });
                          if (newId) setDefaultTemplateInFirestore(newId).catch(console.error);
                        }}
                        className="w-full h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-medium text-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-hidden"
                      >
                        {templates.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name} {t.isDefault ? '★ (Organization Default)' : ''}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <div className="flex items-center justify-between px-3 h-10 rounded-xl bg-slate-50 border border-slate-200 text-slate-700 font-semibold text-xs">
                        <div className="flex items-center gap-2">
                          <Lock className="w-3.5 h-3.5 text-slate-400" />
                          <span>
                            {templates.find((t) => t.id === settings.activeTemplateId)?.name ||
                              'Standard Official Form'}
                          </span>
                        </div>
                        <span className="text-[11px] text-indigo-700 font-semibold">
                          Admin Managed
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Row 5: Default Overtime Reasons */}
                <div className="px-5 py-5 sm:px-6 grid grid-cols-1 md:grid-cols-12 gap-4 md:gap-6 items-start">
                  <div className="md:col-span-5">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-800">
                      <Tag className="w-3.5 h-3.5 text-indigo-600" />
                      <span>Default Overtime Reasons</span>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                      Automatically populated when creating claims, auto-filling full months, or
                      adding timesheet rows.
                    </p>
                  </div>
                  <div className="md:col-span-7 space-y-3">
                    <div>
                      <label className="block text-[11px] font-medium text-slate-600 mb-1">
                        Weekdays (Mon - Fri) Reason
                      </label>
                      <input
                        type="text"
                        value={settings.defaultWeekdayReason || ''}
                        onChange={(e) =>
                          setSettings({ ...settings, defaultWeekdayReason: e.target.value })
                        }
                        placeholder="e.g. Regular Overtime"
                        className="w-full h-10 rounded-xl border border-slate-200 px-3 text-xs text-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-hidden"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-slate-600 mb-1">
                        Saturdays Reason
                      </label>
                      <input
                        type="text"
                        value={settings.defaultSaturdayReason ?? 'Saturday Duty'}
                        onChange={(e) =>
                          setSettings({ ...settings, defaultSaturdayReason: e.target.value })
                        }
                        placeholder="e.g. Saturday Duty"
                        className="w-full h-10 rounded-xl border border-slate-200 px-3 text-xs text-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-hidden"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-slate-600 mb-1">
                        Other Holidays &amp; Sundays Reason
                      </label>
                      <input
                        type="text"
                        value={settings.defaultHolidayReason || ''}
                        onChange={(e) =>
                          setSettings({ ...settings, defaultHolidayReason: e.target.value })
                        }
                        placeholder="Leave blank to use official Holiday name"
                        className="w-full h-10 rounded-xl border border-slate-200 px-3 text-xs text-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-hidden"
                      />
                    </div>
                  </div>
                </div>

                {/* Bottom Save Footer */}
                <div className="px-5 py-4 sm:px-6 bg-slate-50/70 flex items-center justify-between gap-3">
                  <span className="text-xs text-slate-500">
                    {hasUnsavedSettings ? 'You have unsaved changes.' : 'All changes are saved.'}
                  </span>
                  <button
                    type="submit"
                    className="inline-flex items-center gap-2 px-5 min-h-[40px] rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold transition cursor-pointer whitespace-nowrap"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>Save Form Defaults</span>
                  </button>
                </div>
              </form>
            )}

            {isAdmin && activeCategoryMeta.id === 'formatting' && (
              <form onSubmit={handleSave} className="divide-y divide-slate-100 animate-fade-in">
                {/* Time Input Format */}
                <div className="px-5 py-4 sm:px-6 grid grid-cols-1 md:grid-cols-12 gap-3 md:gap-6 items-center">
                  <div className="md:col-span-5">
                    <label
                      htmlFor="timeFormat"
                      className="block text-xs font-semibold text-slate-800"
                    >
                      Time Input Format
                    </label>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Controls clock notation across entry forms and generated PDFs.
                    </p>
                  </div>
                  <div className="md:col-span-7">
                    <select
                      id="timeFormat"
                      value={settings.timeFormat}
                      onChange={(e) =>
                        setSettings({ ...settings, timeFormat: e.target.value as TimeFormat })
                      }
                      className="w-full h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-medium text-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-hidden"
                    >
                      <option value="24h">24-Hour Military Format (e.g. 17:30, 21:00)</option>
                      <option value="12h">12-Hour AM/PM Format</option>
                    </select>
                  </div>
                </div>

                {/* Overtime Duration Display */}
                <div className="px-5 py-4 sm:px-6 grid grid-cols-1 md:grid-cols-12 gap-3 md:gap-6 items-center">
                  <div className="md:col-span-5">
                    <label
                      htmlFor="otDisplayFormat"
                      className="block text-xs font-semibold text-slate-800"
                    >
                      Overtime Duration Display
                    </label>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Display overtime totals in HH:MM or decimal hours.
                    </p>
                  </div>
                  <div className="md:col-span-7">
                    <select
                      id="otDisplayFormat"
                      value={settings.otDisplayFormat}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          otDisplayFormat: e.target.value as OTDisplayFormat,
                        })
                      }
                      className="w-full h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-medium text-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-hidden"
                    >
                      <option value="hhmm">Hours &amp; Minutes (e.g. 02:30)</option>
                      <option value="decimal">Decimal Hours (e.g. 2.50)</option>
                    </select>
                  </div>
                </div>

                {/* PDF Generated Filename Pattern */}
                <div className="px-5 py-5 sm:px-6 grid grid-cols-1 md:grid-cols-12 gap-3 md:gap-6 items-start">
                  <div className="md:col-span-5">
                    <label
                      htmlFor="pdfFilenamePattern"
                      className="block text-xs font-semibold text-slate-800"
                    >
                      PDF Generated Filename Pattern
                    </label>
                    <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                      Supported tokens:{' '}
                      <code className="font-mono text-slate-700">[EmployeeName]</code>,{' '}
                      <code className="font-mono text-slate-700">[Month]</code>,{' '}
                      <code className="font-mono text-slate-700">[Year]</code>.
                    </p>
                  </div>
                  <div className="md:col-span-7 space-y-2">
                    <input
                      id="pdfFilenamePattern"
                      type="text"
                      value={settings.pdfFilenamePattern}
                      onChange={(e) =>
                        setSettings({ ...settings, pdfFilenamePattern: e.target.value })
                      }
                      className="w-full h-10 rounded-xl border border-slate-200 px-3 text-xs text-slate-800 font-mono focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-hidden"
                    />
                    <div className="text-xs text-slate-500 font-mono truncate">
                      Preview: <span className="text-slate-700">{sampleFilenamePreview}</span>
                    </div>
                  </div>
                </div>

                <div className="px-5 py-4 sm:px-6 bg-slate-50/70 flex items-center justify-between gap-3">
                  <span className="text-xs text-slate-500">
                    {hasUnsavedSettings ? 'You have unsaved changes.' : 'All changes are saved.'}
                  </span>
                  <button
                    type="submit"
                    className="inline-flex items-center gap-2 px-5 min-h-[40px] rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold transition cursor-pointer whitespace-nowrap"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>Save Formatting Settings</span>
                  </button>
                </div>
              </form>
            )}

            {isAdmin && activeCategoryMeta.id === 'printer' && (
              <form onSubmit={handleSave} className="divide-y divide-slate-100 animate-fade-in">
                {/* Horizontal X Offset */}
                <div className="px-5 py-5 sm:px-6 grid grid-cols-1 md:grid-cols-12 gap-3 md:gap-6 items-center">
                  <div className="md:col-span-5">
                    <label
                      htmlFor="globalPrinterOffsetX"
                      className="block text-xs font-semibold text-slate-800"
                    >
                      Horizontal Offset (X mm)
                    </label>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Shift printed content right (+) or left (-) across the A4 page.
                    </p>
                  </div>
                  <div className="md:col-span-7 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setSettings({
                          ...settings,
                          globalPrinterOffsetX: Number(
                            (settings.globalPrinterOffsetX - 0.5).toFixed(1)
                          ),
                        })
                      }
                      aria-label="Decrease horizontal offset by 0.5 mm"
                      className="h-10 w-10 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 inline-flex items-center justify-center transition cursor-pointer shrink-0"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <input
                      id="globalPrinterOffsetX"
                      type="number"
                      step="0.5"
                      value={settings.globalPrinterOffsetX}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          globalPrinterOffsetX: parseFloat(e.target.value) || 0,
                        })
                      }
                      className="flex-1 h-10 rounded-xl border border-slate-200 px-3 font-mono tabular-nums text-center text-xs font-semibold text-slate-900 bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-hidden"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setSettings({
                          ...settings,
                          globalPrinterOffsetX: Number(
                            (settings.globalPrinterOffsetX + 0.5).toFixed(1)
                          ),
                        })
                      }
                      aria-label="Increase horizontal offset by 0.5 mm"
                      className="h-10 w-10 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 inline-flex items-center justify-center transition cursor-pointer shrink-0"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Vertical Y Offset */}
                <div className="px-5 py-5 sm:px-6 grid grid-cols-1 md:grid-cols-12 gap-3 md:gap-6 items-center">
                  <div className="md:col-span-5">
                    <label
                      htmlFor="globalPrinterOffsetY"
                      className="block text-xs font-semibold text-slate-800"
                    >
                      Vertical Offset (Y mm)
                    </label>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Shift printed content down (+) or up (-) on the A4 sheet.
                    </p>
                  </div>
                  <div className="md:col-span-7 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setSettings({
                          ...settings,
                          globalPrinterOffsetY: Number(
                            (settings.globalPrinterOffsetY - 0.5).toFixed(1)
                          ),
                        })
                      }
                      aria-label="Decrease vertical offset by 0.5 mm"
                      className="h-10 w-10 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 inline-flex items-center justify-center transition cursor-pointer shrink-0"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <input
                      id="globalPrinterOffsetY"
                      type="number"
                      step="0.5"
                      value={settings.globalPrinterOffsetY}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          globalPrinterOffsetY: parseFloat(e.target.value) || 0,
                        })
                      }
                      className="flex-1 h-10 rounded-xl border border-slate-200 px-3 font-mono tabular-nums text-center text-xs font-semibold text-slate-900 bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-hidden"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setSettings({
                          ...settings,
                          globalPrinterOffsetY: Number(
                            (settings.globalPrinterOffsetY + 0.5).toFixed(1)
                          ),
                        })
                      }
                      aria-label="Increase vertical offset by 0.5 mm"
                      className="h-10 w-10 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 inline-flex items-center justify-center transition cursor-pointer shrink-0"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Reset Zero Quick Utility */}
                {(settings.globalPrinterOffsetX !== 0 || settings.globalPrinterOffsetY !== 0) && (
                  <div className="px-5 py-3.5 sm:px-6 flex items-center justify-between gap-3 bg-slate-50/40">
                    <span className="text-xs text-slate-600 tabular-nums">
                      Current shift: X {settings.globalPrinterOffsetX} mm · Y{' '}
                      {settings.globalPrinterOffsetY} mm
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setSettings({
                          ...settings,
                          globalPrinterOffsetX: 0,
                          globalPrinterOffsetY: 0,
                        })
                      }
                      className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 transition cursor-pointer whitespace-nowrap"
                    >
                      Reset offsets to 0 mm
                    </button>
                  </div>
                )}

                <div className="px-5 py-4 sm:px-6 bg-slate-50/70 flex items-center justify-between gap-3">
                  <span className="text-xs text-slate-500">
                    {hasUnsavedSettings ? 'You have unsaved changes.' : 'All changes are saved.'}
                  </span>
                  <button
                    type="submit"
                    className="inline-flex items-center gap-2 px-5 min-h-[40px] rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold transition cursor-pointer whitespace-nowrap"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>Save Printer Offsets</span>
                  </button>
                </div>
              </form>
            )}

            {/* ================= CALENDAR SETTINGS (SUPER ADMIN) ================= */}
            {isSuperAdmin && activeCategoryMeta.id === 'calendar' && (
              <div className="divide-y divide-slate-100 animate-fade-in">
                {/* Sub-navigation bar */}
                <div className="px-5 py-3.5 sm:px-6 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="text-xs text-slate-600">
                    Super Admin &middot; Starts on{' '}
                    <span className="font-semibold text-slate-900">
                      {getFirstDayOfWeekLabel(firstDayOfWeek)}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-200/60 overflow-x-auto no-scrollbar shrink-0">
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
                  <div className="px-5 py-3 sm:px-6">
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
                  </div>
                )}

                {/* Sub-Panel A: First Day of Week */}
                {(calendarSubTab === 'all' || calendarSubTab === 'week') && (
                  <div className="px-5 py-5 sm:px-6 space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <CalendarDays className="w-4 h-4 text-indigo-600" />
                        <h3 className="text-sm font-semibold text-slate-900">First Day of Week</h3>
                      </div>
                      <span className="text-xs font-medium text-indigo-700">
                        Active: {getFirstDayOfWeekLabel(firstDayOfWeek)}
                      </span>
                    </div>

                    <p className="text-xs text-slate-500">
                      Select which day begins each week row across the Integrated Calendar grid.
                      Saturday remains tinted soft grey and Sunday remains tinted soft red in any
                      column position.
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
                            className={`px-3 min-h-[42px] rounded-xl border text-xs font-semibold transition cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-60 ${
                              isSelected
                                ? 'bg-slate-900 border-slate-900 text-white'
                                : isSunday
                                ? 'bg-rose-50/70 border-rose-200 text-rose-700 hover:bg-rose-100/70'
                                : isSaturday
                                ? 'bg-slate-100 border-slate-200 text-slate-700 hover:bg-slate-200/70'
                                : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                            }`}
                          >
                            {isSelected && <Check className="w-3.5 h-3.5 shrink-0" />}
                            <span>{dayName}</span>
                          </button>
                        );
                      })}
                    </div>

                    <div className="pt-1">
                      <span className="block text-xs font-medium text-slate-500 mb-2">
                        Calendar column order preview
                      </span>
                      <div className="grid grid-cols-7 gap-1.5 text-center">
                        {weekPreviewColumns.map((col) => (
                          <div
                            key={col.short}
                            className={`py-2 rounded-lg text-xs font-semibold border ${
                              col.isSunday
                                ? 'bg-rose-50 text-rose-700 border-rose-200'
                                : col.isSaturday
                                ? 'bg-slate-100 text-slate-700 border-slate-200'
                                : 'bg-slate-50/60 text-slate-600 border-slate-200'
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
                  <div className="px-5 py-5 sm:px-6 space-y-5">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <Palette className="w-4 h-4 text-indigo-600" />
                        <h3 className="text-sm font-semibold text-slate-900">
                          Holiday Categories &amp; Date Colors
                        </h3>
                      </div>
                      <p className="text-xs text-slate-500">
                        Updates apply immediately to the Integrated Calendar marquee and date
                        highlights.
                      </p>
                    </div>

                    <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
                      {holidayCategories.map((cat) => {
                        const theme = getHolidayColorTheme(cat.color);
                        const draftName = categoryNameEdits[cat.id] ?? cat.name;
                        const hasNameChanged =
                          draftName.trim() !== '' && draftName.trim() !== cat.name;

                        return (
                          <div key={cat.id} className="p-4 bg-white space-y-3">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                              <div className="flex items-center gap-2.5 flex-1 min-w-0">
                                <span
                                  className={`w-3.5 h-3.5 rounded-full shrink-0 ${theme.swatchClass}`}
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
                                  className="flex-1 min-w-0 h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-900 focus:border-indigo-500 focus:outline-hidden"
                                />
                                {hasNameChanged && (
                                  <button
                                    type="button"
                                    disabled={isSavingCategory}
                                    onClick={() => handleSaveCategoryName(cat)}
                                    className="px-3 h-9 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold transition cursor-pointer shrink-0 disabled:opacity-60"
                                  >
                                    Save
                                  </button>
                                )}
                              </div>

                              <div className="flex items-center justify-between sm:justify-end gap-2.5">
                                <div className="inline-flex items-center gap-2 text-xs font-medium text-slate-500">
                                  <span>Preview:</span>
                                  <span
                                    className={`w-7 h-7 rounded-full inline-flex items-center justify-center text-white text-xs font-bold tabular-nums ${theme.swatchClass}`}
                                  >
                                    25
                                  </span>
                                </div>
                                {!cat.isDefault && (
                                  <button
                                    type="button"
                                    onClick={() => setCategoryToDelete(cat)}
                                    className="p-2 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                                    title={`Delete ${cat.name}`}
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                )}
                              </div>
                            </div>

                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-xs text-slate-500 mr-1">Color:</span>
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
                                    {isSelected && (
                                      <Check className="w-3.5 h-3.5 text-white stroke-[3]" />
                                    )}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Add New Custom Holiday Category */}
                    <form
                      onSubmit={handleAddHolidayCategory}
                      className="p-4 rounded-xl bg-slate-50/80 border border-slate-200/80 space-y-3"
                    >
                      <div className="text-xs font-semibold text-slate-900 flex items-center gap-1.5">
                        <Plus className="w-4 h-4 text-indigo-600" />
                        <span>Add Custom Holiday Category</span>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
                        <div className="md:col-span-5">
                          <label className="block text-[11px] font-medium text-slate-600 mb-1">
                            Category Name
                          </label>
                          <input
                            type="text"
                            value={newCategoryName}
                            onChange={(e) => setNewCategoryName(e.target.value)}
                            placeholder="e.g. Company Holiday, Regional"
                            className="w-full h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs text-slate-900 focus:border-indigo-500 focus:outline-hidden"
                          />
                        </div>

                        <div className="md:col-span-5">
                          <span className="block text-[11px] font-medium text-slate-600 mb-1.5">
                            Category Color
                          </span>
                          <div className="flex flex-wrap items-center gap-2 min-h-[32px]">
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
                                  {isSelected && (
                                    <Check className="w-3 h-3 text-white stroke-[3]" />
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        <div className="md:col-span-2 flex justify-end">
                          <button
                            type="submit"
                            disabled={isSavingCategory}
                            className="w-full inline-flex items-center justify-center gap-1.5 px-4 h-10 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition cursor-pointer disabled:opacity-60 whitespace-nowrap"
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
                  <div className="px-5 py-5 sm:px-6 space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <h3 className="text-sm font-semibold text-slate-900">
                          Calendar Entries &amp; Annual Seed
                        </h3>
                        <p className="text-xs text-slate-500 mt-0.5">
                          Add individual holidays directly or import the 2026 standard public &amp;
                          bank holiday schedule.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setIsSeedHolidaysModalOpen(true)}
                        className="inline-flex items-center justify-center gap-1.5 px-3.5 min-h-[40px] rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-xs font-semibold transition cursor-pointer shrink-0 whitespace-nowrap"
                      >
                        <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                        <span>Import 2026 Holidays</span>
                      </button>
                    </div>

                    <form
                      onSubmit={handleQuickAddHoliday}
                      className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end p-4 rounded-xl bg-slate-50/80 border border-slate-200/80"
                    >
                      <div className="md:col-span-3">
                        <label className="block text-[11px] font-medium text-slate-600 mb-1">
                          Date
                        </label>
                        <input
                          type="date"
                          value={quickHolidayDate}
                          onChange={(e) => setQuickHolidayDate(e.target.value)}
                          className="w-full h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs text-slate-900 tabular-nums"
                        />
                      </div>
                      <div className="md:col-span-4">
                        <label className="block text-[11px] font-medium text-slate-600 mb-1">
                          Holiday Name
                        </label>
                        <input
                          type="text"
                          value={quickHolidayName}
                          onChange={(e) => setQuickHolidayName(e.target.value)}
                          placeholder="e.g. Company Anniversary"
                          className="w-full h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs text-slate-900"
                        />
                      </div>
                      <div className="md:col-span-3">
                        <label className="block text-[11px] font-medium text-slate-600 mb-1">
                          Category
                        </label>
                        <select
                          value={quickHolidayCategory}
                          onChange={(e) => setQuickHolidayCategory(e.target.value)}
                          className="w-full h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs text-slate-900"
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
                          className="w-full inline-flex items-center justify-center gap-1.5 px-3 h-10 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition cursor-pointer disabled:opacity-60 whitespace-nowrap"
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

            {/* ================= AUTOMATED EMAIL (MAKE WEBHOOK) ================= */}
            {isAdmin && activeCategoryMeta.id === 'email_automation' && (
              <div className="divide-y divide-slate-100 animate-fade-in">
                {/* Webhook Connection & Payload Mapping */}
                <div className="px-5 py-5 sm:px-6 grid grid-cols-1 md:grid-cols-12 gap-4 md:gap-6 items-start">
                  <div className="md:col-span-5 space-y-1">
                    <div className="text-xs font-semibold text-slate-800">
                      Make Webhook Delivery
                    </div>
                    <p className="text-xs text-slate-500 leading-relaxed">
                      All system emails—Sign-In Alerts, Password Changes, OT/OP Claim Receipts,
                      Role Updates, Broadcasts, and OTP Resets—route through Make without Gmail
                      OAuth popups.
                    </p>
                  </div>
                  <div className="md:col-span-7 space-y-3 text-xs">
                    <div className="p-3.5 rounded-xl bg-slate-50/80 border border-slate-200/80 space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-medium text-slate-500">Active Endpoint</span>
                        <span className="text-xs font-semibold text-emerald-700">
                          Active &middot; {makeWebhookInfo.host}
                        </span>
                      </div>
                      <div className="font-mono font-semibold text-slate-900 break-all tabular-nums">
                        {makeWebhookInfo.maskedUrl}
                      </div>
                    </div>

                    <div className="p-3.5 rounded-xl bg-slate-50/80 border border-slate-200/80 space-y-1 text-slate-600 leading-relaxed">
                      <div className="font-semibold text-slate-800">Make Field Mapping</div>
                      <div>
                        To: <code className="font-mono text-slate-900">to</code> &middot; Subject:{' '}
                        <code className="font-mono text-slate-900">subject</code> &middot; Content
                        Type: <span className="font-semibold text-indigo-700">HTML</span> &middot;
                        Body: <code className="font-mono text-slate-900">html</code>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Activity Triggers */}
                <div className="px-5 py-5 sm:px-6 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-900">
                        Automatic Activity Email Triggers
                      </h3>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Toggle which events automatically email the affected staff member via Make.
                      </p>
                    </div>
                    <span className="text-xs font-medium text-slate-500">Synced across portal</span>
                  </div>

                  <div className="divide-y divide-slate-100 border border-slate-200/90 rounded-xl overflow-hidden">
                    {(
                      [
                        {
                          key: 'loginAlerts' as EmailActivitySettingKey,
                          title: 'System Sign-In Alerts',
                          eventKey: 'activity_login',
                          desc: 'Email staff whenever a Google, PF Number, or Email sign-in succeeds.',
                        },
                        {
                          key: 'passwordChangeAlerts' as EmailActivitySettingKey,
                          title: 'Password Changed Notices',
                          eventKey: 'activity_password_changed',
                          desc: 'Send confirmation after first-login setup, self-updates, or OTP resets.',
                        },
                        {
                          key: 'claimSubmissionAlerts' as EmailActivitySettingKey,
                          title: 'OT / OP Claim Submissions',
                          eventKey: 'activity_claim_submitted',
                          desc: 'Send a submission receipt with hours, days, and payable total.',
                        },
                        {
                          key: 'roleChangeAlerts' as EmailActivitySettingKey,
                          title: 'Admin Role & Policy Updates',
                          eventKey: 'activity_role_changed',
                          desc: 'Email a Before/After summary when role, designation, OT cap, or rate lock changes.',
                        },
                      ] as const
                    ).map((item) => {
                      const enabled = activityEmailSettings[item.key];
                      const isSavingThis = savingActivityKey === item.key;
                      return (
                        <div
                          key={item.key}
                          className={`px-4 py-3.5 bg-white flex items-center justify-between gap-4 ${
                            isSavingThis ? 'opacity-60' : ''
                          }`}
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs font-semibold text-slate-900">
                                {item.title}
                              </span>
                              <span className="text-xs font-mono text-slate-400">
                                &middot; {item.eventKey}
                              </span>
                            </div>
                            <p className="text-xs text-slate-500 mt-0.5 leading-snug">
                              {item.desc}
                            </p>
                          </div>

                          <button
                            type="button"
                            role="switch"
                            aria-checked={enabled}
                            aria-label={`Toggle ${item.title}`}
                            disabled={isSavingThis}
                            onClick={async () => {
                              if (savingActivityKey) return;
                              const nextVal = !enabled;
                              setSavingActivityKey(item.key);
                              setMakeEmailFeedback(null);
                              try {
                                const saved = await saveEmailActivitySettings(
                                  { [item.key]: nextVal },
                                  getCallingName(
                                    userProfile,
                                    currentUser?.email || 'Administrator'
                                  )
                                );
                                setActivityEmailSettings(saved);
                                setMakeEmailFeedback({
                                  type: 'success',
                                  text: `${item.title} ${
                                    nextVal ? 'enabled' : 'paused'
                                  } for automatic email delivery.`,
                                });
                                await recordAuditLog({
                                  action: 'SETTINGS_UPDATE',
                                  actionLabel: `${
                                    nextVal ? 'Enabled' : 'Disabled'
                                  } ${item.title} Emails`,
                                  targetType: 'settings',
                                  targetId: 'emailActivitySettings',
                                  targetDescription: item.title,
                                  afterState: { [item.key]: nextVal },
                                }).catch(() => {});
                              } catch (err: any) {
                                setMakeEmailFeedback({
                                  type: 'error',
                                  text: err?.message || 'Failed to save activity email setting.',
                                });
                              } finally {
                                setSavingActivityKey(null);
                              }
                            }}
                            className={`shrink-0 inline-flex items-center w-10 h-6 rounded-full p-0.5 transition-colors cursor-pointer ${
                              enabled ? 'bg-emerald-500' : 'bg-slate-300'
                            }`}
                          >
                            <span
                              className={`w-5 h-5 rounded-full bg-white shadow-xs transform transition-transform ${
                                enabled ? 'translate-x-4' : 'translate-x-0'
                              }`}
                            />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {makeEmailFeedback && (
                  <div className="px-5 py-3.5 sm:px-6">
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
                  </div>
                )}

                {/* Send Test Email Preview */}
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (isSendingTestEmail) return;
                    setIsSendingTestEmail(true);
                    setMakeEmailFeedback(null);
                    const previewLabels: Record<MakeTestEmailTemplateMode, string> = {
                      standard: 'Standard integration test payload',
                      password_reset: 'Modern 6-digit OTP reset preview',
                      activity_login: 'System sign-in alert preview',
                      activity_password_changed: 'Password changed confirmation preview',
                      activity_claim_submitted: 'OT / OP claim submission receipt preview',
                      activity_role_changed: 'Admin role & policy change preview',
                    };
                    try {
                      const res = await sendTestEmailViaMake({
                        to: testEmailRecipient,
                        recipientName: getCallingName(userProfile, 'Administrator'),
                        senderName: getCallingName(
                          userProfile,
                          currentUser?.email || 'Administrator'
                        ),
                        senderEmail: userProfile?.email || currentUser?.email || '',
                        templateMode: testEmailTemplateMode,
                      });
                      if (res.success) {
                        setMakeEmailFeedback({
                          type: 'success',
                          text: `${previewLabels[testEmailTemplateMode]} accepted by ${
                            res.webhookHost
                          } (${
                            res.responseText || 'Accepted'
                          }). Check your inbox or Make scenario execution log.`,
                        });
                        await recordAuditLog({
                          action: 'EMAIL_DISPATCH',
                          actionLabel: `Sent Make Email Preview (${testEmailTemplateMode})`,
                          targetType: 'settings',
                          targetDescription: `Test dispatch to ${testEmailRecipient}`,
                          details: {
                            recipientEmail: testEmailRecipient,
                            provider: 'make_webhook',
                            templateMode: testEmailTemplateMode,
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
                  className="px-5 py-5 sm:px-6 bg-slate-50/50 space-y-3"
                >
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900">
                      Test Scenario &amp; Email Templates
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Pick a template and dispatch a live sample email to verify HTML formatting.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    {(
                      [
                        { id: 'standard', label: 'Standard Test' },
                        { id: 'password_reset', label: 'OTP Password Reset' },
                        { id: 'activity_login', label: 'Sign-In Alert' },
                        { id: 'activity_password_changed', label: 'Password Changed' },
                        { id: 'activity_claim_submitted', label: 'OT/OP Claim Receipt' },
                        { id: 'activity_role_changed', label: 'Role & Policy Update' },
                      ] as Array<{ id: MakeTestEmailTemplateMode; label: string }>
                    ).map((tpl) => (
                      <button
                        key={tpl.id}
                        type="button"
                        onClick={() => setTestEmailTemplateMode(tpl.id)}
                        className={`px-3 min-h-[34px] rounded-lg text-xs font-semibold transition cursor-pointer ${
                          testEmailTemplateMode === tpl.id
                            ? 'bg-slate-900 text-white'
                            : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        {tpl.label}
                      </button>
                    ))}
                  </div>

                  <div className="flex flex-col sm:flex-row gap-2.5">
                    <input
                      type="email"
                      required
                      value={testEmailRecipient}
                      onChange={(e) => setTestEmailRecipient(e.target.value)}
                      placeholder="recipient@company.com"
                      className="flex-1 h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs text-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-hidden"
                    />
                    <button
                      type="submit"
                      disabled={isSendingTestEmail}
                      className="inline-flex items-center justify-center gap-1.5 px-4 h-10 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold transition cursor-pointer whitespace-nowrap disabled:opacity-60"
                    >
                      <Mail className="w-3.5 h-3.5" />
                      <span>{isSendingTestEmail ? 'Sending Preview...' : 'Send Test Email'}</span>
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* ================= GOOGLE DRIVE PREVIEW ================= */}
            {isAdmin && activeCategoryMeta.id === 'workspace' && (
              <div className="divide-y divide-slate-100 animate-fade-in">
                <div className="px-5 py-5 sm:px-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-start gap-3 max-w-xl">
                    <svg className="w-6 h-6 shrink-0 mt-0.5" viewBox="0 0 87.3 78" fill="currentColor">
                      <path
                        d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.45z"
                        fill="#0066da"
                      />
                      <path
                        d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44c-.8 1.35-1.2 2.9-1.2 4.45h27.5z"
                        fill="#00ac47"
                      />
                      <path
                        d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.35 1.2-2.9 1.2-4.5h-27.5l5.85 10.15z"
                        fill="#ea4335"
                      />
                      <path
                        d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.2z"
                        fill="#00832d"
                      />
                      <path
                        d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z"
                        fill="#2684fc"
                      />
                      <path
                        d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 28h27.45c0-1.55-.4-3.1-1.2-4.5z"
                        fill="#ffba00"
                      />
                    </svg>
                    <div className="space-y-1">
                      <div className="text-sm font-semibold text-slate-900">
                        Google Drive PDF Viewer
                      </div>
                      <p className="text-xs text-slate-500 leading-relaxed">
                        Uploads generated A4 PDF claim forms to Google Drive for interactive in-site
                        zoom, print, and export previews. Scope: <code className="font-mono">drive.file</code>.
                      </p>
                    </div>
                  </div>
                  <div className="text-xs font-semibold shrink-0">
                    <span className={isGoogleConnected ? 'text-emerald-700' : 'text-slate-500'}>
                      {isGoogleConnected ? 'Connected' : 'Not connected'}
                    </span>
                  </div>
                </div>

                {googleWorkspaceMessage && (
                  <div className="px-5 py-3.5 sm:px-6">
                    <div className="p-3 rounded-xl bg-blue-50 border border-blue-200 text-xs text-blue-800">
                      {googleWorkspaceMessage}
                    </div>
                  </div>
                )}

                <div className="px-5 py-4 sm:px-6 bg-slate-50/60 flex items-center justify-between flex-wrap gap-3">
                  {!isGoogleConnected ? (
                    <>
                      <span className="text-xs text-slate-500">
                        Authorize a Google account to enable Drive PDF previews.
                      </span>
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
                        className="inline-flex items-center gap-2 px-4 min-h-[40px] rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition cursor-pointer whitespace-nowrap"
                      >
                        <span>
                          {isConnectingGoogle ? 'Connecting...' : 'Connect Google Drive Account'}
                        </span>
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="text-xs text-emerald-700 font-semibold flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4 shrink-0" />
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
                        className="px-3.5 min-h-[38px] rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold transition cursor-pointer whitespace-nowrap"
                      >
                        Disconnect
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* ================= LIVE OTA UPDATES (SUPER ADMIN) ================= */}
            {isSuperAdmin && activeCategoryMeta.id === 'ota' && (
              <div className="divide-y divide-slate-100 animate-fade-in">
                <div className="px-5 py-4 sm:px-6 grid grid-cols-1 md:grid-cols-12 gap-3 md:gap-6 items-start">
                  <div className="md:col-span-5">
                    <div className="text-xs font-semibold text-slate-800">
                      Running In This Tab
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      Verifies <code className="font-mono">/version.json</code> &amp; Service Worker
                      cache.
                    </div>
                  </div>
                  <div className="md:col-span-7 space-y-1">
                    <div className="font-mono text-sm font-bold text-slate-900 tabular-nums">
                      v{otaState.currentVersion}
                    </div>
                    <div className="text-xs text-slate-500 tabular-nums">
                      Commit{' '}
                      <span className="font-mono font-medium text-slate-700">
                        {otaState.currentCommitSha}
                      </span>{' '}
                      &middot; Built {new Date(otaState.currentBuildTime).toLocaleString()}
                    </div>
                  </div>
                </div>

                <div className="px-5 py-4 sm:px-6 grid grid-cols-1 md:grid-cols-12 gap-3 md:gap-6 items-start">
                  <div className="md:col-span-5">
                    <div className="text-xs font-semibold text-slate-800">
                      Latest Firestore Broadcast Signal
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      Real-time release manifest listened to by open browser tabs.
                    </div>
                  </div>
                  <div className="md:col-span-7 space-y-1">
                    <div className="font-mono text-sm font-bold text-indigo-700 tabular-nums">
                      {otaState.remoteRelease?.version || 'Not published yet'}
                    </div>
                    <div className="text-xs text-slate-500">
                      {otaState.remoteRelease?.updatedAt
                        ? `Published ${new Date(
                            otaState.remoteRelease.updatedAt
                          ).toLocaleString()} by ${otaState.remoteRelease.updatedBy || 'System'}`
                        : 'Push via GitHub Actions or broadcast manually below.'}
                    </div>
                  </div>
                </div>

                {otaFeedback && (
                  <div className="px-5 py-3.5 sm:px-6">
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
                  </div>
                )}

                <div className="px-5 py-5 sm:px-6 bg-slate-50/50 space-y-3">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900">
                      Broadcast Instant Update Signal
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Idle tabs update automatically without refreshing, while active claim drafts
                      remain preserved.
                    </p>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-2.5">
                    <input
                      type="text"
                      value={otaReleaseNotesInput}
                      onChange={(e) => setOtaReleaseNotesInput(e.target.value)}
                      placeholder="Optional release note (e.g. Updated OT calculation rules)"
                      maxLength={200}
                      className="flex-1 h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs text-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-hidden"
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
                      className="inline-flex items-center justify-center gap-1.5 px-3.5 h-10 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold transition cursor-pointer whitespace-nowrap disabled:opacity-60"
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
                      className="inline-flex items-center justify-center gap-1.5 px-4 h-10 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition cursor-pointer whitespace-nowrap disabled:opacity-60"
                    >
                      <Radio className="w-3.5 h-3.5" />
                      <span>{isBroadcastingOta ? 'Broadcasting...' : 'Broadcast Update'}</span>
                    </button>
                  </div>
                </div>

                <div className="px-5 py-4 sm:px-6 text-xs text-slate-600 space-y-1">
                  <div className="font-semibold text-slate-800">
                    Automatic GitHub + Vercel Push Setup
                  </div>
                  <p className="leading-relaxed">
                    Add a repository secret named{' '}
                    <code className="font-mono text-slate-900">FIREBASE_SERVICE_ACCOUNT_JSON</code>{' '}
                    to automatically broadcast updates after each Vercel production deploy.
                  </p>
                </div>
              </div>
            )}

            {/* ================= PRIVACY & DATA SECURITY ================= */}
            {isAdmin && activeCategoryMeta.id === 'privacy' && (
              <div className="divide-y divide-slate-100 animate-fade-in">
                {backupStatus && (
                  <div className="px-5 py-3.5 sm:px-6">
                    <div className="p-3 rounded-xl bg-blue-50 border border-blue-200 text-xs text-blue-800">
                      {backupStatus}
                    </div>
                  </div>
                )}

                <div className="px-5 py-5 sm:px-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="space-y-1 max-w-lg">
                    <h3 className="text-sm font-semibold text-slate-900">
                      Export System JSON Backup
                    </h3>
                    <p className="text-xs text-slate-500 leading-relaxed">
                      Downloads a full JSON archive containing employee profiles, claim history, and
                      template calibrations.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleExportBackup}
                    className="inline-flex items-center justify-center gap-2 px-4 min-h-[40px] rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold transition cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Export JSON Backup</span>
                  </button>
                </div>

                <div className="px-5 py-5 sm:px-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="space-y-1 max-w-lg">
                    <h3 className="text-sm font-semibold text-slate-900">
                      Restore Data Backup
                    </h3>
                    <p className="text-xs text-slate-500 leading-relaxed">
                      Restore claims, employee profiles, and calibrated templates from a saved JSON
                      snapshot.
                    </p>
                  </div>
                  <div className="shrink-0">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="inline-flex items-center justify-center gap-2 px-4 min-h-[40px] rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold transition cursor-pointer whitespace-nowrap"
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

                <div className="px-5 py-5 sm:px-6 bg-rose-50/40 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="space-y-1 max-w-lg">
                    <h3 className="text-sm font-semibold text-rose-800 flex items-center gap-1.5">
                      <AlertTriangle className="w-4 h-4 text-rose-600" />
                      <span>Factory Reset</span>
                    </h3>
                    <p className="text-xs text-rose-700/80 leading-relaxed">
                      Clears local storage and reverts local application preferences to first-run
                      defaults.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsResetConfirmOpen(true)}
                    className="px-4 min-h-[40px] rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold transition shrink-0 cursor-pointer whitespace-nowrap"
                  >
                    Reset Application Data
                  </button>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Modals */}
      <PasswordResetModal
        isOpen={isPasswordModalOpen}
        onPasswordChanged={() => {
          setIsPasswordModalOpen(false);
          refreshUserProfile();
        }}
      />

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
