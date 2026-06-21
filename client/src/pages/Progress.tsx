import { useState, useEffect, useMemo } from "react";
import {
  TrendingUp, TrendingDown, Trophy,
  Search, X, ChevronDown, BarChart2,
  CalendarDays, ChevronLeft, ChevronRight,
} from "lucide-react";
import {
  getSessions, getPersonalBests, getExercises,
} from "@/lib/storage";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import type { WorkoutSession, PersonalBest, Exercise, WorkoutSet } from "@/lib/types";
import { formatDate, calcIntensity, topWeight } from "@/lib/hooks";

// ─── Metrics ────────────────────────────────────────────────────────────────

type Metric = "intensity" | "weight" | "volume";

// Single accent across every metric — minimal, monochrome + one blue.
const ACCENT = "hsl(214 94% 60%)";
const METRICS: { key: Metric; label: string; unit: string; color: string }[] = [
  { key: "intensity", label: "Intensity",  unit: "",   color: ACCENT },
  { key: "weight",    label: "Top Weight", unit: "kg", color: ACCENT },
  { key: "volume",    label: "Volume",     unit: "kg", color: ACCENT },
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
  const [metric, setMetric] = useState<Metric>("intensity");
  const [pbOpen, setPbOpen] = useState(false);
  const [calOpen, setCalOpen] = useState(false);

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

  const selectedExercise = exercises.find((e) => e.id === selectedId);
  const last = points[points.length - 1] ?? null;
  const prev = points.length > 1 ? points[points.length - 2] : null;
  const delta = last && prev ? metricValue(last, metric) - metricValue(prev, metric) : null;
  const metricCfg = METRICS.find((m) => m.key === metric)!;

  // ── Empty state ──
  if (sessions.length === 0) {
    return (
      <div className="flex flex-col min-h-full pb-24">
        <Header onCalClick={() => setCalOpen(true)} />
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
      <Header onCalClick={() => setCalOpen(true)} />
      <CalendarModal open={calOpen} onClose={() => setCalOpen(false)} sessions={sessions} />

      <div className="max-w-lg mx-auto w-full px-4 py-4 flex flex-col gap-5">
        {/* Exercise picker — drives the whole page */}
        <ExerciseSelector exercises={loggedExercises} selectedId={selectedId} onSelect={setSelectedId} />

        {/* ── HERO: the graph is the main event ── */}
        {selectedExercise && points.length > 0 ? (
          <div
            className="rounded-3xl border border-card-border overflow-hidden shadow-xl shadow-black/20"
            style={{ background: `linear-gradient(180deg, ${metricCfg.color}1f, hsl(var(--card)) 42%)` }}
          >
            {/* Title + headline value */}
            <div className="px-5 pt-5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h2 className="text-lg font-bold truncate">{selectedExercise.name}</h2>
                  <p className="text-[11px] text-muted-foreground uppercase tracking-wider mt-0.5">
                    {metricCfg.label} · last {points.length} session{points.length !== 1 ? "s" : ""}
                  </p>
                </div>
                {delta !== null && delta !== 0 && (
                  <div className={`flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full flex-shrink-0 ${
                    delta > 0 ? "bg-green-500/15 text-green-500" : "bg-destructive/15 text-destructive"
                  }`}>
                    {delta > 0 ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                    {delta > 0 ? "+" : ""}{fmt(delta)}
                  </div>
                )}
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-4xl font-bold tracking-tight" style={{ color: metricCfg.color }}>
                  {fmt(metricValue(last!, metric))}
                </span>
                <span className="text-sm text-muted-foreground">{metricCfg.unit || metricCfg.label.toLowerCase()}</span>
              </div>
            </div>

            {/* Metric toggle */}
            <div className="px-5 mt-4">
              <div className="flex gap-1 p-1 rounded-xl bg-background/50 backdrop-blur">
                {METRICS.map((m) => (
                  <button
                    key={m.key}
                    onClick={() => setMetric(m.key)}
                    className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${
                      metric === m.key ? "bg-card shadow text-foreground" : "text-muted-foreground"
                    }`}
                    data-testid={`button-metric-${m.key}`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            {/* The chart */}
            <div className="px-3 pt-4 pb-1">
              {points.length >= 2 ? (
                <LineChart points={points} metric={metric} />
              ) : (
                <p className="text-center text-sm text-muted-foreground py-10">
                  One session logged — train this again to see your trend.
                </p>
              )}
            </div>

            {/* Last session: intensity & top weight */}
            {last && (
              <div className="mx-5 mb-5 mt-2 rounded-2xl border border-border/50 bg-background/40 overflow-hidden">
                <div className="px-4 py-2 flex items-center justify-between border-b border-border/40">
                  <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Last session</span>
                  <span className="text-[11px] text-muted-foreground">{formatDate(last.date)}</span>
                </div>
                <div className="grid grid-cols-2 divide-x divide-border/40">
                  <LastStat label="Intensity" value={fmt(last.intensity)} color={ACCENT}
                    delta={prev ? last.intensity - prev.intensity : null} />
                  <LastStat label="Top Weight" value={fmt(last.weight)} unit="kg" color="hsl(var(--foreground))"
                    delta={prev ? last.weight - prev.weight : null} />
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-3xl border border-card-border bg-card text-center py-16 px-4">
            <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
              <BarChart2 className="w-7 h-7 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">
              {loggedExercises.length === 0
                ? "Log a workout to start tracking exercises."
                : "Pick an exercise above to see your progress."}
            </p>
          </div>
        )}

        {/* Recent sessions — the actual progress made */}
        {selectedExercise && points.length > 0 && (
          <div>
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-1">
              Recent sessions
            </p>
            <div className="flex flex-col gap-2">
              {points.slice().reverse().map((p) => (
                <div key={p.date} className="rounded-xl border border-border/60 bg-card px-3 py-2.5">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-semibold">{formatDate(p.date)}</span>
                    <span className="text-[11px] text-muted-foreground font-mono">{fmt(p.volume)} kg vol</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {p.sets.map((set, i) => (
                      <span key={i} className="text-[11px] font-mono bg-muted/40 border border-border/50 px-2 py-0.5 rounded-full">
                        {set.weight > 0 ? `${set.weight}kg` : "BW"} × {set.reps}
                        {(set.partialReps ?? 0) > 0 && <span className="text-orange-400">+{set.partialReps}p</span>}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Personal Bests — collapsed by default */}
        {pbs.length > 0 && (
          <div className="rounded-2xl bg-card border border-card-border overflow-hidden">
            <button
              onClick={() => setPbOpen((o) => !o)}
              className="w-full flex items-center justify-between px-4 py-3.5"
              data-testid="button-toggle-pbs"
            >
              <div className="flex items-center gap-2">
                <Trophy className="w-4 h-4 text-accent" />
                <span className="font-semibold text-sm">Personal Bests</span>
                <span className="text-[10px] font-semibold bg-muted text-muted-foreground rounded-full px-1.5 py-0.5">{pbs.length}</span>
              </div>
              <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${pbOpen ? "rotate-180" : ""}`} />
            </button>
            {pbOpen && (
              <div className="divide-y divide-border/30 border-t border-border/50">
                {pbs.map((pb) => (
                  <div key={pb.exerciseId} className="flex items-center justify-between px-4 py-2.5" data-testid={`row-pb-${pb.exerciseId}`}>
                    <span className="text-sm font-medium truncate pr-2">{pb.exerciseName}</span>
                    <span className="text-sm font-bold font-mono whitespace-nowrap">
                      {pb.weight > 0 ? `${pb.weight}kg` : "BW"} × {pb.reps}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Header({ onCalClick }: { onCalClick: () => void }) {
  return (
    <div className="sticky top-0 z-40 bg-background/95 backdrop-blur-md border-b border-border">
      <div className="max-w-lg mx-auto px-4 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Progress</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Every session, your strength journey</p>
        </div>
        <button
          onClick={onCalClick}
          className="w-9 h-9 rounded-xl flex items-center justify-center bg-muted/60 border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          title="Gym calendar"
        >
          <CalendarDays className="w-4.5 h-4.5" />
        </button>
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

  return (
    <Dialog open={open} onOpenChange={onClose}>
      {/* [&>button]:hidden removes the default DialogContent X close button */}
      <DialogContent className="max-w-sm mx-4 p-0 overflow-hidden gap-0 [&>button]:hidden">
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
                <div className="flex flex-col gap-1">
                  {s.exercises.map((ex) => {
                    const done = ex.sets.filter((set) => set.completed);
                    if (done.length === 0) return null;
                    const TYPE_SHORT: Record<string, string> = { normal: "N", assisted: "A", failure: "F" };
                    return (
                      <div key={ex.id} className="text-xs">
                        <span className="font-medium">{ex.exerciseName}: </span>
                        <span className="text-muted-foreground font-mono">
                          {done.slice(0, 3).map((set) => {
                            const base = `${set.weight > 0 ? set.weight + "kg" : "BW"}×${set.reps}`;
                            const typeTag = ` (${TYPE_SHORT[set.type] ?? "N"})`;
                            const partial = (set.partialReps ?? 0) > 0 ? ` +${set.partialReps}p` : "";
                            return base + typeTag + partial;
                          }).join(", ")}
                          {done.length > 3 ? ` +${done.length - 3}` : ""}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
