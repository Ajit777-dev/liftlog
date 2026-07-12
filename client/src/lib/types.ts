export type SetType = "normal" | "assisted" | "failure" | "warmup" | "dropset" | "pyramid" | "superset";

export interface WorkoutSet {
  id: string;
  weight: number;
  reps: number;
  partialReps: number;
  type: SetType;
  completed: boolean;
  supersetExerciseId?: string;   // superset only
  supersetExerciseName?: string; // superset only, cached for display
}

export interface CardioEntry {
  id: string;
  timeMinutes: number;
  timeSeconds: number;
  distance?: number; // in km or miles
  calories?: number;
  weight?: number; // for weighted cardio
  completed: boolean;
}

export interface SessionExercise {
  id: string;
  exerciseId: string;
  exerciseName: string;
  muscleGroup?: string;
  sets: WorkoutSet[];
  notes?: string;
}

export interface SessionCardio {
  id: string;
  exerciseId: string;
  exerciseName: string;
  muscleGroup?: string;
  entries: CardioEntry[];
  notes?: string;
}

export interface WorkoutSession {
  id: string;
  templateId: string;
  templateName: string;
  startedAt: number;
  finishedAt?: number;
  durationSeconds?: number;
  exercises: SessionExercise[];
  cardio: SessionCardio[];
  notes?: string;
}

export interface TemplateExercise {
  id: string;
  exerciseId: string;
  exerciseName: string;
  muscleGroup?: string;
  defaultSets: number;
  order: number;
}

export interface WorkoutTemplate {
  id: string;
  name: string;
  description?: string;
  exercises: TemplateExercise[];
  createdAt: number;
  lastUsed?: number;
  color?: string;
  cuteEmoji?: string; // filename stem, e.g. "bench_press"
}

export interface Exercise {
  id: string;
  name: string;
  muscleGroup?: string;
  createdAt: number;
}

export interface PersonalBest {
  exerciseId: string;
  exerciseName: string;
  weight: number;
  reps: number;
  volume: number;
  achievedAt: number;
}

export type MuscleGroup =
  | "Chest"
  | "Back"
  | "Shoulders"
  | "Biceps"
  | "Triceps"
  | "Legs"
  | "Core"
  | "Cardio"
  | "Full Body"
  | "Other";

export const MUSCLE_GROUPS: MuscleGroup[] = [
  "Chest",
  "Back",
  "Shoulders",
  "Biceps",
  "Triceps",
  "Legs",
  "Core",
  "Cardio",
  "Full Body",
  "Other",
];
