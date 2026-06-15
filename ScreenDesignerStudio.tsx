import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../api/client';

export const ScreenDesignerStudio: React.FC = () => {
  const queryClient = useQueryClient();
  const [isCreating, setIsCreating] = useState(false);
  const [selectedScreen, setSelectedScreen] = useState<any>(null);

  // Form State
  const [screenName, setScreenName] = useState('');
  const [description, setDescription] = useState('');
  const [components, setComponents] = useState([
    { component_type: 'text_input', label_token: '', field_binding: '', category: 'USER_DEFINED', requirement_status: 'MANDATORY' }
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

  const createScreenMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        screen_name: screenName,
        description: description,
        definition: components.filter(c => c.label_token), // Only send populated components
        action_buttons: [],
        value_list_groups: []
      };
      const res = await apiClient.post('/screens/', payload);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['screens'] });
      setIsCreating(false);
      
      // Reset form
      setScreenName('');
      setDescription('');
      setComponents([{ component_type: 'text_input', label_token: '', field_binding: '', category: 'USER_DEFINED', requirement_status: 'MANDATORY' }]);
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
      }
    },
    onError: (err: any) => {
      alert(err.response?.data?.detail || "Failed to process image.");
    }
  });

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (event) => {
      const base64String = (event.target?.result as string).split(',')[1];
      aiExtractMutation.mutate({ image_base64: base64String, image_mime_type: file.type });
    };
    reader.readAsDataURL(file);
  };

  const handleAddComponentRow = () => {
    setComponents([...components, { component_type: 'text_input', label_token: '', field_binding: '', category: 'USER_DEFINED', requirement_status: 'NON_MANDATORY' }]);
  };

  return (
    <div className="flex gap-6 h-[750px]">
      
      {/* Left Column: List of Screens */}
      <div className="w-[400px] bg-white border border-slate-200 rounded shadow-sm flex flex-col overflow-hidden">
        <div className="p-5 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
          <div>
            <h2 className="text-[15px] font-extrabold text-slate-800 tracking-tight">Screen Library</h2>
            <p className="text-xs text-slate-500 mt-0.5">Dynamic UI Blueprints.</p>
          </div>
          <button 
            onClick={() => { setIsCreating(true); setSelectedScreen(null); }}
            className="bg-[#0176D3] text-white px-3 py-1.5 rounded text-xs font-bold shadow-sm hover:bg-blue-700 transition-colors"
          >
            + New Screen
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {isLoadingScreens ? (
            <div className="text-center text-slate-500 text-sm mt-10 font-bold">Loading...</div>
          ) : screensData?.screens?.map((screen: any) => (
            <div 
              key={screen.screen_id} 
              onClick={() => { setSelectedScreen(screen); setIsCreating(false); }}
              className={`p-4 border rounded cursor-pointer transition-all shadow-sm ${selectedScreen?.screen_id === screen.screen_id ? 'bg-[#F0F7FF] border-[#0176D3]' : 'bg-white border-slate-200 hover:border-[#0176D3]'}`}
            >
              <div className="flex justify-between items-start mb-2">
                <div className="text-[13px] font-bold text-slate-800">{screen.screen_name}</div>
                <div className={`text-[10px] font-mono px-1.5 py-0.5 rounded font-bold bg-emerald-50 text-emerald-700`}>{screen.status}</div>
              </div>
              <div className="text-[11px] text-slate-500">Renders {screen.definition?.length || 0} UI Components</div>
            </div>
          ))}
        </div>
      </div>

      {/* Right Column: Canvas / Editor */}
      <div className="flex-1 bg-white border border-slate-200 rounded shadow-sm flex flex-col overflow-hidden relative">
        {!isCreating && !selectedScreen && (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400">
            <svg className="w-16 h-16 mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z"></path></svg>
            <p className="text-sm font-semibold text-slate-500">Select a Screen Template or create a new one.</p>
          </div>
        )}

        {isCreating && (
          <div className="flex flex-col h-full animate-slide-in-right">
            <div className="p-6 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
              <div>
                <h2 className="text-lg font-bold text-slate-800">Design New Dynamic Screen</h2>
                <p className="text-xs text-slate-500 mt-1">Configure visual forms bound directly to the ISO Registry for data integrity.</p>
              </div>
              <div className="flex items-center">
                <input type="file" accept="image/*" className="hidden" id="wireframe-upload" onChange={handleImageUpload} />
                <label htmlFor="wireframe-upload" className={`cursor-pointer border px-4 py-2 rounded text-xs font-bold shadow-sm transition-colors flex items-center gap-1.5 ${aiExtractMutation.isPending ? 'bg-slate-200 text-slate-500 border-slate-300' : 'bg-indigo-50 border-indigo-200 text-indigo-700 hover:bg-indigo-600 hover:text-white'}`}>
                  {aiExtractMutation.isPending ? 'Analyzing Image...' : '✨ Auto-Generate from Wireframe'}
                </label>
              </div>
            </div>
            
            <div className="p-6 flex-1 overflow-y-auto space-y-6">
              <div className="grid grid-cols-[1fr_2fr] gap-6">
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Template Name</label>
                  <input type="text" value={screenName} onChange={(e) => setScreenName(e.target.value)} placeholder="e.g., MANAGER_APPROVAL_FORM" className="w-full text-[13px] font-semibold text-slate-900 border border-slate-300 rounded p-2.5 focus:border-[#0176D3] focus:ring-1 focus:ring-[#0176D3] outline-none uppercase" />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Form Description</label>
                  <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="A brief summary of when this screen is presented to users." className="w-full text-[13px] text-slate-900 border border-slate-300 rounded p-2.5 focus:border-[#0176D3] focus:ring-1 focus:ring-[#0176D3] outline-none" />
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center mb-3 border-b border-slate-200 pb-2">
                  <label className="block text-[12px] font-bold text-slate-800 uppercase tracking-wider">UI Component Layout Builder</label>
                  <button onClick={handleAddComponentRow} className="text-[#0176D3] text-[11px] font-bold hover:underline">+ Add Component</button>
                </div>
                
                <div className="space-y-4">
                  {components.map((comp, idx) => (
                    <div key={idx} className="bg-slate-50 p-4 border border-slate-200 rounded grid grid-cols-12 gap-3 items-center">
                      <div className="col-span-3">
                        <label className="block text-[10px] font-bold text-slate-500 mb-1">Component Type</label>
                        <select value={comp.component_type} onChange={(e) => { const newC = [...components]; newC[idx].component_type = e.target.value; setComponents(newC); }} className="w-full text-[12px] border border-slate-300 rounded p-2 outline-none focus:border-[#0176D3] bg-white">
                          <option value="text_input">Text Input</option>
                          <option value="number_input">Number Input</option>
                          <option value="dropdown">Dropdown Select</option>
                          <option value="date_picker">Date Picker</option>
                          <option value="label">Read-Only Label</option>
                        </select>
                      </div>
                      <div className="col-span-3">
                        <label className="block text-[10px] font-bold text-slate-500 mb-1">Label / Title (i18n)</label>
                        <input type="text" placeholder="e.g., LBL_ACCOUNT_NAME" value={comp.label_token} onChange={(e) => { const newC = [...components]; newC[idx].label_token = e.target.value; setComponents(newC); }} className="w-full text-[12px] border border-slate-300 rounded p-2 outline-none focus:border-[#0176D3]" />
                      </div>
                      <div className="col-span-4">
                        <label className="block text-[10px] font-bold text-slate-500 mb-1">Data Binding (ISO Registry)</label>
                        <select value={comp.field_binding} onChange={(e) => { const newC = [...components]; newC[idx].field_binding = e.target.value; setComponents(newC); }} className="w-full text-[12px] border border-slate-300 rounded p-2 outline-none focus:border-[#0176D3] bg-white text-[#0176D3] font-mono">
                          <option value="" disabled>Select Backend Bind...</option>
                          {fieldsData?.fields?.map((f: any) => (
                            <option key={f.technical_sys_name} value={f.technical_sys_name}>{f.technical_sys_name}</option>
                          ))}
                        </select>
                      </div>
                      <div className="col-span-2">
                        <label className="block text-[10px] font-bold text-slate-500 mb-1">Validation</label>
                        <select value={comp.requirement_status} onChange={(e) => { const newC = [...components]; newC[idx].requirement_status = e.target.value; setComponents(newC); }} className="w-full text-[12px] border border-slate-300 rounded p-2 outline-none focus:border-[#0176D3] bg-white">
                          <option value="MANDATORY">Required</option>
                          <option value="NON_MANDATORY">Optional</option>
                          <option value="CONDITIONAL">Conditional</option>
                        </select>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              
              <div className="bg-[#F0F7FF] border border-[#CCE0FF] rounded p-4 flex items-start gap-3">
                <svg className="w-5 h-5 text-[#0052CC] shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                <div className="text-[12px] text-[#0052CC]">
                  <strong>Data Synchronization Notice:</strong> Fields marked as "Required" will automatically block progression in the Workflow Engine until a valid ISO mapping is supplied by the user.
                </div>
              </div>
            </div>
            
            <div className="p-4 border-t border-slate-200 bg-slate-50 flex justify-end gap-3 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
              <button onClick={() => setIsCreating(false)} className="px-5 py-2.5 text-[13px] font-bold text-slate-600 bg-white border border-slate-300 rounded hover:bg-slate-100 transition-colors">Cancel</button>
              <button disabled={createScreenMutation.isPending || !screenName} onClick={() => createScreenMutation.mutate()} className="px-5 py-2.5 text-[13px] font-bold text-white bg-[#0176D3] rounded hover:bg-blue-700 transition-colors shadow-sm disabled:opacity-50">{createScreenMutation.isPending ? 'Saving...' : 'Deploy Screen'}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};