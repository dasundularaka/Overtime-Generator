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
    {
      id: 'f_total_remuneration',
      name: 'Total Remuneration (Rs.)',
      key: 'totalRemuneration',
      type: 'number',
      x: 110,
      y: 244,
      width: 25,
      height: 4.5,
      fontSize: 8.5,
      fontFamily: 'Helvetica',
      isBold: false,
      alignment: 'left',
      rotation: 0,
      isVisible: true,
      sampleValue: '85,000.00',
    },
    {
      id: 'f_hourly_rate',
      name: 'Hourly OT Rate (Rs.)',
      key: 'hourlyRate',
      type: 'number',
      x: 43,
      y: 253.5,
      width: 36,
      height: 4.5,
      fontSize: 9,
      fontFamily: 'Helvetica',
      isBold: false,
      alignment: 'left',
      rotation: 0,
      isVisible: true,
      sampleValue: '482.95',
    },
    {
      id: 'f_days_pay',
      name: 'Days Payment of OT (Rs.)',
      key: 'daysPay',
      type: 'number',
      x: 113,
      y: 253.5,
      width: 27,
      height: 4.5,
      fontSize: 9,
      fontFamily: 'Helvetica',
      isBold: false,
      alignment: 'left',
      rotation: 0,
      isVisible: true,
      sampleValue: '3,863.64',
    },
    {
      id: 'f_ot_payment_due_a',
      name: "Overtime Payment Due 'A' (Rs.)",
      key: 'otPaymentDueA',
      type: 'calculated',
      x: 89,
      y: 260,
      width: 40,
      height: 4.5,
      fontSize: 9.5,
      fontFamily: 'Helvetica',
      isBold: true,
      alignment: 'left',
      rotation: 0,
      isVisible: true,
      sampleValue: '8,934.58',
    },
    {
      id: 'f_ot_payment_due_b',
      name: "Special Assignment Payment 'B' (Rs.)",
      key: 'otPaymentDueB',
      type: 'calculated',
      x: 149,
      y: 260,
      width: 44,
      height: 4.5,
      fontSize: 9.5,
      fontFamily: 'Helvetica',
      isBold: true,
      alignment: 'left',
      rotation: 0,
      isVisible: true,
      sampleValue: '0.00',
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

/**
 * Generates an SVG representation of the official Bank of Ceylon (BOC)
 * Monthly Out of Pocket Allowance Form (Form No : 10610)
 * based directly on the attached physical Out of Pocket sheet.
 */
export function generateOutOfPocketTemplateSvg(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 210 297" width="210mm" height="297mm">
  <defs>
    <style>
      .boc-red { fill: #c01823; }
      .boc-red-stroke { stroke: #c01823; }
      .boc-light-stroke { stroke: #fca5a5; }
      .boc-line-dash { stroke: #f87171; stroke-width: 0.2mm; stroke-dasharray: 1 1; }
      .tbl-head-text { font-family: 'Helvetica', Arial, sans-serif; font-size: 2.1mm; font-weight: bold; fill: #ffffff; text-anchor: middle; }
      .tbl-sub-text { font-family: 'Helvetica', Arial, sans-serif; font-size: 1.8mm; fill: #ffffff; text-anchor: middle; }
    </style>
  </defs>

  <!-- Clean A4 White Background -->
  <rect x="0" y="0" width="210" height="297" fill="#ffffff" />

  <!-- Form Outer Boundary Margin -->
  <rect x="11" y="9" width="188" height="279" fill="none" stroke="#c01823" stroke-width="0.35mm" />

  <!-- Left & Right Margin References -->
  <text x="8.5" y="160" transform="rotate(-90 8.5 160)" font-family="Helvetica, Arial" font-size="1.6mm" font-weight="bold" fill="#c01823">BOC/SUPP/S242705</text>
  <text x="9" y="248" transform="rotate(-90 9 248)" font-family="Helvetica, Arial" font-size="1.9mm" font-weight="bold" fill="#c01823">Form No : 10610</text>
  <text x="202" y="200" transform="rotate(-90 202 200)" font-family="Helvetica, Arial" font-size="1.3mm" fill="#991b1b">Printed By: Naran Computer Forms 09/12/04</text>

  <!-- ================= TOP HEADER ================= -->
  <!-- Top Left: Bank of Ceylon Logo & Stylized BOC Emblem -->
  <g transform="translate(14, 11)">
    <text x="0" y="3" font-family="Helvetica, Arial" font-size="2.6mm" font-weight="bold" fill="#c01823">BANK OF CEYLON</text>
    
    <!-- Stylized BOC emblem -->
    <g transform="translate(0, 4)">
      <!-- Letter B -->
      <text x="0" y="8" font-family="Helvetica, Arial" font-size="8mm" font-weight="900" fill="#c01823">B</text>
      <!-- Letter O with central circular emblem -->
      <g transform="translate(8.5, 0)">
        <circle cx="5" cy="4.5" r="4.8" fill="none" stroke="#c01823" stroke-width="1.2mm" />
        <circle cx="5" cy="4.5" r="3.2" fill="none" stroke="#c01823" stroke-width="0.3mm" />
        <circle cx="5" cy="4.5" r="1.5" fill="#c01823" />
        <line x1="5" y1="1.3" x2="5" y2="7.7" stroke="#c01823" stroke-width="0.25mm" />
        <line x1="1.8" y1="4.5" x2="8.2" y2="4.5" stroke="#c01823" stroke-width="0.25mm" />
      </g>
      <!-- Letter C -->
      <text x="20.5" y="8" font-family="Helvetica, Arial" font-size="8mm" font-weight="900" fill="#c01823">C</text>
    </g>

    <text x="0" y="15.8" font-family="Helvetica, Arial" font-size="2.0mm" font-weight="600" fill="#c01823">Bankers to the Nation</text>
  </g>

  <!-- Header Title: MONTHLY OUT OF POCKET ALLOWANCE -->
  <text x="53" y="16.5" font-family="Helvetica, Arial" font-size="4.4mm" font-weight="bold" fill="#c01823" letter-spacing="0.2mm">MONTHLY OUT OF POCKET ALLOWANCE</text>

  <!-- Top Right Year Box -->
  <text x="142" y="21" font-family="Helvetica, Arial" font-size="3.4mm" font-weight="bold" fill="#c01823">20</text>
  <rect x="148" y="15" width="48" height="8.5" fill="#ffffff" stroke="#c01823" stroke-width="0.3mm" />
  <text x="172" y="28" font-family="Helvetica, Arial" font-size="1.9mm" fill="#475569" text-anchor="middle">Year &amp; Month</text>

  <!-- Branch / Dept -->
  <line x1="53" y1="26" x2="140" y2="26" class="boc-line-dash" />
  <text x="96" y="28" font-family="Helvetica, Arial" font-size="2.0mm" fill="#475569" text-anchor="middle">Branch / Dept</text>

  <!-- Particulars: Name & Grade on Left, P.F. No with 7 Boxes on Right -->
  <!-- Name -->
  <text x="14" y="36" font-family="Helvetica, Arial" font-size="2.4mm" font-weight="bold" fill="#c01823">Name :</text>
  <line x1="28" y1="36" x2="142" y2="36" class="boc-line-dash" />

  <!-- P.F. No. Label -->
  <text x="147" y="36" font-family="Helvetica, Arial" font-size="2.3mm" font-weight="bold" fill="#c01823">P.F. No:</text>

  <!-- 7 P.F. Digit Boxes -->
  <g transform="translate(162, 30.5)">
    <rect x="0" y="0" width="4.8" height="7" fill="#ffffff" stroke="#c01823" stroke-width="0.25mm" />
    <rect x="4.8" y="0" width="4.8" height="7" fill="#ffffff" stroke="#c01823" stroke-width="0.25mm" />
    <rect x="9.6" y="0" width="4.8" height="7" fill="#ffffff" stroke="#c01823" stroke-width="0.25mm" />
    <rect x="14.4" y="0" width="4.8" height="7" fill="#ffffff" stroke="#c01823" stroke-width="0.25mm" />
    <rect x="19.2" y="0" width="4.8" height="7" fill="#ffffff" stroke="#c01823" stroke-width="0.25mm" />
    <rect x="24.0" y="0" width="4.8" height="7" fill="#ffffff" stroke="#c01823" stroke-width="0.25mm" />
    <rect x="28.8" y="0" width="4.8" height="7" fill="#ffffff" stroke="#c01823" stroke-width="0.25mm" />
  </g>

  <!-- Grade -->
  <text x="14" y="44" font-family="Helvetica, Arial" font-size="2.4mm" font-weight="bold" fill="#c01823">Grade :</text>
  <line x1="28" y1="44" x2="142" y2="44" class="boc-line-dash" />

  <!-- ================= SECTION 2: 31-ROW OUT OF POCKET TABLE ================= -->
  <!-- Outer Table Border (13 to 196, 48 to 258) -->
  <rect x="13" y="48" width="183" height="210" fill="none" stroke="#c01823" stroke-width="0.35mm" />

  <!-- Header Red Background Bar -->
  <rect x="13" y="48" width="183" height="11.5" fill="#c01823" stroke="#c01823" stroke-width="0.25mm" />

  <!-- Column 1: Date : (13 to 25 = 12mm) -->
  <text x="19" y="55" class="tbl-head-text">Date :</text>
  <line x1="25" y1="48" x2="25" y2="250.7" stroke="#fca5a5" stroke-width="0.2mm" />

  <!-- Column 2: Day (25 to 39 = 14mm) -->
  <text x="32" y="55" class="tbl-head-text">Day</text>
  <line x1="39" y1="48" x2="39" y2="250.7" stroke="#fca5a5" stroke-width="0.2mm" />

  <!-- Column 3: Nature of Work (39 to 101 = 62mm) -->
  <text x="70" y="55" class="tbl-head-text">Nature of Work</text>
  <line x1="101" y1="48" x2="101" y2="250.7" stroke="#fca5a5" stroke-width="0.2mm" />

  <!-- Column 4: Time (101 to 125 = 24mm) -> Subdivided into Start & Finish -->
  <text x="113" y="52" class="tbl-head-text">Time</text>
  <line x1="101" y1="53.5" x2="125" y2="53.5" stroke="#ffffff" stroke-width="0.2mm" />
  <text x="107" y="57.5" class="tbl-sub-text">Start</text>
  <line x1="113" y1="53.5" x2="113" y2="250.7" stroke="#fca5a5" stroke-width="0.2mm" />
  <text x="119" y="57.5" class="tbl-sub-text">Finish</text>
  <line x1="125" y1="48" x2="125" y2="250.7" stroke="#fca5a5" stroke-width="0.2mm" />

  <!-- Column 5: Hours Claimed (125 to 139 = 14mm) -->
  <text x="132" y="52.2" class="tbl-head-text">Hours</text>
  <text x="132" y="57.5" class="tbl-head-text">Claimed</text>
  <line x1="139" y1="48" x2="139" y2="250.7" stroke="#fca5a5" stroke-width="0.2mm" />

  <!-- Column 6: Amount (139 to 168 = 29mm) -> Subdivided into Rs. & Cts. -->
  <text x="153.5" y="52" class="tbl-head-text">Amount</text>
  <line x1="139" y1="53.5" x2="168" y2="53.5" stroke="#ffffff" stroke-width="0.2mm" />
  <text x="149" y="57.5" class="tbl-sub-text">Rs.</text>
  <line x1="159" y1="53.5" x2="159" y2="250.7" stroke="#fca5a5" stroke-width="0.2mm" />
  <text x="163.5" y="57.5" class="tbl-sub-text">Cts.</text>
  <line x1="168" y1="48" x2="168" y2="250.7" stroke="#fca5a5" stroke-width="0.2mm" />

  <!-- Column 7: Approved (168 to 196 = 28mm) -> Subdivided into Unit Head / Manager & AGM -->
  <text x="182" y="52" class="tbl-head-text">Approved</text>
  <line x1="168" y1="53.5" x2="196" y2="53.5" stroke="#ffffff" stroke-width="0.2mm" />
  <text x="175" y="56" font-family="Helvetica, Arial" font-size="1.4mm" fill="#ffffff" text-anchor="middle">Unit Head /</text>
  <text x="175" y="58.3" font-family="Helvetica, Arial" font-size="1.4mm" fill="#ffffff" text-anchor="middle">Manager</text>
  <line x1="182" y1="53.5" x2="182" y2="250.7" stroke="#fca5a5" stroke-width="0.2mm" />
  <text x="189" y="57.5" class="tbl-sub-text">AGM</text>

  <!-- 31 Daily Data Rows (from y=59.5 to 250.7, rowHeight=6.168mm) -->
  ${Array.from({ length: 31 }).map((_, i) => {
    const y = 59.5 + (i + 1) * 6.168;
    return `<line x1="13" y1="${y.toFixed(2)}" x2="196" y2="${y.toFixed(2)}" stroke="#fca5a5" stroke-width="0.15mm" />`;
  }).join('\n  ')}

  <!-- ================= TOTAL ROW (y=250.7 to 258) ================= -->
  <line x1="13" y1="250.7" x2="196" y2="250.7" stroke="#c01823" stroke-width="0.3mm" />
  <text x="16" y="255.5" font-family="Helvetica, Arial" font-size="2.3mm" font-weight="bold" fill="#c01823">I certify that I have worked during the time specified above</text>

  <!-- TOTAL Label -->
  <text x="132" y="255.5" font-family="Helvetica, Arial" font-size="2.4mm" font-weight="bold" fill="#c01823" text-anchor="middle">TOTAL</text>
  <line x1="139" y1="250.7" x2="139" y2="258" stroke="#c01823" stroke-width="0.25mm" />
  <line x1="159" y1="250.7" x2="159" y2="258" stroke="#c01823" stroke-width="0.25mm" />
  <line x1="168" y1="250.7" x2="168" y2="258" stroke="#c01823" stroke-width="0.25mm" />

  <!-- ================= FOOTER / SIGNATURES ================= -->
  <!-- Date -->
  <text x="16" y="278" font-family="Helvetica, Arial" font-size="2.4mm" fill="#c01823">Date :</text>
  <line x1="26" y1="278" x2="68" y2="278" class="boc-line-dash" />

  <!-- Claimant Signature -->
  <line x1="76" y1="274" x2="124" y2="274" class="boc-line-dash" />
  <text x="100" y="278" font-family="Helvetica, Arial" font-size="2.4mm" fill="#c01823" text-anchor="middle">Signature</text>

  <!-- Payment Authorised By -->
  <text x="135" y="278" font-family="Helvetica, Arial" font-size="2.4mm" fill="#c01823">Payment Authorised by :</text>
  <line x1="174" y1="278" x2="196" y2="278" class="boc-line-dash" />
</svg>`;
}

export function getOutOfPocketTemplateSvgDataUrl(): string {
  const svg = generateOutOfPocketTemplateSvg();
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export const OUT_OF_POCKET_TEMPLATE: TemplateConfig = {
  id: 'boc-monthly-out-of-pocket-allowance-v1',
  name: 'Monthly Out of Pocket Allowance (Form 10610)',
  description: 'Official Bank of Ceylon (BOC) Form No : 10610 for Monthly Out of Pocket Allowance (OP)',
  isDefault: false,
  pageSize: 'A4',
  widthMm: 210,
  heightMm: 297,
  backgroundImageUrl: getOutOfPocketTemplateSvgDataUrl(),
  backgroundType: 'image',
  printerOffsetX: 0,
  printerOffsetY: 0,
  updatedAt: new Date().toISOString(),
  fields: [
    {
      id: 'f_op_emp_name',
      name: 'Employee Name',
      key: 'employeeName',
      type: 'text',
      x: 28,
      y: 34.5,
      width: 112,
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
      id: 'f_op_pf_no',
      name: 'P. F. Number',
      key: 'employeeNumber',
      type: 'text',
      x: 162.5,
      y: 33.5,
      width: 33,
      height: 5.5,
      fontSize: 10,
      fontFamily: 'Courier',
      isBold: true,
      alignment: 'left',
      rotation: 0,
      charSpacing: 2.1,
      isVisible: true,
      sampleValue: '0845217',
    },
    {
      id: 'f_op_grade',
      name: 'Grade / Designation',
      key: 'designation',
      type: 'text',
      x: 28,
      y: 42.5,
      width: 112,
      height: 4.5,
      fontSize: 9,
      fontFamily: 'Helvetica',
      isBold: false,
      alignment: 'left',
      rotation: 0,
      isVisible: true,
      sampleValue: 'Senior Banking Assistant - Grade II',
    },
    {
      id: 'f_op_branch',
      name: 'Branch / Dept',
      key: 'branch',
      type: 'text',
      x: 55,
      y: 24.5,
      width: 82,
      height: 4.5,
      fontSize: 9,
      fontFamily: 'Helvetica',
      isBold: true,
      alignment: 'left',
      rotation: 0,
      isVisible: true,
      sampleValue: 'Colombo Main Branch (001)',
    },
    {
      id: 'f_op_year_box',
      name: 'Year (20xx)',
      key: 'year2Digit',
      type: 'text',
      x: 150,
      y: 17,
      width: 44,
      height: 5.5,
      fontSize: 11,
      fontFamily: 'Helvetica',
      isBold: true,
      alignment: 'center',
      rotation: 0,
      isVisible: true,
      sampleValue: '26',
    },
    {
      id: 'f_op_month_year',
      name: 'Year & Month',
      key: 'monthYear',
      type: 'text',
      x: 145,
      y: 24.5,
      width: 50,
      height: 4.5,
      fontSize: 8.5,
      fontFamily: 'Helvetica',
      isBold: true,
      alignment: 'center',
      rotation: 0,
      isVisible: true,
      sampleValue: 'October 2026',
    },
    {
      id: 'f_op_claim_date',
      name: 'Claim Date',
      key: 'claimDate',
      type: 'date',
      x: 27,
      y: 276.5,
      width: 40,
      height: 4.5,
      fontSize: 8.5,
      fontFamily: 'Helvetica',
      isBold: false,
      alignment: 'left',
      rotation: 0,
      isVisible: true,
      sampleValue: '2026-10-31',
    },
    {
      id: 'f_op_signature',
      name: 'Claimant Signature',
      key: 'claimantSign',
      type: 'signature',
      x: 77,
      y: 271,
      width: 46,
      height: 4.5,
      fontSize: 9,
      fontFamily: 'Helvetica',
      isBold: true,
      alignment: 'center',
      rotation: 0,
      isVisible: true,
      sampleValue: 'D. D. Ramasingha',
    },
    {
      id: 'f_op_total_hours',
      name: 'TOTAL Hours Claimed',
      key: 'totalHoursOnly',
      type: 'calculated',
      x: 125,
      y: 252.5,
      width: 14,
      height: 5.5,
      fontSize: 8.5,
      fontFamily: 'Helvetica',
      isBold: true,
      alignment: 'center',
      rotation: 0,
      isVisible: true,
      sampleValue: '38:00',
    },
    {
      id: 'f_op_total_amount_rs',
      name: 'TOTAL Amount (Rs.)',
      key: 'totalAmountRs',
      type: 'calculated',
      x: 139.5,
      y: 252.5,
      width: 19,
      height: 5.5,
      fontSize: 8.5,
      fontFamily: 'Helvetica',
      isBold: true,
      alignment: 'right',
      rotation: 0,
      isVisible: true,
      sampleValue: '18,350',
    },
    {
      id: 'f_op_total_amount_cts',
      name: 'TOTAL Amount (Cts.)',
      key: 'totalAmountCts',
      type: 'calculated',
      x: 159.5,
      y: 252.5,
      width: 8,
      height: 5.5,
      fontSize: 8.5,
      fontFamily: 'Helvetica',
      isBold: true,
      alignment: 'center',
      rotation: 0,
      isVisible: true,
      sampleValue: '00',
    },
    {
      id: 'f_op_auth_by',
      name: 'Payment Authorised by',
      key: 'paymentAuthorisedBy',
      type: 'text',
      x: 172,
      y: 276.5,
      width: 24,
      height: 4.5,
      fontSize: 8.5,
      fontFamily: 'Helvetica',
      isBold: false,
      alignment: 'left',
      rotation: 0,
      isVisible: true,
      sampleValue: '',
    },
  ],
  tableConfig: {
    enabled: true,
    startY: 60.0,
    rowHeight: 6.15,
    maxRows: 31,
    fontSize: 8,
    fontFamily: 'Helvetica',
    isBold: false,
    columns: {
      date: { x: 13, width: 12, align: 'center' },
      day: { x: 25, width: 14, align: 'center' },
      reason: { x: 39, width: 62, align: 'left' },
      startTime: { x: 101, width: 12, align: 'center' },
      endTime: { x: 113, width: 12, align: 'center' },
      totalHours: { x: 125, width: 14, align: 'center' },
      amountRs: { x: 139, width: 20, align: 'right' },
      amountCts: { x: 159, width: 9, align: 'center' },
      approvedBy: { x: 168, width: 14, align: 'center' },
      approvedByAgm: { x: 182, width: 14, align: 'center' },
    },
  },
};

export const BUILTIN_TEMPLATES: TemplateConfig[] = [DEFAULT_TEMPLATE, OUT_OF_POCKET_TEMPLATE];

