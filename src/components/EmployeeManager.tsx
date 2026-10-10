import React, { useState } from 'react';
import {
  Users,
  UserPlus,
  Edit2,
  Trash2,
  Search,
  CheckCircle2,
  X,
  Building2,
  Briefcase,
  Hash,
  Star,
  Banknote,
} from 'lucide-react';
import { Employee } from '../types';
import {
  getEmployees,
  saveEmployee,
  deleteEmployee,
  getSettings,
  saveSettings,
} from '../utils/storage';
import { recordAuditLog } from '../utils/auditLogger';
import { ConfirmationModal } from './ConfirmationModal';

export const EmployeeManager: React.FC = () => {
  const [employees, setEmployees] = useState<Employee[]>(getEmployees());
  const [settings, setSettings] = useState(getSettings());
  const [searchQuery, setSearchQuery] = useState('');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);

  // Form Fields
  const [name, setName] = useState('');
  const [employeeNumber, setEmployeeNumber] = useState('');
  const [designation, setDesignation] = useState('');
  const [branch, setBranch] = useState(settings.defaultBranch || 'Headquarters');
  const [department, setDepartment] = useState(settings.defaultDepartment || 'IT & Infrastructure');
  const [hourlyRate, setHourlyRate] = useState<number | ''>('');
  const [daysPay, setDaysPay] = useState<number | ''>('');
  const [totalRemuneration, setTotalRemuneration] = useState<number | ''>('');

  // Delete Confirmation State
  const [employeeToDelete, setEmployeeToDelete] = useState<Employee | null>(null);
  const [isConfirmSaveModalOpen, setIsConfirmSaveModalOpen] = useState(false);

  const openCreateModal = () => {
    setEditingEmployee(null);
    setName('');
    setEmployeeNumber('');
    setDesignation('');
    setBranch(settings.defaultBranch || 'Headquarters');
    setDepartment(settings.defaultDepartment || 'IT & Infrastructure');
    setHourlyRate('');
    setDaysPay('');
    setTotalRemuneration('');
    setIsModalOpen(true);
  };

  const openEditModal = (emp: Employee) => {
    setEditingEmployee(emp);
    setName(emp.name);
    setEmployeeNumber(emp.employeeNumber);
    setDesignation(emp.designation);
    setBranch(emp.branch);
    setDepartment(emp.department);
    setHourlyRate(emp.hourlyRate !== undefined ? emp.hourlyRate : '');
    setDaysPay(emp.daysPay !== undefined ? emp.daysPay : '');
    setTotalRemuneration(emp.totalRemuneration !== undefined ? emp.totalRemuneration : '');
    setIsModalOpen(true);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      return;
    }
    setIsConfirmSaveModalOpen(true);
  };

  const confirmCommitSaveEmployee = () => {
    const payload: Employee = {
      id: editingEmployee?.id || 'emp_' + Date.now(),
      name: name.trim(),
      employeeNumber: employeeNumber.trim() || 'EMP-' + Math.floor(1000 + Math.random() * 9000),
      designation: designation.trim(),
      branch: branch.trim(),
      department: department.trim(),
      hourlyRate: hourlyRate !== '' ? Number(hourlyRate) : undefined,
      daysPay: daysPay !== '' ? Number(daysPay) : undefined,
      totalRemuneration: totalRemuneration !== '' ? Number(totalRemuneration) : undefined,
      createdAt: editingEmployee?.createdAt || new Date().toISOString(),
    };

    const updated = saveEmployee(payload);
    setEmployees(updated);

    recordAuditLog({
      action: editingEmployee ? 'USER_UPDATE' : 'USER_CREATE',
      actionLabel: editingEmployee ? 'Updated employee profile' : 'Created employee profile',
      targetType: 'user',
      targetId: payload.id,
      targetDescription: `${payload.name} (${payload.employeeNumber})`,
      details: {
        branch: payload.branch,
        department: payload.department,
        designation: payload.designation,
      },
    });

    setIsConfirmSaveModalOpen(false);
    setIsModalOpen(false);
  };

  const confirmDeleteEmployee = () => {
    if (!employeeToDelete) return;
    const updated = deleteEmployee(employeeToDelete.id);
    setEmployees(updated);

    recordAuditLog({
      action: 'USER_DELETE',
      actionLabel: 'Deleted employee profile',
      targetType: 'user',
      targetId: employeeToDelete.id,
      targetDescription: `${employeeToDelete.name} (${employeeToDelete.employeeNumber})`,
    });

    if (settings.defaultEmployeeId === employeeToDelete.id) {
      const newSettings = { ...settings, defaultEmployeeId: undefined };
      saveSettings(newSettings);
      setSettings(newSettings);
    }
    setEmployeeToDelete(null);
  };

  const handleSetDefault = (id: string) => {
    const newSettings = { ...settings, defaultEmployeeId: id };
    saveSettings(newSettings);
    setSettings(newSettings);
  };

  // Filtered employees
  const filtered = employees.filter(emp =>
    emp.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    emp.employeeNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
    emp.department.toLowerCase().includes(searchQuery.toLowerCase()) ||
    emp.designation.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6 pb-16">
      {/* Header Bar */}
      <div className="rounded-2xl bg-white p-5 sm:p-6 shadow-xs border border-slate-200">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
                Employee Profiles
              </h1>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                {employees.length} Saved
              </span>
            </div>
            <p className="text-xs sm:text-sm text-slate-500 mt-1">
              Store employee particulars so you never have to retype names, designations, and departments on monthly claims.
            </p>
          </div>

          <button
            onClick={openCreateModal}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-xs transition shrink-0"
          >
            <UserPlus className="w-4 h-4" />
            <span>Add New Employee</span>
          </button>
        </div>

        {/* Search Bar */}
        <div className="mt-5 relative">
          <Search className="pointer-events-none absolute left-3.5 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search by name, employee number, department..."
            className="w-full rounded-xl border border-slate-300 bg-white py-2 pl-10 pr-4 text-xs text-slate-800 placeholder:text-slate-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
          />
        </div>
      </div>

      {/* Employees Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map(emp => {
          const isDefault = settings.defaultEmployeeId === emp.id;
          return (
            <div
              key={emp.id}
              className={`relative rounded-2xl bg-white p-5 shadow-xs border transition hover:shadow-md ${
                isDefault ? 'border-indigo-500 ring-1 ring-indigo-500/20' : 'border-slate-200'
              }`}
            >
              {isDefault && (
                <div className="absolute top-3 right-3 flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 text-[10px] font-bold border border-indigo-200">
                  <Star className="w-3 h-3 fill-indigo-600" />
                  <span>Default Profile</span>
                </div>
              )}

              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-700 font-bold text-sm">
                  {emp.name.slice(0, 2).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0 pr-12">
                  <h3 className="font-bold text-slate-900 text-sm truncate">
                    {emp.name}
                  </h3>
                  <div className="flex items-center gap-1.5 text-xs text-slate-500 mt-0.5">
                    <Hash className="w-3 h-3 text-slate-400" />
                    <span className="font-mono">{emp.employeeNumber}</span>
                  </div>
                </div>
              </div>

              {/* Details List */}
              <div className="mt-4 pt-3 border-t border-slate-100 space-y-2 text-xs text-slate-600">
                <div className="flex items-center gap-2">
                  <Briefcase className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span className="truncate">{emp.designation || 'Staff'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span className="truncate">{emp.department}</span>
                </div>
                <div className="text-[11px] text-slate-400">
                  Branch: <span className="text-slate-600">{emp.branch}</span>
                </div>
                {(emp.hourlyRate || emp.daysPay) && (
                  <div className="pt-1.5 flex items-center justify-between text-[11px] font-mono text-indigo-700 bg-indigo-50/50 px-2 py-1 rounded-lg">
                    <span>{emp.hourlyRate ? `Rate: Rs. ${Number(emp.hourlyRate).toFixed(2)}/h` : ''}</span>
                    <span>{emp.daysPay ? `Day: Rs. ${Number(emp.daysPay).toFixed(2)}` : ''}</span>
                  </div>
                )}
              </div>

              {/* Card Actions */}
              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                {!isDefault ? (
                  <button
                    onClick={() => handleSetDefault(emp.id)}
                    className="text-[11px] font-semibold text-slate-500 hover:text-indigo-600 transition"
                  >
                    Set as Default
                  </button>
                ) : (
                  <span className="text-[11px] font-medium text-emerald-600 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" />
                    <span>Auto-selected on new claim</span>
                  </span>
                )}

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => openEditModal(emp)}
                    className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-slate-50 rounded-lg transition"
                    title="Edit profile"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setEmployeeToDelete(emp)}
                    className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                    title="Delete profile"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <div className="p-12 text-center bg-white rounded-2xl border border-slate-200">
          <Users className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <h3 className="text-sm font-bold text-slate-700">No employee profiles found</h3>
          <p className="text-xs text-slate-500 mt-1">
            {searchQuery ? 'Try a different search term' : 'Add your first employee to get started'}
          </p>
        </div>
      )}

      {/* Add / Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-slate-200">
            <button
              onClick={() => setIsModalOpen(false)}
              className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-slate-700 rounded-lg"
            >
              <X className="w-5 h-5" />
            </button>

            <h2 className="text-lg font-bold text-slate-900">
              {editingEmployee ? 'Edit Employee Profile' : 'Add New Employee'}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              These details will automatically populate on your monthly overtime claims.
            </p>

            <form onSubmit={handleSave} className="mt-5 space-y-3.5 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Full Name *
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="e.g. Dasun Ramasingha"
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Employee Number / Staff ID
                </label>
                <input
                  type="text"
                  value={employeeNumber}
                  onChange={e => setEmployeeNumber(e.target.value)}
                  placeholder="e.g. EMP-4892"
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-slate-800 font-mono focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Designation / Role
                </label>
                <input
                  type="text"
                  value={designation}
                  onChange={e => setDesignation(e.target.value)}
                  placeholder="e.g. Senior Technical Officer"
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block font-bold text-slate-700">Department</label>
                  <span className="text-[10px] text-indigo-600 font-semibold">Custom Text</span>
                </div>
                <input
                  type="text"
                  list="emp-department-suggestions"
                  value={department}
                  onChange={e => setDepartment(e.target.value)}
                  placeholder="e.g. IT Operations & Infrastructure"
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                />
                <datalist id="emp-department-suggestions">
                  <option value="IT Operations & Infrastructure" />
                  <option value="Corporate Banking Division" />
                  <option value="Credit & Risk Management" />
                  <option value="Treasury & Foreign Exchange" />
                  <option value="Retail Banking & Branches" />
                  <option value="Finance & Accounts" />
                  <option value="Human Resources Division" />
                </datalist>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block font-bold text-slate-700">Branch / Location</label>
                  <span className="text-[10px] text-indigo-600 font-semibold">Custom Text</span>
                </div>
                <input
                  type="text"
                  list="emp-branch-suggestions"
                  value={branch}
                  onChange={e => setBranch(e.target.value)}
                  placeholder="e.g. BOC Colombo Main Branch"
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                />
                <datalist id="emp-branch-suggestions">
                  <option value="BOC Colombo Main Branch" />
                  <option value="Corporate Branch" />
                  <option value="Head Office - Colombo" />
                  <option value="Kandy Super Grade Branch" />
                  <option value="Galle Fort Branch" />
                  <option value="Kurunegala City Branch" />
                </datalist>
              </div>

              {/* Overtime Rates Form 10756 Remuneration */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl space-y-2">
                <div className="flex items-center gap-1.5 font-bold text-slate-800 text-[11px]">
                  <Banknote className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Default Overtime Rates (Form 10756 Remuneration)</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <div>
                    <label className="block font-semibold text-slate-600 text-[10px] mb-1">
                      Remuneration (Rs.)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={totalRemuneration}
                      onChange={e => {
                        const val = e.target.value === '' ? '' : parseFloat(e.target.value);
                        setTotalRemuneration(val);
                        if (typeof val === 'number' && val > 0) {
                          setHourlyRate(parseFloat((val / 176).toFixed(2)));
                          setDaysPay(parseFloat((val / 22).toFixed(2)));
                        }
                      }}
                      placeholder="85000.00"
                      className="w-full rounded-lg border border-slate-300 px-2 py-1.5 font-mono text-xs bg-white"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-600 text-[10px] mb-1">
                      Hourly Rate (Rs.)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={hourlyRate}
                      onChange={e => setHourlyRate(e.target.value === '' ? '' : parseFloat(e.target.value))}
                      placeholder="482.95"
                      className="w-full rounded-lg border border-indigo-300 bg-indigo-50/30 px-2 py-1.5 font-mono font-bold text-xs"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-600 text-[10px] mb-1">
                      Day&apos;s Pay (Rs.)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={daysPay}
                      onChange={e => setDaysPay(e.target.value === '' ? '' : parseFloat(e.target.value))}
                      placeholder="3863.64"
                      className="w-full rounded-lg border border-slate-300 px-2 py-1.5 font-mono text-xs bg-white"
                    />
                  </div>
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-slate-200 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 font-semibold hover:bg-slate-50 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold shadow-xs transition"
                >
                  {editingEmployee ? 'Save Changes' : 'Create Profile'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirmation Modal for Employee Deletion */}
      <ConfirmationModal
        isOpen={!!employeeToDelete}
        onClose={() => setEmployeeToDelete(null)}
        onConfirm={confirmDeleteEmployee}
        title="Delete Employee Profile"
        message={`Are you sure you want to permanently delete the profile for "${employeeToDelete?.name}"?`}
        confirmText="Delete Profile"
        cancelText="Keep Profile"
        variant="danger"
        details={employeeToDelete ? [
          { label: 'Name', value: employeeToDelete.name },
          { label: 'Employee ID', value: employeeToDelete.employeeNumber },
          { label: 'Designation', value: employeeToDelete.designation || '-' },
        ] : []}
      />

      {/* Confirmation Modal for Employee Add / Edit */}
      <ConfirmationModal
        isOpen={isConfirmSaveModalOpen}
        onClose={() => setIsConfirmSaveModalOpen(false)}
        onConfirm={confirmCommitSaveEmployee}
        title={editingEmployee ? 'Save Employee Profile Changes' : 'Create New Employee Profile'}
        message={
          editingEmployee
            ? `Are you sure you want to save changes to the profile for "${name}"?`
            : `Are you sure you want to create a new profile for "${name}"?`
        }
        confirmText={editingEmployee ? 'Save Changes' : 'Create Profile'}
        cancelText="Review Particulars"
        variant="info"
        details={[
          { label: 'Employee Name', value: name },
          { label: 'Designation', value: designation || 'Not specified' },
          { label: 'Department', value: department },
          { label: 'Branch', value: branch },
          ...(hourlyRate !== '' ? [{ label: 'Hourly OT Rate', value: `Rs. ${hourlyRate}` }] : []),
        ]}
      />
    </div>
  );
};
