import { cn } from "@/lib/utils";
import type { HTMLAttributes, ReactNode } from "react";

/**
 * Sticky page header shell. Wraps content in the standard translucent bar +
 * max-w-lg container used by every top-level and sub-page header.
 */
export function PageHeader({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("sticky top-0 z-40 bg-background/95 backdrop-blur-md border-b border-border", className)}>
      <div className="max-w-lg mx-auto px-4 pt-4 pb-3">{children}</div>
    </div>
  );
}

/** Title for a top-level tab page (Home, Exercises, Progress). */
export function PageTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return <h1 className={cn("text-3xl font-bold tracking-tight", className)} {...props} />;
}

/** Title for a sub-page reached via back/close navigation (Session, TemplateEditor). */
export function SubpageTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return <h1 className={cn("font-bold text-lg leading-tight tracking-tight truncate", className)} {...props} />;
}

/** Flex row for a back/close button + title + trailing actions, used by sub-page headers. */
export function PageHeaderRow({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("flex items-center gap-3", className)}>{children}</div>;
}
