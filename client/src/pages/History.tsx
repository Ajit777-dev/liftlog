import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Calendar, Clock, Dumbbell, TrendingUp, Trash2, ChevronRight, ChevronDown, Trophy, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle
} from "@/components/ui/alert-dialog";
import { getSessions, deleteSession } from "@/lib/storage";
import type { WorkoutSession } from "@/lib/types";
import { formatDate, formatDuration } from "@/lib/hooks";

export default function History() {
  const [, navigate] = useLocation();
  const [sessions, setSessions] = useState<WorkoutSession[]>([]);
  const [expandedSession, setExpandedSession] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  useEffect(() => {
    setSessions(getSessions());
  }, []);

  const refresh = () => setSessions(getSessions());

  const handleDelete = () => {
    if (!deleteId) return;
    deleteSession(deleteId);
    setDeleteId(null);
    refresh();
  };

  const getSessionVolume = (session: WorkoutSession) =>
    session.exercises.reduce(
      (total, ex) =>
        total +
        ex.sets
          .filter((s) => s.completed)
          .reduce((sum, s) => sum + s.weight * (s.reps + s.partialReps * 0.5), 0),
      0
    );

  const getSessionSets = (session: WorkoutSession) =>
    session.exercises.reduce((total, ex) => total + ex.sets.filter((s) => s.completed).length, 0);

  // Group sessions by month
  const grouped = sessions.reduce<Record<string, WorkoutSession[]>>((acc, session) => {
    const key = new Date(session.startedAt).toLocaleDateString("en-US", {
      month: "long",
      year: "numeric",
    });
    if (!acc[key]) acc[key] = [];
    acc[key].push(session);
    return acc;
  }, {});

  const totalWorkouts = sessions.length;
  const totalVolume = sessions.reduce((sum, s) => sum + getSessionVolume(s), 0);
  const totalSets = sessions.reduce((sum, s) => sum + getSessionSets(s), 0);
  const avgDuration =
    sessions.filter((s) => s.durationSeconds).reduce((sum, s) => sum + (s.durationSeconds ?? 0), 0) /
    (sessions.filter((s) => s.durationSeconds).length || 1);

  return (
    <div className="flex flex-col min-h-full pb-20">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-background/95 backdrop-blur-md border-b border-border">
        <div className="max-w-lg mx-auto px-4 py-4">
          <h1 className="text-xl font-bold tracking-tight">History</h1>
          <p className="text-xs text-muted-foreground mt-0.5">{totalWorkouts} workouts logged</p>
        </div>
      </div>

      <div className="max-w-lg mx-auto w-full px-4 py-4 flex flex-col gap-5">
        {/* Stats summary */}
        {sessions.length > 0 && (
          <div className="grid grid-cols-2 gap-3">
            <StatCard icon={<Dumbbell className="w-4 h-4" />} label="Total Workouts" value={totalWorkouts.toString()} />
            <StatCard
              icon={<Zap className="w-4 h-4" />}
              label="Total Volume"
              value={totalVolume >= 1000 ? `${(totalVolume / 1000).toFixed(1)}k kg` : `${totalVolume.toFixed(0)} kg`}
            />
            <StatCard icon={<TrendingUp className="w-4 h-4" />} label="Total Sets" value={totalSets.toString()} />
            <StatCard
              icon={<Clock className="w-4 h-4" />}
              label="Avg Duration"
              value={avgDuration > 0 ? formatDuration(Math.round(avgDuration)) : "—"}
            />
          </div>
        )}

        {/* Session list */}
        {sessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-4">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
              <Calendar className="w-8 h-8 text-muted-foreground" />
            </div>
            <div className="text-center">
              <p className="font-semibold">No workouts yet</p>
              <p className="text-sm text-muted-foreground mt-1">Complete a session to see it here</p>
            </div>
            <Button size="sm" onClick={() => navigate("/")} data-testid="button-go-workout">
              Start a workout
            </Button>
          </div>
        ) : (
          Object.entries(grouped).map(([month, monthSessions]) => (
            <div key={month}>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 px-1">
                {month}
              </h2>
              <div className="flex flex-col gap-2">
                {monthSessions.map((session) => {
                  const volume = getSessionVolume(session);
                  const sets = getSessionSets(session);
                  const expanded = expandedSession === session.id;

                  return (
                    <div
                      key={session.id}
                      className="rounded-xl border border-card-border bg-card overflow-hidden"
                      data-testid={`card-session-${session.id}`}
                    >
                      <button
                        className="w-full px-4 py-3.5 flex items-center gap-3 text-left"
                        onClick={() => setExpandedSession(expanded ? null : session.id)}
                        data-testid={`button-expand-session-${session.id}`}
                      >
                        <div
                          className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                          style={{ background: "hsl(217 91% 55% / 0.12)" }}
                        >
                          <Dumbbell className="w-5 h-5 text-primary" />
                        </div>

                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-sm truncate">{session.templateName}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-xs text-muted-foreground">{formatDate(session.startedAt)}</span>
                            {session.durationSeconds && (
                              <>
                                <span className="text-muted-foreground/40">·</span>
                                <span className="text-xs text-muted-foreground">{formatDuration(session.durationSeconds)}</span>
                              </>
                            )}
                          </div>
                        </div>

                        <div className="flex flex-col items-end gap-0.5">
                          <span className="text-sm font-bold">
                            {volume >= 1000 ? `${(volume / 1000).toFixed(1)}k` : volume.toFixed(0)} kg
                          </span>
                          <span className="text-[11px] text-muted-foreground">{sets} sets</span>
                        </div>

                        <div className="ml-1">
                          {expanded ? (
                            <ChevronDown className="w-4 h-4 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="w-4 h-4 text-muted-foreground" />
                          )}
                        </div>
                      </button>

                      {expanded && (
                        <div className="px-4 pb-4 flex flex-col gap-3 border-t border-border/50 pt-3 animate-fade-in">
                          {session.exercises.map((ex) => {
                            const completedSets = ex.sets.filter((s) => s.completed);
                            if (completedSets.length === 0) return null;
                            return (
                              <div key={ex.id}>
                                <div className="flex items-center gap-2 mb-1.5">
                                  <span className="text-sm font-semibold">{ex.exerciseName}</span>
                                  {ex.muscleGroup && (
                                    <Badge variant="secondary" className="text-[10px]">{ex.muscleGroup}</Badge>
                                  )}
                                </div>
                                <div className="flex flex-col gap-1">
                                  {completedSets.map((s, i) => (
                                    <div
                                      key={s.id}
                                      className="flex items-center gap-2 text-sm"
                                    >
                                      <span className="text-xs text-muted-foreground w-12">Set {i + 1}</span>
                                      <span className="font-mono font-semibold text-sm">
                                        {s.weight > 0 ? `${s.weight}kg` : "BW"} × {s.reps}
                                        {s.partialReps > 0 && <span className="text-muted-foreground text-xs">+{s.partialReps}p</span>}
                                      </span>
                                      {s.type !== "normal" && (
                                        <Badge
                                          variant="secondary"
                                          className={`text-[9px] ${s.type === "failure" ? "bg-destructive/15 text-destructive" : "bg-blue-500/15 text-blue-500"}`}
                                        >
                                          {s.type}
                                        </Badge>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            );
                          })}

                          <Button
                            variant="outline"
                            size="sm"
                            className="text-destructive w-full mt-1 gap-1.5"
                            onClick={() => setDeleteId(session.id)}
                            data-testid={`button-delete-session-${session.id}`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            Delete Workout
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete workout?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. The workout will be permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground"
              data-testid="button-confirm-delete-session"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-card-border bg-card px-4 py-3.5 flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        {icon}
        <span className="text-xs font-medium">{label}</span>
      </div>
      <span className="text-2xl font-bold tracking-tight">{value}</span>
    </div>
  );
}
