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

export function DatabaseProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      try {
        await initDb();
        await seedIfEmpty();
        if (!cancelled) setReady(true);
      } catch (err) {
        if (!cancelled) {
          console.error("[DatabaseProvider] Init failed:", err);
          setError(String(err));
        }
      }
    }

    boot();
    return () => { cancelled = true; };
  }, []);

  return (
    <DbContext.Provider value={{ ready, error }}>
      {children}
    </DbContext.Provider>
  );
}

export function useDatabase() {
  return useContext(DbContext);
}
