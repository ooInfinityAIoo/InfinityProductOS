import React from 'react';

export const DraftConfirmationModal = ({
  handleDiscardChanges,
  handleSaveDraft
}: any) => {
  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-[100]">
      <div className="bg-white rounded shadow-2xl w-[450px] overflow-hidden animate-slide-in-up">
        <div className="p-6">
          <div className="flex items-center gap-3 mb-4 text-amber-600"><svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg><h3 className="font-bold text-slate-800 text-lg">Unsaved Changes Detected</h3></div>
          <p className="text-sm text-slate-600 mb-6">You have modified this screen blueprint. Would you like to save your progress as a <span className="font-bold">DRAFT</span> before exiting? Unsaved changes will be lost.</p>
          <div className="flex justify-end gap-3">
            <button onClick={handleDiscardChanges} className="px-4 py-2 text-[13px] font-bold text-red-600 bg-red-50 border border-red-200 rounded hover:bg-red-100 transition-colors">No, Discard Changes</button>
            <button onClick={handleSaveDraft} className="px-4 py-2 text-[13px] font-bold text-white bg-[#0176D3] rounded hover:bg-blue-700 transition-colors shadow-sm">Yes, Save Draft</button>
          </div>
        </div>
      </div>
    </div>
  );
};