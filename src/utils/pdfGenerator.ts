import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { ClaimRecord, FieldConfig, FontFamily, TemplateConfig } from '../types';
import { formatMinutesToTime } from './timeCalculations';

export const MM_TO_PT = 72 / 25.4; // ~2.83464567 points per millimeter
export const A4_WIDTH_PT = 210 * MM_TO_PT; // ~595.28 pt
export const A4_HEIGHT_PT = 297 * MM_TO_PT; // ~841.89 pt

/**
 * Converts mm coordinates (origin at top-left) to PDF points (origin at bottom-left)
 */
export function mmToPdfCoords(
  xMm: number,
  yMm: number,
  fontSizePt: number,
  offsetX: number = 0,
  offsetY: number = 0
): { x: number; y: number } {
  const x = (xMm + offsetX) * MM_TO_PT;
  // In PDF, y=0 is at the bottom, so top is 297mm.
  // We also offset by roughly the font cap-height/baseline so top-left aligns nicely.
  const baselineShiftMm = (fontSizePt * 0.8) / MM_TO_PT;
  const y = (297 - (yMm + offsetY) - baselineShiftMm) * MM_TO_PT;
  return { x, y };
}

/**
 * Converts an image data URL or SVG data URL to a PNG Uint8Array.
 * If SVG, renders it onto an HTML5 canvas at crisp 300 DPI resolution.
 */
async function getPngBytesFromDataUrl(dataUrl: string): Promise<Uint8Array> {
  // If it's already a standard base64 PNG or JPG:
  if (dataUrl.startsWith('data:image/png;base64,')) {
    const base64Data = dataUrl.replace('data:image/png;base64,', '');
    return Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
  }

  if (dataUrl.startsWith('data:image/jpeg;base64,') || dataUrl.startsWith('data:image/jpg;base64,')) {
    const base64Data = dataUrl.replace(/^data:image\/jpe?g;base64,/, '');
    return Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
  }

  // If SVG or other image format, rasterize via HTML5 Image & Canvas at crisp print resolution (2480 x 3508)
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      // High resolution for crisp printing (300 DPI equivalent)
      canvas.width = 2480;
      canvas.height = 3508;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Canvas 2D context not available'));
        return;
      }

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error('Canvas export failed'));
          return;
        }
        const reader = new FileReader();
        reader.onload = () => {
          const arrayBuffer = reader.result as ArrayBuffer;
          resolve(new Uint8Array(arrayBuffer));
        };
        reader.onerror = reject;
        reader.readAsArrayBuffer(blob);
      }, 'image/png');
    };
    img.onerror = () => reject(new Error('Failed to load template image onto canvas'));
    img.src = dataUrl;
  });
}

/**
 * Maps font family and bold weight to a standard PDF font
 */
function resolveStandardFontName(family: FontFamily, isBold: boolean): StandardFonts {
  if (family === 'Courier') {
    return isBold ? StandardFonts.CourierBold : StandardFonts.Courier;
  }
  if (family === 'TimesRoman') {
    return isBold ? StandardFonts.TimesRomanBold : StandardFonts.TimesRoman;
  }
  return isBold ? StandardFonts.HelveticaBold : StandardFonts.Helvetica;
}

/**
 * Truncates or fits text within a maximum width in points.
 */
function fitText(
  text: string,
  maxWidthPt: number,
  font: any,
  initialFontSize: number
): { text: string; fontSize: number } {
  let fontSize = initialFontSize;
  let textWidth = font.widthOfTextAtSize(text, fontSize);

  // First try slightly reducing font size down to 6pt if needed
  while (textWidth > maxWidthPt && fontSize > 6) {
    fontSize -= 0.5;
    textWidth = font.widthOfTextAtSize(text, fontSize);
  }

  // If still too wide, truncate with ellipsis
  if (textWidth > maxWidthPt) {
    let truncated = text;
    while (truncated.length > 3 && font.widthOfTextAtSize(truncated + '...', fontSize) > maxWidthPt) {
      truncated = truncated.slice(0, -1);
    }
    return { text: truncated + '...', fontSize };
  }

  return { text, fontSize };
}

/**
 * Robustly parses a row's date string into a numerical key (YYYYMMDD) for sorting.
 * Supports ISO (YYYY-MM-DD), slashes (YYYY/MM/DD, DD/MM/YYYY), and raw numbers.
 */
function parseRowDateValue(dateStr?: string): number {
  if (!dateStr || !dateStr.trim()) return 0;
  const s = dateStr.trim();

  // YYYY-MM-DD
  const isoMatch = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (isoMatch) {
    const y = parseInt(isoMatch[1], 10);
    const m = parseInt(isoMatch[2], 10);
    const d = parseInt(isoMatch[3], 10);
    return y * 10000 + m * 100 + d;
  }

  // DD/MM/YYYY
  const dmyMatch = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (dmyMatch) {
    const d = parseInt(dmyMatch[1], 10);
    const m = parseInt(dmyMatch[2], 10);
    const y = parseInt(dmyMatch[3], 10);
    return y * 10000 + m * 100 + d;
  }

  // YYYY/MM/DD
  const ymdMatch = s.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})/);
  if (ymdMatch) {
    const y = parseInt(ymdMatch[1], 10);
    const m = parseInt(ymdMatch[2], 10);
    const d = parseInt(ymdMatch[3], 10);
    return y * 10000 + m * 100 + d;
  }

  // Fallback to Date.parse
  const parsed = Date.parse(s);
  if (!isNaN(parsed)) return parsed;

  // Single day number
  const num = parseInt(s, 10);
  if (!isNaN(num)) return num;

  return 0;
}

/**
 * Generates the print-ready A4 PDF by placing user data on top of the official claim form template.
 */
export async function generateOvertimePdf(
  claim: ClaimRecord,
  template: TemplateConfig,
  globalOffsetX: number = 0,
  globalOffsetY: number = 0
): Promise<{ blob: Blob; url: string; filename: string }> {
  let pdfDoc: PDFDocument;
  let page: any;

  const totalOffsetX = (template.printerOffsetX || 0) + globalOffsetX;
  const totalOffsetY = (template.printerOffsetY || 0) + globalOffsetY;

  // Check if background template is an existing PDF file
  const isPdfBackground =
    template.backgroundType === 'pdf' ||
    template.backgroundImageUrl.startsWith('data:application/pdf');

  if (isPdfBackground && template.backgroundImageUrl) {
    try {
      const base64Data = template.backgroundImageUrl.split(',')[1] || template.backgroundImageUrl;
      const pdfBytes = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
      pdfDoc = await PDFDocument.load(pdfBytes);
      page = pdfDoc.getPages()[0];
    } catch (e) {
      console.warn('Could not load base PDF template, falling back to new document', e);
      pdfDoc = await PDFDocument.create();
      page = pdfDoc.addPage([A4_WIDTH_PT, A4_HEIGHT_PT]);
    }
  } else {
    // Create new A4 PDF and embed the image background
    pdfDoc = await PDFDocument.create();
    page = pdfDoc.addPage([A4_WIDTH_PT, A4_HEIGHT_PT]);

    if (template.backgroundImageUrl) {
      try {
        const imageBytes = await getPngBytesFromDataUrl(template.backgroundImageUrl);
        const embeddedImage = await pdfDoc.embedPng(imageBytes);
        page.drawImage(embeddedImage, {
          x: 0,
          y: 0,
          width: A4_WIDTH_PT,
          height: A4_HEIGHT_PT,
        });
      } catch (err) {
        console.error('Error embedding template image background:', err);
      }
    }
  }

  // Pre-load standard font variants
  const fontCache: Record<string, any> = {};
  async function getFont(family: FontFamily, isBold: boolean) {
    const fontName = resolveStandardFontName(family, isBold);
    if (!fontCache[fontName]) {
      fontCache[fontName] = await pdfDoc.embedFont(fontName);
    }
    return fontCache[fontName];
  }

  // Map claim data values to field keys
  const formatRate = (val?: number | string) => {
    if (val === undefined || val === null || val === '') return '';
    const n = Number(val);
    return isNaN(n) ? String(val) : n.toFixed(2);
  };

  const claimDataMap: Record<string, string> = {
    employeeName: claim.employeeName || '',
    employeeNumber: claim.employeeNumber || '',
    designation: claim.designation || '',
    branch: claim.branch || '',
    department: claim.department || '',
    month: claim.month || '',
    year: String(claim.year || ''),
    monthYear: `${claim.month} ${claim.year}`,
    claimDate: claim.claimDate || '',
    totalDaysCount: `${claim.otDaysCount || 0} Days`,
    totalHoursFormatted: claim.totalHoursFormatted ? `${claim.totalHoursFormatted} (${(claim.totalDecimalHours || 0).toFixed(2)}h)` : '',
    totalHoursOnly: claim.totalHoursFormatted || '',
    claimantSign: claim.employeeName || '',
    claimNumber: claim.claimNumber || '',
    hourlyRate: formatRate(claim.hourlyRate),
    daysPay: formatRate(claim.daysPay),
    hourlyRateNonWorkingDays: formatRate(claim.hourlyRateNonWorkingDays),
    daysPayCount: String(claim.daysPayCount || 0),
    daysPayTotal: formatRate(claim.daysPayTotal),
    totalRemuneration: formatRate(claim.totalRemuneration),
    otPaymentDueA: formatRate(claim.otPaymentDueA),
    otPaymentDueB: formatRate(claim.otPaymentDueB),
    totalOtPayment: formatRate(claim.totalOtPayment),
    // Out of Pocket Form 10610 Particulars
    year2Digit: String(claim.year || '').slice(-2),
    grade: claim.designation || '',
    totalAmountRs: (claim.totalOtPayment || claim.daysPayTotal || 0) > 0
      ? Math.floor(claim.totalOtPayment || claim.daysPayTotal || 0).toLocaleString('en-US')
      : '',
    totalAmountCts: (claim.totalOtPayment || claim.daysPayTotal || 0) > 0
      ? String(Math.round(((claim.totalOtPayment || claim.daysPayTotal || 0) % 1) * 100)).padStart(2, '0')
      : '',
    paymentAuthorisedBy: '',
  };

  // Resilient field value lookup supporting keys, IDs, aliases, and lowercase variations
  function resolveClaimFieldValue(field: FieldConfig): string {
    const rawKey = (field.key || '').trim();
    const rawId = (field.id || '').trim();
    const rawName = (field.name || '').trim().toLowerCase();

    // 1. Exact key match
    if (rawKey && claimDataMap[rawKey] !== undefined && claimDataMap[rawKey] !== '') {
      return claimDataMap[rawKey];
    }

    // 2. Exact ID without 'f_' prefix
    const strippedId = rawId.replace(/^f_/, '');
    if (strippedId && claimDataMap[strippedId] !== undefined && claimDataMap[strippedId] !== '') {
      return claimDataMap[strippedId];
    }

    // 3. Normalized alphanumeric lookup
    const normKey = rawKey.toLowerCase().replace(/[^a-z0-9]/g, '');
    const normId = rawId.toLowerCase().replace(/^f_/, '').replace(/[^a-z0-9]/g, '');

    for (const [k, v] of Object.entries(claimDataMap)) {
      if (!v) continue;
      const normK = k.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (normK === normKey || normK === normId) {
        return v;
      }
    }

    // 4. Semantic aliases for rate and payment fields (e.g. user manually changed in new claim)
    if (normKey.includes('hourly') || normId.includes('hourly') || rawName.includes('hourly') || normKey === 'otrate' || normKey === 'rate') {
      if (normKey.includes('nonworking') || normId.includes('nonworking') || rawName.includes('non-working')) {
        return claimDataMap.hourlyRateNonWorkingDays || claimDataMap.hourlyRate || '';
      }
      return claimDataMap.hourlyRate || '';
    }

    if (normKey.includes('dayspay') || normId.includes('dayspay') || normKey.includes('daypay') || normId.includes('daypay') || (rawName.includes('day') && rawName.includes('pay'))) {
      return claimDataMap.daysPay || '';
    }

    if (normKey.includes('remuneration') || normId.includes('remuneration') || rawName.includes('remuneration') || normKey.includes('salary')) {
      return claimDataMap.totalRemuneration || '';
    }

    if (normKey.includes('paymentduea') || normId.includes('paymentduea') || normKey === 'paymenta' || rawName.includes("due 'a'")) {
      return claimDataMap.otPaymentDueA || '';
    }

    if (normKey.includes('paymentdueb') || normId.includes('paymentdueb') || normKey === 'paymentb' || rawName.includes("due 'b'")) {
      return claimDataMap.otPaymentDueB || '';
    }

    if (normKey.includes('totalotpayment') || normId.includes('totalotpayment') || normKey === 'totalpayment' || rawName.includes('total payment')) {
      return claimDataMap.totalOtPayment || '';
    }

    // Out of Pocket aliases
    if (normKey.includes('amountrs') || normId.includes('amountrs') || rawName.includes('amount (rs)')) {
      return claimDataMap.totalAmountRs || '';
    }
    if (normKey.includes('amountcts') || normId.includes('amountcts') || rawName.includes('amount (cts)')) {
      return claimDataMap.totalAmountCts || '';
    }
    if (normKey === 'grade' || normId === 'grade' || rawName.includes('grade')) {
      return claimDataMap.grade || claimDataMap.designation || '';
    }
    if (normKey.includes('year2') || normId.includes('year2') || normKey === 'yearbox') {
      return claimDataMap.year2Digit || '';
    }

    // 5. Fallback: only use template sampleValue if the field is not a rate/payment field, or if nothing was ever entered
    return field.sampleValue ?? '';
  }

  // 1. Overlay configured single fields (header particulars, totals, signatures, etc.)
  for (const field of template.fields) {
    if (!field.isVisible) continue;

    const value = resolveClaimFieldValue(field);
    if (!value || value.trim() === '') continue;

    const font = await getFont(field.fontFamily, field.isBold);
    const maxWidthPt = field.width * MM_TO_PT;

    const { text, fontSize } = fitText(value, maxWidthPt, font, field.fontSize);
    const textWidth = font.widthOfTextAtSize(text, fontSize);

    let { x, y } = mmToPdfCoords(field.x, field.y, fontSize, totalOffsetX, totalOffsetY);

    // Apply alignment
    if (field.alignment === 'center') {
      x += (maxWidthPt - textWidth) / 2;
    } else if (field.alignment === 'right') {
      x += maxWidthPt - textWidth;
    }

    // Support character-by-character spacing (for P.F. boxes)
    if (field.charSpacing && field.charSpacing > 0 && text.length > 1) {
      let curX = x;
      const spacingPt = field.charSpacing * MM_TO_PT;
      for (let ci = 0; ci < text.length; ci++) {
        const char = text[ci];
        page.drawText(char, {
          x: curX,
          y,
          size: fontSize,
          font,
          color: rgb(0.05, 0.05, 0.05),
        });
        curX += font.widthOfTextAtSize(char, fontSize) + spacingPt;
      }
    } else {
      page.drawText(text, {
        x,
        y,
        size: fontSize,
        font,
        color: rgb(0.05, 0.05, 0.05),
      });
    }
  }

  // 2. Overlay dynamic Overtime Table rows
  if (template.tableConfig && template.tableConfig.enabled) {
    const tbl = template.tableConfig;
    const font = await getFont(tbl.fontFamily, tbl.isBold);

    // Strictly print ONLY OT-claimed dates:
    // Exclude leaves, worked-but-not-OT days (totalMinutes === 0), and unclaimed holidays.
    const claimedRows = claim.rows.filter(r => {
      if (r.isLeave) return false;
      if (r.isHoliday && !r.isHolidayOverride) return false;

      const hasValidOt = (r.totalMinutes || 0) > 0;
      const hasSpecialHours = Boolean(
        r.specialAssignmentHours &&
        r.specialAssignmentHours.trim() !== '' &&
        r.specialAssignmentHours.trim() !== '0' &&
        r.specialAssignmentHours.trim() !== '00:00'
      );
      const hasOpAmount = Boolean(
        (r.daysPaymentAmount || 0) > 0 &&
        (!!r.startTime?.trim() || !!r.endTime?.trim() || !!r.reason?.trim())
      );
      const isSat = r.dayOfWeek === 'Sat' || (r.date ? new Date(r.date).getDay() === 6 : false);
      const isQualifiedSatDayPay = isSat && !!r.isDaysPayment && (r.totalWorkMinutes || 0) >= 360;

      return hasValidOt || hasSpecialHours || hasOpAmount || isQualifiedSatDayPay;
    });
    const effectiveRows = claimedRows;

    // Arrange rows into correct chronological date order in PDF (keeping user's entry order unchanged in New Claim panel)
    const sortedRows = [...effectiveRows].sort((a, b) => {
      const valA = parseRowDateValue(a.date);
      const valB = parseRowDateValue(b.date);
      if (valA !== valB) return valA - valB;
      // Secondary sort: start time
      return (a.startTime || '').localeCompare(b.startTime || '');
    });

    const maxRowsToRender = Math.min(sortedRows.length, tbl.maxRows);
    const isRatesUnlocked = Boolean(claim.isRatesUnlocked || claim.isRatesLocked === false);

    for (let i = 0; i < maxRowsToRender; i++) {
      const row = sortedRows[i];
      const rowYMm = tbl.startY + i * tbl.rowHeight;

      // Columns mapping matching Overtime Sheet: date, day, reason, approvedBy, startTime, endTime, totalHours, otHoursClaimed, specialHoursClaimed
      const cols = tbl.columns;

      const isSat = row.dayOfWeek === 'Sat' || (row.date && new Date(row.date).getDay() === 6);
      const isSun = row.dayOfWeek === 'Sun' || (row.date && new Date(row.date).getDay() === 0);
      const isOtherDay = isSat || isSun || !!row.isHoliday || !!row.isDaysPayment;
      // Show non-working days OT period (in, out, worked, and OT claimed) like other working days for rates-unlocked users or holiday override
      const showPeriod = !isOtherDay || isRatesUnlocked || !!row.isHolidayOverride || (row.totalMinutes || 0) > 0;

      // Compute row amount if template has amountRs/amountCts columns (e.g. Out of Pocket Form 10610)
      let rowAmountRs = '';
      let rowAmountCts = '';
      const dayAmt = (row.daysPaymentAmount || 0) > 0
        ? row.daysPaymentAmount!
        : ((row.totalMinutes || 0) > 0 && (claim.hourlyRate || 0) > 0)
        ? ((row.totalMinutes || 0) / 60) * (claim.hourlyRate || 0)
        : 0;
      if (dayAmt > 0) {
        const rInt = Math.floor(dayAmt);
        const rCts = Math.round((dayAmt - rInt) * 100);
        rowAmountRs = rInt.toLocaleString('en-US');
        rowAmountCts = String(rCts).padStart(2, '0');
      }

      const rowValues = [
        { col: cols.date, val: row.date ? row.date.split('-').slice(1).join('/') : '' },
        { col: cols.day, val: row.dayOfWeek || '' },
        { col: cols.reason, val: row.reason || (isOtherDay && !row.startTime ? "Day's Pay Allocation" : '') },
        { col: cols.approvedBy, val: row.approvedBy || '' },
        { col: cols.startTime, val: showPeriod ? (row.startTime || '') : '' },
        { col: cols.endTime, val: showPeriod ? (row.endTime ? `${row.endTime}${row.isOvernight ? '*' : ''}` : '') : '' },
        {
          col: cols.totalHours,
          val: cols.amountRs
            ? (row.totalFormatted || (row.totalMinutes > 0 ? formatMinutesToTime(row.totalMinutes, 'hhmm') : (showPeriod && row.totalWorkMinutes > 0 ? formatMinutesToTime(row.totalWorkMinutes, 'hhmm') : '')))
            : ((showPeriod && row.totalWorkMinutes > 0) ? formatMinutesToTime(row.totalWorkMinutes, 'hhmm') : ''),
        },
        // Column A: Regular overtime (Working days and Saturdays / non-working days; NOT special OT, NOT holiday override)
        {
          col: cols.otHoursClaimed || (cols.breakMinutes ? undefined : cols.totalHours),
          val: (!row.isSpecialAssignment && !row.isHolidayOverride && (row.totalMinutes || 0) > 0 && showPeriod)
            ? (row.totalFormatted || '')
            : '',
        },
        // Column B: Special Assigned OT AND Holiday Override OT must be added to Column B
        {
          col: cols.specialHoursClaimed,
          val: ((row.isSpecialAssignment || row.isHolidayOverride) && (row.totalMinutes || 0) > 0)
            ? (row.totalFormatted || '')
            : (row.specialAssignmentHours || ''),
        },
        // Out of Pocket Amount Columns
        { col: cols.amountRs, val: rowAmountRs },
        { col: cols.amountCts, val: rowAmountCts },
        { col: cols.approvedByAgm, val: '' },
      ];

      for (const { col, val } of rowValues) {
        if (!val || !col) continue;

        const maxWidthPt = col.width * MM_TO_PT;
        const { text, fontSize } = fitText(val, maxWidthPt, font, tbl.fontSize);
        const textWidth = font.widthOfTextAtSize(text, fontSize);

        let { x, y } = mmToPdfCoords(col.x, rowYMm, fontSize, totalOffsetX, totalOffsetY);

        if (col.align === 'center') {
          x += (maxWidthPt - textWidth) / 2;
        } else if (col.align === 'right') {
          x += maxWidthPt - textWidth;
        }

        page.drawText(text, {
          x,
          y,
          size: fontSize,
          font,
          color: rgb(0.1, 0.1, 0.1),
        });
      }
    }
  }

  // Generate binary output
  const pdfBytes = await pdfDoc.save();
  const blob = new Blob([pdfBytes as unknown as BlobPart], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);

  // Clean filename: Overtime_Claim_[EmployeeName]_[Month]_[Year].pdf
  const sanitizedName = (claim.employeeName || 'Claimant').replace(/[^a-zA-Z0-9]/g, '_');
  const sanitizedMonth = (claim.month || 'Month').replace(/[^a-zA-Z0-9]/g, '_');
  const filename = `Overtime_Claim_${sanitizedName}_${sanitizedMonth}_${claim.year || 2026}.pdf`;

  return { blob, url, filename };
}

/**
 * Triggers native browser print dialog for the generated PDF in an iframe.
 */
export function printPdfDocument(pdfUrl: string): void {
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  iframe.src = pdfUrl;

  document.body.appendChild(iframe);
  iframe.onload = () => {
    setTimeout(() => {
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } catch (err) {
        console.error('Direct print failed, opening in new tab', err);
        window.open(pdfUrl, '_blank');
      }
    }, 300);
  };
}
