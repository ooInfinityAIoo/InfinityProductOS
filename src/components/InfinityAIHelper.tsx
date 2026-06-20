// WHY THIS COMPONENT EXISTS:
// Ambient AI helper that floats in every Designer Studio as a small ✨ button.
// Gives configuration analysts instant, context-aware assistance for whichever
// studio they are working in — without leaving the canvas.
//
// Architecture: fixed-position button (bottom-right) + slide-in panel.
// Each studio passes its studioKey; this component maps it to relevant prompts,
// tips, and example questions for that domain.
//
// WHAT BREAKS IF REMOVED: Each studio loses its in-context AI coaching.
// Users must navigate away to the full AI Studio for help.

import React, { useState } from 'react';
import { usePlatformStore } from '../store/usePlatformStore';

// Context-aware config per studio — tips and example questions
const STUDIO_CONTEXT: Record<string, { title: string; tips: string[]; examples: string[] }> = {
  'field-registry': {
    title: 'ISO Field Registry',
    tips: [
      'Mark fields as PII to auto-apply masking across all studios.',
      'Use CLIENT display preference to show bank-friendly names instead of ISO codes.',
      'Fields defined here become the binding vocabulary for every other studio.',
    ],
    examples: [
      'Which fields are mandatory for a SWIFT MT103 payment?',
      'What is the difference between ISO name and client display name?',
      'How do I flag a field as PII?',
    ],
  },
  'workflow-designer': {
    title: 'Process Flow Designer',
    tips: [
      'Every node with a financial state change needs atomic transaction wrapping.',
      'Use Sub-Workflow nodes to reuse common approval chains across products.',
      'Connect a Business Rule node before any branching decision point.',
    ],
    examples: [
      'How do I add a human approval step to my workflow?',
      'What is the difference between a parallel gateway and exclusive gateway?',
      'How do I link a calculation formula to a workflow node?',
    ],
  },
  'business-rules': {
    title: 'Decision Logic & Policies',
    tips: [
      'Rules are evaluated at runtime — no redeploy needed when thresholds change.',
      'Chain multiple conditions with AND/OR groups for complex AML logic.',
      'Test rules in isolation using the Calculation Engine before wiring to workflows.',
    ],
    examples: [
      'How do I create an AML high-value threshold rule?',
      'Can a rule call a formula from the Calculation Engine?',
      'How do I set up OFAC screening logic?',
    ],
  },
  'calculation-engine': {
    title: 'Calculations & Formulas',
    tips: [
      'Use ISO field tokens (e.g. INSTRUCTED_AMT) as formula variables.',
      'All arithmetic uses Decimal internally — no float rounding errors.',
      'Formulas can be called from Business Rules and Workflow nodes.',
    ],
    examples: [
      'How do I write an FX conversion formula?',
      'Can I use IF/THEN logic inside a formula?',
      'How do I reference another formula result in my expression?',
    ],
  },
  'dge-canvas': {
    title: 'Import File Mappers',
    tips: [
      'Source fields come from the File Template Designer; targets are ISO registry fields.',
      'Transformation functions (TRIM, UPPER, DATE_PARSE) run before writing to target.',
      'One mapper can serve multiple file templates with the same structure.',
    ],
    examples: [
      'How do I map a SWIFT MT103 BIC field to ISO debtor agent?',
      'What transformation should I use to convert YYYYMMDD to ISO 8601?',
      'Can one mapper handle both inbound and outbound files?',
    ],
  },
  'api-designer': {
    title: 'External Connectors',
    tips: [
      'Set rate_limit_rps to protect downstream partners from burst traffic.',
      'Circuit breaker threshold controls how many failures before the line goes open.',
      'Enable PII masking on outbound POST bodies where customer data is sent.',
    ],
    examples: [
      'How do I configure a SWIFT GPI tracker integration?',
      'What is a circuit breaker and when should I set it to 3 vs 5 failures?',
      'How do I add OAuth2 authentication to my API connector?',
    ],
  },
  'screen-designer': {
    title: 'User Screen Designer',
    tips: [
      'MAINTENANCE screens are for static master data — created once, rarely changed.',
      'CONFIGURATION screens drive workflow routing conditions when submitted.',
      'TRANSACTION screens attach to live workflow steps for human-in-the-loop approval.',
    ],
    examples: [
      'What type of screen should I use for a payment approval form?',
      'How do I bind a screen field to the ISO registry?',
      'Can I generate a screen automatically from a wireframe image?',
    ],
  },
  'reconciliation-engine': {
    title: 'Reconciliation Matchers',
    tips: [
      'Define match keys carefully — too many makes matching slow, too few causes false positives.',
      'Tolerance bands handle rounding differences between Nostro and Vostro entries.',
      'Run matching in Celery async mode for end-of-day batch reconciliation.',
    ],
    examples: [
      'How do I set up Nostro vs Vostro daily reconciliation?',
      'What is an appropriate tolerance for USD wire transfers?',
      'How do I handle partial matches?',
    ],
  },
  'behavioral-profiles': {
    title: 'Behavioral Profiling Models',
    tips: [
      'Profiles aggregate event patterns over rolling time windows (7d, 30d, 90d).',
      'Link profiles to Business Rule Sets to trigger alerts on anomalous behaviour.',
      'Customer segment labels feed into the Insights Factory for dashboard widgets.',
    ],
    examples: [
      'How do I create a velocity profile for wire transfer frequency?',
      'Can a behavioral alert trigger a workflow automatically?',
      'What event types feed into the profiling engine?',
    ],
  },
  'report-designer': {
    title: 'Report Templates',
    tips: [
      'KPI card widgets pull from real-time aggregation queries — keep them lean.',
      'Data grid widgets support CSV export automatically when configured.',
      'Combine bar + line in one chart for settlement vs. return rate visualisation.',
    ],
    examples: [
      'How do I create a settlement dashboard with daily volume trend?',
      'Can I schedule a report to email automatically at end of day?',
      'How do I add a filter bar to let users drill down by currency?',
    ],
  },
  'document-master': {
    title: 'Document Checklist',
    tips: [
      'Documents defined here become the required document list for onboarding flows.',
      'Tag documents with ISO field bindings to auto-extract data on upload.',
      'Set expiry rules so the system flags customers with stale documents.',
    ],
    examples: [
      'How do I define KYC documents required for a corporate client?',
      'Can I make a document conditional on the client tier?',
      'How does document expiry integrate with workflow routing?',
    ],
  },
  'file-template-designer': {
    title: 'File Template Designer',
    tips: [
      'Fixed-width templates need exact byte positions — use the position calculator.',
      'Delimited templates auto-detect CSV, TSV, and pipe formats.',
      'Header/footer line counts help the engine skip metadata rows on ingest.',
    ],
    examples: [
      'How do I set up a SWIFT MT103 fixed-width template?',
      'What is the difference between fixed-width and delimited templates?',
      'How do I define a field at byte position 35 with length 20?',
    ],
  },
  'unstructured-document-studio': {
    title: 'Unstructured Document Studio',
    tips: [
      'AI extraction confidence scores below 0.85 are flagged for human review.',
      'Train extraction models by uploading labelled sample documents.',
      'Map extracted entities back to ISO registry fields for downstream use.',
    ],
    examples: [
      'How do I extract invoice amounts from unstructured PDFs?',
      'What happens when AI confidence is too low?',
      'How do I link extracted fields to the Data Gateway Mapper?',
    ],
  },
  'insights-factory': {
    title: 'Insights Factory',
    tips: [
      'Insights widgets are design-time definitions — they render in Report Dashboards at runtime.',
      'Alert widgets can trigger workflow events when thresholds are breached.',
      'Use the 4-step wizard: Define → Configure → Preview → Deploy.',
    ],
    examples: [
      'How do I create a real-time payment volume alert?',
      'What is the difference between an insight widget and a report widget?',
      'How do I deploy an insight to the 360° Dashboard?',
    ],
  },
  'event-repository': {
    title: 'Event Catalog',
    tips: [
      'Events are immutable — they can be inspected but never modified (audit requirement).',
      'Filter by correlation_id to trace all events for a single transaction lifecycle.',
      'Subscribe events to workflows in the Process Flow Designer to trigger automation.',
    ],
    examples: [
      'How do I find all events for a specific payment transaction?',
      'Can an event automatically start a new workflow?',
      'What event types are emitted by the Reconciliation Engine?',
    ],
  },
};

const DEFAULT_CONTEXT = {
  title: 'Studio Assistant',
  tips: ['Select a studio to see context-specific tips.'],
  examples: ['How does this studio work?', 'What should I configure first?'],
};

interface InfinityAIHelperProps {
  studioKey: string;
}

export const InfinityAIHelper: React.FC<InfinityAIHelperProps> = ({ studioKey }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [question, setQuestion] = useState('');
  const { setActiveModule } = usePlatformStore();

  const ctx = STUDIO_CONTEXT[studioKey] || DEFAULT_CONTEXT;

  const handleOpenFullAI = () => {
    setIsOpen(false);
    setActiveModule('ai-assistant');
  };

  return (
    <>
      {/* Floating ✨ AI trigger button — fixed bottom-right, always visible inside active studio */}
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 z-40 flex items-center gap-2 bg-gradient-to-r from-indigo-600 via-indigo-700 to-indigo-800 hover:from-indigo-700 hover:to-indigo-900 text-white text-[12px] font-bold px-4 py-2.5 rounded-2xl shadow-lg shadow-indigo-600/25 transition-all active:scale-[0.97] hover:shadow-indigo-600/40 hover:shadow-xl"
        title={`Get Infinity AI help for ${ctx.title}`}
      >
        <span className="animate-pulse text-[14px]">✨</span>
        <span>AI Help</span>
      </button>

      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/10 backdrop-blur-[1px]"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Slide-in AI helper panel */}
      <div
        className={`fixed top-16 right-0 bottom-0 z-50 w-[380px] bg-white/97 backdrop-blur-xl border-l border-slate-200/60 shadow-2xl shadow-slate-900/10 flex flex-col transition-transform duration-300 ease-out ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 bg-gradient-to-r from-indigo-600 to-indigo-800 flex items-center justify-between">
          <div>
            <div className="text-[13px] font-extrabold text-white flex items-center gap-2">
              <span className="animate-pulse">✨</span> Infinity AI
            </div>
            <div className="text-[10px] text-indigo-200 mt-0.5 font-medium">{ctx.title} — Context Aware</div>
          </div>
          <button
            onClick={() => setIsOpen(false)}
            className="text-indigo-200 hover:text-white p-1.5 rounded-lg hover:bg-indigo-700/50 transition-all"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5 custom-scrollbar">
          {/* Studio Tips */}
          <div>
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2.5">Studio Tips</div>
            <div className="space-y-2">
              {ctx.tips.map((tip, i) => (
                <div key={i} className="flex items-start gap-2.5 bg-indigo-50/60 border border-indigo-100/60 rounded-xl p-3">
                  <span className="text-indigo-500 text-[11px] font-extrabold mt-0.5 shrink-0">→</span>
                  <p className="text-[11px] text-indigo-800 font-medium leading-relaxed">{tip}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Example Questions */}
          <div>
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2.5">Example Questions</div>
            <div className="space-y-2">
              {ctx.examples.map((ex, i) => (
                <button
                  key={i}
                  onClick={() => setQuestion(ex)}
                  className="w-full text-left text-[11px] text-slate-600 font-medium bg-slate-50/80 border border-slate-200/60 rounded-xl p-3 hover:bg-indigo-50/60 hover:border-indigo-200/60 hover:text-indigo-700 transition-all"
                >
                  "{ex}"
                </button>
              ))}
            </div>
          </div>

          {/* Ask a Question */}
          <div>
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2.5">Ask Infinity AI</div>
            <textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              rows={3}
              placeholder={`Ask anything about ${ctx.title}...`}
              className="w-full text-[12px] text-slate-700 border border-slate-200 rounded-xl p-3 outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400/20 resize-none bg-white/80"
            />
            <button
              onClick={handleOpenFullAI}
              className="mt-2 w-full bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 text-white text-[12px] font-bold py-2.5 rounded-xl transition-all active:scale-[0.98] shadow-md shadow-indigo-600/10"
            >
              Open Full AI Studio ✨
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-100 bg-slate-50/50">
          <p className="text-[10px] text-slate-400 text-center font-medium">
            Infinity AI is context-aware for <span className="text-indigo-600 font-bold">{ctx.title}</span>
          </p>
        </div>
      </div>
    </>
  );
};
