// WHY THIS COMPONENT EXISTS (WS-12):
// This is the bank operator's left-nav sidebar — the "deployed product" view.
// While the MasterHeaderNav gives designers access to studios (Canva), this sidebar
// gives bank staff (tellers, ops, managers) access to live screens grouped by business domain.
// It mimics what a real banking app like T24 or Flexcube shows to end users:
// "Masters > Currency Master, Country Code" / "FX Operations > FX Rate Entry, Rate Upload".
// Business Domains are seeded per-package and live screens auto-appear under their domain.
//
// WHAT BREAKS IF REMOVED:
// Bank operators have no way to navigate to live screens. The "package runtime mode"
// (WS-11 + WS-12 together) represents the deployed banking product UX, not the designer mode.

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import { usePlatformStore } from '../../store/usePlatformStore';

interface Domain {
  domain_id: string;
  domain_name: string;
  domain_code: string;
  icon: string | null;
  live_screen_count: number;
  sort_order: number;
}

interface Screen {
  screen_id: string;
  screen_name: string;
  screen_template_category: string;
  description: string | null;
}

interface PackageSidebarNavProps {
  packageId: string;
  packageName: string;
  activeScreenId: string | null;
  onScreenSelect: (screen: Screen) => void;
  onTransactionShell: () => void;
}

export const PackageSidebarNav: React.FC<PackageSidebarNavProps> = ({
  packageId,
  packageName,
  activeScreenId,
  onScreenSelect,
  onTransactionShell,
}) => {
  // Track which domain sections are expanded
  const [expandedDomains, setExpandedDomains] = useState<Set<string>>(new Set());
  // Track which domains have had their screens loaded
  const [loadedDomains, setLoadedDomains] = useState<Set<string>>(new Set());

  const { data: domainsData, isLoading: domainsLoading } = useQuery({
    queryKey: ['package-domains', packageId],
    queryFn: async () => {
      const res = await apiClient.get(`/screens/domains/package/${packageId}`);
      return res.data.domains as Domain[];
    },
    enabled: !!packageId,
  });

  const toggleDomain = (domainId: string) => {
    setExpandedDomains(prev => {
      const next = new Set(prev);
      if (next.has(domainId)) {
        next.delete(domainId);
      } else {
        next.add(domainId);
        // Mark as loaded so the screen query fires
        setLoadedDomains(prev2 => new Set([...prev2, domainId]));
      }
      return next;
    });
  };

  const CATEGORY_ICONS: Record<string, string> = {
    MAINTENANCE: '🗂',
    CONFIGURATION: '⚙️',
    TRANSACTION: '💳',
  };

  return (
    <aside className="w-64 flex-shrink-0 bg-white/90 backdrop-blur-md border-r border-slate-200 flex flex-col min-h-full">
      {/* Package header */}
      <div className="px-4 py-4 border-b border-slate-100">
        <div className="flex items-center gap-2 mb-1">
          <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center text-white text-xs font-black">
            {packageName.charAt(0)}
          </div>
          <span className="text-sm font-bold text-slate-800 leading-tight">{packageName}</span>
        </div>
        <span className="text-[10px] text-slate-400 font-medium tracking-widest uppercase pl-9">Live Product</span>
      </div>

      {/* Transaction Shell shortcut */}
      <div className="px-3 pt-3">
        <button
          onClick={onTransactionShell}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-700 text-xs font-semibold hover:bg-indigo-100 transition-colors"
        >
          <span>▶</span>
          <span>Transaction Shell</span>
        </button>
      </div>

      {/* Domain navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-1">
        {domainsLoading && (
          <div className="text-[11px] text-slate-400 text-center py-6">Loading domains…</div>
        )}

        {!domainsLoading && (!domainsData || domainsData.length === 0) && (
          <div className="text-[11px] text-slate-400 text-center py-6 px-2">
            No business domains configured yet.
            <br />
            <span className="text-slate-300">Use Screen Designer to assign screens to domains.</span>
          </div>
        )}

        {domainsData?.map(domain => (
          <DomainSection
            key={domain.domain_id}
            domain={domain}
            packageId={packageId}
            isExpanded={expandedDomains.has(domain.domain_id)}
            wasLoaded={loadedDomains.has(domain.domain_id)}
            activeScreenId={activeScreenId}
            onToggle={() => toggleDomain(domain.domain_id)}
            onScreenSelect={onScreenSelect}
            categoryIcons={CATEGORY_ICONS}
          />
        ))}
      </nav>
    </aside>
  );
};

// DomainSection: one collapsible section in the sidebar.
// WHY separate component: screens are lazy-loaded per domain (enabled only when expanded)
// so we avoid N API calls on page load for a package with many domains.
const DomainSection: React.FC<{
  domain: Domain;
  packageId: string;
  isExpanded: boolean;
  wasLoaded: boolean;
  activeScreenId: string | null;
  onToggle: () => void;
  onScreenSelect: (s: Screen) => void;
  categoryIcons: Record<string, string>;
}> = ({ domain, packageId, isExpanded, wasLoaded, activeScreenId, onToggle, onScreenSelect, categoryIcons }) => {
  const { data: screensData, isLoading } = useQuery({
    queryKey: ['domain-screens', packageId, domain.domain_id],
    queryFn: async () => {
      const res = await apiClient.get('/screens/', {
        params: { status: 'LIVE', package_id: packageId, domain_id: domain.domain_id },
      });
      return res.data.screens as Screen[];
    },
    // Only fetch once the user expands this domain — lazy load
    enabled: wasLoaded,
  });

  return (
    <div>
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-2 py-2 rounded-lg text-left hover:bg-slate-50 transition-colors group"
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-base">{domain.icon || '📂'}</span>
          <span className="text-[11px] font-semibold text-slate-700 truncate">{domain.domain_name}</span>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {domain.live_screen_count > 0 && (
            <span className="text-[9px] bg-emerald-100 text-emerald-700 font-bold px-1.5 py-0.5 rounded-full">
              {domain.live_screen_count}
            </span>
          )}
          <svg
            className={`w-3 h-3 text-slate-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7" />
          </svg>
        </div>
      </button>

      {isExpanded && (
        <div className="ml-4 mt-0.5 space-y-0.5">
          {isLoading && (
            <div className="text-[10px] text-slate-400 px-3 py-2">Loading…</div>
          )}
          {!isLoading && screensData?.length === 0 && (
            <div className="text-[10px] text-slate-400 px-3 py-2">No live screens in this domain</div>
          )}
          {screensData?.map(screen => (
            <button
              key={screen.screen_id}
              onClick={() => onScreenSelect(screen)}
              className={`w-full flex items-center gap-2 px-3 py-1.5 rounded-md text-left text-[11px] transition-colors ${
                activeScreenId === screen.screen_id
                  ? 'bg-indigo-600 text-white font-semibold'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-800'
              }`}
            >
              <span className={`text-xs ${activeScreenId === screen.screen_id ? 'opacity-80' : 'opacity-50'}`}>
                {categoryIcons[screen.screen_template_category] || '📄'}
              </span>
              <span className="truncate">{screen.screen_name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
