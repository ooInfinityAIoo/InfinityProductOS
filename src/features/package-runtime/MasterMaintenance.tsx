// WHY THIS COMPONENT EXISTS (field-registry GUI work, option B):
// Masters are MAINTENANCE screens, but until now clicking one rendered a single blank
// form that just alert()'d on submit — there was NO way to list/add/edit/delete the
// master's actual records. This is the Master Maintenance grid: it lists a master's
// records (dynamic_master_records), and lets a bank user add/edit/delete them, with the
// add/edit form generated from the master's own field definition (RuntimeScreenRenderer).
//
// DECISION-TABLE masters (definition.master_type === 'DECISION_TABLE', e.g. Intelligent
// Routing Rules) are framed as RULES — each row is a rule (condition→outcome), not plain
// reference data — so the UX matches what the master actually is.
//
// WHAT BREAKS IF REMOVED: masters become un-maintainable from the UI again; the bank
// can only see an empty form, not the data behind a master.

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import { RuntimeScreenRenderer } from './RuntimeScreenRenderer';

interface MasterMaintenanceProps {
  screenId: string;
  screenName: string;
  definition: any; // {components:[...], master_type?:'DECISION_TABLE'}
}

interface MasterRecord {
  record_id: string;
  record_data: Record<string, any>;
  status: string;
}

// Column = a real input component of the master (skip layout-only components).
const LAYOUT_TYPES = new Set(['section_header', 'label']);

export const MasterMaintenance: React.FC<MasterMaintenanceProps> = ({ screenId, screenName, definition }) => {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<MasterRecord | null>(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isDecisionTable = definition?.master_type === 'DECISION_TABLE';
  const components: any[] = (definition?.components ?? []).filter(
    (c: any) => c.field_binding && !LAYOUT_TYPES.has(c.component_type)
  );
  const colLabel = (c: any) => c.properties?.display_label || c.field_binding;

  const { data, isLoading } = useQuery({
    queryKey: ['master-records', screenId],
    queryFn: async () => (await apiClient.get(`/masters/dynamic/${screenId}`)).data,
    enabled: !!screenId,
  });
  const records: MasterRecord[] = data?.records ?? [];

  const invalidate = () => qc.invalidateQueries({ queryKey: ['master-records', screenId] });

  const createMut = useMutation({
    mutationFn: async (record_data: Record<string, any>) =>
      (await apiClient.post(`/masters/dynamic/${screenId}`, { record_data, status: 'ACTIVE' })).data,
    onSuccess: () => { invalidate(); setAdding(false); setError(null); },
    onError: (e: any) => setError(e.response?.data?.detail ?? 'Create failed'),
  });

  const updateMut = useMutation({
    mutationFn: async ({ record_id, record_data }: { record_id: string; record_data: Record<string, any> }) =>
      (await apiClient.put(`/masters/dynamic/${screenId}/${record_id}`, { record_data, status: 'ACTIVE' })).data,
    onSuccess: () => { invalidate(); setEditing(null); setError(null); },
    onError: (e: any) => setError(e.response?.data?.detail ?? 'Update failed'),
  });

  const deleteMut = useMutation({
    mutationFn: async (record_id: string) =>
      apiClient.delete(`/masters/dynamic/${screenId}/${record_id}`),
    onSuccess: () => { invalidate(); setError(null); },
    onError: (e: any) => setError(e.response?.data?.detail ?? 'Delete failed'),
  });

  const noun = isDecisionTable ? 'Rule' : 'Record';

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <h2 className="text-[15px] font-bold text-slate-800">{screenName}</h2>
          {isDecisionTable ? (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-violet-50 text-violet-700 border border-violet-200">
              Decision Table · rows are rules
            </span>
          ) : (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-500 border border-slate-200">
              Master · reference data
            </span>
          )}
          <span className="text-[11px] text-slate-400">{records.length} {noun.toLowerCase()}{records.length === 1 ? '' : 's'}</span>
        </div>
        <button
          onClick={() => { setAdding(true); setError(null); }}
          className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-[12px] font-semibold hover:bg-indigo-700 transition-colors"
        >
          + Add {noun}
        </button>
      </div>

      {error && (
        <div className="px-5 py-2 bg-red-50 border-b border-red-100 text-[11px] text-red-700">{error}</div>
      )}

      {/* Records table */}
      <div className="overflow-x-auto">
        {isLoading ? (
          <div className="text-center text-slate-400 py-12 text-[12px]">Loading…</div>
        ) : records.length === 0 ? (
          <div className="text-center text-slate-400 py-12">
            <p className="text-[13px] font-medium">No {noun.toLowerCase()}s yet</p>
            <p className="text-[11px] text-slate-300 mt-1">Add the first {noun.toLowerCase()} with the button above.</p>
          </div>
        ) : (
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b border-slate-100 text-[10px] font-bold text-slate-500 uppercase tracking-wide">
                {components.map(c => (
                  <th key={c.field_binding} className="px-4 py-2.5 text-left whitespace-nowrap">{colLabel(c)}</th>
                ))}
                <th className="px-4 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {records.map(rec => (
                <tr key={rec.record_id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                  {components.map(c => {
                    const v = rec.record_data?.[c.field_binding];
                    return (
                      <td key={c.field_binding} className="px-4 py-2.5 text-slate-700 whitespace-nowrap">
                        {v === true ? '✓' : v === false ? '—' : (v ?? <span className="text-slate-300">—</span>)}
                      </td>
                    );
                  })}
                  <td className="px-4 py-2.5 text-right whitespace-nowrap">
                    <button onClick={() => { setEditing(rec); setError(null); }} className="text-[11px] font-bold text-indigo-600 hover:underline mr-3">Edit</button>
                    <button
                      onClick={() => { if (confirm(`Delete this ${noun.toLowerCase()}?`)) deleteMut.mutate(rec.record_id); }}
                      className="text-[11px] font-bold text-red-600 hover:underline"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Add / Edit modal — the form is generated from the master's own definition. */}
      {(adding || editing) && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
             onClick={(e) => { if (e.target === e.currentTarget) { setAdding(false); setEditing(null); } }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl border border-slate-200 overflow-hidden max-h-[90vh] flex flex-col">
            <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between bg-[#1c2230]">
              <h3 className="text-[13px] font-bold text-white">
                {editing ? `Edit ${noun}` : `Add ${noun}`} · <span className="text-slate-400 font-normal">{screenName}</span>
              </h3>
              <button onClick={() => { setAdding(false); setEditing(null); }} className="text-white/60 hover:text-white text-lg font-bold">✕</button>
            </div>
            <div className="p-5 overflow-y-auto">
              <RuntimeScreenRenderer
                screenName={screenName}
                definition={definition}
                initialValues={editing?.record_data ?? {}}
                onSubmit={(values, action) => {
                  if (action === 'CANCEL_SESSION') { setAdding(false); setEditing(null); return; }
                  if (editing) updateMut.mutate({ record_id: editing.record_id, record_data: values });
                  else createMut.mutate(values);
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
