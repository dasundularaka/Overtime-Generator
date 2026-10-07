import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AuthScreen } from './components/AuthScreen';
import { Navbar, NavigationTab } from './components/Navbar';
import { Dashboard } from './components/Dashboard';
import { ClaimEditor } from './components/ClaimEditor';
import { UserManagement } from './components/UserManagement';
import { EmployeeManager } from './components/EmployeeManager';
import { ClaimHistory } from './components/ClaimHistory';
import { TemplateDesigner } from './components/TemplateDesigner';
import { SettingsPage } from './components/SettingsPage';
import { OnboardingModal } from './components/OnboardingModal';
import { OfflineIndicator } from './components/OfflineIndicator';
import { LoadingScreen } from './components/LoadingScreen';
import { ClaimRecord } from './types';
import { getSettings, saveSettings } from './utils/storage';

function AppContent() {
  const { currentUser, userProfile, isAdmin, loading } = useAuth();
  const [activeTab, setActiveTab] = useState<NavigationTab>('dashboard');
  const [editingClaim, setEditingClaim] = useState<ClaimRecord | null>(null);
  const [showHelpModal, setShowHelpModal] = useState<boolean>(false);

  useEffect(() => {
    const settings = getSettings();
    if (!settings.hasSeenOnboarding) {
      setShowHelpModal(true);
      saveSettings({ ...settings, hasSeenOnboarding: true });
    }
  }, []);

  // Safeguard: non-admins cannot stay on designer or user admin tabs
  useEffect(() => {
    if (!loading && !isAdmin && (activeTab === 'designer' || activeTab === 'users')) {
      setActiveTab('dashboard');
    }
  }, [loading, isAdmin, activeTab]);

  if (loading) {
    return <LoadingScreen message="Loading Overtime Claim Engine..." subMessage="Authenticating session & verifying roles..." />;
  }

  // If not logged in, show Auth screen
  if (!currentUser) {
    return <AuthScreen />;
  }

  const handleEditClaim = (claim: ClaimRecord) => {
    setEditingClaim(claim);
    setActiveTab('new-claim');
  };

  const handleStartFreshClaim = () => {
    setEditingClaim(null);
    setActiveTab('new-claim');
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      {/* Top Navigation */}
      <Navbar
        activeTab={activeTab}
        onSelectTab={(tab) => {
          if (tab === 'new-claim' && activeTab === 'new-claim') {
            setEditingClaim(null);
          }
          if (tab === 'designer' && !isAdmin) {
            setActiveTab('dashboard');
            return;
          }
          setActiveTab(tab);
        }}
        onOpenHelp={() => setShowHelpModal(true)}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 pt-6">
        {activeTab === 'dashboard' && (
          <Dashboard
            onNavigate={(tab) => {
              if (tab === 'new-claim') handleStartFreshClaim();
              else if (tab === 'designer' && !isAdmin) setActiveTab('dashboard');
              else setActiveTab(tab);
            }}
            onEditClaim={handleEditClaim}
            onOpenHelp={() => setShowHelpModal(true)}
          />
        )}

        {activeTab === 'new-claim' && (
          <ClaimEditor
            initialClaim={editingClaim}
            onClaimSaved={() => {
              setActiveTab('history');
            }}
            onNavigateToDesigner={isAdmin ? () => setActiveTab('designer') : undefined}
          />
        )}

        {activeTab === 'users' && isAdmin && <UserManagement />}

        {activeTab === 'employees' && <EmployeeManager />}

        {activeTab === 'history' && (
          <ClaimHistory
            onEditClaim={handleEditClaim}
            onNavigateToNewClaim={handleStartFreshClaim}
          />
        )}

        {activeTab === 'designer' && isAdmin && <TemplateDesigner />}

        {activeTab === 'settings' && <SettingsPage />}
      </main>

      {/* Footer */}
      <footer className="mt-auto border-t border-slate-200 bg-white py-4 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <div>
            <strong>Overtime Claim Manager</strong> &bull; General Shift (8:00 AM – 4:45 PM) &bull; 15-Min Step Engine
          </div>
          <div className="flex items-center gap-3 text-[11px] text-slate-400">
            <span>Signed in as: <strong className="text-slate-700">{userProfile?.name || currentUser.email}</strong> ({isAdmin ? 'Admin' : 'User'})</span>
            <span>&bull;</span>
            <button
              onClick={() => setShowHelpModal(true)}
              className="hover:text-indigo-600 underline"
            >
              Shift Rules
            </button>
          </div>
        </div>
      </footer>

      {/* First-Run Experience / Help Modal */}
      <OnboardingModal
        isOpen={showHelpModal}
        onClose={() => setShowHelpModal(false)}
        isAdmin={isAdmin}
        onGoToDesigner={() => {
          setShowHelpModal(false);
          if (isAdmin) setActiveTab('designer');
        }}
        onGoToNewClaim={() => {
          setShowHelpModal(false);
          handleStartFreshClaim();
        }}
      />

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
