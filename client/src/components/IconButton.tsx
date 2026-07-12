import { cn } from "@/lib/utils";
import type { ButtonHTMLAttributes } from "react";

export function IconButton({ className, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={cn(
        "w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 bg-muted/60 border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors active:scale-95",
        className
      )}
      {...props}
    />
  );
}
