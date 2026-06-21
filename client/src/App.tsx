import { useEffect } from "react";
import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { BottomNav } from "@/components/BottomNav";
import { seedIfEmpty } from "@/lib/storage";
import { ThemeProvider, useTheme } from "@/lib/theme";

import Home from "@/pages/Home";
import Session from "@/pages/Session";
import Exercises from "@/pages/Exercises";
import Progress from "@/pages/Progress";
import TemplateEditor from "@/pages/TemplateEditor";
import NotFound from "@/pages/not-found";

// Seed demo data on first load
seedIfEmpty();

// Always dark mode by default
if (typeof document !== "undefined") {
  document.documentElement.classList.add("dark");
}

// Cute-mode: animated kawaii characters floating behind the content.
// Each character has its own animation, timing and position so they
// look independently alive. Opacity is kept subtle enough not to distract.
const CUTE_CHARS: {
  e: string; pos: string; anim: string; dur: string; delay: string; size: string;
}[] = [
  { e: "🐱", pos: "top-6   left-3",      anim: "cute-dance",  dur: "2.4s", delay: "0s",    size: "2.4rem" },
  { e: "🐰", pos: "top-36  right-4",     anim: "cute-bounce", dur: "1.9s", delay: "0.3s",  size: "2rem"   },
  { e: "🐶", pos: "top-[52%] left-2",    anim: "cute-wiggle", dur: "2.1s", delay: "0.7s",  size: "2.2rem" },
  { e: "🐯", pos: "top-[30%] right-3",   anim: "cute-float",  dur: "3s",   delay: "0.15s", size: "1.8rem" },
  { e: "🦁", pos: "bottom-48 right-5",   anim: "cute-dance",  dur: "2.7s", delay: "1s",    size: "2rem"   },
  { e: "🐹", pos: "bottom-32 left-4",    anim: "cute-bounce", dur: "2s",   delay: "0.5s",  size: "1.7rem" },
  { e: "💖", pos: "top-20   left-[40%]", anim: "cute-float",  dur: "2.6s", delay: "0.9s",  size: "1.4rem" },
  { e: "🌸", pos: "bottom-20 right-8",   anim: "cute-wiggle", dur: "1.8s", delay: "0.2s",  size: "1.6rem" },
  { e: "🐱", pos: "top-[68%] right-6",   anim: "cute-bounce", dur: "2.2s", delay: "0.6s",  size: "1.5rem" },
  { e: "🎀", pos: "bottom-60 left-7",    anim: "cute-float",  dur: "2.9s", delay: "1.1s",  size: "1.6rem" },
];

function CuteDecor() {
  const { cute } = useTheme();
  if (!cute) return null;
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      {CUTE_CHARS.map((c, i) => (
        <span
          key={i}
          className={`absolute select-none ${c.pos}`}
          style={{
            fontSize: c.size,
            opacity: 0.3,
            animation: `${c.anim} ${c.dur} ease-in-out ${c.delay} infinite`,
            display: "block",
            lineHeight: 1,
          }}
        >
          {c.e}
        </span>
      ))}
    </div>
  );
}

function Router() {
  const [location] = useLocation();
  const isSession = location.startsWith("/session/");

  return (
    <div className="flex flex-col min-h-dvh max-w-lg mx-auto relative">
      <CuteDecor />
      <main className="flex-1 overflow-y-auto relative z-10">
        <Switch>
          <Route path="/" component={Home} />
          <Route path="/session/:id" component={Session} />
          <Route path="/exercises" component={Exercises} />
          <Route path="/progress" component={Progress} />
          <Route path="/template/:id/edit" component={TemplateEditor} />
          <Route component={NotFound} />
        </Switch>
      </main>
      {!isSession && <BottomNav />}
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
