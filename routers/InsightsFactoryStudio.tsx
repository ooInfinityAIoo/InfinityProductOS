import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import { InsightList } from '../InsightList';
import { InsightCanvas } from '../InsightCanvas';

export const InsightsFactoryStudio: React.FC = () => {
  const queryClient = useQueryClient();
  const [isCreating, setIsCreating] = useState(false);
  const [selectedInsight, setSelectedInsight] = useState<any>(null);

  // Form State
  const [insightName, setInsightName] = useState('');
  const [insightCode, setInsightCode] = useState('');
  const [description, setDescription] = useState('');
  const [triggerType, setTriggerType] = useState('EVENT');
  const [triggerEvent, setTriggerEvent] = useState('NEW_TRANSACTION');
  const [triggerCron, setTriggerCron] = useState('0 0 * * 0'); // Default weekly
  const [dashboardCategory, setDashboardCategory] = useState('GLOBAL');
  const [applicableRoles, setApplicableRoles] = useState<string[]>(['C_LEVEL', 'ADMIN']);
  const [applicationPackageId, setApplicationPackageId] = useState('');
  const [analysisSteps, setAnalysisSteps] = useState<any[]>([]);

  // --- DYNAMIC API BINDINGS ---
  
  const { data: insightsData, isLoading: isLoadingInsights } = useQuery({
    queryKey: ['insights'],
    queryFn: async () => (await apiClient.get('/insights/')).data
  });

  const { data: packagesData } = useQuery({
    queryKey: ['product-packages'],
    queryFn: async () => (await apiClient.get('/masters/packages')).data
  });

  const { data: rulesData } = useQuery({
    queryKey: ['rules'],
    queryFn: async () => (await apiClient.get('/rules/')).data
  });
  
  const { data: calcData } = useQuery({
    queryKey: ['calculations'],
    queryFn: async () => (await apiClient.get('/calculations/')).data
  });
  
  const { data: apiData } = useQuery({
    queryKey: ['integrations'],
    queryFn: async () => (await apiClient.get('/integrations/')).data
  });

  // --- SYNAPTIC LINK: Fetch Live Event Dictionary ---
  const { data: eventStatus } = useQuery({
    queryKey: ['event-status'],
    queryFn: async () => (await apiClient.get('/events/status')).data
  });
  const eventTypes = eventStatus ? Object.keys(eventStatus.listeners) : [];

  const createInsightMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        insight_name: insightName,
        insight_code: insightCode,
        description: description,
        trigger_type: triggerType,
        trigger_config: triggerType === 'EVENT' ? { event_type: triggerEvent } : { cron: triggerCron },
        dashboard_category: dashboardCategory,
        applicable_roles: applicableRoles,
        application_package_id: applicationPackageId || null,
        analysis_steps: analysisSteps.filter(s => s.target_token || s.target_event_type)
      };
      const res = await apiClient.post('/insights/', payload);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['insights'] });
      setIsCreating(false);
      resetForm();
    }
  });

  const resetForm = () => {
    setInsightName('');
    setInsightCode('');
    setDescription('');
    setTriggerType('EVENT');
    setTriggerEvent('NEW_TRANSACTION');
    setTriggerCron('0 0 * * 0');
    setDashboardCategory('GLOBAL');
    setApplicableRoles(['C_LEVEL', 'ADMIN']);
    setApplicationPackageId('');
    setAnalysisSteps([]);
  };

  const handleAddStep = () => {
    setAnalysisSteps([
      ...analysisSteps, 
      { sequence_number: (analysisSteps.length + 1) * 10, step_type: 'BUSINESS_RULE', target_token: '' }
    ]);
  };

  const handleStepChange = (index: number, field: string, value: any) => {
    const newSteps = [...analysisSteps];
    newSteps[index][field] = value;
    if (field === 'step_type') {
       newSteps[index].target_token = ''; 
       newSteps[index].target_event_type = '';
    }
    setAnalysisSteps(newSteps);
  };

  const toggleRole = (role: string) => {
    if (applicableRoles.includes(role)) {
      setApplicableRoles(applicableRoles.filter(r => r !== role));
    } else {
      setApplicableRoles([...applicableRoles, role]);
    }
  };

  return (
    <div className="flex gap-6 h-[750px]">
      <InsightList
        isCreating={isCreating}
        setIsCreating={setIsCreating}
        selectedInsight={selectedInsight}
        setSelectedInsight={setSelectedInsight}
        isLoadingInsights={isLoadingInsights}
        insightsData={insightsData}
        resetForm={resetForm}
      />

      <InsightCanvas
        isCreating={isCreating}
        setIsCreating={setIsCreating}
        selectedInsight={selectedInsight}
        insightName={insightName}
        setInsightName={setInsightName}
        insightCode={insightCode}
        setInsightCode={setInsightCode}
        description={description}
        setDescription={setDescription}
        triggerType={triggerType}
        setTriggerType={setTriggerType}
        triggerEvent={triggerEvent}
        setTriggerEvent={setTriggerEvent}
        triggerCron={triggerCron}
        setTriggerCron={setTriggerCron}
        dashboardCategory={dashboardCategory}
        setDashboardCategory={setDashboardCategory}
        applicableRoles={applicableRoles}
        toggleRole={toggleRole}
        applicationPackageId={applicationPackageId}
        setApplicationPackageId={setApplicationPackageId}
        packagesData={packagesData}
        analysisSteps={analysisSteps}
        handleAddStep={handleAddStep}
        handleStepChange={handleStepChange}
        rulesData={rulesData}
        calcData={calcData}
        apiData={apiData}
        eventTypes={eventTypes}
        createInsightMutation={createInsightMutation}
      />
    </div>
  );
};