// WHY THIS FILE EXISTS (E1 commit 3/N — TRANSACTION_SCREEN_DESIGN.md §2):
// The metro tracker is the visual core of the Transaction Workflow Screen — a
// horizontal line of "stations" (workflow nodes) color-coded across the 12
// lifecycle states defined in the design doc. An operator reads the tracker in
// 2 seconds and knows where a transaction is, what's blocking it, and what's
// next.
//
// This component is intentionally pure presentational: it takes a list of
// stations + their states + optional live sub-text, and returns an SVG. No data
// fetching, no business logic. Live wiring to GET /workflows/instances/{id}
// lands in E1 commit 4/N; live sub-text from the audit columns lands in 5/N.
//
// COLOR/ICON LANGUAGE (locked in design doc §2.1):
//   color encodes urgency · icon encodes nature · sub-text encodes why
//   purple = voluntary cancel · red = system-driven block/reject/fail
//   amber = in motion (in progress, paused, retrying) · green = completed
//
// WHAT BREAKS IF REMOVED: The Transaction Workflow Screen has no visual canvas
// to render — the placeholder stays forever. Every downstream E1 commit
// (4/5/6) depends on this component existing.

import React from 'react';

// The 12 lifecycle states an operator can encounter on a single workflow step.
// Mirrors the WorkflowExecutionInstance.status values plus the SKIPPED branch-
// taken-elsewhere indicator. Pure presentation enum — runtime state comes from
// the engine; this is just how we draw it.
export type StepLifecycleState =
  | 'PENDING'           // not yet reached
  | 'IN_PROGRESS'       // actively executing
  | 'PAUSED'            // awaiting human approval / external signal
  | 'RETRYING'          // auto-retry in progress (attempt N of M)
  | 'AWAITING_REPAIR'   // exhausted retries, sitting in repair queue
  | 'FAILED_TECHNICAL'  // hard fail, no further retries, no repair queue
  | 'BLOCKED'           // rule fired BLOCK_PAYMENT (system-driven, red)
  | 'REJECTED'          // rule fired REJECT_STEP (validation failure, red)
  | 'CANCELLED'         // rule fired CANCEL_TRANSACTION (voluntary, PURPLE)
  | 'COMPLETED'         // success
  | 'REVERSED'          // was completed, then rolled back
  | 'SKIPPED';          // conditional branch not taken

export interface TrackerStation {
  node_id: string;
  sequence_number: number;
  node_title: string;
  state: StepLifecycleState;
  /** Optional live sub-text below the station label, e.g. "retry 2/3 · next in 28s". */
  sub_text?: string;
}

interface MetroTrackerProps {
  stations: TrackerStation[];
  /** Optional override for the SVG viewBox width — defaults to 680, the design-doc canvas width. */
  viewWidth?: number;
}

// State-driven styling. Centralised so the legend (rendered alongside the SVG)
// is guaranteed to match the stations — if a colour changes here, the legend
// updates automatically because both read from this map.
//
// Hex values come straight from the project's colour palette stops (Imagine
// design system) — using mid-ramp hex inline so the component works
// identically in light and dark mode without depending on CSS variables in
// SVG fill attributes (which some renderers don't honour).
const STATE_STYLES: Record<StepLifecycleState, {
  fill: string;
  stroke: string;
  ring?: string;       // optional outer ring for compound states (e.g. RETRYING)
  glyph: string;       // single-character SVG glyph or empty string
  glyphFill: string;   // colour of the glyph
  label: string;       // legend label
}> = {
  PENDING:          { fill: '#F1EFE8', stroke: '#B4B2A9',                  glyph: '',  glyphFill: '#888780', label: 'Pending' },
  IN_PROGRESS:      { fill: '#FAC775', stroke: '#BA7517',                  glyph: '●', glyphFill: '#854F0B', label: 'In progress' },
  PAUSED:           { fill: '#FAC775', stroke: '#BA7517',                  glyph: '‖', glyphFill: '#854F0B', label: 'Paused' },
  RETRYING:         { fill: '#FAC775', stroke: '#BA7517', ring: '#A32D2D', glyph: '↻', glyphFill: '#A32D2D', label: 'Retrying' },
  AWAITING_REPAIR:  { fill: '#E24B4A', stroke: '#A32D2D',                  glyph: '✕', glyphFill: '#FFFFFF', label: 'Awaiting repair' },
  FAILED_TECHNICAL: { fill: '#A32D2D', stroke: '#501313',                  glyph: '✕', glyphFill: '#FFFFFF', label: 'Failed (technical)' },
  BLOCKED:          { fill: '#A32D2D', stroke: '#501313',                  glyph: '!', glyphFill: '#FFFFFF', label: 'Blocked' },
  REJECTED:         { fill: '#A32D2D', stroke: '#501313',                  glyph: '✕', glyphFill: '#FFFFFF', label: 'Rejected' },
  CANCELLED:        { fill: '#7F77DD', stroke: '#534AB7',                  glyph: '✕', glyphFill: '#FFFFFF', label: 'Cancelled' },
  COMPLETED:        { fill: '#639922', stroke: '#3B6D11',                  glyph: '✓', glyphFill: '#FFFFFF', label: 'Completed' },
  REVERSED:         { fill: '#FAC775', stroke: '#BA7517',                  glyph: '↶', glyphFill: '#854F0B', label: 'Reversed' },
  SKIPPED:          { fill: '#F1EFE8', stroke: '#B4B2A9',                  glyph: '—', glyphFill: '#888780', label: 'Skipped' },
};

export const MetroTracker: React.FC<MetroTrackerProps> = ({ stations, viewWidth = 680 }) => {
  if (stations.length === 0) {
    return (
      <div className="h-[220px] rounded-2xl border border-dashed border-slate-200 bg-slate-50/30 flex items-center justify-center text-slate-400 text-[12px] font-medium">
        No workflow nodes to render.
      </div>
    );
  }

  // Layout algorithm — evenly spaced stations along the horizontal track.
  // Padding leaves room for the leftmost / rightmost station glyphs to render
  // without clipping the SVG viewBox.
  const padding = 60;
  const trackY = 50;
  const labelY = 80;
  const subTextY = 94;
  const viewHeight = subTextY + 30;
  const innerWidth = viewWidth - padding * 2;
  const xFor = (i: number) =>
    stations.length === 1
      ? viewWidth / 2
      : padding + (i * innerWidth) / (stations.length - 1);

  // Build a unique-state set in insertion order so the legend only shows
  // states that actually appear in THIS transaction — operators don't need
  // to read the full 12-state legend on every screen.
  const statesPresent: StepLifecycleState[] = [];
  for (const s of stations) {
    if (!statesPresent.includes(s.state)) statesPresent.push(s.state);
  }

  return (
    <div className="w-full">
      <svg
        viewBox={`0 0 ${viewWidth} ${viewHeight}`}
        role="img"
        aria-label="Workflow progress tracker"
        style={{ width: '100%', height: 'auto' }}
      >
        <title>Workflow progress tracker</title>

        {/* Horizontal connecting line — neutral mid-gray, works in both modes. */}
        <line
          x1={padding}
          y1={trackY}
          x2={viewWidth - padding}
          y2={trackY}
          stroke="#B4B2A9"
          strokeWidth={2}
        />

        {stations.map((s, i) => {
          const x = xFor(i);
          const style = STATE_STYLES[s.state];
          const radius = s.state === 'IN_PROGRESS' || s.state === 'RETRYING' ? 17 : 14;
          return (
            <g key={s.node_id}>
              {/* Outer ring (RETRYING only) — visual cue that this station has live activity. */}
              {style.ring && (
                <circle cx={x} cy={trackY} r={radius + 3} fill="none" stroke={style.ring} strokeWidth={2} />
              )}
              {/* Station body */}
              <circle
                cx={x}
                cy={trackY}
                r={radius}
                fill={style.fill}
                stroke={style.stroke}
                strokeWidth={s.state === 'PENDING' ? 1.5 : 2}
              />
              {/* Glyph (check / cross / refresh / etc) */}
              {style.glyph && (
                <text
                  x={x}
                  y={trackY + 5}
                  textAnchor="middle"
                  fontSize={radius >= 17 ? 14 : 13}
                  fill={style.glyphFill}
                  fontWeight={500}
                  style={{
                    // Strikethrough for SKIPPED renders the "—" with a line through
                    textDecoration: s.state === 'SKIPPED' ? 'line-through' : 'none',
                  }}
                >
                  {style.glyph}
                </text>
              )}
              {/* Station title (always shown) */}
              <text
                x={x}
                y={labelY}
                textAnchor="middle"
                fontSize={10}
                fill="#5F5E5A"
                fontWeight={s.state === 'IN_PROGRESS' || s.state === 'RETRYING' ? 500 : 400}
              >
                {`${s.sequence_number}. ${s.node_title}`}
              </text>
              {/* Live sub-text (optional) — explains WHY this station is in its current state. */}
              {s.sub_text && (
                <text
                  x={x}
                  y={subTextY}
                  textAnchor="middle"
                  fontSize={9}
                  fill={
                    s.state === 'FAILED_TECHNICAL' ||
                    s.state === 'BLOCKED' ||
                    s.state === 'REJECTED' ||
                    s.state === 'AWAITING_REPAIR' ||
                    s.state === 'RETRYING'
                      ? '#A32D2D'
                      : '#888780'
                  }
                >
                  {s.sub_text}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {/* Legend — only the states that appear in this transaction, not the full palette.
          Avoids visual noise on simple "happy path" runs. */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 pt-3 border-t border-slate-200/60 justify-center">
        {statesPresent.map(state => {
          const style = STATE_STYLES[state];
          return (
            <div key={state} className="flex items-center gap-1.5 text-[11px] text-slate-600">
              <span
                style={{
                  width: 11,
                  height: 11,
                  borderRadius: '50%',
                  background: style.fill,
                  border: `1.5px solid ${style.stroke}`,
                  boxSizing: 'border-box',
                  outline: style.ring ? `1.5px solid ${style.ring}` : 'none',
                  outlineOffset: style.ring ? 1 : 0,
                  display: 'inline-block',
                  flexShrink: 0,
                }}
              />
              {style.label}
            </div>
          );
        })}
      </div>
    </div>
  );
};
