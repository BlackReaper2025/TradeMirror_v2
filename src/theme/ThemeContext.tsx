import { createContext, useContext, useState, useEffect, ReactNode } from "react";

export type ThemeState = "green" | "yellow" | "red";

interface ThemeContextValue {
  themeState: ThemeState;
  setThemeState: (state: ThemeState) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  themeState: "green",
  setThemeState: () => {},
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [themeState, setThemeState] = useState<ThemeState>("green");

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove("theme-green", "theme-yellow", "theme-red");
    if (themeState !== "green") {
      root.classList.add(`theme-${themeState}`);
    }
  }, [themeState]);

  return (
    <ThemeContext.Provider value={{ themeState, setThemeState }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}

/** Returns tailwind/inline-compatible color values for the current state */
export function useAccentColors() {
  const { themeState } = useTheme();
  const map = {
    green:  { accent: "#22c55e", text: "#4ade80", dim: "rgba(34,197,94,0.18)",   glow: "rgba(34,197,94,0.10)",   border: "rgba(34,197,94,0.22)"   },
    yellow: { accent: "#f59e0b", text: "#fbbf24", dim: "rgba(245,158,11,0.18)",  glow: "rgba(245,158,11,0.10)",  border: "rgba(245,158,11,0.22)"  },
    red:    { accent: "#ef4444", text: "#f87171", dim: "rgba(239,68,68,0.18)",   glow: "rgba(239,68,68,0.10)",   border: "rgba(239,68,68,0.22)"   },
  };
  return map[themeState];
}
