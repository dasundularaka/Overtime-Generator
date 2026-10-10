import { collection, doc, getDocs, setDoc, deleteDoc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase/config';
import { Branch, RoleRate } from '../types';
import { sanitizeFirestoreData } from './firestoreUtils';

const STORAGE_KEYS = {
  BRANCHES: 'ot_manager_branches_v1',
  ROLES: 'ot_manager_roles_v1',
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
    createdAt: '2026-01-01T00:00:00.000Z',
  },
];

export const DEFAULT_ROLE_RATES: RoleRate[] = [
  {
    id: 'role_to',
    name: 'Technical Officer',
    description: 'Technical officer responsible for infrastructure & IT maintenance.',
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
    if (!raw) {
      localStorage.setItem(STORAGE_KEYS.BRANCHES, JSON.stringify(DEFAULT_BRANCHES));
      return DEFAULT_BRANCHES;
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : DEFAULT_BRANCHES;
  } catch {
    return DEFAULT_BRANCHES;
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
    if (!snap.empty) {
      const list: Branch[] = [];
      snap.forEach(d => {
        const data = d.data() as Branch;
        list.push({ ...data, id: data.id || d.id });
      });
      // Sort A to Z by name
      list.sort((a, b) => a.name.localeCompare(b.name));
      saveLocalBranches(list);
      return list;
    } else {
      // Seed default branches to Firestore
      for (const b of DEFAULT_BRANCHES) {
        await setDoc(doc(db, 'branches', b.id), sanitizeFirestoreData(b)).catch(() => {});
      }
      return DEFAULT_BRANCHES;
    }
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
        if (!snap.empty) {
          const list: Branch[] = [];
          snap.forEach(d => {
            const data = d.data() as Branch;
            list.push({ ...data, id: data.id || d.id });
          });
          list.sort((a, b) => a.name.localeCompare(b.name));
          saveLocalBranches(list);
          callback(list);
        } else {
          callback(getLocalBranches());
        }
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
    if (!raw) {
      localStorage.setItem(STORAGE_KEYS.ROLES, JSON.stringify(DEFAULT_ROLE_RATES));
      return DEFAULT_ROLE_RATES;
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : DEFAULT_ROLE_RATES;
  } catch {
    return DEFAULT_ROLE_RATES;
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
    if (!snap.empty) {
      const list: RoleRate[] = [];
      snap.forEach(d => {
        const data = d.data() as RoleRate;
        list.push({ ...data, id: data.id || d.id });
      });
      list.sort((a, b) => a.name.localeCompare(b.name));
      saveLocalRoleRates(list);
      return list;
    } else {
      for (const r of DEFAULT_ROLE_RATES) {
        await setDoc(doc(db, 'roles', r.id), sanitizeFirestoreData(r)).catch(() => {});
      }
      return DEFAULT_ROLE_RATES;
    }
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
        if (!snap.empty) {
          const list: RoleRate[] = [];
          snap.forEach(d => {
            const data = d.data() as RoleRate;
            list.push({ ...data, id: data.id || d.id });
          });
          list.sort((a, b) => a.name.localeCompare(b.name));
          saveLocalRoleRates(list);
          callback(list);
        } else {
          callback(getLocalRoleRates());
        }
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
}

export async function deleteRoleRate(roleId: string): Promise<void> {
  await deleteDoc(doc(db, 'roles', roleId));
  const local = getLocalRoleRates().filter(r => r.id !== roleId);
  saveLocalRoleRates(local);
}
