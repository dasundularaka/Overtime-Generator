import { collection, doc, getDocs, setDoc, deleteDoc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase/config';
import { Branch, RoleRate, Department } from '../types';
import { sanitizeFirestoreData } from './firestoreUtils';

const STORAGE_KEYS = {
  BRANCHES: 'ot_manager_branches_v1',
  ROLES: 'ot_manager_roles_v1',
  DEPARTMENTS: 'ot_manager_departments_v1',
};

export const DEFAULT_BRANCHES: Branch[] = [
  {
    id: 'br_001',
    name: 'Head Office - Colombo',
    branchCode: '001',
    address: 'No. 1, York Street, Colombo 01',
    telephone: '+94 11 2446790',
    email: 'headoffice@bank.lk',
    notes: 'Main Executive Headquarters & Core Banking Operations',
    mapLink: 'https://maps.google.com/?q=No.+1,+York+Street,+Colombo+01',
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'br_002',
    name: 'Colombo Main Branch',
    branchCode: '002',
    address: 'No. 4, Bristol Street, Colombo 01',
    telephone: '+94 11 2445800',
    email: 'colombomain@bank.lk',
    notes: 'Metropolitan Commercial & Clearing Hub',
    mapLink: 'https://maps.google.com/?q=No.+4,+Bristol+Street,+Colombo+01',
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'br_003',
    name: 'Corporate Banking Branch',
    branchCode: '003',
    address: 'Level 14, BOC Tower, Colombo 01',
    telephone: '+94 11 2337722',
    email: 'corporate@bank.lk',
    notes: 'High-Value Institutional Client Operations',
    mapLink: 'https://maps.google.com/?q=BOC+Tower,+Colombo+01',
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'br_015',
    name: 'Kandy Super Grade Branch',
    branchCode: '015',
    address: 'No. 22, Dalada Veediya, Kandy',
    telephone: '+94 81 2223400',
    email: 'kandy@bank.lk',
    notes: 'Central Province Regional Operations Center',
    mapLink: 'https://maps.google.com/?q=No.+22,+Dalada+Veediya,+Kandy',
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'br_025',
    name: 'Galle Fort Branch',
    branchCode: '025',
    address: 'No. 18, Church Street, Galle Fort',
    telephone: '+94 91 2234120',
    email: 'galle@bank.lk',
    notes: 'Southern Province Regional Financial Hub',
    mapLink: 'https://maps.google.com/?q=No.+18,+Church+Street,+Galle+Fort',
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'br_040',
    name: 'Kurunegala City Branch',
    branchCode: '040',
    address: 'No. 45, Colombo Road, Kurunegala',
    telephone: '+94 37 2222150',
    email: 'kurunegala@bank.lk',
    notes: 'North Western Regional Banking Center',
    mapLink: 'https://maps.google.com/?q=No.+45,+Colombo+Road,+Kurunegala',
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'br_060',
    name: 'Jaffna Central Branch',
    branchCode: '060',
    address: 'No. 80, Hospital Road, Jaffna',
    telephone: '+94 21 2222300',
    email: 'jaffna@bank.lk',
    notes: 'Northern Province Hub',
    mapLink: 'https://maps.google.com/?q=No.+80,+Hospital+Road,+Jaffna',
    createdAt: '2026-01-01T00:00:00.000Z',
  },
];

export const DEFAULT_ROLE_RATES: RoleRate[] = [
  {
    id: 'role_to',
    name: 'Technical Officer',
    description: 'Technical officer responsible for infrastructure & IT maintenance.',
    department: 'IT & Infrastructure Operations',
    claimType: 'OT',
    hourlyRateWorkingDays: 1850,
    daysPaymentNonWorkingDays: 12500,
    hourlyRateNonWorkingDays: 2312.5,
    specialHourlyRate: 2500,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'role_sre',
    name: 'Senior Systems Engineer',
    description: 'Core infrastructure, networking, and critical server reliability.',
    department: 'IT & Infrastructure Operations',
    claimType: 'OT',
    hourlyRateWorkingDays: 2100,
    daysPaymentNonWorkingDays: 14000,
    hourlyRateNonWorkingDays: 2625,
    specialHourlyRate: 2800,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'role_sysadmin',
    name: 'Lead Systems Administrator',
    description: 'Enterprise systems oversight, security, and administrative duties.',
    department: 'Core Banking & Systems',
    claimType: 'OT',
    hourlyRateWorkingDays: 2500,
    daysPaymentNonWorkingDays: 16000,
    hourlyRateNonWorkingDays: 3125,
    specialHourlyRate: 3200,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'role_staff',
    name: 'Staff Member / Operations Assistant',
    description: 'General administrative support and operations execution.',
    department: 'Branch Operations & Clearing',
    claimType: 'OT',
    hourlyRateWorkingDays: 1250,
    daysPaymentNonWorkingDays: 8500,
    hourlyRateNonWorkingDays: 1562.5,
    specialHourlyRate: 1700,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'role_officer',
    name: 'Banking Officer / Analyst',
    description: 'Branch operations, account verification, and document auditing.',
    department: 'Corporate Banking Division',
    claimType: 'OT',
    hourlyRateWorkingDays: 1550,
    daysPaymentNonWorkingDays: 10500,
    hourlyRateNonWorkingDays: 1937.5,
    specialHourlyRate: 2100,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
];

// ---------------- Branches Helpers ----------------

export function getLocalBranches(): Branch[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.BRANCHES);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveLocalBranches(branches: Branch[]): void {
  try {
    localStorage.setItem(STORAGE_KEYS.BRANCHES, JSON.stringify(branches));
  } catch (e) {
    console.warn('Could not save local branches', e);
  }
}

export async function fetchBranchesFromFirestore(): Promise<Branch[]> {
  try {
    const snap = await getDocs(collection(db, 'branches'));
    const list: Branch[] = [];
    snap.forEach(d => {
      const data = d.data() as Branch;
      list.push({ ...data, id: data.id || d.id });
    });
    // Sort by branch code (natural alphanumeric)
    list.sort((a, b) => (a.branchCode || '').localeCompare(b.branchCode || '', undefined, { numeric: true, sensitivity: 'base' }));
    saveLocalBranches(list);
    return list;
  } catch (e) {
    console.warn('Could not fetch branches from Firestore, using local cache', e);
    return getLocalBranches();
  }
}

export function subscribeToBranches(callback: (branches: Branch[]) => void): () => void {
  try {
    return onSnapshot(
      collection(db, 'branches'),
      snap => {
        const list: Branch[] = [];
        snap.forEach(d => {
          const data = d.data() as Branch;
          list.push({ ...data, id: data.id || d.id });
        });
        // Sort by branch code (natural alphanumeric)
        list.sort((a, b) => (a.branchCode || '').localeCompare(b.branchCode || '', undefined, { numeric: true, sensitivity: 'base' }));
        saveLocalBranches(list);
        callback(list);
      },
      err => {
        console.warn('Branches snapshot listener error, using local fallback:', err);
        callback(getLocalBranches());
      }
    );
  } catch {
    callback(getLocalBranches());
    return () => {};
  }
}

export async function saveBranch(branch: Branch): Promise<void> {
  const clean = sanitizeFirestoreData({
    ...branch,
    updatedAt: new Date().toISOString(),
  });
  await setDoc(doc(db, 'branches', branch.id), clean);
  const local = getLocalBranches();
  const idx = local.findIndex(b => b.id === branch.id);
  const updated = idx >= 0 ? [...local] : [branch, ...local];
  if (idx >= 0) updated[idx] = branch;
  saveLocalBranches(updated);
}

export async function deleteBranch(branchId: string): Promise<void> {
  await deleteDoc(doc(db, 'branches', branchId));
  const local = getLocalBranches().filter(b => b.id !== branchId);
  saveLocalBranches(local);
}

// ---------------- Role Rates Helpers ----------------

export function getLocalRoleRates(): RoleRate[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.ROLES);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveLocalRoleRates(roles: RoleRate[]): void {
  try {
    localStorage.setItem(STORAGE_KEYS.ROLES, JSON.stringify(roles));
  } catch (e) {
    console.warn('Could not save local roles', e);
  }
}

export async function fetchRoleRatesFromFirestore(): Promise<RoleRate[]> {
  try {
    const snap = await getDocs(collection(db, 'roles'));
    const list: RoleRate[] = [];
    snap.forEach(d => {
      const data = d.data() as RoleRate;
      list.push({ ...data, id: data.id || d.id });
    });
    list.sort((a, b) => a.name.localeCompare(b.name));
    saveLocalRoleRates(list);
    return list;
  } catch (e) {
    console.warn('Could not fetch roles from Firestore, using local cache', e);
    return getLocalRoleRates();
  }
}

export function subscribeToRoleRates(callback: (roles: RoleRate[]) => void): () => void {
  try {
    return onSnapshot(
      collection(db, 'roles'),
      snap => {
        const list: RoleRate[] = [];
        snap.forEach(d => {
          const data = d.data() as RoleRate;
          list.push({ ...data, id: data.id || d.id });
        });
        list.sort((a, b) => a.name.localeCompare(b.name));
        saveLocalRoleRates(list);
        callback(list);
      },
      err => {
        console.warn('Roles snapshot listener error, using local fallback:', err);
        callback(getLocalRoleRates());
      }
    );
  } catch {
    callback(getLocalRoleRates());
    return () => {};
  }
}

export async function saveRoleRate(role: RoleRate): Promise<void> {
  const clean = sanitizeFirestoreData({
    ...role,
    updatedAt: new Date().toISOString(),
  });
  await setDoc(doc(db, 'roles', role.id), clean);
  const local = getLocalRoleRates();
  const idx = local.findIndex(r => r.id === role.id);
  const updated = idx >= 0 ? [...local] : [role, ...local];
  if (idx >= 0) updated[idx] = role;
  saveLocalRoleRates(updated);

  // If role has department, automatically save to departments collection too
  if (role.department && role.department.trim()) {
    const deptName = role.department.trim();
    const depts = getLocalDepartments();
    if (!depts.some(d => d.name.toLowerCase() === deptName.toLowerCase())) {
      const newDept: Department = {
        id: 'dept_' + Date.now(),
        name: deptName,
        createdAt: new Date().toISOString(),
      };
      saveDepartment(newDept).catch(() => {});
    }
  }
}

export async function deleteRoleRate(roleId: string): Promise<void> {
  await deleteDoc(doc(db, 'roles', roleId));
  const local = getLocalRoleRates().filter(r => r.id !== roleId);
  saveLocalRoleRates(local);
}

// ---------------- Departments Helpers ----------------

export const DEFAULT_DEPARTMENTS: Department[] = [
  {
    id: 'dept_it',
    name: 'IT & Infrastructure Operations',
    description: 'Enterprise IT, systems maintenance, hardware & network operations',
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'dept_core',
    name: 'Core Banking & Systems',
    description: 'Core financial transactions and database administration',
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'dept_branch',
    name: 'Branch Operations & Clearing',
    description: 'Branch customer services, teller processing, and cheque clearing',
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'dept_corp',
    name: 'Corporate Banking Division',
    description: 'Corporate client accounts, credit lines, and trade finance',
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'dept_treasury',
    name: 'Treasury & Foreign Exchange',
    description: 'Money market operations, forex desk, and liquidity management',
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'dept_finance',
    name: 'Finance & Accounts',
    description: 'Financial reporting, auditing, ledger reconciliation & tax',
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'dept_hr',
    name: 'Human Resources Division',
    description: 'Staffing, employee welfare, compensation & benefits',
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'dept_facilities',
    name: 'Engineering & Facilities',
    description: 'Premises upkeep, electrical, HVAC & physical infrastructure',
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'dept_audit',
    name: 'Audit & Compliance',
    description: 'Regulatory compliance, internal controls, and inspection',
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'dept_risk',
    name: 'Credit & Risk Management',
    description: 'Risk assessment, loan audit, and credit monitoring',
    createdAt: '2026-01-01T00:00:00.000Z',
  },
];

export function getLocalDepartments(): Department[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.DEPARTMENTS);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveLocalDepartments(departments: Department[]): void {
  try {
    localStorage.setItem(STORAGE_KEYS.DEPARTMENTS, JSON.stringify(departments));
  } catch (e) {
    console.warn('Could not save local departments', e);
  }
}

export async function fetchDepartmentsFromFirestore(): Promise<Department[]> {
  try {
    const snap = await getDocs(collection(db, 'departments'));
    const list: Department[] = [];
    snap.forEach(d => {
      const data = d.data() as Department;
      list.push({ ...data, id: data.id || d.id });
    });
    list.sort((a, b) => a.name.localeCompare(b.name));
    saveLocalDepartments(list);
    return list;
  } catch (e) {
    console.warn('Could not fetch departments from Firestore, using local cache', e);
    return getLocalDepartments();
  }
}

export function subscribeToDepartments(callback: (departments: Department[]) => void): () => void {
  try {
    return onSnapshot(
      collection(db, 'departments'),
      snap => {
        const list: Department[] = [];
        snap.forEach(d => {
          const data = d.data() as Department;
          list.push({ ...data, id: data.id || d.id });
        });
        list.sort((a, b) => a.name.localeCompare(b.name));
        saveLocalDepartments(list);
        callback(list);
      },
      err => {
        console.warn('Departments snapshot listener error, using local fallback:', err);
        callback(getLocalDepartments());
      }
    );
  } catch {
    callback(getLocalDepartments());
    return () => {};
  }
}

export async function saveDepartment(department: Department): Promise<void> {
  const clean = sanitizeFirestoreData({
    ...department,
    updatedAt: new Date().toISOString(),
  });
  await setDoc(doc(db, 'departments', department.id), clean);
  const local = getLocalDepartments();
  const idx = local.findIndex(d => d.id === department.id);
  const updated = idx >= 0 ? [...local] : [department, ...local];
  if (idx >= 0) updated[idx] = department;
  updated.sort((a, b) => a.name.localeCompare(b.name));
  saveLocalDepartments(updated);
}

export async function deleteDepartment(departmentId: string): Promise<void> {
  await deleteDoc(doc(db, 'departments', departmentId));
  const local = getLocalDepartments().filter(d => d.id !== departmentId);
  saveLocalDepartments(local);
}

