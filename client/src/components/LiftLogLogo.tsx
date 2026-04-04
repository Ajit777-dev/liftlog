import { cn } from "@/lib/utils";

interface LiftLogLogoProps {
  className?: string;
  size?: number;
}

export function LiftLogLogo({ className, size = 24 }: LiftLogLogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("text-primary", className)}
    >
      <rect width="32" height="32" rx="4" fill="currentColor" opacity="0.1"/>
      <rect x="6" y="10" width="20" height="2" fill="currentColor"/>
      <rect x="6" y="14" width="20" height="2" fill="currentColor"/>
      <rect x="6" y="18" width="14" height="2" fill="currentColor"/>
      <circle cx="22" cy="19" r="2" fill="currentColor" opacity="0.8"/>
    </svg>
  );
}