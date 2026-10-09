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
  FileSpreadsheet,
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
import { ConfirmationModal } from './ConfirmationModal';
import { MONTH_NAMES, DAYS_SHORT } from '../utils/timeCalculations';

export const CalendarManager: React.FC = () => {
  const { isAdmin } = useAuth();
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Month & Year Filter
  const now = new Date();
  const [selectedYear, setSelectedYear] = useState<number>(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<number>(now.getMonth()); // 0-indexed

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

  useEffect(() => {
    setLoading(true);
    const unsub = subscribeToHolidays((list) => {
      setHolidays(list);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const openAddModal = (initialDate?: string) => {
    setEditingHoliday(null);
    setFormDate(initialDate || `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-01`);
    setFormName('');
    setFormType('public');
    setFormDescription('');
    setActionError(null);
    setIsModalOpen(true);
  };

  const openEditModal = (h: Holiday) => {
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
    if (!formDate || !formName.trim()) {
      setActionError('Please provide both holiday date and name.');
      return;
    }

    setIsSubmitting(true);
    setActionError(null);
    try {
      await saveHoliday({
        id: editingHoliday?.id,
        date: formDate,
        name: formName.trim(),
        type: formType,
        description: formDescription.trim(),
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
    if (!holidayToDelete) return;
    setIsDeleting(true);
    try {
      await deleteHoliday(holidayToDelete.id);
      setIsDeleteModalOpen(false);
      setActionSuccess(`Holiday "${holidayToDelete.name}" deleted.`);
      setTimeout(() => setActionSuccess(null), 3000);
    } catch (err: any) {
      setActionError(err.message || 'Failed to delete holiday.');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleConfirmSeed = async () => {
    setIsSeeding(true);
    try {
      const count = await seedStandardHolidays();
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
          importedList = parsed.map(item => ({
            date: item.date || item.holidayDate || '',
            name: item.name || item.holidayName || item.description || '',
            type: (item.type || 'public') as HolidayType,
            description: item.description || item.notes || '',
          }));
        } else {
          throw new Error('Invalid JSON format: expected an array of holiday objects [{ date, name }]');
        }
      } else {
        // Parse CSV format
        const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
        if (lines.length === 0) throw new Error('File is empty.');

        const startIdx = lines[0].toLowerCase().includes('date') ? 1 : 0;
        for (let i = startIdx; i < lines.length; i++) {
          const parts = lines[i].split(',').map(s => s.trim().replace(/^["']|["']$/g, ''));
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

      // Filter and save valid items
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
    return holidays.filter((h) => h.date.startsWith(prefix));
  }, [holidays, selectedYear, selectedMonth]);

  // Days in selected month for calendar view
  const calendarDays = useMemo(() => {
    const totalDays = new Date(selectedYear, selectedMonth + 1, 0).getDate();
    const firstDayIndex = new Date(selectedYear, selectedMonth, 1).getDay(); // 0 is Sun

    const days: Array<{
      dayNum: number;
      dateStr: string;
      isSunday: boolean;
      holiday?: Holiday;
    }> = [];

    for (let d = 1; d <= totalDays; d++) {
      const dateStr = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const dt = new Date(selectedYear, selectedMonth, d);
      const isSunday = dt.getDay() === 0;
      const holiday = holidays.find((h) => h.date === dateStr);
      days.push({ dayNum: d, dateStr, isSunday, holiday });
    }

    return { totalDays, firstDayIndex, days };
  }, [selectedYear, selectedMonth, holidays]);

  return (
    <div className="space-y-6 pb-16">
      {/* Top Header Card */}
      <div className="rounded-2xl bg-white p-5 sm:p-6 shadow-xs border border-slate-200">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-5 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-purple-50 text-purple-600">
                <CalendarIcon className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
                  Company &amp; Public Holidays Calendar
                </h1>
                <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
                  Public, bank, and company holidays. These dates are synced with overtime claiming and auto-fill month generation.
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {isAdmin && (
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
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-700 text-xs font-semibold border border-purple-200 transition cursor-pointer"
                  title="Import Standard Annual Public & Bank Holidays"
                >
                  <Sparkles className="w-3.5 h-3.5 text-purple-600" />
                  <span>Import Standard Holidays</span>
                </button>

                <button
                  type="button"
                  disabled={isImportingFile}
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold border border-slate-300 transition cursor-pointer disabled:opacity-60"
                  title="Import Holidays from CSV or JSON file"
                >
                  <Upload className="w-3.5 h-3.5 text-slate-600" />
                  <span>{isImportingFile ? 'Importing File...' : 'Import CSV / JSON'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => openAddModal()}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-xs transition cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Holiday</span>
                </button>
              </>
            )}
          </div>
        </div>

        {/* Month Selector Bar */}
        <div className="mt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
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
              className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-600 transition"
              title="Previous Month"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <span className="text-sm sm:text-base font-bold text-slate-800 min-w-[150px] text-center">
              {MONTH_NAMES[selectedMonth]} {selectedYear}
            </span>

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
              className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-600 transition"
              title="Next Month"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <div className="flex items-center gap-3 text-xs text-slate-500">
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-purple-500 inline-block" />
              <span>Public / Poya Holiday</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-amber-400 inline-block" />
              <span>Bank Holiday</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-rose-400 inline-block" />
              <span>Sunday</span>
            </div>
          </div>
        </div>

        {/* Notifications */}
        {actionSuccess && (
          <div className="mt-4 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{actionSuccess}</span>
          </div>
        )}
        {actionError && (
          <div className="mt-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{actionError}</span>
          </div>
        )}
      </div>

      {/* Main Grid: Calendar View & Monthly Holidays List */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Monthly Calendar View (2 Cols) */}
        <div className="lg:col-span-2 rounded-2xl bg-white p-5 shadow-xs border border-slate-200">
          <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-100">
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <CalendarCheck className="w-4 h-4 text-indigo-600" />
              <span>
                Calendar View &bull; {MONTH_NAMES[selectedMonth]} {selectedYear}
              </span>
            </h2>
            <span className="text-xs text-slate-400 font-medium">
              Sundays &amp; Holidays excluded from working days
            </span>
          </div>

          {/* Day of Week Headers */}
          <div className="grid grid-cols-7 gap-1 text-center font-bold text-[11px] text-slate-500 mb-2">
            {DAYS_SHORT.map((day, idx) => (
              <div
                key={day}
                className={`py-1.5 rounded-lg ${
                  idx === 0 ? 'text-rose-600 bg-rose-50/50' : idx === 6 ? 'text-amber-700 bg-amber-50/30' : 'bg-slate-50'
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
              <div key={`blank-${i}`} className="min-h-[70px] bg-slate-50/40 rounded-xl border border-dashed border-slate-200" />
            ))}

            {/* Actual day cells */}
            {calendarDays.days.map((item) => {
              const isToday =
                now.getFullYear() === selectedYear &&
                now.getMonth() === selectedMonth &&
                now.getDate() === item.dayNum;

              const isHol = !!item.holiday;
              const isSun = item.isSunday;

              return (
                <div
                  key={item.dateStr}
                  onClick={() => isAdmin && openAddModal(item.dateStr)}
                  className={`min-h-[74px] p-1.5 rounded-xl border flex flex-col justify-between transition group relative ${
                    isAdmin ? 'cursor-pointer hover:shadow-xs' : ''
                  } ${
                    isHol
                      ? 'bg-purple-50/70 border-purple-200 text-purple-950'
                      : isSun
                      ? 'bg-rose-50/50 border-rose-200 text-rose-950'
                      : 'bg-white border-slate-200 hover:border-indigo-300'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={`text-xs font-bold ${
                        isToday
                          ? 'w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center'
                          : isSun
                          ? 'text-rose-600'
                          : isHol
                          ? 'text-purple-700'
                          : 'text-slate-700'
                      }`}
                    >
                      {item.dayNum}
                    </span>

                    {isHol && (
                      <span className="w-1.5 h-1.5 rounded-full bg-purple-600" />
                    )}
                  </div>

                  {/* Holiday title tag */}
                  {item.holiday ? (
                    <div className="mt-1">
                      <span className="block text-[9px] font-bold leading-tight line-clamp-2 text-purple-800 bg-purple-100/80 px-1 py-0.5 rounded border border-purple-200">
                        {item.holiday.name}
                      </span>
                    </div>
                  ) : isSun ? (
                    <div className="mt-1">
                      <span className="block text-[9px] font-medium text-rose-500">
                        Sunday
                      </span>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>

        {/* Monthly Holidays List (1 Col) */}
        <div className="rounded-2xl bg-white p-5 shadow-xs border border-slate-200 flex flex-col">
          <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-100">
            <h2 className="text-sm font-bold text-slate-900">
              Holidays in {MONTH_NAMES[selectedMonth]} ({monthHolidays.length})
            </h2>
          </div>

          <div className="flex-1 overflow-y-auto space-y-2.5 max-h-[500px]">
            {monthHolidays.length === 0 ? (
              <div className="py-12 text-center text-slate-400 text-xs">
                <CalendarIcon className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                <p className="font-semibold text-slate-600">No public holidays in {MONTH_NAMES[selectedMonth]}</p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Sundays are regular weekly non-working days.
                </p>
                {isAdmin && (
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
              monthHolidays.map((h) => (
                <div
                  key={h.id}
                  className="p-3 rounded-xl border border-purple-100 bg-purple-50/40 hover:bg-purple-50/70 transition flex items-start justify-between gap-2"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.2 rounded bg-purple-100 text-purple-800 border border-purple-200">
                        {h.type}
                      </span>
                      <span className="text-xs font-mono font-bold text-slate-700">
                        {h.date}
                      </span>
                    </div>
                    <h3 className="text-xs font-bold text-slate-900 leading-snug">
                      {h.name}
                    </h3>
                    {h.description && (
                      <p className="text-[11px] text-slate-500 leading-tight">
                        {h.description}
                      </p>
                    )}
                  </div>

                  {isAdmin && (
                    <div className="flex items-center gap-1 shrink-0 pt-0.5">
                      <button
                        type="button"
                        onClick={() => openEditModal(h)}
                        className="p-1 text-slate-400 hover:text-indigo-600 rounded transition cursor-pointer"
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
                        className="p-1 text-slate-400 hover:text-rose-600 rounded transition cursor-pointer"
                        title="Delete Holiday"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>

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
