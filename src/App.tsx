import { useState } from "react";
import { ThemeProvider } from "./theme/ThemeContext";
import { AppShell } from "./components/layout/AppShell";
import { Dashboard } from "./pages/Dashboard";
import { TradeLog } from "./pages/TradeLog";
import { Settings } from "./pages/Settings";
import { Analytics } from "./pages/Analytics";
import { DatabaseProvider } from "./db/DatabaseProvider";
import { SplashScreen } from "./components/SplashScreen";

function App() {
  const [splashDone, setSplashDone] = useState(false);

  return (
    <DatabaseProvider>
    <ThemeProvider>
      {!splashDone && <SplashScreen onComplete={() => setSplashDone(true)} />}
      <AppShell>
        {(page) => {
          switch (page) {
            case "dashboard":
              return <Dashboard />;
            case "trade-log":
              return <TradeLog />;
            case "analytics":
              return <Analytics />;
            case "settings":
              return <Settings />;
            default:
              return (
                <div
                  className="flex-1 flex flex-col items-center justify-center gap-3"
                  style={{ color: "var(--text-muted)" }}
                >
                  <div className="text-[13px] font-semibold uppercase tracking-widest">
                    {page.replace(/-/g, " ")}
                  </div>
                  <div className="text-[12px]" style={{ color: "var(--text-muted)" }}>
                    Coming in Phase 3+
                  </div>
                </div>
              );
          }
        }}
      </AppShell>
    </ThemeProvider>
    </DatabaseProvider>
  );
}

export default App;
