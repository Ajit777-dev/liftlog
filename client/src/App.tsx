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

// Floating teddy-bear / heart decor, only in Cute mode. Sits behind the
// content (gaps between opaque cards) and never intercepts taps.
function CuteDecor() {
  const { cute } = useTheme();
  if (!cute) return null;
  const bits = [
    { e: "🧸", c: "top-3 left-3 text-2xl" },
    { e: "🎀", c: "top-28 right-4 text-xl" },
    { e: "💖", c: "top-1/2 left-5 text-lg" },
    { e: "🧸", c: "bottom-40 right-6 text-2xl" },
    { e: "🌸", c: "bottom-28 left-6 text-xl" },
    { e: "💕", c: "top-1/3 right-8 text-base" },
  ];
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      {bits.map((b, i) => (
        <span key={i} className={`absolute opacity-20 ${b.c}`}>{b.e}</span>
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
