import { useState, useEffect, useMemo } from "react";
import {
  TrendingUp, TrendingDown, Trophy, Flame, Dumbbell,
  Search, X, ChevronDown, BarChart2,
} from "lucide-react";
import {
  getSessions, getPersonalBests, getExercises,
} from "@/lib/storage";
import type { WorkoutSession, PersonalBest, Exercise, WorkoutSet } from "@/lib/types";
import { formatDate, calcIntensity, topWeight } from "@/lib/hooks";

// ─── Metrics ────────────────────────────────────────────────────────────────

type Metric = "intensity" | "weight" | "volume";

const METRICS: { key: Metric; label: string; unit: string; color: string }[] = [
  { key: "intensity", label: "Intensity",  unit: "",   color: "hsl(38 95% 55%)" },
  { key: "weight",    label: "Top Weight", unit: "kg", color: "hsl(270 70% 65%)" },
  { key: "volume",    label: "Volume",     unit: "kg", color: "hsl(217 91% 60%)" },
];

interface SessionPoint {
  date: number;
  label: string;
  intensity: number;
  weight: number;
  volume: number;
  reps: number;
  sets: WorkoutSet[];
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

// Build one point per session (oldest → newest) for the chosen exercise.
function buildPoints(sessions: WorkoutSession[], exerciseId: string): SessionPoint[] {
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
        intensity: Math.round(calcIntensity(done)),
        weight: topWeight(done),
        volume: done.reduce((sum, set) => sum + set.weight * (set.reps + (set.partialReps ?? 0) * 0.5), 0),
        reps: done.reduce((sum, set) => sum + set.reps, 0),
        sets: done,
      };
    })
    .filter((p) => p.sets.length > 0);
}

// ─── Simple Line Chart (one dot per session) ─────────────────────────────────

function LineChart({ points, metric }: { points: SessionPoint[]; metric: Metric }) {
  const cfg = METRICS.find((m) => m.key === metric)!;
  const W = 340, H = 200;
  const PAD = { top: 34, right: 22, bottom: 34, left: 42 };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;

  const values = points.map((p) => metricValue(p, metric));
  const maxVal = Math.max(...values, 1);
  const minVal = 0;
  const span = maxVal - minVal || 1;

  const cx = (i: number) => PAD.left + (i / Math.max(points.length - 1, 1)) * chartW;
  const cy = (v: number) => PAD.top + chartH - ((v - minVal) / span) * chartH;

  const line = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${cx(i)} ${cy(metricValue(p, metric))}`)
    .join(" ");
  const area = `${line} L ${cx(points.length - 1)} ${PAD.top + chartH} L ${cx(0)} ${PAD.top + chartH} Z`;

  // Horizontal gridlines with rounded value labels.
  const ticks = [0, 0.5, 1].map((t) => minVal + span * t);

  // Few points → label every one; many → thin them out so they never collide.
  const labelStep = points.length <= 6 ? 1 : Math.ceil(points.length / 5);
  // Only print the value above a point when there's room to do it cleanly.
  const showAllValues = points.length <= 6;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }}>
      <defs>
        <linearGradient id="area-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={cfg.color} stopOpacity="0.28" />
          <stop offset="100%" stopColor={cfg.color} stopOpacity="0" />
        </linearGradient>
      </defs>

      {ticks.map((t, i) => (
        <g key={i}>
          <line x1={PAD.left} y1={cy(t)} x2={PAD.left + chartW} y2={cy(t)}
            stroke="hsl(var(--border))" strokeWidth="1" strokeDasharray="2 5" opacity="0.7" />
          <text x={PAD.left - 8} y={cy(t) + 3.5} fontSize="10" textAnchor="end"
            fill="hsl(var(--muted-foreground))">{fmt(t)}</text>
        </g>
      ))}

      <path d={area} fill="url(#area-grad)" />
      <path d={line} fill="none" stroke={cfg.color} strokeWidth="3"
        strokeLinecap="round" strokeLinejoin="round" />

      {points.map((p, i) => {
        const x = cx(i), y = cy(metricValue(p, metric));
        const isLast = i === points.length - 1;
        const isFirst = i === 0;
        const showVal = showAllValues || isLast || isFirst;
        // Flip the value label below the dot if it would clip the top edge.
        const labelY = y - 12 < PAD.top ? y + 18 : y - 12;
        return (
          <g key={i}>
            <circle cx={x} cy={y} r={isLast ? 6 : 4}
              fill={isLast ? cfg.color : "hsl(var(--background))"}
              stroke={cfg.color} strokeWidth="2.5" />
            {showVal && (
              <text x={x} y={labelY} fontSize={isLast ? "12" : "10.5"}
                fontWeight={isLast ? "bold" : "600"} textAnchor="middle"
                fill={isLast ? cfg.color : "hsl(var(--foreground))"}>
                {fmt(metricValue(p, metric))}
              </text>
            )}
            {(isLast || isFirst || i % labelStep === 0) && (
              <text x={x} y={H - 8} fontSize="10" textAnchor="middle"
                fill={isLast ? cfg.color : "hsl(var(--muted-foreground))"}
                fontWeight={isLast ? "bold" : "normal"}>
                {p.label}
              </text>
            )}
          </g>
        );
      })}
    </svg>
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
  const filtered = query.trim()
    ? exercises.filter((e) => e.name.toLowerCase().includes(query.toLowerCase()))
    : exercises;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl border border-border bg-muted/30 text-left"
        data-testid="button-exercise-select"
      >
        <Search className="w-4 h-4 text-muted-foreground flex-shrink-0" />
        <span className="flex-1 text-sm font-medium truncate">
          {selected ? selected.name : "Choose an exercise"}
        </span>
        <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => { setOpen(false); setQuery(""); }} />
          <div className="absolute top-full left-0 right-0 mt-1 z-40 rounded-xl border border-border bg-card shadow-xl overflow-hidden">
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
              ) : (
                filtered.map((ex) => (
                  <button
                    key={ex.id}
                    onClick={() => { onSelect(ex.id); setOpen(false); setQuery(""); }}
                    className={`w-full flex items-center justify-between px-4 py-2.5 text-left text-sm hover:bg-muted/50 ${
                      ex.id === selectedId ? "text-primary font-semibold bg-primary/5" : ""
                    }`}
                    data-testid={`button-select-exercise-progress-${ex.id}`}
                  >
                    <span>{ex.name}</span>
                    {ex.muscleGroup && <span className="text-[11px] text-muted-foreground">{ex.muscleGroup}</span>}
                  </button>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Stat Card ───────────────────────────────────────────────────────────────

function StatCard({ icon, value, label }: { icon: React.ReactNode; value: string; label: string }) {
  return (
    <div className="rounded-xl bg-card border border-card-border px-3 py-3.5 flex flex-col items-center gap-1 text-center">
      <div className="text-muted-foreground">{icon}</div>
      <span className="text-xl font-bold leading-none">{value}</span>
      <span className="text-[10px] text-muted-foreground">{label}</span>
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
  const [sessions, setSessions] = useState<WorkoutSession[]>([]);
  const [pbs, setPbs] = useState<PersonalBest[]>([]);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [metric, setMetric] = useState<Metric>("volume");

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

  const sessionVolume = (s: WorkoutSession) =>
    s.exercises.reduce((t, ex) =>
      t + ex.sets.filter((set) => set.completed)
        .reduce((sum, set) => sum + set.weight * (set.reps + (set.partialReps ?? 0) * 0.5), 0), 0);

  const thisWeekCount = sessions.filter((s) => Date.now() - s.startedAt < 7 * 86400000).length;

  const streak = useMemo(() => {
    if (!sessions.length) return 0;
    const days = new Set(sessions.map((s) => { const d = new Date(s.startedAt); d.setHours(0, 0, 0, 0); return d.getTime(); }));
    let count = 0;
    const cur = new Date(); cur.setHours(0, 0, 0, 0);
    // Allow today to be a rest day without breaking the streak.
    if (!days.has(cur.getTime())) cur.setDate(cur.getDate() - 1);
    while (days.has(cur.getTime())) { count++; cur.setDate(cur.getDate() - 1); }
    return count;
  }, [sessions]);

  const points = useMemo(
    () => (selectedId ? buildPoints(sessions, selectedId) : []),
    [sessions, selectedId]
  );

  const selectedExercise = exercises.find((e) => e.id === selectedId);
  const last = points[points.length - 1] ?? null;
  const prev = points.length > 1 ? points[points.length - 2] : null;
  const delta = last && prev ? metricValue(last, metric) - metricValue(prev, metric) : null;
  const metricCfg = METRICS.find((m) => m.key === metric)!;

  // ── Empty state ──
  if (sessions.length === 0) {
    return (
      <div className="flex flex-col min-h-full pb-24">
        <Header />
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
      <Header />

      <div className="max-w-lg mx-auto w-full px-4 py-4 flex flex-col gap-4">
        {/* Headline stats */}
        <div className="grid grid-cols-3 gap-2.5">
          <StatCard icon={<Dumbbell className="w-4 h-4" />} value={`${sessions.length}`} label="Workouts" />
          <StatCard icon={<Flame className="w-4 h-4" />} value={`${streak}`} label="Day streak" />
          <StatCard icon={<TrendingUp className="w-4 h-4" />} value={`${thisWeekCount}`} label="This week" />
        </div>

        {/* Personal bests */}
        {pbs.length > 0 && (
          <div className="rounded-2xl bg-card border border-card-border overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-border/50">
              <Trophy className="w-4 h-4 text-accent" />
              <span className="font-semibold text-sm">Personal Bests</span>
            </div>
            <div className="divide-y divide-border/30">
              {pbs.slice(0, 6).map((pb) => (
                <div key={pb.exerciseId} className="flex items-center justify-between px-4 py-2.5" data-testid={`row-pb-${pb.exerciseId}`}>
                  <span className="text-sm font-medium truncate pr-2">{pb.exerciseName}</span>
                  <span className="text-sm font-bold font-mono whitespace-nowrap">
                    {pb.weight > 0 ? `${pb.weight}kg` : "BW"} × {pb.reps}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Exercise progress */}
        <div className="rounded-2xl bg-card border border-card-border overflow-hidden">
          <div className="px-4 pt-4 pb-3">
            <h2 className="text-sm font-semibold mb-3">Track an exercise</h2>
            <ExerciseSelector exercises={loggedExercises} selectedId={selectedId} onSelect={setSelectedId} />
          </div>

          {selectedExercise && points.length > 0 ? (
            <div className="px-4 pb-4 flex flex-col gap-4">
              {/* Last session — intensity & top weight at a glance */}
              {last && (
                <div className="rounded-xl border border-border/60 bg-muted/20 overflow-hidden">
                  <div className="px-3 py-2 border-b border-border/40 flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Last session</span>
                    <span className="text-[11px] text-muted-foreground">{formatDate(last.date)}</span>
                  </div>
                  <div className="grid grid-cols-2 divide-x divide-border/40">
                    <LastStat
                      label="Intensity" value={fmt(last.intensity)}
                      color="hsl(38 95% 55%)"
                      delta={prev ? last.intensity - prev.intensity : null}
                    />
                    <LastStat
                      label="Top Weight" value={`${fmt(last.weight)}`} unit="kg"
                      color="hsl(270 70% 65%)"
                      delta={prev ? last.weight - prev.weight : null}
                    />
                  </div>
                </div>
              )}

              {/* Trend label + change vs previous */}
              <div className="flex items-end justify-between">
                <div>
                  <p className="text-[11px] text-muted-foreground uppercase tracking-wider">{metricCfg.label} trend</p>
                  <p className="text-2xl font-bold leading-tight" style={{ color: metricCfg.color }}>
                    {fmt(metricValue(last!, metric))}
                    <span className="text-sm font-normal text-muted-foreground ml-1">{metricCfg.unit}</span>
                  </p>
                </div>
                {delta !== null && delta !== 0 && (
                  <div className={`flex items-center gap-1 text-sm font-bold ${delta > 0 ? "text-green-500" : "text-destructive"}`}>
                    {delta > 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                    {delta > 0 ? "+" : ""}{fmt(delta)} {metricCfg.unit}
                  </div>
                )}
              </div>

              {/* Metric toggle */}
              <div className="flex gap-1 p-1 rounded-xl bg-muted/50">
                {METRICS.map((m) => (
                  <button
                    key={m.key}
                    onClick={() => setMetric(m.key)}
                    className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${
                      metric === m.key ? "bg-background shadow-sm text-foreground" : "text-muted-foreground"
                    }`}
                    data-testid={`button-metric-${m.key}`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>

              {/* Chart */}
              {points.length >= 2 ? (
                <LineChart points={points} metric={metric} />
              ) : (
                <p className="text-center text-sm text-muted-foreground py-8">
                  One session logged — train this again to see your trend.
                </p>
              )}

              {/* Session history (the actual progress made) */}
              <div>
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                  Recent sessions
                </p>
                <div className="flex flex-col gap-2">
                  {points.slice().reverse().map((p) => (
                    <div key={p.date} className="rounded-xl border border-border/60 bg-muted/20 px-3 py-2.5">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs font-semibold">{formatDate(p.date)}</span>
                        <span className="text-[11px] text-muted-foreground font-mono">{fmt(p.volume)} kg vol</span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {p.sets.map((set, i) => (
                          <span key={i} className="text-[11px] font-mono bg-card border border-border/50 px-2 py-0.5 rounded-full">
                            {set.weight > 0 ? `${set.weight}kg` : "BW"} × {set.reps}
                            {(set.partialReps ?? 0) > 0 && <span className="text-orange-400">+{set.partialReps}p</span>}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-10 px-4">
              <p className="text-sm text-muted-foreground">
                {loggedExercises.length === 0
                  ? "Log a workout to start tracking exercises."
                  : "Pick an exercise above to see your progress."}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Header() {
  return (
    <div className="sticky top-0 z-40 bg-background/95 backdrop-blur-md border-b border-border">
      <div className="max-w-lg mx-auto px-4 py-4">
        <h1 className="text-xl font-bold tracking-tight">Progress</h1>
        <p className="text-xs text-muted-foreground mt-0.5">Every session, your strength journey</p>
      </div>
    </div>
  );
}
