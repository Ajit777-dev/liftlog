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
