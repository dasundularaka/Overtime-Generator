# Overtime Claim System Enhancement & Bug Fixes

A comprehensive plan to resolve Google Drive preview 403 API errors with graceful in-browser fallbacks, optimize mobile screen responsiveness, replace project IDs with "OT Claim" in system emails, remove the "How it works" section, add a modern toggle for unlimited Special Assigned OT, enable holiday overtime claims with day/hourly pay overrides and caution icons, streamline department assignment directly to users, and implement automatic PF number default passwords with mandatory first-login reset.

## User Review & Critical Decisions

> [!IMPORTANT]
> The clarifying questions were skipped by default; we have adopted standard, production-ready enterprise defaults:
> - **Google Drive 403 API Fallback**: When Google Drive upload fails with permission/API disabled errors, seamlessly fall back to client-side Blob preview and instant PDF download with a clear explanatory notice that Drive preview is reserved for authenticated Google Drive accounts.
> - **Holiday Overtime Rate**: Support holiday & non-working day overtime claims with a dedicated override checkbox next to holidays to enter in/out times, with selectable Day's Pay / 2.0x Holiday Hourly Rate.
> - **First-Time Password Reset Flow**: When an employee logs in whose initial password matches their PF number, intercept authentication immediately with a mandatory modal to update their password before granting access to dashboard views.

- **Confirmed Decision 1**: Modern tick option for "Special Assigned OT" which disables daily/monthly hours limits and removes unnecessary break/manager initials inputs.
- **Confirmed Decision 2**: Holiday overtime entries show a warning/caution icon (icon only) in the monthly schedule and review summaries.
- **Confirmed Decision 3**: Departments will be assigned directly to individual users during user creation/editing, removing department-to-role database mappings.

---

## 1. Overview & Core Concept

- **What It Does**: Enhances the Overtime Claim application with full mobile responsiveness, foolproof PDF previewing (handling restricted Google Drive environments), compliant overtime compensation for holidays and non-working days, streamlined user management with automatic PF-number passwords and first-login security enforcement, and a cleaner UI without redundant tutorials or obsolete input fields.
- **Target Audience / Persona**: Employees recording overtime across regular shifts and company holidays, department supervisors, and payroll/system administrators managing workforce profiles.
- **Key Value**: Eliminates submission friction, guarantees document preview accessibility regardless of Google Cloud API enablement, enforces organizational account security, and supports diverse overtime compensation policies.

---

## 2. User Experience & Visual Design

### Key User Flows
1. **Timesheet Entry & Month Auto-Fill**:
   - Selecting a month loads all calendar dates.
   - Holidays are automatically highlighted with their holiday name.
   - Next to each holiday is a modern toggle/checkbox: **Override Holiday OT**.
   - Toggling the override reveals In/Out time pickers and calculates hours based on non-working day hourly rate / day's pay.
   - When overridden, a discreet caution icon (`AlertTriangle`) appears on that row.
   - Non-claimed days are cleanly filtered out during preview and report generation.
2. **Special Assigned Overtime**:
   - A modern toggle/tick option labeled **Special Assigned OT** is available on the claim header.
   - When checked, overtime hour caps/limits are relaxed without validation errors.
   - Break duration and manager initials columns/inputs are hidden for streamlined data entry.
3. **Claim Preview & Google Drive Integration**:
   - When previewing, if the user has an active Google Drive token and Drive API is enabled, the file uploads to Drive and displays in an embedded viewer.
   - If a `403` API disabled or access error occurs, the modal suppresses the raw error popup and seamlessly switches to the high-fidelity in-browser PDF object/canvas preview with direct print and download buttons.
4. **Mobile Responsive Experience**:
   - Full responsive layout across viewports (from $375\text{px}$ mobile screens to $1440\text{px}$ desktop).
   - Sticky bottom navigation and touch-friendly controls with $\ge 44\text{px}$ hitboxes on mobile.
   - Responsive horizontal scrolling for dense timesheet tables with sticky date/day columns.
5. **User Management & Security Reset**:
   - Admins create users with fields: Name, Email, PF No, Department, Role, Hourly Rate.
   - The user's initial password is automatically generated as their **PF Number**.
   - User editing allows changing departments directly on the user profile.
   - Upon first login using PF Number as password, the application immediately displays a blocking **Password Reset Panel** requiring a new secure password.

### Visual Identity & Theme
- **Dominant Neutral Canvas**: Clean slate background (`bg-slate-50`, `#F8FAFC`) with structural white surfaces (`bg-white`).
- **Accent Budget**: Deep indigo (`#4F46E5`) for primary actions and active states; warning amber (`#D97706`) strictly for the holiday caution icon.
- **Typography**: Clean contemporary typography (`Plus Jakarta Sans` / system sans) paired with tabular numbers (`tabular-nums font-mono`) for hours and rates.
- **Zero-Slop Discipline**: Removed "How it works" tutorial box; unboxed metadata; clean single-line controls; no arbitrary decorative dots or roleplay jargon.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Graceful Degradation for Google Drive Preview**
  - *Chosen Approach*: Intercept 403 / disabled API errors during Drive upload, display an informative note, and render the in-browser PDF Blob preview directly.
  - *Why*: In Google Cloud projects where Google Drive API is not yet activated on the GCP console (like project 121344878354), users must still be able to preview, review, and print their claims without blocker dialogs.
- **Decision 2: Holiday Override with Minimalist Caution Icon**
  - *Chosen Approach*: Checkbox on holiday rows that unlocks In/Out times. When active, display only the caution icon (`AlertTriangle` / `⚠️`) without bulky text badges.
  - *Why*: Keeps the table clean and dense on mobile screens while visually signaling audited non-standard claims.
- **Decision 3: User-Direct Department Assignment**
  - *Chosen Approach*: Department is an attribute on `UserProfile`, editable in `UserManagement.tsx`. Removed any complex role-to-department junction configuration.
  - *Why*: Simplifies onboarding and aligns with organizational structure where roles (Employee, Approver, Admin) are distinct from operational departments.
- **Decision 4: First-Time Login PF-Number Password Interceptor**
  - *Chosen Approach*: Check if user's current password equals their PF number or flag `requiresPasswordReset` is true. If true, display a non-dismissible modal prompting for a new password before routing to claims.
  - *Why*: Secures new employee accounts immediately after administrative creation.

---

## 4. Technical Architecture & Data Strategy

### System & Component Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                       Overtime Claim App                        │
└────────────────────────────────┬────────────────────────────────┘
                                 │
         ┌───────────────────────┼───────────────────────┐
         ▼                       ▼                       ▼
┌──────────────────┐   ┌───────────────────┐   ┌──────────────────┐
│  Authentication  │   │  Timesheet Form   │   │ User Management  │
│  & Security      │   │  & Calculation    │   │ (Admin Panel)    │
│                  │   │                   │   │                  │
│ • PF No default  │   │ • Month auto-fill │   │ • Dept on user   │
│ • First-time     │   │ • Holiday detect  │   │ • PF password    │
│   password reset │   │ • Override check  │   │ • "OT Claim"     │
│   modal blocker  │   │ • Caution icon    │   │   email sender   │
│                  │   │ • Special OT      │   │ • Direct update  │
└──────────────────┘   └─────────┬─────────┘   └──────────────────┘
                                 │
                                 ▼
                       ┌───────────────────┐
                       │   PDF Generator   │
                       │   & Preview Modal │
                       │                   │
                       │ • Drive upload    │
                       │   with 403 bypass │
                       │ • In-browser blob │
                       │ • Omit empty days │
                       │ • Caution icons   │
                       └───────────────────┘
```

### Component State & Handler Mapping

| Component | State / Property | Handler / Behavior |
| :--- | :--- | :--- |
| `PDFPreviewModal.tsx` | `driveError: string \| null`, `previewMode: 'drive' \| 'blob'` | Catch 403 API errors; fall back to iframe/embed Blob URL; hide error alert if fallback available |
| `ClaimForm.tsx` | `specialAssignedOt: boolean`, `holidayOverrides: Record<string, boolean>` | Toggle special OT (remove max hours caps; hide break/initials); holiday override checkbox reveals in/out times; show caution icon |
| `ClaimReviewModal.tsx` | `claim.entries` | Filter out non-claimed days; display caution icon on overridden holidays |
| `UserManagement.tsx` | `department`, `pfNumber`, `password` | Set initial password to `pfNumber`; departments dropdown directly on user; trigger welcome email with subject/sender "OT Claim" |
| `PasswordResetModal.tsx` | `newPassword`, `confirmPassword` | Triggered when `user.password === user.pfNumber` or first login; updates credential and clears reset flag |
| `Navbar.tsx` & Layout | Mobile responsiveness | Responsive flex/grid wrapping; bottom navigation bar for small screens; remove "How it works" trigger |
| `emailNotifier.ts` | Email templates & headers | Replace any `project-121344878354` branding with `OT Claim` |
