import React, { Suspense, lazy } from 'react';
import { MasterHeaderNav } from './layouts/MasterHeaderNav';
import { usePlatformStore } from './store/usePlatformStore';
import { StudioErrorBoundary } from './components/StudioErrorBoundary';

// Phase 1 Decomposition: Lazy loading the studios to split the Monolithic bundle
const HomeDashboard = lazy(() => import('./features/dashboard/HomeDashboard').then(m => ({ default: m.HomeDashboard })));
const WorkflowCanvas = lazy(() => import('./features/workflow-designer/WorkflowCanvas').then(m => ({ default: m.WorkflowCanvas })));
const FieldRegistryStudio = lazy(() => import('./features/field-registry/FieldRegistryStudio').then(m => ({ default: m.FieldRegistryStudio })));
const IngestionPipelineStudio = lazy(() => import('./features/ingestion/IngestionPipelineStudio').then(m => ({ default: m.IngestionPipelineStudio })));
const DataGatewayStudio = lazy(() => import('./features/mappers/DataGatewayStudio').then(m => ({ default: m.DataGatewayStudio })));
const CalculationEngineStudio = lazy(() => import('./features/calculation-engine/CalculationEngineStudio').then(m => ({ default: m.CalculationEngineStudio })));
const BusinessRulesStudio = lazy(() => import('./features/rules-designer/BusinessRulesStudio').then(m => ({ default: m.BusinessRulesStudio })));
const ApiDesignerStudio = lazy(() => import('./features/integrations/ApiDesignerStudio').then(m => ({ default: m.ApiDesignerStudio })));
const BatchGatewayDesignerStudio = lazy(() => import('./features/batch-gateway/BatchGatewayDesignerStudio').then(m => ({ default: m.BatchGatewayDesignerStudio })));
const AiAssistantStudio = lazy(() => import('./features/ai-assistant/AiAssistantStudio').then(m => ({ default: m.AiAssistantStudio })));
const ScreenDesignerStudio = lazy(() => import('./features/screens/ScreenDesignerStudio').then(m => ({ default: m.ScreenDesignerStudio })));
const InsightsFactoryStudio = lazy(() => import('./features/insights/InsightsFactoryStudio').then(m => ({ default: m.InsightsFactoryStudio })));
const EventRepositoryStudio = lazy(() => import('./features/events/EventRepositoryStudio').then(m => ({ default: m.EventRepositoryStudio })));
const ExecutionAuditStudio = lazy(() => import('./features/audit/ExecutionAuditStudio').then(m => ({ default: m.ExecutionAuditStudio })));
const BehavioralProfileViewer = lazy(() => import('./features/behavioral-ai/BehavioralProfileViewer').then(m => ({ default: m.BehavioralProfileViewer })));
const ReconciliationEngineStudio = lazy(() => import('./features/reconciliation/ReconciliationEngineStudio').then(m => ({ default: m.ReconciliationEngineStudio })));
const ReconciliationTrackingDashboard = lazy(() => import('./features/reconciliation/ReconciliationTrackingDashboard').then(m => ({ default: m.ReconciliationTrackingDashboard })));
const ReportDesignerStudio = lazy(() => import('./features/reporting/ReportDesignerStudio').then(m => ({ default: m.ReportDesignerStudio })));
const UnstructuredDocStudio = lazy(() => import('./features/unstructured-docs/UnstructuredDocStudio').then(m => ({ default: m.UnstructuredDocStudio })));
const FileTemplateDesignerStudio = lazy(() => import('./features/templates/FileTemplateDesignerStudio').then(m => ({ default: m.FileTemplateDesignerStudio })));
const EntitlementConfigStudio = lazy(() => import('./features/entitlements/EntitlementConfigStudio').then(m => ({ default: m.EntitlementConfigStudio })));
const DocumentTemplateDesigner = lazy(() => import('./features/comm-templates/DocumentTemplateDesigner').then(m => ({ default: m.DocumentTemplateDesigner })));
const DocumentChecklistCanvas = lazy(() => import('./features/doc-checklists/DocumentChecklistCanvas').then(m => ({ default: m.DocumentChecklistCanvas })));
const NotificationEngineStudio = lazy(() => import('./features/notification-engine/NotificationEngineStudio').then(m => ({ default: m.NotificationEngineStudio })));
const PackageDashboard = lazy(() => import('./features/dashboard/PackageDashboard').then(m => ({ default: m.PackageDashboard })));
const ProductsRegistry = lazy(() => import('./features/dashboard/PackageDashboard').then(m => ({ default: m.ProductsRegistry })));
const GlobalTechnicalDashboard = lazy(() => import('./features/dashboard/GlobalTechnicalDashboard').then(m => ({ default: m.GlobalTechnicalDashboard })));
const PackageRuntimeShell = lazy(() => import('./features/package-runtime/PackageRuntimeShell').then(m => ({ default: m.PackageRuntimeShell })));
const LegacyOnboardingStudio = lazy(() => import('./features/legacy-onboarding/LegacyOnboardingStudio').then(m => ({ default: m.LegacyOnboardingStudio })));
const ProductRegistryStudio = lazy(() => import('./features/product-registry/ProductRegistryStudio').then(m => ({ default: m.ProductRegistryStudio })));
const SubProductRegistryStudio = lazy(() => import('./features/subproduct-registry/SubProductRegistryStudio').then(m => ({ default: m.SubProductRegistryStudio })));
const QueueInfrastructureStudio = lazy(() => import('./features/queue-infrastructure/QueueInfrastructureStudio').then(m => ({ default: m.QueueInfrastructureStudio })));
const AuthorizationMatrixStudio = lazy(() => import('./features/entitlements/AuthorizationMatrixStudio').then(m => ({ default: m.AuthorizationMatrixStudio })));
const RoleProfileStudio = lazy(() => import('./features/entitlements/RoleProfileStudio').then(m => ({ default: m.RoleProfileStudio })));
const UserProfileStudio = lazy(() => import('./features/entitlements/UserProfileStudio').then(m => ({ default: m.UserProfileStudio })));
// E1 (TRANSACTION_SCREEN_DESIGN.md §2) — runtime operator UI: metro tracker for a single live transaction.
const TransactionWorkflowScreen = lazy(() => import('./features/transaction-screen/TransactionWorkflowScreen').then(m => ({ default: m.TransactionWorkflowScreen })));

function App() {
  const activeModule = usePlatformStore((state) => state.activeModule);
  const activeProductContext = usePlatformStore((state) => state.activeProductContext);

  return (
    <div className="min-h-screen text-slate-800 font-sans antialiased">
      <MasterHeaderNav />
      
      <main className="max-w-[1680px] mx-auto mt-8 px-6 pb-12 animate-fade-in">
        <Suspense fallback={
          <div className="flex flex-col h-[650px] w-full items-center justify-center text-slate-500 font-semibold bg-white/50 backdrop-blur-md border border-white/20 rounded-2xl shadow-glass">
            <div className="relative flex items-center justify-center mb-6">
              <div className="absolute w-16 h-16 rounded-full border-4 border-indigo-100 border-t-indigo-600 animate-spin"></div>
              <div className="w-10 h-10 rounded-full bg-indigo-50 flex items-center justify-center font-extrabold text-indigo-600 text-sm shadow-inner">
                ∞
              </div>
            </div>
            <span className="text-xs font-bold tracking-widest uppercase text-slate-400">Loading Studio Module...</span>
          </div>
        }>
          {/* key={activeModule}: remounts the boundary on every studio switch so a
              crash in one studio is cleared the moment the user navigates elsewhere. */}
          <StudioErrorBoundary key={activeModule ?? 'none'} moduleName={activeModule ?? 'studio'}>
          {activeModule === 'dashboard' && (
            <HomeDashboard />
          )}

          {activeModule === 'domain-dashboard' && activeProductContext && (
            <PackageDashboard packageName={activeProductContext} />
          )}
          {activeModule === 'global-technical-dashboard' && (
            <GlobalTechnicalDashboard />
          )}
          {activeModule === 'products-registry' && activeProductContext && (
            <ProductsRegistry packageName={activeProductContext} />
          )}
          
          {activeModule === 'workflow-designer' && (
            <div className="bg-white/85 backdrop-blur-md border border-white/30 rounded-2xl shadow-glass min-h-[750px]">
               <WorkflowCanvas />
            </div>
          )}
          
          {activeModule === 'field-registry' && <FieldRegistryStudio />}
          
          {activeModule === 'ingestion-pipeline' && <IngestionPipelineStudio />}
          
          {activeModule === 'dge-canvas' && <DataGatewayStudio />}
          
          {activeModule === 'calculation-engine' && <CalculationEngineStudio />}
          
          {activeModule === 'business-rules' && <BusinessRulesStudio />}
          
          {activeModule === 'api-designer' && <ApiDesignerStudio />}
          {activeModule === 'batch-gateway-designer' && <BatchGatewayDesignerStudio />}

          {activeModule === 'ai-assistant' && <AiAssistantStudio />}

          {activeModule === 'screen-designer' && <ScreenDesignerStudio />}

          {activeModule === 'insights-factory' && <InsightsFactoryStudio />}
          
          {activeModule === 'event-repository' && <EventRepositoryStudio />}

          {activeModule === 'execution-audit' && <ExecutionAuditStudio />}

          {activeModule === 'behavioral-profiles' && <BehavioralProfileViewer />}

          {activeModule === 'reconciliation-engine' && <ReconciliationEngineStudio />}
          
          {activeModule === 'recon-tracking' && <ReconciliationTrackingDashboard />}

          {activeModule === 'report-designer' && <ReportDesignerStudio />}

{activeModule === 'unstructured-document-studio' && <UnstructuredDocStudio />}

          {activeModule === 'file-template-designer' && <FileTemplateDesignerStudio />}
          {activeModule === 'entitlements' && <EntitlementConfigStudio />}
          {activeModule === 'comm-templates' && <DocumentTemplateDesigner />}
          {activeModule === 'doc-checklists' && <DocumentChecklistCanvas />}
          {activeModule === 'notification-engine' && <NotificationEngineStudio />}

          {/* WS-12: Package Runtime Mode — deployed banking product UX with sidebar nav */}
          {(activeModule === 'package-runtime' || activeModule === 'runtime-transaction-shell') && (
            <PackageRuntimeShell />
          )}

          {/* WS-4: Legacy Onboarding Studio — screenshot → AI extraction → Screen Designer */}
          {activeModule === 'legacy-onboarding' && <LegacyOnboardingStudio />}
          {activeModule === 'product-registry' && <ProductRegistryStudio />}
          {activeModule === 'subproduct-registry' && <SubProductRegistryStudio />}
          {activeModule === 'queue-infrastructure' && <QueueInfrastructureStudio />}
          {activeModule === 'authorization-matrix' && <AuthorizationMatrixStudio />}
          {activeModule === 'role-profiles' && <RoleProfileStudio />}
          {activeModule === 'user-profiles' && <UserProfileStudio />}
          {activeModule === 'transaction-workflow-screen' && <TransactionWorkflowScreen />}
          </StudioErrorBoundary>
        </Suspense>
      </main>
    </div>
  );
}
export default App;