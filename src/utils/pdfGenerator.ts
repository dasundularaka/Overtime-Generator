import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { ClaimRecord, FontFamily, TemplateConfig } from '../types';
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
    totalDaysCount: `${claim.otDaysCount} Days`,
    totalHoursFormatted: `${claim.totalHoursFormatted} (${claim.totalDecimalHours.toFixed(2)}h)`,
    claimantSign: claim.employeeName || '',
    claimNumber: claim.claimNumber || '',
    hourlyRate: claim.hourlyRate !== undefined ? Number(claim.hourlyRate).toFixed(2) : '',
    daysPay: claim.daysPay !== undefined ? Number(claim.daysPay).toFixed(2) : '',
    daysPayCount: String(claim.daysPayCount || 0),
    daysPayTotal: claim.daysPayTotal !== undefined ? Number(claim.daysPayTotal).toFixed(2) : '',
    totalRemuneration: claim.totalRemuneration !== undefined ? Number(claim.totalRemuneration).toFixed(2) : '',
    otPaymentDueA: claim.otPaymentDueA !== undefined ? Number(claim.otPaymentDueA).toFixed(2) : '',
    otPaymentDueB: claim.otPaymentDueB !== undefined ? Number(claim.otPaymentDueB).toFixed(2) : '',
    totalOtPayment: claim.totalOtPayment !== undefined ? Number(claim.totalOtPayment).toFixed(2) : '',
  };

  // 1. Overlay configured single fields (header particulars, totals, signatures, etc.)
  for (const field of template.fields) {
    if (!field.isVisible) continue;

    const mappedVal = claimDataMap[field.key];
    const value = (mappedVal !== undefined && mappedVal.trim() !== '') ? mappedVal : (field.sampleValue ?? '');
    if (!value) continue;

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

    page.drawText(text, {
      x,
      y,
      size: fontSize,
      font,
      color: rgb(0.05, 0.05, 0.05),
    });
  }

  // 2. Overlay dynamic Overtime Table rows
  if (template.tableConfig && template.tableConfig.enabled) {
    const tbl = template.tableConfig;
    const font = await getFont(tbl.fontFamily, tbl.isBold);
    const maxRowsToRender = Math.min(claim.rows.length, tbl.maxRows);

    for (let i = 0; i < maxRowsToRender; i++) {
      const row = claim.rows[i];
      const rowYMm = tbl.startY + i * tbl.rowHeight;

      // Columns mapping matching Overtime Sheet: date, day, reason, approvedBy, startTime, endTime, totalHours, otHoursClaimed, specialHoursClaimed
      const cols = tbl.columns;

      const isSat = row.dayOfWeek === 'Sat' || row.date && new Date(row.date).getDay() === 6;
      const isSun = row.dayOfWeek === 'Sun' || row.date && new Date(row.date).getDay() === 0;
      const isOtherDay = isSat || isSun || !!row.isHoliday || !!row.isDaysPayment;

      const rowValues = [
        { col: cols.date, val: row.date ? row.date.split('-').slice(1).join('/') : '' },
        { col: cols.day, val: row.dayOfWeek || '' },
        { col: cols.reason, val: row.reason || (isOtherDay ? "Day's Pay Allocation" : '') },
        { col: cols.approvedBy, val: row.approvedBy || '' },
        // Do not show shift on other days (Saturdays, non-working days)
        { col: cols.startTime, val: isOtherDay ? '' : (row.startTime || '') },
        { col: cols.endTime, val: isOtherDay ? '' : (row.endTime ? `${row.endTime}${row.isOvernight ? '*' : ''}` : '') },
        { col: cols.totalHours, val: isOtherDay ? '' : (row.totalWorkMinutes > 0 ? formatMinutesToTime(row.totalWorkMinutes, 'hhmm') : '') },
        // Do not show OT hours on other days (Saturdays, non-working days)
        { col: cols.otHoursClaimed || (cols.breakMinutes ? undefined : cols.totalHours), val: isOtherDay ? '' : (row.totalFormatted || '') },
        { col: cols.specialHoursClaimed, val: row.specialAssignmentHours || '' },
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
