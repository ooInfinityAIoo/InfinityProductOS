import { create } from 'zustand';

// --- Type Definitions (Will eventually be synced from OpenAPI) ---
export type LanguageCode = 'EN' | 'ES' | 'DE';
docuexport type UserRole = 'ADMIN' | 'OPERATOR' | 'AUDITOR' | 'VIEWER' | 'SALES' | 'RISK' | 'C_LEVEL';
export type ViewMode = 'LIST' | 'CREATE' | 'EDIT' | 'VIEW';

export interface PlatformState {
  // --- Global Application Context ---
  activeProductContext: string | null;
  currentLanguage: LanguageCode;
  globalAdminDesignerMode: boolean;
  userRole: UserRole;
  
  // --- Navigation & Routing State ---
  activeModule: 'dashboard' | 'workflow-designer' | 'business-rules' | 'calculation-engine' | 'dge-canvas' | 'api-designer' | 'screen-designer' | 'masters-config' | 'field-registry' | 'ingestion-pipeline' | 'ai-assistant' | 'insights-factory' | 'event-repository' | 'execution-audit' | 'behavioral-profiles' | 'reconciliation-engine' | 'recon-tracking' | 'report-designer' | 'document-master' | 'unstructured-document-studio' | 'file-template-designer' | null;
  viewMode: ViewMode;
  hasUnsavedChanges: boolean;
  isWizardOpen: boolean;
  
  // --- Actions ---
  setLanguage: (lang: LanguageCode) => void;
  toggleAdminMode: () => void;
  setProductContext: (productName: string | null) => void;
  setActiveModule: (moduleName: PlatformState['activeModule']) => void;
  setUserRole: (role: UserRole) => void;
  setViewMode: (mode: ViewMode) => void;
  setHasUnsavedChanges: (hasChanges: boolean) => void;
  setWizardOpen: (isOpen: boolean) => void;
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
  currentLanguage: 'EN',
  globalAdminDesignerMode: false,
  activeModule: 'dashboard',
  userRole: 'ADMIN', // Defaulting to Admin for development
  viewMode: 'LIST',
  hasUnsavedChanges: false,
  isWizardOpen: false,

  // State Mutators
  setLanguage: (lang) => set({ currentLanguage: lang }),
  
  toggleAdminMode: () => set((state) => ({ 
    globalAdminDesignerMode: !state.globalAdminDesignerMode 
  })),
  
  setProductContext: (productName) => set({ 
    activeProductContext: productName,
    // When setting a product context, automatically navigate to the dashboard
    activeModule: productName ? 'dashboard' : null,
    viewMode: 'LIST',
    hasUnsavedChanges: false
  }),
  
  setActiveModule: (moduleName) => set({ 
    activeModule: moduleName,
    viewMode: 'LIST' // Reset view mode when switching modules
  }),
  setUserRole: (role) => set({ userRole: role }),
  setViewMode: (mode) => set({ viewMode: mode }),
  setHasUnsavedChanges: (hasChanges) => set({ hasUnsavedChanges: hasChanges }),
  setWizardOpen: (isOpen) => set({ isWizardOpen: isOpen })
}));