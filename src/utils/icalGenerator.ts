/**
 * iCalendar (.ics) and Google Calendar integration generator
 * Compliant with RFC 5545 for seamless import into Google Calendar, Outlook, Apple Calendar
 */

import { Holiday } from '../types';

/**
 * Format a Date or YYYY-MM-DD string into compact UTC/Date format (e.g., 20260414)
 */
export function formatCompactDate(dateStr: string): string {
  return dateStr.replace(/-/g, '');
}

/**
 * Get next day formatted as YYYYMMDD for all-day iCal events (end date is exclusive in RFC 5545)
 */
export function getNextDayCompactDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d + 1);
  const nextY = dt.getFullYear();
  const nextM = String(dt.getMonth() + 1).padStart(2, '0');
  const nextD = String(dt.getDate()).padStart(2, '0');
  return `${nextY}${nextM}${nextD}`;
}

/**
 * Generate standard RFC 5545 .ics string for a list of holidays
 */
export function generateIcsCalendar(
  holidays: Holiday[],
  calendarName = 'Company Holidays & Overtime Calendar'
): string {
  const now = new Date();
  const nowUtc = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

  const events = holidays.map((h) => {
    const startStr = formatCompactDate(h.date);
    const endStr = getNextDayCompactDate(h.date);
    const category = (h.type || 'public').toUpperCase();
    const description = (h.description ? `${h.description}\n` : '') +
      `Category: ${category} Holiday\nOfficial Timesheet System`;

    // Clean strings for iCal format (escape commas, semicolons, backslashes)
    const cleanSummary = (h.name || 'Holiday').replace(/[,;\\]/g, '\\$&');
    const cleanDesc = description.replace(/[,;\\]/g, '\\$&').replace(/\n/g, '\\n');
    const uid = `holiday-${h.id || h.date}-${startStr}@ottimesheet.local`;

    return [
      'BEGIN:VEVENT',
      `UID:${uid}`,
      `DTSTAMP:${nowUtc}`,
      `DTSTART;VALUE=DATE:${startStr}`,
      `DTEND;VALUE=DATE:${endStr}`,
      `SUMMARY:${cleanSummary}`,
      `DESCRIPTION:${cleanDesc}`,
      `CATEGORIES:${category},HOLIDAY`,
      'TRANSP:TRANSPARENT',
      'STATUS:CONFIRMED',
      'END:VEVENT',
    ].join('\r\n');
  });

  const icsLines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//OT Timesheet System//Integrated Calendar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${calendarName}`,
    'X-WR-TIMEZONE:Asia/Colombo',
    ...events,
    'END:VCALENDAR',
  ];

  return icsLines.join('\r\n');
}

/**
 * Trigger browser download for an .ics file
 */
export function downloadIcsFile(icsContent: string, fileName = 'company-holidays.ics'): void {
  const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', fileName);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Generate a direct 1-click Google Calendar Web URL for an individual holiday
 */
export function generateGoogleCalendarUrl(holiday: Holiday): string {
  const start = formatCompactDate(holiday.date);
  const end = getNextDayCompactDate(holiday.date);
  const title = encodeURIComponent(holiday.name);
  const details = encodeURIComponent(
    `${holiday.description ? holiday.description + '\n' : ''}` +
    `Holiday Type: ${(holiday.type || 'public').toUpperCase()}\n` +
    `Synced from Official Overtime & Timesheet Management System`
  );
  const location = encodeURIComponent('Sri Lanka');

  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${start}/${end}&details=${details}&location=${location}`;
}
