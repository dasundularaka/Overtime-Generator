import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Calendar as CalendarIcon,
  Plus,
  Trash2,
  Edit2,
  Download,
  Upload,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Info,
  CalendarCheck,
  ChevronLeft,
  ChevronRight,
  Sun,
  Building2,
  Landmark,
  Star,
  ExternalLink,
  Printer,
  Search,
  Clock,
  ArrowRight,
  CalendarDays,
  ListFilter,
  Check,
  Share2,
  BookOpen,
} from 'lucide-react';
import {
  subscribeToHolidays,
  saveHoliday,
  deleteHoliday,
  seedStandardHolidays,
  DEFAULT_ANNUAL_HOLIDAYS,
} from '../services/holidayService';
import { Holiday, HolidayType } from '../types';
import { useAuth } from '../context/AuthContext';
import { recordAuditLog } from '../utils/auditLogger';
import { ConfirmationModal } from './ConfirmationModal';
import { MONTH_NAMES, DAYS_SHORT } from '../utils/timeCalculations';
import {
  generateIcsCalendar,
  downloadIcsFile,
  generateGoogleCalendarUrl,
} from '../utils/icalGenerator';

interface CalendarManagerProps {
  onNavigateToNewClaim?: (dateStr?: string) => void;
}

export const CalendarManager: React.FC<CalendarManagerProps> = ({ onNavigateToNewClaim }) => {
  const { isSuperAdmin } = useAuth();
  const canEditCalendar = isSuperAdmin;
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Month & Year Filter
  const now = new Date();
  const [selectedYear, setSelectedYear] = useState<number>(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<number>(now.getMonth()); // 0-indexed

  // Active View Mode: 'grid' | 'agenda' | 'rules'
  const [viewMode, setViewMode] = useState<'grid' | 'agenda' | 'rules'>('grid');

  // Category filter & Search
  const [selectedCategory, setSelectedCategory] = useState<'all' | HolidayType>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Selected Day Details Modal / Drawer
  const [inspectedDateStr, setInspectedDateStr] = useState<string | null>(null);

  // Modal State for Add / Edit Holiday
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingHoliday, setEditingHoliday] = useState<Holiday | null>(null);
  const [formDate, setFormDate] = useState<string>('');
  const [formName, setFormName] = useState<string>('');
  const [formType, setFormType] = useState<HolidayType>('public');
  const [formDescription, setFormDescription] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Delete confirmation
  const [holidayToDelete, setHolidayToDelete] = useState<Holiday | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Import / Seed confirmation
  const [isSeedModalOpen, setIsSeedModalOpen] = useState(false);
  const [isSeeding, setIsSeeding] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isImportingFile, setIsImportingFile] = useState(false);

  // Export dropdown state
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
  const [hasCopiedIcs, setHasCopiedIcs] = useState(false);

  useEffect(() => {
    setLoading(true);
    const unsub = subscribeToHolidays((list) => {
      setHolidays(list);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const openAddModal = (initialDate?: string) => {
    if (!canEditCalendar) return;
    setEditingHoliday(null);
    setFormDate(initialDate || `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-01`);
    setFormName('');
    setFormType('public');
    setFormDescription('');
    setActionError(null);
    setIsModalOpen(true);
  };

  const openEditModal = (h: Holiday) => {
    if (!canEditCalendar) return;
    setEditingHoliday(h);
    setFormDate(h.date);
    setFormName(h.name);
    setFormType(h.type || 'public');
    setFormDescription(h.description || '');
    setActionError(null);
    setIsModalOpen(true);
  };

  const handleSaveHoliday = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEditCalendar) {
      setActionError('Only Super Admin can modify the calendar.');
      return;
    }
    if (!formDate || !formName.trim()) {
      setActionError('Please provide both holiday date and name.');
      return;
    }

    setIsSubmitting(true);
    setActionError(null);
    try {
      const saved = await saveHoliday({
        id: editingHoliday?.id,
        date: formDate,
        name: formName.trim(),
        type: formType,
        description: formDescription.trim(),
      });

      await recordAuditLog({
        action: editingHoliday ? 'HOLIDAY_UPDATE' : 'HOLIDAY_ADD',
        actionLabel: editingHoliday ? 'Updated Calendar Holiday / Event' : 'Added Custom Calendar Holiday',
        targetType: 'holiday',
        targetId: saved.id,
        targetDescription: `${saved.name} (${saved.date})`,
        beforeState: editingHoliday || undefined,
        afterState: saved,
        details: {
          type: saved.type,
          date: saved.date,
        },
      });

      setIsModalOpen(false);
      setActionSuccess(`Holiday "${formName.trim()}" saved successfully!`);
      setTimeout(() => setActionSuccess(null), 3500);
    } catch (err: any) {
      setActionError(err.message || 'Failed to save holiday.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!canEditCalendar || !holidayToDelete) return;
    setIsDeleting(true);
    try {
      await deleteHoliday(holidayToDelete.id);

      await recordAuditLog({
        action: 'HOLIDAY_DELETE',
        actionLabel: 'Deleted Calendar Holiday Entry',
        targetType: 'holiday',
        targetId: holidayToDelete.id,
        targetDescription: `${holidayToDelete.name} (${holidayToDelete.date})`,
        beforeState: holidayToDelete,
      });

      setIsDeleteModalOpen(false);
      setInspectedDateStr(null);
      setActionSuccess(`Holiday "${holidayToDelete.name}" deleted.`);
      setTimeout(() => setActionSuccess(null), 3000);
    } catch (err: any) {
      setActionError(err.message || 'Failed to delete holiday.');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleConfirmSeed = async () => {
    if (!canEditCalendar) return;
    setIsSeeding(true);
    try {
      const count = await seedStandardHolidays();

      await recordAuditLog({
        action: 'HOLIDAY_IMPORT',
        actionLabel: 'Imported Sri Lanka Standard Holidays',
        targetType: 'holiday',
        targetDescription: `Imported ${count} standard public and bank holidays`,
        afterState: {
          importedCount: count,
          calendarYear: new Date().getFullYear(),
        },
        details: { count },
      });

      setIsSeedModalOpen(false);
      setActionSuccess(`Successfully imported ${count} standard public and bank holidays into the calendar!`);
      setTimeout(() => setActionSuccess(null), 4000);
    } catch (err: any) {
      setActionError(err.message || 'Failed to import standard holidays.');
    } finally {
      setIsSeeding(false);
    }
  };

  const handleFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!canEditCalendar) return;
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImportingFile(true);
    setActionError(null);
    setActionSuccess(null);

    try {
      const text = await file.text();
      let importedList: Array<{ date: string; name: string; type?: HolidayType; description?: string }> = [];

      if (file.name.endsWith('.json')) {
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed)) {
          importedList = parsed.map((item) => ({
            date: item.date || item.holidayDate || '',
            name: item.name || item.holidayName || item.description || '',
            type: (item.type || 'public') as HolidayType,
            description: item.description || item.notes || '',
          }));
        } else {
          throw new Error('Invalid JSON format: expected an array of holiday objects [{ date, name }]');
        }
      } else {
        const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
        if (lines.length === 0) throw new Error('File is empty.');

        const startIdx = lines[0].toLowerCase().includes('date') ? 1 : 0;
        for (let i = startIdx; i < lines.length; i++) {
          const parts = lines[i].split(',').map((s) => s.trim().replace(/^["']|["']$/g, ''));
          if (parts.length >= 2 && parts[0] && parts[1]) {
            importedList.push({
              date: parts[0],
              name: parts[1],
              type: (parts[2] as HolidayType) || 'public',
              description: parts[3] || '',
            });
          }
        }
      }

      let savedCount = 0;
      for (const item of importedList) {
        if (/^\d{4}-\d{2}-\d{2}$/.test(item.date) && item.name) {
          await saveHoliday({
            date: item.date,
            name: item.name,
            type: item.type || 'public',
            description: item.description || '',
          });
          savedCount++;
        }
      }

      if (savedCount === 0) {
        throw new Error('No valid holiday records found. Format required: YYYY-MM-DD, Holiday Name');
      }

      setActionSuccess(`Successfully imported ${savedCount} holidays from file "${file.name}"!`);
      setTimeout(() => setActionSuccess(null), 4000);
    } catch (err: any) {
      console.error('File import error', err);
      setActionError(err.message || 'Failed to import holidays from file.');
    } finally {
      setIsImportingFile(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Filtered list for active month
  const monthHolidays = useMemo(() => {
    const prefix = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}`;
    return holidays.filter((h) => {
      const matchMonth = h.date.startsWith(prefix);
      if (!matchMonth) return false;
      if (selectedCategory !== 'all' && h.type !== selectedCategory) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        return (
          h.name.toLowerCase().includes(q) ||
          h.date.includes(q) ||
          (h.description || '').toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [holidays, selectedYear, selectedMonth, selectedCategory, searchQuery]);

  // All holidays in the selected year (for full year export and stats)
  const yearHolidays = useMemo(() => {
    const prefix = `${selectedYear}-`;
    return holidays.filter((h) => h.date.startsWith(prefix));
  }, [holidays, selectedYear]);

  // Days in selected month for calendar view
  const calendarDays = useMemo(() => {
    const totalDays = new Date(selectedYear, selectedMonth + 1, 0).getDate();
    const firstDayIndex = new Date(selectedYear, selectedMonth, 1).getDay(); // 0 is Sun

    const days: Array<{
      dayNum: number;
      dateStr: string;
      isSunday: boolean;
      isSaturday: boolean;
      isWorkingDay: boolean;
      holiday?: Holiday;
    }> = [];

    let publicHolidayCount = 0;
    let bankHolidayCount = 0;
    let workingDaysCount = 0;
    let weekendCount = 0;

    for (let d = 1; d <= totalDays; d++) {
      const dateStr = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const dt = new Date(selectedYear, selectedMonth, d);
      const isSunday = dt.getDay() === 0;
      const isSaturday = dt.getDay() === 6;
      const holiday = holidays.find((h) => h.date === dateStr);

      if (holiday) {
        if (holiday.type === 'public') publicHolidayCount++;
        else bankHolidayCount++;
      }

      if (isSunday || isSaturday) {
        weekendCount++;
      }

      const isWorkingDay = !isSunday && !isSaturday && !holiday;
      if (isWorkingDay) {
        workingDaysCount++;
      }

      days.push({
        dayNum: d,
        dateStr,
        isSunday,
        isSaturday,
        isWorkingDay,
        holiday,
      });
    }

    return {
      totalDays,
      firstDayIndex,
      days,
      publicHolidayCount,
      bankHolidayCount,
      workingDaysCount,
      weekendCount,
    };
  }, [selectedYear, selectedMonth, holidays]);

  // Jump to Current Month
  const handleJumpToToday = () => {
    const today = new Date();
    setSelectedYear(today.getFullYear());
    setSelectedMonth(today.getMonth());
  };

  // Calendar Export Handlers
  const handleExportMonthIcs = () => {
    const monthName = MONTH_NAMES[selectedMonth];
    const icsContent = generateIcsCalendar(
      monthHolidays,
      `${monthName} ${selectedYear} Company Holidays`
    );
    downloadIcsFile(
      icsContent,
      `Company-Holidays-${monthName}-${selectedYear}.ics`
    );
    setIsExportMenuOpen(false);
    setActionSuccess(`Downloaded .ics for ${monthName} ${selectedYear}!`);
    setTimeout(() => setActionSuccess(null), 3000);
  };

  const handleExportYearIcs = () => {
    const icsContent = generateIcsCalendar(
      yearHolidays,
      `Official Company Holidays ${selectedYear}`
    );
    downloadIcsFile(
      icsContent,
      `Company-Holidays-${selectedYear}-FullYear.ics`
    );
    setIsExportMenuOpen(false);
    setActionSuccess(`Downloaded complete ${selectedYear} holidays .ics!`);
    setTimeout(() => setActionSuccess(null), 3000);
  };

  // Print Calendar
  const handlePrintCalendar = () => {
    window.print();
  };

  // Inspected Day Details
  const inspectedDay = useMemo(() => {
    if (!inspectedDateStr) return null;
    const [y, m, d] = inspectedDateStr.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    const dayOfWeek = dt.getDay();
    const isSun = dayOfWeek === 0;
    const isSat = dayOfWeek === 6;
    const holiday = holidays.find((h) => h.date === inspectedDateStr);
    return {
      dateStr: inspectedDateStr,
      dayNum: d,
      monthName: MONTH_NAMES[m - 1],
      year: y,
      dayName: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][dayOfWeek],
      isSun,
      isSat,
      isNonWorkingDay: isSun || isSat || !!holiday,
      holiday,
    };
  }, [inspectedDateStr, holidays]);

  return (
    <div className="space-y-6 pb-20">
      {/* Top Header Card */}
      <div className="rounded-2xl bg-white p-5 sm:p-6 shadow-xs border border-slate-200">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-5 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-linear-to-br from-indigo-500 to-purple-600 text-white shadow-xs">
                <CalendarIcon className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
                    Integrated Calendar &amp; Holidays
                  </h1>
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-purple-50 text-purple-700 text-[10px] font-bold border border-purple-200">
                    <Sparkles className="w-3 h-3 text-purple-500" />
                    <span>Sri Lanka Sync</span>
                  </span>
                </div>
                <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
                  Official statutory holidays, banking holidays &amp; monthly overtime schedule. Integrated with Google Calendar &amp; iCal.
                </p>
              </div>
            </div>
          </div>

          {/* Action Toolbar */}
          <div className="flex flex-wrap items-center gap-2">
            {/* View Mode Switcher */}
            <div className="inline-flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600">
              <button
                type="button"
                onClick={() => setViewMode('grid')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition cursor-pointer ${
                  viewMode === 'grid'
                    ? 'bg-white text-indigo-700 font-bold shadow-2xs'
                    : 'hover:text-slate-900'
                }`}
              >
                <CalendarDays className="w-3.5 h-3.5" />
                <span>Month Grid</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('agenda')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition cursor-pointer ${
                  viewMode === 'agenda'
                    ? 'bg-white text-indigo-700 font-bold shadow-2xs'
                    : 'hover:text-slate-900'
                }`}
              >
                <ListFilter className="w-3.5 h-3.5" />
                <span>Agenda ({monthHolidays.length})</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('rules')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition cursor-pointer ${
                  viewMode === 'rules'
                    ? 'bg-white text-indigo-700 font-bold shadow-2xs'
                    : 'hover:text-slate-900'
                }`}
              >
                <BookOpen className="w-3.5 h-3.5" />
                <span>OT Rules</span>
              </button>
            </div>

            {/* Calendar Integration & Export Dropdown */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setIsExportMenuOpen((prev) => !prev)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold border border-slate-300 transition cursor-pointer shadow-2xs"
                title="Integrate with Google Calendar, Outlook, or Apple Calendar"
              >
                <Download className="w-3.5 h-3.5 text-slate-600" />
                <span>Calendar Export</span>
              </button>

              {isExportMenuOpen && (
                <div className="absolute right-0 mt-2 w-64 rounded-2xl bg-white shadow-xl border border-slate-200 p-2 z-30 animate-scale-in">
                  <div className="px-3 py-2 border-b border-slate-100 mb-1">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
                      Calendar Integrations
                    </span>
                    <span className="text-xs text-slate-600">
                      Sync to Google, Apple &amp; Outlook
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={handleExportMonthIcs}
                    className="w-full text-left px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 transition flex items-center justify-between"
                  >
                    <span>Download Month (.ics)</span>
                    <Download className="w-3.5 h-3.5 text-indigo-600" />
                  </button>

                  <button
                    type="button"
                    onClick={handleExportYearIcs}
                    className="w-full text-left px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 transition flex items-center justify-between"
                  >
                    <span>Download Full Year {selectedYear} (.ics)</span>
                    <Download className="w-3.5 h-3.5 text-indigo-600" />
                  </button>

                  <div className="border-t border-slate-100 my-1" />

                  <button
                    type="button"
                    onClick={handlePrintCalendar}
                    className="w-full text-left px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-100 transition flex items-center justify-between"
                  >
                    <span>Print Official Month Notice</span>
                    <Printer className="w-3.5 h-3.5 text-slate-500" />
                  </button>
                </div>
              )}
            </div>

            {/* Admin Management Buttons */}
            {canEditCalendar && (
              <>
                <input
                  type="file"
                  ref={fileInputRef}
                  accept=".csv,.json"
                  onChange={handleFileImport}
                  className="hidden"
                />

                <button
                  type="button"
                  onClick={() => setIsSeedModalOpen(true)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-700 text-xs font-bold border border-purple-200 transition cursor-pointer"
                  title="Import Standard Annual Public & Bank Holidays"
                >
                  <Sparkles className="w-3.5 h-3.5 text-purple-600" />
                  <span className="hidden sm:inline">Import Standard</span>
                </button>

                <button
                  type="button"
                  disabled={isImportingFile}
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold border border-slate-300 transition cursor-pointer disabled:opacity-60"
                  title="Import Holidays from CSV or JSON file"
                >
                  <Upload className="w-3.5 h-3.5 text-slate-600" />
                  <span className="hidden sm:inline">{isImportingFile ? 'Importing...' : 'Import File'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => openAddModal()}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-xs transition cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Holiday</span>
                </button>
              </>
            )}
          </div>
        </div>

        {/* Executive Stats Bar (4 Metric Cards) */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 pt-5">
          {/* 1. Public & Poya Holidays */}
          <div className="rounded-xl border border-purple-100 bg-purple-50/50 p-3.5">
            <div className="flex items-center justify-between text-purple-700">
              <span className="text-[11px] font-bold uppercase tracking-wider">Public &amp; Poya</span>
              <Star className="w-4 h-4 text-purple-600" />
            </div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl font-black font-mono text-purple-950">
                {calendarDays.publicHolidayCount}
              </span>
              <span className="text-[11px] text-purple-700 font-medium">days this month</span>
            </div>
            <span className="text-[10px] text-purple-600 block mt-0.5">All staff entitled full day off</span>
          </div>

          {/* 2. Bank & Mercantile */}
          <div className="rounded-xl border border-amber-100 bg-amber-50/50 p-3.5">
            <div className="flex items-center justify-between text-amber-800">
              <span className="text-[11px] font-bold uppercase tracking-wider">Bank &amp; Mercantile</span>
              <Landmark className="w-4 h-4 text-amber-600" />
            </div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl font-black font-mono text-amber-950">
                {calendarDays.bankHolidayCount}
              </span>
              <span className="text-[11px] text-amber-700 font-medium">days this month</span>
            </div>
            <span className="text-[10px] text-amber-600 block mt-0.5">Statutory bank holiday rules</span>
          </div>

          {/* 3. Official Working Days */}
          <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-3.5">
            <div className="flex items-center justify-between text-emerald-800">
              <span className="text-[11px] font-bold uppercase tracking-wider">Working Days</span>
              <Building2 className="w-4 h-4 text-emerald-600" />
            </div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl font-black font-mono text-emerald-950">
                {calendarDays.workingDaysCount}
              </span>
              <span className="text-[11px] text-emerald-700 font-medium">open days</span>
            </div>
            <span className="text-[10px] text-emerald-600 block mt-0.5">Standard 08:00 - 16:45 shifts</span>
          </div>

          {/* 4. Overtime Potential Days */}
          <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-3.5">
            <div className="flex items-center justify-between text-indigo-800">
              <span className="text-[11px] font-bold uppercase tracking-wider">Non-Working / OT Days</span>
              <Clock className="w-4 h-4 text-indigo-600" />
            </div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl font-black font-mono text-indigo-950">
                {calendarDays.totalDays - calendarDays.workingDaysCount}
              </span>
              <span className="text-[11px] text-indigo-700 font-medium">Saturdays, Suns &amp; Hols</span>
            </div>
            <span className="text-[10px] text-indigo-600 block mt-0.5">Day's Pay + (OT hours) eligible</span>
          </div>
        </div>

        {/* Month Selector & Filter Controls Bar */}
        <div className="mt-5 pt-4 border-t border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Month / Year Switcher */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                if (selectedMonth === 0) {
                  setSelectedMonth(11);
                  setSelectedYear((y) => y - 1);
                } else {
                  setSelectedMonth((m) => m - 1);
                }
              }}
              className="p-2 rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-700 transition cursor-pointer"
              title="Previous Month"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <div className="px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-center min-w-[170px]">
              <span className="text-sm font-bold text-slate-900 block leading-tight">
                {MONTH_NAMES[selectedMonth]} {selectedYear}
              </span>
              <span className="text-[10px] text-slate-400 font-medium block">
                {calendarDays.totalDays} Total Calendar Days
              </span>
            </div>

            <button
              type="button"
              onClick={() => {
                if (selectedMonth === 11) {
                  setSelectedMonth(0);
                  setSelectedYear((y) => y + 1);
                } else {
                  setSelectedMonth((m) => m + 1);
                }
              }}
              className="p-2 rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-700 transition cursor-pointer"
              title="Next Month"
            >
              <ChevronRight className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={handleJumpToToday}
              className="px-3 py-2 rounded-xl border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold transition cursor-pointer"
              title="Jump to Today"
            >
              Today
            </button>
          </div>

          {/* Search & Category Filter */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Search Input */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search holidays..."
                className="pl-8 pr-3 py-1.5 rounded-xl border border-slate-200 text-xs text-slate-800 placeholder-slate-400 bg-white focus:outline-none focus:border-indigo-400 w-44 sm:w-56"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600 text-xs"
                >
                  &times;
                </button>
              )}
            </div>

            {/* Category Pills */}
            <div className="flex items-center gap-1 text-[11px] font-bold">
              <button
                type="button"
                onClick={() => setSelectedCategory('all')}
                className={`px-2.5 py-1.5 rounded-lg transition cursor-pointer ${
                  selectedCategory === 'all'
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setSelectedCategory('public')}
                className={`px-2.5 py-1.5 rounded-lg transition cursor-pointer ${
                  selectedCategory === 'public'
                    ? 'bg-purple-600 text-white'
                    : 'bg-purple-50 text-purple-700 hover:bg-purple-100'
                }`}
              >
                Public / Poya
              </button>
              <button
                type="button"
                onClick={() => setSelectedCategory('bank')}
                className={`px-2.5 py-1.5 rounded-lg transition cursor-pointer ${
                  selectedCategory === 'bank'
                    ? 'bg-amber-600 text-white'
                    : 'bg-amber-50 text-amber-800 hover:bg-amber-100'
                }`}
              >
                Bank
              </button>
            </div>
          </div>
        </div>

        {/* Notifications */}
        {actionSuccess && (
          <div className="mt-4 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-center gap-2 animate-fade-in">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span className="font-medium">{actionSuccess}</span>
          </div>
        )}
        {actionError && (
          <div className="mt-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-center gap-2 animate-fade-in">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span className="font-medium">{actionError}</span>
          </div>
        )}
      </div>

      {/* Main Content Area: Tab Views */}
      {viewMode === 'grid' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Monthly Calendar View (2 Cols) */}
          <div className="lg:col-span-2 rounded-2xl bg-white p-5 shadow-xs border border-slate-200">
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-100">
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <CalendarCheck className="w-4 h-4 text-indigo-600" />
                <span>
                  {MONTH_NAMES[selectedMonth]} {selectedYear} &bull; Overtime &amp; Holiday Matrix
                </span>
              </h2>
              <span className="text-xs text-slate-400 font-medium hidden sm:inline">
                Click any day for details &amp; Google Calendar sync
              </span>
            </div>

            {/* Day of Week Headers */}
            <div className="grid grid-cols-7 gap-1.5 text-center font-bold text-[11px] text-slate-500 mb-2">
              {DAYS_SHORT.map((day, idx) => (
                <div
                  key={day}
                  className={`py-2 rounded-xl text-center font-bold ${
                    idx === 0
                      ? 'text-rose-600 bg-rose-50/80'
                      : idx === 6
                      ? 'text-amber-800 bg-amber-50/80'
                      : 'bg-slate-50 text-slate-700'
                  }`}
                >
                  {day}
                </div>
              ))}
            </div>

            {/* Calendar Day Cells */}
            <div className="grid grid-cols-7 gap-1.5">
              {/* Blank cells for offset */}
              {Array.from({ length: calendarDays.firstDayIndex }).map((_, i) => (
                <div
                  key={`blank-${i}`}
                  className="min-h-[64px] sm:min-h-[82px] bg-slate-50/30 rounded-xl border border-dashed border-slate-200"
                />
              ))}

              {/* Actual day cells */}
              {calendarDays.days.map((item) => {
                const isToday =
                  now.getFullYear() === selectedYear &&
                  now.getMonth() === selectedMonth &&
                  now.getDate() === item.dayNum;

                const isHol = !!item.holiday;
                const isSun = item.isSunday;
                const isSat = item.isSaturday;

                return (
                  <div
                    key={item.dateStr}
                    onClick={() => setInspectedDateStr(item.dateStr)}
                    className={`min-h-[64px] sm:min-h-[82px] p-1.5 sm:p-2 rounded-xl border flex flex-col justify-between transition cursor-pointer group relative ${
                      isToday
                        ? 'ring-2 ring-indigo-500 ring-offset-1 border-indigo-300 bg-indigo-50/30'
                        : isHol
                        ? 'bg-purple-50/80 border-purple-200 hover:bg-purple-100/70 text-purple-950 shadow-2xs'
                        : isSun
                        ? 'bg-rose-50/60 border-rose-200 hover:bg-rose-100/60 text-rose-950'
                        : isSat
                        ? 'bg-amber-50/50 border-amber-200 hover:bg-amber-100/50 text-amber-950'
                        : 'bg-white border-slate-200 hover:border-indigo-300 hover:shadow-2xs'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span
                        className={`text-xs font-bold ${
                          isToday
                            ? 'w-6 h-6 rounded-full bg-indigo-600 text-white flex items-center justify-center shadow-xs'
                            : isSun
                            ? 'text-rose-600'
                            : isSat
                            ? 'text-amber-800'
                            : isHol
                            ? 'text-purple-700'
                            : 'text-slate-800'
                        }`}
                      >
                        {item.dayNum}
                      </span>

                      {/* Indicator dots */}
                      <div className="flex items-center gap-1">
                        {isHol && (
                          <span
                            className="w-2 h-2 rounded-full bg-purple-600 shrink-0"
                            title={item.holiday?.name}
                          />
                        )}
                        {isSat && !isHol && (
                          <span
                            className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0"
                            title="Saturday Half-Day / OT eligible"
                          />
                        )}
                      </div>
                    </div>

                    {/* Day Content Badges */}
                    {item.holiday ? (
                      <div className="mt-1">
                        <span className="block text-[9px] sm:text-[10px] font-bold leading-tight line-clamp-2 text-purple-900 bg-purple-100/90 px-1 py-0.5 rounded border border-purple-200">
                          {item.holiday.name}
                        </span>
                      </div>
                    ) : isSun ? (
                      <div className="mt-1">
                        <span className="block text-[9px] font-bold text-rose-600 bg-rose-100/60 px-1 py-0.5 rounded border border-rose-200/60 text-center">
                          Sunday Off
                        </span>
                      </div>
                    ) : isSat ? (
                      <div className="mt-1">
                        <span className="block text-[9px] font-medium text-amber-800 bg-amber-100/60 px-1 py-0.5 rounded border border-amber-200/60 text-center">
                          Saturday OT
                        </span>
                      </div>
                    ) : null}

                    {/* Hover Sync / OT Quick Action */}
                    <div className="hidden group-hover:flex items-center justify-end gap-1 mt-1 pt-0.5">
                      <span className="text-[9px] font-bold text-indigo-600">Details &rarr;</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Monthly Holidays Agenda List (1 Col) */}
          <div className="rounded-2xl bg-white p-5 shadow-xs border border-slate-200 flex flex-col">
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-100">
              <div>
                <h2 className="text-sm font-bold text-slate-900">
                  Holidays in {MONTH_NAMES[selectedMonth]}
                </h2>
                <span className="text-[11px] text-slate-400">
                  {monthHolidays.length} official holidays registered
                </span>
              </div>

              {canEditCalendar && (
                <button
                  type="button"
                  onClick={() => openAddModal()}
                  className="inline-flex items-center gap-1 text-xs font-bold text-indigo-600 hover:text-indigo-800 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add</span>
                </button>
              )}
            </div>

            <div className="flex-1 overflow-y-auto space-y-2.5 max-h-[540px] pr-1">
              {monthHolidays.length === 0 ? (
                <div className="py-16 text-center text-slate-400 text-xs">
                  <CalendarIcon className="w-9 h-9 mx-auto text-slate-300 mb-2" />
                  <p className="font-bold text-slate-700">No public holidays in {MONTH_NAMES[selectedMonth]}</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Sundays &amp; Saturdays are weekly non-working and overtime days.
                  </p>
                  {canEditCalendar && (
                    <button
                      type="button"
                      onClick={() => openAddModal()}
                      className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-indigo-600 hover:text-indigo-800 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add Custom Holiday</span>
                    </button>
                  )}
                </div>
              ) : (
                monthHolidays.map((h) => {
                  const googleCalUrl = generateGoogleCalendarUrl(h);

                  return (
                    <div
                      key={h.id}
                      className="p-3.5 rounded-xl border border-purple-100 bg-purple-50/40 hover:bg-purple-50/80 transition flex items-start justify-between gap-3 group"
                    >
                      <div className="space-y-1.5 flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 border border-purple-200">
                            {h.type}
                          </span>
                          <span className="text-xs font-mono font-bold text-slate-700">
                            {h.date}
                          </span>
                        </div>

                        <h3 className="text-xs font-bold text-slate-900 leading-snug truncate">
                          {h.name}
                        </h3>

                        {h.description && (
                          <p className="text-[11px] text-slate-500 leading-tight">
                            {h.description}
                          </p>
                        )}

                        {/* Integration Action Links */}
                        <div className="pt-1 flex items-center gap-3 text-[11px]">
                          <a
                            href={googleCalUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 font-semibold text-indigo-600 hover:text-indigo-800 hover:underline"
                            title="Add this holiday directly to your Google Calendar"
                          >
                            <ExternalLink className="w-3 h-3" />
                            <span>Add to Google Cal</span>
                          </a>

                          {onNavigateToNewClaim && (
                            <button
                              type="button"
                              onClick={() => onNavigateToNewClaim(h.date)}
                              className="inline-flex items-center gap-1 font-semibold text-purple-700 hover:text-purple-900 hover:underline cursor-pointer"
                              title="Claim Overtime for this Holiday"
                            >
                              <Clock className="w-3 h-3" />
                              <span>Claim OT</span>
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Admin edit & delete buttons */}
                      {canEditCalendar && (
                        <div className="flex items-center gap-1 shrink-0 pt-0.5">
                          <button
                            type="button"
                            onClick={() => openEditModal(h)}
                            className="p-1.5 text-slate-400 hover:text-indigo-600 rounded-lg transition cursor-pointer hover:bg-indigo-50"
                            title="Edit Holiday"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setHolidayToDelete(h);
                              setIsDeleteModalOpen(true);
                            }}
                            className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg transition cursor-pointer hover:bg-rose-50"
                            title="Delete Holiday"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* Agenda / Full Year Timeline View */}
      {viewMode === 'agenda' && (
        <div className="rounded-2xl bg-white p-6 shadow-xs border border-slate-200 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Official Holiday Timeline &bull; {selectedYear}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Complete list of Sri Lankan Public, Poya, Bank, and Mercantile holidays for statutory compliance.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleExportYearIcs}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold border border-indigo-200 transition cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export Full Year (.ics)</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {yearHolidays.map((h) => {
              const googleCalUrl = generateGoogleCalendarUrl(h);
              const [y, m, d] = h.date.split('-').map(Number);
              const mName = MONTH_NAMES[m - 1];

              return (
                <div
                  key={h.id}
                  className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 hover:border-purple-300 hover:bg-purple-50/30 transition flex flex-col justify-between"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 border border-purple-200">
                        {h.type}
                      </span>
                      <span className="text-xs font-mono font-bold text-slate-600">
                        {mName} {d}, {y}
                      </span>
                    </div>

                    <h3 className="text-xs font-bold text-slate-900 leading-snug">
                      {h.name}
                    </h3>

                    {h.description && (
                      <p className="text-[11px] text-slate-500 leading-relaxed">
                        {h.description}
                      </p>
                    )}
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-200/60 flex items-center justify-between">
                    <a
                      href={googleCalUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 hover:underline"
                    >
                      <ExternalLink className="w-3 h-3" />
                      <span>Google Calendar</span>
                    </a>

                    {onNavigateToNewClaim && (
                      <button
                        type="button"
                        onClick={() => onNavigateToNewClaim(h.date)}
                        className="inline-flex items-center gap-1 text-[11px] font-bold text-purple-700 hover:text-purple-900 cursor-pointer"
                      >
                        <Clock className="w-3 h-3" />
                        <span>Claim OT</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Statutory Rules & Labor Law Reference Tab */}
      {viewMode === 'rules' && (
        <div className="rounded-2xl bg-white p-6 shadow-xs border border-slate-200 space-y-6">
          <div className="pb-4 border-b border-slate-100">
            <h2 className="text-base font-bold text-slate-900">
              Sri Lanka Statutory Overtime &amp; Holiday Calculation Policy
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Rules and standard banking/corporate calculation formulas applied to timesheets.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 text-xs text-slate-700">
            {/* Rule 1: Saturday Overtime Calculation */}
            <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-4 space-y-2">
              <div className="flex items-center gap-2 font-bold text-amber-900 text-sm">
                <Sun className="w-4 h-4 text-amber-600" />
                <span>1. Saturday Overtime Rules</span>
              </div>
              <ul className="list-disc pl-5 space-y-1 text-slate-700 leading-relaxed text-[11px]">
                <li>Overtime calculation on Saturdays strictly starts from <strong>8:00 AM</strong>.</li>
                <li>Work hours are calculated in <strong>15-minute increments</strong>.</li>
                <li>When claimed, the PDF timesheet prints the label: <strong>Day's Pay + (OT hours)</strong>.</li>
                <li>Non-working day rate (1.5x standard hourly rate) applies for overtime hours worked.</li>
              </ul>
            </div>

            {/* Rule 2: Public & Poya Holidays */}
            <div className="rounded-xl border border-purple-200 bg-purple-50/50 p-4 space-y-2">
              <div className="flex items-center gap-2 font-bold text-purple-900 text-sm">
                <Star className="w-4 h-4 text-purple-600" />
                <span>2. Public &amp; Poya Holidays</span>
              </div>
              <ul className="list-disc pl-5 space-y-1 text-slate-700 leading-relaxed text-[11px]">
                <li>Full statutory holiday for all staff. Regular weekday shifts cannot be claimed.</li>
                <li>Staff required to work receive their <strong>Day's Pay</strong> plus hourly overtime for all hours rendered.</li>
                <li>Hours are calculated in 15-minute increments from shift commencement.</li>
              </ul>
            </div>

            {/* Rule 3: Sunday Shifts */}
            <div className="rounded-xl border border-rose-200 bg-rose-50/50 p-4 space-y-2">
              <div className="flex items-center gap-2 font-bold text-rose-900 text-sm">
                <CalendarIcon className="w-4 h-4 text-rose-600" />
                <span>3. Sunday Shifts &amp; Weekly Off</span>
              </div>
              <ul className="list-disc pl-5 space-y-1 text-slate-700 leading-relaxed text-[11px]">
                <li>Sunday is the statutory weekly rest day.</li>
                <li>Duty performed on Sunday requires prior administrative authorization.</li>
                <li>Compensated at non-working day rate or entitled to alternative lieu off as per company guidelines.</li>
              </ul>
            </div>

            {/* Rule 4: Standard Remuneration Formula */}
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 space-y-2">
              <div className="flex items-center gap-2 font-bold text-emerald-900 text-sm">
                <Building2 className="w-4 h-4 text-emerald-600" />
                <span>4. Form 10756 Banking Overtime Formula</span>
              </div>
              <ul className="list-disc pl-5 space-y-1 text-slate-700 leading-relaxed text-[11px]">
                <li><strong>Day's Pay</strong> = Monthly Remuneration &divide; 22 working days.</li>
                <li><strong>Working Days Hourly OT Rate</strong> = Day's Pay &divide; 8 working hours.</li>
                <li><strong>Non-Working Days Hourly OT Rate</strong> = Hourly Rate &times; 1.5.</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Inspected Day Details Modal / Drawer */}
      {inspectedDay && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-slate-200 animate-scale-in">
            <div className="flex items-start justify-between pb-4 border-b border-slate-100">
              <div>
                <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block">
                  {inspectedDay.dayName}
                </span>
                <h2 className="text-lg font-bold text-slate-900">
                  {inspectedDay.monthName} {inspectedDay.dayNum}, {inspectedDay.year}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setInspectedDateStr(null)}
                className="text-slate-400 hover:text-slate-600 text-lg font-bold p-1 cursor-pointer"
              >
                &times;
              </button>
            </div>

            <div className="py-4 space-y-3 text-xs">
              {inspectedDay.holiday ? (
                <div className="p-3.5 rounded-xl border border-purple-200 bg-purple-50/70 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-purple-200 text-purple-900">
                      {inspectedDay.holiday.type} Holiday
                    </span>
                  </div>
                  <h3 className="text-sm font-bold text-purple-950">
                    {inspectedDay.holiday.name}
                  </h3>
                  {inspectedDay.holiday.description && (
                    <p className="text-xs text-purple-800">
                      {inspectedDay.holiday.description}
                    </p>
                  )}
                </div>
              ) : inspectedDay.isSun ? (
                <div className="p-3.5 rounded-xl border border-rose-200 bg-rose-50/70">
                  <span className="text-xs font-bold text-rose-900 block">Weekly Non-Working Day (Sunday)</span>
                  <p className="text-[11px] text-rose-700 mt-1">
                    Sunday shifts qualify for Non-Working Day Payment &amp; overtime calculation.
                  </p>
                </div>
              ) : inspectedDay.isSat ? (
                <div className="p-3.5 rounded-xl border border-amber-200 bg-amber-50/70">
                  <span className="text-xs font-bold text-amber-900 block">Saturday Duty &amp; Overtime</span>
                  <p className="text-[11px] text-amber-700 mt-1">
                    Overtime calculation starts from 8:00 AM and is calculated in 15-minute increments.
                  </p>
                </div>
              ) : (
                <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50">
                  <span className="text-xs font-bold text-slate-800 block">Standard Working Day</span>
                  <p className="text-[11px] text-slate-500 mt-1">
                    General shift schedule (08:00 - 16:45). Weekday overtime applies after shift end.
                  </p>
                </div>
              )}

              {/* Integrations on Inspected Day */}
              <div className="pt-2 space-y-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
                  Quick Integrations
                </span>

                {inspectedDay.holiday && (
                  <a
                    href={generateGoogleCalendarUrl(inspectedDay.holiday)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full inline-flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs transition shadow-xs"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Add Event to Google Calendar</span>
                  </a>
                )}

                {onNavigateToNewClaim && (
                  <button
                    type="button"
                    onClick={() => {
                      onNavigateToNewClaim(inspectedDay.dateStr);
                      setInspectedDateStr(null);
                    }}
                    className="w-full inline-flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs transition shadow-xs cursor-pointer"
                  >
                    <Clock className="w-3.5 h-3.5" />
                    <span>Claim Overtime for this Date</span>
                  </button>
                )}
              </div>

              {/* Super Admin Edit / Delete Actions */}
              {canEditCalendar && (
                <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                  {inspectedDay.holiday ? (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          const h = inspectedDay.holiday!;
                          setInspectedDateStr(null);
                          openEditModal(h);
                        }}
                        className="px-3 py-1.5 rounded-xl border border-slate-200 text-slate-700 font-bold hover:bg-slate-50 text-xs transition cursor-pointer"
                      >
                        Edit Holiday
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setHolidayToDelete(inspectedDay.holiday!);
                          setIsDeleteModalOpen(true);
                        }}
                        className="px-3 py-1.5 rounded-xl border border-rose-200 text-rose-700 font-bold hover:bg-rose-50 text-xs transition cursor-pointer"
                      >
                        Delete Holiday
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        const dateToSet = inspectedDay.dateStr;
                        setInspectedDateStr(null);
                        openAddModal(dateToSet);
                      }}
                      className="px-3.5 py-2 rounded-xl bg-indigo-600 text-white font-bold text-xs hover:bg-indigo-700 transition cursor-pointer"
                    >
                      Add Custom Holiday on this Day
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Add / Edit Holiday Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-slate-200 animate-scale-in">
            <h2 className="text-base font-bold text-slate-900 mb-1">
              {editingHoliday ? 'Edit Calendar Holiday' : 'Add Calendar Holiday'}
            </h2>
            <p className="text-xs text-slate-500 mb-4">
              Registered holidays are marked automatically on monthly timesheets and cannot have standard weekday overtime.
            </p>

            <form onSubmit={handleSaveHoliday} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Holiday Date</label>
                <input
                  type="date"
                  required
                  value={formDate}
                  onChange={(e) => setFormDate(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-slate-800 bg-white"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Holiday Name / Description</label>
                <input
                  type="text"
                  required
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g. Sinhala & Tamil New Year Day"
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-slate-800 bg-white"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Holiday Category</label>
                <select
                  value={formType}
                  onChange={(e) => setFormType(e.target.value as HolidayType)}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-slate-800 bg-white"
                >
                  <option value="public">Public Holiday (All staff off)</option>
                  <option value="bank">Bank Holiday</option>
                  <option value="mercantile">Mercantile Holiday</option>
                  <option value="special">Special Government / Company Holiday</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Notes (Optional)</label>
                <input
                  type="text"
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="e.g. Statutory Bank & Public holiday"
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-slate-800 bg-white"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 font-semibold hover:bg-slate-50 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold transition shadow-xs cursor-pointer disabled:opacity-60"
                >
                  {isSubmitting ? 'Saving...' : editingHoliday ? 'Update Holiday' : 'Add Holiday'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      <ConfirmationModal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        onConfirm={handleConfirmDelete}
        title="Delete Holiday"
        message={`Are you sure you want to remove the holiday "${holidayToDelete?.name}" (${holidayToDelete?.date}) from the company calendar?`}
        confirmText="Delete Holiday"
        cancelText="Cancel"
        variant="danger"
        isLoading={isDeleting}
      />

      {/* Import / Seed Confirmation Modal */}
      <ConfirmationModal
        isOpen={isSeedModalOpen}
        onClose={() => setIsSeedModalOpen(false)}
        onConfirm={handleConfirmSeed}
        title="Import Official Public & Bank Holidays"
        message="This will import the complete standard calendar of official Sri Lankan Public, Poya, and Bank Holidays for 2026 into the database. Existing custom entries will not be overwritten."
        confirmText="Import Holidays"
        cancelText="Cancel"
        variant="info"
        isLoading={isSeeding}
      />
    </div>
  );
};
