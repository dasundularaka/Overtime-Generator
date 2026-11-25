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
import { ErrorBoundary } from './components/ErrorBoundary';
import { OTAUpdateBanner } from './components/OTAUpdateBanner';
import { NotificationCenter } from './components/NotificationCenter';
import { LiveNotificationToast } from './components/LiveNotificationToast';
import {
  consumeRestoredTabAfterOta,
  initOtaUpdater,
  registerOtaTabProvider,
} from './services/otaUpdateService';
import { getCallingName } from './utils/userNameHelper';

const TAB_TITLES: Record<NavigationTab, { message: string; subMessage: string }> = {
  dashboard: { message: 'Loading Dashboard...', subMessage: 'Summarizing claims and monthly statistics...' },
  'new-claim': { message: 'Preparing Overtime Claim...', subMessage: 'Loading timesheet calibrator & branch rates...' },
  history: { message: 'Loading Claim History...', subMessage: 'Retrieving records and printable documents...' },
  calendar: { message: 'Loading Integrated Calendar...', subMessage: 'Checking gazetted, bank, and mercantile holidays...' },
  branches: { message: 'Loading Branch Network...', subMessage: 'Listing active branches and locations...' },
  roles: { message: 'Loading Role Policies...', subMessage: 'Syncing overtime limits and hourly rates...' },
  users: { message: 'Loading User Management...', subMessage: 'Verifying user access and permission roles...' },
  audit: { message: 'Loading Audit Trail...', subMessage: 'Fetching security logs and activity records...' },
  employees: { message: 'Loading Employee Registry...', subMessage: 'Synchronizing staff records...' },
  designer: { message: 'Loading Template Calibration Designer...', subMessage: 'Loading precision millimeter canvas...' },
  notifications: { message: 'Loading Notifications...', subMessage: 'Syncing broadcast alerts & incoming messages...' },
  settings: { message: 'Loading System Settings...', subMessage: 'Loading shift hours and system preferences...' },
};

function AppContent() {
  const { currentUser, userProfile, isSuperAdmin, isAdmin, loading, isLoggingOut, refreshUserProfile } = useAuth();
  const [activeTab, setActiveTab] = useState<NavigationTab>(() => {
    const restored = consumeRestoredTabAfterOta();
    if (restored && restored in TAB_TITLES) {
      return restored as NavigationTab;
    }
    return 'dashboard';
  });
  const [editingClaim, setEditingClaim] = useState<ClaimRecord | null>(null);

  // Register current active tab so OTA reloads restore the exact view seamlessly
  useEffect(() => {
    return registerOtaTabProvider(() => activeTab);
  }, [activeTab]);

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

  const transitionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const switchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Automatically adjust initial load time according to real database & auth load time
  useEffect(() => {
    if (loading) return;

    // Real loading complete: smoothly fade out with minimum 350ms to appreciate clock spread animation
    const elapsed = Date.now() - loadStartRef.current;
    const remainingDelay = Math.max(0, 350 - elapsed);
    let finishTimer: ReturnType<typeof setTimeout> | null = null;

    const fadeTimer = setTimeout(() => {
      setIsInitialFadingOut(true);
      finishTimer = setTimeout(() => {
        setIsInitialReady(true);
      }, 300);
    }, remainingDelay);

    return () => {
      clearTimeout(fadeTimer);
      if (finishTimer) clearTimeout(finishTimer);
    };
  }, [loading]);

  // Safety fallback: ensure initial loading screen never stays visible longer than 3.5s under any condition
  useEffect(() => {
    let safetyFinishTimer: ReturnType<typeof setTimeout> | null = null;
    const safetyTimer = setTimeout(() => {
      setIsInitialFadingOut(true);
      safetyFinishTimer = setTimeout(() => {
        setIsInitialReady(true);
      }, 300);
    }, 3500);

    return () => {
      clearTimeout(safetyTimer);
      if (safetyFinishTimer) clearTimeout(safetyFinishTimer);
    };
  }, []);

  // Watchdog: guarantee PageTransitionOverlay can NEVER remain stuck visible over New Claim or any view
  useEffect(() => {
    if (!pageTransition.isVisible) return;
    const maxTimer = setTimeout(() => {
      setPageTransition(prev => (prev.isVisible ? { ...prev, isVisible: false } : prev));
    }, 950);
    return () => clearTimeout(maxTimer);
  }, [pageTransition.isVisible]);

  // Virtual keyboard scroll-into-view handler: automatically scroll focused mobile inputs into clear view
  useEffect(() => {
    let scrollTimer: ReturnType<typeof setTimeout> | null = null;
    const handleFocusIn = (e: FocusEvent) => {
      if (window.innerWidth >= 768) return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        !target.closest('[role="dialog"], .fixed') &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        if (scrollTimer) clearTimeout(scrollTimer);
        scrollTimer = setTimeout(() => {
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
      if (scrollTimer) clearTimeout(scrollTimer);
    };
  }, []);

  // Cleanup tab transition timers on unmount
  useEffect(() => {
    return () => {
      if (transitionTimerRef.current) clearTimeout(transitionTimerRef.current);
      if (switchTimerRef.current) clearTimeout(switchTimerRef.current);
    };
  }, []);

  // Centralized tab transition without fragile nested rAF blocking
  const transitionToTab = (
    targetTab: NavigationTab,
    onBeforeSwitch?: () => void,
    customMessage?: string,
    customSubMessage?: string
  ) => {
    if (targetTab === activeTab && !onBeforeSwitch) return;

    if (transitionTimerRef.current) {
      clearTimeout(transitionTimerRef.current);
      transitionTimerRef.current = null;
    }
    if (switchTimerRef.current) {
      clearTimeout(switchTimerRef.current);
      switchTimerRef.current = null;
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

    switchTimerRef.current = setTimeout(() => {
      try {
        if (onBeforeSwitch) onBeforeSwitch();
        if (targetTab === 'designer' && !isSuperAdmin) {
          setActiveTab('dashboard');
        } else {
          setActiveTab(targetTab);
        }
        window.scrollTo({ top: 0, behavior: 'auto' });
      } catch (err) {
        console.error('Tab transition pre-switch error:', err);
      } finally {
        transitionTimerRef.current = setTimeout(() => {
          setPageTransition(prev => ({ ...prev, isVisible: false }));
        }, 320);
      }
    }, 200);
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
      <div className="min-h-dvh bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 flex flex-col justify-center items-center p-4">
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
    <div className="min-h-dvh bg-slate-50 flex flex-col font-sans overflow-x-clip">
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
          if (tab === 'new-claim') handleStartFreshClaim();
          else transitionToTab(tab);
        }}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 lg:px-8 pt-4 sm:pt-6 mobile-nav-clearance">
        <ErrorBoundary
          resetKey={`${activeTab}:${editingClaim?.id || 'fresh'}`}
          fallbackTitle={activeTab === 'new-claim' ? 'Unable to load New Claim sheet' : 'Unable to display this section'}
          onBackHome={() => {
            setEditingClaim(null);
            setActiveTab('dashboard');
          }}
        >
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

          {activeTab === 'notifications' && <NotificationCenter />}

          {activeTab === 'settings' && <SettingsPage />}
        </ErrorBoundary>
      </main>

      {/* Footer (Desktop only) */}
      <footer className="mt-auto border-t border-slate-200 bg-white py-4 text-center text-xs text-slate-500 hidden md:block">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <div>
            <strong>OT Claim</strong> &bull; Official A4 Timesheet &amp; Claim System
          </div>
          <div className="flex items-center gap-3 text-[11px] text-slate-400">
            <span>Signed in as: <strong className="text-slate-700">{getCallingName(userProfile, currentUser.email || 'User')}</strong> ({isSuperAdmin ? 'Super Admin' : isAdmin ? 'Admin' : 'User'})</span>
          </div>
        </div>
      </footer>

      {/* Real-time App Pushed Notifications */}
      <LiveNotificationToast />

      {/* Offline Status Toast */}
      <OfflineIndicator />
    </div>
  );
}

export default function App() {
  useEffect(() => {
    return initOtaUpdater();
  }, []);

  return (
    <ErrorBoundary
      fallbackTitle="OT Claim encountered an unexpected display issue"
      onBackHome={() => window.location.reload()}
      backHomeLabel="Reload App"
    >
      <AuthProvider>
        <AppContent />
        <OTAUpdateBanner />
      </AuthProvider>
    </ErrorBoundary>
  );
}
