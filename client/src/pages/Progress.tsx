import { useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import {
  TrendingUp, TrendingDown, Trophy,
  Search, X, ChevronDown, BarChart2,
  CalendarDays, ChevronLeft, ChevronRight, Info, Pencil,
} from "lucide-react";
import {
  getSessions, getPersonalBests, getPersonalBest, getExercises, seedYearOfData,
} from "@/lib/storage";
import type { WorkoutSession, PersonalBest, Exercise, WorkoutSet } from "@/lib/types";
import { formatDate, calcIntensity, intensityLabel, topWeight, toDisplay, unitLabel } from "@/lib/hooks";
import { useTheme } from "@/lib/theme";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";

// ─── Metrics ────────────────────────────────────────────────────────────────

type Metric = "intensity" | "weight" | "volume";
type TimeRange = "1m" | "3m" | "6m" | "1y" | "all";
const TIME_RANGE_OPTIONS: { value: TimeRange; label: string; short: string }[] = [
  { value: "1m", label: "Last Month", short: "1M" },
  { value: "3m", label: "3 Months", short: "3M" },
  { value: "6m", label: "6 Months", short: "6M" },
  { value: "1y", label: "1 Year", short: "1Y" },
  { value: "all", label: "All Time", short: "All" },
];

// Single accent across every metric — minimal, monochrome + one blue.
const ACCENT = "hsl(214 94% 60%)";
const METRICS: { key: Metric; label: string; unit: string; color: string }[] = [
  { key: "intensity", label: "Intensity",  unit: "%",  color: ACCENT },
  { key: "weight",    label: "Max Wt",     unit: "kg", color: ACCENT },
];

interface SessionPoint {
  date: number;
  label: string;
  intensity: number;
  weight: number;
  volume: number;
  reps: number;
  sets: WorkoutSet[];
  notes?: string;
}

function metricValue(p: SessionPoint, m: Metric): number {
  return m === "intensity" ? p.intensity : m === "weight" ? p.weight : p.volume;
}

function fmt(v: number): string {
  if (v >= 1000) return `${(v / 1000).toFixed(1)}k`;
  return v % 1 === 0 ? `${v}` : v.toFixed(1);
}

function shortDate(ts: number): string {
  return new Date(ts).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

// Smooth cardinal spline through the given points (Catmull-Rom → cubic Bezier).
function smoothPath(pts: { x: number; y: number }[]): string {
  if (pts.length === 0) return "";
  if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y}`;
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
  }
  return d;
}

// Build one point per session (oldest → newest) for the chosen exercise.
function buildPoints(sessions: WorkoutSession[], exerciseId: string): SessionPoint[] {
  const pb = getPersonalBest(exerciseId);
  return sessions
    .filter((s) => s.exercises.some((e) => e.exerciseId === exerciseId))
    .slice()
    .reverse() // getSessions() is newest-first; chart reads left→right oldest→newest
    .map((s) => {
      const ex = s.exercises.find((e) => e.exerciseId === exerciseId)!;
      const done = ex.sets.filter((set) => set.completed);
      return {
        date: s.startedAt,
        label: shortDate(s.startedAt),
        intensity: Math.round(calcIntensity(done, pb)),
        weight: topWeight(done),
        volume: done.reduce((sum, set) => sum + set.weight * (set.reps + (set.partialReps ?? 0) * 0.5), 0),
        reps: done.reduce((sum, set) => sum + set.reps, 0),
        sets: done,
        notes: ex.notes,
      };
    })
    .filter((p) => p.sets.length > 0);
}

// ─── Simple Line Chart (one dot per session) ─────────────────────────────────

// mode: "overview" = thin dotted line, no nodes, not interactive (year/all-time view)
//       "detail"   = thin dotted line, tiny clickable nodes (month view)
//       "normal"   = area fill, interactive nodes (week view)
function LineChart({
  points, metric, mode = "normal",
}: {
  points: SessionPoint[];
  metric: Metric;
  mode?: "overview" | "detail" | "normal";
}) {
  const cfg = METRICS.find((m) => m.key === metric)!;
  const { imperial } = useTheme();
  const [sel, setSel] = useState<SessionPoint | null>(null);

  const W = 340, H = 200;
  // Generous top padding so a peak node's value label always has room ABOVE it
  // (never flipped down onto the line, which caused overlap).
  // Minimal left/right padding so the plotted chart spans the same width as the box above it.
  const PAD = { top: 40, right: 4, bottom: 32, left: 4 };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;

  // IQR outlier exclusion — keeps scale tight regardless of mode
  const allValues = points.map((p) => metricValue(p, metric));
  const sorted = [...allValues].sort((a, b) => a - b);
  const q1 = sorted[Math.floor(sorted.length * 0.25)] ?? 0;
  const q3 = sorted[Math.floor(sorted.length * 0.75)] ?? 0;
  const iqr = q3 - q1;
  const outlierFloor = sorted.length >= 8 ? q1 - 1.5 * iqr : 0;
  const normalPts = points.filter((p) => metricValue(p, metric) >= outlierFloor);
  const outlierPts = points.filter((p) => metricValue(p, metric) < outlierFloor);

  const values = normalPts.map((p) => metricValue(p, metric));
  const maxVal = Math.max(...values, 1);
  const minVal = Math.max(0, Math.min(...values) * 0.95);
  const span = Math.max(maxVal - minVal, 1);

  const cx = (i: number) => PAD.left + (i / Math.max(normalPts.length - 1, 1)) * chartW;
  const cy = (v: number) => PAD.top + chartH - ((v - minVal) / span) * chartH;

  const nodePts = normalPts.map((p, i) => ({ x: cx(i), y: cy(metricValue(p, metric)) }));
  const pathD = smoothPath(nodePts);
  const areaD = nodePts.length > 0
    ? `${pathD} L ${nodePts[nodePts.length - 1].x} ${PAD.top + chartH} L ${nodePts[0].x} ${PAD.top + chartH} Z`
    : "";

  // Highlighted point — only set once the user taps a node.
  const highlighted = sel;
  const hIdx = highlighted ? normalPts.findIndex((p) => p.date === highlighted.date) : -1;
  const gradId = `area-grad-${metric}-${mode}`;

  const hx = hIdx !== -1 ? cx(hIdx) : null;
  const hy = hIdx !== -1 ? cy(metricValue(highlighted!, metric)) : null;
  const lastPt = normalPts[normalPts.length - 1];

  return (
    <>
      {/* Value + sets box — fixed height (not just min-height) so varying set counts/notes
          across different points never shift the graph's position below. */}
      <div
        className={`mb-3 rounded-xl border border-border/60 bg-card px-3 py-2.5 h-[84px] overflow-hidden transition-opacity ${
          highlighted ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
      >
        {highlighted && (
          <>
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <span className="text-xs font-semibold">{highlighted.label}</span>
              <button onClick={() => setSel(null)} className="text-muted-foreground hover:text-foreground">
                <X className="w-3 h-3" />
              </button>
            </div>
            <div className="flex flex-nowrap gap-1.5 overflow-x-auto [&::-webkit-scrollbar]:hidden">
              {highlighted.sets.map((set, si) => (
                <span key={si} className="flex-shrink-0 text-[11px] font-mono bg-muted/40 border border-border/50 px-2 py-0.5 rounded-full">
                  {set.weight > 0 ? `${toDisplay(set.weight, imperial)}${unitLabel(imperial)}` : "BW"} × {set.reps}
                  {(set.partialReps ?? 0) > 0 && <span className="text-orange-400">+{set.partialReps}p</span>}
                  {set.type !== "normal" && <span className="opacity-60"> {set.type[0].toUpperCase()}</span>}
                </span>
              ))}
            </div>
            {highlighted.notes && (
              <p className="mt-1.5 text-[11px] text-muted-foreground italic flex items-center gap-1 truncate">
                <Pencil className="w-3 h-3 flex-shrink-0" /><span className="truncate">{highlighted.notes}</span>
              </p>
            )}
          </>
        )}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }}>
        <defs>
          {/* Vertical fade for the area fill under the line */}
          <linearGradient id={gradId} x1="0" y1={PAD.top} x2="0" y2={PAD.top + chartH} gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor={cfg.color} stopOpacity="0.35" />
            <stop offset="100%" stopColor={cfg.color} stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Horizontal gridlines */}
        {[0, 0.5, 1].map((t) => {
          const y = PAD.top + chartH * t;
          return (
            <line key={t} x1={PAD.left} y1={y} x2={PAD.left + chartW} y2={y}
              stroke="hsl(var(--border))" strokeWidth="1" opacity="0.4" />
          );
        })}

        {areaD && <path d={areaD} fill={`url(#${gradId})`} stroke="none" />}

        <path key={`${metric}-${mode}-${normalPts.length}`} d={pathD} fill="none"
          stroke={cfg.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          style={{ animation: "draw-line 0.4s ease-out forwards" }} />

        {/* Click/hover targets over every node so any point can be inspected */}
        {normalPts.map((p, i) => {
          const v = metricValue(p, metric);
          const x = cx(i), y = cy(v);
          const isSel = highlighted?.date === p.date;
          const isLast = p.date === lastPt.date;
          return (
            <g key={i} style={{ cursor: "pointer" }}
              onClick={() => setSel(isSel ? null : p)}
              onMouseEnter={() => setSel(p)}
            >
              <circle cx={x} cy={y} r={10} fill="transparent" />
              {!highlighted && isLast && (
                <circle cx={x} cy={y} r={4} fill={cfg.color} stroke="hsl(var(--background))" strokeWidth="2" />
              )}
              {isSel && (
                <circle cx={x} cy={y} r={4} fill={cfg.color} stroke="hsl(var(--background))" strokeWidth="2" />
              )}
            </g>
          );
        })}

        {/* Start / Now edge labels */}
        <text x={PAD.left} y={H - 4} fontSize="10.5" fontWeight="600" textAnchor="start"
          fill="hsl(var(--muted-foreground))">
          Start
        </text>
        <text x={PAD.left + chartW} y={H - 4} fontSize="10.5" fontWeight="600" textAnchor="end"
          fill="hsl(var(--muted-foreground))">
          Now
        </text>

        {/* Dashed guide line + value pill pinned to the tapped point */}
        {hx !== null && hy !== null && (() => {
          const text = `${fmt(metricValue(highlighted!, metric))}${cfg.unit}`;
          const pillW = Math.max(40, text.length * 7.5 + 18);
          const pillH = 22;
          const nearRight = hx > PAD.left + chartW - pillW / 2;
          const nearLeft = hx < PAD.left + pillW / 2;
          const pillX = nearRight ? PAD.left + chartW - pillW : nearLeft ? PAD.left : hx - pillW / 2;
          // Fixed row — the pill only moves horizontally while dragging, never up/down with the line.
          const pillY = 4;
          return (
            <g pointerEvents="none">
              <line x1={hx} y1={pillY + pillH} x2={hx} y2={PAD.top + chartH}
                stroke={cfg.color} strokeWidth="1" strokeDasharray="3 3" opacity="0.35" />
              <circle cx={hx} cy={hy} r={5} fill={cfg.color} stroke="hsl(var(--background))" strokeWidth="2" />
              <rect x={pillX} y={pillY} width={pillW} height={pillH} rx={pillH / 2}
                fill="hsl(var(--foreground))" />
              <text x={pillX + pillW / 2} y={pillY + pillH / 2 + 4} fontSize="11" fontWeight="700"
                textAnchor="middle" style={{ fontVariantNumeric: "tabular-nums" }} fill="hsl(var(--background))">
                {text}
              </text>
            </g>
          );
        })()}
      </svg>

      <p className="text-center text-[11px] text-muted-foreground/70 mt-1 mb-1">
        Tap or drag the chart to inspect a session
      </p>
    </>
  );
}

// ─── Per-Set Progression Chart ───────────────────────────────────────────────

interface SetTooltip {
  screenX: number; screenY: number;
  set: WorkoutSet; label: string; setNum: number;
}

function RepsChart({ points }: { points: SessionPoint[] }) {
  const { imperial } = useTheme();
  const [selectedSet, setSelectedSet] = useState(0);
  const [tooltip, setTooltip] = useState<SetTooltip | null>(null);

  // Use last session's set count so the dropdown only shows sets the user actually did most recently
  const maxSets = points[points.length - 1]?.sets.length ?? 0;
  if (maxSets === 0) return (
    <p className="text-center text-sm text-muted-foreground py-10">No set data yet.</p>
  );

  // Clamp selectedSet if exercise has fewer sets
  const activeSet = Math.min(selectedSet, maxSets - 1);

  const data = points
    .map((p, pi) => ({ point: p, set: p.sets[activeSet] ?? null, pi }))
    .filter((d): d is { point: SessionPoint; set: WorkoutSet; pi: number } => d.set !== null);

  const isBodyweight = data.every((d) => d.set.weight === 0);
  const vals = data.map((d) => (isBodyweight ? d.set.reps : d.set.weight));

  const W = 340, H = 200;
  const PAD = { top: 34, right: 22, bottom: 34, left: 42 };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;
  const totalSessions = points.length;

  const maxV = Math.max(...vals, 1);
  const minV = 0;
  const span = maxV - minV || 1;
  const cx = (pi: number) => PAD.left + (pi / Math.max(totalSessions - 1, 1)) * chartW;
  const cy = (v: number) => PAD.top + chartH - ((v - minV) / span) * chartH;

  const ticks = [0, 0.5, 1].map((t) => minV + span * t);
  const labelStep = data.length <= 6 ? 1 : Math.ceil(data.length / 5);

  const linePath = data.map((d, i) => `${i === 0 ? "M" : "L"} ${cx(d.pi)} ${cy(vals[i])}`).join(" ");
  const areaPath = data.length >= 2
    ? `${linePath} L ${cx(data[data.length - 1].pi)} ${PAD.top + chartH} L ${cx(data[0].pi)} ${PAD.top + chartH} Z`
    : "";

  return (
    <div>
      {data.length < 2 ? (
          <p className="text-center text-sm text-muted-foreground py-10">
            Train this set again to see the trend.
          </p>
        ) : (
          <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }}>
            <defs>
              <linearGradient id="reps-area-grad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={ACCENT} stopOpacity="0.28" />
                <stop offset="100%" stopColor={ACCENT} stopOpacity="0" />
              </linearGradient>
            </defs>

            {/* Set picker — only render when there are multiple sets to choose from */}
            {maxSets > 1 && (
              <foreignObject x={W - 74} y={4} width={72} height={22}>
                <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
                  <select
                    value={activeSet}
                    onChange={(e) => { setSelectedSet(Number(e.target.value)); setTooltip(null); }}
                    style={{
                      fontSize: '10px', fontWeight: 600,
                      color: 'hsl(var(--muted-foreground))',
                      background: 'transparent', border: 'none', outline: 'none',
                      appearance: 'none', paddingRight: '12px', cursor: 'pointer',
                      letterSpacing: '0.04em', textTransform: 'uppercase',
                    }}
                  >
                    {Array.from({ length: maxSets }, (_, i) => (
                      <option key={i} value={i}>Set {i + 1}</option>
                    ))}
                  </select>
                  <svg style={{ position: 'absolute', right: 0, pointerEvents: 'none', width: 10, height: 10 }}
                    viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                    color="hsl(var(--muted-foreground))">
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </div>
              </foreignObject>
            )}

            {/* Gridlines + Y labels */}
            {ticks.map((t, i) => (
              <g key={i}>
                <line x1={PAD.left} y1={cy(t)} x2={PAD.left + chartW} y2={cy(t)}
                  stroke="hsl(var(--border))" strokeWidth="1" strokeDasharray="2 5" opacity="0.7" />
                <text x={PAD.left - 8} y={cy(t) + 3.5} fontSize="10" textAnchor="end"
                  fill="hsl(var(--muted-foreground))">{fmt(t)}{isBodyweight ? "" : ""}</text>
              </g>
            ))}

            <path d={areaPath} fill="url(#reps-area-grad)" />
            <path d={linePath} fill="none" stroke={ACCENT} strokeWidth="3"
              strokeLinecap="round" strokeLinejoin="round" />

            {data.map((d, i) => {
              const x = cx(d.pi), y = cy(vals[i]);
              const isLast = i === data.length - 1;
              const showVal = data.length <= 6 || isLast || i === 0;
              const labelY = y - 12 < PAD.top ? y + 18 : y - 12;
              return (
                <g key={i}>
                  {/* Hit area */}
                  <circle cx={x} cy={y} r="16" fill="transparent" style={{ cursor: "pointer" }}
                    onClick={(e) => {
                      e.stopPropagation();
                      const rect = (e.currentTarget as SVGCircleElement).getBoundingClientRect();
                      setTooltip((prev) =>
                        prev?.label === d.point.label
                          ? null
                          : { screenX: rect.left + rect.width / 2, screenY: rect.top, set: d.set, label: d.point.label, setNum: activeSet + 1 }
                      );
                    }}
                  />
                  <circle cx={x} cy={y} r={isLast ? 6 : 4}
                    fill={isLast ? ACCENT : "hsl(var(--background))"}
                    stroke={ACCENT} strokeWidth="2.5" />
                  {showVal && (
                    <text x={x} y={labelY} fontSize={isLast ? "12" : "10.5"}
                      fontWeight={isLast ? "bold" : "600"} textAnchor="middle"
                      fill={isLast ? ACCENT : "hsl(var(--foreground))"}>
                      {fmt(vals[i])}
                    </text>
                  )}
                  {(isLast || i === 0 || i % labelStep === 0) && (
                    <text x={x} y={H - 8} fontSize="10" textAnchor="middle"
                      fill={isLast ? ACCENT : "hsl(var(--muted-foreground))"}
                      fontWeight={isLast ? "bold" : "normal"}>
                      {d.point.label}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
        )}

      {/* Tap tooltip */}
      {tooltip && createPortal(
        <>
          <div className="fixed inset-0 z-[9998]" onClick={() => setTooltip(null)} />
          <div
            className="fixed z-[9999] bg-card border border-border rounded-xl shadow-xl px-3 py-2.5 min-w-[140px]"
            style={{ left: tooltip.screenX, top: tooltip.screenY - 8, transform: "translate(-50%, -100%)" }}
          >
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
              Set {tooltip.setNum} · {tooltip.label}
            </p>
            <p className="text-sm font-bold">
              {tooltip.set.weight > 0 ? `${toDisplay(tooltip.set.weight, imperial)} ${unitLabel(imperial)}` : "BW"} × {tooltip.set.reps} reps
            </p>
            {(tooltip.set.partialReps ?? 0) > 0 && (
              <p className="text-xs text-orange-400 mt-0.5">+{tooltip.set.partialReps} partial</p>
            )}
          </div>
        </>,
        document.body
      )}
    </div>
  );
}

// ─── Exercise Selector ───────────────────────────────────────────────────────

function ExerciseSelector({
  exercises, selectedId, onSelect,
}: {
  exercises: Exercise[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const selected = exercises.find((e) => e.id === selectedId);
  const q = query.trim().toLowerCase();
  const filtered = q
    ? exercises.filter(
        (e) =>
          e.name.toLowerCase().includes(q) ||
          (e.muscleGroup ?? "").toLowerCase().includes(q)
      )
    : exercises;

  return (
    <div className="relative inline-flex max-w-full">
      <button
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-1.5 max-w-full text-left rounded-xl border px-3 py-1.5 active:scale-[0.98] transition-all ${
          open
            ? "bg-primary/15 border-primary/40"
            : "bg-muted/50 border-border hover:bg-muted/70"
        }`}
        data-testid="button-exercise-select"
      >
        <span className="text-lg font-bold truncate">
          {selected ? selected.name : "Choose an exercise"}
        </span>
        <ChevronDown className={`w-4 h-4 text-muted-foreground flex-shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-50" onClick={() => { setOpen(false); setQuery(""); }} />
          <div className="absolute top-full left-0 mt-2 z-50 w-64 max-w-[78vw] rounded-xl border border-border bg-card shadow-xl overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-2 border-b border-border/60">
              <Search className="w-3.5 h-3.5 text-muted-foreground" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search…"
                className="flex-1 bg-transparent text-sm outline-none"
                data-testid="input-search-exercise-progress"
              />
              {query && (
                <button onClick={() => setQuery("")}><X className="w-3.5 h-3.5 text-muted-foreground" /></button>
              )}
            </div>
            <div className="max-h-56 overflow-y-auto">
              {filtered.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">No exercises found</p>
              ) : query.trim() ? (
                filtered.map((ex) => (
                  <button key={ex.id} onClick={() => { onSelect(ex.id); setOpen(false); setQuery(""); }}
                    className={`w-full flex items-center justify-between px-4 py-2.5 text-left text-sm hover:bg-muted/50 ${ex.id === selectedId ? "text-primary font-semibold bg-primary/5" : ""}`}
                    data-testid={`button-select-exercise-progress-${ex.id}`}>
                    <span>{ex.name}</span>
                    {ex.muscleGroup && <span className="text-[11px] text-muted-foreground">{ex.muscleGroup}</span>}
                  </button>
                ))
              ) : (
                Object.entries(
                  filtered.reduce<Record<string, Exercise[]>>((acc, ex) => {
                    const g = ex.muscleGroup ?? "Other";
                    (acc[g] ??= []).push(ex);
                    return acc;
                  }, {})
                ).sort(([a], [b]) => a.localeCompare(b)).map(([group, exs]) => (
                  <div key={group}>
                    <div className="px-4 py-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground bg-muted/30 sticky top-0">
                      {group}
                    </div>
                    {exs.map((ex) => (
                      <button key={ex.id} onClick={() => { onSelect(ex.id); setOpen(false); setQuery(""); }}
                        className={`w-full flex items-center px-4 py-2.5 text-left text-sm hover:bg-muted/50 ${ex.id === selectedId ? "text-primary font-semibold bg-primary/5" : ""}`}
                        data-testid={`button-select-exercise-progress-${ex.id}`}>
                        {ex.name}
                      </button>
                    ))}
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function LastStat({ label, value, unit, color, delta }: {
  label: string; value: string; unit?: string; color: string; delta: number | null;
}) {
  return (
    <div className="px-3 py-3 flex flex-col gap-0.5">
      <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</span>
      <span className="text-2xl font-bold leading-none" style={{ color }}>
        {value}{unit && <span className="text-sm font-normal text-muted-foreground ml-0.5">{unit}</span>}
      </span>
      {delta !== null && delta !== 0 && (
        <span className={`flex items-center gap-0.5 text-[11px] font-semibold ${delta > 0 ? "text-green-500" : "text-destructive"}`}>
          {delta > 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
          {delta > 0 ? "+" : ""}{fmt(delta)} vs prev
        </span>
      )}
    </div>
  );
}

// ─── Progress Page ───────────────────────────────────────────────────────────

export default function Progress() {
  const { imperial } = useTheme();
  const [sessions, setSessions] = useState<WorkoutSession[]>([]);
  const [pbs, setPbs] = useState<PersonalBest[]>([]);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [metric, setMetric] = useState<Metric>("intensity");
  const [pbOpen, setPbOpen] = useState(false);
  const [calOpen, setCalOpen] = useState(false);
  const [intensityInfo, setIntensityInfo] = useState(false);
  const [volumeInfo, setVolumeInfo] = useState(false);
  const [showAllHistory, setShowAllHistory] = useState(false);
  const [showGraph, setShowGraph] = useState(false);
  const [timeRange, setTimeRange] = useState<TimeRange>("1m");
  const [drillYear, setDrillYear] = useState<number | null>(null);
  const [drillMonth, setDrillMonth] = useState<string | null>(null); // "YYYY-MM"

  useEffect(() => {
    const s = getSessions();
    setSessions(s);
    setPbs(getPersonalBests());
    setExercises(getExercises());
  }, []);

  // Only exercises the user has actually logged — keeps the picker meaningful.
  const loggedExercises = useMemo(
    () => exercises.filter((ex) => sessions.some((s) => s.exercises.some((e) => e.exerciseId === ex.id))),
    [exercises, sessions]
  );

  // Default to the most recently trained exercise.
  useEffect(() => {
    if (!selectedId && loggedExercises.length > 0) {
      const recent = sessions[0]?.exercises[0]?.exerciseId;
      setSelectedId(recent && loggedExercises.some((e) => e.id === recent) ? recent : loggedExercises[0].id);
    }
  }, [selectedId, loggedExercises, sessions]);

  const points = useMemo(
    () => (selectedId ? buildPoints(sessions, selectedId) : []),
    [sessions, selectedId]
  );

  // Convert weight/volume to display units; other fields are unit-less.
  const displayPoints = useMemo(() => {
    if (!imperial) return points;
    return points.map((p) => ({ ...p, weight: toDisplay(p.weight, true), volume: toDisplay(p.volume, true) }));
  }, [points, imperial]);

  // Whether all-time data spans more than 1 year — determines top-level scrubber shape
  const dataSpansYears = useMemo(() => {
    if (displayPoints.length < 2) return false;
    return displayPoints[displayPoints.length - 1].date - displayPoints[0].date > 365 * 86_400_000;
  }, [displayPoints]);

  // Year pills — unique years across all data
  const availableYears = useMemo(() => {
    const seen = new Set<number>();
    const years: number[] = [];
    for (const p of displayPoints) {
      const y = new Date(p.date).getFullYear();
      if (!seen.has(y)) { seen.add(y); years.push(y); }
    }
    return years;
  }, [displayPoints]);

  const rangeDays: Record<TimeRange, number> = { "1m": 30, "3m": 90, "6m": 180, "1y": 365, "all": Infinity };

  // Month pills — either months of a drilled year, or months in the current time-range window
  const availableMonths = useMemo(() => {
    const base = drillYear
      ? displayPoints.filter((p) => new Date(p.date).getFullYear() === drillYear)
      : timeRange === "all"
        ? displayPoints
        : displayPoints.filter((p) => p.date >= Date.now() - rangeDays[timeRange] * 86_400_000);
    const seen = new Set<string>();
    const months: { key: string; label: string }[] = [];
    for (const p of base) {
      const d = new Date(p.date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      if (!seen.has(key)) {
        seen.add(key);
        months.push({ key, label: d.toLocaleDateString("en-GB", { month: "short", year: "2-digit" }) });
      }
    }
    return months;
  }, [displayPoints, timeRange, drillYear]);

  // Chart data: month drill → that month; year drill → that year; else → time-range window
  const chartPoints = useMemo(() => {
    if (drillMonth !== null) {
      const [y, mo] = drillMonth.split("-").map(Number);
      return displayPoints.filter((p) => {
        const d = new Date(p.date);
        return d.getFullYear() === y && d.getMonth() + 1 === mo;
      });
    }
    if (drillYear !== null) {
      return displayPoints.filter((p) => new Date(p.date).getFullYear() === drillYear);
    }
    if (timeRange === "all") return displayPoints;
    return displayPoints.filter((p) => p.date >= Date.now() - rangeDays[timeRange] * 86_400_000);
  }, [displayPoints, timeRange, drillYear, drillMonth]);

  const selectedExercise = exercises.find((e) => e.id === selectedId);
  const last = displayPoints[displayPoints.length - 1] ?? null;
  const prev = displayPoints.length > 1 ? displayPoints[displayPoints.length - 2] : null;
  const delta = last && prev ? metricValue(last, metric) - metricValue(prev, metric) : null;
  // Percentage change vs the previous session — gives the hero number meaning.
  const deltaPct = delta !== null && prev
    ? (() => { const pv = metricValue(prev, metric); return pv !== 0 ? (delta / pv) * 100 : null; })()
    : null;
  const metricCfg = METRICS.find((m) => m.key === metric)!;
  const wUnit = unitLabel(imperial);

  function handleSeed() {
    seedYearOfData();
    setSessions(getSessions());
    setPbs(getPersonalBests());
    setExercises(getExercises());
    setSelectedId(null);
  }

  const devSeed = import.meta.env.DEV ? handleSeed : undefined;

  // ── Empty state ──
  if (sessions.length === 0) {
    return (
      <div className="flex flex-col min-h-full pb-24">
        <Header
          onCalClick={() => setCalOpen(true)} onPbClick={() => setPbOpen(true)} pbCount={pbs.length} onSeedClick={devSeed}
          loggedExercises={[]} selectedId={null} onSelectExercise={() => {}}
        />
        <div className="flex flex-col items-center justify-center py-24 gap-4 px-6 text-center">
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
            <BarChart2 className="w-8 h-8 text-muted-foreground" />
          </div>
          <div>
            <p className="font-semibold">No progress yet</p>
            <p className="text-sm text-muted-foreground mt-1">Finish your first workout and it’ll show up here.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-full pb-24">
      <Header
        onCalClick={() => setCalOpen(true)} onPbClick={() => setPbOpen(true)} pbCount={pbs.length} onSeedClick={devSeed}
        loggedExercises={loggedExercises} selectedId={selectedId}
        onSelectExercise={(id) => { setSelectedId(id); setShowGraph(false); setDrillYear(null); setDrillMonth(null); }}
      />
      <CalendarModal open={calOpen} onClose={() => setCalOpen(false)} sessions={sessions} />

      <div className="max-w-lg mx-auto w-full px-4 py-4 flex flex-col gap-4">
        {/* ── HERO: the graph is the main event ── */}
        {selectedExercise && displayPoints.length > 0 ? (
          <div>
            {/* Session count — sits above the stat card */}
            <div className="px-1 pt-1">
              <p className="text-xs text-muted-foreground">
                {chartPoints.length} session{chartPoints.length !== 1 ? "s" : ""}
                {last && <> · last {formatDate(last.date).toLowerCase()}</>}
              </p>
            </div>

            {/* Stat card — headline metric, toggle and graph */}
            <div className="mt-3 rounded-2xl border border-card-border bg-card p-4">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                {metric === "intensity" ? "Avg Intensity" : metricCfg.label}
              </p>
              <div className="mt-2 flex items-end gap-2.5 flex-wrap">
                <div className="flex items-center gap-2">
                  <span className="text-4xl font-bold tracking-tight leading-none"
                    style={{ color: metricCfg.color, fontVariantNumeric: "tabular-nums" }}>
                    {fmt(metricValue(last!, metric))}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {metric === "weight" || metric === "volume" ? wUnit : metricCfg.unit || metricCfg.label.toLowerCase()}
                  </span>
                  {metric === "intensity" && (
                    <span className="text-sm font-semibold text-muted-foreground">
                      {intensityLabel(metricValue(last!, metric))}
                    </span>
                  )}
                  {(metric === "intensity" || metric === "volume") && (
                    <button
                      onClick={() => metric === "intensity" ? setIntensityInfo((v) => !v) : setVolumeInfo((v) => !v)}
                      className="text-muted-foreground/50 hover:text-muted-foreground transition-colors"
                    >
                      <Info className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                {/* Trend vs last session — makes the hero number mean something */}
                {delta !== null && delta !== 0 && (
                  <span
                    className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[11px] font-bold mb-0.5 ${
                      delta > 0 ? "bg-green-500/15 text-green-600" : "bg-destructive/15 text-destructive"
                    }`}
                    title="Change vs your previous session"
                  >
                    {delta > 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                    {deltaPct !== null
                      ? `${delta > 0 ? "+" : ""}${Math.round(deltaPct)}%`
                      : `${delta > 0 ? "+" : ""}${fmt(delta)}`}
                    <span className="font-medium opacity-70 ml-0.5">vs last</span>
                  </span>
                )}
              </div>
              {metric === "intensity" && intensityInfo && (
                <div className="mt-2 mb-1 rounded-xl bg-muted/40 border border-border/50 px-3 py-2.5 text-xs text-muted-foreground leading-relaxed">
                  <p className="font-semibold text-foreground mb-1">What is intensity?</p>
                  <p>How close you trained to your all-time best on this exercise, as a percentage. Higher % = closer to your max effort.</p>
                  <details className="mt-2">
                    <summary className="cursor-pointer text-foreground/80 font-medium">Show the technical details</summary>
                    <div className="mt-1.5 flex flex-col gap-1.5">
                      <p>Each weighted set is scored as %1RM — its estimated one-rep max (Epley: weight × (1 + reps/30)) compared to your personal best for the exercise.</p>
                      <p>Bodyweight sets have no 1RM, so they use the classic reps-to-failure %1RM curve instead.</p>
                      <p>Partial reps count as half a rep in both formulas.</p>
                      <p>That %1RM is then discounted by set type, since it affects how trustworthy the reps-to-failure assumption is: Failure ×1.0 · Normal ×0.92 · Assisted ×0.8.</p>
                      <p>The session's intensity is the average %1RM across all completed sets.</p>
                    </div>
                  </details>
                </div>
              )}
              {metric === "volume" && volumeInfo && (
                <div className="mt-2 mb-1 rounded-xl bg-muted/40 border border-border/50 px-3 py-2.5 text-xs text-muted-foreground leading-relaxed">
                  <p className="font-semibold text-foreground mb-1">How volume is calculated</p>
                  <p>For each completed set:</p>
                  <p className="font-mono mt-1 text-[11px] text-foreground/80">weight × (reps + partials × 0.5)</p>
                  <p className="mt-1.5">Summed across all sets. Raw weight moved — no type multiplier.</p>
                </div>
              )}

              {/* Metric toggle — full width, even spacing */}
              <div className="mt-4">
                <div className="flex p-1 rounded-xl bg-background/50 backdrop-blur">
                  {METRICS.map((m) => (
                    <button
                      key={m.key}
                      onClick={() => setMetric(m.key)}
                      className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all text-center ${
                        metric === m.key ? "bg-card shadow text-foreground" : "text-muted-foreground"
                      }`}
                      data-testid={`button-metric-${m.key}`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Graph toggle button */}
              <div className="mt-3">
                <button
                  onClick={() => {
                    if (showGraph) { setDrillYear(null); setDrillMonth(null); }
                    setShowGraph((v) => !v);
                  }}
                  className={`w-full py-2.5 rounded-xl text-xs font-semibold transition-all flex items-center justify-center gap-1.5 ${
                    showGraph
                      ? "bg-primary/10 text-primary border border-primary/30"
                      : "bg-muted/40 text-muted-foreground border border-border hover:text-foreground hover:bg-muted/60"
                  }`}
                >
                  <BarChart2 className="w-3.5 h-3.5" />
                  {showGraph ? "Hide Graph" : "Show Graph"}
                </button>
              </div>
            </div>

            {/* Time range pills */}
            {showGraph && !drillYear && !drillMonth && (
              <div className="flex items-center gap-4 mt-4 px-1 overflow-x-auto [&::-webkit-scrollbar]:hidden">
                {TIME_RANGE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setTimeRange(opt.value)}
                    className={`flex-shrink-0 text-sm font-bold transition-colors ${
                      timeRange === opt.value ? "text-foreground" : "text-muted-foreground/60 hover:text-muted-foreground"
                    }`}
                    data-testid={`button-range-${opt.value}`}
                  >
                    {opt.short}
                  </button>
                ))}
              </div>
            )}

            {/* Scrubber: year pills → month pills — aligned to metric tab edges, scrollable */}
            {showGraph && !drillYear && !drillMonth && timeRange === "all" && dataSpansYears && availableYears.length > 1 && (
              <div className="mx-1 mt-2 overflow-x-auto [&::-webkit-scrollbar]:hidden">
                <div className="flex gap-2 pb-1">
                  {availableYears.map((y) => (
                    <button key={y} onClick={() => setDrillYear(y)}
                      className="flex-shrink-0 px-4 py-1.5 rounded-full text-[12px] font-bold bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground active:scale-95 transition-all">
                      {y}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {showGraph && !drillMonth && timeRange !== "1m" && (drillYear || !dataSpansYears || timeRange !== "all") && availableMonths.length > 1 && (
              <div className="mx-1 mt-2 overflow-x-auto [&::-webkit-scrollbar]:hidden">
                <div className="flex gap-2 pb-1">
                  {availableMonths.map((m) => (
                    <button key={m.key} onClick={() => setDrillMonth(m.key)}
                      className="flex-shrink-0 px-3 py-1.5 rounded-full text-[11px] font-semibold bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground active:scale-95 transition-all">
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Breadcrumb back bar */}
            {showGraph && (drillYear || drillMonth) && (
              <div className="px-1 mt-4 mb-1 flex items-center gap-2">
                <button
                  onClick={() => { drillMonth ? setDrillMonth(null) : setDrillYear(null); }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-muted/60 text-xs font-semibold text-primary active:scale-95 transition-all"
                >
                  <ChevronDown className="w-3.5 h-3.5 rotate-90" />
                  Back
                </button>
                <span className="text-xs text-muted-foreground">
                  {drillMonth
                    ? new Date(`${drillMonth}-01`).toLocaleDateString("en-GB", { month: "long", year: "numeric" })
                    : drillYear}
                </span>
              </div>
            )}

            {/* The chart:
                - month drill → normal (area + full hollow nodes, interactive)
                - everything else → overview (gradient thin line, no nodes) */}
            {showGraph && (
              <div className="px-0 pt-2 pb-4">
                {drillMonth ? (
                  chartPoints.length >= 1 ? (
                    <LineChart points={chartPoints} metric={metric} mode="normal" />
                  ) : (
                    <p className="text-center text-sm text-muted-foreground py-10">No sessions this month.</p>
                  )
                ) : drillYear ? (
                  chartPoints.length >= 2 ? (
                    <LineChart points={chartPoints} metric={metric} mode="overview" />
                  ) : (
                    <p className="text-center text-sm text-muted-foreground py-10">No sessions this year.</p>
                  )
                ) : chartPoints.length >= 2 ? (
                  <LineChart points={chartPoints} metric={metric}
                    mode={timeRange === "1m" ? "normal" : "overview"} />
                ) : (
                  <p className="text-center text-sm text-muted-foreground py-10">
                    One session logged — train this again to see your trend.
                  </p>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-3xl border border-card-border bg-card px-4 py-10">
            <div className="text-center">
              <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
                <BarChart2 className="w-7 h-7 text-muted-foreground" />
              </div>
              <p className="text-sm text-muted-foreground">
                {loggedExercises.length === 0
                  ? "Log a workout to start tracking exercises."
                  : "Pick an exercise to see your progress."}
              </p>
            </div>
          </div>
        )}

        {/* Recent sessions — the actual progress made */}
        {selectedExercise && displayPoints.length > 0 && (
          <div>
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-1">
              History
            </p>
            {/* No nested scroll box — let the page scroll naturally, reveal older
                sessions on demand so touch scrolling never gets trapped. */}
            <div className="flex flex-col gap-2 pr-0.5">
              {(showAllHistory ? displayPoints.slice().reverse() : displayPoints.slice().reverse().slice(0, 4)).map((p) => (
                <div key={p.date} className="rounded-xl border border-border/60 bg-card px-3 py-2.5">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-semibold">{formatDate(p.date)}</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {p.sets.map((set, i) => (
                      <span key={i} className="text-[11px] font-mono bg-muted/40 border border-border/50 px-2 py-0.5 rounded-full">
                        {set.weight > 0 ? `${toDisplay(set.weight, imperial)}${wUnit}` : "BW"} × {set.reps}
                        {(set.partialReps ?? 0) > 0 && <span className="text-orange-400">+{set.partialReps}p</span>}
                        {set.type !== "normal" && <span className="opacity-60"> {set.type[0].toUpperCase()}</span>}
                      </span>
                    ))}
                  </div>
                  {p.notes && (
                    <p className="mt-1.5 text-[11px] text-muted-foreground italic flex items-center gap-1">
                      <Pencil className="w-3 h-3 flex-shrink-0" />{p.notes}
                    </p>
                  )}
                </div>
              ))}
            </div>
            {displayPoints.length > 4 && (
              <button
                onClick={() => setShowAllHistory((v) => !v)}
                className="w-full mt-2 py-2.5 rounded-xl text-xs font-semibold text-muted-foreground bg-muted/30 hover:bg-muted/50 hover:text-foreground active:scale-[0.99] transition-all"
                data-testid="button-toggle-history"
              >
                {showAllHistory ? "Show less" : `Show all ${displayPoints.length} sessions`}
              </button>
            )}
          </div>
        )}

        {/* Personal Bests modal */}
        {pbOpen && createPortal(
          <div style={{ position: "fixed", inset: 0, zIndex: 9998 }}>
            <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.7)" }} onClick={() => setPbOpen(false)} />
            <div className="w-[calc(100%-2rem)] max-w-sm rounded-2xl bg-background border border-border shadow-xl overflow-hidden"
              style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", zIndex: 1 }}>
              <div className="flex items-center justify-between px-5 py-4 border-b border-border/50">
                <div className="flex items-center gap-2">
                  <Trophy className="w-4 h-4 text-accent" />
                  <span className="font-semibold">Personal Bests</span>
                  <span className="text-[10px] font-semibold bg-muted text-muted-foreground rounded-full px-1.5 py-0.5">{pbs.length}</span>
                </div>
                <button onClick={() => setPbOpen(false)} className="text-muted-foreground hover:text-foreground">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="divide-y divide-border/30 max-h-[60vh] overflow-y-auto">
                {pbs.map((pb) => (
                  <div key={pb.exerciseId} className="flex items-center justify-between px-5 py-3" data-testid={`row-pb-${pb.exerciseId}`}>
                    <span className="text-sm font-medium truncate pr-2">{pb.exerciseName}</span>
                    <span className="text-sm font-bold font-mono whitespace-nowrap">
                      {pb.weight > 0 ? `${toDisplay(pb.weight, imperial)}${wUnit}` : "BW"} × {pb.reps}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>,
          document.body
        )}
      </div>
    </div>
  );
}

function Header({
  onCalClick, onPbClick, pbCount, onSeedClick, loggedExercises, selectedId, onSelectExercise,
}: {
  onCalClick: () => void; onPbClick: () => void; pbCount: number; onSeedClick?: () => void;
  loggedExercises: Exercise[]; selectedId: string | null; onSelectExercise: (id: string) => void;
}) {
  return (
    <div className="sticky top-0 z-40 bg-background/95 backdrop-blur-md border-b border-border">
      <div className="max-w-lg mx-auto px-4 py-4 flex items-center justify-between">
        <div className="min-w-0">
          <ExerciseSelector exercises={loggedExercises} selectedId={selectedId} onSelect={onSelectExercise} />
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {onSeedClick && (
            <button
              onClick={onSeedClick}
              className="h-7 px-2 rounded-lg text-[10px] font-bold bg-amber-500/15 text-amber-600 border border-amber-500/30 hover:bg-amber-500/25 transition-colors"
              title="Seed 1 year of test data (dev only)"
            >
              Seed 1yr
            </button>
          )}
          {pbCount > 0 && (
            <button
              onClick={onPbClick}
              className="w-9 h-9 rounded-xl flex items-center justify-center bg-muted/60 border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors relative"
              title="Personal bests"
            >
              <Trophy className="w-4 h-4" />
              <span className="absolute -top-1 -right-1 text-[9px] font-bold bg-primary text-primary-foreground rounded-full w-4 h-4 flex items-center justify-center">{pbCount}</span>
            </button>
          )}
          <button
            onClick={onCalClick}
            className="w-9 h-9 rounded-xl flex items-center justify-center bg-muted/60 border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            title="Gym calendar"
          >
            <CalendarDays className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Calendar Modal ───────────────────────────────────────────────────────────

const CAL_MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const CAL_DOW = ["Su","Mo","Tu","We","Th","Fr","Sa"];

function dayKey(year: number, month: number, day: number) {
  return `${year}-${month}-${day}`;
}

function CalendarModal({ open, onClose, sessions }: {
  open: boolean;
  onClose: () => void;
  sessions: WorkoutSession[];
}) {
  const { imperial } = useTheme();
  const [month, setMonth] = useState<Date>(() => { const d = new Date(); d.setDate(1); return d; });
  const [selected, setSelected] = useState<string | null>(null);

  const gymDays = useMemo(() => {
    const s = new Set<string>();
    for (const sess of sessions) {
      const d = new Date(sess.startedAt);
      s.add(dayKey(d.getFullYear(), d.getMonth(), d.getDate()));
    }
    return s;
  }, [sessions]);

  const selectedSessions = useMemo(() => {
    if (!selected) return [];
    const [y, m, d] = selected.split("-").map(Number);
    return sessions.filter((s) => {
      const sd = new Date(s.startedAt);
      return sd.getFullYear() === y && sd.getMonth() === m && sd.getDate() === d;
    });
  }, [selected, sessions]);

  const year = month.getFullYear();
  const monthIdx = month.getMonth();
  const firstDow = new Date(year, monthIdx, 1).getDay();
  const daysInMonth = new Date(year, monthIdx + 1, 0).getDate();

  const today = new Date();
  const isToday = (d: number) =>
    today.getFullYear() === year && today.getMonth() === monthIdx && today.getDate() === d;

  if (!open) return null;

  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 9998 }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.8)' }} onClick={onClose} />
      <div
        className="w-[calc(100%-2rem)] max-w-sm rounded-2xl bg-background border border-border shadow-xl overflow-hidden"
        style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', zIndex: 1 }}
      >
        {/* Month navigation */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <button
            onClick={() => setMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))}
            className="p-1.5 rounded-lg hover:bg-muted transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="font-bold text-sm">{CAL_MONTHS[monthIdx]} {year}</span>
          <button
            onClick={() => setMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))}
            className="p-1.5 rounded-lg hover:bg-muted transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Day-of-week headers */}
        <div className="grid grid-cols-7 px-4 mb-1">
          {CAL_DOW.map((d) => (
            <div key={d} className="text-center text-[10px] font-semibold text-muted-foreground py-1">{d}</div>
          ))}
        </div>

        {/* Day cells */}
        <div className="grid grid-cols-7 px-4 gap-y-1 pb-4">
          {Array.from({ length: firstDow }).map((_, i) => <div key={`e${i}`} />)}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = i + 1;
            const key = dayKey(year, monthIdx, day);
            const hasSession = gymDays.has(key);
            const isSel = selected === key;
            const todayCell = isToday(day);
            return (
              <button
                key={day}
                onClick={() => hasSession && setSelected(isSel ? null : key)}
                disabled={!hasSession}
                className={`mx-auto w-8 h-8 flex items-center justify-center rounded-full text-sm font-medium transition-all ${
                  isSel
                    ? "bg-primary text-primary-foreground"
                    : hasSession
                    ? "bg-primary/20 text-primary font-bold hover:bg-primary/35"
                    : todayCell
                    ? "ring-1 ring-border text-foreground"
                    : "text-muted-foreground/50 cursor-default"
                }`}
              >
                {day}
              </button>
            );
          })}
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 px-5 pb-3 border-t border-border/40 pt-2">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full bg-primary/20" />
            <span className="text-[11px] text-muted-foreground">Gym day</span>
          </div>
          <span className="text-[11px] text-muted-foreground">{gymDays.size} sessions logged</span>
        </div>

        {/* Day detail */}
        {selectedSessions.length > 0 && (
          <div className="border-t border-border max-h-64 overflow-y-auto">
            {selectedSessions.map((s) => (
              <div key={s.id} className="px-4 py-3 border-b border-border/30 last:border-0">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-semibold text-sm">{s.templateName}</span>
                  {s.durationSeconds && (
                    <span className="text-[11px] text-muted-foreground">
                      {Math.floor(s.durationSeconds / 60)}m {s.durationSeconds % 60}s
                    </span>
                  )}
                </div>
                <div className="flex flex-col gap-2">
                  {s.exercises.map((ex) => {
                    const done = ex.sets.filter((set) => set.completed);
                    if (done.length === 0) return null;
                    return (
                      <div key={ex.id}>
                        <span className="text-xs font-medium">{ex.exerciseName}</span>
                        <div className="flex flex-wrap gap-1.5 mt-1">
                          {done.map((set, i) => (
                            <span key={i} className="text-[11px] font-mono bg-muted/40 border border-border/50 px-2 py-0.5 rounded-full">
                              {set.weight > 0 ? `${toDisplay(set.weight, imperial)}${unitLabel(imperial)}` : "BW"} × {set.reps}
                              {(set.partialReps ?? 0) > 0 && <span className="text-orange-400">+{set.partialReps}p</span>}
                              {set.type !== "normal" && <span className="opacity-60"> {set.type[0].toUpperCase()}</span>}
                            </span>
                          ))}
                        </div>
                        {ex.notes && (
                          <p className="mt-1 text-[11px] text-muted-foreground italic flex items-center gap-1">
                            <Pencil className="w-3 h-3 flex-shrink-0" />{ex.notes}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
