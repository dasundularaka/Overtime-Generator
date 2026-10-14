import React, { useState, useEffect, useRef } from 'react';
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
  ChevronDown,
  Sparkles,
  Building2,
  Briefcase,
} from 'lucide-react';
import { PWAInstallButton } from './PWAInstallButton';
import { useAuth } from '../context/AuthContext';
import { ConfirmationModal } from './ConfirmationModal';

export type NavigationTab =
  | 'dashboard'
  | 'new-claim'
  | 'calendar'
  | 'users'
  | 'branches'
  | 'roles'
  | 'employees'
  | 'history'
  | 'designer'
  | 'settings'
  | 'audit';

interface NavbarProps {
  activeTab: NavigationTab;
  onSelectTab: (tab: NavigationTab) => void;
  onOpenHelp?: () => void;
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

  // Desktop Dropdown State
  const [isAdminDropdownOpen, setIsAdminDropdownOpen] = useState(false);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const adminDropdownRef = useRef<HTMLDivElement>(null);
  const profileDropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdowns on outside click or escape
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (adminDropdownRef.current && !adminDropdownRef.current.contains(event.target as Node)) {
        setIsAdminDropdownOpen(false);
      }
      if (profileDropdownRef.current && !profileDropdownRef.current.contains(event.target as Node)) {
        setIsProfileMenuOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsAdminDropdownOpen(false);
        setIsProfileMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

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

  // Primary desktop navigation links (everyday workflows)
  const primaryNavItems = [
    { id: 'dashboard' as NavigationTab, label: 'Dashboard', icon: Clock },
    { id: 'new-claim' as NavigationTab, label: 'New Claim', icon: FileText },
    { id: 'history' as NavigationTab, label: 'Claim History', icon: History },
    { id: 'calendar' as NavigationTab, label: 'Calendar', icon: Calendar },
  ];

  // Administrative tools grouped into a dropdown (Admin Exclusive)
  const adminMenuItems = [
    {
      id: 'users' as NavigationTab,
      label: 'User Management',
      description: 'Staff accounts, PF numbers, roles & daily limits',
      icon: UserCheck,
      badge: 'Users',
      color: 'text-purple-400 bg-purple-500/10 border-purple-500/30',
    },
    {
      id: 'employees' as NavigationTab,
      label: 'Employee Directory',
      description: 'Master staff database, rates & assigned limits',
      icon: Users,
      badge: 'Staff',
      color: 'text-blue-400 bg-blue-500/10 border-blue-500/30',
    },
    {
      id: 'branches' as NavigationTab,
      label: 'Branch Network',
      description: 'Corporate bank branches, branch codes & contacts',
      icon: Building2,
      badge: 'Branches',
      color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
    },
    {
      id: 'roles' as NavigationTab,
      label: 'Roles & Rates',
      description: 'Designations, departments, claim types (OT/OP) & rates',
      icon: Briefcase,
      badge: 'OT Rates',
      color: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
    },
    {
      id: 'designer' as NavigationTab,
      label: 'Template Designer',
      description: 'Official Form 10756 A4 canvas layout engine',
      icon: Sliders,
      badge: 'Canvas',
      color: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/30',
    },
    {
      id: 'audit' as NavigationTab,
      label: 'Audit Logs',
      description: 'Administrative modification trail & security events',
      icon: ShieldCheck,
      badge: 'Security',
      color: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/30',
    },
    {
      id: 'settings' as NavigationTab,
      label: 'System Settings',
      description: 'Default template, print offsets & view options',
      icon: Settings,
      badge: 'Config',
      color: 'text-slate-400 bg-slate-500/10 border-slate-500/30',
    },
  ];

  // Operations dropdown items (Standard Non-Admin Users)
  const userMenuItems = [
    {
      id: 'employees' as NavigationTab,
      label: 'Employee Directory',
      description: 'Staff directory & branch overtime limits',
      icon: Users,
      badge: 'Staff',
      color: 'text-blue-400 bg-blue-500/10 border-blue-500/30',
    },
    {
      id: 'settings' as NavigationTab,
      label: 'Settings & Offsets',
      description: 'Printer margins, calendar preferences & view options',
      icon: Settings,
      badge: 'Config',
      color: 'text-slate-400 bg-slate-500/10 border-slate-500/30',
    },
  ];

  const dropdownItems = isAdmin ? adminMenuItems : userMenuItems;
  const isDropdownActive = dropdownItems.some(i => i.id === activeTab);
  const currentDropdownItem = dropdownItems.find(i => i.id === activeTab);
  const isMoreTabActive = isDropdownActive;

  return (
    <header className="sticky top-0 z-40 bg-slate-900 text-white shadow-md border-b border-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo & Branding */}
          <div
            className="flex items-center gap-3 cursor-pointer group shrink-0"
            onClick={() => {
              setIsAdminDropdownOpen(false);
              setIsProfileMenuOpen(false);
              onSelectTab('dashboard');
            }}
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
              <p className="text-xs text-slate-400 hidden xl:block">
                Official A4 Claim &amp; Overtime Management
              </p>
            </div>
          </div>

          {/* Desktop Navigation Links (>= md) */}
          <nav className="hidden md:flex items-center space-x-1 lg:space-x-1.5">
            {primaryNavItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setIsAdminDropdownOpen(false);
                    setIsProfileMenuOpen(false);
                    onSelectTab(item.id);
                  }}
                  className={`flex items-center gap-1.5 px-2.5 lg:px-3 py-2 rounded-xl text-xs lg:text-sm font-semibold transition-all cursor-pointer ${
                    isActive
                      ? 'bg-indigo-600 text-white shadow-xs ring-1 ring-indigo-400/30'
                      : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span>{item.label}</span>
                </button>
              );
            })}

            {/* Operations / Administration Dropdown */}
            <div className="relative" ref={adminDropdownRef}>
              <button
                onClick={() => {
                  setIsProfileMenuOpen(false);
                  setIsAdminDropdownOpen(!isAdminDropdownOpen);
                }}
                className={`flex items-center gap-1.5 px-2.5 lg:px-3 py-2 rounded-xl text-xs lg:text-sm font-semibold transition-all cursor-pointer ${
                  isDropdownActive
                    ? isAdmin
                      ? 'bg-purple-900/50 text-purple-200 border border-purple-500/50 shadow-xs ring-1 ring-purple-500/30'
                      : 'bg-indigo-600 text-white shadow-xs ring-1 ring-indigo-400/30'
                    : isAdminDropdownOpen
                    ? 'bg-slate-800 text-white border border-slate-700'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
              >
                {isAdmin ? (
                  <ShieldCheck className="w-4 h-4 text-purple-400 shrink-0" />
                ) : (
                  <Sliders className="w-4 h-4 text-indigo-400 shrink-0" />
                )}
                <span>{isAdmin ? 'Administration' : 'More Tools'}</span>
                {currentDropdownItem && (
                  <span
                    className={`text-[10px] font-bold px-1.5 py-0.2 rounded-md hidden xl:inline-block ${
                      isAdmin
                        ? 'bg-purple-500/30 text-purple-200 border border-purple-500/40'
                        : 'bg-indigo-500/30 text-white border border-indigo-400/30'
                    }`}
                  >
                    {currentDropdownItem.badge}
                  </span>
                )}
                <ChevronDown
                  className={`w-3.5 h-3.5 transition-transform duration-200 ${
                    isAdminDropdownOpen ? 'rotate-180 text-white' : 'text-slate-400'
                  }`}
                />
              </button>

              {/* Dropdown Popover */}
              {isAdminDropdownOpen && (
                <div
                  className={`absolute left-0 mt-2 ${
                    isAdmin ? 'w-80' : 'w-72'
                  } rounded-2xl bg-slate-900 border border-slate-700 shadow-2xl py-2 z-50 animate-scale-in`}
                >
                  <div className="px-3.5 py-2 border-b border-slate-800/80 flex items-center justify-between">
                    <span className="text-[11px] font-extrabold uppercase tracking-wider text-purple-300">
                      {isAdmin ? 'Admin & System Controls' : 'Additional Tools'}
                    </span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30 font-bold">
                      {dropdownItems.length} Sections
                    </span>
                  </div>

                  <div className="p-1.5 space-y-1 max-h-[calc(100vh-140px)] overflow-y-auto">
                    {dropdownItems.map((item) => {
                      const Icon = item.icon;
                      const isSelected = activeTab === item.id;
                      return (
                        <button
                          key={item.id}
                          onClick={() => {
                            setIsAdminDropdownOpen(false);
                            onSelectTab(item.id);
                          }}
                          className={`w-full flex items-start gap-3 p-2.5 rounded-xl transition text-left cursor-pointer group ${
                            isSelected
                              ? 'bg-purple-950/60 border border-purple-500/50 text-white shadow-xs'
                              : 'hover:bg-slate-800/90 text-slate-300 hover:text-white'
                          }`}
                        >
                          <div
                            className={`p-2 rounded-lg shrink-0 border transition ${item.color} ${
                              isSelected ? 'ring-1 ring-purple-400' : 'group-hover:scale-105'
                            }`}
                          >
                            <Icon className="w-4 h-4" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-xs truncate">{item.label}</span>
                              <span className="text-[9px] font-bold px-1.5 py-0.2 rounded-md bg-slate-800 text-slate-400 border border-slate-700">
                                {item.badge}
                              </span>
                            </div>
                            <p className="text-[10px] text-slate-400 line-clamp-1 mt-0.5">
                              {item.description}
                            </p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </nav>

          {/* Header Action Tools & User Profile */}
          <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
            {/* User Profile Capsule & Dropdown */}
            {userProfile && (
              <div className="relative" ref={profileDropdownRef}>
                <button
                  onClick={() => {
                    setIsAdminDropdownOpen(false);
                    setIsProfileMenuOpen(!isProfileMenuOpen);
                  }}
                  className={`flex items-center gap-2 bg-slate-800/90 border px-2 sm:px-2.5 py-1.5 rounded-xl transition cursor-pointer ${
                    isProfileMenuOpen
                      ? 'border-indigo-500 bg-slate-800 ring-1 ring-indigo-500/30'
                      : 'border-slate-700/80 hover:bg-slate-800 hover:border-slate-600'
                  }`}
                  title="View Profile & Account"
                >
                  {userProfile.photoURL ? (
                    <img
                      src={userProfile.photoURL}
                      alt={userProfile.name}
                      className="h-7 w-7 rounded-lg object-cover border border-slate-600 shrink-0"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-600 font-bold text-white text-[11px] shrink-0">
                      {userProfile.name?.slice(0, 2).toUpperCase() || 'U'}
                    </div>
                  )}
                  <div className="text-left hidden sm:block">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold text-slate-200 truncate max-w-[80px] lg:max-w-[120px]">
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
                    <div className="text-[10px] text-slate-400 font-mono">
                      Cap: {userProfile.maxOtHoursPerDay !== undefined ? `${userProfile.maxOtHoursPerDay}h` : '2h'} &bull; {userProfile.claimType || 'OT'}
                    </div>
                  </div>
                  <ChevronDown
                    className={`w-3.5 h-3.5 text-slate-400 transition-transform hidden sm:block ${
                      isProfileMenuOpen ? 'rotate-180 text-white' : ''
                    }`}
                  />
                </button>

                {/* Profile Details Dropdown Popover */}
                {isProfileMenuOpen && (
                  <div className="absolute right-0 mt-2 w-80 rounded-2xl bg-slate-900 border border-slate-700 shadow-2xl py-3 z-50 animate-scale-in">
                    {/* User Info Header */}
                    <div className="px-4 pb-3 border-b border-slate-800">
                      <div className="flex items-center gap-3">
                        {userProfile.photoURL ? (
                          <img
                            src={userProfile.photoURL}
                            alt={userProfile.name}
                            className="h-10 w-10 rounded-xl object-cover border border-slate-600 shrink-0"
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 font-bold text-white text-sm shrink-0">
                            {userProfile.name?.slice(0, 2).toUpperCase() || 'U'}
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <h4 className="font-bold text-sm text-white truncate">{userProfile.name}</h4>
                          <p className="text-xs text-slate-400 truncate">{userProfile.email}</p>
                          <div className="flex items-center gap-1.5 mt-1">
                            <span className="font-mono text-[10px] font-bold text-indigo-400 bg-indigo-500/10 px-1.5 py-0.2 rounded border border-indigo-500/20">
                              {userProfile.employeeNumber || userProfile.pfNumber}
                            </span>
                            <span className="text-[10px] font-bold uppercase text-purple-300 bg-purple-500/20 px-1.5 py-0.2 rounded border border-purple-500/30">
                              {isAdmin ? 'Administrator' : 'Standard User'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Profile Specifics Matrix */}
                    <div className="px-4 py-2.5 text-xs border-b border-slate-800 space-y-1.5 text-slate-300">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-slate-400">Branch:</span>
                        <span className="font-semibold text-slate-200 truncate max-w-[170px] text-right">{userProfile.branch}</span>
                      </div>
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-slate-400">Designation:</span>
                        <span className="font-semibold text-slate-200 truncate max-w-[170px] text-right">{userProfile.designation || 'Staff'}</span>
                      </div>
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-slate-400">Department:</span>
                        <span className="font-semibold text-slate-200 truncate max-w-[170px] text-right">{userProfile.department}</span>
                      </div>
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-slate-400">Daily Cap &amp; Claim:</span>
                        <span className="font-semibold text-emerald-400">
                          {userProfile.maxOtHoursPerDay !== undefined ? `${userProfile.maxOtHoursPerDay} hrs max` : '2.0 hrs max'} &bull; {userProfile.claimType || 'OT'} Sheet
                        </span>
                      </div>
                    </div>

                    {/* Action Shortcuts */}
                    <div className="p-2 space-y-1 text-xs">
                      <button
                        onClick={() => {
                          setIsProfileMenuOpen(false);
                          onSelectTab('settings');
                        }}
                        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-slate-300 hover:text-white hover:bg-slate-800 transition text-left cursor-pointer"
                      >
                        <Settings className="w-4 h-4 text-slate-400" />
                        <span>Preferences &amp; Printer Offsets</span>
                      </button>

                      <button
                        onClick={() => {
                          setIsProfileMenuOpen(false);
                          setIsLogoutConfirmOpen(true);
                        }}
                        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-rose-300 hover:text-rose-200 hover:bg-rose-950/40 border border-transparent hover:border-rose-900/50 transition text-left cursor-pointer"
                      >
                        <LogOut className="w-4 h-4 text-rose-400" />
                        <span>Sign Out</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* PWA Install Button */}
            <PWAInstallButton />

            {/* Direct Logout Button */}
            <button
              onClick={() => setIsLogoutConfirmOpen(true)}
              className="p-2 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded-xl transition cursor-pointer"
              title="Sign Out"
            >
              <LogOut className="w-4 h-4" />
            </button>
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
              <div className="flex items-center gap-2.5">
                {userProfile?.photoURL ? (
                  <img
                    src={userProfile.photoURL}
                    alt={userProfile.name}
                    className="w-8 h-8 rounded-xl object-cover border border-slate-600 shrink-0"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="p-1.5 rounded-lg bg-indigo-500/20 text-indigo-400">
                    <ShieldCheck className="w-4 h-4" />
                  </div>
                )}
                <div>
                  <h3 className="font-bold text-sm text-white">Application Sections</h3>
                  <p className="text-[10px] text-slate-400">
                    Logged in as {userProfile?.name} ({userProfile?.employeeNumber || userProfile?.pfNumber})
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
                      onSelectTab('branches');
                      setIsMobileMenuOpen(false);
                    }}
                    className={`flex items-center gap-2.5 p-3 rounded-2xl border text-left transition cursor-pointer ${
                      activeTab === 'branches'
                        ? 'bg-emerald-900/40 border-emerald-500 text-emerald-200 font-bold'
                        : 'bg-slate-800/80 border-slate-700/80 text-slate-200 hover:bg-slate-700'
                    }`}
                  >
                    <Building2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <div>
                      <span className="block font-bold">Branches</span>
                      <span className="text-[10px] text-slate-400">Branch Network</span>
                    </div>
                  </button>

                  <button
                    onClick={() => {
                      onSelectTab('roles');
                      setIsMobileMenuOpen(false);
                    }}
                    className={`flex items-center gap-2.5 p-3 rounded-2xl border text-left transition cursor-pointer ${
                      activeTab === 'roles'
                        ? 'bg-amber-900/40 border-amber-500 text-amber-200 font-bold'
                        : 'bg-slate-800/80 border-slate-700/80 text-slate-200 hover:bg-slate-700'
                    }`}
                  >
                    <Briefcase className="w-4 h-4 text-amber-400 shrink-0" />
                    <div>
                      <span className="block font-bold">Roles &amp; Rates</span>
                      <span className="text-[10px] text-slate-400">Overtime Rates</span>
                    </div>
                  </button>

                  <button
                    onClick={() => {
                      onSelectTab('audit');
                      setIsMobileMenuOpen(false);
                    }}
                    className={`flex items-center gap-2.5 p-3 rounded-2xl border text-left transition cursor-pointer ${
                      activeTab === 'audit'
                        ? 'bg-blue-900/40 border-blue-500 text-blue-200 font-bold'
                        : 'bg-slate-800/80 border-slate-700/80 text-slate-200 hover:bg-slate-700'
                    }`}
                  >
                    <ShieldCheck className="w-4 h-4 text-blue-400 shrink-0" />
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
