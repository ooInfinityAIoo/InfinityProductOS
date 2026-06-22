// WHY THIS COMPONENT EXISTS (WS-12):
// This is the top-level shell for "Package Runtime Mode" — the deployed banking product UX.
// It wraps the PackageSidebarNav (left) + the active content area (right).
// Think of it as the bank's actual product UI, as opposed to the designer's studio UI.
//
// Two sub-modes:
//   1. SCREEN_VIEW — operator clicked a live screen in the sidebar; shows RuntimeScreenRenderer
//   2. TRANSACTION_SHELL — operator clicked "Transaction Shell"; shows RuntimeTransactionShell
//
// Entry point: MasterHeaderNav adds a "▶ Launch App" button when in package context.
// Exit point: "← Back to Design" button returns to domain-dashboard designer mode.
//
// WHAT BREAKS IF REMOVED:
// The "deployed product" layer disappears — the platform only shows designer studios,
// not the actual banking application experience that end users and operators would see.

import React, { useState } from 'react';
import { usePlatformStore } from '../../store/usePlatformStore';
import { useResolvedPackageId } from '../../hooks/useResolvedPackageId';
import { PackageSidebarNav } from './PackageSidebarNav';
import { RuntimeScreenRenderer } from './RuntimeScreenRenderer';
import { RuntimeTransactionShell } from './RuntimeTransactionShell';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../api/client';

type ContentMode = 'welcome' | 'screen' | 'transaction';

interface ActiveScreen {
  screen_id: string;
  screen_name: string;
  screen_template_category: string;
  description: string | null;
}

export const PackageRuntimeShell: React.FC = () => {
  const { activeProductContext, activeCoreProductId, setActiveModule } = usePlatformStore();
  const [contentMode, setContentMode] = useState<ContentMode>('welcome');
  const [selectedScreen, setSelectedScreen] = useState<ActiveScreen | null>(null);

  // Fetch full screen definition when a screen is selected
  const { data: screenData, isLoading: screenLoading } = useQuery({
    queryKey: ['runtime-screen', selectedScreen?.screen_id],
    queryFn: async () => {
      const res = await apiClient.get(`/screens/${selectedScreen!.screen_id}`);
      return res.data;
    },
    enabled: !!selectedScreen?.screen_id && contentMode === 'screen',
  });

  // Resolve package_id — the store holds the package name, so we need to look up the ID.
  // Shared hook — see src/hooks/useResolvedPackageId.ts.
  const { currentPackage: packageData } = useResolvedPackageId();

  const packageId: string = packageData?.package_id ?? activeCoreProductId ?? '';
  const packageName: string = activeProductContext ?? 'Package';

  const handleScreenSelect = (screen: ActiveScreen) => {
    setSelectedScreen(screen);
    setContentMode('screen');
  };

  const handleTransactionShell = () => {
    setSelectedScreen(null);
    setContentMode('transaction');
  };

  return (
    <div className="flex min-h-[750px] bg-white/85 backdrop-blur-md rounded-2xl border border-white/30 shadow-glass overflow-hidden">
      {/* Left sidebar */}
      <PackageSidebarNav
        packageId={packageId}
        packageName={packageName}
        activeScreenId={selectedScreen?.screen_id ?? null}
        onScreenSelect={handleScreenSelect}
        onTransactionShell={handleTransactionShell}
      />

      {/* Right content area */}
      <main className="flex-1 overflow-y-auto">
        {/* Top bar */}
        <div className="sticky top-0 z-10 bg-white/95 backdrop-blur-md border-b border-slate-100 px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {contentMode === 'screen' && selectedScreen && (
              <>
                <span className="text-xs text-slate-400">{selectedScreen.screen_template_category}</span>
                <span className="text-slate-300">›</span>
                <span className="text-sm font-semibold text-slate-700">{selectedScreen.screen_name}</span>
              </>
            )}
            {contentMode === 'transaction' && (
              <span className="text-sm font-semibold text-slate-700">▶ Transaction Shell</span>
            )}
            {contentMode === 'welcome' && (
              <span className="text-sm font-semibold text-slate-700">{packageName} — Live Product</span>
            )}
          </div>

          {/* Back to designer mode */}
          <button
            onClick={() => setActiveModule('domain-dashboard')}
            className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-indigo-600 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 17l-5-5m0 0l5-5m-5 5h12" />
            </svg>
            Back to Designer
          </button>
        </div>

        {/* Content */}
        <div className="px-8 py-6">
          {/* Welcome / empty state */}
          {contentMode === 'welcome' && (
            <div className="flex flex-col items-center justify-center h-96 text-center">
              <div className="w-16 h-16 rounded-2xl bg-indigo-50 flex items-center justify-center text-3xl mb-4">🏦</div>
              <h3 className="text-lg font-bold text-slate-700 mb-2">{packageName}</h3>
              <p className="text-sm text-slate-500 max-w-sm mb-6">
                Select a screen from the sidebar to open it, or click Transaction Shell to process transactions through live workflows.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={handleTransactionShell}
                  className="px-5 py-2.5 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-colors shadow-sm"
                >
                  ▶ Open Transaction Shell
                </button>
              </div>
            </div>
          )}

          {/* Screen view */}
          {contentMode === 'screen' && selectedScreen && (
            <div className="max-w-3xl">
              {screenLoading ? (
                <div className="text-center text-slate-400 py-16 text-sm">Loading screen…</div>
              ) : screenData ? (
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
                  {screenData.description && (
                    <p className="text-sm text-slate-500 mb-5 pb-4 border-b border-slate-100">
                      {screenData.description}
                    </p>
                  )}
                  <RuntimeScreenRenderer
                    screenName={screenData.screen_name}
                    definition={screenData.definition}
                    onSubmit={(values, action) => {
                      // In a real deployment this would call an API or trigger a workflow
                      console.info('Screen submitted:', action, values);
                      alert(`Action: ${action}\n\nValues:\n${JSON.stringify(values, null, 2)}`);
                    }}
                  />
                </div>
              ) : (
                <div className="text-center text-slate-400 py-16 text-sm">
                  Screen not found or no longer live.
                </div>
              )}
            </div>
          )}

          {/* Transaction shell */}
          {contentMode === 'transaction' && (
            <RuntimeTransactionShell />
          )}
        </div>
      </main>
    </div>
  );
};
