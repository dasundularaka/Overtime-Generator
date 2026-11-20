import { OvertimeRow } from '../types';
import { formatMinutesToTime, timeStringToMinutes } from './timeCalculations';

export interface OutOfPocketDurationResult {
  durationMinutes: number;
  durationFormatted: string;
  isOvernight: boolean;
}

/**
 * Isolated duration calculator for Monthly Out of Pocket Allowance (Form 10610).
 * Strictly separated from Form 10756 Overtime rules:
 * - Does NOT apply 08:00 - 16:45 shift cutoffs
 * - Does NOT apply 15-minute OT stepping
 * - Does NOT apply late attendance penalties or daily OT caps
 */
export function calculateOutOfPocketDuration(
  startTime: string,
  endTime: string
): OutOfPocketDurationResult {
  if (!startTime || !endTime) {
    return {
      durationMinutes: 0,
      durationFormatted: '00:00',
      isOvernight: false,
    };
  }

  const startMin = timeStringToMinutes(startTime);
  const endMin = timeStringToMinutes(endTime);

  let isOvernight = false;
  let durationMinutes = 0;

  if (endMin < startMin) {
    durationMinutes = (1440 - startMin) + endMin;
    isOvernight = true;
  } else {
    durationMinutes = Math.max(0, endMin - startMin);
  }

  return {
    durationMinutes,
    durationFormatted: formatMinutesToTime(durationMinutes, 'hhmm'),
    isOvernight,
  };
}

export interface OutOfPocketSummary {
  loggedDaysCount: number;
  totalWorkMinutes: number;
  totalHoursFormatted: string;
  totalDecimalHours: number;
  totalAmountRs: number;
}

/**
 * Computes summary totals strictly from Out of Pocket rows without invoking
 * any Form 10756 Overtime hourly rates, Day's Pay rules, or Col A / Col B logic.
 */
export function summarizeOutOfPocketRows(
  rows: OvertimeRow[],
  displayFormat: 'hhmm' | 'decimal' = 'hhmm'
): OutOfPocketSummary {
  const activeRows = rows.filter(r => {
    if (!r || r.isLeave) return false;
    if (r.isHoliday && !r.isHolidayOverride) return false;
    const hasTimes = Boolean((r.startTime || '').trim() && (r.endTime || '').trim());
    const hasAmount = (r.daysPaymentAmount || 0) > 0;
    return hasTimes || hasAmount || (r.totalWorkMinutes || 0) > 0;
  });

  const totalWorkMinutes = activeRows.reduce(
    (sum, r) => sum + Math.max(0, r.totalWorkMinutes || r.totalMinutes || 0),
    0
  );

  const totalAmountRs =
    Math.round(
      activeRows.reduce((sum, r) => sum + Math.max(0, Number(r.daysPaymentAmount || 0)), 0) * 100
    ) / 100;

  return {
    loggedDaysCount: activeRows.length,
    totalWorkMinutes,
    totalHoursFormatted: formatMinutesToTime(totalWorkMinutes, displayFormat),
    totalDecimalHours: parseFloat((totalWorkMinutes / 60).toFixed(2)),
    totalAmountRs,
  };
}
