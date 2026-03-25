import { useState, useEffect } from "react";
import { TrendingUp, TrendingDown, Trophy, Activity, Zap, Dumbbell, BarChart2, ChevronDown, ChevronUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { getSessions, getPersonalBests, getExercises } from "@/lib/storage";
import type { WorkoutSession, PersonalBest, Exercise } from "@/lib/types";
import { formatDate, formatDuration } from "@/lib/hooks";

export default function Progress() {
  const [sessions, setSessions] = useState<WorkoutSession[]>([]);
  const [pbs, setPbs] = useState<PersonalBest[]>([]);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [selectedExerciseId, setSelectedExerciseId] = useState<string | null>(null);
  const [expandedPb, setExpandedPb] = useState(false);

  useEffect(() => {
    setSessions(getSessions());
    setPbs(getPersonalBests());
    setExercises(getExercises());
  }, []);

  const getVolume = (session: WorkoutSession) =>
    session.exercises.reduce(
      (total, ex) =>
        total +
        ex.sets
          .filter((s) => s.completed)
          .reduce((sum, s) => sum + s.weight * (s.reps + s.partialReps * 0.5), 0),
      0
    );

  // Last 7 sessions volume
  const last7 = sessions.slice(0, 7).reverse();
  const maxVolume = Math.max(...last7.map(getVolume), 1);

  // Streak calculation
  const streak = (() => {
    if (sessions.length === 0) return 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let count = 0;
    let current = today.getTime();
    for (const s of sessions) {
      const d = new Date(s.startedAt);
      d.setHours(0, 0, 0, 0);
      if (d.getTime() >= current - 86400000) {
        count++;
        current = d.getTime();
      } else break;
    }
    return count;
  })();

  // Per-exercise chart data
  const selectedExercise = selectedExerciseId
    ? exercises.find((e) => e.id === selectedExerciseId)
    : null;

  const exerciseHistory = selectedExerciseId
    ? sessions
        .filter((s) => s.exercises.some((e) => e.exerciseId === selectedExerciseId))
        .slice(0, 10)
        .reverse()
        .map((s) => {
          const ex = s.exercises.find((e) => e.exerciseId === selectedExerciseId)!;
          const completedSets = ex.sets.filter((s) => s.completed);
          const maxWeight = Math.max(...completedSets.map((s) => s.weight), 0);
          const totalVol = completedSets.reduce(
            (sum, s) => sum + s.weight * (s.reps + s.partialReps * 0.5),
            0
          );
          return { date: s.startedAt, maxWeight, volume: totalVol };
        })
    : [];

  const maxHistoryVol = Math.max(...exerciseHistory.map((h) => h.volume), 1);
  const maxHistoryWeight = Math.max(...exerciseHistory.map((h) => h.maxWeight), 1);

  // Exercises with history
  const exercisesWithHistory = exercises.filter((ex) =>
    sessions.some((s) => s.exercises.some((e) => e.exerciseId === ex.id))
  );

  // Weekly volume trend
  const thisWeekVolume = sessions
    .filter((s) => Date.now() - s.startedAt < 7 * 86400000)
    .reduce((sum, s) => sum + getVolume(s), 0);
  const lastWeekVolume = sessions
    .filter((s) => {
      const age = Date.now() - s.startedAt;
      return age >= 7 * 86400000 && age < 14 * 86400000;
    })
    .reduce((sum, s) => sum + getVolume(s), 0);
  const weeklyChange = lastWeekVolume > 0 ? ((thisWeekVolume - lastWeekVolume) / lastWeekVolume) * 100 : null;

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
                  <Activity className="w-3.5 h-3.5" />
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

            {/* Volume chart (last 7 sessions) */}
            {last7.length > 1 && (
              <div className="rounded-xl bg-card border border-card-border p-4">
                <h2 className="text-sm font-semibold mb-4">Recent Volume</h2>
                <div className="flex items-end gap-1.5 h-24">
                  {last7.map((session, i) => {
                    const vol = getVolume(session);
                    const height = Math.max(4, (vol / maxVolume) * 96);
                    return (
                      <div key={session.id} className="flex-1 flex flex-col items-center gap-1">
                        <div
                          className="w-full rounded-t-sm bg-primary/70 transition-all"
                          style={{ height: `${height}px` }}
                        />
                        <span className="text-[9px] text-muted-foreground truncate w-full text-center">
                          {new Date(session.startedAt).toLocaleDateString("en-US", { weekday: "short" })}
                        </span>
                      </div>
                    );
                  })}
                </div>
                <p className="text-[11px] text-muted-foreground mt-2 text-center">
                  Last {last7.length} sessions · Max: {maxVolume.toFixed(0)} kg
                </p>
              </div>
            )}

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
                          <p className="font-bold text-sm font-mono">
                            {pb.weight}kg × {pb.reps}
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            {pb.volume.toFixed(0)} kg vol
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Exercise progress selector */}
            {exercisesWithHistory.length > 0 && (
              <div className="rounded-xl bg-card border border-card-border p-4">
                <h2 className="text-sm font-semibold mb-3">Exercise Progress</h2>
                <div className="flex gap-2 overflow-x-auto pb-2 mb-4">
                  {exercisesWithHistory.slice(0, 8).map((ex) => (
                    <button
                      key={ex.id}
                      onClick={() => setSelectedExerciseId(ex.id === selectedExerciseId ? null : ex.id)}
                      className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                        selectedExerciseId === ex.id
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground"
                      }`}
                      data-testid={`button-select-exercise-progress-${ex.id}`}
                    >
                      {ex.name}
                    </button>
                  ))}
                </div>

                {selectedExercise && exerciseHistory.length > 0 ? (
                  <div>
                    <p className="text-xs text-muted-foreground mb-3">
                      {selectedExercise.name} · last {exerciseHistory.length} sessions
                    </p>

                    {/* Weight chart */}
                    <div className="mb-4">
                      <p className="text-[11px] font-medium text-muted-foreground mb-2 uppercase tracking-wider">Max Weight (kg)</p>
                      <div className="flex items-end gap-1.5 h-20">
                        {exerciseHistory.map((h, i) => {
                          const height = Math.max(4, (h.maxWeight / maxHistoryWeight) * 80);
                          const isLast = i === exerciseHistory.length - 1;
                          return (
                            <div key={i} className="flex-1 flex flex-col items-center gap-1">
                              <div
                                className={`w-full rounded-t-sm transition-all ${isLast ? "bg-primary" : "bg-primary/40"}`}
                                style={{ height: `${height}px` }}
                              />
                              <span className="text-[8px] text-muted-foreground">
                                {new Date(h.date).getDate()}/{new Date(h.date).getMonth() + 1}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Comparison with prev session */}
                    {exerciseHistory.length >= 2 && (() => {
                      const last = exerciseHistory[exerciseHistory.length - 1];
                      const prev = exerciseHistory[exerciseHistory.length - 2];
                      const weightDiff = last.maxWeight - prev.maxWeight;
                      const volDiff = last.volume - prev.volume;
                      return (
                        <div
                          className="rounded-lg px-3 py-3 flex items-center gap-4"
                          style={{ background: "hsl(var(--muted) / 0.5)" }}
                        >
                          <div className="flex-1">
                            <p className="text-[11px] text-muted-foreground">vs last session</p>
                            <div className="flex items-center gap-1 mt-0.5">
                              {weightDiff >= 0 ? (
                                <TrendingUp className="w-4 h-4 text-green-500" />
                              ) : (
                                <TrendingDown className="w-4 h-4 text-destructive" />
                              )}
                              <span className={`text-sm font-bold ${weightDiff >= 0 ? "text-green-500" : "text-destructive"}`}>
                                {weightDiff >= 0 ? "+" : ""}{weightDiff}kg weight
                              </span>
                            </div>
                          </div>
                          <div className="flex-1">
                            <p className="text-[11px] text-muted-foreground">volume</p>
                            <div className="flex items-center gap-1 mt-0.5">
                              {volDiff >= 0 ? (
                                <TrendingUp className="w-4 h-4 text-green-500" />
                              ) : (
                                <TrendingDown className="w-4 h-4 text-destructive" />
                              )}
                              <span className={`text-sm font-bold ${volDiff >= 0 ? "text-green-500" : "text-destructive"}`}>
                                {volDiff >= 0 ? "+" : ""}{volDiff.toFixed(0)}kg
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })()}

                    {/* Recommendation */}
                    {exerciseHistory.length >= 2 && (() => {
                      const last = exerciseHistory[exerciseHistory.length - 1];
                      const prev = exerciseHistory[exerciseHistory.length - 2];
                      const didIncrease = last.maxWeight > prev.maxWeight || last.volume > prev.volume;
                      return (
                        <div
                          className="mt-3 rounded-lg px-3 py-3"
                          style={{
                            background: didIncrease
                              ? "hsl(142 72% 45% / 0.10)"
                              : "hsl(217 91% 60% / 0.10)",
                            border: `1px solid ${didIncrease ? "hsl(142 72% 45% / 0.20)" : "hsl(217 91% 60% / 0.20)"}`,
                          }}
                        >
                          <p className="text-[11px] font-semibold uppercase tracking-wider mb-1"
                            style={{ color: didIncrease ? "hsl(142 72% 45%)" : "hsl(217 91% 60%)" }}>
                            Recommendation
                          </p>
                          {didIncrease ? (
                            <p className="text-sm font-medium">
                              Great progress! Try adding +2.5kg next session or aim for 1-2 more reps.
                            </p>
                          ) : (
                            <p className="text-sm font-medium">
                              Keep the same weight and focus on {last.maxWeight > 0 ? "adding 1-2 more reps" : "improving form"} before increasing.
                            </p>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                ) : selectedExerciseId && exerciseHistory.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">No data for this exercise yet</p>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-4">Select an exercise to see progress</p>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
