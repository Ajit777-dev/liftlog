import { useEffect } from "react";
import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { BottomNav } from "@/components/BottomNav";
import { seedIfEmpty } from "@/lib/storage";

import Home from "@/pages/Home";
import Session from "@/pages/Session";
import History from "@/pages/History";
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

function Router() {
  const [location] = useLocation();
  const isSession = location.startsWith("/session/");

  return (
    <div className="flex flex-col min-h-dvh max-w-lg mx-auto relative">
      <main className="flex-1 overflow-y-auto">
        <Switch>
          <Route path="/" component={Home} />
          <Route path="/session/:id" component={Session} />
          <Route path="/history" component={History} />
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
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
