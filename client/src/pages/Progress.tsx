import { useState, useEffect, useRef } from "react";
import {
  TrendingUp, TrendingDown, Trophy, Activity, Zap, Dumbbell,
  BarChart2, ChevronDown, ChevronUp, Target, Flame, ArrowRight, X
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { getSessions, getPersonalBests, getExercises } from "@/lib/storage";
import type { WorkoutSession, PersonalBest, Exercise } from "@/lib/types";
import { formatDate } from "@/lib/hooks";

type Metric = "reps" | "weight" | "sets" | "volume";

interface SessionPoint {
  label: string;
  date: number;
  totalReps: number;
  totalPartial: number;
  totalSets: number;
  maxWeight: number;
  volume: number;
  assistedSets: number;
  failureSets: number;
}

const METRIC_CONFIG: Record<Metric, { label: string; unit: string; color: string }> = {
  reps:   { label: "Reps",   unit: "reps",  color: "hsl(217 91% 60%)" },
  weight: { label: "Weight", unit: "kg",    color: "hsl(38 95% 55%)" },
  sets:   { label: "Sets",   unit: "sets",  color: "hsl(270 70% 65%)" },
  volume: { label: "Volume", unit: "kg",    color: "hsl(142 72% 45%)" },
};

function getMetricValue(pt: SessionPoint, metric: Metric): number {
  if (metric === "reps")   return pt.totalReps;
  if (metric === "weight") return pt.maxWeight;
  if (metric === "sets")   return pt.totalSets;
  return pt.volume;
}

function buildPoints(sessions: WorkoutSession[], exerciseId: string): SessionPoint[] {
  return sessions
    .filter((s) => s.exercises.some((e) => e.exerciseId === exerciseId))
    .slice(0, 12)
    .reverse()
    .map((s, i) => {
      const ex = s.exercises.find((e) => e.exerciseId === exerciseId)!;
      const completed = ex.sets.filter((s) => s.completed);
      const totalReps    = completed.reduce((sum, s) => sum + s.reps, 0);
      const totalPartial = completed.reduce((sum, s) => sum + (s.partialReps ?? 0), 0);
      const totalSets    = completed.length;
      const maxWeight    = completed.length ? Math.max(...completed.map((s) => s.weight)) : 0;
      const volume       = completed.reduce((sum, s) => sum + s.weight * (s.reps + (s.partialReps ?? 0) * 0.5), 0);
      const assistedSets = completed.filter((s) => s.type === "assisted").length;
      const failureSets  = completed.filter((s) => s.type === "failure").length;
      return {
        label: `S${i + 1}`,
        date: s.startedAt,
        totalReps, totalPartial, totalSets, maxWeight, volume, assistedSets, failureSets,
      };
    });
}

// ─── SVG Line Chart ──────────────────────────────────────────────────────────

function LineChart({
  points,
  metric,
  partialPoints,
  selectedIndex,
  onSelect,
}: {
  points: SessionPoint[];
  metric: Metric;
  partialPoints?: SessionPoint[];
  selectedIndex: number | null;
  onSelect: (i: number) => void;
}) {
  const W = 320;
  const H = 140;
  const PAD = { top: 16, right: 16, bottom: 28, left: 36 };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;
  const cfg = METRIC_CONFIG[metric];

  const values = points.map((p) => getMetricValue(p, metric));
  const maxVal = Math.max(...values, 1);
  const minVal = 0;

  const px = (i: number) => PAD.left + (i / Math.max(points.length - 1, 1)) * chartW;
  const py = (v: number) => PAD.top + chartH - ((v - minVal) / (maxVal - minVal)) * chartH;

  const linePath = points
    .map((p, i) => {
      const x = px(i);
      const y = py(getMetricValue(p, metric));
      return i === 0 ? `M ${x} ${y}` : `L ${x} ${y}`;
    })
    .join(" ");

  const areaPath =
    linePath +
    ` L ${px(points.length - 1)} ${PAD.top + chartH} L ${px(0)} ${PAD.top + chartH} Z`;

  const partialValues = partialPoints?.map((p) => p.totalPartial);
  const partialLinePath = partialPoints
    ?.map((p, i) => {
      const x = px(i);
      const y = py(p.totalPartial);
      return i === 0 ? `M ${x} ${y}` : `L ${x} ${y}`;
    })
    .join(" ");

  // Y axis ticks
  const ticks = [0, Math.round(maxVal * 0.5), Math.round(maxVal)];

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      style={{ width: "100%", height: "auto", display: "block" }}
      aria-label={`${cfg.label} chart`}
    >
      <defs>
        <linearGradient id={`grad-${metric}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={cfg.color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={cfg.color} stopOpacity="0" />
        </linearGradient>
        {partialLinePath && (
          <linearGradient id="grad-partial" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="hsl(38 95% 55%)" stopOpacity="0.15" />
            <stop offset="100%" stopColor="hsl(38 95% 55%)" stopOpacity="0" />
          </linearGradient>
        )}
      </defs>

      {/* Grid lines */}
      {ticks.map((tick) => (
        <g key={tick}>
          <line
            x1={PAD.left} y1={py(tick)} x2={PAD.left + chartW} y2={py(tick)}
            stroke="hsl(var(--border))" strokeWidth="1" strokeDasharray="3 3"
          />
          <text
            x={PAD.left - 4} y={py(tick) + 3.5}
            fontSize="9" fill="hsl(var(--muted-foreground))"
            textAnchor="end"
          >
            {tick >= 1000 ? `${(tick / 1000).toFixed(1)}k` : tick}
          </text>
        </g>
      ))}

      {/* Area fill */}
      {points.length > 1 && (
        <path d={areaPath} fill={`url(#grad-${metric})`} />
      )}

      {/* Partial reps secondary line */}
      {partialLinePath && partialPoints && partialPoints.length > 1 && (
        <path
          d={partialLinePath}
          fill="none"
          stroke="hsl(38 95% 55%)"
          strokeWidth="1.5"
          strokeDasharray="4 3"
          opacity="0.7"
        />
      )}

      {/* Main line */}
      {points.length > 1 && (
        <path
          d={linePath}
          fill="none"
          stroke={cfg.color}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}

      {/* X axis labels */}
      {points.map((p, i) => (
        <text
          key={i}
          x={px(i)} y={H - 4}
          fontSize="9" fill="hsl(var(--muted-foreground))"
          textAnchor="middle"
        >
          {p.label}
        </text>
      ))}

      {/* Data points + tap targets */}
      {points.map((p, i) => {
        const x = px(i);
        const y = py(getMetricValue(p, metric));
        const isLast = i === points.length - 1;
        const isSelected = selectedIndex === i;
        const v = getMetricValue(p, metric);
        const prevV = i > 0 ? getMetricValue(points[i - 1], metric) : null;
        const improved = prevV !== null && v > prevV;
        return (
          <g key={i} onClick={() => onSelect(i)} style={{ cursor: "pointer" }}>
            {/* Tap target */}
            <circle cx={x} cy={y} r={16} fill="transparent" />
            {/* Outer ring for selected/last */}
            {(isSelected || isLast) && (
              <circle cx={x} cy={y} r={isSelected ? 9 : 7}
                fill="transparent"
                stroke={isSelected ? cfg.color : cfg.color}
                strokeWidth={isSelected ? 2 : 1.5}
                opacity={isSelected ? 1 : 0.4}
              />
            )}
            {/* Dot */}
            <circle
              cx={x} cy={y}
              r={isSelected ? 5 : isLast ? 4.5 : 3}
              fill={isSelected || isLast ? cfg.color : `${cfg.color}80`}
            />
            {/* Improvement badge on last point */}
            {isLast && prevV !== null && v !== prevV && (
              <g>
                <rect
                  x={x - 18} y={y - 22} width={36} height={14}
                  rx="4"
                  fill={improved ? "hsl(142 72% 45% / 0.9)" : "hsl(0 84% 60% / 0.9)"}
                />
                <text
                  x={x} y={y - 12}
                  fontSize="8" fill="white" textAnchor="middle" fontWeight="bold"
                >
                  {v > prevV ? "+" : ""}{metric === "volume"
                    ? (v - prevV).toFixed(0)
                    : (v - prevV).toFixed(metric === "weight" ? 1 : 0)}
                </text>
              </g>
            )}
          </g>
        );
      })}
    </svg>
  );
}

// ─── Progress Page ───────────────────────────────────────────────────────────

export default function Progress() {
  const [sessions, setSessions]               = useState<WorkoutSession[]>([]);
  const [pbs, setPbs]                         = useState<PersonalBest[]>([]);
  const [exercises, setExercises]             = useState<Exercise[]>([]);
  const [selectedExerciseId, setSelectedExerciseId] = useState<string | null>(null);
  const [expandedPb, setExpandedPb]           = useState(false);
  const [metric, setMetric]                   = useState<Metric>("reps");
  const [selectedPoint, setSelectedPoint]     = useState<number | null>(null);

  useEffect(() => {
    const s = getSessions();
    setSessions(s);
    setPbs(getPersonalBests());
    setExercises(getExercises());
    const exsWithHistory = getExercises().filter((ex) =>
      s.some((sess) => sess.exercises.some((e) => e.exerciseId === ex.id))
    );
    if (exsWithHistory.length > 0 && !selectedExerciseId) {
      setSelectedExerciseId(exsWithHistory[0].id);
    }
  }, []);

  const getVolume = (session: WorkoutSession) =>
    session.exercises.reduce(
      (total, ex) =>
        total + ex.sets
          .filter((s) => s.completed)
          .reduce((sum, s) => sum + s.weight * (s.reps + (s.partialReps ?? 0) * 0.5), 0),
      0
    );

  const last7 = sessions.slice(0, 7).reverse();
  const maxVolume = Math.max(...last7.map(getVolume), 1);

  const streak = (() => {
    if (sessions.length === 0) return 0;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    let count = 0, current = today.getTime();
    for (const s of sessions) {
      const d = new Date(s.startedAt); d.setHours(0, 0, 0, 0);
      if (d.getTime() >= current - 86400000) { count++; current = d.getTime(); } else break;
    }
    return count;
  })();

  const thisWeekVolume = sessions
    .filter((s) => Date.now() - s.startedAt < 7 * 86400000)
    .reduce((sum, s) => sum + getVolume(s), 0);
  const lastWeekVolume = sessions
    .filter((s) => { const age = Date.now() - s.startedAt; return age >= 7 * 86400000 && age < 14 * 86400000; })
    .reduce((sum, s) => sum + getVolume(s), 0);
  const weeklyChange = lastWeekVolume > 0 ? ((thisWeekVolume - lastWeekVolume) / lastWeekVolume) * 100 : null;

  const exercisesWithHistory = exercises.filter((ex) =>
    sessions.some((s) => s.exercises.some((e) => e.exerciseId === ex.id))
  );

  const selectedExercise = selectedExerciseId
    ? exercises.find((e) => e.id === selectedExerciseId) ?? null
    : null;

  const exercisePoints: SessionPoint[] = selectedExerciseId
    ? buildPoints(sessions, selectedExerciseId)
    : [];

  const lastPoint  = exercisePoints.length > 0 ? exercisePoints[exercisePoints.length - 1] : null;
  const prevPoint  = exercisePoints.length > 1 ? exercisePoints[exercisePoints.length - 2] : null;
  const selPoint   = selectedPoint !== null ? exercisePoints[selectedPoint] : null;

  // Motivation targets based on last session
  const targetReps   = lastPoint ? lastPoint.totalReps + 2 : null;
  const targetWeight = lastPoint ? parseFloat((lastPoint.maxWeight + 2.5).toFixed(2)) : null;
  const didImprove   = lastPoint && prevPoint
    ? getMetricValue(lastPoint, metric) > getMetricValue(prevPoint, metric)
    : null;

  const handleSelectExercise = (id: string) => {
    setSelectedExerciseId(id === selectedExerciseId ? null : id);
    setSelectedPoint(null);
    setMetric("reps");
  };

  return (
    <div className="flex flex-col min-h-full pb-20">
      {/* Header */}
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
              <div className="rounded-xl bg-card border border-card-border px-3 py-3 flex flex-col gap-1">
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <Flame className="w-3.5 h-3.5" />
                  <span className="text-[11px] font-medium">Streak</span>
                </div>
                <span className="text-2xl font-bold">{streak}</span>
                <span className="text-[10px] text-muted-foreground">days</span>
              </div>
              <div className="rounded-xl bg-card border border-card-border px-3 py-3 flex flex-col gap-1">
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <Dumbbell className="w-3.5 h-3.5" />
                  <span className="text-[11px] font-medium">This week</span>
                </div>
                <span className="text-2xl font-bold">
                  {sessions.filter((s) => Date.now() - s.startedAt < 7 * 86400000).length}
                </span>
                <span className="text-[10px] text-muted-foreground">workouts</span>
              </div>
              <div className="rounded-xl bg-card border border-card-border px-3 py-3 flex flex-col gap-1">
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <Zap className="w-3.5 h-3.5" />
                  <span className="text-[11px] font-medium">Volume</span>
                </div>
                <span className="text-lg font-bold leading-tight">
                  {thisWeekVolume >= 1000 ? `${(thisWeekVolume / 1000).toFixed(1)}k` : thisWeekVolume.toFixed(0)}
                </span>
                <div className="flex items-center gap-1">
                  <span className="text-[10px] text-muted-foreground">kg this week</span>
                  {weeklyChange !== null && (
                    <div className={`flex items-center gap-0.5 text-[10px] font-medium ${weeklyChange >= 0 ? "text-green-500" : "text-destructive"}`}>
                      {weeklyChange >= 0 ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}
                      {Math.abs(weeklyChange).toFixed(0)}%
                    </div>
                  )}
                </div>
              </div>
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
                      <div
                        key={pb.exerciseId}
                        className="flex items-center justify-between px-4 py-3"
                        data-testid={`row-pb-${pb.exerciseId}`}
                      >
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

            {/* Exercise Progress Section */}
            {exercisesWithHistory.length > 0 && (
              <div className="rounded-xl bg-card border border-card-border overflow-hidden">
                {/* Exercise Selector */}
                <div className="px-4 pt-4 pb-3 border-b border-border/40">
                  <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
                    <Activity className="w-4 h-4 text-primary" />
                    Exercise Progress
                  </h2>
                  <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
                    {exercisesWithHistory.map((ex) => (
                      <button
                        key={ex.id}
                        onClick={() => handleSelectExercise(ex.id)}
                        className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                          selectedExerciseId === ex.id
                            ? "bg-primary text-primary-foreground shadow-sm"
                            : "bg-muted text-muted-foreground"
                        }`}
                        data-testid={`button-select-exercise-progress-${ex.id}`}
                      >
                        {ex.name}
                      </button>
                    ))}
                  </div>
                </div>

                {selectedExercise && exercisePoints.length > 0 ? (
                  <div className="px-4 py-4 flex flex-col gap-4">

                    {/* ── Last Session / Target Card ── */}
                    <LastSessionCard
                      lastPoint={lastPoint}
                      prevPoint={prevPoint}
                      targetReps={targetReps}
                      targetWeight={targetWeight}
                    />

                    {/* ── Metric Tabs ── */}
                    <div className="flex gap-1 p-1 rounded-lg bg-muted/50">
                      {(["reps", "weight", "sets", "volume"] as Metric[]).map((m) => (
                        <button
                          key={m}
                          onClick={() => { setMetric(m); setSelectedPoint(null); }}
                          className={`flex-1 py-1.5 rounded-md text-[11px] font-semibold transition-all ${
                            metric === m
                              ? "bg-background text-foreground shadow-sm"
                              : "text-muted-foreground"
                          }`}
                          data-testid={`button-metric-${m}`}
                        >
                          {METRIC_CONFIG[m].label}
                        </button>
                      ))}
                    </div>

                    {/* ── Line Chart ── */}
                    <div className="relative">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                          {METRIC_CONFIG[metric].label} over {exercisePoints.length} sessions
                        </p>
                        {metric === "reps" && exercisePoints.some((p) => p.totalPartial > 0) && (
                          <div className="flex items-center gap-3 text-[10px]">
                            <span className="flex items-center gap-1">
                              <span className="w-3 h-0.5 rounded-full inline-block" style={{ background: METRIC_CONFIG.reps.color }} />
                              Full
                            </span>
                            <span className="flex items-center gap-1 text-orange-400">
                              <span className="w-3 h-0.5 rounded-full inline-block border-t border-dashed border-orange-400" style={{ borderTopWidth: 1.5 }} />
                              Partial
                            </span>
                          </div>
                        )}
                      </div>

                      <LineChart
                        points={exercisePoints}
                        metric={metric}
                        partialPoints={metric === "reps" ? exercisePoints : undefined}
                        selectedIndex={selectedPoint}
                        onSelect={(i) => setSelectedPoint(i === selectedPoint ? null : i)}
                      />

                      {/* Tap hint */}
                      {selectedPoint === null && (
                        <p className="text-[10px] text-muted-foreground text-center mt-1">
                          Tap any point for details
                        </p>
                      )}
                    </div>

                    {/* ── Selected Point Detail ── */}
                    {selPoint && (
                      <PointDetail
                        point={selPoint}
                        onClose={() => setSelectedPoint(null)}
                      />
                    )}

                    {/* ── Push Guidance ── */}
                    {lastPoint && (
                      <PushGuidance
                        lastPoint={lastPoint}
                        prevPoint={prevPoint}
                        didImprove={didImprove}
                        exerciseName={selectedExercise.name}
                      />
                    )}

                  </div>
                ) : selectedExerciseId ? (
                  <p className="text-sm text-muted-foreground text-center py-8">No session data yet</p>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-8">Select an exercise above</p>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Last Session / Target Card ──────────────────────────────────────────────

function LastSessionCard({
  lastPoint, prevPoint, targetReps, targetWeight,
}: {
  lastPoint: SessionPoint | null;
  prevPoint: SessionPoint | null;
  targetReps: number | null;
  targetWeight: number | null;
}) {
  if (!lastPoint) return null;

  const repsDelta   = prevPoint ? lastPoint.totalReps - prevPoint.totalReps : null;
  const weightDelta = prevPoint ? parseFloat((lastPoint.maxWeight - prevPoint.maxWeight).toFixed(2)) : null;
  const volDelta    = prevPoint ? parseFloat((lastPoint.volume - prevPoint.volume).toFixed(1)) : null;

  return (
    <div className="rounded-xl overflow-hidden border border-border/60">
      {/* Last session row */}
      <div className="px-4 py-3 bg-muted/30">
        <div className="flex items-center justify-between mb-2">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
            Last Session · {formatDate(lastPoint.date)}
          </p>
          {(repsDelta !== null || weightDelta !== null) && (
            <div className={`flex items-center gap-1 text-[11px] font-semibold ${
              (repsDelta ?? 0) > 0 || (weightDelta ?? 0) > 0
                ? "text-green-500"
                : (repsDelta ?? 0) < 0 || (weightDelta ?? 0) < 0
                ? "text-destructive"
                : "text-muted-foreground"
            }`}>
              {(repsDelta ?? 0) > 0 || (weightDelta ?? 0) > 0
                ? <TrendingUp className="w-3 h-3" />
                : (repsDelta ?? 0) < 0 || (weightDelta ?? 0) < 0
                ? <TrendingDown className="w-3 h-3" />
                : null}
              {repsDelta !== null && repsDelta !== 0 && `${repsDelta > 0 ? "+" : ""}${repsDelta} reps`}
              {repsDelta !== null && repsDelta !== 0 && weightDelta !== null && weightDelta !== 0 && ", "}
              {weightDelta !== null && weightDelta !== 0 && `${weightDelta > 0 ? "+" : ""}${weightDelta}kg`}
              {repsDelta === 0 && weightDelta === 0 && "Same as prev"}
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-3">
          <Stat label="Reps" value={`${lastPoint.totalReps}${lastPoint.totalPartial > 0 ? ` + ${lastPoint.totalPartial}p` : ""}`} />
          <Stat label="Best weight" value={`${lastPoint.maxWeight} kg`} />
          <Stat label="Sets" value={`${lastPoint.totalSets}`} />
          {lastPoint.volume > 0 && (
            <Stat label="Volume" value={`${lastPoint.volume >= 1000 ? `${(lastPoint.volume / 1000).toFixed(1)}k` : lastPoint.volume.toFixed(0)} kg`} />
          )}
          {lastPoint.assistedSets > 0 && (
            <Stat label="Assisted" value={`${lastPoint.assistedSets}`} color="text-blue-400" />
          )}
          {lastPoint.failureSets > 0 && (
            <Stat label="Failure" value={`${lastPoint.failureSets}`} color="text-destructive" />
          )}
        </div>
      </div>

      {/* Target row */}
      {targetReps !== null && (
        <div
          className="px-4 py-3"
          style={{ background: "hsl(217 91% 55% / 0.08)", borderTop: "1px solid hsl(217 91% 55% / 0.2)" }}
        >
          <div className="flex items-center gap-2 mb-2">
            <Target className="w-3.5 h-3.5 text-primary" />
            <p className="text-[11px] font-semibold text-primary uppercase tracking-wider">Beat Today</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Stat label="Target reps" value={`${targetReps}+`} color="text-primary" />
            <Stat label="Or weight" value={`${targetWeight} kg`} color="text-primary" />
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] text-muted-foreground">{label}</span>
      <span className={`text-sm font-bold font-mono ${color ?? "text-foreground"}`}>{value}</span>
    </div>
  );
}

// ─── Point Detail Popup ──────────────────────────────────────────────────────

function PointDetail({ point, onClose }: { point: SessionPoint; onClose: () => void }) {
  return (
    <div
      className="rounded-xl px-4 py-3 border border-border/60 animate-fade-in relative"
      style={{ background: "hsl(var(--card))" }}
      data-testid="card-point-detail"
    >
      <button
        onClick={onClose}
        className="absolute top-3 right-3 text-muted-foreground hover:text-foreground"
        data-testid="button-close-point-detail"
      >
        <X className="w-3.5 h-3.5" />
      </button>
      <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">
        {point.label} · {formatDate(point.date)}
      </p>
      <div className="grid grid-cols-2 gap-3">
        <DetailRow label="Total reps" value={`${point.totalReps}`} />
        <DetailRow label="Partial reps" value={`${point.totalPartial}`} />
        <DetailRow label="Sets" value={`${point.totalSets}`} />
        <DetailRow label="Best weight" value={`${point.maxWeight} kg`} />
        <DetailRow
          label="Volume"
          value={`${point.volume >= 1000 ? `${(point.volume / 1000).toFixed(1)}k` : point.volume.toFixed(0)} kg`}
        />
        {point.assistedSets > 0 && (
          <DetailRow label="Assisted sets" value={`${point.assistedSets}`} color="text-blue-400" />
        )}
        {point.failureSets > 0 && (
          <DetailRow label="Failure sets" value={`${point.failureSets}`} color="text-destructive" />
        )}
      </div>
      {(point.totalPartial > 0) && (
        <p className="text-[11px] text-muted-foreground mt-3">
          {point.totalReps} full + {point.totalPartial} partial = {point.totalReps + point.totalPartial} total reps
        </p>
      )}
    </div>
  );
}

function DetailRow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] text-muted-foreground">{label}</span>
      <span className={`text-sm font-bold font-mono ${color ?? "text-foreground"}`}>{value}</span>
    </div>
  );
}

// ─── Push Guidance ───────────────────────────────────────────────────────────

function PushGuidance({
  lastPoint, prevPoint, didImprove, exerciseName,
}: {
  lastPoint: SessionPoint;
  prevPoint: SessionPoint | null;
  didImprove: boolean | null;
  exerciseName: string;
}) {
  const targetReps   = lastPoint.totalReps + 2;
  const targetWeight = parseFloat((lastPoint.maxWeight + 2.5).toFixed(2));

  let message = "";
  let subMessage = "";
  let isPositive = true;

  if (!prevPoint) {
    message = `First session logged for ${exerciseName}!`;
    subMessage = `Next time, aim for ${targetReps}+ reps or increase weight to ${targetWeight} kg.`;
  } else if (didImprove) {
    const rDelta = lastPoint.totalReps - prevPoint.totalReps;
    const wDelta = parseFloat((lastPoint.maxWeight - prevPoint.maxWeight).toFixed(2));
    message = rDelta > 0
      ? `+${rDelta} reps from last session. Keep pushing!`
      : `+${wDelta}kg on the bar. Strength is building!`;
    subMessage = `Next target: ${targetReps}+ reps or ${targetWeight} kg`;
  } else if (prevPoint) {
    isPositive = false;
    message = `Keep the same weight — focus on hitting ${lastPoint.totalReps + 1}+ reps.`;
    subMessage = `Once you hit ${lastPoint.totalReps + 3} reps consistently, try ${targetWeight} kg.`;
  }

  return (
    <div
      className="rounded-xl px-4 py-3"
      style={{
        background: isPositive ? "hsl(142 72% 45% / 0.08)" : "hsl(38 95% 55% / 0.08)",
        border: `1px solid ${isPositive ? "hsl(142 72% 45% / 0.2)" : "hsl(38 95% 55% / 0.2)"}`,
      }}
      data-testid="card-push-guidance"
    >
      <div className="flex items-center gap-2 mb-1.5">
        <ArrowRight
          className="w-3.5 h-3.5"
          style={{ color: isPositive ? "hsl(142 72% 45%)" : "hsl(38 95% 55%)" }}
        />
        <p
          className="text-[11px] font-semibold uppercase tracking-wider"
          style={{ color: isPositive ? "hsl(142 72% 45%)" : "hsl(38 95% 55%)" }}
        >
          Guidance
        </p>
      </div>
      <p className="text-sm font-semibold text-foreground">{message}</p>
      {subMessage && (
        <p className="text-[11px] text-muted-foreground mt-1">{subMessage}</p>
      )}
    </div>
  );
}
