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
  MoreHorizontal,
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
import { ClockLogo } from './ClockLogo';

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

interface MobileNavItem {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  isActive: boolean;
  badge?: boolean;
  onClick: () => void;
}

interface MobileCurvedNavBarProps {
  items: MobileNavItem[];
}

const MobileCurvedNavBar: React.FC<MobileCurvedNavBarProps> = ({ items }) => {
  const activeIndex = Math.max(0, items.findIndex((item) => item.isActive));
  const targetX = activeIndex * 100 + 50;
  const [valleyX, setValleyX] = useState(targetX);

  useEffect(() => {
    let animId: number;
    const animate = () => {
      setValleyX((prev) => {
        const diff = targetX - prev;
        if (Math.abs(diff) < 0.4) return targetX;
        return prev + diff * 0.28;
      });
      if (Math.abs(targetX - valleyX) >= 0.4) {
        animId = requestAnimationFrame(animate);
      }
    };
    animId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animId);
  }, [targetX, valleyX]);

  // Compute SVG valley path
  // In viewBox 0 0 500 76, top flat line is at Y=18. Valley dips down smoothly to Y=54.
  // The selected button is elevated to -translate-y-7, creating a clear visible separation (air gap)
  // between the bottom of the floating dark ocean blue circle and the curved valley stroke.
  const cx = valleyX;
  const totalW = 500;
  const totalH = 76;
  const topY = 18;
  const valleyDepth = 54;
  const r = 46;
  const cp1 = 20;
  const cp2 = 22;

  const x0 = Math.max(0, cx - r);
  const x1 = Math.min(totalW, cx + r);

  const fillPath =
    `M 0 ${topY} ` +
    `L ${x0} ${topY} ` +
    `C ${x0 + cp1} ${topY}, ${cx - cp2} ${valleyDepth}, ${cx} ${valleyDepth} ` +
    `C ${cx + cp2} ${valleyDepth}, ${x1 - cp1} ${topY}, ${x1} ${topY} ` +
    `L ${totalW} ${topY} ` +
    `L ${totalW} ${totalH} ` +
    `L 0 ${totalH} Z`;

  const borderPath =
    `M 0 ${topY} ` +
    `L ${x0} ${topY} ` +
    `C ${x0 + cp1} ${topY}, ${cx - cp2} ${valleyDepth}, ${cx} ${valleyDepth} ` +
    `C ${cx + cp2} ${valleyDepth}, ${x1 - cp1} ${topY}, ${x1} ${topY} ` +
    `L ${totalW} ${topY}`;

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 h-16 safe-bottom overflow-visible flex items-center justify-around pointer-events-auto">
      {/* SVG Valley Background that bends away from the selected button, leaving clear open space */}
      <svg
        viewBox="0 0 500 76"
        preserveAspectRatio="none"
        className="absolute bottom-0 left-0 right-0 w-full h-[76px] pointer-events-none drop-shadow-[0_-8px_25px_rgba(0,0,0,0.65)]"
      >
        <path d={fillPath} fill="#0f172a" />
        <path d={borderPath} fill="none" stroke="#475569" strokeWidth="1.5" />
      </svg>

      {items.map((item) => {
        const Icon = item.icon;
        const isSelected = item.isActive;

        return (
          <button
            key={item.id}
            type="button"
            onClick={item.onClick}
            className="flex-1 h-full flex flex-col items-center justify-center relative cursor-pointer group focus:outline-hidden z-10 pt-1"
          >
            <div
              className={`relative flex items-center justify-center transition-all duration-300 ease-out ${
                isSelected
                  ? '-translate-y-7 scale-105 w-12 h-12 rounded-full bg-gradient-to-b from-[#0c4a6e] via-[#083344] to-[#041c2c] text-white shadow-xl shadow-cyan-950/70 border border-cyan-400/50 overflow-hidden'
                  : 'translate-y-0 w-9 h-9 rounded-xl text-slate-400 group-hover:text-slate-200'
              }`}
            >
              {/* Simply shine on dark ocean blue circle */}
              {isSelected && (
                <>
                  {/* Top specular gloss crescent */}
                  <div className="absolute top-1 left-2.5 right-2.5 h-3.5 rounded-full bg-gradient-to-b from-white/45 via-white/10 to-transparent pointer-events-none" />
                  {/* Subtle radial sheen */}
                  <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_50%_25%,rgba(255,255,255,0.22),transparent_65%)] pointer-events-none" />
                  {/* Bottom rim reflection */}
                  <div className="absolute bottom-1 inset-x-3 h-1 rounded-full bg-cyan-400/20 blur-[0.5px] pointer-events-none" />
                </>
              )}

              <Icon
                className={`w-5 h-5 relative z-10 transition-transform ${
                  isSelected ? 'stroke-[2.5] text-cyan-50' : 'stroke-2'
                }`}
              />

              {/* Subtitle notification dot for Admin if not selected */}
              {item.badge && !isSelected && (
                <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-purple-500 ring-2 ring-slate-900" />
              )}
            </div>

            {/* Selected button label is hidden; unselected button displays label */}
            {!isSelected && (
              <span className="text-[10px] mt-1 font-medium text-slate-400 group-hover:text-slate-200 tracking-tight transition-opacity">
                {item.label}
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );
};

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
    { id: 'branches' as NavigationTab, label: 'Branch Network', icon: Building2 },
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
      id: 'branches' as NavigationTab,
      label: 'Branch Network',
      description: 'Corporate bank branches, branch codes, addresses & contacts',
      icon: Building2,
      badge: 'Branches',
      color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
    },
    {
      id: 'settings' as NavigationTab,
      label: 'Privacy & Security',
      description: 'Personal data protection, account security & export',
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
            <div className="flex h-10 w-10 items-center justify-center group-hover:scale-105 transition-transform">
              <ClockLogo className="w-10 h-10" />
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

      {/* Modern Bottom-Docked Mobile Tab Bar with Curved Valley & Dark Ocean Blue Circle */}
      {(() => {
        const mobileNavItems: MobileNavItem[] = [
          {
            id: 'dashboard',
            label: 'Dashboard',
            icon: Clock,
            isActive: activeTab === 'dashboard' && !isMobileMenuOpen,
            onClick: () => {
              setIsMobileMenuOpen(false);
              onSelectTab('dashboard');
            },
          },
          {
            id: 'history',
            label: 'History',
            icon: History,
            isActive: activeTab === 'history' && !isMobileMenuOpen,
            onClick: () => {
              setIsMobileMenuOpen(false);
              onSelectTab('history');
            },
          },
          {
            id: 'new-claim',
            label: 'New Claim',
            icon: PlusCircle,
            isActive: activeTab === 'new-claim' && !isMobileMenuOpen,
            onClick: () => {
              setIsMobileMenuOpen(false);
              onSelectTab('new-claim');
            },
          },
          {
            id: 'calendar',
            label: 'Calendar',
            icon: Calendar,
            isActive: activeTab === 'calendar' && !isMobileMenuOpen,
            onClick: () => {
              setIsMobileMenuOpen(false);
              onSelectTab('calendar');
            },
          },
          {
            id: 'more',
            label: isAdmin ? 'Admin' : 'More',
            icon: isAdmin ? ShieldCheck : MoreHorizontal,
            isActive: isMoreTabActive || isMobileMenuOpen,
            badge: isAdmin,
            onClick: () => {
              setIsMobileMenuOpen(!isMobileMenuOpen);
            },
          },
        ];

        return <MobileCurvedNavBar items={mobileNavItems} />;
      })()}

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

            {/* Application Section Links in Pairs (If an item is not paired, spans full area) */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              {(() => {
                const sectionItems = [
                  ...(isAdmin
                    ? [
                        {
                          id: 'users' as NavigationTab,
                          label: 'User Admin',
                          desc: 'OT limits & roles',
                          icon: UserCheck,
                          color: 'text-purple-400',
                          activeBg: 'bg-purple-900/40 border-purple-500 text-purple-200',
                        },
                        {
                          id: 'roles' as NavigationTab,
                          label: 'Roles & Rates',
                          desc: 'Overtime Rates',
                          icon: Briefcase,
                          color: 'text-amber-400',
                          activeBg: 'bg-amber-900/40 border-amber-500 text-amber-200',
                        },
                        {
                          id: 'audit' as NavigationTab,
                          label: 'Audit Logs',
                          desc: 'Traceability',
                          icon: ShieldCheck,
                          color: 'text-blue-400',
                          activeBg: 'bg-blue-900/40 border-blue-500 text-blue-200',
                        },
                        {
                          id: 'designer' as NavigationTab,
                          label: 'Designer',
                          desc: 'A4 Template Calib',
                          icon: Sliders,
                          color: 'text-indigo-400',
                          activeBg: 'bg-indigo-900/40 border-indigo-500 text-indigo-200',
                        },
                        {
                          id: 'employees' as NavigationTab,
                          label: 'Employees',
                          desc: 'Profiles & rates',
                          icon: Users,
                          color: 'text-blue-400',
                          activeBg: 'bg-blue-900/40 border-blue-500 text-blue-200',
                        },
                      ]
                    : []),
                  {
                    id: 'branches' as NavigationTab,
                    label: 'Branches',
                    desc: 'Branch Network',
                    icon: Building2,
                    color: 'text-emerald-400',
                    activeBg: 'bg-emerald-900/40 border-emerald-500 text-emerald-200',
                  },
                  {
                    id: 'settings' as NavigationTab,
                    label: 'Settings',
                    desc: 'Format & offsets',
                    icon: Settings,
                    color: 'text-slate-300',
                    activeBg: 'bg-indigo-900/40 border-indigo-500 text-indigo-200',
                  },
                  {
                    id: 'logout' as const,
                    label: 'Sign Out',
                    desc: 'End session',
                    icon: LogOut,
                    color: 'text-rose-400',
                    activeBg: '',
                    isLogout: true,
                  },
                ];

                return sectionItems.map((item, index) => {
                  const isUnpaired = sectionItems.length % 2 !== 0 && index === sectionItems.length - 1;
                  return (
                    <button
                      key={item.id}
                      onClick={() => {
                        setIsMobileMenuOpen(false);
                        if (item.isLogout) {
                          setIsLogoutConfirmOpen(true);
                        } else {
                          onSelectTab(item.id as NavigationTab);
                        }
                      }}
                      className={`flex items-center gap-2.5 p-3 rounded-2xl border text-left transition cursor-pointer ${
                        isUnpaired ? 'col-span-2 justify-center py-3.5' : ''
                      } ${
                        item.isLogout
                          ? 'bg-rose-950/40 border-rose-800/50 text-rose-300 hover:bg-rose-900/50'
                          : activeTab === item.id
                            ? `${item.activeBg} font-bold`
                            : 'bg-slate-800/80 border-slate-700/80 text-slate-200 hover:bg-slate-700'
                      }`}
                    >
                      <item.icon className={`w-4 h-4 ${item.color} shrink-0`} />
                      <div>
                        <span className="block font-bold">{item.label}</span>
                        <span
                          className={`text-[10px] ${
                            item.isLogout ? 'text-rose-400/80' : 'text-slate-400'
                          }`}
                        >
                          {item.desc}
                        </span>
                      </div>
                    </button>
                  );
                });
              })()}
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
