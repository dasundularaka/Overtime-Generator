import React, { useState, useEffect, useRef } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AuthScreen } from './components/AuthScreen';
import { Navbar, NavigationTab } from './components/Navbar';
import { Dashboard } from './components/Dashboard';
import { ClaimEditor } from './components/ClaimEditor';
import { CalendarManager } from './components/CalendarManager';
import { UserManagement } from './components/UserManagement';
import { BranchManagement } from './components/BranchManagement';
import { RoleManagement } from './components/RoleManagement';
import { EmployeeManager } from './components/EmployeeManager';
import { ClaimHistory } from './components/ClaimHistory';
import { TemplateDesigner } from './components/TemplateDesigner';
import { SettingsPage } from './components/SettingsPage';
import { OfflineIndicator } from './components/OfflineIndicator';
import { LoadingScreen } from './components/LoadingScreen';
import { PageTransitionOverlay } from './components/PageTransitionOverlay';
import { PasswordResetModal } from './components/PasswordResetModal';
import { AuditLogViewer } from './components/AuditLogViewer';
import { ClaimRecord } from './types';
import { initAutomatedUserCreationListener } from './services/automatedDispatchTrigger';

const TAB_TITLES: Record<NavigationTab, { message: string; subMessage: string }> = {
  dashboard: { message: 'Loading Dashboard...', subMessage: 'Summarizing claims and monthly statistics...' },
  'new-claim': { message: 'Preparing Overtime Claim...', subMessage: 'Loading timesheet calibrator & branch rates...' },
  history: { message: 'Loading Claim History...', subMessage: 'Retrieving records and printable documents...' },
  calendar: { message: 'Loading Calendar & Holidays...', subMessage: 'Checking gazetted and mercantile poya days...' },
  branches: { message: 'Loading Branch Network...', subMessage: 'Listing active branches and locations...' },
  roles: { message: 'Loading Role Policies...', subMessage: 'Syncing overtime limits and hourly rates...' },
  users: { message: 'Loading User Management...', subMessage: 'Verifying user access and permission roles...' },
  audit: { message: 'Loading Audit Trail...', subMessage: 'Fetching security logs and activity records...' },
  employees: { message: 'Loading Employee Registry...', subMessage: 'Synchronizing staff records...' },
  designer: { message: 'Loading Template Calibration Designer...', subMessage: 'Loading precision millimeter canvas...' },
  settings: { message: 'Loading System Settings...', subMessage: 'Loading shift hours and system preferences...' },
};

function AppContent() {
  const { currentUser, userProfile, isSuperAdmin, isAdmin, loading, isLoggingOut, refreshUserProfile } = useAuth();
  const [activeTab, setActiveTab] = useState<NavigationTab>('dashboard');
  const [editingClaim, setEditingClaim] = useState<ClaimRecord | null>(null);

  // Real initial load tracking based on real auth/database load duration
  const [isInitialReady, setIsInitialReady] = useState(false);
  const [isInitialFadingOut, setIsInitialFadingOut] = useState(false);
  const loadStartRef = useRef<number>(Date.now());

  const [pageTransition, setPageTransition] = useState<{
    isVisible: boolean;
    message: string;
    subMessage: string;
  }>({
    isVisible: false,
    message: 'Loading...',
    subMessage: 'Switching view...',
  });

  const transitionTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Automatically adjust initial load time according to real database & auth load time
  useEffect(() => {
    if (loading) return;

    // Real loading complete: smoothly fade out with minimum 350ms to appreciate clock spread animation
    const elapsed = Date.now() - loadStartRef.current;
    const remainingDelay = Math.max(0, 350 - elapsed);

    const fadeTimer = setTimeout(() => {
      setIsInitialFadingOut(true);
      const finishTimer = setTimeout(() => {
        setIsInitialReady(true);
      }, 300);
      return () => clearTimeout(finishTimer);
    }, remainingDelay);

    return () => clearTimeout(fadeTimer);
  }, [loading]);

  // Safety fallback: ensure initial loading screen never stays visible longer than 3.5s under any condition
  useEffect(() => {
    const safetyTimer = setTimeout(() => {
      setIsInitialFadingOut(true);
      setTimeout(() => {
        setIsInitialReady(true);
      }, 300);
    }, 3500);

    return () => clearTimeout(safetyTimer);
  }, []);

  // Virtual keyboard scroll-into-view handler: automatically scroll any focused input field into clear view
  useEffect(() => {
    const handleFocusIn = (e: FocusEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        setTimeout(() => {
          try {
            target.scrollIntoView({ behavior: 'smooth', block: 'center' });
          } catch {
            target.scrollIntoView();
          }
        }, 280);
      }
    };

    window.addEventListener('focusin', handleFocusIn);
    return () => {
      window.removeEventListener('focusin', handleFocusIn);
    };
  }, []);

  // Centralized tab transition with real render synchronization
  const transitionToTab = (
    targetTab: NavigationTab,
    onBeforeSwitch?: () => void,
    customMessage?: string,
    customSubMessage?: string
  ) => {
    if (targetTab === activeTab && !onBeforeSwitch) return;

    if (transitionTimerRef.current) {
      clearTimeout(transitionTimerRef.current);
    }

    const info = TAB_TITLES[targetTab] || {
      message: 'Loading Page...',
      subMessage: 'Switching view...',
    };

    setPageTransition({
      isVisible: true,
      message: customMessage || info.message,
      subMessage: customSubMessage || info.subMessage,
    });

    const switchTimer = setTimeout(() => {
      if (onBeforeSwitch) onBeforeSwitch();
      if (targetTab === 'designer' && !isSuperAdmin) {
        setActiveTab('dashboard');
      } else {
        setActiveTab(targetTab);
      }

      requestAnimationFrame(() => {
        transitionTimerRef.current = setTimeout(() => {
          setPageTransition(prev => ({ ...prev, isVisible: false }));
        }, 400);
      });
    }, 250);

    return () => clearTimeout(switchTimer);
  };

  // Initialize automated user creation email dispatch trigger for admins
  useEffect(() => {
    if (isAdmin) {
      const unsub = initAutomatedUserCreationListener(isAdmin);
      return () => unsub();
    }
  }, [isAdmin]);

  // Safeguard: non-super-admins cannot access designer; non-admins cannot stay on users, audit, roles, or employees tabs
  useEffect(() => {
    if (loading) return;
    if (activeTab === 'designer' && !isSuperAdmin) {
      transitionToTab('dashboard');
      return;
    }
    if (
      !isAdmin &&
      (activeTab === 'users' ||
        activeTab === 'audit' ||
        activeTab === 'roles' ||
        activeTab === 'employees')
    ) {
      transitionToTab('dashboard');
    }
  }, [loading, isAdmin, isSuperAdmin, activeTab]);

  // Loading screen during logout
  if (isLoggingOut) {
    return (
      <LoadingScreen
        message="Signing Out..."
        subMessage="Securing session & clearing credentials..."
      />
    );
  }

  // Loading screen on initial load (strictly adjusted to real loading time)
  if (!isInitialReady) {
    return (
      <LoadingScreen
        message="Loading Overtime Claim Engine..."
        subMessage="Authenticating session & verifying roles..."
        isFadingOut={isInitialFadingOut}
      />
    );
  }

  // If not logged in, show Auth screen
  if (!currentUser) {
    return <AuthScreen />;
  }

  // Force Password Reset Screen if password matches PF number or first-time setup
  if (userProfile?.mustChangePassword || userProfile?.isFirstLogin || userProfile?.passwordMatchesPf) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 flex flex-col justify-center items-center p-4">
        <PasswordResetModal
          isOpen={true}
          onPasswordChanged={async () => {
            await refreshUserProfile();
          }}
        />
      </div>
    );
  }

  const handleEditClaim = (claim: ClaimRecord) => {
    transitionToTab(
      'new-claim',
      () => setEditingClaim(claim),
      'Loading Timesheet...',
      'Opening overtime record for editing...'
    );
  };

  const handleStartFreshClaim = () => {
    transitionToTab(
      'new-claim',
      () => setEditingClaim(null),
      'Preparing New Claim...',
      'Initializing timesheet template & rates...'
    );
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      {/* Inter-Pages Transmission with White Background Expanding from Center */}
      <PageTransitionOverlay
        isVisible={pageTransition.isVisible}
        message={pageTransition.message}
        subMessage={pageTransition.subMessage}
      />

      {/* Top Navigation */}
      <Navbar
        activeTab={activeTab}
        onSelectTab={(tab) => {
          transitionToTab(tab);
        }}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 lg:px-8 pt-4 sm:pt-6 pb-36 sm:pb-32 md:pb-8">
        {activeTab === 'dashboard' && (
          <Dashboard
            onNavigate={(tab) => {
              if (tab === 'new-claim') handleStartFreshClaim();
              else transitionToTab(tab);
            }}
            onEditClaim={handleEditClaim}
          />
        )}

        {activeTab === 'new-claim' && (
          <ClaimEditor
            initialClaim={editingClaim}
            onClaimSaved={() => {
              transitionToTab(
                'history',
                undefined,
                'Saving Claim Record...',
                'Synchronizing claim to history...'
              );
            }}
            onNavigateToDesigner={isSuperAdmin ? () => transitionToTab('designer') : undefined}
          />
        )}

        {activeTab === 'calendar' && <CalendarManager />}

        {activeTab === 'users' && isAdmin && <UserManagement />}
        {activeTab === 'branches' && <BranchManagement />}
        {activeTab === 'roles' && isAdmin && <RoleManagement />}
        {activeTab === 'audit' && isAdmin && <AuditLogViewer />}

        {activeTab === 'employees' && isAdmin && <EmployeeManager />}

        {activeTab === 'history' && (
          <ClaimHistory
            onEditClaim={handleEditClaim}
            onNavigateToNewClaim={handleStartFreshClaim}
          />
        )}

        {activeTab === 'designer' && isSuperAdmin && <TemplateDesigner />}

        {activeTab === 'settings' && <SettingsPage />}
      </main>

      {/* Footer (Desktop only) */}
      <footer className="mt-auto border-t border-slate-200 bg-white py-4 text-center text-xs text-slate-500 hidden md:block">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <div>
            <strong>OT Claim</strong> &bull; Official A4 Timesheet &amp; Claim System
          </div>
          <div className="flex items-center gap-3 text-[11px] text-slate-400">
            <span>Signed in as: <strong className="text-slate-700">{userProfile?.name || currentUser.email}</strong> ({isSuperAdmin ? 'Super Admin (Owner)' : isAdmin ? 'Admin' : 'User'})</span>
          </div>
        </div>
      </footer>

      {/* Offline Status Toast */}
      <OfflineIndicator />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
