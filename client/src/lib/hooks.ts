import { useState, useEffect, useCallback, useRef } from "react";
import type { WorkoutSession } from "./types";
import { getActiveSession, saveActiveSession } from "./storage";

export function useLocalStorage<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : initial;
    } catch {
      return initial;
    }
  });

  const set = useCallback(
    (newVal: T | ((prev: T) => T)) => {
      setValue((prev) => {
        const next =
          typeof newVal === "function" ? (newVal as (p: T) => T)(prev) : newVal;
        localStorage.setItem(key, JSON.stringify(next));
        return next;
      });
    },
    [key]
  );

  return [value, set] as const;
}

export function useActiveSession() {
  const [session, setSession] = useState<WorkoutSession | null>(() =>
    getActiveSession()
  );

  const update = useCallback((updated: WorkoutSession | null) => {
    setSession(updated);
    if (updated) {
      saveActiveSession(updated);
    } else {
      localStorage.removeItem("liftlog_active_session");
    }
  }, []);

  return [session, update] as const;
}

export function useTimer(running: boolean, startTime: number) {
  const [elapsed, setElapsed] = useState(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!running) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      return;
    }

    const tick = () => {
      setElapsed(Math.floor((Date.now() - startTime) / 1000));
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [running, startTime]);

  return elapsed;
}

export function useRestTimer() {
  const [restSeconds, setRestSeconds] = useState(0);
  const [isResting, setIsResting] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startRest = useCallback((seconds = 90) => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    setRestSeconds(seconds);
    setIsResting(true);
    intervalRef.current = setInterval(() => {
      setRestSeconds((s) => {
        if (s <= 1) {
          clearInterval(intervalRef.current!);
          setIsResting(false);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
  }, []);

  const stopRest = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    setIsResting(false);
    setRestSeconds(0);
  }, []);

  useEffect(() => () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
  }, []);

  return { restSeconds, isResting, startRest, stopRest };
}

export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0)
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function formatDate(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function formatWeight(w: number): string {
  return w % 1 === 0 ? `${w}` : `${w}`;
}

// ─── Set metrics ─────────────────────────────────────────────────────────────
// Shared so the Session screen and Progress screen always agree.

import type { WorkoutSet } from "./types";

/** Epley estimated 1RM from a weight × reps performance. */
export function estimate1RM(weight: number, reps: number): number {
  return weight * (1 + reps / 30);
}

// Discounts the raw %1RM estimate by how trustworthy the reps-to-failure
// assumption is for that set type — a "normal" set likely had reps left in
// reserve, and an "assisted" set's logged weight overstates the true load.
const INTENSITY_TYPE_MULTIPLIER: Record<WorkoutSet["type"], number> = {
  failure: 1.0,
  normal: 0.92,
  assisted: 0.8,
};

/**
 * Intensity: average %1RM across completed sets, scored against your
 * personal best (Epley) — the classic "intensity based on sets and reps"
 * approach (NSCA). Bodyweight sets (weight 0) have no 1RM to compare
 * against, so they use the reps-to-failure %1RM curve (Brzycki-style)
 * instead. Both are then discounted by a set-type multiplier (see
 * INTENSITY_TYPE_MULTIPLIER).
 *
 * Returns null when there's no PB to score weighted sets against yet
 * (only possible mid-workout, the very first time an exercise is ever
 * logged) — rather than fabricating a number from the session's own data.
 */
export function calcIntensity(sets: WorkoutSet[], pb?: { weight: number; reps: number }): number | null {
  // A set with no reps and no weight logged represents no actual work — the
  // reps-to-failure curve misreads "0 reps" as a near-max single (~100%),
  // which would otherwise score an empty set as high intensity.
  const done = sets.filter((s) => s.completed && (s.reps > 0 || s.weight > 0));
  if (done.length === 0) return null;

  const hasWeightedSets = done.some((s) => s.weight > 0);
  const refE1RM = pb && pb.weight > 0 ? estimate1RM(pb.weight, pb.reps) : 0;
  if (hasWeightedSets && refE1RM === 0) return null;

  const pctFor = (s: WorkoutSet) => {
    const effReps = s.reps + (s.partialReps ?? 0) * 0.5;
    const raw = s.weight > 0
      ? Math.min(100, (estimate1RM(s.weight, effReps) / refE1RM) * 100)
      : Math.max(0, Math.min(100, 102.78 - 2.78 * effReps));
    return raw * INTENSITY_TYPE_MULTIPLIER[s.type];
  };

  return done.reduce((sum, s) => sum + pctFor(s), 0) / done.length;
}

/** Plain-language band for an intensity %1RM score, so the number isn't jargon. */
export function intensityLabel(pct: number): string {
  if (pct >= 90) return "Max";
  if (pct >= 80) return "Hard";
  if (pct >= 65) return "Solid";
  return "Easy";
}

/** Heaviest weight lifted across the completed sets. */
export function topWeight(sets: WorkoutSet[]): number {
  const done = sets.filter((s) => s.completed);
  return done.length ? Math.max(...done.map((s) => s.weight)) : 0;
}

// ─── Unit conversion ─────────────────────────────────────────────────────────

/** Convert a kg value to the display unit. Always returns a clean number. */
export function toDisplay(kg: number, imperial: boolean): number {
  if (!imperial) return kg;
  return Math.round(kg * 2.2046 * 10) / 10;
}

/** Convert a display-unit value back to kg for storage. */
export function fromDisplay(val: number, imperial: boolean): number {
  if (!imperial) return val;
  return Math.round((val / 2.2046) * 4) / 4; // nearest 0.25 kg
}

export function unitLabel(imperial: boolean): string {
  return imperial ? "lbs" : "kg";
}
