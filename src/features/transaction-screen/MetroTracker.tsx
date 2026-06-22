// WHY THIS FILE EXISTS (E1 commit 3/N — TRANSACTION_SCREEN_DESIGN.md §2):
// The metro tracker is the visual core of the Transaction Workflow Screen — a
// horizontal line of "stations" (workflow nodes) color-coded across the 12
// lifecycle states defined in the design doc. An operator reads the tracker in
// 2 seconds and knows where a transaction is, what's blocking it, and what's
// next.
//
// E4 commit 2/N — Parallel branch rendering:
// Workflow steps like "Sanctions check" and "Balance inquiry" can run in parallel.
// The tracker renders these as secondary horizontal tracks below the main line,
// connected by vertical drop lines at the FORK and JOIN stations. All tracks are
// always visible — no collapsing — so the operator sees the full end-to-end picture
// at a glance, including what ran in parallel and whether it succeeded.
//
// COLOR/ICON LANGUAGE (locked in design doc §2.1):
//   color encodes urgency · icon encodes nature · sub-text encodes why
//   purple = voluntary cancel · red = system-driven block/reject/fail
//   amber = in motion (in progress, paused, retrying) · green = completed
//
// WHAT BREAKS IF REMOVED: The Transaction Workflow Screen has no visual canvas
// to render — the placeholder stays forever. Every downstream commit depends on
// this component existing.

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
  // E4 commit 2/N — Parallel branch support.
  // branch_track: undefined/0 = main line, 1+ = parallel track below the main line.
  // is_fork: this station spawns parallel branches (vertical drop lines go down from here).
  // is_join: this station merges all branches (vertical lines come up to here).
  branch_track?: number;
  is_fork?: boolean;
  is_join?: boolean;
}

interface MetroTrackerProps {
  stations: TrackerStation[];
  /** Optional override for the SVG viewBox width — defaults to 680, the design-doc canvas width. */
  viewWidth?: number;
}

// State-driven styling. Centralised so the legend (rendered alongside the SVG)
// is guaranteed to match the stations — if a colour changes here, the legend
// updates automatically because both read from this map.
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

// Single station circle + label + sub-text, reused across main and branch tracks.
const StationNode: React.FC<{
  x: number;
  y: number;
  station: TrackerStation;
}> = ({ x, y, station }) => {
  const style = STATE_STYLES[station.state];
  const radius = station.state === 'IN_PROGRESS' || station.state === 'RETRYING' ? 15 : 12;
  const isError = ['FAILED_TECHNICAL', 'BLOCKED', 'REJECTED', 'AWAITING_REPAIR', 'RETRYING'].includes(station.state);

  return (
    <g>
      {/* Outer pulsing ring — RETRYING only */}
      {style.ring && (
        <circle cx={x} cy={y} r={radius + 3} fill="none" stroke={style.ring} strokeWidth={1.5} strokeDasharray="3 2" />
      )}
      {/* Station body */}
      <circle
        cx={x}
        cy={y}
        r={radius}
        fill={style.fill}
        stroke={style.stroke}
        strokeWidth={station.state === 'PENDING' ? 1.5 : 2}
      />
      {/* Glyph */}
      {style.glyph && (
        <text
          x={x}
          y={y + 4.5}
          textAnchor="middle"
          fontSize={radius >= 15 ? 12 : 11}
          fill={style.glyphFill}
          fontWeight={600}
        >
          {style.glyph}
        </text>
      )}
      {/* Station title */}
      <text
        x={x}
        y={y + radius + 13}
        textAnchor="middle"
        fontSize={9}
        fill="#5F5E5A"
        fontWeight={station.state === 'IN_PROGRESS' || station.state === 'RETRYING' ? 600 : 400}
      >
        {station.node_title}
      </text>
      {/* Live sub-text */}
      {station.sub_text && (
        <text
          x={x}
          y={y + radius + 24}
          textAnchor="middle"
          fontSize={8}
          fill={isError ? '#A32D2D' : '#888780'}
        >
          {station.sub_text}
        </text>
      )}
    </g>
  );
};

// ── Layout constants ──────────────────────────────────────────────────────────
const PADDING = 55;         // horizontal padding left and right of track
const MAIN_Y = 55;          // Y of the main horizontal track
const BRANCH_SPACING = 80;  // vertical gap between each parallel branch track
const STATION_R_MAX = 18;   // largest station radius (for drop-line endpoint clearance)
const LABEL_BELOW = 30;     // space below station for label + sub-text

export const MetroTracker: React.FC<MetroTrackerProps> = ({ stations, viewWidth = 680 }) => {
  if (stations.length === 0) {
    return (
      <div className="h-[220px] rounded-2xl border border-dashed border-slate-200 bg-slate-50/30 flex items-center justify-center text-slate-400 text-[12px] font-medium">
        No workflow nodes to render.
      </div>
    );
  }

  // ── Partition stations into main track vs. parallel branch tracks ────────
  const mainStations = stations.filter(s => !s.branch_track || s.branch_track === 0);
  const branchMap = new Map<number, TrackerStation[]>();
  for (const s of stations) {
    if (s.branch_track && s.branch_track > 0) {
      const arr = branchMap.get(s.branch_track) ?? [];
      arr.push(s);
      branchMap.set(s.branch_track, arr);
    }
  }
  const numBranchTracks = branchMap.size;
  const sortedBranchTrackNums = [...branchMap.keys()].sort((a, b) => a - b);

  // ── Main track x-positions ───────────────────────────────────────────────
  const innerWidth = viewWidth - PADDING * 2;
  const xForMain = (i: number) =>
    mainStations.length === 1
      ? viewWidth / 2
      : PADDING + (i * innerWidth) / (mainStations.length - 1);

  // ── Fork / Join x coordinates on the main track ─────────────────────────
  const forkIdx = mainStations.findIndex(s => s.is_fork);
  const joinIdx = mainStations.findIndex(s => s.is_join);
  const forkX = forkIdx >= 0 ? xForMain(forkIdx) : PADDING;
  const joinX = joinIdx >= 0 ? xForMain(joinIdx) : viewWidth - PADDING;

  // ── Branch station x-positions (spread evenly between fork and join) ─────
  // Each branch track has independent station count; we spread them across
  // the fork→join horizontal span with 10% margin on each side.
  const makeBranchXFn = (stationCount: number) => (i: number): number => {
    if (stationCount === 1) return (forkX + joinX) / 2;
    const span = joinX - forkX;
    const innerSpan = span * 0.8;
    const offsetX = forkX + span * 0.1;
    return offsetX + (i * innerSpan) / (stationCount - 1);
  };

  // ── Compute SVG height ───────────────────────────────────────────────────
  const viewHeight = MAIN_Y + LABEL_BELOW + numBranchTracks * BRANCH_SPACING + 30;

  // ── Build unique-state legend (only states present in THIS transaction) ──
  const statesPresent: StepLifecycleState[] = [];
  for (const s of stations) {
    if (!statesPresent.includes(s.state)) statesPresent.push(s.state);
  }

  // ── Track Y for each branch track (1-indexed) ───────────────────────────
  const branchTrackY = (trackNum: number) => MAIN_Y + LABEL_BELOW + (trackNum - 1) * BRANCH_SPACING + 35;

  return (
    <div className="w-full">
      <svg
        viewBox={`0 0 ${viewWidth} ${viewHeight}`}
        role="img"
        aria-label="Workflow progress tracker"
        style={{ width: '100%', height: 'auto' }}
      >
        <title>Workflow progress tracker</title>

        {/* ── Main horizontal track line ─────────────────────────────────── */}
        <line
          x1={PADDING}
          y1={MAIN_Y}
          x2={viewWidth - PADDING}
          y2={MAIN_Y}
          stroke="#B4B2A9"
          strokeWidth={2}
        />

        {/* ── Parallel branch tracks (if any) ───────────────────────────── */}
        {sortedBranchTrackNums.map((trackNum) => {
          const branchStations = branchMap.get(trackNum)!;
          const trackY = branchTrackY(trackNum);
          const getX = makeBranchXFn(branchStations.length);

          const firstX = getX(0);
          const lastX = getX(branchStations.length - 1);

          return (
            <g key={`branch-${trackNum}`}>
              {/* Branch horizontal line */}
              <line
                x1={firstX}
                y1={trackY}
                x2={lastX}
                y2={trackY}
                stroke="#C8C5BE"
                strokeWidth={1.5}
                strokeDasharray="4 3"
              />

              {/* Drop line from fork station down to branch line start */}
              {forkIdx >= 0 && (
                <line
                  x1={forkX}
                  y1={MAIN_Y + STATION_R_MAX}
                  x2={firstX}
                  y2={trackY}
                  stroke="#C8C5BE"
                  strokeWidth={1.5}
                  strokeDasharray="4 3"
                />
              )}

              {/* Merge line from branch line end up to join station */}
              {joinIdx >= 0 && (
                <line
                  x1={lastX}
                  y1={trackY}
                  x2={joinX}
                  y2={MAIN_Y + STATION_R_MAX}
                  stroke="#C8C5BE"
                  strokeWidth={1.5}
                  strokeDasharray="4 3"
                />
              )}

              {/* Branch label — shows which parallel group this is */}
              <text
                x={forkX + 6}
                y={trackY - 6}
                fontSize={8}
                fill="#9C9A95"
                fontStyle="italic"
              >
                parallel {trackNum}
              </text>

              {/* Branch stations */}
              {branchStations.map((s, i) => (
                <StationNode key={s.node_id} x={getX(i)} y={trackY} station={s} />
              ))}
            </g>
          );
        })}

        {/* ── Main track stations ────────────────────────────────────────── */}
        {mainStations.map((s, i) => (
          <StationNode key={s.node_id} x={xForMain(i)} y={MAIN_Y} station={s} />
        ))}

        {/* ── FORK marker — double vertical bar at the fork station ──────── */}
        {forkIdx >= 0 && numBranchTracks > 0 && (
          <g>
            <text x={forkX} y={MAIN_Y - 22} textAnchor="middle" fontSize={8} fill="#9C9A95" fontStyle="italic">
              FORK
            </text>
          </g>
        )}

        {/* ── JOIN marker ────────────────────────────────────────────────── */}
        {joinIdx >= 0 && numBranchTracks > 0 && (
          <text x={joinX} y={MAIN_Y - 22} textAnchor="middle" fontSize={8} fill="#9C9A95" fontStyle="italic">
            JOIN
          </text>
        )}
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
        {/* Parallel track indicator in legend */}
        {numBranchTracks > 0 && (
          <div className="flex items-center gap-1.5 text-[11px] text-slate-500 italic">
            <span style={{ width: 16, height: 0, borderTop: '1.5px dashed #C8C5BE', display: 'inline-block' }} />
            parallel branch
          </div>
        )}
      </div>
    </div>
  );
};
