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
  | 'settings';

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

  const handleConfirmLogout = async () => {
    setIsLoggingOut(true);
    try {
      await logout();
      setIsLogoutConfirmOpen(false);
    } finally {
      setIsLoggingOut(false);
    }
  };

  const navItems = [
    { id: 'dashboard' as NavigationTab, label: 'Dashboard', icon: Clock },
    { id: 'new-claim' as NavigationTab, label: 'New Claim', icon: FileText },
    { id: 'calendar' as NavigationTab, label: 'Calendar', icon: Calendar },
    { id: 'history' as NavigationTab, label: 'Claim History', icon: History },
    ...(isAdmin ? [{ id: 'users' as NavigationTab, label: 'User Admin', icon: UserCheck, badge: 'Limits' }] : []),
    ...(isAdmin
      ? [
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

          {/* Desktop Navigation Links */}
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
          <div className="flex items-center gap-2 sm:gap-3">
            {/* User Profile Capsule */}
            {userProfile && (
              <div className="hidden lg:flex items-center gap-2 bg-slate-800/90 border border-slate-700/80 px-2.5 py-1 rounded-xl">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-600 font-bold text-white text-[11px]">
                  {userProfile.name?.slice(0, 2).toUpperCase() || 'U'}
                </div>
                <div className="text-left">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold text-slate-200 truncate max-w-[100px]">
                      {userProfile.name}
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
                  <div className="text-[10px] text-slate-400 font-mono">
                    Cap: {userProfile.maxOtHoursPerDay !== undefined ? `${userProfile.maxOtHoursPerDay}h` : '2h'} &bull; {userProfile.claimType || 'OT'}
                  </div>
                </div>
              </div>
            )}

            {/* Quick Help button */}
            <button
              onClick={onOpenHelp}
              className="p-2 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition"
              title="Shift & Overtime Rules"
            >
              <HelpCircle className="w-4 h-4" />
            </button>

            {/* PWA Install Button */}
            <PWAInstallButton />

            {/* Logout Button */}
            <button
              onClick={() => setIsLogoutConfirmOpen(true)}
              className="p-2 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded-lg transition"
              title="Sign Out"
            >
              <LogOut className="w-4 h-4" />
            </button>

            {/* Quick New Claim CTA */}
            {activeTab !== 'new-claim' && (
              <button
                onClick={() => onSelectTab('new-claim')}
                className="hidden sm:inline-flex items-center gap-1.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white px-3 py-1.5 rounded-lg text-xs font-semibold shadow-sm transition"
              >
                <PlusCircle className="w-3.5 h-3.5" />
                <span>New Claim</span>
              </button>
            )}
          </div>
        </div>

        {/* Mobile Sub-Navigation Bar */}
        <div className="flex md:hidden overflow-x-auto py-2.5 space-x-1.5 border-t border-slate-800/80 no-scrollbar">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onSelectTab(item.id)}
                className={`flex shrink-0 items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium ${
                  isActive
                    ? 'bg-indigo-600 text-white'
                    : 'text-slate-300 hover:bg-slate-800'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>

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
