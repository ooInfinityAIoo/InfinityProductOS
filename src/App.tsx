import React, { Suspense, lazy } from 'react';
import { MasterHeaderNav } from './layouts/MasterHeaderNav';
import { usePlatformStore } from './store/usePlatformStore';

// Phase 1 Decomposition: Lazy loading the studios to split the Monolithic bundle
const HomeDashboard = lazy(() => import('./features/dashboard/HomeDashboard').then(m => ({ default: m.HomeDashboard })));
const WorkflowCanvas = lazy(() => import('./features/workflow-designer/WorkflowCanvas').then(m => ({ default: m.WorkflowCanvas })));
const FieldRegistryStudio = lazy(() => import('./features/field-registry/FieldRegistryStudio').then(m => ({ default: m.FieldRegistryStudio })));
const IngestionPipelineStudio = lazy(() => import('./features/ingestion/IngestionPipelineStudio').then(m => ({ default: m.IngestionPipelineStudio })));
const DataGatewayStudio = lazy(() => import('./features/mappers/DataGatewayStudio').then(m => ({ default: m.DataGatewayStudio })));
const CalculationEngineStudio = lazy(() => import('./features/calculation-engine/CalculationEngineStudio').then(m => ({ default: m.CalculationEngineStudio })));
const BusinessRulesStudio = lazy(() => import('./features/rules-designer/BusinessRulesStudio').then(m => ({ default: m.BusinessRulesStudio })));
const ApiDesignerStudio = lazy(() => import('./features/integrations/ApiDesignerStudio').then(m => ({ default: m.ApiDesignerStudio })));
const AiAssistantStudio = lazy(() => import('./features/ai-assistant/AiAssistantStudio').then(m => ({ default: m.AiAssistantStudio })));
const ScreenDesignerStudio = lazy(() => import('./features/screens/ScreenDesignerStudio').then(m => ({ default: m.ScreenDesignerStudio })));
const InsightsFactoryStudio = lazy(() => import('./features/insights/InsightsFactoryStudio').then(m => ({ default: m.InsightsFactoryStudio })));
const EventRepositoryStudio = lazy(() => import('./features/events/EventRepositoryStudio').then(m => ({ default: m.EventRepositoryStudio })));
const ExecutionAuditStudio = lazy(() => import('./features/audit/ExecutionAuditStudio').then(m => ({ default: m.ExecutionAuditStudio })));
const BehavioralProfileViewer = lazy(() => import('./features/behavioral-ai/BehavioralProfileViewer').then(m => ({ default: m.BehavioralProfileViewer })));
const ReconciliationEngineStudio = lazy(() => import('./features/reconciliation/ReconciliationEngineStudio').then(m => ({ default: m.ReconciliationEngineStudio })));
const ReconciliationTrackingDashboard = lazy(() => import('./features/reconciliation/ReconciliationTrackingDashboard').then(m => ({ default: m.ReconciliationTrackingDashboard })));
const ReportDesignerStudio = lazy(() => import('./features/reporting/ReportDesignerStudio').then(m => ({ default: m.ReportDesignerStudio })));
const DocumentMasterStudio = lazy(() => import('./features/masters/DocumentMasterStudio').then(m => ({ default: m.DocumentMasterStudio })));
const UnstructuredDocStudio = lazy(() => import('./features/unstructured-docs/UnstructuredDocStudio').then(m => ({ default: m.UnstructuredDocStudio })));
const FileTemplateDesignerStudio = lazy(() => import('./features/templates/FileTemplateDesignerStudio').then(m => ({ default: m.FileTemplateDesignerStudio })));
const EntitlementConfigStudio = lazy(() => import('./features/entitlements/EntitlementConfigStudio').then(m => ({ default: m.EntitlementConfigStudio })));
const DocumentTemplateDesigner = lazy(() => import('./features/comm-templates/DocumentTemplateDesigner').then(m => ({ default: m.DocumentTemplateDesigner })));
const DocumentChecklistCanvas = lazy(() => import('./features/doc-checklists/DocumentChecklistCanvas').then(m => ({ default: m.DocumentChecklistCanvas })));
const NotificationEngineStudio = lazy(() => import('./features/notification-engine/NotificationEngineStudio').then(m => ({ default: m.NotificationEngineStudio })));
const PackageDashboard = lazy(() => import('./features/dashboard/PackageDashboard').then(m => ({ default: m.PackageDashboard })));
const ProductsRegistry = lazy(() => import('./features/dashboard/PackageDashboard').then(m => ({ default: m.ProductsRegistry })));
const GlobalTechnicalDashboard = lazy(() => import('./features/dashboard/GlobalTechnicalDashboard').then(m => ({ default: m.GlobalTechnicalDashboard })));

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

          {activeModule === 'ai-assistant' && <AiAssistantStudio />}

          {activeModule === 'screen-designer' && <ScreenDesignerStudio />}

          {activeModule === 'insights-factory' && <InsightsFactoryStudio />}
          
          {activeModule === 'event-repository' && <EventRepositoryStudio />}

          {activeModule === 'execution-audit' && <ExecutionAuditStudio />}

          {activeModule === 'behavioral-profiles' && <BehavioralProfileViewer />}

          {activeModule === 'reconciliation-engine' && <ReconciliationEngineStudio />}
          
          {activeModule === 'recon-tracking' && <ReconciliationTrackingDashboard />}

          {activeModule === 'report-designer' && <ReportDesignerStudio />}

          {activeModule === 'document-master' && <DocumentMasterStudio />}

          {activeModule === 'unstructured-document-studio' && <UnstructuredDocStudio />}

          {activeModule === 'file-template-designer' && <FileTemplateDesignerStudio />}
          {activeModule === 'entitlements' && <EntitlementConfigStudio />}
          {activeModule === 'comm-templates' && <DocumentTemplateDesigner />}
          {activeModule === 'doc-checklists' && <DocumentChecklistCanvas />}
          {activeModule === 'notification-engine' && <NotificationEngineStudio />}
        </Suspense>
      </main>
    </div>
  );
}
export default App;