import { useState, useEffect } from "react";
import { Search, Plus, Edit2, Trash2, Dumbbell, ChevronRight, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  getExercises, createExercise, updateExercise, deleteExercise, restoreExercise,
  getPersonalBests, getSessionsByExercise
} from "@/lib/storage";
import type { Exercise, PersonalBest } from "@/lib/types";
import { MUSCLE_GROUPS } from "@/lib/types";
import { formatDate } from "@/lib/hooks";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";

// Minimal monochrome: one quiet neutral badge for every muscle group.
const NEUTRAL_BADGE = "bg-muted/70 text-muted-foreground border border-border/50";
const MUSCLE_GROUP_COLORS: Record<string, string> = {
  Chest: NEUTRAL_BADGE,
  Back: NEUTRAL_BADGE,
  Shoulders: NEUTRAL_BADGE,
  Biceps: NEUTRAL_BADGE,
  Triceps: NEUTRAL_BADGE,
  Legs: NEUTRAL_BADGE,
  Glutes: NEUTRAL_BADGE,
  Core: NEUTRAL_BADGE,
  Cardio: NEUTRAL_BADGE,
  "Full Body": NEUTRAL_BADGE,
  Other: NEUTRAL_BADGE,
};

export default function Exercises() {
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [pbs, setPbs] = useState<PersonalBest[]>([]);
  const [search, setSearch] = useState("");
  const [filterGroup, setFilterGroup] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editExercise, setEditExercise] = useState<Exercise | null>(null);
  const [viewExercise, setViewExercise] = useState<Exercise | null>(null);
  const [form, setForm] = useState({ name: "", muscleGroup: "" });
  const { toast } = useToast();

  useEffect(() => {
    setExercises(getExercises());
    setPbs(getPersonalBests());
  }, []);

  const refresh = () => {
    setExercises(getExercises());
    setPbs(getPersonalBests());
  };

  const handleCreate = () => {
    const name = form.name.trim();
    if (!name) return;
    const dupe = exercises.find((e) => e.name.trim().toLowerCase() === name.toLowerCase());
    if (dupe) {
      toast({
        title: "Exercise already exists",
        description: `“${dupe.name}” is already in your list.`,
      });
      return;
    }
    createExercise(name, form.muscleGroup || undefined);
    setForm({ name: "", muscleGroup: "" });
    setShowCreate(false);
    refresh();
  };

  const handleEdit = () => {
    if (!editExercise || !form.name.trim()) return;
    const name = form.name.trim();
    const dupe = exercises.find(
      (e) => e.id !== editExercise.id && e.name.trim().toLowerCase() === name.toLowerCase()
    );
    if (dupe) {
      toast({
        title: "Exercise already exists",
        description: `“${dupe.name}” is already in your list.`,
      });
      return;
    }
    updateExercise(editExercise.id, { name, muscleGroup: form.muscleGroup || undefined });
    setEditExercise(null);
    refresh();
  };

  const handleDelete = (ex: Exercise) => {
    deleteExercise(ex.id);
    refresh();
    toast({
      title: "Exercise deleted",
      description: `“${ex.name}” was removed. Historical data was preserved.`,
      action: (
        <ToastAction altText="Undo delete" onClick={() => { restoreExercise(ex); refresh(); }}>
          Undo
        </ToastAction>
      ),
    });
  };

  const openEdit = (ex: Exercise) => {
    setEditExercise(ex);
    setForm({ name: ex.name, muscleGroup: ex.muscleGroup ?? "" });
  };

  const filtered = exercises.filter((ex) => {
    const matchSearch = ex.name.toLowerCase().includes(search.toLowerCase());
    const matchGroup = !filterGroup || (ex.muscleGroup ?? "Other") === filterGroup;
    return matchSearch && matchGroup;
  });

  const grouped = filtered.reduce<Record<string, Exercise[]>>((acc, ex) => {
    const key = ex.muscleGroup ?? "Other";
    if (!acc[key]) acc[key] = [];
    acc[key].push(ex);
    return acc;
  }, {});

  const muscleGroups = Object.keys(grouped).sort();
  // Only show filter groups that actually have exercises
  const availableGroups = MUSCLE_GROUPS.filter((mg) =>
    exercises.some((ex) => (ex.muscleGroup ?? "Other") === mg)
  );
  const pbMap = new Map(pbs.map((pb) => [pb.exerciseId, pb]));

  return (
    <div className="flex flex-col min-h-full pb-20">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-background/95 backdrop-blur-md border-b border-border">
        <div className="max-w-lg mx-auto px-4 pt-4 pb-3">
          <h1 className="text-3xl font-bold tracking-tight mb-3">Exercises</h1>

          <div className="flex items-center gap-2 mb-3">
            {/* Search */}
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="search"
                placeholder="Search exercises..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 rounded-full border border-input bg-muted/40 text-sm outline-none focus:ring-1 focus:ring-primary"
                data-testid="input-search-exercises"
              />
            </div>
            <Button
              onClick={() => setShowCreate(true)}
              data-testid="button-create-exercise"
              className="gap-1.5 flex-shrink-0 rounded-full"
            >
              <Plus className="w-4 h-4" />
              New
            </Button>
          </div>

          {/* Muscle group filter tabs */}
          {availableGroups.length > 0 && (
            <div className="flex gap-4 overflow-x-auto pb-1 [&::-webkit-scrollbar]:hidden">
              <button
                onClick={() => setFilterGroup(null)}
                className={`flex-shrink-0 text-sm transition-colors ${
                  !filterGroup ? "font-bold text-foreground" : "text-muted-foreground"
                }`}
              >
                All
              </button>
              {availableGroups.map((mg) => (
                <button
                  key={mg}
                  onClick={() => setFilterGroup(filterGroup === mg ? null : mg)}
                  className={`flex-shrink-0 text-sm transition-colors ${
                    filterGroup === mg ? "font-bold text-foreground" : "text-muted-foreground"
                  }`}
                  data-testid={`filter-${mg}`}
                >
                  {mg}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="max-w-lg mx-auto w-full px-4 py-3 flex flex-col gap-4">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-4">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
              <Dumbbell className="w-8 h-8 text-muted-foreground" />
            </div>
            <div className="text-center">
              <p className="font-semibold">
                {search ? "No exercises found" : "No exercises yet"}
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                {search ? "Try a different search" : "Create your first exercise"}
              </p>
            </div>
            {!search && (
              <Button size="sm" onClick={() => setShowCreate(true)} data-testid="button-create-first-exercise">
                Create exercise
              </Button>
            )}
          </div>
        ) : (
          muscleGroups.map((group) => (
            <div key={group}>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 px-1">
                {group}
              </h2>
              <div className="rounded-xl border border-card-border bg-card overflow-hidden divide-y divide-border/50">
                {grouped[group].map((ex) => {
                  const pb = pbMap.get(ex.id);
                  return (
                    <button
                      key={ex.id}
                      className="w-full flex items-center gap-3 px-4 py-3 text-left hover-elevate"
                      onClick={() => setViewExercise(ex)}
                      data-testid={`row-exercise-${ex.id}`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-base truncate">{ex.name}</span>
                          {pb && (
                            <span className="flex-shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-amber-500/15 text-amber-600 border border-amber-500/30">
                              PB
                            </span>
                          )}
                        </div>
                        {pb && (
                          <p className="text-sm text-muted-foreground">
                            Personal best: {pb.weight}kg × {pb.reps}
                          </p>
                        )}
                      </div>

                      <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    </button>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Create / Edit Dialog */}
      <Dialog
        open={showCreate || !!editExercise}
        onOpenChange={(o) => { if (!o) { setShowCreate(false); setEditExercise(null); setForm({ name: "", muscleGroup: "" }); } }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{editExercise ? "Edit Exercise" : "New Exercise"}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ex-name">Exercise Name</Label>
              <Input
                id="ex-name"
                placeholder="e.g. Bench Press"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                data-testid="input-exercise-name"
                autoFocus
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Muscle Group</Label>
              <Select
                value={form.muscleGroup}
                onValueChange={(v) => setForm((f) => ({ ...f, muscleGroup: v }))}
              >
                <SelectTrigger data-testid="select-muscle-group">
                  <SelectValue placeholder="Select muscle group" />
                </SelectTrigger>
                <SelectContent>
                  {MUSCLE_GROUPS.map((mg) => (
                    <SelectItem key={mg} value={mg}>{mg}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => { setShowCreate(false); setEditExercise(null); }}
            >
              Cancel
            </Button>
            <Button
              onClick={editExercise ? handleEdit : handleCreate}
              disabled={!form.name.trim()}
              data-testid="button-save-exercise"
            >
              {editExercise ? "Save" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Exercise Dialog */}
      {viewExercise && (
        <ExerciseDetailDialog
          exercise={viewExercise}
          pb={pbMap.get(viewExercise.id)}
          onEdit={() => { openEdit(viewExercise); setViewExercise(null); }}
          onDelete={() => { handleDelete(viewExercise); setViewExercise(null); }}
          onClose={() => setViewExercise(null)}
        />
      )}
    </div>
  );
}

function ExerciseDetailDialog({
  exercise, pb, onEdit, onDelete, onClose
}: {
  exercise: Exercise;
  pb?: PersonalBest;
  onEdit: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const sessions = getSessionsByExercise(exercise.id);
  const recentSessions = sessions.slice(0, 5);

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <div className="flex items-start justify-between gap-2">
            <div>
              <DialogTitle className="text-left">{exercise.name}</DialogTitle>
              {exercise.muscleGroup && (
                <Badge
                  variant="secondary"
                  className={`mt-1 text-[11px] ${MUSCLE_GROUP_COLORS[exercise.muscleGroup] ?? ""}`}
                >
                  {exercise.muscleGroup}
                </Badge>
              )}
            </div>
          </div>
        </DialogHeader>

        {/* Personal Best */}
        {pb && (
          <div
            className="rounded-lg px-4 py-3 flex items-center gap-3"
            style={{ background: "hsl(var(--accent) / 0.12)", border: "1px solid hsl(var(--accent) / 0.25)" }}
          >
            <Trophy className="w-5 h-5 text-accent flex-shrink-0" />
            <div>
              <p className="text-xs font-semibold text-accent">Personal Best</p>
              <p className="text-sm font-bold">{pb.weight}kg × {pb.reps} reps</p>
              <p className="text-[11px] text-muted-foreground">{formatDate(pb.achievedAt)}</p>
            </div>
          </div>
        )}

        {/* Recent history */}
        {recentSessions.length > 0 && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Recent Sessions</p>
            <div className="flex flex-col gap-2">
              {recentSessions.map((session) => {
                const ex = session.exercises.find((e) => e.exerciseId === exercise.id);
                const completedSets = ex?.sets.filter((s) => s.completed) ?? [];
                return (
                  <div key={session.id} className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
                    <span className="text-xs text-muted-foreground">{formatDate(session.startedAt)}</span>
                    <div className="flex flex-wrap gap-1 justify-end">
                      {completedSets.slice(0, 3).map((s, i) => (
                        <span key={i} className="text-xs font-mono font-medium bg-muted px-1.5 py-0.5 rounded">
                          {s.weight > 0 ? `${s.weight}kg` : "BW"}×{s.reps}
                        </span>
                      ))}
                      {completedSets.length > 3 && (
                        <span className="text-xs text-muted-foreground">+{completedSets.length - 3}</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="flex gap-2 pt-1">
          <Button variant="outline" size="sm" onClick={onEdit} className="flex-1 gap-1.5" data-testid="button-edit-exercise">
            <Edit2 className="w-3.5 h-3.5" /> Edit
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onDelete}
            className="flex-1 gap-1.5 text-destructive"
            data-testid="button-delete-exercise"
          >
            <Trash2 className="w-3.5 h-3.5" /> Delete
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
