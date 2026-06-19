// WHY THIS FILE EXISTS:
// Screen Designer Studio — lets business ops users build three types of screens
// without writing code:
//   TYPE 1 MAINTENANCE: Master data entry screens (define once, lifetime of product)
//   TYPE 2 CONFIGURATION: Screens whose field values drive workflow routing conditions
//   TYPE 3 TRANSACTION: Human-in-the-loop screens attached to a live workflow step
//
// WHAT BREAKS IF REMOVED: Banks cannot configure data entry UIs for their products.
// All workflow human-approval steps lose their screen. Static master data (counterparty
// tables, currency lists) have no maintenance UI.
//
// PRODUCT GATE: A product must be selected before any screen can be configured.
// Screens are product-specific — a CHIPS screen is not valid for FEDWIRE.

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import { usePlatformStore } from '../../store/usePlatformStore';
import { CockpitLockBanner } from '../../components/CockpitLockBanner';
import { useToast, ToastContainer } from '../../components/Toast';

import { ScreenList } from './ScreenList';
import { ScreenCanvas } from './ScreenCanvas';
import { DraftConfirmationModal } from './DraftConfirmationModal';
import { ApiGeneratorModal } from '../integrations/ApiGeneratorModal';

export const ScreenDesignerStudio: React.FC = () => {
  const queryClient = useQueryClient();
  const { viewMode, setViewMode, hasUnsavedChanges, setHasUnsavedChanges, userRole, activeCoreProductId } = usePlatformStore();
  const { toasts, showToast, dismissToast } = useToast();
  
  const [selectedScreen, setSelectedScreen] = useState<any>(null);
  const [showDraftModal, setShowDraftModal] = useState(false);
  const [showApiModal, setShowApiModal] = useState(false);
  const [pendingApi, setPendingApi] = useState<any>(null);
  
  const isReadOnly = viewMode === 'VIEW' || userRole === 'AUDITOR' || userRole === 'VIEWER';

  // Form State
  const [screenName, setScreenName] = useState('');
  const [description, setDescription] = useState('');
  const [templateCategory, setTemplateCategory] = useState('COMMON_MASTER');
  const [components, setComponents] = useState([
    { component_type: 'text_input', label_token: '', field_binding: '', category: 'USER_DEFINED', requirement_status: 'MANDATORY', conditional_rule_id: '' }
  ]);

  // --- DYNAMIC API BINDINGS ---
  
  // 1. Fetch Existing Screen Templates
  const { data: screensData, isLoading: isLoadingScreens } = useQuery({
    queryKey: ['screens'],
    queryFn: async () => (await apiClient.get('/screens/')).data
  });

  // 2. Fetch ISO Field Registry (For data binding dropdowns)
  const { data: fieldsData } = useQuery({
    queryKey: ['fields-all'],
    queryFn: async () => (await apiClient.get('/fields/registry?limit=1000')).data
  });

  // 3. Fetch Business Rules (For Conditional bindings)
  const { data: rulesData } = useQuery({
    queryKey: ['rules'],
    queryFn: async () => (await apiClient.get('/rules/')).data
  });

  const createScreenMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        screen_name: screenName,
        description: description,
        screen_template_category: templateCategory,
        pending_api_config: pendingApi,
        linked_api_id: selectedScreen?.linked_api_id || null,
        definition: components.filter(c => c.label_token), // Only send populated components
        action_buttons: [],
        value_list_groups: []
      };
      const res = await apiClient.post('/screens/', payload);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['screens'] });
      setViewMode('LIST');
      setHasUnsavedChanges(false);
      
      // Reset form
      setScreenName('');
      setDescription('');
      setTemplateCategory('COMMON_MASTER');
      setComponents([{ component_type: 'text_input', label_token: '', field_binding: '', category: 'USER_DEFINED', requirement_status: 'MANDATORY', conditional_rule_id: '' }]);
      setPendingApi(null);
    }
  });

  // --- AI WIREFRAME EXTRACTION MUTATION ---
  const aiExtractMutation = useMutation({
    mutationFn: async (payload: { image_base64: string, image_mime_type: string }) => {
      const res = await apiClient.post('/assistant/wireframe-to-screen', payload);
      return res.data;
    },
    onSuccess: (data) => {
      if (data.components && data.components.length > 0) {
        setComponents(data.components);
        setHasUnsavedChanges(true);
      }
    },
    onError: (err: any) => {
      showToast(err.response?.data?.detail || 'Failed to process wireframe image.', 'error');
    }
  });

  const handleInputChange = (setter: Function, value: any) => {
    setter(value);
    setHasUnsavedChanges(true);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (event) => {
      const base64String = (event.target?.result as string).split(',')[1];
      const mimeType = file.type || (file.name.endsWith('.csv') ? 'text/csv' : 'application/octet-stream');
      aiExtractMutation.mutate({ image_base64: base64String, image_mime_type: mimeType });
    };
    reader.readAsDataURL(file);
  };

  const handleAddComponentRow = () => {
    setComponents([...components, { component_type: 'text_input', label_token: '', field_binding: '', category: 'USER_DEFINED', requirement_status: 'NON_MANDATORY', conditional_rule_id: '' }]);
    setHasUnsavedChanges(true);
  };

  // --- DYNAMIC API ENDPOINT GENERATOR ---
  const handleOpenApiDesigner = () => {
    const requestSchema: any = {};
    const responseSchema: any = {};
    
    components.forEach(c => {
       if (c.field_binding) {
          requestSchema[c.field_binding] = c.component_type === 'number_input' ? "number" : "string";
          responseSchema[c.field_binding] = c.component_type === 'number_input' ? "number" : "string";
       }
    });
    
    setPendingApi(pendingApi || {
       api_name: `${screenName || 'NEW_SCREEN'}_DYNAMIC_API`,
       http_method: 'POST',
       url_template: `https://api.internal.bank/v1/dynamic/${screenName?.toLowerCase() || 'screen'}`,
       request_body_template: requestSchema,
       response_contract: responseSchema,
       description: `Auto-generated endpoint for ${screenName}`
    });
    setShowApiModal(true);
  };

  // --- NAVIGATION & DRAFT HANDLING ---
  const handleBackNavigation = () => {
    if (hasUnsavedChanges) {
      setShowDraftModal(true);
    } else {
      setViewMode('LIST');
      setSelectedScreen(null);
    }
  };

  const handleSaveDraft = () => {
    createScreenMutation.mutate(); // Saves as DRAFT backend status
    setShowDraftModal(false);
  };

  const handleDiscardChanges = () => {
    setHasUnsavedChanges(false);
    setShowDraftModal(false);
    setViewMode('LIST');
    setPendingApi(null);
  };

  return (
    <div className="flex flex-col w-full">
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
      <CockpitLockBanner />
      <div className={`flex gap-6 h-[750px] transition-all duration-300 ${!activeCoreProductId ? 'opacity-30 pointer-events-none grayscale' : ''}`}>
      <ScreenList
        viewMode={viewMode}
        isReadOnly={isReadOnly}
        isLoadingScreens={isLoadingScreens}
        screensData={screensData}
        selectedScreen={selectedScreen}
        setViewMode={setViewMode}
        setSelectedScreen={setSelectedScreen}
        setHasUnsavedChanges={setHasUnsavedChanges}
      />

      <ScreenCanvas
        viewMode={viewMode}
        isReadOnly={isReadOnly}
        selectedScreen={selectedScreen}
        screenName={screenName}
        setScreenName={setScreenName}
        description={description}
        setDescription={setDescription}
        templateCategory={templateCategory}
        setTemplateCategory={setTemplateCategory}
        components={components}
        setComponents={setComponents}
        pendingApi={pendingApi}
        fieldsData={fieldsData}
        rulesData={rulesData}
        handleInputChange={handleInputChange}
        handleAddComponentRow={handleAddComponentRow}
        handleOpenApiDesigner={handleOpenApiDesigner}
        handleImageUpload={handleImageUpload}
        aiExtractMutation={aiExtractMutation}
        createScreenMutation={createScreenMutation}
        setShowApiModal={setShowApiModal}
        handleBackNavigation={handleBackNavigation}
        setViewMode={setViewMode}
      />

      {showDraftModal && (
        <DraftConfirmationModal
          handleDiscardChanges={handleDiscardChanges}
          handleSaveDraft={handleSaveDraft}
        />
      )}

      {showApiModal && pendingApi && (
        <ApiGeneratorModal
          pendingApi={pendingApi}
          setPendingApi={setPendingApi}
          setShowApiModal={setShowApiModal}
          setHasUnsavedChanges={setHasUnsavedChanges}
        />
      )}
      </div>
    </div>
  );
};