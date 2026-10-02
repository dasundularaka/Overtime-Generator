import { TemplateConfig } from '../types';

/**
 * Generates an SVG representation of an official A4 Overtime Claim Form blank template.
 * Notice: This is the blank official form (the background document) that is scanned or printed,
 * containing borders, logos, labels, grid lines, and signature lines.
 * The application's job is to overlay dynamic text onto it.
 */
export function generateDefaultTemplateSvg(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 210 297" width="210mm" height="297mm">
  <defs>
    <style>
      .title { font-family: 'Helvetica', Arial, sans-serif; font-size: 4.8mm; font-weight: bold; fill: #0f172a; }
      .sub-title { font-family: 'Helvetica', Arial, sans-serif; font-size: 2.6mm; fill: #475569; letter-spacing: 0.2mm; }
      .section-hdr { font-family: 'Helvetica', Arial, sans-serif; font-size: 2.8mm; font-weight: bold; fill: #1e293b; }
      .lbl { font-family: 'Helvetica', Arial, sans-serif; font-size: 2.4mm; font-weight: 600; fill: #334155; }
      .tbl-hdr { font-family: 'Helvetica', Arial, sans-serif; font-size: 2.2mm; font-weight: bold; fill: #0f172a; text-anchor: middle; }
      .note { font-family: 'Helvetica', Arial, sans-serif; font-size: 1.8mm; fill: #64748b; }
      .border-line { stroke: #0f172a; stroke-width: 0.35mm; }
      .thin-line { stroke: #94a3b8; stroke-width: 0.18mm; }
      .grid-line { stroke: #cbd5e1; stroke-width: 0.15mm; }
    </style>
  </defs>

  <!-- Page Background -->
  <rect x="0" y="0" width="210" height="297" fill="#ffffff" />
  
  <!-- Outer Form Frame -->
  <rect x="12" y="12" width="186" height="273" fill="none" stroke="#0f172a" stroke-width="0.5mm" />

  <!-- Organization Header & Form Title -->
  <g transform="translate(16, 16)">
    <!-- Form Identification Badge -->
    <rect x="146" y="2" width="32" height="6.5" rx="1" fill="#f1f5f9" stroke="#cbd5e1" stroke-width="0.2mm" />
    <text x="162" y="6.4" font-family="Helvetica, Arial" font-size="2.1mm" font-weight="bold" fill="#475569" text-anchor="middle">FORM REF: OT-01/HR</text>

    <text x="0" y="7.5" class="title">MONTHLY OVERTIME CLAIM FORM</text>
    <text x="0" y="12" class="sub-title">DEPARTMENT OF HUMAN RESOURCES &amp; OPERATIONS • OFFICIAL RECORD</text>
  </g>

  <!-- Section 1: Employee Particulars Box -->
  <rect x="16" y="32" width="178" height="27" fill="#f8fafc" stroke="#334155" stroke-width="0.3mm" />
  
  <!-- Section Title -->
  <rect x="16" y="32" width="178" height="5.5" fill="#e2e8f0" stroke="#334155" stroke-width="0.3mm" />
  <text x="18" y="36" class="section-hdr">SECTION 1: CLAIMANT &amp; PERIOD DETAILS</text>

  <!-- Labels & Field Box Underlines -->
  <!-- Row 1: Name & Emp No -->
  <text x="18" y="43" class="lbl">Employee Name:</text>
  <line x1="45" y1="44" x2="115" y2="44" class="thin-line" />

  <text x="118" y="43" class="lbl">Employee No:</text>
  <line x1="144" y1="44" x2="190" y2="44" class="thin-line" />

  <!-- Row 2: Designation & Branch -->
  <text x="18" y="50" class="lbl">Designation:</text>
  <line x1="45" y1="51" x2="115" y2="51" class="thin-line" />

  <text x="118" y="50" class="lbl">Branch / Location:</text>
  <line x1="144" y1="51" x2="190" y2="51" class="thin-line" />

  <!-- Row 3: Department & Claim Month/Year -->
  <text x="18" y="57" class="lbl">Department:</text>
  <line x1="45" y1="58" x2="115" y2="58" class="thin-line" />

  <text x="118" y="57" class="lbl">Claim Month / Year:</text>
  <line x1="144" y1="58" x2="190" y2="58" class="thin-line" />

  <!-- Section 2: Overtime Record Table -->
  <!-- Table Header -->
  <rect x="16" y="62" width="178" height="7" fill="#0f172a" stroke="#0f172a" stroke-width="0.3mm" />
  
  <text x="24" y="66.5" class="tbl-hdr" fill="#ffffff">DATE</text>
  <line x1="32" y1="62" x2="32" y2="69" stroke="#475569" stroke-width="0.2mm" />

  <text x="40" y="66.5" class="tbl-hdr" fill="#ffffff">DAY</text>
  <line x1="48" y1="62" x2="48" y2="69" stroke="#475569" stroke-width="0.2mm" />

  <text x="57" y="66.5" class="tbl-hdr" fill="#ffffff">START</text>
  <line x1="66" y1="62" x2="66" y2="69" stroke="#475569" stroke-width="0.2mm" />

  <text x="75" y="66.5" class="tbl-hdr" fill="#ffffff">END</text>
  <line x1="84" y1="62" x2="84" y2="69" stroke="#475569" stroke-width="0.2mm" />

  <text x="92" y="66.5" class="tbl-hdr" fill="#ffffff">BREAK</text>
  <line x1="100" y1="62" x2="100" y2="69" stroke="#475569" stroke-width="0.2mm" />

  <text x="110" y="66.5" class="tbl-hdr" fill="#ffffff">HOURS</text>
  <line x1="120" y1="62" x2="120" y2="69" stroke="#475569" stroke-width="0.2mm" />

  <text x="157" y="66.5" class="tbl-hdr" fill="#ffffff">NATURE OF WORK / REASON FOR OVERTIME</text>

  <!-- Table Body: 31 Rows for full monthly potential -->
  ${Array.from({ length: 31 }).map((_, i) => {
    const y = 69 + i * 5.4;
    return `
    <rect x="16" y="${y}" width="178" height="5.4" fill="${i % 2 === 0 ? '#ffffff' : '#fcfcfd'}" stroke="#cbd5e1" stroke-width="0.15mm" />
    <line x1="32" y1="${y}" x2="32" y2="${y + 5.4}" class="grid-line" />
    <line x1="48" y1="${y}" x2="48" y2="${y + 5.4}" class="grid-line" />
    <line x1="66" y1="${y}" x2="66" y2="${y + 5.4}" class="grid-line" />
    <line x1="84" y1="${y}" x2="84" y2="${y + 5.4}" class="grid-line" />
    <line x1="100" y1="${y}" x2="100" y2="${y + 5.4}" class="grid-line" />
    <line x1="120" y1="${y}" x2="120" y2="${y + 5.4}" class="grid-line" />
    `;
  }).join('')}

  <!-- Total Summary Bar -->
  <rect x="16" y="236.4" width="178" height="7.2" fill="#e2e8f0" stroke="#334155" stroke-width="0.3mm" />
  <text x="18" y="241" font-family="Helvetica, Arial" font-size="2.6mm" font-weight="bold" fill="#0f172a">TOTAL OVERTIME CLAIMED:</text>
  
  <text x="70" y="241" font-family="Helvetica, Arial" font-size="2.3mm" font-weight="bold" fill="#475569">DAYS WORKED:</text>
  <line x1="94" y1="236.4" x2="94" y2="243.6" stroke="#94a3b8" stroke-width="0.2mm" />

  <text x="102" y="241" font-family="Helvetica, Arial" font-size="2.3mm" font-weight="bold" fill="#475569">TOTAL HOURS:</text>
  
  <!-- Section 3: Approvals & Declarations -->
  <rect x="16" y="246" width="178" height="34" fill="#ffffff" stroke="#334155" stroke-width="0.3mm" />
  <rect x="16" y="246" width="178" height="5" fill="#f1f5f9" stroke="#334155" stroke-width="0.3mm" />
  <text x="18" y="249.6" class="section-hdr">SECTION 3: VERIFICATION, AUTHORIZATION &amp; APPROVAL</text>

  <!-- Declaration text -->
  <text x="18" y="254" class="note">I hereby certify that the overtime hours listed above were duly performed in the interest of the organization and are accurate.</text>

  <!-- Column 1: Claimant Signature -->
  <text x="18" y="260" class="lbl">Claimant Signature:</text>
  <line x1="18" y1="271" x2="68" y2="271" class="thin-line" />
  <text x="18" y="275" class="note">Date: ________________________</text>

  <!-- Column 2: Supervisor Approval -->
  <text x="74" y="260" class="lbl">Verified By (Supervisor):</text>
  <line x1="74" y1="271" x2="128" y2="271" class="thin-line" />
  <text x="74" y="275" class="note">Signature &amp; Date</text>

  <!-- Column 3: HOD / Management Approval -->
  <text x="134" y="260" class="lbl">Approved By (Dept Head):</text>
  <line x1="134" y1="271" x2="188" y2="271" class="thin-line" />
  <text x="134" y="275" class="note">Authorized Signatory &amp; Stamp</text>

  <!-- Bottom Form Footer -->
  <text x="16" y="283" class="note">Confidential Document. Submit to Payroll Department by the 25th of the month.</text>
  <text x="194" y="283" class="note" text-anchor="end">Page 1 of 1</text>
</svg>`;
}

export function getDefaultTemplateSvgDataUrl(): string {
  const svg = generateDefaultTemplateSvg();
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export const DEFAULT_TEMPLATE: TemplateConfig = {
  id: 'standard-official-template-v1',
  name: 'Standard Official Overtime Form (A4)',
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
      name: 'Employee Name',
      key: 'employeeName',
      type: 'text',
      x: 46,
      y: 43.2,
      width: 68,
      height: 4.5,
      fontSize: 9.5,
      fontFamily: 'Helvetica',
      isBold: true,
      alignment: 'left',
      rotation: 0,
      isVisible: true,
      sampleValue: 'Dasun Ramasingha',
    },
    {
      id: 'f_emp_no',
      name: 'Employee Number',
      key: 'employeeNumber',
      type: 'text',
      x: 145,
      y: 43.2,
      width: 44,
      height: 4.5,
      fontSize: 9.5,
      fontFamily: 'Helvetica',
      isBold: true,
      alignment: 'left',
      rotation: 0,
      isVisible: true,
      sampleValue: 'EMP-4892',
    },
    {
      id: 'f_designation',
      name: 'Designation',
      key: 'designation',
      type: 'text',
      x: 46,
      y: 50.2,
      width: 68,
      height: 4.5,
      fontSize: 9,
      fontFamily: 'Helvetica',
      isBold: false,
      alignment: 'left',
      rotation: 0,
      isVisible: true,
      sampleValue: 'Senior Technical Officer',
    },
    {
      id: 'f_branch',
      name: 'Branch / Location',
      key: 'branch',
      type: 'text',
      x: 145,
      y: 50.2,
      width: 44,
      height: 4.5,
      fontSize: 9,
      fontFamily: 'Helvetica',
      isBold: false,
      alignment: 'left',
      rotation: 0,
      isVisible: true,
      sampleValue: 'Headquarters',
    },
    {
      id: 'f_dept',
      name: 'Department',
      key: 'department',
      type: 'text',
      x: 46,
      y: 57.2,
      width: 68,
      height: 4.5,
      fontSize: 9,
      fontFamily: 'Helvetica',
      isBold: false,
      alignment: 'left',
      rotation: 0,
      isVisible: true,
      sampleValue: 'IT & Infrastructure Operations',
    },
    {
      id: 'f_month_year',
      name: 'Claim Month & Year',
      key: 'monthYear',
      type: 'text',
      x: 145,
      y: 57.2,
      width: 44,
      height: 4.5,
      fontSize: 9.5,
      fontFamily: 'Helvetica',
      isBold: true,
      alignment: 'left',
      rotation: 0,
      isVisible: true,
      sampleValue: 'March 2026',
    },
    {
      id: 'f_total_days',
      name: 'Total Days Worked',
      key: 'totalDaysCount',
      type: 'number',
      x: 88,
      y: 241,
      width: 14,
      height: 4.5,
      fontSize: 9,
      fontFamily: 'Helvetica',
      isBold: true,
      alignment: 'center',
      rotation: 0,
      isVisible: true,
      sampleValue: '14 Days',
    },
    {
      id: 'f_total_hours',
      name: 'Total Overtime Hours',
      key: 'totalHoursFormatted',
      type: 'calculated',
      x: 124,
      y: 241,
      width: 32,
      height: 4.5,
      fontSize: 10,
      fontFamily: 'Helvetica',
      isBold: true,
      alignment: 'left',
      rotation: 0,
      isVisible: true,
      sampleValue: '38:30 (38.50 hrs)',
    },
    {
      id: 'f_claim_date',
      name: 'Submission Date',
      key: 'claimDate',
      type: 'date',
      x: 27,
      y: 275,
      width: 35,
      height: 4,
      fontSize: 8.5,
      fontFamily: 'Helvetica',
      isBold: false,
      alignment: 'left',
      rotation: 0,
      isVisible: true,
      sampleValue: '25/03/2026',
    },
    {
      id: 'f_claimant_sign',
      name: 'Claimant Name / Sign',
      key: 'claimantSign',
      type: 'signature',
      x: 18,
      y: 268,
      width: 48,
      height: 4.5,
      fontSize: 9,
      fontFamily: 'Helvetica',
      isBold: true,
      alignment: 'left',
      rotation: 0,
      isVisible: true,
      sampleValue: 'Dasun Ramasingha',
    },
  ],
  tableConfig: {
    enabled: true,
    startY: 72.8, // mm from top for row 1 content baseline
    rowHeight: 5.4, // mm per row
    maxRows: 31,
    fontSize: 8,
    fontFamily: 'Helvetica',
    isBold: false,
    columns: {
      date: { x: 17, width: 14, align: 'center' },
      day: { x: 33, width: 14, align: 'center' },
      startTime: { x: 49, width: 16, align: 'center' },
      endTime: { x: 67, width: 16, align: 'center' },
      breakMinutes: { x: 85, width: 14, align: 'center' },
      totalHours: { x: 101, width: 18, align: 'center' },
      reason: { x: 122, width: 70, align: 'left' },
    },
  },
};
