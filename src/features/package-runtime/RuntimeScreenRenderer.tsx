// WHY THIS COMPONENT EXISTS (WS-11/WS-12):
// This renders a screen definition (stored as JSONB in the DB) as actual HTML form UI.
// It's the "runtime interpreter" for the Screen Designer's output — the same relationship
// as the Workflow Executor is to the Workflow Designer.
//
// A screen definition contains an array of ScreenComponent objects:
// { component_type, field_binding, label_token, properties, category, requirement_status }
//
// The renderer maps each component_type to a real React input element.
// Values are kept in a local form state keyed by field_binding (ISO field name).
// On submit, the caller receives the collected field values for workflow injection.
//
// WHAT BREAKS IF REMOVED:
// Clicking a live screen in the Package Sidebar shows nothing.
// The Runtime Transaction Shell cannot display the human-in-loop approval screen.

import React, { useState, useEffect } from 'react';

interface ScreenComponent {
  component_type: string;
  field_binding?: string;
  label_token: string;
  properties?: Record<string, any>;
  category?: string;
  requirement_status?: string;
  value_list_group_id?: string;
}

interface ScreenActionButton {
  button_id: string;
  label_token: string;
  action_type: string;
}

interface ScreenDefinition {
  components?: ScreenComponent[];
  action_buttons?: ScreenActionButton[];
  value_list_groups?: any[];
}

interface RuntimeScreenRendererProps {
  screenName: string;
  definition: ScreenDefinition | ScreenComponent[] | any;
  initialValues?: Record<string, any>;
  onSubmit?: (values: Record<string, any>, action: string) => void;
  readOnly?: boolean;
}

// Converts label_token like "LBL_CUSTOMER_NAME" → "Customer Name"
function humanizeToken(token: string): string {
  return token
    .replace(/^LBL_|^BTN_|^FLD_/, '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

export const RuntimeScreenRenderer: React.FC<RuntimeScreenRendererProps> = ({
  screenName,
  definition,
  initialValues = {},
  onSubmit,
  readOnly = false,
}) => {
  // Normalize definition — the DB stores it either as {components:[...]} or as a raw array
  const components: ScreenComponent[] = Array.isArray(definition)
    ? definition
    : definition?.components ?? [];

  const actionButtons: ScreenActionButton[] = Array.isArray(definition)
    ? []
    : definition?.action_buttons ?? [];

  const [formValues, setFormValues] = useState<Record<string, any>>(initialValues);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    setFormValues(initialValues);
  }, [JSON.stringify(initialValues)]);

  const setValue = (field: string, value: any) => {
    setFormValues(prev => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors(prev => { const n = { ...prev }; delete n[field]; return n; });
  };

  const validate = () => {
    const newErrors: Record<string, string> = {};
    components.forEach(comp => {
      if (comp.requirement_status === 'MANDATORY' && comp.field_binding) {
        const v = formValues[comp.field_binding];
        if (v === undefined || v === null || v === '') {
          newErrors[comp.field_binding] = `${humanizeToken(comp.label_token)} is required`;
        }
      }
    });
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleAction = (actionType: string) => {
    if (actionType === 'CANCEL_SESSION' || actionType === 'NAVIGATE') {
      onSubmit?.(formValues, actionType);
      return;
    }
    if (validate()) {
      onSubmit?.(formValues, actionType);
    }
  };

  if (components.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-48 text-slate-400 text-sm gap-2">
        <span className="text-2xl">📋</span>
        <span>No components defined for this screen.</span>
        <span className="text-xs text-slate-300">Add components in Screen Designer to see them here.</span>
      </div>
    );
  }

  return (
    <div className="space-y-0">
      {/* Screen title */}
      <div className="mb-5">
        <h3 className="text-base font-bold text-slate-800">{screenName}</h3>
        <div className="h-0.5 w-12 bg-indigo-500 mt-1.5 rounded-full" />
      </div>

      {/* Component grid — 2 column layout like a real banking form */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
        {components.map((comp, idx) => (
          <ComponentField
            key={`${comp.field_binding ?? comp.label_token}-${idx}`}
            comp={comp}
            value={formValues[comp.field_binding ?? ''] ?? ''}
            onChange={(val) => comp.field_binding && setValue(comp.field_binding, val)}
            error={errors[comp.field_binding ?? '']}
            readOnly={readOnly || comp.category === 'READ_ONLY'}
          />
        ))}
      </div>

      {/* Action buttons */}
      {!readOnly && (
        <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-slate-100">
          {actionButtons.length > 0 ? (
            actionButtons.map(btn => (
              <ActionButton
                key={btn.button_id}
                label={humanizeToken(btn.label_token)}
                actionType={btn.action_type}
                onClick={() => handleAction(btn.action_type)}
              />
            ))
          ) : (
            // Default buttons when screen has no action_buttons defined
            <>
              <button
                onClick={() => onSubmit?.(formValues, 'CANCEL_SESSION')}
                className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleAction('SUBMIT')}
                className="px-5 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors shadow-sm"
              >
                Submit
              </button>
            </>
          )}
        </div>
      )}

      {/* Validation summary */}
      {Object.keys(errors).length > 0 && (
        <div className="mt-3 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          Please fill in all required fields before submitting.
        </div>
      )}
    </div>
  );
};

// Renders a single form field based on component_type
const ComponentField: React.FC<{
  comp: ScreenComponent;
  value: any;
  onChange: (val: any) => void;
  error?: string;
  readOnly: boolean;
}> = ({ comp, value, onChange, error, readOnly }) => {
  const label = humanizeToken(comp.label_token);
  const isMandatory = comp.requirement_status === 'MANDATORY';
  const isFullWidth = ['label', 'section_header', 'textarea'].includes(comp.component_type);

  const inputClass = `w-full px-3 py-2 text-sm border rounded-lg outline-none transition-colors ${
    error
      ? 'border-red-400 bg-red-50 focus:ring-2 focus:ring-red-200'
      : 'border-slate-200 bg-white focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100'
  } ${readOnly ? 'bg-slate-50 text-slate-500 cursor-not-allowed' : ''}`;

  const renderInput = () => {
    switch (comp.component_type) {
      case 'text_input':
        return (
          <input
            type="text"
            value={value}
            onChange={e => onChange(e.target.value)}
            disabled={readOnly}
            placeholder={comp.properties?.placeholder ?? `Enter ${label.toLowerCase()}`}
            className={inputClass}
          />
        );
      case 'number_input':
        return (
          <input
            type="number"
            value={value}
            onChange={e => onChange(e.target.value)}
            disabled={readOnly}
            placeholder={comp.properties?.placeholder ?? '0.00'}
            step={comp.properties?.step ?? '0.01'}
            className={inputClass}
          />
        );
      case 'date_picker':
        return (
          <input
            type="date"
            value={value}
            onChange={e => onChange(e.target.value)}
            disabled={readOnly}
            className={inputClass}
          />
        );
      case 'datetime_picker':
        return (
          <input
            type="datetime-local"
            value={value}
            onChange={e => onChange(e.target.value)}
            disabled={readOnly}
            className={inputClass}
          />
        );
      case 'dropdown':
      case 'select': {
        const options: string[] = comp.properties?.options ?? [];
        return (
          <select
            value={value}
            onChange={e => onChange(e.target.value)}
            disabled={readOnly}
            className={inputClass}
          >
            <option value="">— Select —</option>
            {options.map(opt => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        );
      }
      case 'checkbox':
        return (
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={!!value}
              onChange={e => onChange(e.target.checked)}
              disabled={readOnly}
              className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-400"
            />
            <span className="text-sm text-slate-600">{label}</span>
          </label>
        );
      case 'textarea':
        return (
          <textarea
            value={value}
            onChange={e => onChange(e.target.value)}
            disabled={readOnly}
            rows={3}
            placeholder={comp.properties?.placeholder ?? `Enter ${label.toLowerCase()}`}
            className={`${inputClass} resize-none`}
          />
        );
      case 'label':
      case 'readonly':
        return (
          <div className="px-3 py-2 text-sm text-slate-800 bg-slate-50 border border-slate-200 rounded-lg font-medium">
            {value || <span className="text-slate-400 font-normal">—</span>}
          </div>
        );
      case 'section_header':
        return (
          <div className="col-span-2 pt-2">
            <p className="text-xs font-bold uppercase tracking-widest text-indigo-600">{label}</p>
            <div className="h-px bg-indigo-100 mt-1" />
          </div>
        );
      case 'currency_input':
        return (
          <div className="flex">
            <span className="px-3 py-2 text-sm font-mono bg-slate-100 border border-r-0 border-slate-200 rounded-l-lg text-slate-500">
              {comp.properties?.currency ?? 'USD'}
            </span>
            <input
              type="number"
              value={value}
              onChange={e => onChange(e.target.value)}
              disabled={readOnly}
              step="0.01"
              placeholder="0.00"
              className={`${inputClass} rounded-l-none`}
            />
          </div>
        );
      default:
        return (
          <input
            type="text"
            value={value}
            onChange={e => onChange(e.target.value)}
            disabled={readOnly}
            placeholder={comp.properties?.placeholder ?? `Enter ${label.toLowerCase()}`}
            className={inputClass}
          />
        );
    }
  };

  if (comp.component_type === 'section_header') {
    return <div className="col-span-2">{renderInput()}</div>;
  }
  if (comp.component_type === 'checkbox') {
    return <div className={isFullWidth ? 'col-span-2' : ''}>{renderInput()}</div>;
  }

  return (
    <div className={isFullWidth ? 'col-span-2' : ''}>
      <label className="block text-xs font-semibold text-slate-600 mb-1">
        {label}
        {isMandatory && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {renderInput()}
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  );
};

const ActionButton: React.FC<{
  label: string;
  actionType: string;
  onClick: () => void;
}> = ({ label, actionType, onClick }) => {
  const isPrimary = ['SUBMIT', 'APPROVE', 'CONFIRM'].includes(actionType);
  const isDanger = ['DELETE_INSTANCE', 'REJECT'].includes(actionType);

  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-sm font-semibold rounded-lg transition-colors shadow-sm ${
        isPrimary
          ? 'bg-indigo-600 text-white hover:bg-indigo-700'
          : isDanger
          ? 'bg-red-50 text-red-700 border border-red-200 hover:bg-red-100'
          : 'bg-slate-50 text-slate-700 border border-slate-200 hover:bg-slate-100'
      }`}
    >
      {label}
    </button>
  );
};
