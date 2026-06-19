// WHY THIS FILE EXISTS:
// Replaces all alert() calls across every studio with professional toast notifications.
// alert() blocks the browser thread and looks unprofessional in a bank demo.
// This lightweight toast system provides success/error/warning/info feedback
// without any third-party dependency — just React state + CSS transitions.
//
// USAGE:
//   import { useToast, ToastContainer } from '../../components/Toast';
//   const { toasts, showToast } = useToast();
//   showToast('Rule saved successfully', 'success');
//   <ToastContainer toasts={toasts} onDismiss={dismissToast} />

import React, { useState, useCallback, useEffect } from 'react';
import { CheckCircle, XCircle, AlertTriangle, Info, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
}

const ICONS = {
  success: <CheckCircle size={16} className="text-emerald-500 flex-shrink-0" />,
  error: <XCircle size={16} className="text-rose-500 flex-shrink-0" />,
  warning: <AlertTriangle size={16} className="text-amber-500 flex-shrink-0" />,
  info: <Info size={16} className="text-blue-500 flex-shrink-0" />,
};

const STYLES = {
  success: 'border-emerald-200 bg-emerald-50',
  error: 'border-rose-200 bg-rose-50',
  warning: 'border-amber-200 bg-amber-50',
  info: 'border-blue-200 bg-blue-50',
};

const TEXT_STYLES = {
  success: 'text-emerald-800',
  error: 'text-rose-800',
  warning: 'text-amber-800',
  info: 'text-blue-800',
};

interface ToastItemProps {
  toast: Toast;
  onDismiss: (id: string) => void;
}

const ToastItem: React.FC<ToastItemProps> = ({ toast, onDismiss }) => {
  useEffect(() => {
    // Auto-dismiss after 4 seconds
    const timer = setTimeout(() => onDismiss(toast.id), 4000);
    return () => clearTimeout(timer);
  }, [toast.id, onDismiss]);

  return (
    <div className={`flex items-start gap-3 px-4 py-3 rounded-xl border shadow-lg max-w-sm animate-slide-up ${STYLES[toast.type]}`}>
      {ICONS[toast.type]}
      <span className={`text-[13px] font-semibold flex-1 leading-snug ${TEXT_STYLES[toast.type]}`}>
        {toast.message}
      </span>
      <button onClick={() => onDismiss(toast.id)} className="text-slate-400 hover:text-slate-600 mt-0.5">
        <X size={13} />
      </button>
    </div>
  );
};

// Fixed container rendered at app level — toasts stack bottom-right
export const ToastContainer: React.FC<{ toasts: Toast[]; onDismiss: (id: string) => void }> = ({ toasts, onDismiss }) => {
  if (toasts.length === 0) return null;
  return (
    <div className="fixed bottom-6 right-6 z-[9999] flex flex-col gap-2">
      {toasts.map(t => <ToastItem key={t.id} toast={t} onDismiss={onDismiss} />)}
    </div>
  );
};

// Hook — import this in any studio that needs toasts
export function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((message: string, type: ToastType = 'info') => {
    const id = `toast-${Date.now()}-${Math.random()}`;
    setToasts(prev => [...prev, { id, message, type }]);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  return { toasts, showToast, dismissToast };
}
