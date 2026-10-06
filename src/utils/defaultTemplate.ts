import { TemplateConfig } from '../types';

/**
 * Generates an SVG representation of the official Bank of Ceylon (BOC) A4 Overtime Claim Form (Form 10756)
 * based directly on the attached physical overtime sheet.
 * Table Columns Order from Left to Right:
 * 1. Date (දිනය)
 * 2. Day of Week (සතියේ දවස)
 * 3. Reason (හේතුව) - Position 3!
 * 4. Approved by Manager (අනුමත කළ කළමනාකරු)
 * 5. Authorised by (බලය දුන්නා කෙටිසන)
 * 6. Time Started & Left (වේලාව ඇරඹූ / අවසන්)
 * 7. Total Hrs. Worked (වැඩ කළ පැය ගණන)
 * 8. Overtime Hrs. Claimed (හිමිකම්පාන අතිකාල පැය ගණන A)
 * 9. Special Assignment (විශේෂ වැඩ සඳහා හිමිකම්පාන අතිකාල පැය ගණන B)
 */
export function generateDefaultTemplateSvg(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 210 297" width="210mm" height="297mm">
  <defs>
    <style>
      .sinhala { font-family: 'Helvetica', Arial, sans-serif; font-size: 2.1mm; fill: #1e3a8a; }
      .boc-title { font-family: 'Helvetica', Arial, sans-serif; font-size: 4.6mm; font-weight: bold; fill: #1d4ed8; }
      .eng-title { font-family: 'Helvetica', Arial, sans-serif; font-size: 4.4mm; font-weight: bold; fill: #1d4ed8; }
      .form-lbl { font-family: 'Helvetica', Arial, sans-serif; font-size: 2.2mm; fill: #1e293b; font-weight: 600; }
      .sub-lbl { font-family: 'Helvetica', Arial, sans-serif; font-size: 1.8mm; fill: #475569; }
      .th-title { font-family: 'Helvetica', Arial, sans-serif; font-size: 1.8mm; font-weight: bold; fill: #1e3a8a; text-anchor: middle; }
      .th-sub { font-family: 'Helvetica', Arial, sans-serif; font-size: 1.5mm; fill: #334155; text-anchor: middle; }
      .grid-border { stroke: #2563eb; stroke-width: 0.3mm; }
      .inner-line { stroke: #60a5fa; stroke-width: 0.18mm; }
      .sub-line { stroke: #93c5fd; stroke-width: 0.12mm; }
      .digit-box { stroke: #2563eb; stroke-width: 0.25mm; fill: #ffffff; }
    </style>
  </defs>

  <!-- Clean A4 White Background -->
  <rect x="0" y="0" width="210" height="297" fill="#ffffff" />

  <!-- Form Outer Boundary Margin -->
  <rect x="11" y="9" width="188" height="279" fill="none" stroke="#2563eb" stroke-width="0.35mm" />

  <!-- Side Reference Text -->
  <text x="9" y="80" transform="rotate(-90 9 80)" font-family="Helvetica, Arial" font-size="1.6mm" fill="#64748b">Shan Printers - BOC/SUPP/S211222</text>
  <text x="9.5" y="240" transform="rotate(-90 9.5 240)" font-family="Helvetica, Arial" font-size="1.9mm" font-weight="bold" fill="#1e3a8a">Form 10756</text>

  <!-- ================= TOP HEADER ================= -->
  <!-- BOC Round Emblem Logo Placeholder -->
  <g transform="translate(14, 11)">
    <circle cx="9" cy="9" r="6.5" fill="none" stroke="#2563eb" stroke-width="0.6mm" />
    <circle cx="9" cy="9" r="5" fill="none" stroke="#2563eb" stroke-width="0.25mm" />
    <text x="9" y="10" font-family="Helvetica, Arial" font-size="2.6mm" font-weight="bold" fill="#1d4ed8" text-anchor="middle">BOC</text>
    <text x="9" y="18" font-family="Helvetica, Arial" font-size="1.3mm" fill="#2563eb" text-anchor="middle">ශ්‍රී ලංකා ප්‍රමුඛතම බැංකුව</text>
  </g>

  <!-- Dual Language Form Titles -->
  <text x="38" y="19" class="boc-title">අතිකාල ගෙවීම් ඉල්ලුම</text>
  <text x="112" y="19" class="eng-title">OVERTIME CLAIM</text>

  <!-- Row 1: Claimant Name -->
  <text x="14" y="27" class="sinhala">නම (පැහැදිලිව ලියන්න)</text>
  <text x="14" y="30.5" class="form-lbl">Name (Block Capital) Mr. &amp; Ms</text>
  <line x1="62" y1="30.5" x2="162" y2="30.5" class="inner-line" stroke-dasharray="1 1" />
  <text x="164" y="30" class="sub-lbl">මහතා / මහත්මිය / මෙනවිය</text>

  <!-- Row 2: PF Number (with 6 Digit Boxes) & Branch / Office -->
  <text x="14" y="36.5" class="sinhala">අ. අ. අංකය</text>
  <text x="25" y="36.5" class="form-lbl">P. F. No.</text>
  
  <!-- 6 PF Digit Boxes -->
  <rect x="42" y="32" width="4.5" height="5.5" class="digit-box" />
  <rect x="46.5" y="32" width="4.5" height="5.5" class="digit-box" />
  <rect x="51" y="32" width="4.5" height="5.5" class="digit-box" />
  <rect x="55.5" y="32" width="4.5" height="5.5" class="digit-box" />
  <rect x="60" y="32" width="4.5" height="5.5" class="digit-box" />
  <rect x="64.5" y="32" width="4.5" height="5.5" class="digit-box" />

  <text x="135" y="36.5" class="sinhala">ශාඛාව / කාර්යාලය</text>
  <text x="162" y="36.5" class="form-lbl">Branch / Office</text>
  <line x1="135" y1="38" x2="197" y2="38" class="inner-line" />

  <!-- Row 3: Designation, Month / Year, and Department -->
  <text x="26" y="44" class="sinhala">තනතුර</text>
  <text x="35" y="44" class="form-lbl">Designation</text>
  <line x1="14" y1="46" x2="68" y2="46" class="inner-line" />

  <text x="82" y="44" class="sinhala">මාසය සහ වර්ෂය</text>
  <text x="82" y="47" class="form-lbl">Month and Year</text>
  <line x1="72" y1="48" x2="132" y2="48" class="inner-line" />

  <text x="140" y="44" class="sinhala">දෙපාර්තමේන්තුව</text>
  <text x="162" y="44" class="form-lbl">Department</text>
  <line x1="136" y1="48" x2="197" y2="48" class="inner-line" />

  <!-- ================= SECTION 2: 31-ROW OVERTIME TABLE ================= -->
  <!-- Table Outer Box -->
  <rect x="12" y="52" width="186" height="186" fill="none" class="grid-border" />

  <!-- Table Header Background -->
  <rect x="12" y="52" width="186" height="17" fill="#f0f7ff" stroke="#2563eb" stroke-width="0.25mm" />

  <!-- COLUMN 1: Date (13 to 27 = 15mm) -->
  <text x="19.5" y="58" class="th-title">දිනය</text>
  <text x="19.5" y="62" class="th-sub">Date</text>
  <line x1="27" y1="52" x2="27" y2="238" class="inner-line" />

  <!-- COLUMN 2: Day of Week (27 to 44 = 17mm) -->
  <text x="35.5" y="57" class="th-title">සතියේ දවස</text>
  <text x="35.5" y="61" class="th-sub">Day of</text>
  <text x="35.5" y="64" class="th-sub">Week</text>
  <line x1="44" y1="52" x2="44" y2="238" class="inner-line" />

  <!-- COLUMN 3: Reason (44 to 99 = 55mm) - REASON IN 3RD POSITION! -->
  <text x="71.5" y="58" class="th-title">හේතුව</text>
  <text x="71.5" y="63" class="th-sub">Reason</text>
  <line x1="99" y1="52" x2="99" y2="238" class="inner-line" />

  <!-- COLUMN 4: Approved by Manager (99 to 112 = 13mm) -->
  <text x="105.5" y="56" class="th-title">අනුමත කළ</text>
  <text x="105.5" y="59" class="th-title">කළමනාකරු</text>
  <text x="105.5" y="62" class="th-sub">Approved</text>
  <text x="105.5" y="65" class="th-sub">by Mgr</text>
  <line x1="112" y1="52" x2="112" y2="238" class="inner-line" />

  <!-- COLUMN 5: Authorised by (112 to 125 = 13mm) -->
  <text x="118.5" y="56.5" class="th-title">බලය දුන්නා</text>
  <text x="118.5" y="59.5" class="th-title">කෙටිසන</text>
  <text x="118.5" y="63" class="th-sub">Authorised</text>
  <text x="118.5" y="66" class="th-sub">by</text>
  <line x1="125" y1="52" x2="125" y2="238" class="inner-line" />

  <!-- COLUMN 6: Time (125 to 151 = 26mm) -> Split into Started & Left -->
  <text x="138" y="56.5" class="th-title">වේලාව Time</text>
  <line x1="125" y1="60" x2="151" y2="60" class="sub-line" />
  
  <!-- Sub Col: Started (125 to 138 = 13mm) -->
  <text x="131.5" y="64" class="th-title">ඇරඹූ</text>
  <text x="131.5" y="67" class="th-sub">Started</text>
  <line x1="138" y1="60" x2="138" y2="238" class="inner-line" />

  <!-- Sub Col: Left (138 to 151 = 13mm) -->
  <text x="144.5" y="64" class="th-title">අවසන්</text>
  <text x="144.5" y="67" class="th-sub">Left</text>
  <line x1="151" y1="52" x2="151" y2="238" class="inner-line" />

  <!-- COLUMN 7: Total Hrs. Worked (151 to 166 = 15mm) -->
  <text x="158.5" y="56" class="th-title">වැඩ කළ පැය</text>
  <text x="158.5" y="59" class="th-title">ගණන</text>
  <text x="158.5" y="62" class="th-sub">Total Hrs.</text>
  <text x="158.5" y="65" class="th-sub">Worked</text>
  <line x1="166" y1="52" x2="166" y2="238" class="inner-line" />

  <!-- COLUMN 8: Overtime Hrs. Claimed (A) (166 to 183 = 17mm) -->
  <text x="174.5" y="56" class="th-title">හිමිකම්පාන අතිකාල</text>
  <text x="174.5" y="59" class="th-title">පැය ගණන</text>
  <text x="174.5" y="62" class="th-sub">Overtime Hrs.</text>
  <text x="174.5" y="65" class="th-sub">Claimed A</text>
  <line x1="183" y1="52" x2="183" y2="238" class="inner-line" />

  <!-- COLUMN 9: Special Assignment (B) (183 to 198 = 15mm) -->
  <text x="190.5" y="56" class="th-title">විශේෂ වැඩ</text>
  <text x="190.5" y="59" class="th-title">අතිකාල B</text>
  <text x="190.5" y="62" class="th-sub">Special</text>
  <text x="190.5" y="65" class="th-sub">Assgn B</text>

  <!-- 31 Daily Data Rows (from y=69 to y=238, height=5.45mm per row) -->
  ${Array.from({ length: 31 }).map((_, i) => {
    const y = 69 + i * 5.45;
    return `
    <line x1="12" y1="${y}" x2="198" y2="${y}" stroke="#93c5fd" stroke-width="0.14mm" />
    `;
  }).join('')}

  <!-- ================= BOTTOM SUMMARY & AUTHORIZATIONS ================= -->
  <!-- Summary Box Area -->
  <rect x="12" y="238" width="186" height="42" fill="none" class="grid-border" />

  <!-- Left: Remuneration & Pay details -->
  <text x="14" y="244" class="sinhala">වැටුප් ලේඛනය අනුව සම්පූර්ණ පාරිශ්‍රමිකය (අතුරු දීමනාව හැර)</text>
  <text x="14" y="247" class="form-lbl">Total Remuneration as per salary Book (Exclusive of interim Allowance) Rs.</text>
  <line x1="110" y1="247" x2="135" y2="247" class="inner-line" />

  <!-- Right: Big Total Hours Claimed Indicator with Arrow -->
  <text x="140" y="245" class="sinhala">හිමිකම්පාන සම්පූර්ණ පැය ගණන</text>
  <text x="140" y="248" class="form-lbl" font-weight="bold">Total Hours Claimed</text>
  <polygon points="172,246 177,243 177,249" fill="#1d4ed8" />
  <rect x="178" y="241" width="18" height="9" fill="#eff6ff" stroke="#2563eb" stroke-width="0.3mm" />

  <!-- Hourly Rate & Day's Pay -->
  <text x="14" y="254" class="sinhala">පැයකට ගෙවන ගණන</text>
  <text x="14" y="257" class="form-lbl">Hourly Rate Rs.</text>
  <line x1="42" y1="257" x2="80" y2="257" class="inner-line" />

  <text x="92" y="254" class="sinhala">දිනක වැටුප්</text>
  <text x="92" y="257" class="form-lbl">Day's Pay Rs.</text>
  <line x1="112" y1="257" x2="140" y2="257" class="inner-line" />

  <!-- Overtime Payment Due 'A' Rs and 'B' Rs -->
  <text x="14" y="263" class="sinhala">ලැබිය යුතු අතිකාල ගෙවීම</text>
  <text x="44" y="263" class="form-lbl">/ Overtime payment due 'A' Rs.</text>
  <line x1="88" y1="263" x2="130" y2="263" class="inner-line" />
  <text x="135" y="263" class="form-lbl">'B' Rs.</text>
  <line x1="148" y1="263" x2="194" y2="263" class="inner-line" />

  <!-- Employee Declaration -->
  <text x="14" y="269" class="sub-lbl">ඉහත දැක්වෙන අතිකාල පැය ගණන වැඩකළ බවත් මගේ ඉල්ලුම නිවැරදි බවත් මෙයින් සහතික කරමි.</text>
  <text x="14" y="272" class="sub-lbl" font-weight="600">I certify that I have worked the above overtime and that by claim is correct.</text>

  <!-- Date & Signature Line -->
  <text x="24" y="277.5" class="sinhala">දිනය</text>
  <text x="32" y="277.5" class="form-lbl">Date</text>
  <line x1="14" y1="279" x2="65" y2="279" class="inner-line" />

  <text x="148" y="277.5" class="sinhala">අත්සන</text>
  <text x="158" y="277.5" class="form-lbl">Signature</text>
  <line x1="140" y1="279" x2="194" y2="279" class="inner-line" />
</svg>`;
}

export function getDefaultTemplateSvgDataUrl(): string {
  const svg = generateDefaultTemplateSvg();
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export const DEFAULT_TEMPLATE: TemplateConfig = {
  id: 'standard-official-template-v1',
  name: 'Overtime Sheet (Form 10756)',
  description: 'Official Bank of Ceylon (BOC) standard A4 Overtime Claim Form with re-arranged column layout',
  isDefault: true,
  pageSize: 'A4',
  widthMm: 210,
  heightMm: 297,
  backgroundImageUrl: getDefaultTemplateSvgDataUrl(),
  backgroundType: 'image',
  printerOffsetX: 0,
  printerOffsetY: 0,
  updatedAt: new Date().toISOString(),
  fields: [
    {
      id: 'f_emp_name',
      name: 'Employee Name (Mr/Ms)',
      key: 'employeeName',
      type: 'text',
      x: 63,
      y: 29.5,
      width: 98,
      height: 4.5,
      fontSize: 9.5,
      fontFamily: 'Helvetica',
      isBold: true,
      alignment: 'left',
      rotation: 0,
      isVisible: true,
      sampleValue: 'Dasun Dularaka Ramasingha',
    },
    {
      id: 'f_pf_no',
      name: 'P. F. Number',
      key: 'employeeNumber',
      type: 'text',
      x: 43,
      y: 35.2,
      width: 26,
      height: 4.5,
      fontSize: 10,
      fontFamily: 'Courier',
      isBold: true,
      alignment: 'center',
      rotation: 0,
      charSpacing: 1.8,
      isVisible: true,
      sampleValue: '489215',
    },
    {
      id: 'f_branch',
      name: 'Branch / Office',
      key: 'branch',
      type: 'text',
      x: 136,
      y: 36.8,
      width: 60,
      height: 4.5,
      fontSize: 9,
      fontFamily: 'Helvetica',
      isBold: false,
      alignment: 'left',
      rotation: 0,
      isVisible: true,
      sampleValue: 'BOC Colombo Main Branch',
    },
    {
      id: 'f_dept',
      name: 'Department / Division',
      key: 'department',
      type: 'text',
      x: 136,
      y: 47,
      width: 60,
      height: 4.5,
      fontSize: 9,
      fontFamily: 'Helvetica',
      isBold: false,
      alignment: 'left',
      rotation: 0,
      isVisible: true,
      sampleValue: 'IT Operations & Infrastructure',
    },
    {
      id: 'f_designation',
      name: 'Designation',
      key: 'designation',
      type: 'text',
      x: 15,
      y: 45,
      width: 53,
      height: 4.5,
      fontSize: 9,
      fontFamily: 'Helvetica',
      isBold: false,
      alignment: 'left',
      rotation: 0,
      isVisible: true,
      sampleValue: 'Senior Systems Engineer',
    },
    {
      id: 'f_month_year',
      name: 'Month and Year',
      key: 'monthYear',
      type: 'text',
      x: 73,
      y: 47,
      width: 62,
      height: 4.5,
      fontSize: 9.5,
      fontFamily: 'Helvetica',
      isBold: true,
      alignment: 'left',
      rotation: 0,
      isVisible: true,
      sampleValue: 'October 2026',
    },
    {
      id: 'f_total_hours_claimed',
      name: 'Total Hours Claimed',
      key: 'totalHoursFormatted',
      type: 'calculated',
      x: 178.5,
      y: 247,
      width: 17,
      height: 5.5,
      fontSize: 10,
      fontFamily: 'Helvetica',
      isBold: true,
      alignment: 'center',
      rotation: 0,
      isVisible: true,
      sampleValue: '18:30',
    },
    {
      id: 'f_claim_date',
      name: 'Submission Date',
      key: 'claimDate',
      type: 'date',
      x: 15,
      y: 278,
      width: 48,
      height: 4,
      fontSize: 8.5,
      fontFamily: 'Helvetica',
      isBold: false,
      alignment: 'center',
      rotation: 0,
      isVisible: true,
      sampleValue: '2026-10-05',
    },
    {
      id: 'f_claimant_sign',
      name: 'Claimant Signature',
      key: 'claimantSign',
      type: 'signature',
      x: 142,
      y: 277.5,
      width: 52,
      height: 4.5,
      fontSize: 9,
      fontFamily: 'Helvetica',
      isBold: true,
      alignment: 'center',
      rotation: 0,
      isVisible: true,
      sampleValue: 'D. D. Ramasingha',
    },
  ],
  tableConfig: {
    enabled: true,
    startY: 72.8, // mm from top
    rowHeight: 5.45, // mm per row (31 rows fit perfectly in 169mm table height)
    maxRows: 31,
    fontSize: 8,
    fontFamily: 'Helvetica',
    isBold: false,
    columns: {
      // 1. Date (දිනය)
      date: { x: 13, width: 14, align: 'center' },
      // 2. Day of Week (සතියේ දවස)
      day: { x: 28, width: 16, align: 'center' },
      // 3. Reason / Nature of duties (හේතුව) - MOVED TO POSITION 3!
      reason: { x: 45, width: 53, align: 'left' },
      // 4. Approved by Manager (අනුමත කළ කළමනාකරු)
      approvedBy: { x: 100, width: 12, align: 'center' },
      // 5. Time Started (වේලාව ඇරඹූ)
      startTime: { x: 126, width: 12, align: 'center' },
      // 6. Time Left (වේලාව අවසන්)
      endTime: { x: 139, width: 12, align: 'center' },
      // 7. Total Hrs. Worked (වැඩ කළ පැය ගණන)
      totalHours: { x: 152, width: 14, align: 'center' },
      // 8. Overtime Hrs. Claimed (හිමිකම්පාන අතිකාල A)
      otHoursClaimed: { x: 167, width: 16, align: 'center' },
      // 9. Special Assignment (විශේෂ වැඩ B)
      specialHoursClaimed: { x: 184, width: 14, align: 'center' },
    },
  },
};
