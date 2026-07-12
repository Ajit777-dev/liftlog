import { cn } from "@/lib/utils";
import type { HTMLAttributes } from "react";

export function SectionLabel({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h2
      className={cn(
        "text-xs font-semibold uppercase tracking-wider text-muted-foreground",
        className
      )}
      {...props}
    />
  );
}
