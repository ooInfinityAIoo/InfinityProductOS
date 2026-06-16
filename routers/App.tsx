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

function App() {
  const activeModule = usePlatformStore((state) => state.activeModule);

  return (
    <div className="min-h-screen bg-[#F1F5F9] text-slate-900 font-sans">
      <MasterHeaderNav />
      
      <main className="max-w-[1650px] mx-auto mt-6 px-6">
        <Suspense fallback={
          <div className="flex flex-col h-[750px] w-full items-center justify-center text-slate-500 font-bold bg-white border border-slate-200 rounded shadow-sm animate-pulse">
            <svg className="animate-spin mb-4 h-10 w-10 text-[#0176D3]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            Loading Studio Module...
          </div>
        }>
          {activeModule === 'dashboard' && (
            <HomeDashboard />
          )}
          
          {activeModule === 'workflow-designer' && (
            <div className="bg-white border border-slate-200 rounded shadow-sm h-[750px]">
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
        </Suspense>
      </main>
    </div>
  );
}
export default App;