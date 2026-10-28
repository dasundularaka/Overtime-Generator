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

function AppContent() {
  const { currentUser, userProfile, isAdmin, loading, refreshUserProfile } = useAuth();
  const [activeTab, setActiveTab] = useState<NavigationTab>('dashboard');
  const [editingClaim, setEditingClaim] = useState<ClaimRecord | null>(null);
  const [isPageTransitioning, setIsPageTransitioning] = useState(false);
  const [isInitialReloading, setIsInitialReloading] = useState(true);
  const transitionTimerRef = useRef<NodeJS.Timeout | null>(null);

  // 2-second animation on reloading/initial startup
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsInitialReloading(false);
    }, 2000);
    return () => clearTimeout(timer);
  }, []);

  // Centralized tab transition with 2-second animation
  const transitionToTab = (targetTab: NavigationTab, onBeforeSwitch?: () => void) => {
    if (targetTab === activeTab && !onBeforeSwitch) return;

    if (transitionTimerRef.current) {
      clearTimeout(transitionTimerRef.current);
    }

    setIsPageTransitioning(true);

    setTimeout(() => {
      if (onBeforeSwitch) onBeforeSwitch();
      if (targetTab === 'designer' && !isAdmin) {
        setActiveTab('dashboard');
      } else {
        setActiveTab(targetTab);
      }
    }, 350);

    transitionTimerRef.current = setTimeout(() => {
      setIsPageTransitioning(false);
    }, 2000);
  };

  // Initialize automated user creation email dispatch trigger for admins
  useEffect(() => {
    if (isAdmin) {
      const unsub = initAutomatedUserCreationListener(isAdmin);
      return () => unsub();
    }
  }, [isAdmin]);

  // Safeguard: non-admins cannot stay on designer, users, audit, roles, or employees tabs (branches is accessible to all staff)
  useEffect(() => {
    if (
      !loading &&
      !isAdmin &&
      (activeTab === 'designer' ||
        activeTab === 'users' ||
        activeTab === 'audit' ||
        activeTab === 'roles' ||
        activeTab === 'employees')
    ) {
      transitionToTab('dashboard');
    }
  }, [loading, isAdmin, activeTab]);

  if (loading || isInitialReloading) {
    return <LoadingScreen message="Loading Overtime Claim Engine..." subMessage="Authenticating session & verifying roles..." />;
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
    transitionToTab('new-claim', () => setEditingClaim(claim));
  };

  const handleStartFreshClaim = () => {
    transitionToTab('new-claim', () => setEditingClaim(null));
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      {/* Inter-Pages Transmission Animation (2-Second Duration, 50% Transparent Blur Background) */}
      <PageTransitionOverlay isVisible={isPageTransitioning} />

      {/* Top Navigation */}
      <Navbar
        activeTab={activeTab}
        onSelectTab={(tab) => {
          transitionToTab(tab);
        }}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 lg:px-8 pt-4 sm:pt-6 pb-24 md:pb-8">
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
              transitionToTab('history');
            }}
            onNavigateToDesigner={isAdmin ? () => transitionToTab('designer') : undefined}
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

        {activeTab === 'designer' && isAdmin && <TemplateDesigner />}

        {activeTab === 'settings' && <SettingsPage />}
      </main>

      {/* Footer (Desktop only) */}
      <footer className="mt-auto border-t border-slate-200 bg-white py-4 text-center text-xs text-slate-500 hidden md:block">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <div>
            <strong>OT Claim</strong> &bull; Official A4 Timesheet &amp; Claim System
          </div>
          <div className="flex items-center gap-3 text-[11px] text-slate-400">
            <span>Signed in as: <strong className="text-slate-700">{userProfile?.name || currentUser.email}</strong> ({isAdmin ? 'Admin' : 'User'})</span>
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
