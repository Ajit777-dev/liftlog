import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Plus, ChevronRight, Clock, Dumbbell, Copy, Trash2, Edit2, MoreHorizontal, Play, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  getTemplates, createTemplate, deleteTemplate, duplicateTemplate,
  updateTemplate, getActiveSession, getLastSessionForTemplate
} from "@/lib/storage";
import type { WorkoutTemplate } from "@/lib/types";
import { formatDate } from "@/lib/hooks";
import { LiftLogLogo } from "@/components/LiftLogLogo";

const TEMPLATE_COLORS = [
  "#3b82f6", "#f97316", "#22c55e", "#a855f7",
  "#ef4444", "#06b6d4", "#f59e0b", "#ec4899",
];

export default function Home() {
  const [, navigate] = useLocation();
  const [templates, setTemplates] = useState<WorkoutTemplate[]>([]);
  const [activeSession, setActiveSession] = useState(getActiveSession());
  const [showCreate, setShowCreate] = useState(false);
  const [editTemplate, setEditTemplate] = useState<WorkoutTemplate | null>(null);
  const [form, setForm] = useState({ name: "", description: "", color: TEMPLATE_COLORS[0] });

  useEffect(() => {
    setTemplates(getTemplates());
    setActiveSession(getActiveSession());
  }, []);

  const refresh = () => setTemplates(getTemplates());

  const handleCreate = () => {
    if (!form.name.trim()) return;
    createTemplate(form.name, form.description || undefined, form.color);
    setForm({ name: "", description: "", color: TEMPLATE_COLORS[0] });
    setShowCreate(false);
    refresh();
  };

  const handleEdit = () => {
    if (!editTemplate || !form.name.trim()) return;
    updateTemplate(editTemplate.id, { name: form.name, description: form.description || undefined, color: form.color });
    setEditTemplate(null);
    refresh();
  };

  const openEdit = (t: WorkoutTemplate) => {
    setEditTemplate(t);
    setForm({ name: t.name, description: t.description ?? "", color: t.color ?? TEMPLATE_COLORS[0] });
  };

  const handleDuplicate = (id: string) => {
    duplicateTemplate(id);
    refresh();
  };

  const handleDelete = (id: string) => {
    deleteTemplate(id);
    refresh();
  };

  const startSession = (template: WorkoutTemplate) => {
    navigate(`/session/${template.id}`);
  };

  const getTotalSets = (t: WorkoutTemplate) =>
    t.exercises.reduce((sum, e) => sum + e.defaultSets, 0);

  return (
    <div className="flex flex-col min-h-full pb-20">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-background/95 backdrop-blur-md border-b border-border">
        <div className="max-w-lg mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <LiftLogLogo size={20} />
              <h1 className="text-xl font-bold tracking-tight">LiftLog</h1>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
            </p>
          </div>
          <Button
            size="sm"
            onClick={() => setShowCreate(true)}
            data-testid="button-create-template"
            className="gap-1.5"
          >
            <Plus className="w-4 h-4" />
            New
          </Button>
        </div>
      </div>

      <div className="max-w-lg mx-auto w-full px-4 py-4 flex flex-col gap-4">
        {/* Active session banner */}
        {activeSession && (
          <div
            className="rounded-xl p-4 flex items-center justify-between cursor-pointer animate-fade-in"
            style={{ background: "linear-gradient(135deg, hsl(217 91% 55% / 0.2), hsl(217 91% 55% / 0.08))", border: "1px solid hsl(217 91% 55% / 0.3)" }}
            onClick={() => navigate(`/session/${activeSession.templateId}`)}
            data-testid="banner-active-session"
          >
            <div className="flex items-center gap-3">
              <div className="w-2.5 h-2.5 rounded-full bg-primary animate-pulse" />
              <div>
                <p className="font-semibold text-sm text-primary">Session in progress</p>
                <p className="text-xs text-muted-foreground">{activeSession.templateName}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Resume</span>
              <ChevronRight className="w-4 h-4 text-primary" />
            </div>
          </div>
        )}

        {/* Templates */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              My Workouts
            </h2>
            <span className="text-xs text-muted-foreground">{templates.length} templates</span>
          </div>

          {templates.length === 0 ? (
            <div
              className="rounded-xl border-2 border-dashed border-border p-10 flex flex-col items-center gap-3 cursor-pointer hover-elevate"
              onClick={() => setShowCreate(true)}
            >
              <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center">
                <Plus className="w-7 h-7 text-muted-foreground" />
              </div>
              <div className="text-center">
                <p className="font-semibold text-sm">Create your first workout</p>
                <p className="text-xs text-muted-foreground mt-1">Tap to add a template</p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {templates.map((template) => {
                const lastSession = getLastSessionForTemplate(template.id);
                return (
                  <TemplateCard
                    key={template.id}
                    template={template}
                    lastSession={lastSession}
                    totalSets={getTotalSets(template)}
                    onStart={() => startSession(template)}
                    onEdit={() => openEdit(template)}
                    onDuplicate={() => handleDuplicate(template.id)}
                    onDelete={() => handleDelete(template.id)}
                  />
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={showCreate || !!editTemplate} onOpenChange={(o) => { if (!o) { setShowCreate(false); setEditTemplate(null); setForm({ name: "", description: "", color: TEMPLATE_COLORS[0] }); } }}>
        <DialogContent className="max-w-sm mx-4">
          <DialogHeader>
            <DialogTitle>{editTemplate ? "Edit Workout" : "New Workout"}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="template-name">Name</Label>
              <Input
                id="template-name"
                placeholder="e.g. Push Day, Legs..."
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                data-testid="input-template-name"
                autoFocus
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="template-desc">Description (optional)</Label>
              <Textarea
                id="template-desc"
                placeholder="e.g. Chest, shoulders & triceps"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                data-testid="input-template-description"
                className="resize-none text-sm"
                rows={2}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Color</Label>
              <div className="flex gap-2 flex-wrap">
                {TEMPLATE_COLORS.map((color) => (
                  <button
                    key={color}
                    data-testid={`color-${color}`}
                    onClick={() => setForm((f) => ({ ...f, color }))}
                    className={`w-8 h-8 rounded-full transition-all ${form.color === color ? "ring-2 ring-offset-2 ring-offset-background ring-foreground scale-110" : ""}`}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowCreate(false); setEditTemplate(null); }}>Cancel</Button>
            <Button
              onClick={editTemplate ? handleEdit : handleCreate}
              disabled={!form.name.trim()}
              data-testid="button-save-template"
            >
              {editTemplate ? "Save" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface TemplateCardProps {
  template: WorkoutTemplate;
  lastSession?: ReturnType<typeof getLastSessionForTemplate>;
  totalSets: number;
  onStart: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}

function TemplateCard({ template, lastSession, totalSets, onStart, onEdit, onDuplicate, onDelete }: TemplateCardProps) {
  const color = template.color ?? "#3b82f6";
  const [, navigate] = useLocation();

  return (
    <div
      className="rounded-xl border border-card-border bg-card overflow-hidden animate-fade-in"
      data-testid={`card-template-${template.id}`}
    >
      {/* Color accent bar */}
      <div className="h-1" style={{ backgroundColor: color }} />

      <div className="p-4">
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-base leading-tight truncate">{template.name}</h3>
            {template.description && (
              <p className="text-xs text-muted-foreground mt-0.5 truncate">{template.description}</p>
            )}
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="icon" variant="ghost" data-testid={`button-template-menu-${template.id}`}>
                <MoreHorizontal className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onEdit} data-testid={`menu-edit-${template.id}`}>
                <Edit2 className="w-3.5 h-3.5 mr-2" /> Edit Info
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate(`/template/${template.id}/edit`)} data-testid={`menu-manage-exercises-${template.id}`}>
                <Settings className="w-3.5 h-3.5 mr-2" /> Manage Exercises
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onDuplicate} data-testid={`menu-duplicate-${template.id}`}>
                <Copy className="w-3.5 h-3.5 mr-2" /> Duplicate
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={onDelete}
                className="text-destructive focus:text-destructive"
                data-testid={`menu-delete-${template.id}`}
              >
                <Trash2 className="w-3.5 h-3.5 mr-2" /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Exercise pills */}
        <div className="flex flex-wrap gap-1.5 mb-4">
          {template.exercises.slice(0, 4).map((ex) => (
            <Badge
              key={ex.id}
              variant="secondary"
              className="text-[10px] font-medium px-2"
            >
              {ex.exerciseName}
            </Badge>
          ))}
          {template.exercises.length > 4 && (
            <Badge variant="secondary" className="text-[10px]">
              +{template.exercises.length - 4} more
            </Badge>
          )}
          {template.exercises.length === 0 && (
            <span className="text-xs text-muted-foreground italic">No exercises added</span>
          )}
        </div>

        {/* Stats row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <Dumbbell className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">
                {template.exercises.length} {template.exercises.length === 1 ? "exercise" : "exercises"}
              </span>
            </div>
            {lastSession && (
              <div className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">{formatDate(lastSession.startedAt)}</span>
              </div>
            )}
          </div>

          <Button
            size="sm"
            onClick={onStart}
            data-testid={`button-start-${template.id}`}
            className="gap-1.5 font-semibold"
            style={{
              backgroundColor: color,
              borderColor: color,
              color: "white",
            }}
          >
            <Play className="w-3.5 h-3.5 fill-white" />
            Start
          </Button>
        </div>
      </div>
    </div>
  );
}
