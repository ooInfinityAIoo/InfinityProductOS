import React from 'react';
import { MasterHeaderNav } from './layouts/MasterHeaderNav';
import { usePlatformStore } from './store/usePlatformStore';
import { HomeDashboard } from './features/dashboard/HomeDashboard';
import { WorkflowCanvas } from './features/workflow-designer/WorkflowCanvas';
import { FieldRegistryStudio } from './features/field-registry/FieldRegistryStudio';
import { IngestionPipelineStudio } from './features/ingestion/IngestionPipelineStudio';
import { DataGatewayStudio } from './features/mappers/DataGatewayStudio';
import { CalculationEngineStudio } from './features/calculation-engine/CalculationEngineStudio';
import { BusinessRulesStudio } from './features/rules-designer/BusinessRulesStudio';
import { ApiDesignerStudio } from './features/integrations/ApiDesignerStudio';
import { AiAssistantStudio } from './features/ai-assistant/AiAssistantStudio';
import { ScreenDesignerStudio } from './features/screens/ScreenDesignerStudio';

function App() {
  const activeModule = usePlatformStore((state) => state.activeModule);

  return (
    <div className="min-h-screen bg-[#F1F5F9] text-slate-900 font-sans">
      <MasterHeaderNav />
      
      <main className="max-w-[1650px] mx-auto mt-6 px-6">
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
      </main>
    </div>
  );
}
export default App;