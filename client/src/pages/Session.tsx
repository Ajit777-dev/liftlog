import { useState, useEffect, useCallback, useRef } from "react";
import { useLocation, useParams } from "wouter";
import { nanoid } from "nanoid";
import {
  X, Plus, Check, ChevronDown, ChevronUp, Timer, Zap,
  TrendingUp, TrendingDown, Minus, AlertTriangle, Activity,
  ArrowLeft, Trophy, Clock
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  getTemplate, getActiveSession, saveActiveSession, clearActiveSession,
  saveSession, getLastSessionDataForExercise, getExercises, addExerciseToTemplate
} from "@/lib/storage";
import type { WorkoutSession, SessionExercise, WorkoutSet, SetType, SessionCardio, CardioEntry, WorkoutTemplate } from "@/lib/types";
import { useTimer, useRestTimer, formatDuration, formatDate } from "@/lib/hooks";

export default function Session() {
  const params = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const templateId = params.id;

  const [template, setTemplate] = useState<WorkoutTemplate | null>(null);
  const [session, setSession] = useState<WorkoutSession | null>(null);
  const [expandedExercises, setExpandedExercises] = useState<Set<string>>(new Set());
  const [expandedCardio, setExpandedCardio] = useState<Set<string>>(new Set());
  const [showFinishDialog, setShowFinishDialog] = useState(false);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [showAddExercise, setShowAddExercise] = useState(false);
  const [showAddCardio, setShowAddCardio] = useState(false);
  const [restTimerTarget, setRestTimerTarget] = useState(90);
  const { restSeconds, isResting, startRest, stopRest } = useRestTimer();

  const elapsed = useTimer(!!session && !session.finishedAt, session?.startedAt ?? 0);

  useEffect(() => {
    const tmpl = getTemplate(templateId);
    if (!tmpl) { navigate("/"); return; }
    setTemplate(tmpl);

    const existing = getActiveSession();
    if (existing && existing.templateId === templateId) {
      setSession({ ...existing, cardio: existing.cardio || [] });
      if (existing.exercises.length > 0) {
        setExpandedExercises(new Set([existing.exercises[0].id]));
      }
    } else {
      const newSession: WorkoutSession = {
        id: nanoid(),
        templateId,
        templateName: tmpl.name,
        startedAt: Date.now(),
        exercises: tmpl.exercises
          .sort((a, b) => a.order - b.order)
          .map((te) => ({
            id: nanoid(),
            exerciseId: te.exerciseId,
            exerciseName: te.exerciseName,
            muscleGroup: te.muscleGroup,
            sets: Array.from({ length: te.defaultSets }, () => ({
              id: nanoid(),
              weight: 0,
              reps: 0,
              partialReps: 0,
              type: "normal" as SetType,
              completed: false,
            })),
          })),
        cardio: [],
      };
      setSession(newSession);
      saveActiveSession(newSession);
      if (newSession.exercises.length > 0) {
        setExpandedExercises(new Set([newSession.exercises[0].id]));
      }
    }
  }, [templateId]);

  const updateSession = useCallback((updater: (s: WorkoutSession) => WorkoutSession) => {
    setSession((prev) => {
      if (!prev) return prev;
      const next = updater(prev);
      saveActiveSession(next);
      return next;
    });
  }, []);

  const updateSet = useCallback(
    (exerciseId: string, setId: string, updates: Partial<WorkoutSet>) => {
      updateSession((s) => ({
        ...s,
        exercises: s.exercises.map((ex) =>
          ex.id !== exerciseId
            ? ex
            : {
                ...ex,
                sets: ex.sets.map((set) =>
                  set.id !== setId ? set : { ...set, ...updates }
                ),
              }
        ),
      }));
    },
    [updateSession]
  );

  const addSet = useCallback(
    (exerciseId: string) => {
      updateSession((s) => ({
        ...s,
        exercises: s.exercises.map((ex) => {
          if (ex.id !== exerciseId) return ex;
          const lastSet = ex.sets[ex.sets.length - 1];
          const newSet: WorkoutSet = {
            id: nanoid(),
            weight: lastSet?.weight ?? 0,
            reps: lastSet?.reps ?? 0,
            partialReps: 0,
            type: "normal",
            completed: false,
          };
          return { ...ex, sets: [...ex.sets, newSet] };
        }),
      }));
    },
    [updateSession]
  );

  const removeSet = useCallback(
    (exerciseId: string, setId: string) => {
      updateSession((s) => ({
        ...s,
        exercises: s.exercises.map((ex) =>
          ex.id !== exerciseId
            ? ex
            : { ...ex, sets: ex.sets.filter((set) => set.id !== setId) }
        ),
      }));
    },
    [updateSession]
  );

  const toggleComplete = useCallback(
    (exerciseId: string, setId: string, currentSet: WorkoutSet) => {
      const completed = !currentSet.completed;
      updateSet(exerciseId, setId, { completed });
      if (completed) startRest(restTimerTarget);
    },
    [updateSet, startRest, restTimerTarget]
  );

  const completeExercise = useCallback((exerciseId: string) => {
    updateSession((s) => ({
      ...s,
      exercises: s.exercises.map((ex) =>
        ex.id !== exerciseId
          ? ex
          : {
              ...ex,
              sets: ex.sets.map((set) =>
                set.reps > 0 || set.weight > 0 ? { ...set, completed: true } : set
              ),
            }
      ),
    }));
  }, [updateSession]);

  const finishWorkout = () => {
    if (!session) return;
    const finished: WorkoutSession = {
      ...session,
      finishedAt: Date.now(),
      durationSeconds: elapsed,
    };
    saveSession(finished);
    clearActiveSession();
    navigate("/history");
  };

  const cancelWorkout = () => {
    navigate("/");
  };

  const getTotalVolume = () => {
    if (!session) return 0;
    return session.exercises.reduce(
      (total, ex) =>
        total +
        ex.sets
          .filter((s) => s.completed)
          .reduce((sum, s) => sum + s.weight * (s.reps + s.partialReps * 0.5), 0),
      0
    );
  };

  const getCompletedSets = () => {
    if (!session) return 0;
    return session.exercises.reduce(
      (total, ex) => total + ex.sets.filter((s) => s.completed).length,
      0
    );
  };

  const toggleExpand = (id: string) => {
    setExpandedExercises((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleCardioExpand = (id: string) => {
    setExpandedCardio((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const addCardioExercise = (exerciseId: string, exerciseName: string, muscleGroup?: string) => {
    updateSession((s) => ({
      ...s,
      cardio: [
        ...s.cardio,
        {
          id: nanoid(),
          exerciseId,
          exerciseName,
          muscleGroup,
          entries: [{
            id: nanoid(),
            timeMinutes: 0,
            timeSeconds: 0,
            completed: false,
          }],
        },
      ],
    }));
  };

  const updateCardioEntry = (cardioId: string, entryId: string, updates: Partial<CardioEntry>) => {
    updateSession((s) => ({
      ...s,
      cardio: s.cardio.map((c) =>
        c.id !== cardioId
          ? c
          : {
              ...c,
              entries: c.entries.map((e) =>
                e.id !== entryId ? e : { ...e, ...updates }
              ),
            }
      ),
    }));
  };

  const addCardioEntry = (cardioId: string) => {
    updateSession((s) => ({
      ...s,
      cardio: s.cardio.map((c) => {
        if (c.id !== cardioId) return c;
        const lastEntry = c.entries[c.entries.length - 1];
        const newEntry: CardioEntry = {
          id: nanoid(),
          timeMinutes: lastEntry?.timeMinutes ?? 0,
          timeSeconds: lastEntry?.timeSeconds ?? 0,
          completed: false,
        };
        return { ...c, entries: [...c.entries, newEntry] };
      }),
    }));
  };

  const removeCardioEntry = (cardioId: string, entryId: string) => {
    updateSession((s) => ({
      ...s,
      cardio: s.cardio.map((c) =>
        c.id !== cardioId
          ? c
          : { ...c, entries: c.entries.filter((e) => e.id !== entryId) }
      ),
    }));
  };

  const toggleCardioComplete = (cardioId: string, entryId: string) => {
    updateSession((s) => ({
      ...s,
      cardio: s.cardio.map((c) =>
        c.id !== cardioId
          ? c
          : {
              ...c,
              entries: c.entries.map((e) =>
                e.id !== entryId ? e : { ...e, completed: !e.completed }
              ),
            }
      ),
    }));
  };

  if (!session || !template) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <span className="text-sm text-muted-foreground">Loading session...</span>
        </div>
      </div>
    );
  }

  const totalVolume = getTotalVolume();
  const completedSets = getCompletedSets();

  return (
    <div className="flex flex-col min-h-full" style={{ paddingBottom: "80px" }}>
      {/* Session Header */}
      <div className="sticky top-0 z-40 bg-background/98 backdrop-blur-md border-b border-border">
        <div className="max-w-lg mx-auto px-4 py-3">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-3">
              <Button
                size="icon"
                variant="ghost"
                onClick={() => setShowCancelDialog(true)}
                data-testid="button-cancel-session"
              >
                <X className="w-5 h-5" />
              </Button>
              <div>
                <h1 className="font-bold text-base leading-tight">{session.templateName}</h1>
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                  <span className="text-xs text-primary font-mono font-semibold">
                    {formatDuration(elapsed)}
                  </span>
                </div>
              </div>
            </div>
            <Button
              size="sm"
              onClick={() => setShowFinishDialog(true)}
              data-testid="button-finish-session"
              className="font-semibold"
            >
              Finish
            </Button>
          </div>

          {/* Stats bar */}
          <div className="flex items-center gap-4 py-2 px-3 rounded-lg bg-muted/50">
            <div className="flex items-center gap-1.5">
              <Check className="w-3.5 h-3.5 text-primary" />
              <span className="text-xs font-medium">{completedSets} sets</span>
            </div>
            <div className="w-px h-3 bg-border" />
            <div className="flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-accent" />
              <span className="text-xs font-medium">
                {totalVolume >= 1000 ? `${(totalVolume / 1000).toFixed(1)}k` : totalVolume.toFixed(0)} kg vol
              </span>
            </div>
            <div className="flex-1" />
            {isResting && (
              <button
                onClick={stopRest}
                className="flex items-center gap-1.5 text-xs font-mono text-primary font-semibold"
                data-testid="button-stop-rest"
              >
                <Timer className="w-3.5 h-3.5" />
                {formatDuration(restSeconds)}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Rest Timer Banner */}
      {isResting && (
        <div
          className="mx-4 mt-3 max-w-lg mx-auto rounded-xl overflow-hidden animate-fade-in"
          style={{ background: "linear-gradient(135deg, hsl(217 91% 55% / 0.15), hsl(217 91% 55% / 0.05))", border: "1px solid hsl(217 91% 55% / 0.25)" }}
        >
          <div className="px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Timer className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium">Rest</span>
            </div>
            <span className="font-mono text-lg font-bold text-primary">{formatDuration(restSeconds)}</span>
            <Button size="sm" variant="outline" onClick={stopRest} data-testid="button-skip-rest">
              Skip
            </Button>
          </div>
          <div className="h-1 bg-muted/30">
            <div
              className="h-full bg-primary transition-all duration-1000"
              style={{ width: `${(restSeconds / restTimerTarget) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Exercise List */}
      <div className="max-w-lg mx-auto w-full px-4 py-3 flex flex-col gap-3">
        {session.exercises.map((ex, idx) => (
          <ExerciseCard
            key={ex.id}
            exercise={ex}
            index={idx}
            expanded={expandedExercises.has(ex.id)}
            sessionId={session.id}
            onToggleExpand={() => toggleExpand(ex.id)}
            onUpdateSet={(setId, updates) => updateSet(ex.id, setId, updates)}
            onAddSet={() => addSet(ex.id)}
            onRemoveSet={(setId) => removeSet(ex.id, setId)}
            onToggleComplete={(setId, set) => toggleComplete(ex.id, setId, set)}
            onCompleteAll={() => completeExercise(ex.id)}
          />
        ))}

        {/* Add Exercise */}
        <button
          onClick={() => setShowAddExercise(true)}
          data-testid="button-add-exercise-session"
          className="w-full rounded-xl border-2 border-dashed border-border py-4 flex items-center justify-center gap-2 text-muted-foreground hover-elevate transition-colors"
        >
          <Plus className="w-4 h-4" />
          <span className="text-sm font-medium">Add exercise</span>
        </button>

        {/* Cardio Section */}
        {session.cardio.length > 0 && (
          <div className="mt-4">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 px-4">
              Cardio
            </h3>
            <div className="flex flex-col gap-3">
              {session.cardio.map((cardio, idx) => (
                <CardioCard
                  key={cardio.id}
                  cardio={cardio}
                  index={idx}
                  expanded={expandedCardio.has(cardio.id)}
                  onToggleExpand={() => toggleCardioExpand(cardio.id)}
                  onUpdateEntry={(entryId, updates) => updateCardioEntry(cardio.id, entryId, updates)}
                  onAddEntry={() => addCardioEntry(cardio.id)}
                  onRemoveEntry={(entryId) => removeCardioEntry(cardio.id, entryId)}
                  onToggleComplete={(entryId) => toggleCardioComplete(cardio.id, entryId)}
                />
              ))}
            </div>
          </div>
        )}

        {/* Add Cardio */}
        <button
          onClick={() => setShowAddCardio(true)}
          className="w-full rounded-xl border-2 border-dashed border-border py-4 flex items-center justify-center gap-2 text-muted-foreground hover-elevate transition-colors"
        >
          <Activity className="w-4 h-4" />
          <span className="text-sm font-medium">Add cardio</span>
        </button>
      </div>

      {/* Add Exercise Dialog */}
      {showAddExercise && (
        <AddExerciseDialog
          templateId={templateId}
          sessionId={session.id}
          existingExerciseIds={session.exercises.map((e) => e.exerciseId)}
          onAdd={(exId, exName, muscleGroup) => {
            updateSession((s) => ({
              ...s,
              exercises: [
                ...s.exercises,
                {
                  id: nanoid(),
                  exerciseId: exId,
                  exerciseName: exName,
                  muscleGroup,
                  sets: [{ id: nanoid(), weight: 0, reps: 0, partialReps: 0, type: "normal", completed: false }],
                },
              ],
            }));
            setShowAddExercise(false);
          }}
          onClose={() => setShowAddExercise(false)}
        />
      )}

      {/* Add Cardio Dialog */}
      {showAddCardio && (
        <AddCardioDialog
          existingExerciseIds={session.cardio.map((c) => c.exerciseId)}
          onAdd={(exId, exName, muscleGroup) => {
            addCardioExercise(exId, exName, muscleGroup);
            setShowAddCardio(false);
          }}
          onClose={() => setShowAddCardio(false)}
        />
      )}

      {/* Finish Dialog */}
      <AlertDialog open={showFinishDialog} onOpenChange={setShowFinishDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Save Workout?</AlertDialogTitle>
            <AlertDialogDescription>
              Do you want to save this workout?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Don't Save</AlertDialogCancel>
            <AlertDialogAction onClick={finishWorkout} data-testid="button-confirm-finish">
              Yes, Save
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Cancel Dialog */}
      <AlertDialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Leave Workout?</AlertDialogTitle>
            <AlertDialogDescription>
              Your progress is auto-saved. You can resume this workout anytime from the home screen.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep Going</AlertDialogCancel>
            <AlertDialogAction
              onClick={cancelWorkout}
              data-testid="button-confirm-cancel"
            >
              Save & Go Home
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Exercise Card ─────────────────────────────────────────────────────────

interface ExerciseCardProps {
  exercise: SessionExercise;
  index: number;
  expanded: boolean;
  sessionId: string;
  onToggleExpand: () => void;
  onUpdateSet: (setId: string, updates: Partial<WorkoutSet>) => void;
  onAddSet: () => void;
  onRemoveSet: (setId: string) => void;
  onToggleComplete: (setId: string, set: WorkoutSet) => void;
  onCompleteAll: () => void;
}

function ExerciseCard({
  exercise, index, expanded, sessionId,
  onToggleExpand, onUpdateSet, onAddSet, onRemoveSet, onToggleComplete, onCompleteAll
}: ExerciseCardProps) {
  const completedSets = exercise.sets.filter((s) => s.completed).length;
  const totalSets = exercise.sets.length;
  const allDone = completedSets === totalSets && totalSets > 0;

  const lastData = getLastSessionDataForExercise(exercise.exerciseId, sessionId);

  return (
    <div
      className={`rounded-xl border bg-card overflow-hidden transition-all ${
        allDone ? "border-primary/30" : "border-card-border"
      }`}
      data-testid={`card-exercise-${exercise.id}`}
    >
      {/* Exercise Header */}
      <button
        className="w-full flex items-center gap-3 px-4 py-3.5 text-left"
        onClick={onToggleExpand}
        data-testid={`button-expand-exercise-${exercise.id}`}
      >
        {/* Set progress indicator */}
        <div className="relative w-9 h-9 flex-shrink-0">
          <svg className="w-9 h-9 -rotate-90" viewBox="0 0 36 36">
            <circle cx="18" cy="18" r="15" fill="none" stroke="hsl(var(--muted))" strokeWidth="3" />
            {totalSets > 0 && (
              <circle
                cx="18" cy="18" r="15" fill="none"
                stroke="hsl(var(--primary))"
                strokeWidth="3"
                strokeDasharray={`${(completedSets / totalSets) * 94.2} 94.2`}
                strokeLinecap="round"
              />
            )}
          </svg>
          <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold">
            {completedSets}/{totalSets}
          </span>
        </div>

        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-sm leading-tight truncate">{exercise.exerciseName}</h3>
          {exercise.muscleGroup && (
            <p className="text-[11px] text-muted-foreground">{exercise.muscleGroup}</p>
          )}
        </div>

        <div className="flex items-center gap-2">
          {allDone && <Check className="w-4 h-4 text-primary" />}
          {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </div>
      </button>

      {/* Previous session preview (collapsed) */}
      {!expanded && lastData && (
        <div className="px-4 pb-3">
          <div className="text-[11px] text-muted-foreground flex items-center gap-1.5">
            <Clock className="w-3 h-3" />
            <span>Last: {lastData.sets.filter(s => s.completed).map(s =>
              `${s.weight}kg × ${s.reps}${s.partialReps ? `+${s.partialReps}` : ""}`
            ).slice(0, 2).join("  ·  ")}
            {lastData.sets.filter(s => s.completed).length > 2 ? ` +${lastData.sets.filter(s => s.completed).length - 2}` : ""}
            </span>
          </div>
        </div>
      )}

      {/* Sets */}
      {expanded && (
        <div className="px-4 pb-4 flex flex-col gap-2">
          {/* Previous session header */}
          {lastData && (
            <div
              className="rounded-lg px-3 py-2 mb-1"
              style={{ background: "hsl(217 91% 55% / 0.08)", border: "1px solid hsl(217 91% 55% / 0.15)" }}
            >
              <p className="text-[11px] font-semibold text-primary mb-1.5 flex items-center gap-1">
                <Clock className="w-3 h-3" /> Last session ({formatDate(lastData.date)})
              </p>
              <div className="flex flex-wrap gap-1.5">
                {lastData.sets.filter(s => s.completed).map((s, i) => (
                  <span key={i} className="text-[11px] text-primary/80 bg-primary/10 px-2 py-0.5 rounded-full font-mono">
                    {s.weight}kg × {s.reps}{s.partialReps ? `+${s.partialReps}p` : ""}{s.type !== "normal" ? ` (${s.type[0].toUpperCase()})` : ""}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Strength progress delta (vs last session, based on completed sets) */}
          <ExerciseProgressSummary exercise={exercise} lastData={lastData} />

          {/* Column headers */}
          <div className="grid gap-2 mb-1" style={{ gridTemplateColumns: "28px 1fr 1fr 70px 44px" }}>
            <span />
            <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider text-center">Weight</span>
            <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider text-center">Reps</span>
            <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider text-center">Type</span>
            <span />
          </div>

          {exercise.sets.map((set, setIdx) => (
            <SetRow
              key={set.id}
              set={set}
              index={setIdx}
              lastSet={lastData?.sets.filter(s => s.completed)[setIdx]}
              onUpdate={(updates) => onUpdateSet(set.id, updates)}
              onRemove={() => onRemoveSet(set.id)}
              onToggleComplete={() => onToggleComplete(set.id, set)}
            />
          ))}

          {/* Add set / Complete all buttons */}
          <div className="flex gap-2 mt-1">
            <Button
              variant="outline"
              size="sm"
              onClick={onAddSet}
              className="flex-1 gap-1.5"
              data-testid={`button-add-set-${exercise.id}`}
            >
              <Plus className="w-3.5 h-3.5" />
              Add Set
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                onCompleteAll();
                setTimeout(onToggleExpand, 50);
              }}
              className="flex-1 gap-1.5"
              data-testid={`button-complete-all-${exercise.id}`}
            >
              <Check className="w-3.5 h-3.5" />
              Done
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Cardio Card ────────────────────────────────────────────────────────────

interface CardioCardProps {
  cardio: SessionCardio;
  index: number;
  expanded: boolean;
  onToggleExpand: () => void;
  onUpdateEntry: (entryId: string, updates: Partial<CardioEntry>) => void;
  onAddEntry: () => void;
  onRemoveEntry: (entryId: string) => void;
  onToggleComplete: (entryId: string) => void;
}

function CardioCard({
  cardio, index, expanded,
  onToggleExpand, onUpdateEntry, onAddEntry, onRemoveEntry, onToggleComplete
}: CardioCardProps) {
  const completedEntries = cardio.entries.filter((e) => e.completed).length;
  const totalEntries = cardio.entries.length;
  const allDone = completedEntries === totalEntries && totalEntries > 0;

  return (
    <div
      className={`rounded-xl border bg-card overflow-hidden transition-all ${
        allDone ? "border-accent/30" : "border-card-border"
      }`}
    >
      {/* Cardio Header */}
      <button
        className="w-full flex items-center gap-3 px-4 py-3.5 text-left"
        onClick={onToggleExpand}
      >
        {/* Progress indicator */}
        <div className="relative w-9 h-9 flex-shrink-0">
          <svg className="w-9 h-9 -rotate-90" viewBox="0 0 36 36">
            <circle cx="18" cy="18" r="15" fill="none" stroke="hsl(var(--muted))" strokeWidth="3" />
            {totalEntries > 0 && (
              <circle
                cx="18" cy="18" r="15" fill="none"
                stroke="hsl(var(--accent))"
                strokeWidth="3"
                strokeDasharray={`${(completedEntries / totalEntries) * 94.2} 94.2`}
                strokeLinecap="round"
              />
            )}
          </svg>
          <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold">
            {completedEntries}/{totalEntries}
          </span>
        </div>

        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-sm leading-tight truncate">{cardio.exerciseName}</h3>
          {cardio.muscleGroup && (
            <p className="text-[11px] text-muted-foreground">{cardio.muscleGroup}</p>
          )}
        </div>

        <div className="flex items-center gap-2">
          {allDone && <Check className="w-4 h-4 text-accent" />}
          {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </div>
      </button>

      {/* Entries */}
      {expanded && (
        <div className="px-4 pb-4 flex flex-col gap-2">
          {/* Column headers */}
          <div className="grid gap-2 mb-1" style={{ gridTemplateColumns: "28px 1fr 1fr 1fr 44px" }}>
            <span />
            <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider text-center">Time</span>
            <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider text-center">Distance</span>
            <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider text-center">Calories</span>
            <span />
          </div>

          {cardio.entries.map((entry, entryIdx) => (
            <CardioEntryRow
              key={entry.id}
              entry={entry}
              index={entryIdx}
              onUpdate={(updates) => onUpdateEntry(entry.id, updates)}
              onRemove={() => onRemoveEntry(entry.id)}
              onToggleComplete={() => onToggleComplete(entry.id)}
            />
          ))}

          {/* Add entry / Complete all buttons */}
          <div className="flex gap-2 mt-1">
            <Button
              variant="outline"
              size="sm"
              onClick={onAddEntry}
              className="flex-1 gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Entry
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Cardio Entry Row ───────────────────────────────────────────────────────

interface CardioEntryRowProps {
  entry: CardioEntry;
  index: number;
  onUpdate: (updates: Partial<CardioEntry>) => void;
  onRemove: () => void;
  onToggleComplete: () => void;
}

function CardioEntryRow({ entry, index, onUpdate, onRemove, onToggleComplete }: CardioEntryRowProps) {
  return (
    <div
      className={`grid gap-2 items-center rounded-lg px-2 py-2 transition-all ${
        entry.completed ? "bg-accent/8 border border-accent/20" : "bg-muted/30"
      }`}
      style={{ gridTemplateColumns: "28px 1fr 1fr 1fr 44px" }}
    >
      {/* Entry number */}
      <div className="flex items-center justify-center">
        <span className={`text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center ${
          entry.completed ? "bg-accent text-accent-foreground" : "text-muted-foreground"
        }`}>
          {index + 1}
        </span>
      </div>

      {/* Time */}
      <div className="flex gap-1">
        <NumberInput
          value={entry.timeMinutes}
          step={1}
          min={0}
          suffix="m"
          onChange={(v) => onUpdate({ timeMinutes: v })}
          disabled={entry.completed}
          testId={`input-time-minutes-${entry.id}`}
        />
        <NumberInput
          value={entry.timeSeconds}
          step={5}
          min={0}
          suffix="s"
          onChange={(v) => onUpdate({ timeSeconds: v })}
          disabled={entry.completed}
          testId={`input-time-seconds-${entry.id}`}
        />
      </div>

      {/* Distance */}
      <NumberInput
        value={entry.distance || 0}
        step={0.1}
        min={0}
        suffix="km"
        onChange={(v) => onUpdate({ distance: v || undefined })}
        disabled={entry.completed}
        testId={`input-distance-${entry.id}`}
      />

      {/* Calories */}
      <NumberInput
        value={entry.calories || 0}
        step={10}
        min={0}
        suffix="cal"
        onChange={(v) => onUpdate({ calories: v || undefined })}
        disabled={entry.completed}
        testId={`input-calories-${entry.id}`}
      />

      {/* Complete / Remove */}
      <div className="flex items-center justify-center gap-1">
        {!entry.completed ? (
          <button
            onClick={onToggleComplete}
            className="w-8 h-8 rounded-full border-2 border-accent/40 flex items-center justify-center transition-all active:scale-90"
          >
            <Check className="w-4 h-4 text-accent/60" />
          </button>
        ) : (
          <button
            onClick={onToggleComplete}
            className="w-8 h-8 rounded-full bg-accent flex items-center justify-center transition-all active:scale-90"
          >
            <Check className="w-4 h-4 text-accent-foreground" />
          </button>
        )}
        {!entry.completed && (
          <button
            onClick={onRemove}
            className="w-8 h-8 rounded-full border border-destructive/40 flex items-center justify-center text-destructive hover:bg-destructive/10 transition-colors"
            title="Remove entry"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Add Cardio Dialog ──────────────────────────────────────────────────────

function AddCardioDialog({
  existingExerciseIds, onAdd, onClose
}: {
  existingExerciseIds: string[];
  onAdd: (id: string, name: string, muscleGroup?: string) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState("");
  const exercises = getExercises().filter(e => e.muscleGroup === "Cardio");
  const filtered = exercises.filter(
    (e) =>
      e.name.toLowerCase().includes(search.toLowerCase()) &&
      !existingExerciseIds.includes(e.id)
  );

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-sm mx-4">
        <DialogHeader>
          <DialogTitle>Add Cardio Exercise</DialogTitle>
        </DialogHeader>
        <input
          type="search"
          placeholder="Search cardio exercises..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm outline-none focus:ring-1 focus:ring-primary"
          autoFocus
        />
        <ScrollArea className="h-64">
          <div className="flex flex-col gap-1 pr-2">
            {filtered.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-8">No cardio exercises found</p>
            ) : (
              filtered.map((ex) => (
                <button
                  key={ex.id}
                  onClick={() => onAdd(ex.id, ex.name, ex.muscleGroup)}
                  className="flex items-center justify-between px-3 py-2.5 rounded-lg hover-elevate text-left bg-muted/30"
                >
                  <div>
                    <p className="text-sm font-medium">{ex.name}</p>
                    {ex.muscleGroup && (
                      <p className="text-xs text-muted-foreground">{ex.muscleGroup}</p>
                    )}
                  </div>
                  <Plus className="w-4 h-4 text-primary" />
                </button>
              ))
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

// ─── Exercise Progress Summary ───────────────────────────────────────────────

function ExerciseProgressSummary({
  exercise,
  lastData,
}: {
  exercise: SessionExercise;
  lastData: { sets: WorkoutSet[]; date: number } | null;
}) {
  const completedSets = exercise.sets.filter((s) => s.completed);
  if (completedSets.length === 0) return null;

  const totalReps = completedSets.reduce((sum, s) => sum + s.reps, 0);
  const totalPartial = completedSets.reduce((sum, s) => sum + (s.partialReps ?? 0), 0);
  const bestWeight = Math.max(...completedSets.map((s) => s.weight));
  const assistedCount = completedSets.filter((s) => s.type === "assisted").length;
  const failureCount = completedSets.filter((s) => s.type === "failure").length;

  let weightDelta: number | null = null;
  let repsDelta: number | null = null;

  if (lastData) {
    const lastCompleted = lastData.sets.filter((s) => s.completed);
    if (lastCompleted.length > 0) {
      const lastBestWeight = Math.max(...lastCompleted.map((s) => s.weight));
      const lastTotalReps = lastCompleted.reduce((sum, s) => sum + s.reps, 0);
      weightDelta = parseFloat((bestWeight - lastBestWeight).toFixed(2));
      repsDelta = totalReps - lastTotalReps;
    }
  }

  const hasImprovement = (weightDelta ?? 0) > 0 || (repsDelta ?? 0) > 0;
  const hasDecline = (weightDelta ?? 0) < 0 || (repsDelta ?? 0) < 0;

  return (
    <div className="rounded-lg px-3 py-2 mb-1 bg-muted/40 border border-border/50">
      <div className="flex items-center justify-between flex-wrap gap-2">
        {/* Current totals */}
        <div className="flex flex-wrap gap-2 text-[11px]">
          <span className="font-medium text-foreground">
            {completedSets.length} sets · {totalReps} reps{totalPartial > 0 ? ` + ${totalPartial}p` : ""} · {bestWeight}kg
          </span>
          {assistedCount > 0 && (
            <span className="text-blue-400 font-medium">{assistedCount} assisted</span>
          )}
          {failureCount > 0 && (
            <span className="text-destructive font-medium">{failureCount} to failure</span>
          )}
        </div>

        {/* Delta vs last session */}
        {(weightDelta !== null || repsDelta !== null) && (
          <div className={`flex items-center gap-1.5 text-[11px] font-semibold ${
            hasImprovement ? "text-green-500" : hasDecline ? "text-destructive" : "text-muted-foreground"
          }`}>
            {hasImprovement ? <TrendingUp className="w-3 h-3" /> : hasDecline ? <TrendingDown className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
            <span>
              {weightDelta !== null && weightDelta !== 0 && (
                <>{weightDelta > 0 ? "+" : ""}{weightDelta}kg{repsDelta !== null && repsDelta !== 0 ? ", " : ""}</>
              )}
              {repsDelta !== null && repsDelta !== 0 && (
                <>{repsDelta > 0 ? "+" : ""}{repsDelta} reps</>
              )}
              {weightDelta === 0 && repsDelta === 0 && "Same as last time"}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Set Row ─────────────────────────────────────────────────────────────────

interface SetRowProps {
  set: WorkoutSet;
  index: number;
  lastSet?: WorkoutSet;
  onUpdate: (updates: Partial<WorkoutSet>) => void;
  onRemove: () => void;
  onToggleComplete: () => void;
}

const SET_TYPE_CONFIG: Record<SetType, { label: string; short: string; color: string }> = {
  normal: { label: "Normal", short: "N", color: "bg-muted text-muted-foreground" },
  assisted: { label: "Assisted", short: "A", color: "bg-blue-500/20 text-blue-400 border border-blue-500/30" },
  failure: { label: "Failure", short: "F", color: "bg-destructive/20 text-destructive border border-destructive/30" },
};

const SET_TYPES: SetType[] = ["normal", "assisted", "failure"];

function SetRow({ set, index, lastSet, onUpdate, onRemove, onToggleComplete }: SetRowProps) {
  const typeConfig = SET_TYPE_CONFIG[set.type];
  const cycleType = () => {
    const idx = SET_TYPES.indexOf(set.type);
    onUpdate({ type: SET_TYPES[(idx + 1) % SET_TYPES.length] });
  };

  const weightStep = 2.5;
  const repsStep = 1;

  const comparison = lastSet
    ? set.reps > lastSet.reps
      ? "up"
      : set.reps < lastSet.reps
      ? "down"
      : set.weight > lastSet.weight
      ? "up"
      : set.weight < lastSet.weight
      ? "down"
      : null
    : null;

  return (
    <div
      className={`grid gap-2 items-center rounded-lg px-2 py-2 transition-all ${
        set.completed ? "bg-primary/8 border border-primary/20" : "bg-muted/30"
      }`}
      style={{ gridTemplateColumns: "28px 1fr 1fr 70px 44px" }}
      data-testid={`row-set-${set.id}`}
    >
      {/* Set number */}
      <div className="flex items-center justify-center">
        <span className={`text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center ${
          set.completed ? "bg-primary text-primary-foreground" : "text-muted-foreground"
        }`}>
          {index + 1}
        </span>
      </div>

      {/* Weight */}
      <NumberInput
        value={set.weight}
        step={weightStep}
        min={0}
        suffix="kg"
        onChange={(v) => onUpdate({ weight: v })}
        disabled={set.completed}
        testId={`input-weight-${set.id}`}
      />

      {/* Reps */}
      <RepsInput
        reps={set.reps}
        partialReps={set.partialReps}
        onChangeReps={(v) => onUpdate({ reps: v })}
        onChangePartial={(v) => onUpdate({ partialReps: v })}
        disabled={set.completed}
        testId={`input-reps-${set.id}`}
        comparison={comparison}
      />

      {/* Type badge */}
      <button
        onClick={cycleType}
        disabled={set.completed}
        className={`rounded-md px-2 py-1.5 text-[11px] font-semibold transition-colors leading-none ${typeConfig.color} ${set.completed ? "opacity-60" : ""}`}
        data-testid={`button-set-type-${set.id}`}
        title={`Tap to change: ${set.type}`}
      >
        {typeConfig.label}
      </button>

      {/* Complete / Remove */}
      <div className="flex items-center justify-center gap-1">
        {!set.completed ? (
          <button
            onClick={onToggleComplete}
            className="w-8 h-8 rounded-full border-2 border-primary/40 flex items-center justify-center transition-all active:scale-90"
            data-testid={`button-complete-set-${set.id}`}
          >
            <Check className="w-4 h-4 text-primary/60" />
          </button>
        ) : (
          <button
            onClick={onToggleComplete}
            className="w-8 h-8 rounded-full bg-primary flex items-center justify-center transition-all active:scale-90"
            data-testid={`button-uncomplete-set-${set.id}`}
          >
            <Check className="w-4 h-4 text-primary-foreground" />
          </button>
        )}
        {!set.completed && (
          <button
            onClick={onRemove}
            className="w-8 h-8 rounded-full border border-destructive/40 flex items-center justify-center text-destructive hover:bg-destructive/10 transition-colors"
            data-testid={`button-remove-set-${set.id}`}
            title="Remove set"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Number Input ─────────────────────────────────────────────────────────────

function NumberInput({
  value, step, min = 0, suffix, onChange, disabled, testId
}: {
  value: number;
  step: number;
  min?: number;
  suffix?: string;
  onChange: (v: number) => void;
  disabled?: boolean;
  testId: string;
}) {
  const [editing, setEditing] = useState(false);
  const [raw, setRaw] = useState("");

  const display = value % 1 === 0 ? `${value}` : `${value}`;

  if (editing) {
    return (
      <input
        autoFocus
        className="w-full text-center text-sm font-bold bg-background border border-primary rounded-md py-1.5 outline-none"
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
        onBlur={() => {
          const n = parseFloat(raw);
          if (!isNaN(n)) onChange(Math.max(min, n));
          setEditing(false);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            const n = parseFloat(raw);
            if (!isNaN(n)) onChange(Math.max(min, n));
            setEditing(false);
          }
        }}
        inputMode="decimal"
        data-testid={`${testId}-edit`}
      />
    );
  }

  return (
    <div className="flex items-center gap-0.5">
      <button
        onClick={() => !disabled && onChange(Math.max(min, parseFloat((value - step).toFixed(2))))}
        disabled={disabled || value <= min}
        className="w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground disabled:opacity-30"
        data-testid={`${testId}-minus`}
      >
        <Minus className="w-3 h-3" />
      </button>
      <button
        onClick={() => { if (!disabled) { setRaw(`${value}`); setEditing(true); } }}
        className="flex-1 text-center text-sm font-bold py-1"
        data-testid={testId}
        disabled={disabled}
      >
        {display}
        {suffix && <span className="text-[10px] font-normal text-muted-foreground ml-0.5">{suffix}</span>}
      </button>
      <button
        onClick={() => !disabled && onChange(parseFloat((value + step).toFixed(2)))}
        disabled={disabled}
        className="w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground disabled:opacity-30"
        data-testid={`${testId}-plus`}
      >
        <Plus className="w-3 h-3" />
      </button>
    </div>
  );
}

// ─── Reps Input ─────────────────────────────────────────────────────────────

function RepsInput({
  reps, partialReps, onChangeReps, onChangePartial, disabled, testId, comparison
}: {
  reps: number;
  partialReps: number;
  onChangeReps: (v: number) => void;
  onChangePartial: (v: number) => void;
  disabled?: boolean;
  testId: string;
  comparison?: "up" | "down" | null;
}) {
  const [showPartial, setShowPartial] = useState(partialReps > 0);

  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center gap-0.5">
        <button
          onClick={() => !disabled && onChangeReps(Math.max(0, reps - 1))}
          disabled={disabled || reps <= 0}
          className="w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground disabled:opacity-30"
          data-testid={`${testId}-reps-minus`}
        >
          <Minus className="w-3 h-3" />
        </button>
        <div className="flex-1 text-center">
          <span className="text-sm font-bold">{reps}</span>
          {comparison === "up" && <TrendingUp className="inline w-2.5 h-2.5 text-green-500 ml-0.5" />}
          {comparison === "down" && <TrendingDown className="inline w-2.5 h-2.5 text-destructive ml-0.5" />}
        </div>
        <button
          onClick={() => !disabled && onChangeReps(reps + 1)}
          disabled={disabled}
          className="w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground disabled:opacity-30"
          data-testid={`${testId}-reps-plus`}
        >
          <Plus className="w-3 h-3" />
        </button>
      </div>

      {/* Partial reps */}
      {(showPartial || partialReps > 0) ? (
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => { if (!disabled) { const v = Math.max(0, partialReps - 1); onChangePartial(v); if (v === 0) setShowPartial(false); } }}
            disabled={disabled || partialReps <= 0}
            className="w-7 h-7 rounded-md flex items-center justify-center text-orange-400/70 disabled:opacity-30"
          >
            <Minus className="w-3 h-3" />
          </button>
          <div className="flex-1 text-center">
            <span className="text-xs text-orange-400 font-semibold">+{partialReps}p</span>
          </div>
          <button
            onClick={() => !disabled && onChangePartial(partialReps + 1)}
            disabled={disabled}
            className="w-7 h-7 rounded-md flex items-center justify-center text-orange-400/70 disabled:opacity-30"
          >
            <Plus className="w-3 h-3" />
          </button>
        </div>
      ) : (
        !disabled && (
          <button
            onClick={() => setShowPartial(true)}
            className="w-full text-center text-[11px] font-medium text-orange-400/70 hover:text-orange-400 py-0.5 rounded transition-colors"
            data-testid={`${testId}-partial-btn`}
          >
            + partial
          </button>
        )
      )}
    </div>
  );
}

// ─── Add Exercise Dialog ────────────────────────────────────────────────────

function AddExerciseDialog({
  templateId, sessionId, existingExerciseIds, onAdd, onClose
}: {
  templateId: string;
  sessionId: string;
  existingExerciseIds: string[];
  onAdd: (id: string, name: string, muscleGroup?: string) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState("");
  const exercises = getExercises();
  const filtered = exercises.filter(
    (e) =>
      e.name.toLowerCase().includes(search.toLowerCase()) &&
      !existingExerciseIds.includes(e.id)
  );

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-sm mx-4">
        <DialogHeader>
          <DialogTitle>Add Exercise</DialogTitle>
        </DialogHeader>
        <input
          type="search"
          placeholder="Search exercises..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm outline-none focus:ring-1 focus:ring-primary"
          data-testid="input-search-exercises"
          autoFocus
        />
        <ScrollArea className="h-64">
          <div className="flex flex-col gap-1 pr-2">
            {filtered.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-8">No exercises found</p>
            ) : (
              filtered.map((ex) => (
                <button
                  key={ex.id}
                  onClick={() => onAdd(ex.id, ex.name, ex.muscleGroup)}
                  className="flex items-center justify-between px-3 py-2.5 rounded-lg hover-elevate text-left bg-muted/30"
                  data-testid={`button-select-exercise-${ex.id}`}
                >
                  <div>
                    <p className="text-sm font-medium">{ex.name}</p>
                    {ex.muscleGroup && (
                      <p className="text-xs text-muted-foreground">{ex.muscleGroup}</p>
                    )}
                  </div>
                  <Plus className="w-4 h-4 text-primary" />
                </button>
              ))
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
