export type FontFamily = 'Helvetica' | 'TimesRoman' | 'Courier';
export type TextAlignment = 'left' | 'center' | 'right';
export type TimeFormat = '24h' | '12h';
export type OTDisplayFormat = 'hhmm' | 'decimal';
export type UserRole = 'admin' | 'user';
export type ClaimType = 'OT' | 'OP';
export type HolidayType = 'public' | 'bank' | 'mercantile' | 'special';

export interface Holiday {
  id: string; // YYYY-MM-DD or unique id
  date: string; // YYYY-MM-DD
  name: string;
  type: HolidayType;
  description?: string;
  isRecurringYearly?: boolean;
  createdAt: string;
}

export interface UserProfile {
  id: string; // Firebase Auth UID
  email: string;
  name: string;
  role: UserRole;
  claimType: ClaimType; // 'OT' = Overtime, 'OP' = Out of Pocket
  employeeNumber: string; // PF Number (username)
  pfNumber?: string; // Standard PF Number (e.g. PF1001)
  mustChangePassword?: boolean; // When true, prompt user to change password on login
  isFirstLogin?: boolean;
  designation: string;
  branch: string;
  department: string;
  maxOtHoursPerDay?: number; // e.g. 2.0 means 2 hours maximum per day
  hourlyRate?: number; // Default hourly OT rate in Rs.
  daysPay?: number; // Default day's pay in Rs.
  totalRemuneration?: number; // Default salary/remuneration in Rs.
  assignedTemplateIds?: string[]; // Templates assigned by admin; user can only access these
  createdAt: string;
  updatedAt: string;
}

export interface Employee {
  id: string;
  name: string;
  employeeNumber: string; // PF Number
  pfNumber?: string;
  designation: string;
  branch: string;
  department: string;
  createdAt: string;
  maxOtHoursPerDay?: number;
  hourlyRate?: number;
  daysPay?: number;
  totalRemuneration?: number;
  claimType?: ClaimType;
  assignedTemplateIds?: string[]; // Templates assigned by admin
  email?: string;
}

export interface OvertimeRow {
  id: string;
  date: string; // YYYY-MM-DD
  dayOfWeek: string; // Mon, Tue, etc.
  startTime: string; // e.g. "08:00"
  endTime: string; // e.g. "18:45"
  breakMinutes: number; // e.g. 0, 30
  isOvernight?: boolean;
  isWeekend?: boolean;
  totalWorkMinutes: number; // difference between start and end
  rawOtMinutes: number; // time worked strictly after 16:45
  totalMinutes: number; // final generated OT: 15-min blocks and capped to user limit
  totalFormatted: string; // e.g. "02:00"
  isCapped?: boolean;
  uncappedMinutes?: number;
  lateDeductionMinutes?: number;
  isLateDisqualified?: boolean;
  lateNote?: string;
  isHoliday?: boolean;
  holidayName?: string;
  isDaysPayment?: boolean; // true for non-working weekdays, Saturdays, Sundays, Holidays
  daysPaymentAmount?: number; // amount paid for this day
  reason: string;
  specialAssignmentHours?: string;
  approvedBy?: string;
}

export interface FieldConfig {
  id: string;
  name: string;
  key: string;
  type: 'text' | 'number' | 'date' | 'calculated' | 'signature';
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  fontFamily: FontFamily;
  isBold: boolean;
  alignment: TextAlignment;
  rotation: number;
  charSpacing?: number;
  isVisible: boolean;
  sampleValue?: string;
  color?: string;
}

export interface TableConfig {
  enabled: boolean;
  startY: number;
  rowHeight: number;
  maxRows: number;
  fontSize: number;
  fontFamily: FontFamily;
  isBold: boolean;
  columns: {
    date: { x: number; width: number; align: TextAlignment };
    day: { x: number; width: number; align: TextAlignment };
    reason: { x: number; width: number; align: TextAlignment };
    startTime: { x: number; width: number; align: TextAlignment };
    endTime: { x: number; width: number; align: TextAlignment };
    breakMinutes?: { x: number; width: number; align: TextAlignment };
    totalHours: { x: number; width: number; align: TextAlignment };
    otHoursClaimed?: { x: number; width: number; align: TextAlignment };
    specialHoursClaimed?: { x: number; width: number; align: TextAlignment };
    approvedBy?: { x: number; width: number; align: TextAlignment };
  };
}

export interface TemplateConfig {
  id: string;
  name: string;
  description?: string;
  isDefault?: boolean;
  pageSize: 'A4';
  widthMm: number;
  heightMm: number;
  backgroundImageUrl: string;
  backgroundType: 'image' | 'pdf';
  fields: FieldConfig[];
  tableConfig: TableConfig;
  printerOffsetX: number;
  printerOffsetY: number;
  updatedAt: string;
  createdBy?: string;
  createdByName?: string;
}

export interface ClaimRecord {
  id: string;
  userId: string;
  claimNumber: string;
  employeeId?: string;
  employeeName: string;
  employeeNumber: string;
  designation: string;
  branch: string;
  department: string;
  claimType: ClaimType;
  month: string;
  year: number;
  claimDate: string;
  rows: OvertimeRow[];
  totalMinutes: number;
  totalHoursFormatted: string;
  totalDecimalHours: number;
  otDaysCount: number;
  totalRemuneration?: number; // Total basic remuneration / salary (Rs.)
  hourlyRate?: number; // Hourly OT Rate (Rs.)
  daysPay?: number; // Days Payment of OT / Day's Pay (Rs.)
  otPaymentDueA?: number; // Overtime Payment Due 'A' (Rs.)
  daysPayCount?: number; // Number of non-working/weekend/holiday days worked
  daysPayTotal?: number; // Total Days Payment (Rs.)
  otPaymentDueB?: number; // Special Assignment Payment 'B' (Rs.)
  totalOtPayment?: number; // Total Payment Due (A + daysPayTotal + B) (Rs.)
  status: 'draft' | 'submitted' | 'approved' | 'rejected' | 'completed';
  templateId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AppSettings {
  defaultEmployeeId?: string;
  defaultDepartment: string;
  defaultBranch: string;
  timeFormat: TimeFormat;
  otDisplayFormat: OTDisplayFormat;
  defaultFont: FontFamily;
  pdfFilenamePattern: string;
  globalPrinterOffsetX: number;
  globalPrinterOffsetY: number;
  activeTemplateId: string;
  hasSeenOnboarding: boolean;
  shiftStartTime: string; // "08:00"
  shiftEndTime: string; // "16:45"
  otStepMinutes: number; // 15
}

// ---------------- Administrative Audit Log ----------------

export type AuditActionType =
  | 'USER_CREATE'
  | 'USER_UPDATE'
  | 'USER_DELETE'
  | 'PASSWORD_RESET'
  | 'PASSWORD_CHANGE'
  | 'CLAIM_CREATE'
  | 'CLAIM_UPDATE'
  | 'CLAIM_DELETE'
  | 'TEMPLATE_SAVE'
  | 'TEMPLATE_DELETE'
  | 'HOLIDAY_IMPORT'
  | 'SETTINGS_UPDATE'
  | 'USER_LOGIN'
  | 'USER_LOGOUT';

export interface AuditLogEntry {
  id: string;
  action: AuditActionType;
  actionLabel: string;
  timestamp: string; // ISO 8601
  // Performed By User Identifiers
  userId?: string;
  userName: string;
  userPfNumber: string; // e.g. PF123456
  userBranch: string;   // e.g. Head Office
  userDepartment?: string;
  userRole?: UserRole;
  // Target Information
  targetType: 'user' | 'claim' | 'template' | 'holiday' | 'settings' | 'auth';
  targetId?: string;
  targetDescription: string;
  // Additional metadata & changed fields
  details?: Record<string, any>;
  ipOrDevice?: string;
}
