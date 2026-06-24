import { nanoid } from "nanoid";
import type {
  Exercise,
  WorkoutTemplate,
  WorkoutSession,
  PersonalBest,
  TemplateExercise,
} from "./types";

const KEYS = {
  exercises: "liftlog_exercises",
  templates: "liftlog_templates",
  sessions: "liftlog_sessions",
  personalBests: "liftlog_pbs",
  activeSession: "liftlog_active_session",
};

function load<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    return JSON.parse(raw) as T[];
  } catch {
    return [];
  }
}

function save<T>(key: string, data: T[]): void {
  localStorage.setItem(key, JSON.stringify(data));
}

// ─── Backup: export / import ────────────────────────────────────────────────
// All app data lives in localStorage, so a backup is the only way to survive a
// reinstall, a cleared cache, or moving to a new device. Export bundles every
// store into one portable JSON file; import restores it.

const BACKUP_FORMAT = "liftlog-backup";
const BACKUP_VERSION = 1;

export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  version: number;
  exportedAt: number;
  data: {
    exercises: Exercise[];
    templates: WorkoutTemplate[];
    sessions: WorkoutSession[];
    personalBests: PersonalBest[];
  };
}

export function exportBackup(): BackupFile {
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: Date.now(),
    data: {
      exercises: load<Exercise>(KEYS.exercises),
      templates: load<WorkoutTemplate>(KEYS.templates),
      sessions: load<WorkoutSession>(KEYS.sessions),
      personalBests: load<PersonalBest>(KEYS.personalBests),
    },
  };
}

export interface ImportResult {
  exercises: number;
  templates: number;
  sessions: number;
}

// Validates a parsed backup and replaces all current data with it.
// Throws a friendly Error if the file isn't a valid LiftLog backup so the UI
// can surface a clear message instead of silently corrupting state.
export function importBackup(parsed: unknown): ImportResult {
  if (!parsed || typeof parsed !== "object") {
    throw new Error("This file isn't readable as a backup.");
  }
  const b = parsed as Partial<BackupFile>;
  if (b.format !== BACKUP_FORMAT || !b.data) {
    throw new Error("This doesn't look like a LiftLog backup file.");
  }
  const d = b.data;
  const arr = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

  const exercises = arr<Exercise>(d.exercises);
  const templates = arr<WorkoutTemplate>(d.templates);
  const sessions = arr<WorkoutSession>(d.sessions);
  const personalBests = arr<PersonalBest>(d.personalBests);

  save(KEYS.exercises, exercises);
  save(KEYS.templates, templates);
  save(KEYS.sessions, sessions);
  save(KEYS.personalBests, personalBests);
  // A restore should land the user on a clean slate, not a stale half-session.
  localStorage.removeItem(KEYS.activeSession);

  return {
    exercises: exercises.length,
    templates: templates.length,
    sessions: sessions.length,
  };
}

// ─── Exercises ─────────────────────────────────────────────────────────────

export function getExercises(): Exercise[] {
  return load<Exercise>(KEYS.exercises).sort((a, b) =>
    a.name.localeCompare(b.name)
  );
}

export function createExercise(
  name: string,
  muscleGroup?: string
): Exercise {
  const exercises = load<Exercise>(KEYS.exercises);
  const exercise: Exercise = {
    id: nanoid(),
    name: name.trim(),
    muscleGroup,
    createdAt: Date.now(),
  };
  exercises.push(exercise);
  save(KEYS.exercises, exercises);
  return exercise;
}

export function updateExercise(
  id: string,
  updates: Partial<Pick<Exercise, "name" | "muscleGroup">>
): Exercise | null {
  const exercises = load<Exercise>(KEYS.exercises);
  const idx = exercises.findIndex((e) => e.id === id);
  if (idx === -1) return null;
  exercises[idx] = { ...exercises[idx], ...updates };
  save(KEYS.exercises, exercises);
  return exercises[idx];
}

export function deleteExercise(id: string): void {
  const exercises = load<Exercise>(KEYS.exercises).filter((e) => e.id !== id);
  save(KEYS.exercises, exercises);
}

// ─── Templates ─────────────────────────────────────────────────────────────

export function getTemplates(): WorkoutTemplate[] {
  return load<WorkoutTemplate>(KEYS.templates).sort(
    (a, b) => (b.lastUsed ?? b.createdAt) - (a.lastUsed ?? a.createdAt)
  );
}

export function getTemplate(id: string): WorkoutTemplate | undefined {
  return load<WorkoutTemplate>(KEYS.templates).find((t) => t.id === id);
}

export function createTemplate(
  name: string,
  description?: string,
  color?: string,
  cuteEmoji?: string
): WorkoutTemplate {
  const templates = load<WorkoutTemplate>(KEYS.templates);
  const template: WorkoutTemplate = {
    id: nanoid(),
    name: name.trim(),
    description,
    exercises: [],
    createdAt: Date.now(),
    color,
    cuteEmoji,
  };
  templates.push(template);
  save(KEYS.templates, templates);
  return template;
}

export function updateTemplate(
  id: string,
  updates: Partial<WorkoutTemplate>
): WorkoutTemplate | null {
  const templates = load<WorkoutTemplate>(KEYS.templates);
  const idx = templates.findIndex((t) => t.id === id);
  if (idx === -1) return null;
  templates[idx] = { ...templates[idx], ...updates };
  save(KEYS.templates, templates);
  return templates[idx];
}

export function deleteTemplate(id: string): void {
  const templates = load<WorkoutTemplate>(KEYS.templates).filter(
    (t) => t.id !== id
  );
  save(KEYS.templates, templates);
}

export function duplicateTemplate(id: string): WorkoutTemplate | null {
  const template = getTemplate(id);
  if (!template) return null;
  const templates = load<WorkoutTemplate>(KEYS.templates);
  const copy: WorkoutTemplate = {
    ...template,
    id: nanoid(),
    name: `${template.name} (Copy)`,
    createdAt: Date.now(),
    lastUsed: undefined,
  };
  templates.push(copy);
  save(KEYS.templates, templates);
  return copy;
}

export function addExerciseToTemplate(
  templateId: string,
  exerciseId: string,
  exerciseName: string,
  muscleGroup?: string,
  defaultSets = 3
): void {
  const templates = load<WorkoutTemplate>(KEYS.templates);
  const idx = templates.findIndex((t) => t.id === templateId);
  if (idx === -1) return;
  const ex: TemplateExercise = {
    id: nanoid(),
    exerciseId,
    exerciseName,
    muscleGroup,
    defaultSets,
    order: templates[idx].exercises.length,
  };
  templates[idx].exercises.push(ex);
  save(KEYS.templates, templates);
}

export function removeExerciseFromTemplate(
  templateId: string,
  templateExerciseId: string
): void {
  const templates = load<WorkoutTemplate>(KEYS.templates);
  const idx = templates.findIndex((t) => t.id === templateId);
  if (idx === -1) return;
  templates[idx].exercises = templates[idx].exercises
    .filter((e) => e.id !== templateExerciseId)
    .map((e, i) => ({ ...e, order: i }));
  save(KEYS.templates, templates);
}

export function reorderTemplateExercises(
  templateId: string,
  exerciseIds: string[]
): void {
  const templates = load<WorkoutTemplate>(KEYS.templates);
  const idx = templates.findIndex((t) => t.id === templateId);
  if (idx === -1) return;
  const map = new Map(templates[idx].exercises.map((e) => [e.id, e]));
  templates[idx].exercises = exerciseIds
    .map((id, i) => ({ ...map.get(id)!, order: i }))
    .filter(Boolean);
  save(KEYS.templates, templates);
}

// ─── Active Session ─────────────────────────────────────────────────────────

export function getActiveSession(): WorkoutSession | null {
  try {
    const raw = localStorage.getItem(KEYS.activeSession);
    if (!raw) return null;
    return JSON.parse(raw) as WorkoutSession;
  } catch {
    return null;
  }
}

export function saveActiveSession(session: WorkoutSession): void {
  localStorage.setItem(KEYS.activeSession, JSON.stringify(session));
}

export function clearActiveSession(): void {
  localStorage.removeItem(KEYS.activeSession);
}

// ─── Sessions ─────────────────────────────────────────────────────────────

export function getSessions(): WorkoutSession[] {
  return load<WorkoutSession>(KEYS.sessions).sort(
    (a, b) => b.startedAt - a.startedAt
  );
}

export function getSessionsByExercise(exerciseId: string): WorkoutSession[] {
  return getSessions().filter((s) =>
    s.exercises.some((e) => e.exerciseId === exerciseId)
  );
}


export function saveSession(session: WorkoutSession): void {
  const sessions = load<WorkoutSession>(KEYS.sessions).filter(
    (s) => s.id !== session.id
  );
  sessions.push(session);
  save(KEYS.sessions, sessions);

  // Update template lastUsed
  const templates = load<WorkoutTemplate>(KEYS.templates);
  const idx = templates.findIndex((t) => t.id === session.templateId);
  if (idx !== -1) {
    templates[idx].lastUsed = Date.now();
    save(KEYS.templates, templates);
  }

  // Update personal bests
  updatePersonalBests(session);
}

export function deleteSession(id: string): void {
  const sessions = load<WorkoutSession>(KEYS.sessions).filter(
    (s) => s.id !== id
  );
  save(KEYS.sessions, sessions);
}

export function getLastSessionForTemplate(
  templateId: string
): WorkoutSession | undefined {
  return getSessions().find((s) => s.templateId === templateId);
}

export function getLastSessionDataForExercise(
  exerciseId: string,
  beforeSessionId?: string
): { sets: WorkoutSession["exercises"][0]["sets"]; date: number } | null {
  const sessions = getSessions();
  const startIdx = beforeSessionId
    ? sessions.findIndex((s) => s.id === beforeSessionId) + 1
    : 0;

  for (let i = startIdx; i < sessions.length; i++) {
    const session = sessions[i];
    const ex = session.exercises.find((e) => e.exerciseId === exerciseId);
    if (ex && ex.sets.length > 0) {
      return { sets: ex.sets, date: session.startedAt };
    }
  }
  return null;
}

// ─── Personal Bests ─────────────────────────────────────────────────────────

export function getPersonalBests(): PersonalBest[] {
  return load<PersonalBest>(KEYS.personalBests);
}

export function getPersonalBest(exerciseId: string): PersonalBest | undefined {
  return load<PersonalBest>(KEYS.personalBests).find(
    (pb) => pb.exerciseId === exerciseId
  );
}

export function deletePersonalBest(exerciseId: string): void {
  const pbs = load<PersonalBest>(KEYS.personalBests).filter(
    (pb) => pb.exerciseId !== exerciseId
  );
  save(KEYS.personalBests, pbs);
}

function updatePersonalBests(session: WorkoutSession): void {
  const pbs = load<PersonalBest>(KEYS.personalBests);

  for (const ex of session.exercises) {
    const completedSets = ex.sets.filter((s) => s.completed);
    if (completedSets.length === 0) continue;

    const totalVolume = completedSets.reduce(
      (sum, s) => sum + s.weight * (s.reps + s.partialReps * 0.5),
      0
    );
    const maxWeight = Math.max(...completedSets.map((s) => s.weight));
    const maxReps = Math.max(...completedSets.map((s) => s.reps));

    const pbIdx = pbs.findIndex((pb) => pb.exerciseId === ex.exerciseId);
    const current = pbIdx !== -1 ? pbs[pbIdx] : null;

    if (
      !current ||
      totalVolume > current.volume ||
      maxWeight > current.weight
    ) {
      const newPb: PersonalBest = {
        exerciseId: ex.exerciseId,
        exerciseName: ex.exerciseName,
        weight: maxWeight,
        reps: maxReps,
        volume: totalVolume,
        achievedAt: session.startedAt,
      };
      if (pbIdx !== -1) {
        pbs[pbIdx] = newPb;
      } else {
        pbs.push(newPb);
      }
    }
  }
  save(KEYS.personalBests, pbs);
}

// ─── Seed Data ─────────────────────────────────────────────────────────────

export function seedIfEmpty(): void {
  const exercises = load<Exercise>(KEYS.exercises);
  if (exercises.length > 0) return;

  const exs: Exercise[] = [
    { id: "ex1", name: "Bench Press", muscleGroup: "Chest", createdAt: Date.now() },
    { id: "ex2", name: "Incline Dumbbell Press", muscleGroup: "Chest", createdAt: Date.now() },
    { id: "ex3", name: "Cable Fly", muscleGroup: "Chest", createdAt: Date.now() },
    { id: "ex4", name: "Pull-Up", muscleGroup: "Back", createdAt: Date.now() },
    { id: "ex5", name: "Barbell Row", muscleGroup: "Back", createdAt: Date.now() },
    { id: "ex6", name: "Lat Pulldown", muscleGroup: "Back", createdAt: Date.now() },
    { id: "ex7", name: "Overhead Press", muscleGroup: "Shoulders", createdAt: Date.now() },
    { id: "ex8", name: "Lateral Raise", muscleGroup: "Shoulders", createdAt: Date.now() },
    { id: "ex9", name: "Barbell Curl", muscleGroup: "Biceps", createdAt: Date.now() },
    { id: "ex10", name: "Hammer Curl", muscleGroup: "Biceps", createdAt: Date.now() },
    { id: "ex11", name: "Tricep Pushdown", muscleGroup: "Triceps", createdAt: Date.now() },
    { id: "ex12", name: "Skull Crusher", muscleGroup: "Triceps", createdAt: Date.now() },
    { id: "ex13", name: "Squat", muscleGroup: "Legs", createdAt: Date.now() },
    { id: "ex14", name: "Romanian Deadlift", muscleGroup: "Legs", createdAt: Date.now() },
    { id: "ex15", name: "Leg Press", muscleGroup: "Legs", createdAt: Date.now() },
    { id: "ex16", name: "Hip Thrust", muscleGroup: "Glutes", createdAt: Date.now() },
    { id: "ex17", name: "Plank", muscleGroup: "Core", createdAt: Date.now() },
    { id: "ex18", name: "Cable Crunch", muscleGroup: "Core", createdAt: Date.now() },
    { id: "ex19", name: "Deadlift", muscleGroup: "Back", createdAt: Date.now() },
    { id: "ex20", name: "Leg Curl", muscleGroup: "Legs", createdAt: Date.now() },
    { id: "ex21", name: "Running", muscleGroup: "Cardio", createdAt: Date.now() },
    { id: "ex22", name: "Cycling", muscleGroup: "Cardio", createdAt: Date.now() },
    { id: "ex23", name: "Walking", muscleGroup: "Cardio", createdAt: Date.now() },
    { id: "ex24", name: "Swimming", muscleGroup: "Cardio", createdAt: Date.now() },
  ];
  save(KEYS.exercises, exs);

  const COLORS = ["#3b82f6", "#f97316", "#22c55e", "#a855f7", "#ef4444"];
  const templates: WorkoutTemplate[] = [
    {
      id: "t1",
      name: "Push Day",
      description: "Chest, shoulders & triceps",
      color: COLORS[0],
      createdAt: Date.now() - 7 * 86400000,
      lastUsed: Date.now() - 86400000,
      exercises: [
        { id: "te1", exerciseId: "ex1", exerciseName: "Bench Press", muscleGroup: "Chest", defaultSets: 4, order: 0 },
        { id: "te2", exerciseId: "ex2", exerciseName: "Incline Dumbbell Press", muscleGroup: "Chest", defaultSets: 3, order: 1 },
        { id: "te3", exerciseId: "ex3", exerciseName: "Cable Fly", muscleGroup: "Chest", defaultSets: 3, order: 2 },
        { id: "te4", exerciseId: "ex7", exerciseName: "Overhead Press", muscleGroup: "Shoulders", defaultSets: 3, order: 3 },
        { id: "te5", exerciseId: "ex8", exerciseName: "Lateral Raise", muscleGroup: "Shoulders", defaultSets: 3, order: 4 },
        { id: "te6", exerciseId: "ex11", exerciseName: "Tricep Pushdown", muscleGroup: "Triceps", defaultSets: 3, order: 5 },
      ],
    },
    {
      id: "t2",
      name: "Pull Day",
      description: "Back & biceps",
      color: COLORS[1],
      createdAt: Date.now() - 6 * 86400000,
      lastUsed: Date.now() - 2 * 86400000,
      exercises: [
        { id: "te7", exerciseId: "ex4", exerciseName: "Pull-Up", muscleGroup: "Back", defaultSets: 4, order: 0 },
        { id: "te8", exerciseId: "ex5", exerciseName: "Barbell Row", muscleGroup: "Back", defaultSets: 4, order: 1 },
        { id: "te9", exerciseId: "ex6", exerciseName: "Lat Pulldown", muscleGroup: "Back", defaultSets: 3, order: 2 },
        { id: "te10", exerciseId: "ex19", exerciseName: "Deadlift", muscleGroup: "Back", defaultSets: 3, order: 3 },
        { id: "te11", exerciseId: "ex9", exerciseName: "Barbell Curl", muscleGroup: "Biceps", defaultSets: 3, order: 4 },
        { id: "te12", exerciseId: "ex10", exerciseName: "Hammer Curl", muscleGroup: "Biceps", defaultSets: 3, order: 5 },
      ],
    },
    {
      id: "t3",
      name: "Leg Day",
      description: "Quads, hamstrings & glutes",
      color: COLORS[2],
      createdAt: Date.now() - 5 * 86400000,
      lastUsed: Date.now() - 3 * 86400000,
      exercises: [
        { id: "te13", exerciseId: "ex13", exerciseName: "Squat", muscleGroup: "Legs", defaultSets: 4, order: 0 },
        { id: "te14", exerciseId: "ex14", exerciseName: "Romanian Deadlift", muscleGroup: "Legs", defaultSets: 3, order: 1 },
        { id: "te15", exerciseId: "ex15", exerciseName: "Leg Press", muscleGroup: "Legs", defaultSets: 3, order: 2 },
        { id: "te16", exerciseId: "ex20", exerciseName: "Leg Curl", muscleGroup: "Legs", defaultSets: 3, order: 3 },
        { id: "te17", exerciseId: "ex16", exerciseName: "Hip Thrust", muscleGroup: "Glutes", defaultSets: 3, order: 4 },
      ],
    },
    {
      id: "t4",
      name: "Full Body",
      description: "Complete body workout",
      color: COLORS[3],
      createdAt: Date.now() - 4 * 86400000,
      exercises: [
        { id: "te18", exerciseId: "ex1", exerciseName: "Bench Press", muscleGroup: "Chest", defaultSets: 3, order: 0 },
        { id: "te19", exerciseId: "ex13", exerciseName: "Squat", muscleGroup: "Legs", defaultSets: 3, order: 1 },
        { id: "te20", exerciseId: "ex5", exerciseName: "Barbell Row", muscleGroup: "Back", defaultSets: 3, order: 2 },
        { id: "te21", exerciseId: "ex7", exerciseName: "Overhead Press", muscleGroup: "Shoulders", defaultSets: 3, order: 3 },
        { id: "te22", exerciseId: "ex17", exerciseName: "Plank", muscleGroup: "Core", defaultSets: 3, order: 4 },
      ],
    },
  ];
  save(KEYS.templates, templates);
}

// Generates ~130 sessions spread across the past 365 days for realistic 1-year charts.
export function seedYearOfData(): void {
  seedIfEmpty(); // ensure exercises + templates exist

  const PLANS = [
    {
      name: "Push Day", templateId: "t1",
      exs: [
        { id: "ex1",  name: "Bench Press",            base: 60  },
        { id: "ex2",  name: "Incline Dumbbell Press", base: 22  },
        { id: "ex7",  name: "Overhead Press",         base: 40  },
        { id: "ex11", name: "Tricep Pushdown",        base: 18  },
      ],
    },
    {
      name: "Pull Day", templateId: "t2",
      exs: [
        { id: "ex5", name: "Barbell Row",   base: 70 },
        { id: "ex4", name: "Pull-Up",       base: 0  },
        { id: "ex6", name: "Lat Pulldown",  base: 48 },
        { id: "ex9", name: "Barbell Curl",  base: 28 },
      ],
    },
    {
      name: "Leg Day", templateId: "t3",
      exs: [
        { id: "ex13", name: "Squat",             base: 80  },
        { id: "ex14", name: "Romanian Deadlift", base: 60  },
        { id: "ex15", name: "Leg Press",         base: 120 },
        { id: "ex16", name: "Hip Thrust",        base: 80  },
      ],
    },
  ];

  const now = Date.now();
  const yearAgo = now - 365 * 86_400_000;
  const existing = load<WorkoutSession>(KEYS.sessions);
  const seeded: WorkoutSession[] = [...existing];
  const existingIds = new Set(existing.map((s) => s.id));

  let planIdx = 0;
  for (let day = 0; day < 365; day += 2 + (planIdx % 3 === 0 ? 1 : 0)) {
    const id = `seed_y_${day}`;
    if (existingIds.has(id)) { planIdx++; continue; }

    const ts = yearAgo + day * 86_400_000;
    const progress = day / 365;
    const plan = PLANS[planIdx % 3];
    planIdx++;

    const exercises = plan.exs.map((ex, ei) => {
      const w = ex.base === 0 ? 0 : Math.round((ex.base * (1 + progress * 0.28)) / 2.5) * 2.5;
      const numSets = 3 + (ei === 0 ? 1 : 0);
      const sets = Array.from({ length: numSets }, (_, si) => ({
        id: `s_${day}_${ei}_${si}`,
        weight: w,
        reps: 6 + Math.floor(((day + ei + si) * 7) % 6),
        completed: true as const,
        type: "normal" as const,
        partialReps: 0,
      }));
      return { id: `se_${day}_${ei}`, exerciseId: ex.id, exerciseName: ex.name, sets };
    });

    const dur = 2700 + ((day * 13) % 1200);
    seeded.push({ id, templateId: plan.templateId, templateName: plan.name, startedAt: ts, finishedAt: ts + dur * 1000, durationSeconds: dur, exercises });
  }

  save(KEYS.sessions, seeded);

  // Rebuild PBs from scratch so Trophy modal reflects the seeded data.
  save(KEYS.personalBests, []);
  const allSessions = load<WorkoutSession>(KEYS.sessions);
  for (const s of allSessions) {
    const pbs = load<PersonalBest>(KEYS.personalBests);
    for (const ex of s.exercises) {
      const done = ex.sets.filter((set) => set.completed);
      if (!done.length) continue;
      const vol = done.reduce((sum, set) => sum + set.weight * (set.reps + (set.partialReps ?? 0) * 0.5), 0);
      const maxW = Math.max(...done.map((set) => set.weight));
      const maxR = Math.max(...done.map((set) => set.reps));
      const idx = pbs.findIndex((pb) => pb.exerciseId === ex.exerciseId);
      const cur = pbs[idx];
      if (!cur || vol > cur.volume || maxW > cur.weight) {
        const nb: PersonalBest = { exerciseId: ex.exerciseId, exerciseName: ex.exerciseName, weight: maxW, reps: maxR, volume: vol, achievedAt: s.startedAt };
        if (idx !== -1) pbs[idx] = nb; else pbs.push(nb);
        save(KEYS.personalBests, pbs);
      }
    }
  }
}
