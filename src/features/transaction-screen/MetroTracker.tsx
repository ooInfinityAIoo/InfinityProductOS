import React from 'react';

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
  sub_text?: string;
  branch_track?: number;
  is_fork?: boolean;
  is_join?: boolean;
  sla_warning?: boolean;
  sla_breached?: boolean;
  
  // UX nested sub-workflows extensions
  is_sub_workflow?: boolean;
  sub_workflow_parent_node_id?: string;
  sub_workflow_track?: number;
}

interface MetroTrackerProps {
  stations: TrackerStation[];
  viewWidth?: number;
  onStationClick?: (nodeId: string) => void;
  activeStationId?: string;
  
  // Breadcrumb dynamic depth navigation props
  breadcrumbs?: string[];
  onBreadcrumbClick?: (index: number) => void;
}

const STATE_STYLES: Record<StepLifecycleState, {
  fill: string;
  stroke: string;
  ring?: string;
  glyph: string;
  glyphFill: string;
  label: string;
}> = {
  PENDING: { fill: '#F1EFE8', stroke: '#B4B2A9', glyph: '', glyphFill: '#888780', label: 'Pending' },
  IN_PROGRESS: { fill: '#FAC775', stroke: '#BA7517', glyph: '●', glyphFill: '#854F0B', label: 'In progress' },
  PAUSED: { fill: '#FAC775', stroke: '#BA7517', glyph: '‖', glyphFill: '#854F0B', label: 'Paused' },
  RETRYING: { fill: '#FAC775', stroke: '#BA7517', ring: '#A32D2D', glyph: '↻', glyphFill: '#A32D2D', label: 'Retrying' },
  AWAITING_REPAIR: { fill: '#E24B4A', stroke: '#A32D2D', glyph: '✕', glyphFill: '#FFFFFF', label: 'Awaiting repair' },
  FAILED_TECHNICAL: { fill: '#A32D2D', stroke: '#501313', glyph: '✕', glyphFill: '#FFFFFF', label: 'Failed (technical)' },
  BLOCKED: { fill: '#A32D2D', stroke: '#501313', glyph: '!', glyphFill: '#FFFFFF', label: 'Blocked' },
  REJECTED: { fill: '#A32D2D', stroke: '#501313', glyph: '✕', glyphFill: '#FFFFFF', label: 'Rejected' },
  CANCELLED: { fill: '#7F77DD', stroke: '#534AB7', glyph: '✕', glyphFill: '#FFFFFF', label: 'Cancelled' },
  COMPLETED: { fill: '#639922', stroke: '#3B6D11', glyph: '✓', glyphFill: '#FFFFFF', label: 'Completed' },
  REVERSED: { fill: '#FAC775', stroke: '#BA7517', glyph: '↶', glyphFill: '#854F0B', label: 'Reversed' },
  SKIPPED: { fill: '#F1EFE8', stroke: '#B4B2A9', glyph: '—', glyphFill: '#888780', label: 'Skipped' },
};

const StationNode: React.FC<{
  x: number;
  y: number;
  station: TrackerStation;
  onClick?: (nodeId: string) => void;
  active?: boolean;
}> = ({ x, y, station, onClick, active }) => {
  const style = STATE_STYLES[station.state];
  const radius = station.state === 'IN_PROGRESS' || station.state === 'RETRYING' ? 14 : 11;
  const isError = ['FAILED_TECHNICAL', 'BLOCKED', 'REJECTED', 'AWAITING_REPAIR', 'RETRYING'].includes(station.state);
  const clickable = !!onClick;

  return (
    <g
      onClick={clickable ? () => onClick!(station.node_id) : undefined}
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      onKeyDown={clickable ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick!(station.node_id); } } : undefined}
      aria-label={clickable ? `Open ${station.node_title} screen` : undefined}
      className="outline-none focus:ring-2 focus:ring-indigo-500 rounded"
      style={clickable ? { cursor: 'pointer' } : undefined}
    >
      {active && (
        <circle cx={x} cy={y} r={radius + 5} fill="none" stroke="#4F46E5" strokeWidth={2} />
      )}
      {clickable && (
        <circle cx={x} cy={y} r={radius + 8} fill="transparent" />
      )}
      {style.ring && (
        <circle cx={x} cy={y} r={radius + 3} fill="none" stroke={style.ring} strokeWidth={1.5} strokeDasharray="3 2" />
      )}
      <circle
        cx={x}
        cy={y}
        r={radius}
        fill={style.fill}
        stroke={style.stroke}
        strokeWidth={station.state === 'PENDING' ? 1.5 : 2}
      />
      {style.glyph && (
        <text
          x={x}
          y={y + 4}
          textAnchor="middle"
          fontSize={radius >= 14 ? 11 : 10}
          fill={style.glyphFill}
          fontWeight={600}
        >
          {style.glyph}
        </text>
      )}
      <text
        x={x}
        y={y + radius + 11}
        textAnchor="middle"
        fontSize={8.5}
        fill="#334155"
        fontWeight={station.state === 'IN_PROGRESS' || station.state === 'RETRYING' || active ? 600 : 400}
      >
        {station.node_title}
      </text>
      {station.sub_text && (
        <text
          x={x}
          y={y + radius + 21}
          textAnchor="middle"
          fontSize={7.5}
          fill={isError ? '#DC2626' : '#64748B'}
        >
          {station.sub_text}
        </text>
      )}
      {(station.sla_breached || station.sla_warning) && (
        <g>
          <circle
            cx={x + radius - 2}
            cy={y - radius + 2}
            r={3.5}
            fill={station.sla_breached ? '#DC2626' : '#F59E0B'}
            stroke="#FFFFFF"
            strokeWidth={1}
          />
        </g>
      )}
    </g>
  );
};

const PADDING = 55;
const MAIN_Y = 55;
const BRANCH_SPACING = 70;
const STATION_R_MAX = 15;
const LABEL_BELOW = 24;

export const MetroTracker: React.FC<MetroTrackerProps> = ({
  stations,
  viewWidth = 680,
  onStationClick,
  activeStationId,
  breadcrumbs = ['Main Flow'],
  onBreadcrumbClick,
}) => {
  if (stations.length === 0) {
    return (
      <div className="h-[120px] rounded-xl border border-dashed border-slate-200 bg-slate-50/30 flex items-center justify-center text-slate-400 text-xs font-medium">
        No workflow nodes to render.
      </div>
    );
  }

  // Grouping stations: Main Track vs Parallel Branches vs Sub-Workflows
  const mainStations = stations.filter(s => !s.is_sub_workflow && (!s.branch_track || s.branch_track === 0));
  const branchMap = new Map<number, TrackerStation[]>();
  const subWorkflowStations = stations.filter(s => s.is_sub_workflow);

  for (const s of stations) {
    if (!s.is_sub_workflow && s.branch_track && s.branch_track > 0) {
      const arr = branchMap.get(s.branch_track) ?? [];
      arr.push(s);
      branchMap.set(s.branch_track, arr);
    }
  }

  const numBranchTracks = branchMap.size;
  const sortedBranchTrackNums = [...branchMap.keys()].sort((a, b) => a - b);

  const innerWidth = viewWidth - PADDING * 2;
  
  // Horizontal coordinates for main track
  const xForMain = (i: number) =>
    mainStations.length === 1
      ? viewWidth / 2
      : PADDING + (i * innerWidth) / (mainStations.length - 1);

  const forkIdx = mainStations.findIndex(s => s.is_fork);
  const joinIdx = mainStations.findIndex(s => s.is_join);
  const forkX = forkIdx >= 0 ? xForMain(forkIdx) : PADDING;
  const joinX = joinIdx >= 0 ? xForMain(joinIdx) : viewWidth - PADDING;

  const makeBranchXFn = (stationCount: number) => (i: number): number => {
    if (stationCount === 1) return (forkX + joinX) / 2;
    const span = joinX - forkX;
    const innerSpan = span * 0.8;
    const offsetX = forkX + span * 0.1;
    return offsetX + (i * innerSpan) / (stationCount - 1);
  };

  // Determine Sub-workflow track coordinates
  const SUB_Y = MAIN_Y + (numBranchTracks > 0 ? numBranchTracks * BRANCH_SPACING : 70);
  const makeSubXFn = (stationCount: number) => (i: number): number => {
    // We start sub-workflows around Step 3 (FX Enrichment) or spawn point coordinates
    const span = viewWidth - PADDING * 2;
    const innerSpan = span * 0.65;
    const offsetX = PADDING + span * 0.25;
    return offsetX + (i * innerSpan) / (stationCount - 1);
  };

  const hasSub = subWorkflowStations.length > 0;
  const viewHeight = MAIN_Y + LABEL_BELOW + 
                     (numBranchTracks * BRANCH_SPACING) + 
                     (hasSub ? BRANCH_SPACING + 15 : 20);

  const statesPresent: StepLifecycleState[] = [];
  for (const s of stations) {
    if (!statesPresent.includes(s.state)) statesPresent.push(s.state);
  }

  const branchTrackY = (trackNum: number) => MAIN_Y + LABEL_BELOW + (trackNum - 1) * BRANCH_SPACING + 30;

  return (
    <div className="w-full bg-slate-50/50 rounded-xl border border-slate-100 p-4 select-none shrink-0">
      
      {/* ── Breadcrumb Navigation ────────────────────────────────────────── */}
      <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">
        {breadcrumbs.map((crumb, idx) => (
          <React.Fragment key={idx}>
            {idx > 0 && <span className="text-slate-300">➔</span>}
            <button
              onClick={() => onBreadcrumbClick && onBreadcrumbClick(idx)}
              disabled={idx === breadcrumbs.length - 1}
              className={`hover:underline disabled:no-underline transition-colors ${
                idx === breadcrumbs.length - 1 ? 'text-indigo-600 font-extrabold' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              {crumb}
            </button>
          </React.Fragment>
        ))}
      </div>

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
          stroke="#E2E8F0"
          strokeWidth={3}
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
              <line
                x1={firstX}
                y1={trackY}
                x2={lastX}
                y2={trackY}
                stroke="#CBD5E1"
                strokeWidth={2}
                strokeDasharray="4 3"
              />
              {forkIdx >= 0 && (
                <line
                  x1={forkX}
                  y1={MAIN_Y + STATION_R_MAX}
                  x2={firstX}
                  y2={trackY}
                  stroke="#CBD5E1"
                  strokeWidth={2}
                  strokeDasharray="4 3"
                />
              )}
              {joinIdx >= 0 && (
                <line
                  x1={lastX}
                  y1={trackY}
                  x2={joinX}
                  y2={MAIN_Y + STATION_R_MAX}
                  stroke="#CBD5E1"
                  strokeWidth={2}
                  strokeDasharray="4 3"
                />
              )}
              <text x={forkX + 6} y={trackY - 6} fontSize={8} fill="#94A3B8" fontStyle="italic">
                parallel {trackNum}
              </text>
              {branchStations.map((s, i) => (
                <StationNode
                  key={s.node_id}
                  x={getX(i)}
                  y={trackY}
                  station={s}
                  onClick={onStationClick}
                  active={activeStationId === s.node_id}
                />
              ))}
            </g>
          );
        })}

        {/* ── Nested Sub-Workflow Track ─────────────────────────────────── */}
        {hasSub && (() => {
          const subXFn = makeSubXFn(subWorkflowStations.length);
          const firstSubX = subXFn(0);
          const lastSubX = subXFn(subWorkflowStations.length - 1);

          // Find the parent station coordinate (usually Step 3 FX rate node)
          const parentNodeId = subWorkflowStations[0].sub_workflow_parent_node_id;
          const parentIdx = mainStations.findIndex(s => s.node_id === parentNodeId);
          const parentX = parentIdx >= 0 ? xForMain(parentIdx) : PADDING + innerWidth * 0.4;

          return (
            <g key="sub-workflow-track">
              {/* Sub-workflow horizontal rail */}
              <line
                x1={firstSubX}
                y1={SUB_Y}
                x2={lastSubX}
                y2={SUB_Y}
                stroke="#6366F1"
                strokeWidth={2}
                strokeDasharray="3 3"
              />
              
              {/* Spine connection line dropping from parent station */}
              <path
                d={`M ${parentX} ${MAIN_Y + 12} L ${parentX} ${SUB_Y} L ${firstSubX - 10} ${SUB_Y}`}
                fill="none"
                stroke="#6366F1"
                strokeWidth={1.5}
                strokeDasharray="3 3"
              />
              
              {/* Arrow pointer entry */}
              <polygon
                points={`${firstSubX - 10},${SUB_Y - 3} ${firstSubX - 4},${SUB_Y} ${firstSubX - 10},${SUB_Y + 3}`}
                fill="#6366F1"
              />

              <text x={parentX + 8} y={SUB_Y - 6} fontSize={8} fill="#6366F1" className="font-bold tracking-wider">
                SUB-FLOW
              </text>

              {/* Render sub-workflow nodes */}
              {subWorkflowStations.map((s, i) => (
                <StationNode
                  key={s.node_id}
                  x={subXFn(i)}
                  y={SUB_Y}
                  station={s}
                  onClick={onStationClick}
                  active={activeStationId === s.node_id}
                />
              ))}
            </g>
          );
        })()}

        {/* ── Main track stations ────────────────────────────────────────── */}
        {mainStations.map((s, i) => (
          <StationNode
            key={s.node_id}
            x={xForMain(i)}
            y={MAIN_Y}
            station={s}
            onClick={onStationClick}
            active={activeStationId === s.node_id}
          />
        ))}

        {forkIdx >= 0 && numBranchTracks > 0 && (
          <g>
            <text x={forkX} y={MAIN_Y - 18} textAnchor="middle" fontSize={7.5} fill="#94A3B8" fontStyle="italic">
              FORK
            </text>
          </g>
        )}

        {joinIdx >= 0 && numBranchTracks > 0 && (
          <text x={joinX} y={MAIN_Y - 18} textAnchor="middle" fontSize={7.5} fill="#94A3B8" fontStyle="italic">
            JOIN
          </text>
        )}
      </svg>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 pt-3 border-t border-slate-200/60 justify-center">
        {statesPresent.map(state => {
          const style = STATE_STYLES[state];
          return (
            <div key={state} className="flex items-center gap-1.5 text-[10px] text-slate-500">
              <span
                style={{
                  width: 9,
                  height: 9,
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
        {numBranchTracks > 0 && (
          <div className="flex items-center gap-1.5 text-[10px] text-slate-400 italic">
            <span style={{ width: 14, height: 0, borderTop: '1.5px dashed #CBD5E1', display: 'inline-block' }} />
            parallel branch
          </div>
        )}
        {hasSub && (
          <div className="flex items-center gap-1.5 text-[10px] text-indigo-400 font-bold">
            <span style={{ width: 14, height: 0, borderTop: '1.5px dashed #6366F1', display: 'inline-block' }} />
            sub-flow track
          </div>
        )}
      </div>
    </div>
  );
};
