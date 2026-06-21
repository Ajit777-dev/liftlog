import { Dumbbell } from "lucide-react";
import { cn } from "@/lib/utils";

interface LiftLogLogoProps {
  className?: string;
  size?: number;
}

// Uses the same Lucide dumbbell as the nav so the logo, nav icon and app
// icon are all identical.
export function LiftLogLogo({ className, size = 24 }: LiftLogLogoProps) {
  return (
    <Dumbbell
      size={size}
      strokeWidth={2.25}
      className={cn("text-primary", className)}
    />
  );
}
