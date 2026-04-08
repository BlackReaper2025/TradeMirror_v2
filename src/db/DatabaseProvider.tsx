// ─── DatabaseProvider — initializes DB and seeds demo data on first launch ───
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { initDb } from "./index";
import { seedIfEmpty } from "./seed";

interface DbContextValue {
  ready: boolean;
  error: string | null;
}

const DbContext = createContext<DbContextValue>({ ready: false, error: null });

const BOOT_TIMEOUT_MS = 20_000;

export function DatabaseProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    // Safety net: if boot takes more than 20 s, surface an error instead of
    // hanging on the loading screen forever.
    const timeoutId = setTimeout(() => {
      if (!cancelled && !ready) {
        console.error("[DatabaseProvider] Boot timed out after 20 s.");
        setError("Database did not respond within 20 seconds. Try restarting the app.");
      }
    }, BOOT_TIMEOUT_MS);

    async function boot() {
      try {
        console.log("[DatabaseProvider] Starting DB init …");
        await initDb();
        console.log("[DatabaseProvider] DB open. Running seed check …");
        await seedIfEmpty();
        console.log("[DatabaseProvider] Boot complete — setting ready.");
        if (!cancelled) setReady(true);
      } catch (err) {
        console.error("[DatabaseProvider] Boot failed:", err);
        if (!cancelled) setError(String(err));
      } finally {
        clearTimeout(timeoutId);
      }
    }

    boot();
    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, []);

  if (error) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "100vh",
          gap: 12,
          background: "#0a0f14",
          color: "#f87171",
          fontFamily: "monospace",
          padding: 32,
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase" }}>
          Database Error
        </div>
        <div style={{ fontSize: 12, color: "#94a3b8", maxWidth: 480 }}>{error}</div>
        <div style={{ fontSize: 11, color: "#475569", marginTop: 8 }}>
          Check the DevTools console for details.
        </div>
      </div>
    );
  }

  return (
    <DbContext.Provider value={{ ready, error }}>
      {children}
    </DbContext.Provider>
  );
}

export function useDatabase() {
  return useContext(DbContext);
}
