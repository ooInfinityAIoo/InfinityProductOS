import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../api/client';

export const EventRepositoryStudio: React.FC = () => {
  const [selectedEventType, setSelectedEventType] = useState<string | null>(null);

  // --- DYNAMIC API BINDINGS (Real-time Polling) ---
  
  // 1. Fetch Event Bus Status (The Subscriptions/Listeners)
  const { data: statusData, isLoading: isLoadingStatus } = useQuery({
    queryKey: ['event-status'],
    queryFn: async () => (await apiClient.get('/events/status')).data,
    refetchInterval: 5000 // Poll every 5 seconds
  });

  // 2. Fetch Event Stats (The Frequencies)
  const { data: statsData } = useQuery({
    queryKey: ['event-stats'],
    queryFn: async () => (await apiClient.get('/events/stats')).data,
    refetchInterval: 5000
  });

  // 3. Fetch Recent Live Events (The Neural Trace)
  const { data: recentData } = useQuery({
    queryKey: ['event-recent'],
    queryFn: async () => (await apiClient.get('/events/recent?limit=50')).data,
    refetchInterval: 3000 // Poll every 3 seconds for that "live" feel
  });

  const eventTypes = Object.keys((statusData as any)?.listeners || {});
  const totalSubscriptions = Object.values((statusData as any)?.listeners || {}).reduce((acc: number, listeners: any) => acc + (listeners?.length || 0), 0) as number;

  return (
    <div className="flex flex-col gap-6 h-[750px] animate-fade-in">
      
      {/* Top KPI Metrics Row */}
      <div className="grid grid-cols-3 gap-6 shrink-0">
        <div className="bg-white border border-slate-200 p-5 rounded shadow-sm flex items-center justify-between">
          <div>
            <div className="text-[11px] font-bold uppercase text-slate-500 mb-1 tracking-wider">Total Broadcasts</div>
            <div className="text-2xl font-extrabold text-[#0176D3]">{statsData?.total_events_broadcast?.toLocaleString() || 0}</div>
          </div>
          <div className="h-10 w-10 bg-blue-50 rounded-full flex items-center justify-center text-blue-500">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
          </div>
        </div>
        <div className="bg-white border border-slate-200 p-5 rounded shadow-sm flex items-center justify-between">
          <div>
            <div className="text-[11px] font-bold uppercase text-slate-500 mb-1 tracking-wider">Registered Event Types</div>
            <div className="text-2xl font-extrabold text-emerald-600">{eventTypes.length}</div>
          </div>
          <div className="h-10 w-10 bg-emerald-50 rounded-full flex items-center justify-center text-emerald-600">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 10h16M4 14h16M4 18h16"></path></svg>
          </div>
        </div>
        <div className="bg-white border border-slate-200 p-5 rounded shadow-sm flex items-center justify-between">
          <div>
            <div className="text-[11px] font-bold uppercase text-slate-500 mb-1 tracking-wider">Active Subscriptions</div>
            <div className="text-2xl font-extrabold text-indigo-600">{totalSubscriptions}</div>
          </div>
          <div className="h-10 w-10 bg-indigo-50 rounded-full flex items-center justify-center text-indigo-600">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"></path></svg>
          </div>
        </div>
      </div>

      <div className="flex gap-6 flex-1 min-h-0">
        {/* Left Column: Event Topology & Listeners */}
        <div className="w-[450px] bg-white border border-slate-200 rounded shadow-sm flex flex-col overflow-hidden">
          <div className="p-5 border-b border-slate-200 bg-slate-50">
            <h2 className="text-[15px] font-extrabold text-slate-800 tracking-tight">Event Dictionary & Topology</h2>
            <p className="text-xs text-slate-500 mt-0.5">Explore standard events and their active subscribers.</p>
          </div>
          
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {isLoadingStatus ? (
              <div className="text-center text-slate-500 text-sm mt-10 font-bold">Mapping Topology...</div>
            ) : eventTypes.length === 0 ? (
              <div className="text-center text-slate-500 text-sm mt-10 italic">No events registered.</div>
            ) : (
              eventTypes.map((eventType) => {
                const listeners = statusData?.listeners[eventType] || [];
                const fireCount = statsData?.events_by_type[eventType] || 0;
                const isSelected = selectedEventType === eventType;

                return (
                  <div 
                    key={eventType} 
                    onClick={() => setSelectedEventType(isSelected ? null : eventType)}
                    className={`border rounded transition-all shadow-sm overflow-hidden ${isSelected ? 'bg-[#F0F7FF] border-[#0176D3]' : 'bg-white border-slate-200 hover:border-[#0176D3] cursor-pointer'}`}
                  >
                    <div className="p-4 flex justify-between items-start">
                      <div>
                        <div className="text-[13px] font-bold text-slate-800 mb-1">{eventType}</div>
                        <div className="text-[10px] text-slate-500 font-semibold">{fireCount.toLocaleString()} total broadcasts</div>
                      </div>
                      <div className="text-[10px] font-mono text-[#0176D3] bg-blue-50 px-2 py-1 rounded font-bold">
                        {listeners.length} Subscribers
                      </div>
                    </div>
                    
                    {/* Expandable Listeners Section */}
                    {isSelected && (
                      <div className="bg-white border-t border-blue-100 p-3 bg-blue-50/30">
                        <h4 className="text-[10px] font-extrabold text-slate-600 uppercase tracking-wider mb-2">Active Callback Hooks</h4>
                        {listeners.length > 0 ? (
                          <ul className="space-y-1.5">
                            {listeners.map((listener: any, idx: number) => (
                              <li key={idx} className="text-[11px] font-mono text-slate-700 flex items-center gap-2">
                                <svg className="w-3 h-3 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                                {listener.callback_name}
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <div className="text-[11px] text-slate-400 italic">No active listeners attached to this event.</div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column: Live Neural Trace */}
        <div className="flex-1 bg-slate-900 border border-slate-800 rounded shadow-xl flex flex-col overflow-hidden relative">
          <div className="p-4 border-b border-slate-800 bg-slate-900 flex justify-between items-center">
            <div>
              <h2 className="text-[13px] font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-2">
                <span className="flex h-2.5 w-2.5 relative"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span><span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span></span>
                Live Neural Fire Trace
              </h2>
              <p className="text-[10px] text-slate-500 mt-1">Real-time Pub/Sub payload monitor.</p>
            </div>
            <div className="flex gap-2">
              <div className="w-3 h-3 rounded-full bg-slate-700"></div>
              <div className="w-3 h-3 rounded-full bg-slate-700"></div>
              <div className="w-3 h-3 rounded-full bg-slate-700"></div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {recentData?.events?.length === 0 ? (
              <div className="text-center text-slate-600 font-mono text-xs mt-10">Listening for signals...</div>
            ) : (
              recentData?.events?.map((ev: any) => (
                <div key={ev.event_id} className="bg-slate-800 border border-slate-700 rounded p-3 text-xs font-mono animate-slide-in-up">
                  <div className="flex justify-between items-start mb-2 border-b border-slate-700 pb-2">
                    <div>
                      <span className="text-emerald-400 font-bold">{ev.event_type}</span>
                      <span className="text-slate-500 ml-2">from [{ev.source_context}]</span>
                    </div>
                    <div className="text-slate-500">{new Date(ev.broadcast_at).toLocaleTimeString()}</div>
                  </div>
                  <div className="text-blue-300 whitespace-pre-wrap pl-2 border-l-2 border-slate-700">
                    {JSON.stringify(ev.payload, null, 2)}
                  </div>
                  <div className="text-[9px] text-slate-600 mt-2 text-right">ID: {ev.event_id}</div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};