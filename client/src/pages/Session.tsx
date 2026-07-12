import { useState, useEffect, useCallback, useRef } from "react";
import { useLocation, useParams } from "wouter";
import { nanoid } from "nanoid";
import {
  X, Plus, Minus, Check, ChevronDown, ChevronUp, Timer, Zap,
  AlertTriangle, Activity,
  ArrowLeft, Trophy, Clock, MoreVertical, Trash2, Edit2, GripVertical, Repeat
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  getTemplate, getActiveSession, saveActiveSession, clearActiveSession,
  saveSession, getLastSessionDataForExercise, getExercises, addExerciseToTemplate,
  getLastSessionForTemplate, updateTemplate, createExercise
} from "@/lib/storage";
import type { WorkoutSession, SessionExercise, WorkoutSet, SetType, SessionCardio, CardioEntry, WorkoutTemplate, TemplateExercise } from "@/lib/types";
import { MUSCLE_GROUPS } from "@/lib/types";
import { useTimer, useRestTimer, formatDuration, formatDate, toDisplay, fromDisplay, unitLabel } from "@/lib/hooks";
import { useTheme } from "@/lib/theme";
import { haptic } from "@/lib/haptics";
import { TrendBadge } from "@/components/TrendBadge";
import { PageHeader, PageHeaderRow, SubpageTitle } from "@/components/PageHeader";
import { SectionLabel } from "@/components/SectionLabel";

const CUTE_EMOJI_SRCS: Record<string, string> = {
  bench_press:    "/cute-emojis/emoji_bunny_bench_press.png",
  deadlift:       "/cute-emojis/emoji_bunny_deadlift.png",
  lat_pulldown:   "/cute-emojis/emoji_bunny_lat_pulldown.png",
  overhead_press: "/cute-emojis/emoji_bunny_overhead_press.png",
  dumbbell_curl:  "/cute-emojis/emoji_bunny_dumbbell_curl.png",
  cable_pull:     "/cute-emojis/emoji_bunny_cable_pull.png",
};

export default function Session() {
  const params = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const templateId = params.id;
  const { cute, imperial } = useTheme();

  const [template, setTemplate] = useState<WorkoutTemplate | null>(null);
  const [session, setSession] = useState<WorkoutSession | null>(null);
  const [expandedExercises, setExpandedExercises] = useState<Set<string>>(new Set());
  const [expandedCardio, setExpandedCardio] = useState<Set<string>>(new Set());
  const [showFinishDialog, setShowFinishDialog] = useState(false);
  const [showAddExercise, setShowAddExercise] = useState(false);
  const [showAddCardio, setShowAddCardio] = useState(false);
  const [restTimerTarget, setRestTimerTarget] = useState(90);
  const { restSeconds, isResting, startRest, stopRest } = useRestTimer();
  const [dragId, setDragId] = useState<string | null>(null);
  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const elapsed = useTimer(!!session && !session.finishedAt, session?.startedAt ?? 0);

  useEffect(() => {
    const tmpl = getTemplate(templateId);
    if (!tmpl) { navigate("/"); return; }
    setTemplate(tmpl);

    const existing = getActiveSession();
    if (existing && existing.templateId === templateId) {
      // Resuming an in-progress workout: keep every exercise collapsed so
      // returning to the session doesn't auto-pop the first card open.
      setSession({ ...existing, cardio: existing.cardio || [] });
    } else {
      // Restart: if this template was done before, bring back that exercise
      // list (including any added mid-session) but with NO sets — the user
      // taps "Add Set" to log fresh. First-ever start uses the template scaffold.
      const lastSession = getLastSessionForTemplate(templateId);
      const exercises: SessionExercise[] = lastSession && lastSession.exercises.length > 0
        ? lastSession.exercises.map((ex) => ({
            id: nanoid(),
            exerciseId: ex.exerciseId,
            exerciseName: ex.exerciseName,
            muscleGroup: ex.muscleGroup,
            sets: [],
          }))
        : tmpl.exercises
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
            }));
      const newSession: WorkoutSession = {
        id: nanoid(),
        templateId,
        templateName: tmpl.name,
        startedAt: Date.now(),
        exercises,
        cardio: [],
      };
      setSession(newSession);
      // Do NOT persist as the active session yet. It only becomes a
      // resumable "active" workout once the user actually logs something
      // (any edit goes through updateSession, which saves). This prevents
      // empty, half-opened sessions from lingering as a stale "resume".
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

  // Press-and-hold drag reorder: move the dragged exercise to whichever row
  // the pointer is currently over.
  const reorderExercise = useCallback((fromId: string, toId: string) => {
    if (fromId === toId) return;
    updateSession((s) => {
      const exs = [...s.exercises];
      const from = exs.findIndex((e) => e.id === fromId);
      const to = exs.findIndex((e) => e.id === toId);
      if (from === -1 || to === -1) return s;
      const [moved] = exs.splice(from, 1);
      exs.splice(to, 0, moved);
      return { ...s, exercises: exs };
    });
  }, [updateSession]);

  useEffect(() => {
    if (!dragId) return;
    const onMove = (e: PointerEvent) => {
      for (const [id, el] of Object.entries(rowRefs.current)) {
        if (!el || id === dragId) continue;
        const rect = el.getBoundingClientRect();
        if (e.clientY > rect.top && e.clientY < rect.bottom) {
          reorderExercise(dragId, id);
          break;
        }
      }
    };
    const onUp = () => setDragId(null);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [dragId, reorderExercise]);

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

  const removeExercise = useCallback(
    (exerciseId: string) => {
      updateSession((s) => ({
        ...s,
        exercises: s.exercises.filter((ex) => ex.id !== exerciseId),
      }));
    },
    [updateSession]
  );

  // Marks the target exercise's first set as "superset", pointing at the
  // group's anchor exercise — extends an existing superset into a tri-set.
  const addToSuperset = useCallback((anchorId: string, targetExerciseId: string) => {
    updateSession((s) => {
      const anchor = s.exercises.find((e) => e.id === anchorId);
      if (!anchor) return s;
      return {
        ...s,
        exercises: s.exercises.map((ex) => {
          if (ex.id !== targetExerciseId || ex.sets.length === 0) return ex;
          const [first, ...rest] = ex.sets;
          return {
            ...ex,
            sets: [{ ...first, type: "superset", supersetExerciseId: anchor.id, supersetExerciseName: anchor.exerciseName }, ...rest],
          };
        }),
      };
    });
  }, [updateSession]);

  const toggleComplete = useCallback(
    (exerciseId: string, setId: string, currentSet: WorkoutSet) => {
      const completed = !currentSet.completed;
      updateSet(exerciseId, setId, { completed });
      if (completed) { haptic("tap"); startRest(restTimerTarget); }
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
    haptic("success");
    const finished: WorkoutSession = {
      ...session,
      finishedAt: Date.now(),
      durationSeconds: elapsed,
      exercises: session.exercises.map((ex) => ({
        ...ex,
        sets: ex.sets
          .filter((s) => s.reps > 0 || s.weight > 0)
          .map((s) => ({ ...s, completed: true })),
      })),
    };
    saveSession(finished);
    clearActiveSession();

    if (template) {
      const templateExercises: TemplateExercise[] = finished.exercises.map((ex, i) => {
        const existing = template.exercises.find((te) => te.exerciseId === ex.exerciseId);
        return {
          id: existing?.id ?? nanoid(),
          exerciseId: ex.exerciseId,
          exerciseName: ex.exerciseName,
          muscleGroup: ex.muscleGroup,
          defaultSets: existing?.defaultSets ?? (ex.sets.length || 3),
          order: i,
        };
      });
      updateTemplate(template.id, { exercises: templateExercises });
    }

    // Older sessions/templates may predate muscleGroup being stored on the
    // exercise itself — fall back to the exercise catalog by id.
    const catalogMuscleGroup = new Map(getExercises().map((e) => [e.id, e.muscleGroup]));
    const groupOf = (ex: SessionExercise) => ex.muscleGroup ?? catalogMuscleGroup.get(ex.exerciseId);

    const trainedExercises = finished.exercises.filter((ex) => ex.sets.length > 0);
    const trainedGroups: string[] = [];
    for (const ex of trainedExercises) {
      const g = groupOf(ex);
      if (g && !trainedGroups.includes(g)) trainedGroups.push(g);
    }
    const lastExercise = trainedExercises[trainedExercises.length - 1] ?? finished.exercises[finished.exercises.length - 1];
    const lastGroup = (lastExercise ? groupOf(lastExercise) : undefined) ?? trainedGroups[0];

    if (trainedGroups.length > 0 && lastGroup && lastExercise) {
      const params = new URLSearchParams({
        groups: trainedGroups.join(","),
        group: lastGroup,
        exercise: lastExercise.exerciseId,
      });
      navigate(`/progress?${params.toString()}`);
    } else {
      navigate("/progress");
    }
  };

  const cancelWorkout = () => {
    if (session) saveActiveSession(session);
    navigate("/");
  };

  // Nothing worth saving — drop the active session instead of writing an empty
  // one to history (which would pollute charts and PBs).
  const discardWorkout = () => {
    clearActiveSession();
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
    <div className="flex flex-col min-h-full" style={{ paddingBottom: "88px" }}>
      <PageHeader>
          <PageHeaderRow className="justify-between mb-2">
            <div className="flex items-center gap-3">
              <Button
                size="icon"
                variant="ghost"
                onClick={cancelWorkout}
                data-testid="button-cancel-session"
              >
                <X className="w-5 h-5" />
              </Button>
              <div className="flex items-center gap-2">
                {cute && template?.cuteEmoji && CUTE_EMOJI_SRCS[template.cuteEmoji] && (
                  <img
                    src={CUTE_EMOJI_SRCS[template.cuteEmoji]}
                    alt=""
                    className="w-8 h-8 object-contain flex-shrink-0"
                  />
                )}
                <div>
                  <SubpageTitle>{session.templateName}</SubpageTitle>
                  <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                    <span className="text-xs text-primary font-mono font-semibold tabular-nums">
                      {formatDuration(elapsed)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </PageHeaderRow>

          {/* Stats bar */}
          <div className="flex items-center gap-4 py-2.5 px-3 rounded-xl bg-card/70 border border-border/60">
            <div className="flex items-center gap-1.5">
              <Check className="w-3.5 h-3.5 text-primary" />
              <span className="text-xs font-medium tabular-nums">{completedSets} sets</span>
            </div>
            <div className="w-px h-3 bg-border" />
            <div className="flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-accent" />
              <span className="text-xs font-medium tabular-nums">
                {(() => { const v = toDisplay(totalVolume, imperial); return v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v.toFixed(0); })()} {unitLabel(imperial)} vol
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
      </PageHeader>

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
        {(() => {
          const renderCard = (ex: SessionExercise, idx: number) => (
            <ExerciseCard
              key={ex.id}
              exercise={ex}
              index={idx}
              expanded={expandedExercises.has(ex.id)}
              sessionId={session.id}
              dragging={dragId === ex.id}
              rowRef={(el) => { rowRefs.current[ex.id] = el; }}
              onDragHandlePointerDown={() => setDragId(ex.id)}
              onToggleExpand={() => toggleExpand(ex.id)}
              onUpdateSet={(setId, updates) => updateSet(ex.id, setId, updates)}
              onAddSet={() => addSet(ex.id)}
              onRemoveSet={(setId) => removeSet(ex.id, setId)}
              onToggleComplete={(setId, set) => toggleComplete(ex.id, setId, set)}
              onCompleteAll={() => completeExercise(ex.id)}
              onRemoveExercise={() => removeExercise(ex.id)}
              onUpdateNote={(note) => updateSession((s) => ({
                ...s,
                exercises: s.exercises.map((e) => e.id !== ex.id ? e : { ...e, notes: note || undefined }),
              }))}
              sessionExercises={session.exercises}
            />
          );

          // Group exercises connected by a "superset" set (any set on A
          // pointing at B) into one merged card, via connected components so
          // 3+ exercise supersets (tri-sets) also merge correctly. Render-time
          // only — the stored array order never changes.
          const adjacency = new Map<string, Set<string>>();
          const addEdge = (a: string, b: string) => {
            if (!adjacency.has(a)) adjacency.set(a, new Set());
            if (!adjacency.has(b)) adjacency.set(b, new Set());
            adjacency.get(a)!.add(b);
            adjacency.get(b)!.add(a);
          };
          for (const ex of session.exercises) {
            for (const s of ex.sets) {
              if (s.type === "superset" && s.supersetExerciseId) addEdge(ex.id, s.supersetExerciseId);
            }
          }

          const visited = new Set<string>();
          const nodes: React.ReactNode[] = [];
          session.exercises.forEach((ex) => {
            if (visited.has(ex.id)) return;
            if (!adjacency.has(ex.id)) {
              visited.add(ex.id);
              nodes.push(renderCard(ex, session.exercises.indexOf(ex)));
              return;
            }
            const compIds: string[] = [];
            const queue = [ex.id];
            visited.add(ex.id);
            while (queue.length) {
              const cur = queue.shift()!;
              compIds.push(cur);
              for (const n of Array.from(adjacency.get(cur) ?? [])) {
                if (!visited.has(n)) { visited.add(n); queue.push(n); }
              }
            }
            const members = session.exercises.filter((e) => compIds.includes(e.id));
            nodes.push(
              <SupersetGroup
                key={`superset-${ex.id}`}
                exercises={members}
                sessionId={session.id}
                expanded={expandedExercises.has(ex.id)}
                onToggleExpand={() => toggleExpand(ex.id)}
                onUpdateSet={updateSet}
                onAddSet={addSet}
                onRemoveSet={removeSet}
                onToggleComplete={toggleComplete}
                onCompleteAll={completeExercise}
                sessionExercises={session.exercises}
                onAddToSuperset={(targetId) => addToSuperset(members[0].id, targetId)}
              />
            );
          });
          return nodes;
        })()}

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
            <SectionLabel className="mb-3 px-4">Cardio</SectionLabel>
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

      {/* Sticky Finish bar — thumb-reachable end-of-workout action */}
      <div
        className="fixed bottom-0 left-0 right-0 z-40 border-t border-border/70 bg-background/90 backdrop-blur-xl"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        <div className="max-w-lg mx-auto px-4 py-3">
          <Button
            onClick={() => setShowFinishDialog(true)}
            data-testid="button-finish-session"
            className="w-full font-semibold py-4"
          >
            <Check className="w-4 h-4 mr-2" />
            Finish workout
          </Button>
        </div>
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
      <Dialog open={showFinishDialog} onOpenChange={setShowFinishDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{completedSets === 0 ? "No sets logged" : "Finish Workout?"}</DialogTitle>
            <DialogDescription>
              {completedSets === 0
                ? "You haven't completed any sets. There's nothing to save — discard this workout?"
                : "Do you want to finish this workout?"}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowFinishDialog(false)}>Continue</Button>
            {completedSets === 0 ? (
              <Button variant="destructive" onClick={discardWorkout} data-testid="button-discard-session">
                Discard
              </Button>
            ) : (
              <Button onClick={finishWorkout} data-testid="button-confirm-finish">
                Finish session
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
  onRemoveExercise: () => void;
  onUpdateNote: (note: string) => void;
  dragging: boolean;
  rowRef: (el: HTMLDivElement | null) => void;
  onDragHandlePointerDown: () => void;
  sessionExercises: SessionExercise[];
}

function ExerciseCard({
  exercise, index, expanded, sessionId, dragging, rowRef, onDragHandlePointerDown, sessionExercises,
  onToggleExpand, onUpdateSet, onAddSet, onRemoveSet, onToggleComplete, onCompleteAll, onRemoveExercise, onUpdateNote
}: ExerciseCardProps) {
  const { imperial } = useTheme();
  const completedSets = exercise.sets.filter((s) => s.completed).length;
  const totalSets = exercise.sets.length;
  const allDone = completedSets === totalSets && totalSets > 0;
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyPos, setHistoryPos] = useState({ top: 0, right: 0 });
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteDraft, setNoteDraft] = useState(exercise.notes ?? "");
  const clockBtnRef = useRef<HTMLButtonElement>(null);

  const lastData = getLastSessionDataForExercise(exercise.exerciseId, sessionId);
  const lastSets = lastData?.sets.filter((s) => s.completed && s.reps > 0) ?? [];

  const openHistory = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (clockBtnRef.current) {
      const rect = clockBtnRef.current.getBoundingClientRect();
      setHistoryPos({ top: rect.bottom + 8, right: window.innerWidth - rect.right });
    }
    setHistoryOpen((o) => !o);
  };

  return (
    <div
      ref={rowRef}
      className={`rounded-xl border bg-card overflow-hidden transition-all ${
        dragging ? "opacity-60 shadow-lg border-primary/40" : allDone ? "border-primary/30" : "border-card-border"
      }`}
      data-testid={`card-exercise-${exercise.id}`}
    >
      {/* Exercise Header */}
      <div className="w-full flex items-center gap-3 px-4 py-3.5">
        <button
          className="flex-shrink-0 text-muted-foreground/40 cursor-grab touch-none"
          style={{ touchAction: "none" }}
          onPointerDown={(e) => { e.preventDefault(); onDragHandlePointerDown(); }}
          data-testid={`button-drag-exercise-${exercise.id}`}
        >
          <GripVertical className="w-4 h-4" />
        </button>
        {/* Clickable area toggles expand */}
        <button
          className="flex items-center gap-3 flex-1 min-w-0 text-left"
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
            <div className="flex items-center gap-3">
              <h3 className="font-semibold text-sm leading-tight truncate">{exercise.exerciseName}</h3>
              {exercise.notes && (
                <span
                  role="button"
                  title="Edit note"
                  onClick={(e) => {
                    e.stopPropagation();
                    setNoteDraft(exercise.notes ?? "");
                    setNoteOpen(true);
                  }}
                  className="flex-shrink-0 p-0.5 -m-0.5 text-muted-foreground hover:text-foreground"
                >
                  <Edit2 className="w-3 h-3" />
                </span>
              )}
            </div>
            {exercise.muscleGroup && (
              <p className="text-[11px] text-muted-foreground">{exercise.muscleGroup}</p>
            )}
          </div>
        </button>

        <div className="flex items-center gap-1 flex-shrink-0">
          {allDone && <Check className="w-4 h-4 text-primary animate-spring-pop" />}

          {/* Previous session history button */}
          {lastSets.length > 0 && (
            <>
              <button
                ref={clockBtnRef}
                onClick={openHistory}
                className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${
                  historyOpen ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-muted/60"
                }`}
                title="Previous session"
              >
                <Clock className="w-4 h-4" />
              </button>

              {historyOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setHistoryOpen(false)} />
                  <div
                    className="fixed z-50 rounded-xl border border-border bg-card shadow-xl p-3 w-56"
                    style={{ top: historyPos.top, right: historyPos.right }}
                  >
                    <SectionLabel className="text-[10px] mb-2">Last Session</SectionLabel>
                    <div className="flex flex-col gap-1.5">
                      {lastSets.map((s, i) => (
                        <div key={i} className="flex items-center gap-2 text-[11px] font-mono">
                          <span className="text-muted-foreground w-3.5">{i + 1}</span>
                          <span className="font-semibold">
                            {s.weight > 0 ? `${toDisplay(s.weight, imperial)}${unitLabel(imperial)}` : "BW"}×{s.reps}
                          </span>
                          <span className="text-muted-foreground">
                            ({SET_TYPE_CONFIG[s.type]?.short ?? "N"})
                          </span>
                          {(s.partialReps ?? 0) > 0 && (
                            <span className="text-warning">+{s.partialReps}p</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground hover:bg-muted/60 transition-colors"
                data-testid={`button-exercise-menu-${exercise.id}`}
                title="Exercise options"
              >
                <MoreVertical className="w-4 h-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => { setNoteDraft(exercise.notes ?? ""); setNoteOpen(true); }}>
                <Edit2 className="w-3.5 h-3.5 mr-2" /> {exercise.notes ? "Edit note" : "Add note"}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={onRemoveExercise}
                className="text-destructive focus:text-destructive"
                data-testid={`menu-remove-exercise-${exercise.id}`}
              >
                <Trash2 className="w-3.5 h-3.5 mr-2" /> Remove exercise
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Note modal */}
          {noteOpen && (
            <Dialog open onOpenChange={(o) => !o && setNoteOpen(false)}>
              <DialogContent className="max-w-sm">
                <DialogHeader><DialogTitle>Exercise Note</DialogTitle></DialogHeader>
                <textarea
                  autoFocus
                  value={noteDraft}
                  onChange={(e) => setNoteDraft(e.target.value)}
                  placeholder="e.g. left shoulder clicking, go lighter next time…"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary resize-none"
                  rows={3}
                  maxLength={50}
                />
                <p className="text-[11px] text-muted-foreground text-right -mt-1">{noteDraft.length}/50</p>
                <div className="flex gap-2 justify-end">
                  {exercise.notes && (
                    <Button variant="ghost" className="text-destructive" onClick={() => { onUpdateNote(""); setNoteOpen(false); }}>
                      Delete
                    </Button>
                  )}
                  <Button variant="outline" onClick={() => setNoteOpen(false)}>Cancel</Button>
                  <Button onClick={() => { onUpdateNote(noteDraft.trim()); setNoteOpen(false); }}>Save</Button>
                </div>
              </DialogContent>
            </Dialog>
          )}
          <button onClick={onToggleExpand} className="w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground" data-testid={`button-chevron-exercise-${exercise.id}`}>
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Sets */}
      {expanded && (
        <div className="px-4 pb-4 flex flex-col gap-2">
          <ExerciseProgressSummary exercise={exercise} lastData={lastData} />

          {exercise.sets.map((set, setIdx) => (
            <SetRow
              key={set.id}
              set={set}
              index={setIdx}
              lastSet={lastData?.sets.filter(s => s.completed)[setIdx]}
              otherExercises={sessionExercises.filter((e) => e.id !== exercise.id)}
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

// ─── Superset Group ─────────────────────────────────────────────────────────
// Two or more exercises linked via a "superset" set, shown as one card with
// one shared header and a labeled, independently-editable set section per
// exercise underneath.

function SupersetGroup({
  exercises, sessionId, expanded, onToggleExpand,
  onUpdateSet, onAddSet, onRemoveSet, onToggleComplete, onCompleteAll,
  sessionExercises, onAddToSuperset,
}: {
  exercises: SessionExercise[];
  sessionId: string;
  expanded: boolean;
  onToggleExpand: () => void;
  onUpdateSet: (exerciseId: string, setId: string, updates: Partial<WorkoutSet>) => void;
  onAddSet: (exerciseId: string) => void;
  onRemoveSet: (exerciseId: string, setId: string) => void;
  onToggleComplete: (exerciseId: string, setId: string, set: WorkoutSet) => void;
  onCompleteAll: (exerciseId: string) => void;
  sessionExercises: SessionExercise[];
  onAddToSuperset: (targetExerciseId: string) => void;
}) {
  const completed = exercises.reduce((sum, ex) => sum + ex.sets.filter((s) => s.completed).length, 0);
  const total = exercises.reduce((sum, ex) => sum + ex.sets.length, 0);
  const memberIds = new Set(exercises.map((e) => e.id));
  const candidates = sessionExercises.filter((e) => !memberIds.has(e.id));
  const [pickerOpen, setPickerOpen] = useState(false);

  const allDone = completed === total && total > 0;

  return (
    <div
      className={`rounded-xl border bg-card overflow-hidden transition-all ${allDone ? "border-primary/30" : "border-card-border"}`}
      data-testid={`card-superset-${exercises[0].id}`}
    >
      <button
        className="w-full flex items-center gap-3 px-4 py-3.5 text-left"
        onClick={onToggleExpand}
        data-testid={`button-expand-superset-${exercises[0].id}`}
      >
        <div className="w-9 h-9 rounded-xl bg-accent/15 text-accent flex items-center justify-center flex-shrink-0">
          <Repeat className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-sm leading-tight truncate">
            {exercises.map((e) => e.exerciseName).join(" ⇄ ")}
          </h3>
          <p className="text-[11px] text-accent font-medium tabular-nums">Superset · {completed}/{total} sets</p>
        </div>
        {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground flex-shrink-0" /> : <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />}
      </button>

      {expanded && (
        <div className="px-4 pb-4 flex flex-col gap-4">
          {exercises.map((ex) => {
            const lastData = getLastSessionDataForExercise(ex.exerciseId, sessionId);
            return (
              <div key={ex.id} className="flex flex-col gap-2 pt-3 border-t border-border/50 first:border-t-0 first:pt-0">
                <p className="text-xs font-semibold">{ex.exerciseName}</p>
                <ExerciseProgressSummary exercise={ex} lastData={lastData} />
                {ex.sets.map((set, setIdx) => (
                  <SetRow
                    key={set.id}
                    set={set}
                    index={setIdx}
                    lastSet={lastData?.sets.filter((s) => s.completed)[setIdx]}
                    otherExercises={sessionExercises.filter((e) => e.id !== ex.id)}
                    onUpdate={(updates) => onUpdateSet(ex.id, set.id, updates)}
                    onRemove={() => onRemoveSet(ex.id, set.id)}
                    onToggleComplete={() => onToggleComplete(ex.id, set.id, set)}
                  />
                ))}
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => onAddSet(ex.id)} className="flex-1 gap-1.5">
                    <Plus className="w-3.5 h-3.5" /> Add Set
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => onCompleteAll(ex.id)} className="flex-1 gap-1.5">
                    <Check className="w-3.5 h-3.5" /> Done
                  </Button>
                </div>
              </div>
            );
          })}

          {candidates.length > 0 && (
            <DropdownMenu open={pickerOpen} onOpenChange={setPickerOpen}>
              <DropdownMenuTrigger asChild>
                <button className="w-full rounded-lg border-2 border-dashed border-border py-2 text-xs font-semibold text-muted-foreground hover:text-foreground flex items-center justify-center gap-1.5">
                  <Plus className="w-3.5 h-3.5" /> Add to superset
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="center">
                {candidates.map((ex) => (
                  <DropdownMenuItem key={ex.id} className="text-sm font-semibold" onClick={() => onAddToSuperset(ex.id)}>
                    {ex.exerciseName}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
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
          {allDone && <Check className="w-4 h-4 text-accent animate-spring-pop" />}
          {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </div>
      </button>

      {/* Entries */}
      {expanded && (
        <div className="px-4 pb-4 flex flex-col gap-2">
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
      className={`rounded-lg px-3 py-3 transition-all ${
        entry.completed ? "bg-accent/8 border border-accent/20" : "bg-muted/30"
      }`}
    >
      {/* Header: entry number + actions */}
      <div className="flex items-center justify-between mb-3">
        <span className={`text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center ${
          entry.completed ? "bg-accent text-accent-foreground" : "bg-muted text-muted-foreground"
        }`}>
          {index + 1}
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={onToggleComplete}
            className={`w-8 h-8 rounded-full flex items-center justify-center transition-all active:scale-90 ${
              entry.completed ? "bg-accent" : "border-2 border-accent/40"
            }`}
            title={entry.completed ? "Mark not done" : "Mark done"}
          >
            <Check className={`w-4 h-4 ${entry.completed ? "text-accent-foreground" : "text-accent/60"}`} />
          </button>
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

      {/* Minutes / Seconds aligned with Distance / Calories in one 2-col grid */}
      <div className="grid grid-cols-2 gap-3">
        <FieldBox label="Minutes">
          <NumberInput
            value={entry.timeMinutes}
            step={1}
            min={0}
            suffix="m"
            onChange={(v) => onUpdate({ timeMinutes: v })}
            disabled={entry.completed}
            testId={`input-time-minutes-${entry.id}`}
          />
        </FieldBox>
        <FieldBox label="Seconds">
          <NumberInput
            value={entry.timeSeconds}
            step={5}
            min={0}
            suffix="s"
            onChange={(v) => onUpdate({ timeSeconds: v })}
            disabled={entry.completed}
            testId={`input-time-seconds-${entry.id}`}
          />
        </FieldBox>
        <FieldBox label="Distance">
          <NumberInput
            value={entry.distance || 0}
            step={0.1}
            min={0}
            suffix="km"
            onChange={(v) => onUpdate({ distance: v || undefined })}
            disabled={entry.completed}
            testId={`input-distance-${entry.id}`}
          />
        </FieldBox>
        <FieldBox label="Calories">
          <NumberInput
            value={entry.calories || 0}
            step={10}
            min={0}
            suffix="cal"
            onChange={(v) => onUpdate({ calories: v || undefined })}
            disabled={entry.completed}
            testId={`input-calories-${entry.id}`}
          />
        </FieldBox>
      </div>
    </div>
  );
}

function FieldBox({ label, children, bare }: { label: string; children: React.ReactNode; bare?: boolean }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider text-center">{label}</span>
      {bare ? children : <div className="rounded-md bg-background/40 border border-border/40 py-1">{children}</div>}
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
      <DialogContent className="max-w-sm">
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
}: {
  exercise: SessionExercise;
  lastData: { sets: WorkoutSet[]; date: number } | null;
}) {
  const completedSets = exercise.sets.filter((s) => s.completed);
  if (completedSets.length === 0) return null;

  const totalReps = completedSets.reduce((sum, s) => sum + s.reps, 0);
  const totalPartial = completedSets.reduce((sum, s) => sum + (s.partialReps ?? 0), 0);

  return (
    <p className="text-[11px] text-muted-foreground px-1 mb-1">
      {completedSets.length} sets · {totalReps} reps{totalPartial > 0 ? ` + ${totalPartial}p` : ""}
    </p>
  );
}

// ─── Set Row ─────────────────────────────────────────────────────────────────

interface SetRowProps {
  set: WorkoutSet;
  index: number;
  lastSet?: WorkoutSet;
  otherExercises: SessionExercise[];
  onUpdate: (updates: Partial<WorkoutSet>) => void;
  onRemove: () => void;
  onToggleComplete: () => void;
}

const SET_TYPE_CONFIG: Record<SetType, { label: string; short: string; color: string }> = {
  normal: { label: "Normal", short: "N", color: "bg-muted text-muted-foreground" },
  warmup: { label: "Warmup", short: "W", color: "bg-[hsl(var(--chart-2))]/20 text-[hsl(var(--chart-2))] border border-[hsl(var(--chart-2))]/30" },
  assisted: { label: "Assisted", short: "A", color: "bg-primary/20 text-primary border border-primary/30" },
  failure: { label: "Failure", short: "F", color: "bg-destructive/20 text-destructive border border-destructive/30" },
  dropset: { label: "Dropset", short: "D", color: "bg-accent/20 text-accent border border-accent/30" },
  pyramid: { label: "Pyramid", short: "P", color: "bg-accent/20 text-accent border border-accent/30" },
  superset: { label: "Superset", short: "S", color: "bg-accent/20 text-accent border border-accent/30" },
};

const SET_TYPES: SetType[] = ["normal", "warmup", "assisted", "failure", "dropset", "pyramid", "superset"];

function SetRow({ set, index, lastSet, otherExercises, onUpdate, onRemove, onToggleComplete }: SetRowProps) {
  const { imperial } = useTheme();
  const typeConfig = SET_TYPE_CONFIG[set.type];
  const [typeOpen, setTypeOpen] = useState(false);
  const [pickingSuperset, setPickingSuperset] = useState(false);

  return (
    <div
      className={`rounded-lg px-3 py-3 transition-all ${
        set.completed ? "bg-primary/8 border border-primary/20" : "bg-muted/30"
      }`}
      data-testid={`row-set-${set.id}`}
    >
      {/* Header: set number + actions */}
      <div className="flex items-center justify-between mb-3">
        <span className={`text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center ${
          set.completed ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
        }`}>
          {index + 1}
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={onToggleComplete}
            className={`w-8 h-8 rounded-full flex items-center justify-center transition-all active:scale-90 ${
              set.completed ? "bg-primary animate-spring-pop" : "border-2 border-primary/40"
            }`}
            title={set.completed ? "Mark not done" : "Mark done"}
            data-testid={set.completed ? `button-uncomplete-set-${set.id}` : `button-complete-set-${set.id}`}
          >
            <Check className={`w-4 h-4 ${set.completed ? "text-primary-foreground" : "text-primary/60"}`} />
          </button>
          {!set.completed && (
            <button
              onClick={onRemove}
              className="w-8 h-8 rounded-full border border-destructive/40 flex items-center justify-center text-destructive hover:bg-destructive/10 transition-colors"
              title="Remove set"
              data-testid={`button-remove-set-${set.id}`}
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Weight / Reps / Type / Partial in a 2-col grid */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <FieldBox label="Weight">
            <NumberInput
              value={toDisplay(set.weight, imperial)}
              step={imperial ? 5 : 2.5}
              min={0}
              suffix={unitLabel(imperial)}
              onChange={(v) => onUpdate({ weight: fromDisplay(v, imperial) })}
              disabled={set.completed}
              testId={`input-weight-${set.id}`}
            />
          </FieldBox>
          {lastSet && lastSet.weight > 0 && (() => {
            const delta = toDisplay(set.weight, imperial) - toDisplay(lastSet.weight, imperial);
            return (
              <div className="flex justify-center mt-1">
                <TrendBadge
                  size="xs"
                  delta={delta}
                  text={`${delta > 0 ? "+" : ""}${delta % 1 === 0 ? delta : delta.toFixed(1)}${unitLabel(imperial)}`}
                />
              </div>
            );
          })()}
        </div>
        <div>
          <FieldBox label="Reps">
            <NumberInput
              value={set.reps}
              step={1}
              min={0}
              onChange={(v) => onUpdate({ reps: v })}
              disabled={set.completed}
              testId={`input-reps-${set.id}`}
            />
          </FieldBox>
          {lastSet && (
            <div className="flex justify-center mt-1">
              <TrendBadge
                size="xs"
                delta={set.reps - lastSet.reps}
                text={`${set.reps > lastSet.reps ? "+" : ""}${set.reps - lastSet.reps} reps`}
              />
            </div>
          )}
        </div>
        <FieldBox label="Type" bare>
          <DropdownMenu open={typeOpen} onOpenChange={(o) => { setTypeOpen(o); if (!o) setPickingSuperset(false); }}>
            <DropdownMenuTrigger asChild>
              <button
                disabled={set.completed}
                className={`w-full py-2.5 rounded-md text-xs font-semibold transition-colors truncate px-1 ${typeConfig.color} ${set.completed ? "opacity-60" : ""}`}
                data-testid={`button-set-type-${set.id}`}
              >
                {typeConfig.label}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="center">
              {!pickingSuperset ? (
                SET_TYPES.map((t) => (
                  <DropdownMenuItem
                    key={t}
                    className="text-sm font-semibold"
                    data-testid={`menu-set-type-${t}-${set.id}`}
                    onSelect={(e) => { if (t === "superset") e.preventDefault(); }}
                    onClick={() => {
                      if (t === "superset") { setPickingSuperset(true); return; }
                      onUpdate({ type: t, supersetExerciseId: undefined, supersetExerciseName: undefined });
                      setTypeOpen(false);
                    }}
                  >
                    {SET_TYPE_CONFIG[t].label}
                  </DropdownMenuItem>
                ))
              ) : otherExercises.length === 0 ? (
                <p className="px-3 py-2 text-xs text-muted-foreground max-w-[10rem]">No other exercises in this session</p>
              ) : (
                otherExercises.map((ex) => (
                  <DropdownMenuItem
                    key={ex.id}
                    className="text-sm font-semibold"
                    onClick={() => {
                      onUpdate({ type: "superset", supersetExerciseId: ex.id, supersetExerciseName: ex.exerciseName });
                      setTypeOpen(false);
                    }}
                  >
                    {ex.exerciseName}
                  </DropdownMenuItem>
                ))
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </FieldBox>
        <div>
          <FieldBox label="Partial">
            <NumberInput
              value={set.partialReps}
              step={1}
              min={0}
              suffix="p"
              onChange={(v) => onUpdate({ partialReps: v })}
              disabled={set.completed}
              testId={`input-partial-${set.id}`}
            />
          </FieldBox>
          {lastSet && (set.partialReps > 0 || lastSet.partialReps > 0) && (
            <div className="flex justify-center mt-1">
              <TrendBadge
                size="xs"
                delta={set.partialReps - lastSet.partialReps}
                text={`${set.partialReps > lastSet.partialReps ? "+" : ""}${set.partialReps - lastSet.partialReps}p`}
              />
            </div>
          )}
        </div>
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
  const valueRef = useRef(value);
  useEffect(() => { valueRef.current = value; }, [value]);
  const holdRef = useRef<{ timeout?: ReturnType<typeof setTimeout>; interval?: ReturnType<typeof setInterval> }>({});

  const display = value % 1 === 0 ? `${value}` : `${value}`;

  const step1 = (dir: 1 | -1) => {
    const next = Math.max(min, parseFloat((valueRef.current + dir * step).toFixed(2)));
    valueRef.current = next;
    onChange(next);
  };

  const startHold = (dir: 1 | -1) => {
    if (disabled) return;
    step1(dir);
    holdRef.current.timeout = setTimeout(() => {
      holdRef.current.interval = setInterval(() => step1(dir), 80);
    }, 400);
  };

  const stopHold = () => {
    clearTimeout(holdRef.current.timeout);
    clearInterval(holdRef.current.interval);
    holdRef.current = {};
  };

  useEffect(() => stopHold, []);

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
    <div className="flex items-center justify-between gap-1 px-1">
      <button
        onPointerDown={(e) => { e.preventDefault(); startHold(-1); }}
        onPointerUp={stopHold}
        onPointerLeave={stopHold}
        onPointerCancel={stopHold}
        disabled={disabled || value <= min}
        className="w-7 h-7 rounded-full flex items-center justify-center text-muted-foreground active:scale-90 transition-transform disabled:opacity-30 flex-shrink-0"
        data-testid={`${testId}-minus`}
      >
        <Minus className="w-3.5 h-3.5" />
      </button>
      <button
        onClick={() => { if (!disabled) { setRaw(`${value}`); setEditing(true); } }}
        className="flex-1 text-center text-sm font-bold py-1 tabular-nums"
        data-testid={testId}
        disabled={disabled}
      >
        {display}
        {suffix && <span className="text-[10px] font-normal text-muted-foreground ml-0.5">{suffix}</span>}
      </button>
      <button
        onPointerDown={(e) => { e.preventDefault(); startHold(1); }}
        onPointerUp={stopHold}
        onPointerLeave={stopHold}
        onPointerCancel={stopHold}
        disabled={disabled}
        className="w-7 h-7 rounded-full flex items-center justify-center text-muted-foreground active:scale-90 transition-transform disabled:opacity-30 flex-shrink-0"
        data-testid={`${testId}-plus`}
      >
        <Plus className="w-3.5 h-3.5" />
      </button>
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
  const [newMuscleGroup, setNewMuscleGroup] = useState<string>("");
  const exercises = getExercises();
  const filtered = exercises.filter(
    (e) =>
      e.name.toLowerCase().includes(search.toLowerCase()) &&
      !existingExerciseIds.includes(e.id)
  );

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
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
          <div className="flex flex-col pr-2">
            {filtered.length === 0 ? (
              search.trim() ? (
                <div className="flex flex-col gap-2 px-1 py-2">
                  <p className="text-xs text-muted-foreground">Muscle group (optional)</p>
                  <div className="flex flex-wrap gap-1.5">
                    {MUSCLE_GROUPS.map((mg) => (
                      <button
                        key={mg}
                        onClick={() => setNewMuscleGroup((v) => (v === mg ? "" : mg))}
                        className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                          newMuscleGroup === mg
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-muted/30 text-muted-foreground border-border"
                        }`}
                        data-testid={`button-new-exercise-muscle-group-${mg}`}
                      >
                        {mg}
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={() => {
                      const created = createExercise(search.trim(), newMuscleGroup || undefined);
                      onAdd(created.id, created.name, created.muscleGroup);
                    }}
                    className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-left bg-muted/30 mt-1"
                    data-testid="button-create-exercise-session"
                  >
                    <Plus className="w-4 h-4 text-primary flex-shrink-0" />
                    <p className="text-sm font-medium">Create “{search.trim()}”</p>
                  </button>
                </div>
              ) : (
                <p className="text-center text-sm text-muted-foreground py-8">No exercises found</p>
              )
            ) : search.trim() ? (
              filtered.map((ex) => (
                <button key={ex.id} onClick={() => onAdd(ex.id, ex.name, ex.muscleGroup)}
                  className="flex items-center justify-between px-3 py-2.5 rounded-lg text-left bg-muted/30 mb-1"
                  data-testid={`button-select-exercise-${ex.id}`}>
                  <div>
                    <p className="text-sm font-medium">{ex.name}</p>
                    {ex.muscleGroup && <p className="text-xs text-muted-foreground">{ex.muscleGroup}</p>}
                  </div>
                  <Plus className="w-4 h-4 text-primary" />
                </button>
              ))
            ) : (
              Object.entries(
                filtered.reduce<Record<string, typeof filtered>>((acc, ex) => {
                  const g = ex.muscleGroup ?? "Other";
                  (acc[g] ??= []).push(ex);
                  return acc;
                }, {})
              ).sort(([a], [b]) => a.localeCompare(b)).map(([group, exs]) => (
                <div key={group}>
                  <SectionLabel className="px-3 py-1.5 bg-muted/20 rounded-md mt-1">{group}</SectionLabel>
                  {exs.map((ex) => (
                    <button key={ex.id} onClick={() => onAdd(ex.id, ex.name, ex.muscleGroup)}
                      className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-left hover:bg-muted/30"
                      data-testid={`button-select-exercise-${ex.id}`}>
                      <p className="text-sm font-medium">{ex.name}</p>
                      <Plus className="w-4 h-4 text-primary" />
                    </button>
                  ))}
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
