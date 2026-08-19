import { useState, lazy, Suspense } from "react";
import { ThemeProvider } from "./theme/ThemeContext";
import { AppShell } from "./components/layout/AppShell";
import { DatabaseProvider } from "./db/DatabaseProvider";
import { SplashScreen } from "./components/SplashScreen";

// Route-based code splitting — AppShell unmounts/remounts pages on every
// navigation (no keep-alive), so only one of these is ever on screen at a
// time. Lazy-loading means a Dashboard/Trade Log/Settings session never pays
// the load cost of AnalyticsV3.tsx's ~15k lines unless Analytics is opened.
const Dashboard   = lazy(() => import("./pages/Dashboard").then(m => ({ default: m.Dashboard })));
const TradeLog    = lazy(() => import("./pages/TradeLog").then(m => ({ default: m.TradeLog })));
const Settings    = lazy(() => import("./pages/Settings").then(m => ({ default: m.Settings })));
const AnalyticsV3 = lazy(() => import("./pages/AnalyticsV3").then(m => ({ default: m.AnalyticsV3 })));

function PageFallback() {
  return (
    <div className="flex-1 flex items-center justify-center" style={{ color: "var(--text-muted)" }}>
      <div className="text-[12px] uppercase tracking-widest">Loading…</div>
    </div>
  );
}

function App() {
  const [splashDone, setSplashDone] = useState(false);

  return (
    <DatabaseProvider>
    <ThemeProvider>
      {!splashDone && <SplashScreen onComplete={() => setSplashDone(true)} />}
      <AppShell>
        {(page) => (
          <Suspense fallback={<PageFallback />}>
            {(() => {
              switch (page) {
                case "dashboard":
                  return <Dashboard />;
                case "trade-log":
                  return <TradeLog />;
                case "analytics-v3":
                  return <AnalyticsV3 />;
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
            })()}
          </Suspense>
        )}
      </AppShell>
    </ThemeProvider>
    </DatabaseProvider>
  );
}

export default App;
