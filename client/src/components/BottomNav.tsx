import { Link, useLocation } from "wouter";
import { Dumbbell, History, BookOpen, BarChart2 } from "lucide-react";

const NAV_ITEMS = [
  { href: "/", icon: Dumbbell, label: "Workout" },
  { href: "/history", icon: History, label: "History" },
  { href: "/exercises", icon: BookOpen, label: "Exercises" },
  { href: "/progress", icon: BarChart2, label: "Progress" },
];

export function BottomNav() {
  const [location] = useLocation();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-background/95 backdrop-blur-md"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <div className="flex items-center justify-around h-16 max-w-lg mx-auto px-2">
        {NAV_ITEMS.map(({ href, icon: Icon, label }) => {
          const active = href === "/" ? location === "/" : location.startsWith(href);
          return (
            <Link key={href} href={href}>
              <button
                data-testid={`nav-${label.toLowerCase()}`}
                className={`flex flex-col items-center gap-1 px-4 py-2 rounded-lg transition-colors ${
                  active
                    ? "text-primary"
                    : "text-muted-foreground"
                }`}
              >
                <Icon
                  className={`w-5 h-5 transition-all ${active ? "stroke-[2.5]" : "stroke-[1.8]"}`}
                />
                <span className={`text-[10px] font-medium tracking-wide ${active ? "font-semibold" : ""}`}>
                  {label}
                </span>
              </button>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
