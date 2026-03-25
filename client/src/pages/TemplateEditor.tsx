import { useState, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { ArrowLeft, Plus, Trash2, Search, GripVertical, Dumbbell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  getTemplate, getExercises, addExerciseToTemplate, removeExerciseFromTemplate
} from "@/lib/storage";
import type { WorkoutTemplate, Exercise } from "@/lib/types";

export default function TemplateEditor() {
  const params = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const [template, setTemplate] = useState<WorkoutTemplate | null>(null);
  const [showAddExercise, setShowAddExercise] = useState(false);
  const [search, setSearch] = useState("");
  const [exercises, setExercises] = useState<Exercise[]>([]);

  useEffect(() => {
    const t = getTemplate(params.id);
    if (!t) { navigate("/"); return; }
    setTemplate(t);
    setExercises(getExercises());
  }, [params.id]);

  const refresh = () => {
    const t = getTemplate(params.id);
    if (t) setTemplate(t);
  };

  const handleAdd = (ex: Exercise) => {
    addExerciseToTemplate(params.id, ex.id, ex.name, ex.muscleGroup);
    refresh();
    setShowAddExercise(false);
    setSearch("");
  };

  const handleRemove = (templateExerciseId: string) => {
    removeExerciseFromTemplate(params.id, templateExerciseId);
    refresh();
  };

  const existingIds = template?.exercises.map((e) => e.exerciseId) ?? [];
  const filteredExercises = exercises.filter(
    (e) =>
      !existingIds.includes(e.id) &&
      e.name.toLowerCase().includes(search.toLowerCase())
  );

  if (!template) return null;

  return (
    <div className="flex flex-col min-h-full pb-20">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-background/95 backdrop-blur-md border-b border-border">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          <Button
            size="icon"
            variant="ghost"
            onClick={() => navigate("/")}
            data-testid="button-back"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <div
                className="w-3 h-3 rounded-full flex-shrink-0"
                style={{ backgroundColor: template.color ?? "#3b82f6" }}
              />
              <h1 className="font-bold text-base truncate">{template.name}</h1>
            </div>
            <p className="text-xs text-muted-foreground">Edit exercises</p>
          </div>
          <Button
            size="sm"
            onClick={() => setShowAddExercise(true)}
            data-testid="button-add-exercise-template"
            className="gap-1.5"
          >
            <Plus className="w-4 h-4" />
            Add
          </Button>
        </div>
      </div>

      <div className="max-w-lg mx-auto w-full px-4 py-4 flex flex-col gap-3">
        {template.exercises.length === 0 ? (
          <div
            className="rounded-xl border-2 border-dashed border-border p-10 flex flex-col items-center gap-3 cursor-pointer"
            onClick={() => setShowAddExercise(true)}
          >
            <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center">
              <Plus className="w-7 h-7 text-muted-foreground" />
            </div>
            <div className="text-center">
              <p className="font-semibold text-sm">Add exercises</p>
              <p className="text-xs text-muted-foreground mt-1">Build your workout routine</p>
            </div>
          </div>
        ) : (
          template.exercises
            .sort((a, b) => a.order - b.order)
            .map((ex, idx) => (
              <div
                key={ex.id}
                className="flex items-center gap-3 rounded-xl border border-card-border bg-card px-4 py-3 animate-fade-in"
                data-testid={`row-template-exercise-${ex.id}`}
              >
                <div className="flex items-center justify-center text-muted-foreground/40 cursor-grab">
                  <GripVertical className="w-4 h-4" />
                </div>

                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0"
                  style={{ background: "hsl(var(--muted))", color: "hsl(var(--muted-foreground))" }}
                >
                  {idx + 1}
                </div>

                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{ex.exerciseName}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    {ex.muscleGroup && (
                      <span className="text-[11px] text-muted-foreground">{ex.muscleGroup}</span>
                    )}
                    <span className="text-[11px] text-muted-foreground">{ex.defaultSets} sets</span>
                  </div>
                </div>

                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => handleRemove(ex.id)}
                  data-testid={`button-remove-exercise-${ex.id}`}
                  className="flex-shrink-0 text-muted-foreground"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            ))
        )}
      </div>

      {/* Add Exercise Dialog */}
      <Dialog open={showAddExercise} onOpenChange={(o) => { setShowAddExercise(o); if (!o) setSearch(""); }}>
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
            data-testid="input-search-add-exercise"
            autoFocus
          />
          <ScrollArea className="h-64">
            <div className="flex flex-col gap-1 pr-2">
              {filteredExercises.length === 0 ? (
                <p className="text-center text-sm text-muted-foreground py-8">No exercises found</p>
              ) : (
                filteredExercises.map((ex) => (
                  <button
                    key={ex.id}
                    onClick={() => handleAdd(ex)}
                    className="flex items-center justify-between px-3 py-2.5 rounded-lg hover-elevate text-left bg-muted/30"
                    data-testid={`button-add-exercise-${ex.id}`}
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
    </div>
  );
}
