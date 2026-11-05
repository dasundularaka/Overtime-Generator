import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Clock, X, Check, ChevronUp, ChevronDown } from 'lucide-react';

interface ScrollableTimePickerProps {
  value: string; // 24-hour format "HH:mm" (e.g. "08:30" or "17:00")
  onChange: (value24: string) => void;
  disabled?: boolean;
  placeholder?: string;
  label?: string; // e.g. "Time In" or "Time Out"
  disableSession?: 'AM' | 'PM' | null; // Strictly block selecting same session
  autoSession?: 'AM' | 'PM' | null; // Auto-selected session if first one was AM/PM
  className?: string;
  isTimeIn?: boolean;
}

export function parse24To12(time24: string): { hour: number; minute: number; period: 'AM' | 'PM' } {
  if (!time24 || !time24.includes(':')) {
    return { hour: 8, minute: 30, period: 'AM' };
  }
  const parts = time24.split(':');
  let h = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  if (isNaN(h)) h = 8;
  const period: 'AM' | 'PM' = h >= 12 ? 'PM' : 'AM';
  let hour12 = h % 12;
  if (hour12 === 0) hour12 = 12;
  return { hour: hour12, minute: isNaN(m) ? 0 : m, period };
}

export function format12To24(hour: number, minute: number, period: 'AM' | 'PM'): string {
  let h = hour % 12;
  if (period === 'PM') h += 12;
  const hh = String(h).padStart(2, '0');
  const mm = String(minute).padStart(2, '0');
  return `${hh}:${mm}`;
}

export function format24To12Display(time24: string): string {
  if (!time24) return '';
  const { hour, minute, period } = parse24To12(time24);
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')} ${period}`;
}

const HOURS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
// All minutes 1 to 1 (0 to 59)
const MINUTES = Array.from({ length: 60 }, (_, i) => i);

export const ScrollableTimePicker: React.FC<ScrollableTimePickerProps> = ({
  value,
  onChange,
  disabled = false,
  placeholder = 'Select time',
  label,
  disableSession = null,
  autoSession = null,
  className = '',
  isTimeIn = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const hoursColRef = useRef<HTMLDivElement>(null);
  const minutesColRef = useRef<HTMLDivElement>(null);

  // Parse current 24-hour value into 12-hour components
  const parsed = useMemo(() => {
    if (value) {
      const p = parse24To12(value);
      // If the current period is forbidden by disableSession, auto-shift to the allowed session
      if (disableSession && p.period === disableSession) {
        const allowedPeriod: 'AM' | 'PM' = disableSession === 'AM' ? 'PM' : 'AM';
        return { ...p, period: allowedPeriod };
      }
      return p;
    }
    // If no value, use autoSession or defaults
    const defaultPeriod: 'AM' | 'PM' = autoSession || (isTimeIn ? 'AM' : 'PM');
    const defaultHour = isTimeIn ? 8 : 5;
    const defaultMin = isTimeIn ? 30 : 0;
    return {
      hour: defaultHour,
      minute: defaultMin,
      period: disableSession === defaultPeriod ? (defaultPeriod === 'AM' ? 'PM' : 'AM') : defaultPeriod,
    };
  }, [value, disableSession, autoSession, isTimeIn]);

  const [selectedHour, setSelectedHour] = useState<number>(parsed.hour);
  const [selectedMinute, setSelectedMinute] = useState<number>(parsed.minute);
  const [selectedPeriod, setSelectedPeriod] = useState<'AM' | 'PM'>(parsed.period);

  // Sync internal state when external value changes
  useEffect(() => {
    setSelectedHour(parsed.hour);
    setSelectedMinute(parsed.minute);
    let targetPeriod = parsed.period;
    if (disableSession && targetPeriod === disableSession) {
      targetPeriod = disableSession === 'AM' ? 'PM' : 'AM';
    }
    setSelectedPeriod(targetPeriod);
  }, [parsed, disableSession]);

  // Click outside to close
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Auto-scroll selected hour & minute into view when popover opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        const hourEl = hoursColRef.current?.querySelector(`[data-hour="${selectedHour}"]`);
        hourEl?.scrollIntoView({ block: 'center', behavior: 'smooth' });

        const minEl = minutesColRef.current?.querySelector(`[data-minute="${selectedMinute}"]`);
        minEl?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }, 50);
    }
  }, [isOpen]);

  const commitTime = (hour: number, minute: number, period: 'AM' | 'PM') => {
    let finalPeriod = period;
    // Strictly prevent same session if restricted
    if (disableSession && finalPeriod === disableSession) {
      finalPeriod = disableSession === 'AM' ? 'PM' : 'AM';
    }
    setSelectedHour(hour);
    setSelectedMinute(minute);
    setSelectedPeriod(finalPeriod);
    const new24 = format12To24(hour, minute, finalPeriod);
    onChange(new24);
  };

  const handleHourSelect = (h: number) => {
    commitTime(h, selectedMinute, selectedPeriod);
  };

  const handleMinuteSelect = (m: number) => {
    commitTime(selectedHour, m, selectedPeriod);
  };

  const handlePeriodSelect = (p: 'AM' | 'PM') => {
    if (disableSession && p === disableSession) return;
    commitTime(selectedHour, selectedMinute, p);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange('');
    setIsOpen(false);
  };

  const handlePreset = (h: number, m: number, p: 'AM' | 'PM') => {
    commitTime(h, m, p);
    setIsOpen(false);
  };

  const displayTime = value ? format24To12Display(value) : '';

  return (
    <div ref={containerRef} className={`relative inline-block w-full ${className}`}>
      {/* Trigger Button (Replaces Native Time Input) */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        className={`w-full py-1.5 px-2.5 rounded-xl border flex items-center justify-between text-xs font-mono transition shadow-2xs select-none ${
          disabled
            ? 'border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed opacity-75'
            : isOpen
            ? 'border-indigo-500 ring-2 ring-indigo-500/20 bg-white text-slate-900'
            : value
            ? isTimeIn
              ? 'border-emerald-300 bg-emerald-50/20 text-emerald-950 font-bold hover:border-emerald-400'
              : 'border-indigo-300 bg-indigo-50/20 text-indigo-950 font-bold hover:border-indigo-400'
            : 'border-slate-200 bg-white text-slate-400 hover:border-slate-300'
        }`}
      >
        <div className="flex items-center gap-1.5 min-w-0 truncate">
          <Clock
            className={`w-3.5 h-3.5 shrink-0 ${
              disabled
                ? 'text-slate-300'
                : value
                ? isTimeIn
                  ? 'text-emerald-600'
                  : 'text-indigo-600'
                : 'text-slate-400'
            }`}
          />
          {value ? (
            <div className="flex items-center gap-1">
              <span className="font-bold text-slate-900 tracking-tight">
                {String(parsed.hour).padStart(2, '0')}:{String(parsed.minute).padStart(2, '0')}
              </span>
              <span
                className={`text-[10px] font-black px-1.5 py-0.2 rounded-md ${
                  parsed.period === 'AM'
                    ? 'bg-amber-100 text-amber-900 border border-amber-300'
                    : 'bg-indigo-100 text-indigo-900 border border-indigo-300'
                }`}
              >
                {parsed.period}
              </span>
            </div>
          ) : (
            <span className="text-slate-400 font-sans font-normal truncate">{placeholder}</span>
          )}
        </div>

        {value && !disabled && (
          <span
            onClick={handleClear}
            className="p-0.5 text-slate-400 hover:text-rose-600 rounded-md transition hover:bg-slate-100 cursor-pointer"
            title="Clear time"
          >
            <X className="w-3 h-3" />
          </span>
        )}
      </button>

      {/* Modern Scrollable Time Picker Centered Modal Dialog (Pops up in the middle) */}
      {isOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 animate-fade-in"
          onClick={() => setIsOpen(false)}
        >
          <div
            className="relative w-full max-w-[320px] bg-white rounded-3xl border border-slate-200 shadow-2xl p-4 space-y-3.5 animate-scale-in text-slate-800"
            onClick={e => e.stopPropagation()}
          >
            {/* Header Preview & Info */}
            <div className="flex items-center justify-between pb-2.5 border-b border-slate-100">
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                  {label || (isTimeIn ? 'Time In (Start)' : 'Time Out (End)')}
                </span>
                <div className="flex items-baseline gap-1.5 mt-0.5">
                  <span className="font-mono text-xl font-black text-slate-900">
                    {String(selectedHour).padStart(2, '0')}:{String(selectedMinute).padStart(2, '0')}
                  </span>
                  <span
                    className={`text-xs font-black px-1.5 py-0.5 rounded-md ${
                      selectedPeriod === 'AM'
                        ? 'bg-amber-100 text-amber-900 border border-amber-300'
                        : 'bg-indigo-100 text-indigo-900 border border-indigo-300'
                    }`}
                  >
                    {selectedPeriod}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {disableSession && (
                  <span className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-lg text-right max-w-[120px] leading-tight">
                    {disableSession === 'AM' ? 'Auto PM' : 'Auto AM'}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition cursor-pointer"
                  title="Close"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

          {/* Quick Presets for fast standard shift entry */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-[11px] font-semibold">
            <span className="text-[10px] text-slate-400 uppercase tracking-wider font-bold shrink-0">Quick:</span>
            {isTimeIn ? (
              <>
                <button
                  type="button"
                  onClick={() => handlePreset(8, 30, 'AM')}
                  className="px-2 py-0.5 rounded-md bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 transition cursor-pointer shrink-0 font-mono"
                >
                  08:30 AM (Shift Start)
                </button>
                <button
                  type="button"
                  onClick={() => handlePreset(8, 0, 'AM')}
                  className="px-2 py-0.5 rounded-md bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 transition cursor-pointer shrink-0 font-mono"
                >
                  08:00 AM
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => handlePreset(5, 0, 'PM')}
                  className="px-2 py-0.5 rounded-md bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 transition cursor-pointer shrink-0 font-mono"
                >
                  05:00 PM (Shift End)
                </button>
                <button
                  type="button"
                  onClick={() => handlePreset(5, 30, 'PM')}
                  className="px-2 py-0.5 rounded-md bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 transition cursor-pointer shrink-0 font-mono"
                >
                  05:30 PM
                </button>
                <button
                  type="button"
                  onClick={() => handlePreset(6, 0, 'PM')}
                  className="px-2 py-0.5 rounded-md bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 transition cursor-pointer shrink-0 font-mono"
                >
                  06:00 PM
                </button>
              </>
            )}
          </div>

          {/* 3 Columns: Hour, Minute, AM/PM */}
          <div className="grid grid-cols-3 gap-2 bg-slate-50/70 p-2 rounded-xl border border-slate-100">
            {/* Column 1: Hour (1-12) */}
            <div className="flex flex-col">
              <span className="text-[10px] font-bold text-slate-500 uppercase text-center mb-1">
                Hour
              </span>
              <div
                ref={hoursColRef}
                className="h-44 overflow-y-auto rounded-lg bg-white border border-slate-200 p-1 space-y-1 shadow-inner scroll-smooth"
              >
                {HOURS.map(h => (
                  <button
                    key={h}
                    data-hour={h}
                    type="button"
                    onClick={() => handleHourSelect(h)}
                    className={`w-full py-1.5 rounded-md text-xs font-mono font-bold transition text-center cursor-pointer ${
                      selectedHour === h
                        ? 'bg-indigo-600 text-white shadow-2xs font-black'
                        : 'text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    {String(h).padStart(2, '0')}
                  </button>
                ))}
              </div>
            </div>

            {/* Column 2: Minute (00-55, 15m intervals highlighted) */}
            <div className="flex flex-col">
              <span className="text-[10px] font-bold text-slate-500 uppercase text-center mb-1">
                Minute
              </span>
              <div
                ref={minutesColRef}
                className="h-44 overflow-y-auto rounded-lg bg-white border border-slate-200 p-1 space-y-1 shadow-inner scroll-smooth"
              >
                {MINUTES.map(m => {
                  const is15Block = m % 15 === 0;
                  return (
                    <button
                      key={m}
                      data-minute={m}
                      type="button"
                      onClick={() => handleMinuteSelect(m)}
                      className={`w-full py-1.5 rounded-md text-xs font-mono transition text-center cursor-pointer ${
                        selectedMinute === m
                          ? 'bg-indigo-600 text-white shadow-2xs font-black'
                          : is15Block
                          ? 'bg-indigo-50/70 text-indigo-900 font-bold hover:bg-indigo-100'
                          : 'text-slate-600 hover:bg-slate-100'
                      }`}
                      title={is15Block ? 'Standard 15-minute OT block' : ''}
                    >
                      {String(m).padStart(2, '0')}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Column 3: AM / PM Segmented Control */}
            <div className="flex flex-col">
              <span className="text-[10px] font-bold text-slate-500 uppercase text-center mb-1">
                Session
              </span>
              <div className="h-44 rounded-lg bg-white border border-slate-200 p-1.5 flex flex-col justify-around gap-2 shadow-inner">
                {/* AM Button */}
                <button
                  type="button"
                  disabled={disableSession === 'AM'}
                  onClick={() => handlePeriodSelect('AM')}
                  className={`w-full py-3.5 px-2 rounded-xl text-xs font-black transition cursor-pointer flex flex-col items-center justify-center gap-0.5 ${
                    selectedPeriod === 'AM'
                      ? 'bg-amber-500 text-white shadow-xs ring-2 ring-amber-300'
                      : disableSession === 'AM'
                      ? 'bg-slate-100 text-slate-300 cursor-not-allowed opacity-50'
                      : 'bg-slate-50 text-slate-700 hover:bg-amber-50 hover:text-amber-900 border border-slate-200'
                  }`}
                  title={disableSession === 'AM' ? 'Cannot be in same session (AM)' : 'Morning session'}
                >
                  <span className="text-sm font-black">AM</span>
                  <span className="text-[9px] font-normal opacity-85">Morning</span>
                </button>

                {/* PM Button */}
                <button
                  type="button"
                  disabled={disableSession === 'PM'}
                  onClick={() => handlePeriodSelect('PM')}
                  className={`w-full py-3.5 px-2 rounded-xl text-xs font-black transition cursor-pointer flex flex-col items-center justify-center gap-0.5 ${
                    selectedPeriod === 'PM'
                      ? 'bg-indigo-600 text-white shadow-xs ring-2 ring-indigo-300'
                      : disableSession === 'PM'
                      ? 'bg-slate-100 text-slate-300 cursor-not-allowed opacity-50'
                      : 'bg-slate-50 text-slate-700 hover:bg-indigo-50 hover:text-indigo-900 border border-slate-200'
                  }`}
                  title={disableSession === 'PM' ? 'Cannot be in same session (PM)' : 'Afternoon / Evening session'}
                >
                  <span className="text-sm font-black">PM</span>
                  <span className="text-[9px] font-normal opacity-85">Afternoon</span>
                </button>
              </div>
            </div>
          </div>

          {/* Done & Clear Actions */}
          <div className="flex items-center justify-between pt-1">
            <button
              type="button"
              onClick={handleClear}
              className="text-xs font-semibold text-rose-600 hover:text-rose-800 transition cursor-pointer px-2 py-1"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="px-4 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-xs transition cursor-pointer inline-flex items-center gap-1"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Done</span>
            </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
