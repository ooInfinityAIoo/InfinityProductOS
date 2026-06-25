import { create } from 'zustand';

// --- Type Definitions (Will eventually be synced from OpenAPI) ---
export type LanguageCode = 'EN' | 'ES' | 'DE';
export type UserRole = 'ADMIN' | 'OPERATOR' | 'AUDITOR' | 'VIEWER' | 'SALES' | 'RISK' | 'C_LEVEL';
export type ViewMode = 'LIST' | 'CREATE' | 'EDIT' | 'VIEW';

export interface PlatformState {
  // --- Global Application Context ---
  activeProductContext: string | null;
  activeCoreProductId: string | null;
  activeCoreSubProductId: string | null;
  currentLanguage: LanguageCode;
  globalAdminDesignerMode: boolean;
  userRole: UserRole;
  
  // --- Navigation & Routing State ---
  // 'transaction-workflow-screen' is the new runtime operator UI added in E1
  // (TRANSACTION_SCREEN_DESIGN.md §2) — the metro tracker for a single live
  // transaction. Distinct from the legacy 'runtime-transaction-shell' (queue view).
  activeModule: 'dashboard' | 'domain-dashboard' | 'global-technical-dashboard' | 'products-registry' | 'product-registry' | 'master-data-explorer' | 'subproduct-registry' | 'workflow-designer' | 'business-rules' | 'calculation-engine' | 'dge-canvas' | 'api-designer' | 'screen-designer' | 'masters-config' | 'field-registry' | 'ingestion-pipeline' | 'ai-assistant' | 'insights-factory' | 'event-repository' | 'execution-audit' | 'behavioral-profiles' | 'reconciliation-engine' | 'recon-tracking' | 'report-designer' | 'unstructured-document-studio' | 'file-template-designer' | 'entitlements' | 'comm-templates' | 'doc-checklists' | 'notification-engine' | 'batch-gateway-designer' | 'package-runtime' | 'runtime-transaction-shell' | 'transaction-workflow-screen' | 'legacy-onboarding' | 'queue-infrastructure' | 'authorization-matrix' | 'role-profiles' | 'user-profiles' | null;
  viewMode: ViewMode;
  hasUnsavedChanges: boolean;
  isWizardOpen: boolean;

  // --- Workflow Draft & Context-Switching State ---
  workflowDraft: any | null;
  activeWorkflowProductContext: string | null;
  activeWorkflowSubproductContext: string | null;
  workflowReturnStepId: string | null;
  
  // --- Actions ---
  setLanguage: (lang: LanguageCode) => void;
  toggleAdminMode: () => void;
  setProductContext: (productName: string | null) => void;
  setCoreProductId: (productId: string | null) => void;
  setCoreSubProductId: (subProductId: string | null) => void;
  setActiveModule: (moduleName: PlatformState['activeModule']) => void;
  setUserRole: (role: UserRole) => void;
  setViewMode: (mode: ViewMode) => void;
  setHasUnsavedChanges: (hasChanges: boolean) => void;
  setWizardOpen: (isOpen: boolean) => void;
  setWorkflowDraft: (draft: any | null) => void;
  setWorkflowContexts: (product: string | null, subproduct: string | null) => void;
  setWorkflowReturnStepId: (stepId: string | null) => void;
}

/**
 * THE MASTER PLATFORM STORE
 * This completely replaces `window.platformStore` from the vanilla JS prototype.
 * Zustand provides an immutable, highly-performant state container that will 
 * automatically re-render only the React components that subscribe to a specific slice of state.
 */
export const usePlatformStore = create<PlatformState>((set) => ({
  // Initial State
  activeProductContext: null, // Null means we are on the Home Landing Page
  activeCoreProductId: null,
  activeCoreSubProductId: null,
  currentLanguage: 'EN',
  globalAdminDesignerMode: false,
  activeModule: 'dashboard',
  userRole: 'ADMIN', // Defaulting to Admin for development
  viewMode: 'LIST',
  hasUnsavedChanges: false,
  isWizardOpen: false,

  // Workflow context states
  workflowDraft: null,
  activeWorkflowProductContext: null,
  activeWorkflowSubproductContext: null,
  workflowReturnStepId: null,

  // State Mutators
  setLanguage: (lang) => set({ currentLanguage: lang }),
  
  toggleAdminMode: () => set((state) => ({ 
      globalAdminDesignerMode: !state.globalAdminDesignerMode 
  })),
  
  setProductContext: (productName) => set({ 
    activeProductContext: productName,
    activeCoreProductId: null, // Reset core product when domain changes
  activeCoreSubProductId: null,
    // When setting a product context, automatically navigate to the domain dashboard
    activeModule: productName ? 'domain-dashboard' : 'dashboard',
    viewMode: 'LIST',
    hasUnsavedChanges: false
  }),
  
  // Resetting sub-product when product changes ensures studios never show stale
  // sub-product data from a previously selected product.
  setCoreProductId: (productId) => set({ activeCoreProductId: productId, activeCoreSubProductId: null }),
  setCoreSubProductId: (subProductId) => set({ activeCoreSubProductId: subProductId }),
  
  setActiveModule: (moduleName) => set({ 
    activeModule: moduleName,
    viewMode: 'LIST' // Reset view mode when switching modules
  }),
  setUserRole: (role) => set({ userRole: role }),
  setViewMode: (mode) => set({ viewMode: mode }),
  setHasUnsavedChanges: (hasChanges) => set({ hasUnsavedChanges: hasChanges }),
  setWizardOpen: (isOpen) => set({ isWizardOpen: isOpen }),
  setWorkflowDraft: (draft) => set({ workflowDraft: draft }),
  setWorkflowContexts: (product, subproduct) => set({ activeWorkflowProductContext: product, activeWorkflowSubproductContext: subproduct }),
  setWorkflowReturnStepId: (stepId) => set({ workflowReturnStepId: stepId })
}));