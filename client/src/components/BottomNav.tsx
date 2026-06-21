import { Link, useLocation } from "wouter";
import { Dumbbell, BookOpen, BarChart2 } from "lucide-react";

const NAV_ITEMS = [
  { href: "/", icon: Dumbbell, label: "Workout" },
  { href: "/exercises", icon: BookOpen, label: "Exercises" },
  { href: "/progress", icon: BarChart2, label: "Progress" },
];

export function BottomNav() {
  const [location] = useLocation();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border/70 bg-background/80 backdrop-blur-xl"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <div className="flex items-center justify-around h-[68px] max-w-lg mx-auto px-3">
        {NAV_ITEMS.map(({ href, icon: Icon, label }) => {
          const active = href === "/" ? location === "/" : location.startsWith(href);
          return (
            <Link key={href} href={href}>
              <button
                data-testid={`nav-${label.toLowerCase()}`}
                className={`group flex flex-col items-center gap-1 px-3 py-1.5 rounded-2xl active:scale-90 transition-transform ${
                  active ? "text-primary" : "text-muted-foreground"
                }`}
              >
                <span
                  className={`flex items-center justify-center w-11 h-7 rounded-full transition-all duration-300 ${
                    active ? "bg-primary/15" : "bg-transparent group-hover:bg-muted/50"
                  }`}
                >
                  <Icon className={`w-5 h-5 transition-all ${active ? "stroke-[2.5]" : "stroke-[1.8]"}`} />
                </span>
                <span className={`text-[10px] tracking-wide ${active ? "font-bold" : "font-medium"}`}>
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
