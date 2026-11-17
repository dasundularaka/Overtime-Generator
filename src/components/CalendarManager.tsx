import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Calendar as CalendarIcon,
  Trash2,
  Edit2,
  CheckCircle2,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Search,
  X,
} from 'lucide-react';
import { CalendarGridSkeleton } from './Skeleton';
import {
  subscribeToHolidays,
  saveHoliday,
  deleteHoliday,
} from '../services/holidayService';
import {
  subscribeToHolidayCategories,
  resolveHolidayCategory,
  getHolidayColorTheme,
} from '../services/holidayCategoryService';
import { subscribeToCalendarSettings } from '../services/calendarSettingsService';
import { FirstDayOfWeek, Holiday, HolidayCategory, HolidayType } from '../types';
import { useAuth } from '../context/AuthContext';
import { recordAuditLog } from '../utils/auditLogger';
import { ConfirmationModal } from './ConfirmationModal';
import { MONTH_NAMES, DAYS_SHORT } from '../utils/timeCalculations';

export const CalendarManager: React.FC = () => {
  const { isSuperAdmin } = useAuth();
  // Only Super Admins may create, update, or delete calendar entries
  const canEditCalendar = isSuperAdmin;

  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [categories, setCategories] = useState<HolidayCategory[]>([]);
  const [firstDayOfWeek, setFirstDayOfWeek] = useState<FirstDayOfWeek>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Separated Month & Year State
  const now = useMemo(() => new Date(), []);
  const [selectedYear, setSelectedYear] = useState<number>(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<number>(now.getMonth()); // 0-indexed

  // Holiday Search Bar + Dropdown State (under Marquee)
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isSearchDropdownOpen, setIsSearchDropdownOpen] = useState<boolean>(false);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  // Selected Day Details Modal
  const [inspectedDateStr, setInspectedDateStr] = useState<string | null>(null);

  // Super Admin Add / Edit Holiday Modal (opened from inspecting a day or editing a holiday card)
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingHoliday, setEditingHoliday] = useState<Holiday | null>(null);
  const [formDate, setFormDate] = useState<string>('');
  const [formName, setFormName] = useState<string>('');
  const [formType, setFormType] = useState<HolidayType>('poya');
  const [formDescription, setFormDescription] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Super Admin Delete Confirmation Modal
  const [holidayToDelete, setHolidayToDelete] = useState<Holiday | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Subscribe to holidays, dynamic categories & calendar display settings
  useEffect(() => {
    setLoading(true);
    const unsubHolidays = subscribeToHolidays((list) => {
      setHolidays(list);
      setLoading(false);
    });
    const unsubCategories = subscribeToHolidayCategories((cats) => {
      setCategories(cats);
    });
    const unsubCalSettings = subscribeToCalendarSettings((cfg) => {
      setFirstDayOfWeek(cfg.firstDayOfWeek);
    });
    return () => {
      unsubHolidays();
      unsubCategories();
      unsubCalSettings();
    };
  }, []);

  // Close search dropdown cleanly on outside click or Escape
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (
        searchContainerRef.current &&
        !searchContainerRef.current.contains(e.target as Node)
      ) {
        setIsSearchDropdownOpen(false);
      }
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsSearchDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('keydown', handleEsc);
    };
  }, []);

  // Available Year Options (dynamic range anchored around current year & dataset years)
  const yearOptions = useMemo(() => {
    const currentYear = now.getFullYear();
    const yearsSet = new Set<number>();
    for (let y = currentYear - 4; y <= currentYear + 5; y++) {
      yearsSet.add(y);
    }
    holidays.forEach((h) => {
      const y = Number(h.date?.slice(0, 4));
      if (y >= 2000 && y <= 2100) yearsSet.add(y);
    });
    yearsSet.add(selectedYear);
    return Array.from(yearsSet).sort((a, b) => a - b);
  }, [holidays, selectedYear, now]);

  // Holiday Search Dropdown Matches (scoped to selectedYear, or cross-year fallback if user queries across years)
  const searchDropdownResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const inSelectedYear = holidays.filter((h) => h.date.startsWith(`${selectedYear}-`));

    const matchesQuery = (h: Holiday) => {
      if (!q) return true;
      const cat = resolveHolidayCategory(h, categories);
      return (
        h.name.toLowerCase().includes(q) ||
        h.date.includes(q) ||
        cat.name.toLowerCase().includes(q) ||
        (h.description || '').toLowerCase().includes(q)
      );
    };

    const yearMatches = inSelectedYear.filter(matchesQuery);
    const otherYearMatches = q
      ? holidays
          .filter((h) => !h.date.startsWith(`${selectedYear}-`) && matchesQuery(h))
          .slice(0, 8)
      : [];

    return { yearMatches, otherYearMatches };
  }, [holidays, categories, selectedYear, searchQuery]);

  // Month Holidays Overview
  const monthHolidays = useMemo(() => {
    const prefix = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}`;
    return holidays.filter((h) => h.date.startsWith(prefix));
  }, [holidays, selectedYear, selectedMonth]);

  // Dynamic Week Column Order based on First Day of Week setting
  const orderedWeekdays = useMemo(() => {
    return Array.from({ length: 7 }, (_, colIndex) => {
      const dayIndex = (firstDayOfWeek + colIndex) % 7;
      return {
        dayIndex,
        label: DAYS_SHORT[dayIndex],
        isSunday: dayIndex === 0,
        isSaturday: dayIndex === 6,
      };
    });
  }, [firstDayOfWeek]);

  // Days Grid Computation
  const calendarDays = useMemo(() => {
    const totalDays = new Date(selectedYear, selectedMonth + 1, 0).getDate();
    const firstDayActual = new Date(selectedYear, selectedMonth, 1).getDay(); // 0 = Sun
    const leadingBlankCount = (firstDayActual - firstDayOfWeek + 7) % 7;
    const totalGridCells = Math.ceil((leadingBlankCount + totalDays) / 7) * 7;
    const trailingBlankCount = totalGridCells - (leadingBlankCount + totalDays);

    const leadingBlanks = Array.from({ length: leadingBlankCount }, (_, i) => {
      const dayIndex = (firstDayOfWeek + i) % 7;
      return {
        dayIndex,
        isSunday: dayIndex === 0,
        isSaturday: dayIndex === 6,
      };
    });

    const trailingBlanks = Array.from({ length: trailingBlankCount }, (_, i) => {
      const dayIndex = (firstDayOfWeek + leadingBlankCount + totalDays + i) % 7;
      return {
        dayIndex,
        isSunday: dayIndex === 0,
        isSaturday: dayIndex === 6,
      };
    });

    const days: Array<{
      dayNum: number;
      dateStr: string;
      isSunday: boolean;
      isSaturday: boolean;
      holiday?: Holiday;
    }> = [];

    for (let d = 1; d <= totalDays; d++) {
      const dateStr = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const dt = new Date(selectedYear, selectedMonth, d);
      const isSunday = dt.getDay() === 0;
      const isSaturday = dt.getDay() === 6;
      const holiday = holidays.find((h) => h.date === dateStr);

      days.push({
        dayNum: d,
        dateStr,
        isSunday,
        isSaturday,
        holiday,
      });
    }

    return {
      totalDays,
      leadingBlanks,
      trailingBlanks,
      days,
    };
  }, [selectedYear, selectedMonth, holidays, firstDayOfWeek]);

  // Inspected Day Details
  const inspectedDay = useMemo(() => {
    if (!inspectedDateStr) return null;
    const [y, m, d] = inspectedDateStr.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    const dayOfWeek = dt.getDay();
    const isSun = dayOfWeek === 0;
    const isSat = dayOfWeek === 6;
    const holiday = holidays.find((h) => h.date === inspectedDateStr);
    const category = holiday ? resolveHolidayCategory(holiday, categories) : null;
    const theme = category ? getHolidayColorTheme(category.color) : null;

    return {
      dateStr: inspectedDateStr,
      dayNum: d,
      monthName: MONTH_NAMES[m - 1],
      year: y,
      dayName: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][dayOfWeek],
      isSun,
      isSat,
      holiday,
      category,
      theme,
    };
  }, [inspectedDateStr, holidays, categories]);

  // Super Admin Modals
  const openAddModal = (initialDate?: string) => {
    if (!canEditCalendar) return;
    setEditingHoliday(null);
    setFormDate(initialDate || `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-01`);
    setFormName('');
    setFormType(categories[0]?.id || 'poya');
    setFormDescription('');
    setActionError(null);
    setIsModalOpen(true);
  };

  const openEditModal = (h: Holiday) => {
    if (!canEditCalendar) return;
    const resolved = resolveHolidayCategory(h, categories);
    setEditingHoliday(h);
    setFormDate(h.date);
    setFormName(h.name);
    setFormType(resolved.id);
    setFormDescription(h.description || '');
    setActionError(null);
    setIsModalOpen(true);
  };

  const handleSaveHoliday = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting || !canEditCalendar) return;
    if (!formDate || !formName.trim()) {
      setActionError('Please provide both holiday date and name.');
      return;
    }

    const cleanName = formName.trim().toLowerCase();
    const isDuplicate = holidays.some(
      (h) => h.id !== editingHoliday?.id && h.date === formDate && h.name.trim().toLowerCase() === cleanName
    );
    if (isDuplicate) {
      setActionError(`A holiday named "${formName.trim()}" on ${formDate} already exists.`);
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
        details: { type: saved.type, date: saved.date },
      });

      setIsModalOpen(false);
      setActionSuccess(`Holiday "${formName.trim()}" saved successfully.`);
      setTimeout(() => setActionSuccess(null), 3500);
    } catch (err: any) {
      setActionError(err.message || 'Failed to save holiday.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!canEditCalendar || !holidayToDelete || isDeleting) return;
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

  const handleSelectSearchHoliday = (h: Holiday) => {
    const [yStr, mStr] = h.date.split('-');
    const y = Number(yStr);
    const m = Number(mStr) - 1;
    if (!Number.isNaN(y) && !Number.isNaN(m)) {
      setSelectedYear(y);
      setSelectedMonth(m);
    }
    setSearchQuery(h.name);
    setIsSearchDropdownOpen(false);
    setInspectedDateStr(h.date);
  };

  const handlePrevMonth = () => {
    if (selectedMonth === 0) {
      setSelectedMonth(11);
      setSelectedYear((y) => y - 1);
    } else {
      setSelectedMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (selectedMonth === 11) {
      setSelectedMonth(0);
      setSelectedYear((y) => y + 1);
    } else {
      setSelectedMonth((m) => m + 1);
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6 pb-8 w-full">
      {/* Top Panel: Integrated Calendar Heading + Infinite One-Line Marquee Keys + Holiday Search Bar with Dropdown & Year Changer */}
      <div className="rounded-2xl bg-white p-4 sm:p-6 shadow-xs border border-slate-200 space-y-4">
        {/* Heading only — no buttons, month changer, today, import, or add holiday */}
        <div className="flex items-center gap-3 pb-3 border-b border-slate-100">
          <div className="flex h-10 w-10 sm:h-11 sm:w-11 items-center justify-center rounded-xl bg-indigo-600 text-white shrink-0">
            <CalendarIcon className="w-5 h-5 sm:w-6 sm:h-6" />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg sm:text-2xl font-bold text-slate-900 tracking-tight truncate">
              Integrated Calendar
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-0.5 truncate">
              Official Poya, Bank, Mercantile and statutory holidays overview.
            </p>
          </div>
        </div>

        {/* One-Line Key Details with Infinite Marquee Animation */}
        <div
          className="marquee-container relative w-full overflow-hidden rounded-xl border border-slate-200/80 bg-slate-50/70 py-2.5"
          aria-label="Holiday category color key"
        >
          {/* Subtle edge fade masks */}
          <div className="pointer-events-none absolute inset-y-0 left-0 w-6 sm:w-10 bg-gradient-to-r from-slate-50 to-transparent z-10" />
          <div className="pointer-events-none absolute inset-y-0 right-0 w-6 sm:w-10 bg-gradient-to-l from-slate-50 to-transparent z-10" />

          <div className="animate-marquee-infinite items-center motion-reduce:flex-wrap motion-reduce:w-full motion-reduce:justify-center motion-reduce:gap-y-2">
            {[0, 1].map((loopIndex) => (
              <div
                key={`marquee-track-${loopIndex}`}
                aria-hidden={loopIndex === 1}
                className="flex items-center gap-6 sm:gap-8 pr-6 sm:pr-8 shrink-0 whitespace-nowrap"
              >
                {categories.map((cat) => {
                  const theme = getHolidayColorTheme(cat.color);
                  return (
                    <span
                      key={`${loopIndex}-${cat.id}`}
                      className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700"
                    >
                      <span className={`w-3 h-3 rounded-full shrink-0 ${theme.swatchClass}`} />
                      <span className={theme.textClass}>{cat.name}</span>
                    </span>
                  );
                })}
                <span className="inline-flex items-center gap-2 text-xs font-medium text-slate-500">
                  <span className="w-3 h-3 rounded-xs border-2 border-slate-900 bg-white shrink-0" />
                  <span>Today</span>
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Search Bar with Dropdown & Year Changer directly under Marquee */}
        <div ref={searchContainerRef} className="relative w-full">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full">
            {/* Year Changer inside Search Row */}
            <div className="flex items-center shrink-0 rounded-xl border border-slate-300 bg-slate-50 px-2.5 py-2 sm:py-0 sm:h-10">
              <label
                htmlFor="calendar-search-year"
                className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mr-2 shrink-0"
              >
                Year
              </label>
              <select
                id="calendar-search-year"
                value={selectedYear}
                onChange={(e) => {
                  setSelectedYear(Number(e.target.value));
                  setIsSearchDropdownOpen(true);
                }}
                className="bg-transparent text-xs sm:text-sm font-bold text-slate-900 focus:outline-hidden cursor-pointer tabular-nums pr-1"
              >
                {yearOptions.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>

            {/* Search Input + Dropdown Trigger */}
            <div className="relative flex-1 min-w-0">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onFocus={() => setIsSearchDropdownOpen(true)}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setIsSearchDropdownOpen(true);
                }}
                placeholder={`Search ${selectedYear} holidays by name, category, or date...`}
                aria-label="Search holidays"
                aria-expanded={isSearchDropdownOpen}
                className="w-full h-10 pl-10 pr-16 rounded-xl border border-slate-300 bg-white text-xs sm:text-sm text-slate-800 placeholder-slate-400 focus:outline-hidden focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/15"
              />
              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery('');
                      setIsSearchDropdownOpen(true);
                    }}
                    className="p-1 text-slate-400 hover:text-slate-700 rounded-md cursor-pointer"
                    title="Clear search"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setIsSearchDropdownOpen((prev) => !prev)}
                  className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition cursor-pointer"
                  title="Toggle holiday list dropdown"
                >
                  <ChevronDown
                    className={`w-4 h-4 transition-transform duration-150 ${
                      isSearchDropdownOpen ? 'rotate-180' : ''
                    }`}
                  />
                </button>
              </div>
            </div>
          </div>

          {/* Search Results Dropdown */}
          {isSearchDropdownOpen && (
            <div
              role="listbox"
              className="absolute left-0 right-0 mt-1.5 z-30 rounded-xl border border-slate-200 bg-white shadow-xl max-h-[min(18rem,45dvh)] overflow-y-auto divide-y divide-slate-100"
            >
              <div className="px-3.5 py-2 bg-slate-50 flex items-center justify-between text-[11px] font-semibold text-slate-500 sticky top-0 z-10 border-b border-slate-100">
                <span>
                  Holidays in {selectedYear} ({searchDropdownResults.yearMatches.length})
                </span>
                <span className="text-[10px] text-slate-400">
                  Select a holiday to jump to date
                </span>
              </div>

              {searchDropdownResults.yearMatches.length === 0 &&
              searchDropdownResults.otherYearMatches.length === 0 ? (
                <div className="px-4 py-6 text-center text-xs text-slate-500">
                  No holidays found matching &ldquo;{searchQuery}&rdquo; in {selectedYear}.
                </div>
              ) : (
                <>
                  {searchDropdownResults.yearMatches.map((h) => {
                    const cat = resolveHolidayCategory(h, categories);
                    const theme = getHolidayColorTheme(cat.color);
                    return (
                      <button
                        key={h.id}
                        type="button"
                        onClick={() => handleSelectSearchHoliday(h)}
                        className="w-full px-3.5 py-2.5 text-left hover:bg-slate-50 transition flex items-center justify-between gap-3 cursor-pointer"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className={`w-2.5 h-2.5 rounded-xs shrink-0 ${theme.swatchClass}`} />
                          <div className="min-w-0">
                            <span className="block text-xs sm:text-sm font-semibold text-slate-900 truncate">
                              {h.name}
                            </span>
                            <span className={`block text-[11px] font-medium ${theme.textClass}`}>
                              {cat.name}
                            </span>
                          </div>
                        </div>
                        <span className="text-[11px] font-mono font-semibold text-slate-600 tabular-nums shrink-0">
                          {h.date}
                        </span>
                      </button>
                    );
                  })}

                  {searchDropdownResults.otherYearMatches.length > 0 && (
                    <>
                      <div className="px-3.5 py-1.5 bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        Matches in other years
                      </div>
                      {searchDropdownResults.otherYearMatches.map((h) => {
                        const cat = resolveHolidayCategory(h, categories);
                        const theme = getHolidayColorTheme(cat.color);
                        return (
                          <button
                            key={`other-${h.id}`}
                            type="button"
                            onClick={() => handleSelectSearchHoliday(h)}
                            className="w-full px-3.5 py-2.5 text-left hover:bg-slate-50 transition flex items-center justify-between gap-3 cursor-pointer"
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <span className={`w-2.5 h-2.5 rounded-xs shrink-0 ${theme.swatchClass}`} />
                              <div className="min-w-0">
                                <span className="block text-xs sm:text-sm font-semibold text-slate-900 truncate">
                                  {h.name}
                                </span>
                                <span className={`block text-[11px] font-medium ${theme.textClass}`}>
                                  {cat.name}
                                </span>
                              </div>
                            </div>
                            <span className="text-[11px] font-mono font-semibold text-indigo-600 tabular-nums shrink-0">
                              {h.date}
                            </span>
                          </button>
                        );
                      })}
                    </>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {/* Action Feedback Banners */}
        {actionSuccess && (
          <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-center gap-2 animate-fade-in">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span className="font-medium">{actionSuccess}</span>
          </div>
        )}
        {actionError && (
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-center gap-2 animate-fade-in">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span className="font-medium">{actionError}</span>
          </div>
        )}
      </div>

      {/* Responsive Split Content Area: Square Calendar Grid + Monthly Holidays List */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6 items-start">
        {/* Main Calendar Card: Separated Year Changer + Month Changer & Responsive Square Date Grid */}
        <div className="lg:col-span-7 rounded-2xl bg-white p-3.5 sm:p-6 shadow-xs border border-slate-200 w-full">
          {loading ? (
            <CalendarGridSkeleton />
          ) : (
            <div className="w-full max-w-[min(100%,64dvh)] mx-auto space-y-3.5 sm:space-y-5">
              {/* Separated Year Changer & Month Changer Header (replaces heading icon & details) */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 sm:gap-3 pb-3.5 border-b border-slate-100">
                {/* Separated Year Changer */}
                <div className="flex items-center justify-between gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1 min-h-[40px] sm:w-auto">
                  <button
                    type="button"
                    onClick={() => setSelectedYear((y) => y - 1)}
                    className="p-2 rounded-lg hover:bg-white hover:shadow-2xs text-slate-700 transition cursor-pointer shrink-0"
                    title="Previous Year"
                    aria-label="Previous Year"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <select
                    value={selectedYear}
                    onChange={(e) => setSelectedYear(Number(e.target.value))}
                    aria-label="Select Year"
                    className="bg-transparent px-2 py-1 text-xs sm:text-sm font-bold text-slate-900 text-center focus:outline-hidden cursor-pointer tabular-nums flex-1 min-w-0"
                  >
                    {yearOptions.map((y) => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => setSelectedYear((y) => y + 1)}
                    className="p-2 rounded-lg hover:bg-white hover:shadow-2xs text-slate-700 transition cursor-pointer shrink-0"
                    title="Next Year"
                    aria-label="Next Year"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>

                {/* Separated Month Changer */}
                <div className="flex items-center justify-between gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1 min-h-[40px] sm:w-auto">
                  <button
                    type="button"
                    onClick={handlePrevMonth}
                    className="p-2 rounded-lg hover:bg-white hover:shadow-2xs text-slate-700 transition cursor-pointer shrink-0"
                    title="Previous Month"
                    aria-label="Previous Month"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <select
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(Number(e.target.value))}
                    aria-label="Select Month"
                    className="bg-transparent px-2 py-1 text-xs sm:text-sm font-bold text-slate-900 text-center focus:outline-hidden cursor-pointer flex-1 min-w-0"
                  >
                    {MONTH_NAMES.map((mName, idx) => (
                      <option key={mName} value={idx}>
                        {mName}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={handleNextMonth}
                    className="p-2 rounded-lg hover:bg-white hover:shadow-2xs text-slate-700 transition cursor-pointer shrink-0"
                    title="Next Month"
                    aria-label="Next Month"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Day of Week Headers */}
              <div className="grid grid-cols-7 gap-1 sm:gap-2 text-center">
                {orderedWeekdays.map((col) => (
                  <div
                    key={col.label}
                    className={`py-1.5 sm:py-2 rounded-lg text-[10px] sm:text-xs font-bold uppercase tracking-wider truncate border ${
                      col.isSunday
                        ? 'text-rose-700 bg-rose-50 border-rose-200/80'
                        : col.isSaturday
                        ? 'text-slate-700 bg-slate-100 border-slate-200/90'
                        : 'text-slate-500 bg-slate-50 border-slate-100'
                    }`}
                  >
                    {col.label}
                  </div>
                ))}
              </div>

              {/* Square Calendar Date Cells — soft tint red for Sunday column, soft tint grey for Saturday column */}
              <div className="grid grid-cols-7 gap-1 sm:gap-2">
                {calendarDays.leadingBlanks.map((blank, i) => (
                  <div
                    key={`leading-blank-${i}`}
                    aria-hidden="true"
                    className={`aspect-square w-full rounded-lg sm:rounded-xl border border-dashed ${
                      blank.isSunday
                        ? 'border-rose-200/70 bg-rose-50/45'
                        : blank.isSaturday
                        ? 'border-slate-200/85 bg-slate-100/60'
                        : 'border-slate-200/70 bg-slate-50/40'
                    }`}
                  />
                ))}

                {calendarDays.days.map((item) => {
                  const isToday =
                    now.getFullYear() === selectedYear &&
                    now.getMonth() === selectedMonth &&
                    now.getDate() === item.dayNum;

                  const holiday = item.holiday;
                  const resolvedCat = holiday ? resolveHolidayCategory(holiday, categories) : null;
                  const holidayTheme = resolvedCat ? getHolidayColorTheme(resolvedCat.color) : null;

                  const cellSurfaceClass = item.isSunday
                    ? 'bg-rose-50/80 hover:bg-rose-100/75'
                    : item.isSaturday
                    ? 'bg-slate-100/85 hover:bg-slate-200/70'
                    : 'bg-white hover:bg-slate-50/60';

                  const cellBorderClass = isToday
                    ? 'border-2 border-slate-900 shadow-2xs'
                    : item.isSunday
                    ? 'border border-rose-200/90 hover:border-rose-300'
                    : item.isSaturday
                    ? 'border border-slate-200/95 hover:border-slate-300'
                    : 'border border-slate-200 hover:border-slate-400';

                  const numberTextColorClass = isToday
                    ? item.isSunday
                      ? 'text-rose-900 font-extrabold'
                      : 'text-slate-900 font-extrabold'
                    : item.isSunday
                    ? 'text-rose-700 font-bold'
                    : item.isSaturday
                    ? 'text-slate-700 font-semibold'
                    : 'text-slate-700 font-semibold';

                  return (
                    <button
                      key={item.dateStr}
                      type="button"
                      onClick={() => setInspectedDateStr(item.dateStr)}
                      title={
                        holiday && resolvedCat
                          ? `${holiday.name} (${resolvedCat.name})`
                          : item.dateStr
                      }
                      aria-label={
                        holiday && resolvedCat
                          ? `${item.dateStr}, ${holiday.name}, ${resolvedCat.name}`
                          : item.dateStr
                      }
                      className={`aspect-square w-full rounded-lg sm:rounded-xl flex items-center justify-center transition cursor-pointer relative focus:outline-hidden focus:ring-2 focus:ring-indigo-500 ${cellSurfaceClass} ${cellBorderClass}`}
                    >
                      {holidayTheme ? (
                        <span
                          className={`w-[72%] h-[72%] max-w-10 max-h-10 min-w-[26px] min-h-[26px] rounded-full flex items-center justify-center ${holidayTheme.swatchClass} text-white text-xs sm:text-sm md:text-base font-extrabold tabular-nums leading-none shadow-2xs select-none`}
                        >
                          {item.dayNum}
                        </span>
                      ) : (
                        <span
                          className={`tabular-nums leading-none select-none text-xs sm:text-sm md:text-base ${numberTextColorClass}`}
                        >
                          {item.dayNum}
                        </span>
                      )}
                    </button>
                  );
                })}

                {calendarDays.trailingBlanks.map((blank, i) => (
                  <div
                    key={`trailing-blank-${i}`}
                    aria-hidden="true"
                    className={`aspect-square w-full rounded-lg sm:rounded-xl border border-dashed ${
                      blank.isSunday
                        ? 'border-rose-200/70 bg-rose-50/45'
                        : blank.isSaturday
                        ? 'border-slate-200/85 bg-slate-100/60'
                        : 'border-slate-200/70 bg-slate-50/40'
                    }`}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Monthly Holidays List Overview */}
        <div className="lg:col-span-5 rounded-2xl bg-white p-4 sm:p-6 shadow-xs border border-slate-200 w-full lg:max-h-[78dvh] lg:overflow-y-auto">
          <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-100">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-sm sm:text-base font-bold text-slate-900">
                Holidays in {MONTH_NAMES[selectedMonth]} {selectedYear}
              </h2>
              <span className="text-xs font-semibold text-slate-500 tabular-nums">
                &bull; {monthHolidays.length} {monthHolidays.length === 1 ? 'holiday' : 'holidays'}
              </span>
            </div>
          </div>

          {monthHolidays.length === 0 ? (
            <div className="py-8 text-center text-slate-400 text-xs">
              <CalendarIcon className="w-7 h-7 mx-auto text-slate-300 mb-2" />
              <p className="font-semibold text-slate-700">
                No holidays registered in {MONTH_NAMES[selectedMonth]} {selectedYear}
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5">
                {canEditCalendar
                  ? 'Click any date square to register a holiday on that date.'
                  : 'Saturdays and Sundays follow standard non-working day overtime calculation policies.'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-3">
              {monthHolidays.map((h) => {
                const [y, m, d] = h.date.split('-').map(Number);
                const dt = new Date(y, m - 1, d);
                const dayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][dt.getDay()];
                const cat = resolveHolidayCategory(h, categories);
                const theme = getHolidayColorTheme(cat.color);

                return (
                  <div
                    key={h.id}
                    className="p-3.5 sm:p-4 rounded-xl border border-slate-200 bg-slate-50/50 hover:border-slate-300 transition flex flex-col justify-between"
                  >
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <span className="text-[11px] font-mono font-semibold text-slate-700 tabular-nums">
                          {h.date} &bull; {dayName}
                        </span>
                        <span className={`inline-flex items-center gap-1.5 text-[11px] font-bold ${theme.textClass}`}>
                          <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${theme.swatchClass}`} />
                          <span>{cat.name}</span>
                        </span>
                      </div>

                      <h3 className="text-xs sm:text-sm font-bold text-slate-900 leading-snug pt-0.5">
                        {h.name}
                      </h3>

                      {h.description && (
                        <p className="text-[11px] text-slate-500 leading-relaxed">
                          {h.description}
                        </p>
                      )}
                    </div>

                    {canEditCalendar && (
                      <div className="mt-3 pt-2.5 border-t border-slate-200/70 flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => openEditModal(h)}
                          className="p-1.5 text-slate-400 hover:text-indigo-600 rounded transition cursor-pointer"
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
                          className="p-1.5 text-slate-400 hover:text-rose-600 rounded transition cursor-pointer"
                          title="Delete Holiday"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Inspected Day Details Modal */}
      {inspectedDay && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 sm:p-4 backdrop-blur-xs">
          <div className="w-full max-w-md max-h-[90dvh] overflow-y-auto rounded-2xl bg-white p-5 sm:p-6 shadow-2xl border border-slate-200 animate-scale-in">
            <div className="flex items-start justify-between pb-4 border-b border-slate-100">
              <div>
                <span className="text-[11px] uppercase font-bold tracking-wider text-slate-400 block">
                  {inspectedDay.dayName}
                </span>
                <h2 className="text-lg font-bold text-slate-900">
                  {inspectedDay.monthName} {inspectedDay.dayNum}, {inspectedDay.year}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setInspectedDateStr(null)}
                className="text-slate-400 hover:text-slate-700 p-1 cursor-pointer"
                aria-label="Close day details"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="py-4 space-y-3 text-xs">
              {inspectedDay.holiday && inspectedDay.category && inspectedDay.theme ? (
                <div
                  className={`p-3.5 rounded-xl border ${inspectedDay.theme.borderClass} ${inspectedDay.theme.softBgClass} space-y-1.5`}
                >
                  <div className="flex items-center gap-2">
                    <span className={`w-2.5 h-2.5 rounded-xs shrink-0 ${inspectedDay.theme.swatchClass}`} />
                    <span className={`text-[11px] uppercase font-bold tracking-wide ${inspectedDay.theme.softTextClass}`}>
                      {inspectedDay.category.name}
                    </span>
                  </div>
                  <h3 className="text-sm font-bold text-slate-900">
                    {inspectedDay.holiday.name}
                  </h3>
                  {inspectedDay.holiday.description && (
                    <p className="text-xs text-slate-600">
                      {inspectedDay.holiday.description}
                    </p>
                  )}
                </div>
              ) : inspectedDay.isSun ? (
                <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50">
                  <span className="text-xs font-bold text-slate-900 block">
                    Weekly Non-Working Day (Sunday)
                  </span>
                  <p className="text-[11px] text-slate-600 mt-1">
                    Sunday shifts qualify for Non-Working Day Payment &amp; overtime calculation.
                  </p>
                </div>
              ) : inspectedDay.isSat ? (
                <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50">
                  <span className="text-xs font-bold text-slate-900 block">
                    Saturday Duty &amp; Overtime
                  </span>
                  <p className="text-[11px] text-slate-600 mt-1">
                    Overtime calculation starts from 8:00 AM and is calculated in 15-minute increments.
                  </p>
                </div>
              ) : (
                <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50">
                  <span className="text-xs font-bold text-slate-800 block">
                    Standard Working Day
                  </span>
                  <p className="text-[11px] text-slate-500 mt-1">
                    General shift schedule (08:00 - 16:45). Weekday overtime applies after shift end.
                  </p>
                </div>
              )}

              {/* Day Info End */}

              {/* Strictly Super Admin Only Edit / Delete Actions */}
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
                      Add Holiday on this Date
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Super Admin Only Add / Edit Holiday Modal */}
      {isModalOpen && canEditCalendar && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 sm:p-4 backdrop-blur-xs">
          <div className="w-full max-w-md max-h-[90dvh] overflow-y-auto rounded-2xl bg-white p-5 sm:p-6 shadow-2xl border border-slate-200 animate-scale-in">
            <h2 className="text-base font-bold text-slate-900 mb-1">
              {editingHoliday ? 'Edit Calendar Holiday' : 'Add Calendar Holiday'}
            </h2>
            <p className="text-xs text-slate-500 mb-4">
              Registered holidays are colored by category on the calendar and applied to monthly timesheets.
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
                <label className="block font-bold text-slate-700 mb-1">Holiday Name</label>
                <input
                  type="text"
                  required
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g. Vesak Full Moon Poya Day"
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
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name}
                    </option>
                  ))}
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

      {/* Super Admin Delete Confirmation Modal */}
      {canEditCalendar && (
        <ConfirmationModal
          isOpen={isDeleteModalOpen}
          onClose={() => setIsDeleteModalOpen(false)}
          onConfirm={handleConfirmDelete}
          title="Delete Holiday"
          message={`Are you sure you want to remove the holiday "${holidayToDelete?.name}" (${holidayToDelete?.date}) from the integrated calendar?`}
          confirmText="Delete Holiday"
          cancelText="Cancel"
          variant="danger"
          isLoading={isDeleting}
        />
      )}
    </div>
  );
};
