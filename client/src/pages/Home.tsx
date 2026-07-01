import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { Plus, ChevronRight, Clock, Dumbbell, Copy, Trash2, Edit2, MoreHorizontal, Play, Settings, Download, Upload, FileSpreadsheet, FileText } from "lucide-react";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  getTemplates, createTemplate, deleteTemplate, duplicateTemplate,
  updateTemplate, getActiveSession, getLastSessionForTemplate,
  getExercises, exportBackup, importBackup,
} from "@/lib/storage";
import { useToast } from "@/hooks/use-toast";
import type { WorkoutTemplate, WorkoutSession } from "@/lib/types";
import { formatDate } from "@/lib/hooks";
import { LiftLogLogo } from "@/components/LiftLogLogo";
import { useTheme } from "@/lib/theme";

const TEMPLATE_COLORS = [
  "#3b82f6", "#f97316", "#22c55e", "#a855f7",
  "#ef4444", "#06b6d4", "#f59e0b", "#ec4899",
];

// Bunny workout emoji stickers — shown only in cute mode.
const CUTE_EMOJIS = [
  { id: "bench_press",    label: "Bench Press",    src: "/cute-emojis/emoji_bunny_bench_press.png" },
  { id: "deadlift",       label: "Deadlift",        src: "/cute-emojis/emoji_bunny_deadlift.png" },
  { id: "lat_pulldown",   label: "Lat Pulldown",    src: "/cute-emojis/emoji_bunny_lat_pulldown.png" },
  { id: "overhead_press", label: "Overhead Press",  src: "/cute-emojis/emoji_bunny_overhead_press.png" },
  { id: "dumbbell_curl",  label: "Dumbbell Curl",   src: "/cute-emojis/emoji_bunny_dumbbell_curl.png" },
  { id: "cable_pull",     label: "Cable Pull",      src: "/cute-emojis/emoji_bunny_cable_pull.png" },
];

function cuteEmojiSrc(id: string) {
  return CUTE_EMOJIS.find((e) => e.id === id)?.src ?? null;
}

export default function Home() {
  const [, navigate] = useLocation();
  const { cute, toggle, imperial, toggleUnits } = useTheme();
  const [templates, setTemplates] = useState<WorkoutTemplate[]>([]);
  const [activeSession, setActiveSession] = useState(getActiveSession());
  const [showCreate, setShowCreate] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [editTemplate, setEditTemplate] = useState<WorkoutTemplate | null>(null);
  const [form, setForm] = useState({ name: "", description: "", color: TEMPLATE_COLORS[0], cuteEmoji: "" });
  const { toast } = useToast();
  const importInputRef = useRef<HTMLInputElement>(null);

  const stamp = new Date().toISOString().slice(0, 10);

  const handleExportExcel = () => {
    const backup = exportBackup();
    const sessions = backup.data.sessions;

    const rows: Record<string, string | number>[] = [];
    for (const s of sessions) {
      const date = new Date(s.startedAt).toLocaleDateString("en-GB");
      for (const ex of s.exercises) {
        ex.sets.filter((set) => set.completed).forEach((set, i) => {
          rows.push({
            Date: date,
            Workout: s.templateName,
            Exercise: ex.exerciseName,
            "Muscle Group": ex.muscleGroup ?? "",
            "Set #": i + 1,
            "Weight (kg)": set.weight,
            Reps: set.reps,
            "Partial Reps": set.partialReps ?? 0,
            Type: set.type,
          });
        });
      }
    }

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Workouts");
    XLSX.writeFile(wb, `greatlift-${stamp}.xlsx`);
    toast({ title: "Excel exported", description: `${sessions.length} sessions exported.` });
  };

  const handleExportPDF = () => {
    const backup = exportBackup();
    const sessions = backup.data.sessions;
    const doc = new jsPDF();

    doc.setFontSize(18);
    doc.text("GreatLift — Workout History", 14, 18);
    doc.setFontSize(10);
    doc.setTextColor(120);
    doc.text(`Exported ${stamp}`, 14, 26);

    const rows: (string | number)[][] = [];
    for (const s of sessions) {
      const date = new Date(s.startedAt).toLocaleDateString("en-GB");
      for (const ex of s.exercises) {
        ex.sets.filter((set) => set.completed).forEach((set, i) => {
          rows.push([
            date,
            s.templateName,
            ex.exerciseName,
            i + 1,
            set.weight > 0 ? `${set.weight} kg` : "BW",
            set.reps,
            set.type,
          ]);
        });
      }
    }

    autoTable(doc, {
      startY: 32,
      head: [["Date", "Workout", "Exercise", "Set", "Weight", "Reps", "Type"]],
      body: rows,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [59, 130, 246] },
    });

    doc.save(`greatlift-${stamp}.pdf`);
    toast({ title: "PDF exported", description: `${sessions.length} sessions exported.` });
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file later
    if (!file) return;
    if (!window.confirm("Importing replaces all current workouts and history with the backup. Continue?")) return;
    try {
      const text = await file.text();
      const result = importBackup(JSON.parse(text));
      toast({
        title: "Backup restored",
        description: `${result.templates} workouts · ${result.sessions} sessions imported.`,
      });
      setShowSettings(false);
      setTemplates(getTemplates());
      setActiveSession(getActiveSession());
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Couldn't import",
        description: err instanceof Error ? err.message : "The file couldn't be read.",
      });
    }
  };

  useEffect(() => {
    setTemplates(getTemplates());
    setActiveSession(getActiveSession());
  }, []);

  const refresh = () => setTemplates(getTemplates());

  const resetForm = () => setForm({ name: "", description: "", color: TEMPLATE_COLORS[0], cuteEmoji: "" });

  const handleCreate = () => {
    if (!form.name.trim()) return;
    createTemplate(form.name, form.description || undefined, form.color, form.cuteEmoji || undefined);
    resetForm();
    setShowCreate(false);
    refresh();
  };

  const handleEdit = () => {
    if (!editTemplate || !form.name.trim()) return;
    updateTemplate(editTemplate.id, {
      name: form.name,
      description: form.description || undefined,
      color: form.color,
      cuteEmoji: form.cuteEmoji || undefined,
    });
    setEditTemplate(null);
    refresh();
  };

  const openEdit = (t: WorkoutTemplate) => {
    setEditTemplate(t);
    setForm({ name: t.name, description: t.description ?? "", color: t.color ?? TEMPLATE_COLORS[0], cuteEmoji: t.cuteEmoji ?? "" });
  };

  const handleDuplicate = (id: string) => { duplicateTemplate(id); refresh(); };
  const handleDelete    = (id: string) => { deleteTemplate(id);    refresh(); };
  const startSession    = (template: WorkoutTemplate) => navigate(`/session/${template.id}`);
  const getTotalSets    = (t: WorkoutTemplate) => t.exercises.reduce((sum, e) => sum + e.defaultSets, 0);

  return (
    <div className="flex flex-col min-h-full pb-20">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-background/95 backdrop-blur-md border-b border-border">
        <div className="max-w-lg mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <LiftLogLogo size={24} />
              <h1 className="text-2xl font-bold tracking-tight">GreatLift</h1>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowSettings(true)}
              title="Settings"
              data-testid="button-settings"
              className="flex items-center justify-center h-9 w-9 rounded-full border border-border bg-muted/60 text-muted-foreground transition-colors active:scale-95 hover:text-foreground"
            >
              <Settings className="w-4 h-4" />
            </button>
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
      </div>

      <div className="max-w-lg mx-auto w-full px-4 py-4 flex flex-col gap-4">
        {/* Active session banner */}
        {activeSession && (
          <div
            className="rounded-2xl p-4 flex items-center justify-between cursor-pointer animate-fade-in active:scale-[0.99] transition-transform"
            style={{ background: "linear-gradient(135deg, hsl(var(--primary) / 0.18), hsl(var(--primary) / 0.06))", border: "1px solid hsl(var(--primary) / 0.28)" }}
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
                    cute={cute}
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
      <Dialog
        open={showCreate || !!editTemplate}
        onOpenChange={(o) => { if (!o) { setShowCreate(false); setEditTemplate(null); resetForm(); } }}
      >
        <DialogContent className="max-w-sm">
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

            {/* Cute emoji picker — visible only in cute mode */}
            {cute && (
              <div className="flex flex-col gap-2">
                <Label>Workout Emoji</Label>
                <div className="grid grid-cols-3 gap-2">
                  {CUTE_EMOJIS.map((em) => (
                    <button
                      key={em.id}
                      onClick={() => setForm((f) => ({ ...f, cuteEmoji: f.cuteEmoji === em.id ? "" : em.id }))}
                      data-testid={`cute-emoji-${em.id}`}
                      className={`flex flex-col items-center gap-1 p-2 rounded-xl border-2 transition-all ${
                        form.cuteEmoji === em.id
                          ? "border-primary bg-primary/10 scale-105"
                          : "border-border bg-muted/30"
                      }`}
                    >
                      <img src={em.src} alt={em.label} className="w-12 h-12 object-contain" />
                      <span className="text-[10px] text-muted-foreground leading-tight text-center">{em.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowCreate(false); setEditTemplate(null); resetForm(); }}>
              Cancel
            </Button>
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

      {/* Settings */}
      <Dialog open={showSettings} onOpenChange={setShowSettings}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Settings</DialogTitle>
          </DialogHeader>
          <div className="py-2 flex flex-col gap-5">
            {/* Unit system */}
            <div>
              <Label className="text-sm font-medium">Unit system</Label>
              <p className="text-xs text-muted-foreground mt-0.5 mb-3">
                Choose how weights are shown across the app.
              </p>
              <div className="grid grid-cols-2 gap-2">
                {([
                  { val: false, title: "Metric", sub: "kg" },
                  { val: true, title: "Imperial", sub: "lbs" },
                ] as const).map((opt) => (
                  <button
                    key={opt.title}
                    onClick={() => { if (imperial !== opt.val) toggleUnits(); }}
                    aria-pressed={imperial === opt.val}
                    data-testid={`button-unit-${opt.title.toLowerCase()}`}
                    className={`flex flex-col items-center gap-0.5 rounded-xl border py-3 transition-colors active:scale-95 ${
                      imperial === opt.val
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-muted/40 text-muted-foreground border-border hover:text-foreground"
                    }`}
                  >
                    <span className="text-sm font-semibold">{opt.title}</span>
                    <span className="text-xs opacity-80">{opt.sub}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Theme */}
            <div>
              <Label className="text-sm font-medium">Theme</Label>
              <p className="text-xs text-muted-foreground mt-0.5 mb-3">
                Switch between the default and cute bunny theme.
              </p>
              <div className="grid grid-cols-2 gap-2">
                {([
                  { val: false, title: "Default", sub: "💪" },
                  { val: true, title: "Cute", sub: "🐰" },
                ] as const).map((opt) => (
                  <button
                    key={opt.title}
                    onClick={() => { if (cute !== opt.val) toggle(); }}
                    aria-pressed={cute === opt.val}
                    data-testid={`button-theme-${opt.title.toLowerCase()}`}
                    className={`flex flex-col items-center gap-0.5 rounded-xl border py-3 transition-colors active:scale-95 ${
                      cute === opt.val
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-muted/40 text-muted-foreground border-border hover:text-foreground"
                    }`}
                  >
                    <span className="text-sm font-semibold">{opt.title}</span>
                    <span className="text-xs opacity-80">{opt.sub}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Data backup */}
            <div className="border-t border-border/40 pt-4">
              <Label className="text-sm font-medium">Your data</Label>
              <p className="text-xs text-muted-foreground mt-0.5 mb-3">
                Export your workout history or restore from a backup.
              </p>
              <div className="flex flex-col gap-2">
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={handleExportExcel}
                    data-testid="button-export-excel"
                    className="flex items-center justify-center gap-2 rounded-xl border border-border bg-muted/40 py-3 text-sm font-semibold text-foreground transition-colors active:scale-95 hover:bg-muted"
                  >
                    <FileSpreadsheet className="w-4 h-4 text-green-500" />
                    Excel
                  </button>
                  <button
                    onClick={handleExportPDF}
                    data-testid="button-export-pdf"
                    className="flex items-center justify-center gap-2 rounded-xl border border-border bg-muted/40 py-3 text-sm font-semibold text-foreground transition-colors active:scale-95 hover:bg-muted"
                  >
                    <FileText className="w-4 h-4 text-red-500" />
                    PDF
                  </button>
                </div>
                <button
                  onClick={() => importInputRef.current?.click()}
                  data-testid="button-import-backup"
                  className="flex items-center justify-center gap-2 rounded-xl border border-border bg-muted/40 py-3 text-sm font-semibold text-foreground transition-colors active:scale-95 hover:bg-muted"
                >
                  <Upload className="w-4 h-4" />
                  Import Backup
                </button>
              </div>
              <input
                ref={importInputRef}
                type="file"
                accept="application/json,.json"
                onChange={handleImportFile}
                className="hidden"
                data-testid="input-import-backup"
              />
            </div>

            {/* Dev tools */}
            <div className="border-t border-border/40 pt-4">
              <Label className="text-sm font-medium">Developer</Label>
              <p className="text-xs text-muted-foreground mt-0.5 mb-3">
                Seed 1 year of progressive workout data for testing.
              </p>
              <button
                onClick={() => {
                  const exercises = getExercises();
                  if (exercises.length === 0) { alert("Add at least one exercise first."); return; }
                  const now = Date.now();
                  const DAY = 86400000;
                  const start = now - 365 * DAY;
                  const sessions: WorkoutSession[] = [];
                  for (let week = 0; week < 52; week++) {
                    for (const dayOff of [1, 3, 5]) {
                      const ts = start + (week * 7 + dayOff) * DAY;
                      if (ts > now) break;
                      const picked = exercises.slice(0, Math.min(4, exercises.length));
                      sessions.push({
                        id: `seed_${ts}`,
                        templateId: "seed",
                        templateName: ["Push Day","Pull Day","Leg Day"][week % 3],
                        startedAt: ts,
                        finishedAt: ts + 3600000,
                        durationSeconds: 3600,
                        cardio: [],
                        exercises: picked.map((ex, ei) => {
                          const base = 20 + ei * 10;
                          const w = Math.round((base + week * 0.5) * 4) / 4;
                          const setCount = 3 + (week > 26 ? 1 : 0);
                          return {
                            id: `seed_e_${ts}_${ei}`,
                            exerciseId: ex.id,
                            exerciseName: ex.name,
                            sets: Array.from({ length: setCount }, (_, si) => ({
                              id: `seed_s_${ts}_${ei}_${si}`,
                              weight: w,
                              reps: Math.max(4, 10 - Math.floor(week / 12) + (si === setCount - 1 ? -1 : 0)),
                              partialReps: 0,
                              type: "normal" as const,
                              completed: true,
                            })),
                          };
                        }),
                      });
                    }
                  }
                  const existing = JSON.parse(localStorage.getItem("liftlog_sessions") || "[]");
                  localStorage.setItem("liftlog_sessions", JSON.stringify([...existing, ...sessions]));
                  setShowSettings(false);
                  alert(`Seeded ${sessions.length} sessions. Reload the app to see them.`);
                }}
                className="w-full rounded-xl border border-dashed border-border py-2.5 text-sm text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
              >
                Generate 1 year of test data
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface TemplateCardProps {
  template: WorkoutTemplate;
  lastSession?: ReturnType<typeof getLastSessionForTemplate>;
  totalSets: number;
  cute: boolean;
  onStart: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}

function TemplateCard({ template, lastSession, cute, onStart, onEdit, onDuplicate, onDelete }: TemplateCardProps) {
  const color = template.color ?? "#3b82f6";
  const [, navigate] = useLocation();
  const emojiSrc = cute && template.cuteEmoji ? cuteEmojiSrc(template.cuteEmoji) : null;

  return (
    <div
      className="rounded-2xl border border-card-border bg-card overflow-hidden animate-fade-in shadow-sm shadow-black/20"
      data-testid={`card-template-${template.id}`}
    >
      {/* Color accent bar */}
      <div className="h-1" style={{ backgroundColor: color }} />

      <div className="p-4">
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="flex-1 min-w-0 flex items-center gap-2">
            {emojiSrc && (
              <img src={emojiSrc} alt="" className="w-9 h-9 object-contain flex-shrink-0" />
            )}
            <div className="min-w-0">
              <h3 className="font-semibold text-base leading-tight truncate">{template.name}</h3>
              {template.description && (
                <p className="text-xs text-muted-foreground mt-0.5 truncate">{template.description}</p>
              )}
            </div>
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
            <Badge key={ex.id} variant="secondary" className="text-[10px] font-medium px-2">
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
            style={{ backgroundColor: color, borderColor: color, color: "white" }}
          >
            <Play className="w-3.5 h-3.5 fill-white" />
            Start
          </Button>
        </div>
      </div>
    </div>
  );
}
