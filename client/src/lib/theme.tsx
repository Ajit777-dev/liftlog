import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

type ThemeCtx = { cute: boolean; toggle: () => void };

const ThemeContext = createContext<ThemeCtx>({ cute: false, toggle: () => {} });

const KEY = "liftlog_cute";

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [cute, setCute] = useState<boolean>(() => {
    try {
      return localStorage.getItem(KEY) === "1";
    } catch {
      return false;
    }
  });

  // Apply the theme as a class on <html> so the token overrides cascade
  // across the entire app. Purely visual — no data or behavior is touched.
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("cute", cute);

    // Swap favicon between dark-blue and pink variants
    const link = document.querySelector<HTMLLinkElement>("link[rel='icon']");
    if (link) link.href = cute ? "/favicon-cute.svg" : "/favicon.svg";

    try {
      localStorage.setItem(KEY, cute ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [cute]);

  return (
    <ThemeContext.Provider value={{ cute, toggle: () => setCute((c) => !c) }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
