import { TrendingUp, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The one "vs last" indicator used everywhere a value is compared to its
 * previous reading — same plain text, icon and color logic whether it's
 * session intensity, volume, top weight, or a single set's reps.
 */
export function TrendBadge({
  delta, text, size = "sm", suffix = "vs last",
}: {
  delta: number;
  text: string;
  size?: "sm" | "xs";
  suffix?: string;
}) {
  if (delta === 0) return null;
  const up = delta > 0;
  return (
    <span
      className={cn(
        "inline-flex items-center font-semibold",
        size === "xs" ? "text-[9px] gap-0.5" : "text-[11px] gap-1",
        up ? "text-green-500" : "text-destructive"
      )}
    >
      {up ? <TrendingUp className={size === "xs" ? "w-2.5 h-2.5" : "w-3 h-3"} /> : <TrendingDown className={size === "xs" ? "w-2.5 h-2.5" : "w-3 h-3"} />}
      {text}
      {suffix && <span className="opacity-70 ml-0.5">{suffix}</span>}
    </span>
  );
}
