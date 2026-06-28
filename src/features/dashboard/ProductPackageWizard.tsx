// WHY THIS FILE EXISTS:
// Package Initialization Wizard — the entry point for creating a new product
// package (e.g. "Payment Hub", "FX Hub"). Collects name, jurisdiction, currency,
// ISO domain associations, and studio configuration checklist.
//
// KEY UPGRADE (WS-1): Added ISO Domain multi-select. When domains are selected,
// the system knows which ISO fields belong to this package, drives Field Registry
// filtering, and auto-builds the Package sidebar navigation sections.
// Domain associations are persisted via PUT /fields/domains/package/{id}.

import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import { usePlatformStore } from '../../store/usePlatformStore';

// Suggested default domains per business domain type — bank analyst can adjust
const DOMAIN_SUGGESTIONS: Record<string, string[]> = {
  'Payments':     ['WIRE_PAYMENTS', 'FOREIGN_EXCHANGE', 'ACCOUNT_MGMT', 'COUNTERPARTY', 'COMPLIANCE', 'REPORTING_AUDIT'],
  'Treasury':     ['FOREIGN_EXCHANGE', 'AMOUNTS_CALC', 'ACCOUNT_MGMT', 'COMPLIANCE', 'REPORTING_AUDIT'],
  'Cards':        ['CARD_PAYMENTS', 'ACCOUNT_MGMT', 'COUNTERPARTY', 'COMPLIANCE', 'REPORTING_AUDIT'],
  'ATM':          ['ATM_CHANNEL', 'ACCOUNT_MGMT', 'COUNTERPARTY', 'COMPLIANCE', 'REPORTING_AUDIT'],
  'Supply Chain': ['WIRE_PAYMENTS', 'AMOUNTS_CALC', 'COUNTERPARTY', 'COMPLIANCE', 'REPORTING_AUDIT'],
  'Retail':       ['ACCOUNT_MGMT', 'CARD_PAYMENTS', 'COUNTERPARTY', 'COMPLIANCE', 'REPORTING_AUDIT'],
};

export const ProductPackageWizard: React.FC = () => {
  const { setWizardOpen, setProductContext } = usePlatformStore();
  const queryClient = useQueryClient();

  const [packageName, setPackageName] = useState('');
  const [domain, setDomain] = useState('Payments');
  const [country, setCountry] = useState('US');
  const [currency, setCurrency] = useState('USD');
  const [useIsoStandards, setUseIsoStandards] = useState(false);
  const [selectedDomains, setSelectedDomains] = useState<string[]>(DOMAIN_SUGGESTIONS['Payments']);

  const [modules, setModules] = useState([
    { module_name: 'ISO Field Registry Sync',  owner: 'Data Governance Team',  sla_days: 2 },
    { module_name: 'Document Master',           owner: 'Document Processing Team', sla_days: 3 },
    { module_name: 'Unstructured Document',     owner: 'AI Extraction Team',    sla_days: 5 },
    { module_name: 'Behavioral Profile',        owner: 'Risk Analysts',         sla_days: 4 },
    { module_name: 'Event Repository',          owner: 'Audit Team',            sla_days: 2 },
    { module_name: 'DataGateway Mappers',       owner: 'Integration Team',      sla_days: 5 },
    { module_name: 'Business Rule Sets',        owner: 'Risk Analysts',         sla_days: 4 },
    { module_name: 'Calculation Engine',        owner: 'Quantitative Team',     sla_days: 6 },
    { module_name: 'API Designer',              owner: 'Integration Team',      sla_days: 3 },
    { module_name: 'Screen Designer',           owner: 'UX Team',               sla_days: 5 },
    { module_name: 'File Template Designer',    owner: 'UX Team',               sla_days: 4 },
    { module_name: 'Report Designer',           owner: 'Reporting Team',        sla_days: 4 },
    { module_name: 'Reconciliation Engine',     owner: 'Finance Ops',           sla_days: 7 },
    { module_name: 'Execution Audit',           owner: 'Compliance Team',       sla_days: 2 },
    { module_name: 'Insights Factory',          owner: 'Data Science Team',     sla_days: 6 },
    { module_name: 'Workflow Orchestration',    owner: 'Product Ops',           sla_days: 7 },
    { module_name: 'Ingestion Pipeline',        owner: 'Data Eng Team',         sla_days: 5 },
    { module_name: 'Ai Assistant Studio',       owner: 'AI Team',               sla_days: 4 },
  ]);

  // Load ISO domain taxonomy for the multi-select
  const { data: domainsData } = useQuery({
    queryKey: ['iso-domains'],
    queryFn: async () => (await apiClient.get('/fields/domains')).data,
  });
  const allDomains: any[] = domainsData?.domains ?? [];

  // When business domain dropdown changes, auto-suggest ISO domains
  const handleBusinessDomainChange = (val: string) => {
    setDomain(val);
    setSelectedDomains(DOMAIN_SUGGESTIONS[val] ?? []);
  };

  const toggleIsoDomain = (code: string) => {
    setSelectedDomains(prev =>
      prev.includes(code) ? prev.filter(d => d !== code) : [...prev, code]
    );
  };

  // Step 1: create package, Step 2: associate domains
  const createPackageMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        package_name: packageName,
        business_domain: domain,
        jurisdiction_country_code: country,
        base_currency_code: currency,
        use_iso_standards: useIsoStandards,
        configuration_plan: modules.map(m => ({ ...m, is_configured: false })),
      };
      const res = await apiClient.post('/masters/packages', payload);
      const newPackageId = res.data?.package_id;
      // Associate selected ISO domains with the new package
      if (newPackageId && selectedDomains.length > 0) {
        await apiClient.put(`/fields/domains/package/${newPackageId}`, {
          domain_codes: selectedDomains,
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['product-packages'] });
      setWizardOpen(false);
      setProductContext(packageName);
    },
  });

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center z-[100] animate-fade-in">
      <div className="bg-white/95 backdrop-blur-md rounded-3xl border border-white/20 shadow-2xl w-[860px] overflow-hidden animate-slide-up flex flex-col max-h-[92vh]">

        {/* Header */}
        <div className="px-8 py-6 border-b border-slate-100 bg-slate-50/50">
          <h2 className="text-xl font-extrabold bg-gradient-to-r from-indigo-600 to-indigo-800 bg-clip-text text-transparent font-display">
            Initialize New Product Application Package
          </h2>
          <p className="text-xs text-slate-400 mt-1.5 font-medium">
            Define name, jurisdiction, ISO domains covered, and studio configuration owners.
          </p>
        </div>

        <div className="p-8 flex-1 overflow-y-auto space-y-6">

          {/* ── STEP 1: Basic Info ─────────────────────────────── */}
          <div className="grid grid-cols-2 gap-5">
            <div className="col-span-2">
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Product Package Brand Name</label>
              <input
                type="text"
                value={packageName}
                onChange={e => setPackageName(e.target.value)}
                placeholder="e.g., Global Payment Hub"
                className="w-full text-sm font-bold text-slate-800 bg-white/60 border border-slate-200/80 rounded-xl p-3 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/20 outline-none transition-all shadow-sm"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Business Domain</label>
              <select
                value={domain}
                onChange={e => handleBusinessDomainChange(e.target.value)}
                className="w-full text-sm font-bold text-slate-800 bg-white/60 border border-slate-200/80 rounded-xl p-3 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/20 outline-none transition-all shadow-sm"
              >
                <option value="Payments">Payments &amp; Clearing</option>
                <option value="Treasury">Treasury Management</option>
                <option value="Cards">Card Payments</option>
                <option value="ATM">ATM Channel</option>
                <option value="Supply Chain">Supply Chain Finance</option>
                <option value="Retail">Retail Banking</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Jurisdiction</label>
                <input
                  type="text"
                  value={country}
                  onChange={e => setCountry(e.target.value)}
                  className="w-full text-sm font-semibold font-mono text-slate-800 bg-white/60 border border-slate-200/80 rounded-xl p-3 focus:border-indigo-500 outline-none transition-all shadow-sm text-center"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Base Currency</label>
                <input
                  type="text"
                  value={currency}
                  onChange={e => setCurrency(e.target.value)}
                  className="w-full text-sm font-semibold font-mono text-slate-800 bg-white/60 border border-slate-200/80 rounded-xl p-3 focus:border-indigo-500 outline-none transition-all shadow-sm text-center"
                />
              </div>
            </div>
            <div className="col-span-2 flex items-center justify-between p-3.5 bg-slate-50 border border-slate-200/80 rounded-xl shadow-sm">
              <div>
                <label className="block text-xs font-bold text-slate-700">Use ISO 20022 Standard Field Names</label>
                <p className="text-[10px] text-slate-400 font-medium mt-0.5">Prioritize ISO dot-notation standard names (e.g. Settlement.CurrencyCode) over Bank Custom Names.</p>
              </div>
              <input
                type="checkbox"
                checked={useIsoStandards}
                onChange={e => setUseIsoStandards(e.target.checked)}
                className="w-4.5 h-4.5 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500 cursor-pointer"
              />
            </div>
          </div>

          {/* ── STEP 2: ISO Domain Multi-select ───────────────── */}
          <div className="border border-indigo-100 bg-indigo-50/30 rounded-2xl overflow-hidden">
            <div className="flex justify-between items-center px-5 py-3.5 border-b border-indigo-100 bg-indigo-50/60">
              <div>
                <h3 className="text-[10px] font-bold text-indigo-700 uppercase tracking-wider">ISO Field Domains Covered by This Package</h3>
                <p className="text-[10px] text-indigo-400 mt-0.5">These domains determine which ISO fields are available and how the package sidebar is organised.</p>
              </div>
              <span className="text-[10px] font-bold text-indigo-600 bg-indigo-100 px-2.5 py-1 rounded-lg">
                {selectedDomains.length} selected
              </span>
            </div>
            <div className="p-5 grid grid-cols-3 gap-2.5">
              {allDomains.map((d: any) => {
                const isSelected = selectedDomains.includes(d.domain_code);
                return (
                  <button
                    key={d.domain_code}
                    type="button"
                    onClick={() => toggleIsoDomain(d.domain_code)}
                    className={`flex items-center gap-2.5 p-3 rounded-xl border text-left transition-all ${
                      isSelected
                        ? 'bg-indigo-600 border-indigo-600 text-white shadow-md shadow-indigo-600/20'
                        : 'bg-white border-slate-200 text-slate-600 hover:border-indigo-300 hover:bg-indigo-50/50'
                    }`}
                  >
                    <span className="text-lg shrink-0">{d.icon}</span>
                    <div className="min-w-0">
                      <div className={`text-[11px] font-bold truncate ${isSelected ? 'text-white' : 'text-slate-700'}`}>
                        {d.domain_display_name}
                      </div>
                      <div className={`text-[9px] mt-0.5 ${isSelected ? 'text-indigo-200' : 'text-slate-400'}`}>
                        {d.subdomains?.length} subdomains
                      </div>
                    </div>
                    {isSelected && (
                      <svg className="w-4 h-4 shrink-0 ml-auto" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/>
                      </svg>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── STEP 3: Studio Configuration Checklist ─────────── */}
          <div className="border border-slate-150 bg-slate-50/20 rounded-2xl overflow-hidden">
            <div className="flex justify-between items-center px-5 py-3.5 border-b border-slate-150 bg-slate-50/60">
              <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Configuration Checklist — Canva Studios</h3>
              <button
                onClick={() => setModules([...modules, { module_name: 'Custom Module', owner: 'Team', sla_days: 3 }])}
                className="text-indigo-600 text-[11px] font-bold hover:underline"
              >
                + Add Module
              </button>
            </div>
            <div className="p-5 space-y-3">
              {modules.map((m, idx) => (
                <div key={idx} className="flex gap-3">
                  <div className="flex-1">
                    <input
                      type="text"
                      value={m.module_name}
                      onChange={e => { const nm = [...modules]; nm[idx].module_name = e.target.value; setModules(nm); }}
                      className="w-full text-xs font-semibold text-slate-700 bg-white/60 border border-slate-200/80 rounded-xl p-2.5 focus:border-indigo-500 outline-none transition-all"
                      placeholder="Module Name"
                    />
                  </div>
                  <div className="w-1/3">
                    <input
                      type="text"
                      value={m.owner}
                      onChange={e => { const nm = [...modules]; nm[idx].owner = e.target.value; setModules(nm); }}
                      className="w-full text-xs font-semibold text-slate-700 bg-white/60 border border-slate-200/80 rounded-xl p-2.5 focus:border-indigo-500 outline-none transition-all"
                      placeholder="Owner"
                    />
                  </div>
                  <div className="w-28 relative">
                    <input
                      type="number"
                      value={m.sla_days}
                      onChange={e => { const nm = [...modules]; nm[idx].sla_days = parseInt(e.target.value); setModules(nm); }}
                      className="w-full text-xs font-semibold text-slate-700 bg-white/60 border border-slate-200/80 rounded-xl p-2.5 pr-10 focus:border-indigo-500 outline-none transition-all text-center"
                    />
                    <span className="absolute right-3 top-3 text-[9px] text-slate-400 font-bold uppercase">Days</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-8 py-5 bg-slate-50/80 border-t border-slate-150 flex items-center justify-between shadow-inner">
          <p className="text-[10px] text-slate-400 font-medium">
            {selectedDomains.length === 0
              ? '⚠ Select at least one ISO domain to continue'
              : `${selectedDomains.length} ISO domains · ${modules.length} studio modules`}
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => setWizardOpen(false)}
              className="px-5 py-2.5 text-[13px] font-bold text-slate-600 bg-white border border-slate-250 rounded-xl hover:bg-slate-50 transition-colors shadow-sm"
            >
              Cancel
            </button>
            <button
              disabled={createPackageMutation.isPending || !packageName || selectedDomains.length === 0}
              onClick={() => createPackageMutation.mutate()}
              className="px-6 py-2.5 text-[13px] font-bold text-white bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 rounded-xl shadow-md shadow-indigo-600/15 transition-all active:scale-[0.98] disabled:opacity-50"
            >
              {createPackageMutation.isPending ? 'Initializing...' : 'Initialize Package'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
