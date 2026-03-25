import { useState, useEffect } from "react";
import { Search, Plus, Edit2, Trash2, Dumbbell, ChevronRight, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  getExercises, createExercise, updateExercise, deleteExercise,
  getPersonalBests, getSessionsByExercise
} from "@/lib/storage";
import type { Exercise, PersonalBest } from "@/lib/types";
import { MUSCLE_GROUPS } from "@/lib/types";
import { formatDate } from "@/lib/hooks";

const MUSCLE_GROUP_COLORS: Record<string, string> = {
  Chest: "bg-orange-500/15 text-orange-500",
  Back: "bg-blue-500/15 text-blue-500",
  Shoulders: "bg-purple-500/15 text-purple-500",
  Biceps: "bg-green-500/15 text-green-500",
  Triceps: "bg-cyan-500/15 text-cyan-500",
  Legs: "bg-red-500/15 text-red-500",
  Glutes: "bg-pink-500/15 text-pink-500",
  Core: "bg-yellow-500/15 text-yellow-500",
  Cardio: "bg-emerald-500/15 text-emerald-500",
  "Full Body": "bg-indigo-500/15 text-indigo-500",
  Other: "bg-muted text-muted-foreground",
};

export default function Exercises() {
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [pbs, setPbs] = useState<PersonalBest[]>([]);
  const [search, setSearch] = useState("");
  const [filterGroup, setFilterGroup] = useState<string>("all");
  const [showCreate, setShowCreate] = useState(false);
  const [editExercise, setEditExercise] = useState<Exercise | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [viewExercise, setViewExercise] = useState<Exercise | null>(null);
  const [form, setForm] = useState({ name: "", muscleGroup: "" });

  useEffect(() => {
    setExercises(getExercises());
    setPbs(getPersonalBests());
  }, []);

  const refresh = () => {
    setExercises(getExercises());
    setPbs(getPersonalBests());
  };

  const handleCreate = () => {
    if (!form.name.trim()) return;
    createExercise(form.name, form.muscleGroup || undefined);
    setForm({ name: "", muscleGroup: "" });
    setShowCreate(false);
    refresh();
  };

  const handleEdit = () => {
    if (!editExercise || !form.name.trim()) return;
    updateExercise(editExercise.id, { name: form.name, muscleGroup: form.muscleGroup || undefined });
    setEditExercise(null);
    refresh();
  };

  const handleDelete = () => {
    if (!deleteId) return;
    deleteExercise(deleteId);
    setDeleteId(null);
    refresh();
  };

  const openEdit = (ex: Exercise) => {
    setEditExercise(ex);
    setForm({ name: ex.name, muscleGroup: ex.muscleGroup ?? "" });
  };

  const filtered = exercises.filter((ex) => {
    const matchSearch = ex.name.toLowerCase().includes(search.toLowerCase());
    const matchGroup = filterGroup === "all" || ex.muscleGroup === filterGroup;
    return matchSearch && matchGroup;
  });

  const grouped = filtered.reduce<Record<string, Exercise[]>>((acc, ex) => {
    const key = ex.muscleGroup ?? "Other";
    if (!acc[key]) acc[key] = [];
    acc[key].push(ex);
    return acc;
  }, {});

  const muscleGroups = Object.keys(grouped).sort();
  const pbMap = new Map(pbs.map((pb) => [pb.exerciseId, pb]));

  return (
    <div className="flex flex-col min-h-full pb-20">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-background/95 backdrop-blur-md border-b border-border">
        <div className="max-w-lg mx-auto px-4 pt-4 pb-3">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h1 className="text-xl font-bold tracking-tight">Exercises</h1>
              <p className="text-xs text-muted-foreground mt-0.5">{exercises.length} exercises</p>
            </div>
            <Button
              size="sm"
              onClick={() => setShowCreate(true)}
              data-testid="button-create-exercise"
              className="gap-1.5"
            >
              <Plus className="w-4 h-4" />
              New
            </Button>
          </div>

          {/* Search */}
          <div className="relative mb-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="search"
              placeholder="Search exercises..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 rounded-lg border border-input bg-background text-sm outline-none focus:ring-1 focus:ring-primary"
              data-testid="input-search-exercises"
            />
          </div>

          {/* Muscle group filter */}
          <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
            <FilterChip
              active={filterGroup === "all"}
              onClick={() => setFilterGroup("all")}
              label="All"
            />
            {MUSCLE_GROUPS.map((mg) => (
              <FilterChip
                key={mg}
                active={filterGroup === mg}
                onClick={() => setFilterGroup(mg)}
                label={mg}
              />
            ))}
          </div>
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
                      <div
                        className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                        style={{ background: "hsl(var(--muted))" }}
                      >
                        <Dumbbell className="w-4 h-4 text-muted-foreground" />
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm truncate">{ex.name}</span>
                          {pb && <Trophy className="w-3 h-3 text-accent flex-shrink-0" />}
                        </div>
                        {pb && (
                          <p className="text-[11px] text-muted-foreground">
                            PB: {pb.weight}kg × {pb.reps}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        {ex.muscleGroup && (
                          <Badge
                            variant="secondary"
                            className={`text-[10px] ${MUSCLE_GROUP_COLORS[ex.muscleGroup] ?? "bg-muted text-muted-foreground"}`}
                          >
                            {ex.muscleGroup}
                          </Badge>
                        )}
                        <ChevronRight className="w-4 h-4 text-muted-foreground" />
                      </div>
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
        <DialogContent className="max-w-sm mx-4">
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
                    <SelectItem key={mg} value={mg}>
                      {mg}
                    </SelectItem>
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
          onDelete={() => { setDeleteId(viewExercise.id); setViewExercise(null); }}
          onClose={() => setViewExercise(null)}
        />
      )}

      {/* Delete Dialog */}
      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete exercise?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this exercise. Historical data will be preserved.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground"
              data-testid="button-confirm-delete-exercise"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function FilterChip({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
        active
          ? "bg-primary text-primary-foreground"
          : "bg-muted text-muted-foreground"
      }`}
    >
      {label}
    </button>
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
      <DialogContent className="max-w-sm mx-4">
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
            style={{ background: "hsl(28 90% 58% / 0.12)", border: "1px solid hsl(28 90% 58% / 0.25)" }}
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
