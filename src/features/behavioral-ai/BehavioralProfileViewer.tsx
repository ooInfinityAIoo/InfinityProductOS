import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../api/client';

export const BehavioralProfileViewer: React.FC = () => {
  const [selectedProfile, setSelectedProfile] = useState<any>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['behavioral-profiles'],
    queryFn: async () => (await apiClient.get('/users/behavioral-profiles')).data
  });

  return (
    <div className="flex gap-6 h-[750px] animate-fade-in">
      {/* Left Column: List of Profiles */}
      <div className="w-[400px] bg-white border border-slate-200 rounded shadow-sm flex flex-col overflow-hidden">
        <div className="p-5 border-b border-slate-200 bg-slate-50">
          <h2 className="text-[15px] font-extrabold text-slate-800 tracking-tight">Behavioral Profiles</h2>
          <p className="text-xs text-slate-500 mt-0.5">Aggregated AI models of user behavior.</p>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {isLoading ? (
            <div className="text-center text-slate-500 text-sm mt-10 font-bold">Loading Profiles...</div>
          ) : data?.profiles?.length === 0 ? (
            <div className="text-center text-slate-500 text-sm mt-10 italic">No behavioral profiles generated yet.</div>
          ) : data?.profiles?.map((profile: any) => (
            <div 
              key={profile.user_id} 
              onClick={() => setSelectedProfile(profile)}
              className={`p-4 border rounded cursor-pointer transition-all shadow-sm ${selectedProfile?.user_id === profile.user_id ? 'bg-[#EEF2FF] border-indigo-500' : 'bg-white border-slate-200 hover:border-indigo-300'}`}
            >
              <div className="flex justify-between items-start mb-2">
                <div className="text-[13px] font-bold text-slate-800 truncate" title={profile.user_id}>{profile.user_id}</div>
                <div className="text-[10px] font-mono text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-100">v{profile.profile_version}</div>
              </div>
              <div className="text-[10px] text-slate-500">Updated: {new Date(profile.last_calculated_at).toLocaleString()}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Right Column: Profile Details */}
      <div className="flex-1 bg-white border border-slate-200 rounded shadow-sm flex flex-col overflow-hidden relative">
        {!selectedProfile ? (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400">
            <svg className="w-16 h-16 mb-4 opacity-50 text-indigo-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path></svg>
            <p className="text-sm font-semibold text-slate-500">Select a user profile to view behavioral insights.</p>
          </div>
        ) : (
          <div className="flex flex-col h-full animate-slide-in-right">
            <div className="p-6 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
              <div>
                <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                  <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path></svg>
                  User: <span className="font-mono text-indigo-600">{selectedProfile.user_id}</span>
                </h2>
                <p className="text-xs text-slate-500 mt-1">Aggregated AI state for predictive forecasting.</p>
              </div>
            </div>

            <div className="p-6 flex-1 overflow-y-auto flex flex-col gap-6">
              {/* Financial Estimations */}
              <div className="grid grid-cols-2 gap-6">
                <div className="border border-slate-200 rounded p-5 bg-white shadow-sm flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                  </div>
                  <div>
                    <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">Avg Transaction Value</div>
                    <div className="text-xl font-bold text-slate-800">${selectedProfile.avg_transaction_value?.toLocaleString() || '0.00'}</div>
                  </div>
                </div>
                <div className="border border-slate-200 rounded p-5 bg-white shadow-sm flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-blue-50 text-[#0176D3] flex items-center justify-center">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3"></path></svg>
                  </div>
                  <div>
                    <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">Estimated Net Worth</div>
                    <div className="text-xl font-bold text-slate-800">${selectedProfile.net_worth_estimate?.toLocaleString() || '0.00'}</div>
                  </div>
                </div>
              </div>

              {/* Grid for complex JSON Arrays */}
              <div className="grid grid-cols-1 gap-6">
                <div>
                  <h3 className="text-[12px] font-extrabold text-slate-800 uppercase tracking-wider border-b border-slate-200 pb-2 mb-3">Ranked Behavior Journeys</h3>
                  <div className="space-y-2">
                    {selectedProfile.ranked_journeys && selectedProfile.ranked_journeys.length > 0 ? (
                      selectedProfile.ranked_journeys.map((j: any, i: number) => (
                        <div key={i} className="flex justify-between items-center bg-slate-50 p-3 rounded border border-slate-100">
                          <div className="font-mono text-xs text-indigo-700 font-bold">{j.journey_id || j.target_component_id || "Unknown Journey"}</div>
                          <div className="text-xs text-slate-600 bg-white border border-slate-200 px-2 py-1 rounded shadow-sm">Count: {j.rank || j.interaction_count || j.count || 0}</div>
                        </div>
                      ))
                    ) : (
                      <p className="text-xs text-slate-400 italic">No ranked journeys logged.</p>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <h3 className="text-[12px] font-extrabold text-slate-800 uppercase tracking-wider border-b border-slate-200 pb-2 mb-3">Common Devices</h3>
                    <div className="space-y-2">
                      {selectedProfile.common_devices && selectedProfile.common_devices.length > 0 ? (
                        selectedProfile.common_devices.map((d: any, i: number) => (
                          <div key={i} className="bg-slate-50 p-3 rounded border border-slate-100 text-xs shadow-sm">
                            <span className="font-bold text-slate-700">{d.type || d.fingerprint || "Device"}</span> 
                            {d.count && <span className="ml-2 text-slate-500">({d.count} times)</span>}
                          </div>
                        ))
                      ) : (
                        <p className="text-xs text-slate-400 italic">No device telemetry.</p>
                      )}
                    </div>
                  </div>
                  <div>
                    <h3 className="text-[12px] font-extrabold text-slate-800 uppercase tracking-wider border-b border-slate-200 pb-2 mb-3">Typical Locations</h3>
                    <div className="space-y-2">
                      {selectedProfile.typical_locations && selectedProfile.typical_locations.length > 0 ? (
                        selectedProfile.typical_locations.map((l: any, i: number) => (
                          <div key={i} className="bg-slate-50 p-3 rounded border border-slate-100 text-xs flex justify-between shadow-sm">
                            <span className="font-bold text-slate-700">{l.city || l.location || l.country || "Location"}</span>
                            {l.count && <span className="text-slate-500">{l.count} times</span>}
                          </div>
                        ))
                      ) : (
                        <p className="text-xs text-slate-400 italic">No location telemetry.</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};