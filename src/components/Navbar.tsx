import React, { useState } from 'react';
import {
  FileText,
  Clock,
  Users,
  History,
  Sliders,
  Settings,
  PlusCircle,
  HelpCircle,
  UserCheck,
  LogOut,
  Shield,
  User,
  Calendar,
  ShieldCheck,
  Menu,
  X,
  ChevronRight,
  Sparkles,
} from 'lucide-react';
import { PWAInstallButton } from './PWAInstallButton';
import { useAuth } from '../context/AuthContext';
import { ConfirmationModal } from './ConfirmationModal';

export type NavigationTab =
  | 'dashboard'
  | 'new-claim'
  | 'calendar'
  | 'users'
  | 'employees'
  | 'history'
  | 'designer'
  | 'settings'
  | 'audit';

interface NavbarProps {
  activeTab: NavigationTab;
  onSelectTab: (tab: NavigationTab) => void;
  onOpenHelp: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  onSelectTab,
  onOpenHelp,
}) => {
  const { userProfile, isAdmin, logout, currentUser } = useAuth();
  const [isLogoutConfirmOpen, setIsLogoutConfirmOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const handleConfirmLogout = async () => {
    setIsLoggingOut(true);
    try {
      await logout();
      setIsLogoutConfirmOpen(false);
      setIsMobileMenuOpen(false);
    } finally {
      setIsLoggingOut(false);
    }
  };

  const navItems = [
    { id: 'dashboard' as NavigationTab, label: 'Dashboard', icon: Clock },
    { id: 'new-claim' as NavigationTab, label: 'New Claim', icon: FileText },
    { id: 'calendar' as NavigationTab, label: 'Calendar', icon: Calendar },
    { id: 'history' as NavigationTab, label: 'Claim History', icon: History },
    { id: 'employees' as NavigationTab, label: 'Employees', icon: Users },
    ...(isAdmin
      ? [
          { id: 'users' as NavigationTab, label: 'User Admin', icon: UserCheck, badge: 'Limits' },
          { id: 'audit' as NavigationTab, label: 'Audit Logs', icon: ShieldCheck, badge: 'Trace' },
          {
            id: 'designer' as NavigationTab,
            label: 'Template Designer',
            icon: Sliders,
            badge: 'Admin',
          },
        ]
      : []),
    { id: 'settings' as NavigationTab, label: 'Settings', icon: Settings },
  ];

  const isMoreTabActive = ['users', 'audit', 'designer', 'settings', 'employees'].includes(activeTab);

  return (
    <header className="sticky top-0 z-40 bg-slate-900 text-white shadow-md border-b border-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo & Branding */}
          <div
            className="flex items-center gap-3 cursor-pointer group"
            onClick={() => onSelectTab('dashboard')}
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-blue-600 shadow-md group-hover:scale-105 transition-transform">
              <Clock className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-base sm:text-lg tracking-tight text-white">
                  Overtime Claim Manager
                </span>
              </div>
              <p className="text-xs text-slate-400 hidden sm:block">
                Official A4 Claim &amp; Overtime Management
              </p>
            </div>
          </div>

          {/* Desktop Navigation Links (>= md) */}
          <nav className="hidden md:flex items-center space-x-1 lg:space-x-1.5">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => onSelectTab(item.id)}
                  className={`flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-xs lg:text-sm font-medium transition-all ${
                    isActive
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{item.label}</span>
                  {item.badge && (
                    <span className="ml-1 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.2 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          {/* Header Action Tools & User Profile */}
          <div className="flex items-center gap-1.5 sm:gap-3">
            {/* User Profile Capsule */}
            {userProfile && (
              <div className="flex items-center gap-2 bg-slate-800/90 border border-slate-700/80 px-2 sm:px-2.5 py-1 rounded-xl">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-600 font-bold text-white text-[11px] shrink-0">
                  {userProfile.name?.slice(0, 2).toUpperCase() || 'U'}
                </div>
                <div className="text-left">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold text-slate-200 truncate max-w-[80px] sm:max-w-[120px]">
                      {userProfile.employeeNumber || userProfile.pfNumber || userProfile.name}
                    </span>
                    <span
                      className={`text-[9px] font-extrabold uppercase px-1.5 py-0.2 rounded ${
                        isAdmin
                          ? 'bg-purple-500/30 text-purple-300 border border-purple-500/40'
                          : 'bg-blue-500/30 text-blue-300 border border-blue-500/40'
                      }`}
                    >
                      {isAdmin ? 'Admin' : 'User'}
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-400 font-mono hidden sm:block">
                    Cap: {userProfile.maxOtHoursPerDay !== undefined ? `${userProfile.maxOtHoursPerDay}h` : '2h'} &bull; {userProfile.claimType || 'OT'}
                  </div>
                </div>
              </div>
            )}

            {/* Quick Help button */}
            <button
              onClick={onOpenHelp}
              className="p-2 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition cursor-pointer"
              title="Shift & Overtime Rules"
            >
              <HelpCircle className="w-4 h-4" />
            </button>

            {/* PWA Install Button */}
            <PWAInstallButton />

            {/* Logout Button */}
            <button
              onClick={() => setIsLogoutConfirmOpen(true)}
              className="p-2 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded-lg transition cursor-pointer"
              title="Sign Out"
            >
              <LogOut className="w-4 h-4" />
            </button>

            {/* Quick New Claim CTA (Desktop) */}
            {activeTab !== 'new-claim' && (
              <button
                onClick={() => onSelectTab('new-claim')}
                className="hidden sm:inline-flex items-center gap-1.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white px-3 py-1.5 rounded-lg text-xs font-semibold shadow-sm transition cursor-pointer"
              >
                <PlusCircle className="w-3.5 h-3.5" />
                <span>New Claim</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Modern Bottom-Docked Mobile Tab Bar (100% Thumb Accessible) */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-slate-900/95 backdrop-blur-md border-t border-slate-800 shadow-2xl px-3 py-2 flex items-center justify-between safe-bottom">
        {/* 1. Dashboard */}
        <button
          onClick={() => {
            setIsMobileMenuOpen(false);
            onSelectTab('dashboard');
          }}
          className={`flex flex-col items-center justify-center flex-1 py-1 transition cursor-pointer ${
            activeTab === 'dashboard' ? 'text-indigo-400 font-bold' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Clock className={`w-5 h-5 ${activeTab === 'dashboard' ? 'stroke-[2.5]' : 'stroke-2'}`} />
          <span className="text-[10px] mt-1 font-medium">Dashboard</span>
        </button>

        {/* 2. History */}
        <button
          onClick={() => {
            setIsMobileMenuOpen(false);
            onSelectTab('history');
          }}
          className={`flex flex-col items-center justify-center flex-1 py-1 transition cursor-pointer ${
            activeTab === 'history' ? 'text-indigo-400 font-bold' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <History className={`w-5 h-5 ${activeTab === 'history' ? 'stroke-[2.5]' : 'stroke-2'}`} />
          <span className="text-[10px] mt-1 font-medium">History</span>
        </button>

        {/* 3. New Claim (Elevated Thumb Center Button) */}
        <button
          onClick={() => {
            setIsMobileMenuOpen(false);
            onSelectTab('new-claim');
          }}
          className="flex flex-col items-center justify-center -mt-6 flex-1 relative group cursor-pointer"
        >
          <div
            className={`flex h-13 w-13 items-center justify-center rounded-full shadow-xl transition-transform active:scale-90 ${
              activeTab === 'new-claim'
                ? 'bg-gradient-to-tr from-indigo-500 via-indigo-600 to-blue-500 text-white ring-4 ring-slate-900'
                : 'bg-indigo-600 hover:bg-indigo-500 text-white ring-2 ring-slate-800'
            }`}
          >
            <PlusCircle className="w-7 h-7" />
          </div>
          <span
            className={`text-[10px] font-bold mt-1 tracking-tight ${
              activeTab === 'new-claim' ? 'text-indigo-400 font-extrabold' : 'text-slate-300'
            }`}
          >
            New Claim
          </span>
        </button>

        {/* 4. Calendar */}
        <button
          onClick={() => {
            setIsMobileMenuOpen(false);
            onSelectTab('calendar');
          }}
          className={`flex flex-col items-center justify-center flex-1 py-1 transition cursor-pointer ${
            activeTab === 'calendar' ? 'text-indigo-400 font-bold' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Calendar className={`w-5 h-5 ${activeTab === 'calendar' ? 'stroke-[2.5]' : 'stroke-2'}`} />
          <span className="text-[10px] mt-1 font-medium">Calendar</span>
        </button>

        {/* 5. More / Admin Hub Sheet Toggle */}
        <button
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          className={`flex flex-col items-center justify-center flex-1 py-1 transition cursor-pointer ${
            isMoreTabActive || isMobileMenuOpen
              ? 'text-indigo-400 font-bold'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          {isAdmin ? (
            <div className="relative">
              <ShieldCheck className={`w-5 h-5 ${isMoreTabActive ? 'stroke-[2.5]' : 'stroke-2'}`} />
              <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-purple-500" />
            </div>
          ) : (
            <Settings className={`w-5 h-5 ${activeTab === 'settings' ? 'stroke-[2.5]' : 'stroke-2'}`} />
          )}
          <span className="text-[10px] mt-1 font-medium">
            {isAdmin ? 'Admin' : 'Settings'}
          </span>
        </button>
      </nav>

      {/* Mobile Bottom-Docked Hub Drawer (Opens with One Thumb) */}
      {isMobileMenuOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex flex-col justify-end bg-slate-950/70 backdrop-blur-xs animate-fade-in">
          <div
            className="fixed inset-0"
            onClick={() => setIsMobileMenuOpen(false)}
          />
          <div className="relative bg-slate-900 border-t border-slate-700/80 rounded-t-3xl p-5 pb-20 shadow-2xl space-y-3 z-10 animate-slide-up">
            {/* Grab handle */}
            <div className="w-12 h-1.5 bg-slate-700 rounded-full mx-auto mb-2" />

            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-indigo-500/20 text-indigo-400">
                  <ShieldCheck className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-white">Application Sections</h3>
                  <p className="text-[10px] text-slate-400">
                    Logged in as {userProfile?.name} ({userProfile?.employeeNumber})
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsMobileMenuOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Admin Hub Links */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              {isAdmin && (
                <>
                  <button
                    onClick={() => {
                      onSelectTab('users');
                      setIsMobileMenuOpen(false);
                    }}
                    className={`flex items-center gap-2.5 p-3 rounded-2xl border text-left transition cursor-pointer ${
                      activeTab === 'users'
                        ? 'bg-purple-900/40 border-purple-500 text-purple-200 font-bold'
                        : 'bg-slate-800/80 border-slate-700/80 text-slate-200 hover:bg-slate-700'
                    }`}
                  >
                    <UserCheck className="w-4 h-4 text-purple-400 shrink-0" />
                    <div>
                      <span className="block font-bold">User Admin</span>
                      <span className="text-[10px] text-slate-400">OT limits &amp; roles</span>
                    </div>
                  </button>

                  <button
                    onClick={() => {
                      onSelectTab('audit');
                      setIsMobileMenuOpen(false);
                    }}
                    className={`flex items-center gap-2.5 p-3 rounded-2xl border text-left transition cursor-pointer ${
                      activeTab === 'audit'
                        ? 'bg-emerald-900/40 border-emerald-500 text-emerald-200 font-bold'
                        : 'bg-slate-800/80 border-slate-700/80 text-slate-200 hover:bg-slate-700'
                    }`}
                  >
                    <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                    <div>
                      <span className="block font-bold">Audit Logs</span>
                      <span className="text-[10px] text-slate-400">Traceability</span>
                    </div>
                  </button>

                  <button
                    onClick={() => {
                      onSelectTab('designer');
                      setIsMobileMenuOpen(false);
                    }}
                    className={`flex items-center gap-2.5 p-3 rounded-2xl border text-left transition cursor-pointer ${
                      activeTab === 'designer'
                        ? 'bg-indigo-900/40 border-indigo-500 text-indigo-200 font-bold'
                        : 'bg-slate-800/80 border-slate-700/80 text-slate-200 hover:bg-slate-700'
                    }`}
                  >
                    <Sliders className="w-4 h-4 text-indigo-400 shrink-0" />
                    <div>
                      <span className="block font-bold">Designer</span>
                      <span className="text-[10px] text-slate-400">A4 Template Calib</span>
                    </div>
                  </button>
                </>
              )}

              <button
                onClick={() => {
                  onSelectTab('employees');
                  setIsMobileMenuOpen(false);
                }}
                className={`flex items-center gap-2.5 p-3 rounded-2xl border text-left transition cursor-pointer ${
                  activeTab === 'employees'
                    ? 'bg-blue-900/40 border-blue-500 text-blue-200 font-bold'
                    : 'bg-slate-800/80 border-slate-700/80 text-slate-200 hover:bg-slate-700'
                }`}
              >
                <Users className="w-4 h-4 text-blue-400 shrink-0" />
                <div>
                  <span className="block font-bold">Employees</span>
                  <span className="text-[10px] text-slate-400">Profiles &amp; rates</span>
                </div>
              </button>

              <button
                onClick={() => {
                  onSelectTab('settings');
                  setIsMobileMenuOpen(false);
                }}
                className={`flex items-center gap-2.5 p-3 rounded-2xl border text-left transition cursor-pointer ${
                  activeTab === 'settings'
                    ? 'bg-indigo-900/40 border-indigo-500 text-indigo-200 font-bold'
                    : 'bg-slate-800/80 border-slate-700/80 text-slate-200 hover:bg-slate-700'
                }`}
              >
                <Settings className="w-4 h-4 text-slate-300 shrink-0" />
                <div>
                  <span className="block font-bold">Settings</span>
                  <span className="text-[10px] text-slate-400">Format &amp; offsets</span>
                </div>
              </button>

              <button
                onClick={() => {
                  setIsMobileMenuOpen(false);
                  onOpenHelp();
                }}
                className="flex items-center gap-2.5 p-3 rounded-2xl bg-slate-800/80 border border-slate-700/80 text-slate-200 hover:bg-slate-700 text-left transition cursor-pointer"
              >
                <HelpCircle className="w-4 h-4 text-amber-400 shrink-0" />
                <div>
                  <span className="block font-bold">Shift Rules</span>
                  <span className="text-[10px] text-slate-400">Late &amp; OT rules</span>
                </div>
              </button>

              <button
                onClick={() => {
                  setIsMobileMenuOpen(false);
                  setIsLogoutConfirmOpen(true);
                }}
                className="flex items-center gap-2.5 p-3 rounded-2xl bg-rose-950/40 border border-rose-800/50 text-rose-300 hover:bg-rose-900/50 text-left transition cursor-pointer"
              >
                <LogOut className="w-4 h-4 text-rose-400 shrink-0" />
                <div>
                  <span className="block font-bold">Sign Out</span>
                  <span className="text-[10px] text-rose-400/80">End session</span>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Logout Confirmation Modal */}
      <ConfirmationModal
        isOpen={isLogoutConfirmOpen}
        onClose={() => setIsLogoutConfirmOpen(false)}
        onConfirm={handleConfirmLogout}
        title="Sign Out of Account"
        message={`Are you sure you want to log out, ${userProfile?.name || 'User'}? You will need to sign in again to create or view overtime claims.`}
        confirmText="Yes, Sign Out"
        cancelText="Stay Signed In"
        variant="warning"
        isLoading={isLoggingOut}
        details={[
          { label: 'Logged-in Account', value: userProfile?.email || currentUser?.email || 'Current User' },
          { label: 'Role', value: isAdmin ? 'Administrator' : 'Standard User' },
        ]}
      />
    </header>
  );
};
