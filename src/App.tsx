import { ThemeProvider } from "./theme/ThemeContext";
import { AppShell } from "./components/layout/AppShell";
import { Dashboard } from "./pages/Dashboard";
import { TradeLog } from "./pages/TradeLog";
import { DatabaseProvider } from "./db/DatabaseProvider";

function App() {
  return (
    <DatabaseProvider>
    <ThemeProvider>
      <AppShell>
        {(page) => {
          switch (page) {
            case "dashboard":
              return <Dashboard />;
            case "trade-log":
              return <TradeLog />;
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
