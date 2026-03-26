import { useState, useEffect, useRef } from "react";
import {
  TrendingUp, TrendingDown, Trophy, Activity, Zap, Dumbbell,
  BarChart2, ChevronDown, ChevronUp, Target, Flame, ArrowRight, X,
  Calendar, Search, ChevronRight
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { getSessions, getPersonalBests, getExercises } from "@/lib/storage";
import type { WorkoutSession, PersonalBest, Exercise, WorkoutSet } from "@/lib/types";
import { formatDate } from "@/lib/hooks";

// ─── Types ────────────────────────────────────────────────────────────────────

type Range  = "7d" | "30d" | "all";

interface SessionPoint {
  dateLabel: string;
  date: number;
  totalReps: number;
  totalPartial: number;
  totalSets: number;
  maxWeight: number;
  volume: number;
  intensity: number;
  assistedSets: number;
  failureSets: number;
  rawSets: WorkoutSet[];
}

type Metric = "intensity" | "reps" | "weight" | "sets" | "volume";

const METRIC_CONFIG: Record<Metric, { label: string; unit: string; color: string }> = {
  intensity: { label: "Intensity", unit: "pts", color: "hsl(38 95% 55%)" },
  reps:      { label: "Reps",      unit: "reps", color: "hsl(217 91% 60%)" },
  weight:    { label: "Weight",    unit: "kg",   color: "hsl(270 70% 65%)" },
  sets:      { label: "Sets",      unit: "sets", color: "hsl(145 75% 45%)" },
  volume:    { label: "Volume",    unit: "kg",   color: "hsl(7 80% 60%)" },
};

function getMetricValue(pt: SessionPoint, metric: Metric): number {
  if (metric === "intensity") return pt.intensity;
  if (metric === "reps")      return pt.totalReps;
  if (metric === "weight")    return pt.maxWeight;
  if (metric === "sets")      return pt.totalSets;
  return pt.volume;
}

function fmtVal(v: number, metric: Metric): string {
  if (metric === "intensity") return v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${Math.round(v)}`;
  if (metric === "weight" || metric === "volume") return `${v % 1 === 0 ? v : v.toFixed(1)}`;
  return `${Math.round(v)}`;
}

function calcIntensity(sets: WorkoutSet[]): number {
  return sets
    .filter((s) => s.completed)
    .reduce((sum, s) => {
      const base = s.weight * s.reps + (s.partialReps ?? 0) * s.weight * 0.5;
      const mult = s.type === "failure" ? 1.1 : s.type === "assisted" ? 0.9 : 1;
      return sum + base * mult;
    }, 0);
}

function shortDate(ts: number): string {
  return new Date(ts).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

const RANGE_MS: Record<Range, number | null> = {
  "7d": 7 * 86400000, "30d": 30 * 86400000, "all": null,
};

function buildPoints(sessions: WorkoutSession[], exerciseId: string, range: Range): SessionPoint[] {
  const cutoff = RANGE_MS[range] ? Date.now() - RANGE_MS[range]! : 0;
  const pts = sessions
    .filter((s) =>
      s.exercises.some((e) => e.exerciseId === exerciseId) && s.startedAt >= cutoff
    )
    .reverse()
    .map((s) => {
      const ex        = s.exercises.find((e) => e.exerciseId === exerciseId)!;
      const completed = ex.sets.filter((s) => s.completed);
      const totalReps    = completed.reduce((sum, s) => sum + s.reps, 0);
      const totalPartial = completed.reduce((sum, s) => sum + (s.partialReps ?? 0), 0);
      const totalSets    = completed.length;
      const maxWeight    = completed.length ? Math.max(...completed.map((s) => s.weight)) : 0;
      const volume       = completed.reduce((sum, s) => sum + s.weight * (s.reps + (s.partialReps ?? 0) * 0.5), 0);
      const intensity    = parseFloat(calcIntensity(ex.sets).toFixed(1));
      const assistedSets = completed.filter((s) => s.type === "assisted").length;
      const failureSets  = completed.filter((s) => s.type === "failure").length;
      return {
        dateLabel: shortDate(s.startedAt), date: s.startedAt,
        totalReps, totalPartial, totalSets, maxWeight, volume, intensity,
        assistedSets, failureSets, rawSets: completed,
      };
    });
  // Filter out invalid sessions: remove where reps=0, weight=0, or sets=0
  const validPts = pts.filter((p) => p.totalReps > 0 && p.maxWeight > 0 && p.totalSets > 0);
  
  // Deduplicate same-day entries (keep latest)
  const deduped = new Map<string, SessionPoint>();
  for (const p of validPts) {
    deduped.set(p.dateLabel, p);
  }
  return Array.from(deduped.values());
}

// ─── SVG Line Chart ──────────────────────────────────────────────────────────

function LineChart({
  points, metric, selectedIndex, onSelect,
}: {
  points: SessionPoint[];
  metric: Metric;
  selectedIndex: number | null;
  onSelect: (i: number) => void;
}) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  if (!points || points.length === 0) {
    return (
      <div className="flex justify-center items-center py-6 text-sm text-muted-foreground">
        No valid workout data available for selected exercise.
      </div>
    );
  }

  try {
    const W = 320;
    const H = 170;
    const PAD = { top: 28, right: 22, bottom: 30, left: 42 };
    const chartW = W - PAD.left - PAD.right;
    const chartH = H - PAD.top - PAD.bottom;
    const cfg = METRIC_CONFIG[metric];

  const values = points.map((p) => getMetricValue(p, metric));
  const numericValues = values.filter((v) => Number.isFinite(v));
  if (!numericValues.length) {
    return (
      <div className="flex justify-center items-center py-6 text-sm text-muted-foreground">
        No valid workout data available for selected exercise.
      </div>
    );
  }

  const dataMin = Math.min(...numericValues);
  const dataMax = Math.max(...numericValues);
  let minVal = 0;
  let maxVal = Math.max(dataMax, 1);
  let span = maxVal - minVal;

  // Special Y-axis handling for volume chart
  let yTicks: number[];
  if (metric === "volume") {
    // Use recharts-like YAxis: domain [0, 'auto'], tickCount=5, clean ticks
    minVal = 0;
    const niceMax = Math.max(100, Math.ceil(maxVal / 100) * 100);
    const tickCount = 5;
    let step = niceMax / (tickCount - 1);
    // Ensure step is >= 20 and round in sensible increments:
    step = Math.max(20, Math.round(step / 50) * 50 || Math.ceil(step));
    const adjustedMax = step * (tickCount - 1);
    yTicks = Array.from({ length: tickCount }, (_, i) => i * step);
    maxVal = adjustedMax;
    span = maxVal - minVal;
    if (span <= 0) {
      span = 1;
      maxVal = minVal + span;
      yTicks = [0, 1, 2, 3, 4];
    }
  } else {
    maxVal = Math.max(dataMax, minVal + 1);
    span = maxVal - minVal;
    yTicks = Array.from({ length: 6 }, (_, i) => minVal + (span / 5) * i);
  }

  const cx = (i: number) => PAD.left + (i / Math.max(points.length - 1, 1)) * chartW;
  const cy = (value: number) => {
    const clamped = Math.min(Math.max(value, minVal), maxVal);
    if (span <= 0) return PAD.top + chartH;
    return PAD.top + chartH - ((clamped - minVal) / span) * chartH;
  };

  // Straight-line path
  const linePath = points.length === 1
    ? (() => {
      const x = cx(0);
      const y = cy(getMetricValue(points[0], metric));
      return `M ${x} ${y} L ${x + 1} ${y}`;
    })()
    : points
      .map((p, i) => `${i === 0 ? "M" : "L"} ${cx(i)} ${cy(getMetricValue(p, metric))}`)
      .join(" ");

  const areaPath = points.length > 1
    ? linePath + ` L ${cx(points.length - 1)} ${PAD.top + chartH} L ${cx(0)} ${PAD.top + chartH} Z`
    : "";

  // Y ticks
  // Fallback y axis ticks for non-volume metrics
  const ticks = yTicks;

  // X labels: show first, last, and a limited number of intermediate ticks to avoid overlap
  const maxXAxisTicks = 5;
  const xTickStep = Math.max(1, Math.floor((points.length - 1) / (maxXAxisTicks - 1)));
  const xTickIndices = new Set<number>();
  xTickIndices.add(0);
  xTickIndices.add(points.length - 1);
  for (let i = xTickStep; i < points.length - 1; i += xTickStep) {
    xTickIndices.add(i);
  }

  const activeIndex = hoveredIndex !== null ? hoveredIndex : selectedIndex;
  const activePoint = activeIndex !== null ? points[activeIndex] : null;
  const activeValue = activePoint ? getMetricValue(activePoint, metric) : 0;

  const rawTooltipX = activePoint && activeIndex !== null ? cx(activeIndex) : 0;
  const rawTooltipY = activePoint ? cy(activeValue) : 0;
  const tooltipX = Math.min(Math.max((rawTooltipX / W) * 100, 6), 94);
  const tooltipY = Math.min(Math.max((rawTooltipY / H) * 100, 8), 85);

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }}>
        <defs>
          <linearGradient id={`area-${metric}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={cfg.color} stopOpacity="0.22" />
            <stop offset="100%" stopColor={cfg.color} stopOpacity="0" />
          </linearGradient>
        </defs>

      {/* Grid lines */}
      {yTicks.map((tick, ti) => (
        <g key={ti}>
          <line x1={PAD.left} y1={cy(tick)} x2={PAD.left + chartW} y2={cy(tick)}
            stroke="hsl(var(--border))" strokeWidth="0.8" strokeDasharray="4 4" />
          <text x={PAD.left - 8} y={cy(tick) + 3.5}
            fontSize="10" fill="hsl(var(--muted-foreground))" textAnchor="end">
            {tick >= 1000 ? `${(tick / 1000).toFixed(1)}k` : Math.round(tick)}
          </text>
        </g>
      ))}

      {/* Area */}
      {points.length > 0 && <path d={areaPath} fill={`url(#area-${metric})`} />}

      {/* Straight line */}
      {points.length >= 1 && (
        <path d={linePath} fill="none" stroke={cfg.color} strokeWidth="2.5"
          strokeLinecap="round" strokeLinejoin="round" />
      )}

      {/* X-axis base line */}
      <line
        x1={PAD.left}
        y1={PAD.top + chartH}
        x2={PAD.left + chartW}
        y2={PAD.top + chartH}
        stroke="hsl(var(--muted-foreground))"
        strokeWidth="1"
        opacity="0.6"
      />

      {/* X-axis labels */}
      {points.map((p, i) => {
        if (!xTickIndices.has(i)) return null;
        const label = i === 0 ? "Start" : i === points.length - 1 ? "Latest" : p.dateLabel;
        const isLatest = i === points.length - 1;
        return (
          <text key={i}
            x={cx(i)}
            y={H - 4}
            fontSize="8"
            fill={isLatest ? "hsl(38 95% 55%)" : "hsl(var(--muted-foreground))"}
            textAnchor="end"
            transform={`translate(${cx(i)}, ${H - 4}) rotate(-45)`}
            dominantBaseline="middle"
            fontWeight={isLatest ? "bold" : "normal"}
          >
            {label}
          </text>
        );
      })}
      {points.length > 0 && (
        <rect
          x={PAD.left}
          y={PAD.top + chartH + 4}
          width={chartW}
          height={24}
          fill="transparent"
        />
      )}

      {/* Data points with value labels */}
      {points.map((p, i) => {
        const x        = cx(i);
        const y        = cy(getMetricValue(p, metric));
        const v        = getMetricValue(p, metric);
        const isFirst  = i === 0;
        const isLast   = i === points.length - 1;
        const isSelect = selectedIndex === i;
        const prevV    = i > 0 ? getMetricValue(points[i - 1], metric) : null;
        const up       = prevV !== null && v > prevV;
        const down     = prevV !== null && v < prevV;
        const label    = fmtVal(v, metric);

        // Badge placement for endpoint delta: avoid going off-screen on right edge.
        const badgeOffset = x > PAD.left + chartW - 46 ? -42 : 7;

        const pointFill = isSelect
          ? cfg.color
          : isFirst || isLast
          ? cfg.color
          : "hsl(var(--muted-foreground))";

        const pointStroke = isSelect
          ? "white"
          : isFirst || isLast
          ? cfg.color
          : "hsl(var(--muted-foreground))";

        // Value label position: above point, avoid top clip
        const labelY = y - 10 < PAD.top + 4 ? y + 18 : y - 10;

        return (
          <g
            key={i}
            onClick={() => onSelect(i)}
            onMouseEnter={() => setHoveredIndex(i)}
            onMouseLeave={() => setHoveredIndex(null)}
            style={{ cursor: "pointer" }}
          >
            {/* Tap target */}
            <circle cx={x} cy={y} r={18} fill="transparent" />

            {/* First / Last rings */}
            {isFirst && (
              <circle cx={x} cy={y} r={8} fill="transparent"
                stroke={cfg.color} strokeWidth="1.5" opacity="0.35" />
            )}
            {isLast && !isSelect && (
              <circle cx={x} cy={y} r={8} fill="transparent"
                stroke={cfg.color} strokeWidth="2" opacity="0.6" />
            )}
            {isSelect && (
              <circle cx={x} cy={y} r={10} fill="transparent"
                stroke={cfg.color} strokeWidth="2" opacity="0.9" />
            )}

            {/* Dot */}
            <circle cx={x} cy={y}
              r={isSelect ? 5.5 : (isFirst || isLast) ? 5 : 4}
              fill={pointFill}
              stroke={pointStroke}
              strokeWidth={isFirst || isLast || isSelect ? 1.5 : 1}
            />

            {/* Value label */}
            <text x={x} y={labelY}
              fontSize={isFirst || isLast ? "9" : "8"}
              fill={isFirst || isLast ? cfg.color : "hsl(var(--muted-foreground))"}
              textAnchor="middle"
              fontWeight={isFirst || isLast ? "bold" : "normal"}
            >
              {label}
            </text>

            {/* Delta badge on latest point */}
            {isLast && prevV !== null && v !== prevV && (
              <g>
                <rect
                  x={x + badgeOffset} y={y - 12} width={34} height={14}
                  rx="4"
                  fill={up ? "hsl(142 72% 40% / 0.95)" : "hsl(0 84% 55% / 0.95)"}
                />
                <text x={x + badgeOffset + 17} y={y - 2.5}
                  fontSize="8" fill="white" textAnchor="middle" fontWeight="bold">
                  {up ? "+" : ""}{
                    metric === "intensity"
                      ? (v - prevV).toFixed(0)
                      : metric === "weight"
                      ? (v - prevV).toFixed(1)
                      : Math.round(v - prevV)
                  }
                </text>
              </g>
            )}
          </g>
        );
      })}
    </svg>

    {activePoint && (
      <div
        className="pointer-events-none absolute z-20 rounded-md border border-border bg-background/95 px-2 py-1 text-xs shadow-xl"
        style={{
          left: `${tooltipX}%`,
          top: `${tooltipY}%`,
          transform: "translate(-50%, -105%)",
          minWidth: "90px",
          maxWidth: "160px",
        }}
      >
        <div className="text-foreground font-semibold">
          {fmtVal(activeValue, metric)} {METRIC_CONFIG[metric].unit}
        </div>
        <div className="text-[10px] text-muted-foreground">
          {activeIndex === 0 ? "Start" : activeIndex === points.length - 1 ? "Latest" : activePoint.dateLabel}
        </div>
      </div>
    )}
  </div>
  );
  } catch (error) {
    console.error("LineChart rendering error:", error);
    return (
      <div className="text-center text-sm text-destructive py-4">
        Unable to render chart. Please try another exercise or metric.
      </div>
    );
  }
}

// ─── Progress Summary Bar ─────────────────────────────────────────────────────

function ProgressSummary({ points, metric }: { points: SessionPoint[]; metric: Metric }) {
  if (points.length < 2) return null;
  const first    = points[0];
  const last     = points[points.length - 1];
  const startV   = getMetricValue(first, metric);
  const currentV = getMetricValue(last,  metric);
  const delta    = currentV - startV;
  const pct      = startV > 0 ? ((delta / startV) * 100) : 0;
  const up       = delta > 0;
  const flat     = delta === 0;
  const cfg      = METRIC_CONFIG[metric];

  return (
    <div
      className="rounded-xl px-4 py-3 flex items-center gap-3"
      style={{
        background: up ? "hsl(142 72% 45% / 0.08)" : delta < 0 ? "hsl(0 84% 60% / 0.08)" : "hsl(var(--muted)/0.5)",
        border: `1px solid ${up ? "hsl(142 72% 45% / 0.2)" : delta < 0 ? "hsl(0 84% 60% / 0.2)" : "hsl(var(--border))"}`,
      }}
    >
      <div className="flex-1 min-w-0">
        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Start · {first.dateLabel}</p>
        <p className="text-lg font-bold font-mono" style={{ color: `${cfg.color}aa` }}>
          {fmtVal(startV, metric)}
        </p>
      </div>
      <div className="flex flex-col items-center gap-0.5 px-2">
        {!flat && (up
          ? <TrendingUp className="w-4 h-4 text-green-500" />
          : <TrendingDown className="w-4 h-4 text-destructive" />
        )}
        {!flat ? (
          <span className={`text-xs font-bold ${up ? "text-green-500" : "text-destructive"}`}>
            {up ? "+" : ""}{fmtVal(Math.abs(delta), metric)}
            <span className="text-[10px] font-normal ml-1">({up ? "+" : "-"}{Math.abs(pct).toFixed(1)}%)</span>
          </span>
        ) : (
          <span className="text-[10px] text-muted-foreground">No change</span>
        )}
      </div>
      <div className="flex-1 min-w-0 text-right">
        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Now · {last.dateLabel}</p>
        <p className="text-lg font-bold font-mono" style={{ color: cfg.color }}>
          {fmtVal(currentV, metric)}
        </p>
      </div>
    </div>
  );
}

// ─── Exercise Search & Selector ───────────────────────────────────────────────

function ExerciseSelector({
  exercises,
  selectedId,
  onSelect,
}: {
  exercises: Exercise[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen]   = useState(false);
  const inputRef          = useRef<HTMLInputElement>(null);
  const selected          = exercises.find((e) => e.id === selectedId);

  const filtered = query.trim()
    ? exercises.filter((e) => e.name.toLowerCase().includes(query.toLowerCase()))
    : exercises;

  const handleSelect = (id: string) => {
    onSelect(id);
    setQuery("");
    setOpen(false);
  };

  return (
    <div className="relative">
      {/* Search / selected display */}
      <div
        className={`flex items-center gap-2 px-3 py-2 rounded-xl border bg-muted/30 transition-all ${
          open ? "border-primary ring-1 ring-primary/30" : "border-border/60"
        }`}
        onClick={() => { setOpen(true); setTimeout(() => inputRef.current?.focus(), 50); }}
      >
        <Search className="w-4 h-4 text-muted-foreground flex-shrink-0" />
        <input
          ref={inputRef}
          type="text"
          placeholder={selected ? selected.name : "Search exercise…"}
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          data-testid="input-search-exercise-progress"
        />
        {selected && !query && (
          <span className="text-[11px] text-primary font-medium truncate max-w-[80px]">{selected.name}</span>
        )}
        {query ? (
          <button onClick={(e) => { e.stopPropagation(); setQuery(""); inputRef.current?.focus(); }}>
            <X className="w-3.5 h-3.5 text-muted-foreground" />
          </button>
        ) : (
          <ChevronDown className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
        )}
      </div>

      {/* Dropdown list */}
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => { setOpen(false); setQuery(""); }} />
          <div className="absolute top-full left-0 right-0 mt-1 z-40 rounded-xl border border-border bg-card shadow-lg overflow-hidden max-h-52 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">No exercises found</p>
            ) : (
              filtered.map((ex) => (
                <button
                  key={ex.id}
                  onClick={() => handleSelect(ex.id)}
                  className={`w-full flex items-center justify-between px-4 py-2.5 text-left text-sm transition-colors hover:bg-muted/50 ${
                    ex.id === selectedId ? "text-primary font-semibold bg-primary/5" : "text-foreground"
                  }`}
                  data-testid={`button-select-exercise-progress-${ex.id}`}
                >
                  <div>
                    <span>{ex.name}</span>
                    {ex.muscleGroup && (
                      <span className="ml-2 text-[11px] text-muted-foreground">{ex.muscleGroup}</span>
                    )}
                  </div>
                  {ex.id === selectedId && <ChevronRight className="w-3.5 h-3.5 text-primary" />}
                </button>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Progress Page ────────────────────────────────────────────────────────────

export default function Progress() {
  const [sessions, setSessions]   = useState<WorkoutSession[]>([]);
  const [pbs, setPbs]             = useState<PersonalBest[]>([]);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [selectedExerciseId, setSelectedExerciseId] = useState<string | null>(null);
  const [expandedPb, setExpandedPb] = useState(false);
  const [metric, setMetric]         = useState<Metric>("intensity");
  const [range, setRange]           = useState<Range>("all");
  const [selectedPoint, setSelectedPoint] = useState<number | null>(null);

  useEffect(() => {
    const s = getSessions();
    setSessions(s);
    setPbs(getPersonalBests());
    const exs = getExercises();
    setExercises(exs);
    if (!selectedExerciseId && exs.length > 0) {
      setSelectedExerciseId(exs[0].id);
    }
  }, [selectedExerciseId]);

  const getVolume = (session: WorkoutSession) =>
    session.exercises.reduce(
      (total, ex) =>
        total + ex.sets.filter((s) => s.completed)
          .reduce((sum, s) => sum + s.weight * (s.reps + (s.partialReps ?? 0) * 0.5), 0),
      0
    );

  const streak = (() => {
    if (!sessions.length) return 0;
    const today = new Date(); today.setHours(0,0,0,0);
    let count = 0, cur = today.getTime();
    for (const s of sessions) {
      const d = new Date(s.startedAt); d.setHours(0,0,0,0);
      if (d.getTime() >= cur - 86400000) { count++; cur = d.getTime(); } else break;
    }
    return count;
  })();

  const thisWeekVol  = sessions.filter((s) => Date.now() - s.startedAt < 7 * 86400000).reduce((sum, s) => sum + getVolume(s), 0);
  const lastWeekVol  = sessions.filter((s) => { const a = Date.now() - s.startedAt; return a >= 7*86400000 && a < 14*86400000; }).reduce((sum, s) => sum + getVolume(s), 0);
  const weeklyChange = lastWeekVol > 0 ? ((thisWeekVol - lastWeekVol) / lastWeekVol) * 100 : null;

  const exerciseOptions = exercises;
  const exercisesWithHistory = exercises.filter((ex) =>
    sessions.some((s) => s.exercises.some((e) => e.exerciseId === ex.id))
  );

  const selectedExercise = selectedExerciseId
    ? exercises.find((e) => e.id === selectedExerciseId) ?? null
    : null;

  const exercisePoints: SessionPoint[] = selectedExerciseId
    ? buildPoints(sessions, selectedExerciseId, range)
    : [];

  const lastPoint = exercisePoints.length > 0 ? exercisePoints[exercisePoints.length - 1] : null;
  const prevPoint = exercisePoints.length > 1 ? exercisePoints[exercisePoints.length - 2] : null;
  const selPoint  = selectedPoint !== null ? exercisePoints[selectedPoint] : null;

  const didImprove = lastPoint && prevPoint
    ? getMetricValue(lastPoint, metric) > getMetricValue(prevPoint, metric)
    : null;

  const handleSelectExercise = (id: string) => {
    setSelectedExerciseId(id);
    setSelectedPoint(null);
    setMetric("intensity");
  };

  return (
    <div className="flex flex-col min-h-full pb-20">
      <div className="sticky top-0 z-40 bg-background/95 backdrop-blur-md border-b border-border">
        <div className="max-w-lg mx-auto px-4 py-4">
          <h1 className="text-xl font-bold tracking-tight">Progress</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Your strength journey</p>
        </div>
      </div>

      <div className="max-w-lg mx-auto w-full px-4 py-4 flex flex-col gap-4">
        {sessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-4">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
              <BarChart2 className="w-8 h-8 text-muted-foreground" />
            </div>
            <div className="text-center">
              <p className="font-semibold">No data yet</p>
              <p className="text-sm text-muted-foreground mt-1">Complete workouts to see your progress</p>
            </div>
          </div>
        ) : (
          <>
            {/* Top stats */}
            <div className="grid grid-cols-3 gap-2">
              <StatCard icon={<Flame className="w-3.5 h-3.5" />} label="Streak" value={`${streak}`} sub="days" />
              <StatCard icon={<Dumbbell className="w-3.5 h-3.5" />} label="This week"
                value={`${sessions.filter((s) => Date.now() - s.startedAt < 7*86400000).length}`} sub="workouts" />
              <StatCard icon={<Zap className="w-3.5 h-3.5" />} label="Volume"
                value={thisWeekVol >= 1000 ? `${(thisWeekVol/1000).toFixed(1)}k` : thisWeekVol.toFixed(0)}
                sub="kg this week"
                badge={weeklyChange !== null ? { up: weeklyChange >= 0, text: `${Math.abs(weeklyChange).toFixed(0)}%` } : undefined}
              />
            </div>

            {/* Personal Bests */}
            {pbs.length > 0 && (
              <div className="rounded-xl bg-card border border-card-border overflow-hidden">
                <button
                  className="w-full flex items-center justify-between px-4 py-3.5"
                  onClick={() => setExpandedPb((e) => !e)}
                  data-testid="button-toggle-pbs"
                >
                  <div className="flex items-center gap-2">
                    <Trophy className="w-4 h-4 text-accent" />
                    <span className="font-semibold text-sm">Personal Bests</span>
                    <Badge variant="secondary" className="text-[10px]">{pbs.length}</Badge>
                  </div>
                  {expandedPb ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                </button>
                {expandedPb && (
                  <div className="border-t border-border/50 divide-y divide-border/30">
                    {pbs.map((pb) => (
                      <div key={pb.exerciseId} className="flex items-center justify-between px-4 py-3" data-testid={`row-pb-${pb.exerciseId}`}>
                        <div>
                          <p className="text-sm font-medium">{pb.exerciseName}</p>
                          <p className="text-[11px] text-muted-foreground">{formatDate(pb.achievedAt)}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-sm font-mono">{pb.weight}kg × {pb.reps}</p>
                          <p className="text-[11px] text-muted-foreground">{pb.volume.toFixed(0)} kg vol</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Exercise Progress */}
            {exerciseOptions.length > 0 ? (
              <div className="rounded-xl bg-card border border-card-border overflow-hidden">
                <div className="px-4 pt-4 pb-3 border-b border-border/40">
                  <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
                    <Activity className="w-4 h-4 text-primary" />
                    Exercise Progress
                  </h2>
                  <ExerciseSelector
                    exercises={exerciseOptions}
                    selectedId={selectedExerciseId}
                    onSelect={handleSelectExercise}
                  />
                </div>

                {selectedExercise && exercisePoints.length > 0 ? (
                  <div className="px-4 py-4 flex flex-col gap-4">

                    {/* Last session breakdown */}
                    {lastPoint && <LastSessionDetail point={lastPoint} prevPoint={prevPoint} />}

                    {/* Metric tabs */}
                    <div className="flex gap-1 p-1 rounded-xl bg-muted/50 overflow-x-auto">
                      {(["intensity", "reps", "weight", "sets", "volume"] as Metric[]).map((m) => {
                        const cfg = METRIC_CONFIG[m];
                        const active = metric === m;
                        return (
                          <button
                            key={m}
                            onClick={() => { setMetric(m); setSelectedPoint(null); }}
                            className={`min-w-[80px] px-2 py-2 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
                              active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
                            }`}
                            data-testid={`button-metric-${m}`}
                          >
                            {cfg.label}
                          </button>
                        );
                      })}
                    </div>

                    {/* Date range */}
                    <div className="flex items-center gap-2">
                      <Calendar className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                      <div className="flex gap-1">
                        {(["7d", "30d", "all"] as Range[]).map((r) => (
                          <button
                            key={r}
                            onClick={() => { setRange(r); setSelectedPoint(null); }}
                            className={`px-3 py-1 rounded-full text-[11px] font-semibold transition-all ${
                              range === r
                                ? "bg-primary/20 text-primary"
                                : "text-muted-foreground bg-muted/40"
                            }`}
                            data-testid={`button-range-${r}`}
                          >
                            {r === "all" ? "All time" : `Last ${r}`}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Progress summary */}
                    <ProgressSummary points={exercisePoints} metric={metric} />

                    {/* Chart */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                          {METRIC_CONFIG[metric].label} · {exercisePoints.length} sessions
                        </p>
                        {metric === "intensity" && (
                          <span className="text-[9px] text-muted-foreground">Fail +10% · Assist −10%</span>
                        )}
                        {metric === "reps" && exercisePoints.some((p) => p.totalPartial > 0) && (
                          <span className="text-[9px] text-orange-400">incl. partial reps</span>
                        )}
                      </div>

                      {exercisePoints.length > 0 ? (
                        <>
                          <LineChart
                            points={exercisePoints}
                            metric={metric}
                            selectedIndex={selectedPoint}
                            onSelect={(i) => setSelectedPoint(i === selectedPoint ? null : i)}
                          />
                          {exercisePoints.length === 1 && (
                            <div className="mt-3">
                              <SinglePointDisplay point={exercisePoints[0]} metric={metric} />
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="flex flex-col items-center justify-center py-6 gap-2">
                          <Activity className="w-5 h-5 text-muted-foreground opacity-50" />
                          <p className="text-sm text-muted-foreground">No valid workout data</p>
                          <p className="text-xs text-muted-foreground text-center max-w-xs">
                            Complete a session with valid weight and reps to see progress
                          </p>
                        </div>
                      )}

                      {selectedPoint === null && exercisePoints.length > 1 && (
                        <p className="text-[10px] text-muted-foreground text-center mt-1">
                          Tap any point to see full set breakdown
                        </p>
                      )}
                    </div>

                    {/* Tapped point detail */}
                    {selPoint && (
                      <PointDetail point={selPoint} onClose={() => setSelectedPoint(null)} />
                    )}

                    {/* Push guidance */}
                    {lastPoint && (
                      <PushGuidance
                        lastPoint={lastPoint}
                        prevPoint={prevPoint}
                        didImprove={didImprove}
                        metric={metric}
                        exerciseName={selectedExercise.name}
                      />
                    )}

                  </div>
                ) : selectedExerciseId && exercisePoints.length === 0 ? (
                  <div className="text-center py-10 px-4 flex flex-col items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                      <Activity className="w-5 h-5 text-muted-foreground opacity-60" />
                    </div>
                    <p className="text-sm font-medium text-muted-foreground">No workout data available</p>
                    <p className="text-xs text-muted-foreground max-w-xs">
                      {range === "all" 
                        ? "Log this exercise to see progress tracking"
                        : "No sessions found in the selected period"}
                    </p>
                    {range !== "all" && (
                      <button className="text-xs text-primary mt-1 font-medium hover:underline" onClick={() => setRange("all")}>
                        View all time →
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-10 px-4 flex flex-col items-center gap-2">
                    <p className="text-sm text-muted-foreground">Select an exercise to view progress</p>
                    <p className="text-xs text-muted-foreground max-w-xs">
                      Choose from {exerciseOptions.length} exercise{exerciseOptions.length !== 1 ? "s" : ""} above
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-10">
                <p className="text-sm text-muted-foreground">No exercises available. Add an exercise to get started.</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function StatCard({ icon, label, value, sub, badge }: {
  icon: React.ReactNode; label: string; value: string; sub: string;
  badge?: { up: boolean; text: string };
}) {
  return (
    <div className="rounded-xl bg-card border border-card-border px-3 py-3 flex flex-col gap-1">
      <div className="flex items-center gap-1.5 text-muted-foreground">{icon}<span className="text-[11px] font-medium">{label}</span></div>
      <span className="text-xl font-bold leading-tight">{value}</span>
      <div className="flex items-center gap-1">
        <span className="text-[10px] text-muted-foreground">{sub}</span>
        {badge && (
          <div className={`flex items-center gap-0.5 text-[10px] font-medium ${badge.up ? "text-green-500" : "text-destructive"}`}>
            {badge.up ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}
            {badge.text}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Last Session Detail ──────────────────────────────────────────────────────

function LastSessionDetail({ point, prevPoint }: { point: SessionPoint; prevPoint: SessionPoint | null }) {
  const repsDelta   = prevPoint ? point.totalReps - prevPoint.totalReps : null;
  const weightDelta = prevPoint ? parseFloat((point.maxWeight - prevPoint.maxWeight).toFixed(2)) : null;
  const anyUp       = (repsDelta ?? 0) > 0 || (weightDelta ?? 0) > 0;
  const anyDown     = (repsDelta ?? 0) < 0 && (weightDelta ?? 0) <= 0;

  return (
    <div className="rounded-xl border border-border/60 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-2.5 bg-muted/30 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Last Session</span>
          <span className="text-[10px] text-muted-foreground">· {point.dateLabel}</span>
        </div>
        {prevPoint && (
          <div className={`flex items-center gap-1 text-[11px] font-semibold ${anyUp ? "text-green-500" : anyDown ? "text-destructive" : "text-muted-foreground"}`}>
            {anyUp ? <TrendingUp className="w-3 h-3" /> : anyDown ? <TrendingDown className="w-3 h-3" /> : null}
            {repsDelta !== null && repsDelta !== 0 && `${repsDelta > 0 ? "+" : ""}${repsDelta} reps`}
            {repsDelta !== null && repsDelta !== 0 && weightDelta !== null && weightDelta !== 0 && " · "}
            {weightDelta !== null && weightDelta !== 0 && `${weightDelta > 0 ? "+" : ""}${weightDelta}kg`}
            {repsDelta === 0 && weightDelta === 0 && "Same as last"}
          </div>
        )}
      </div>

      {/* Per-set rows */}
      <div className="divide-y divide-border/20">
        {point.rawSets.map((set, i) => (
          <div key={set.id} className="px-4 py-2.5 flex items-center gap-3">
            <span className="w-5 h-5 rounded-full bg-muted flex items-center justify-center text-[10px] font-bold text-muted-foreground flex-shrink-0">
              {i + 1}
            </span>
            <span className="text-sm font-bold font-mono flex-1">
              {set.weight > 0 ? `${set.weight}kg` : "BW"} × {set.reps}
              {(set.partialReps ?? 0) > 0 && (
                <span className="text-orange-400 text-xs ml-1">(+{set.partialReps}p)</span>
              )}
            </span>
            <div className="flex gap-1">
              {set.type === "failure"  && <span className="text-[10px] font-semibold text-destructive bg-destructive/10 border border-destructive/20 px-1.5 py-0.5 rounded-full">🔥 Failure</span>}
              {set.type === "assisted" && <span className="text-[10px] font-semibold text-blue-400 bg-blue-400/10 border border-blue-400/20 px-1.5 py-0.5 rounded-full">🤝 Assisted</span>}
            </div>
          </div>
        ))}
      </div>

      {/* Summary */}
      <div className="px-4 py-2.5 bg-muted/20 border-t border-border/40 flex flex-wrap gap-3">
        <SumStat label="Total reps" value={`${point.totalReps}${point.totalPartial > 0 ? ` + ${point.totalPartial}p` : ""}`} />
        <SumStat label="Sets"       value={`${point.totalSets}`} />
        <SumStat label="Peak weight" value={`${point.maxWeight} kg`} />
        {point.assistedSets > 0 && <SumStat label="Assisted" value={`${point.assistedSets}`} color="text-blue-400" />}
        {point.failureSets  > 0 && <SumStat label="Failure"  value={`${point.failureSets}`}  color="text-destructive" />}
        <SumStat label="Intensity" value={`${Math.round(point.intensity)}`} color="text-orange-400" />
      </div>

      {/* Beat Today */}
      <div className="px-4 py-3 flex items-start gap-3"
        style={{ background: "hsl(217 91% 55% / 0.07)", borderTop: "1px solid hsl(217 91% 55% / 0.18)" }}>
        <Target className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-[10px] font-semibold text-primary uppercase tracking-wider mb-1.5">Beat Today</p>
          <div className="flex flex-col gap-1">
            {/* Show the two best sets from last session as concrete targets */}
            {point.rawSets.slice(0, 2).map((set, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                <span className="text-muted-foreground font-mono">
                  Last: {set.weight > 0 ? `${set.weight}kg` : "BW"} × {set.reps}{(set.partialReps ?? 0) > 0 ? `(+${set.partialReps}p)` : ""}
                </span>
                <ArrowRight className="w-3 h-3 text-muted-foreground" />
                <span className="text-primary font-semibold font-mono">
                  {set.weight > 0 ? `${set.weight}kg` : "BW"} × {set.reps + 1}
                  {" OR "}
                  {set.weight > 0 ? `${parseFloat((set.weight + 2.5).toFixed(2))}kg × ${set.reps}` : "add weight"}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function SumStat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[9px] text-muted-foreground uppercase tracking-wide">{label}</span>
      <span className={`text-xs font-bold font-mono ${color ?? "text-foreground"}`}>{value}</span>
    </div>
  );
}

// ─── Single Point Display ─────────────────────────────────────────────────────

function SinglePointDisplay({ point, metric }: { point: SessionPoint; metric: Metric }) {
  const v   = getMetricValue(point, metric);
  const cfg = METRIC_CONFIG[metric];
  return (
    <div className="flex flex-col items-center gap-1 py-6">
      <span className="text-3xl font-bold font-mono" style={{ color: cfg.color }}>{fmtVal(v, metric)}</span>
      <span className="text-xs text-muted-foreground">{cfg.label} · first session on {point.dateLabel}</span>
    </div>
  );
}

// ─── Point Detail Popup ───────────────────────────────────────────────────────

function PointDetail({ point, onClose }: { point: SessionPoint; onClose: () => void }) {
  return (
    <div className="rounded-xl border border-border/60 overflow-hidden animate-fade-in" data-testid="card-point-detail">
      <div className="px-4 py-2.5 bg-muted/30 flex items-center justify-between">
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
          {point.dateLabel} · Set breakdown
        </p>
        <button onClick={onClose} data-testid="button-close-point-detail">
          <X className="w-3.5 h-3.5 text-muted-foreground" />
        </button>
      </div>
      <div className="divide-y divide-border/20">
        {point.rawSets.map((set, i) => (
          <div key={set.id} className="px-4 py-2 flex items-center gap-3">
            <span className="w-4 h-4 rounded-full bg-muted flex items-center justify-center text-[9px] font-bold text-muted-foreground">{i+1}</span>
            <span className="text-sm font-bold font-mono flex-1">
              {set.weight > 0 ? `${set.weight}kg` : "BW"} × {set.reps}
              {(set.partialReps ?? 0) > 0 && <span className="text-orange-400 text-xs ml-1">(+{set.partialReps}p)</span>}
            </span>
            {set.type === "failure"  && <span className="text-[10px] text-orange-400 bg-orange-400/10 px-1.5 py-0.5 rounded-full">🔥 Failure</span>}
            {set.type === "assisted" && <span className="text-[10px] text-muted-foreground bg-muted/10 px-1.5 py-0.5 rounded-full">🤝 Assisted</span>}
          </div>
        ))}
      </div>
      <div className="px-4 py-2.5 bg-muted/20 border-t border-border/40 flex flex-wrap gap-3">
        <SumStat label="Reps"      value={`${point.totalReps}${point.totalPartial > 0 ? `+${point.totalPartial}p` : ""}`} />
        <SumStat label="Sets"      value={`${point.totalSets}`} />
        <SumStat label="Weight"    value={`${point.maxWeight}kg`} />
        <SumStat label="Intensity" value={`${Math.round(point.intensity)}`} color="text-orange-400" />
        {point.assistedSets > 0 && <SumStat label="Assisted" value={`${point.assistedSets}`} color="text-blue-400" />}
        {point.failureSets  > 0 && <SumStat label="Failure"  value={`${point.failureSets}`}  color="text-destructive" />}
      </div>
    </div>
  );
}

// ─── Push Guidance ────────────────────────────────────────────────────────────

function PushGuidance({ lastPoint, prevPoint, didImprove, metric, exerciseName }: {
  lastPoint: SessionPoint; prevPoint: SessionPoint | null;
  didImprove: boolean | null; metric: Metric; exerciseName: string;
}) {
  const targetInt    = Math.round(lastPoint.intensity * 1.05);
  const targetReps   = lastPoint.totalReps + 2;
  const targetWeight = parseFloat((lastPoint.maxWeight + 2.5).toFixed(2));

  let title = "", body = "", isPositive = true;

  if (!prevPoint) {
    title = `First ${exerciseName} logged — great start!`;
    body  = `Next: aim for ${targetReps}+ reps or push to ${targetWeight}kg.`;
  } else if (didImprove) {
    const rDelta = lastPoint.totalReps - prevPoint.totalReps;
    const iDelta = Math.round(lastPoint.intensity - prevPoint.intensity);
    if (metric === "intensity") {
      title = `Intensity up +${iDelta} pts — you pushed harder!`;
      body  = `Next target: ${targetInt} pts (+5%).`;
    } else if (rDelta > 0) {
      title = `+${rDelta} reps vs last session — keep going!`;
      body  = `Next: ${targetReps}+ reps, then consider ${targetWeight}kg.`;
    } else {
      title = `Weight increased — strength is building!`;
      body  = `Hold this weight, aim for ${targetReps}+ reps next time.`;
    }
  } else {
    isPositive = false;
    title = `Aim for ${lastPoint.totalReps + 1}+ reps this session.`;
    body  = `Once you hit ${lastPoint.totalReps + 3} reps consistently, try ${targetWeight}kg.`;
  }

  return (
    <div className="rounded-xl px-4 py-3"
      style={{
        background: isPositive ? "hsl(142 72% 45% / 0.08)" : "hsl(38 95% 55% / 0.08)",
        border: `1px solid ${isPositive ? "hsl(142 72% 45% / 0.2)" : "hsl(38 95% 55% / 0.2)"}`,
      }}
      data-testid="card-push-guidance"
    >
      <div className="flex items-center gap-2 mb-1">
        <ArrowRight className="w-3.5 h-3.5 flex-shrink-0"
          style={{ color: isPositive ? "hsl(142 72% 45%)" : "hsl(38 95% 55%)" }} />
        <p className="text-[10px] font-semibold uppercase tracking-wider"
          style={{ color: isPositive ? "hsl(142 72% 45%)" : "hsl(38 95% 55%)" }}>
          Guidance
        </p>
      </div>
      <p className="text-sm font-semibold text-foreground">{title}</p>
      <p className="text-[11px] text-muted-foreground mt-0.5">{body}</p>
    </div>
  );
}
