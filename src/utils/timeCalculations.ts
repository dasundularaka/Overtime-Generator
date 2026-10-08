export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export const DAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const DAYS_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// Company Standard Shift
export const GENERAL_SHIFT_START = '08:00'; // 8:00 AM
export const GENERAL_SHIFT_END = '16:45';   // 4:45 PM (1005 minutes)
export const SHIFT_END_MINUTES = 16 * 60 + 45; // 1005 minutes
export const OT_INCREMENT_STEP = 15; // 15-minute block increment

/**
 * Returns short day of week (e.g. 'Mon') for a YYYY-MM-DD date string.
 */
export function getDayOfWeek(dateStr: string): string {
  if (!dateStr) return '';
  const [year, month, day] = dateStr.split('-').map(Number);
  if (!year || !month || !day) return '';
  const date = new Date(year, month - 1, day);
  if (isNaN(date.getTime())) return '';
  return DAYS_SHORT[date.getDay()];
}

/**
 * Checks if a date falls on a weekend (Saturday or Sunday)
 */
export function isWeekendDay(dateStr: string): boolean {
  const dow = getDayOfWeek(dateStr);
  return dow === 'Sat' || dow === 'Sun';
}

/**
 * Parses "HH:mm" into total minutes from midnight.
 */
export function timeStringToMinutes(timeStr: string): number {
  if (!timeStr) return 0;
  const parts = timeStr.trim().split(':');
  if (parts.length < 2) return 0;
  const hours = parseInt(parts[0], 10) || 0;
  const minutes = parseInt(parts[1], 10) || 0;
  return hours * 60 + minutes;
}

/**
 * Formats minutes into HH:MM or decimal.
 */
export function formatMinutesToTime(totalMinutes: number, format: 'hhmm' | 'decimal' = 'hhmm'): string {
  if (totalMinutes <= 0 || isNaN(totalMinutes)) {
    return format === 'hhmm' ? '00:00' : '0.00';
  }

  if (format === 'decimal') {
    return (totalMinutes / 60).toFixed(2);
  }

  const hours = Math.floor(totalMinutes / 60);
  const minutes = Math.floor(totalMinutes % 60);
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

export interface ShiftOvertimeResult {
  totalWorkMinutes: number; // working time difference of starting and ending
  rawOtMinutes: number;     // unstepped minutes after 16:45
  totalMinutes: number;     // final generated OT in 15-min blocks and capped by limit
  totalFormatted: string;   // e.g. "02:00"
  isOvernight: boolean;
  isCapped: boolean;
  uncappedMinutes: number;
  lateDeductionMinutes: number;
  isLateDisqualified: boolean;
  lateNote: string;
  isDaysPayment?: boolean;
}

/**
 * Calculates working time difference and Overtime according to organizational policy:
 * - General shift: 8:00 AM to 4:45 PM (08:00 - 16:45)
 * - Only after 4:45 PM is overtime generated
 * - Late Attendance Rules (08:00 to 08:30):
 *     - Arrived 08:01 to 08:15: Deduct 15 mins from OT
 *     - Arrived 08:16 to 08:30: Deduct 30 mins from OT
 *     - Arrived after 08:30: Strictly 0 OT minutes allocated for that day
 * - Generated in 15-minute increments (15 mins to 15 mins)
 * - Capped to user's assigned maximum overtime limit (e.g. 2.0 hours)
 */
export function calculateShiftOvertime(
  startTime: string,
  endTime: string,
  breakMinutes: number = 0,
  maxOtHoursLimit?: number, // e.g. 2.0 hrs
  isOtherDay: boolean = false, // Saturdays, Sundays, or Holidays (not regular weekday working day)
  shiftEndStr: string = GENERAL_SHIFT_END
): ShiftOvertimeResult {
  if (!startTime || !endTime) {
    return {
      totalWorkMinutes: 0,
      rawOtMinutes: 0,
      totalMinutes: 0,
      totalFormatted: '00:00',
      isOvernight: false,
      isCapped: false,
      uncappedMinutes: 0,
      lateDeductionMinutes: 0,
      isLateDisqualified: false,
      lateNote: '',
      isDaysPayment: false,
    };
  }

  const startMin = timeStringToMinutes(startTime);
  const endMin = timeStringToMinutes(endTime);
  const shiftEndMin = timeStringToMinutes(shiftEndStr);

  let isOvernight = false;
  let totalWorkDiff = 0;

  if (endMin < startMin) {
    // Crosses midnight (e.g. 08:00 to 02:00 next day = (1440 - 480) + 120 = 1080 min)
    totalWorkDiff = (1440 - startMin) + endMin;
    isOvernight = true;
  } else {
    totalWorkDiff = endMin - startMin;
  }

  // Deduct break from work diff
  const netWorkDuration = Math.max(0, totalWorkDiff - (breakMinutes || 0));

  // Policy: Other days instead of working days of weekdays (Saturdays, Sundays, Holidays)
  // - No shift or late arrival conditions apply
  // - No hourly overtime rate allocated
  // - Allocated as Day's Payment (Day's Pay)
  // - Shift and OT hours are not shown on those days
  if (isOtherDay) {
    return {
      totalWorkMinutes: netWorkDuration,
      rawOtMinutes: 0,
      totalMinutes: 0,
      totalFormatted: '00:00',
      isOvernight,
      isCapped: false,
      uncappedMinutes: 0,
      lateDeductionMinutes: 0,
      isLateDisqualified: false,
      lateNote: netWorkDuration > 0 ? "Day's Pay (Non-working day)" : '',
      isDaysPayment: netWorkDuration > 0,
    };
  }

  let rawOtMinutes = 0;
  // Normal Shift Day: Only time worked strictly AFTER 4:45 PM (16:45)
  if (isOvernight) {
    // Worked from afternoon/evening past midnight
    // From 16:45 to midnight (1440 - 1005 = 435 mins) + minutes after midnight
    const eveningAfterShift = Math.max(0, 1440 - Math.max(startMin, shiftEndMin));
    const nextDayOt = endMin;
    rawOtMinutes = Math.max(0, eveningAfterShift + nextDayOt - (breakMinutes || 0));
  } else {
    // Same day shift:
    if (endMin > shiftEndMin) {
      // Only count minutes past 16:45
      const effectiveStartForOt = Math.max(startMin, shiftEndMin);
      rawOtMinutes = Math.max(0, endMin - effectiveStartForOt - (breakMinutes || 0));
    } else {
      rawOtMinutes = 0;
    }
  }

  // Step 1.5: Late attendance deduction policy (between 8:00 AM and 8:30 AM on weekdays)
  // - 8:00 to 8:15 -> deduct 15 mins from OT
  // - 8:16 to 8:30 -> deduct 30 mins from OT
  // - After 8:30   -> 0 OT allowance for that date
  let lateDeductionMinutes = 0;
  let isLateDisqualified = false;
  let lateNote = '';

  const morningShiftStartMin = 8 * 60; // 08:00 = 480 min
  if (startMin > morningShiftStartMin + 30) {
    // Arrived after 08:30 (e.g. 08:31+)
    isLateDisqualified = true;
    rawOtMinutes = 0;
    lateNote = 'Late arrival after 08:30 (No OT allocated)';
  } else if (startMin > morningShiftStartMin + 15) {
    // Arrived 08:16 - 08:30
    lateDeductionMinutes = 30;
    rawOtMinutes = Math.max(0, rawOtMinutes - 30);
    lateNote = 'Late arrival (08:16–08:30): -30 min OT';
  } else if (startMin > morningShiftStartMin) {
    // Arrived 08:01 - 08:15
    lateDeductionMinutes = 15;
    rawOtMinutes = Math.max(0, rawOtMinutes - 15);
    lateNote = 'Late arrival (08:01–08:15): -15 min OT';
  }

  // Step 2: Overtime generation in 15-minute to 15-minute blocks
  // e.g. 14 mins -> 0 mins; 15 mins -> 15 mins; 29 mins -> 15 mins; 30 mins -> 30 mins
  const steppedOtMinutes = Math.floor(rawOtMinutes / OT_INCREMENT_STEP) * OT_INCREMENT_STEP;

  // Step 3: Apply assigned User Overtime Limit
  let finalOtMinutes = steppedOtMinutes;
  let isCapped = false;

  if (maxOtHoursLimit !== undefined && maxOtHoursLimit !== null && maxOtHoursLimit > 0) {
    const maxAllowedMinutes = Math.round(maxOtHoursLimit * 60);
    if (steppedOtMinutes > maxAllowedMinutes) {
      finalOtMinutes = maxAllowedMinutes;
      isCapped = true;
    }
  }

  return {
    totalWorkMinutes: netWorkDuration,
    rawOtMinutes,
    totalMinutes: finalOtMinutes,
    totalFormatted: formatMinutesToTime(finalOtMinutes, 'hhmm'),
    isOvernight,
    isCapped,
    uncappedMinutes: steppedOtMinutes,
    lateDeductionMinutes,
    isLateDisqualified,
    lateNote,
  };
}

/**
 * Backwards compatibility helper
 */
export function calculateRowOvertime(
  startTime: string,
  endTime: string,
  breakMinutes: number = 0,
  forceOvernight?: boolean,
  maxOtHoursLimit?: number,
  isOtherDay?: boolean
): { totalMinutes: number; totalFormatted: string; isOvernight: boolean; isCapped: boolean; isDaysPayment?: boolean } {
  const res = calculateShiftOvertime(startTime, endTime, breakMinutes, maxOtHoursLimit, isOtherDay);
  return {
    totalMinutes: res.totalMinutes,
    totalFormatted: res.totalFormatted,
    isOvernight: res.isOvernight || !!forceOvernight,
    isCapped: res.isCapped,
    isDaysPayment: res.isDaysPayment,
  };
}

export function getDaysInMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

export function generateMonthDates(
  year: number,
  monthIndex: number,
  holidayDatesSet?: Set<string>,
  excludeHolidaysAndSundays: boolean = false
): { date: string; day: string; isHoliday?: boolean }[] {
  const totalDays = getDaysInMonth(year, monthIndex);
  const result: { date: string; day: string; isHoliday?: boolean }[] = [];

  for (let d = 1; d <= totalDays; d++) {
    const monthStr = String(monthIndex + 1).padStart(2, '0');
    const dayStr = String(d).padStart(2, '0');
    const date = `${year}-${monthStr}-${dayStr}`;
    const day = getDayOfWeek(date);
    const isSun = day === 'Sun';
    const isHol = isSun || (holidayDatesSet ? holidayDatesSet.has(date) : false);

    if (excludeHolidaysAndSundays && isHol) {
      // Auto fill month automatically removes holidays and Sundays
      continue;
    }

    result.push({
      date,
      day,
      isHoliday: isHol,
    });
  }

  return result;
}

export function formatDisplayDate(dateStr: string): string {
  if (!dateStr) return '';
  const [year, month, day] = dateStr.split('-').map(Number);
  if (!year || !month || !day) return dateStr;
  const monthName = MONTH_NAMES[month - 1] ? MONTH_NAMES[month - 1].slice(0, 3) : '';
  return `${day} ${monthName} ${year}`;
}
