import { useState, ReactNode } from "react";
import { Sidebar, Page } from "./Sidebar";

interface AppShellProps {
  children: (page: Page) => ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const [activePage, setActivePage] = useState<Page>("dashboard");

  return (
    <div
      className="flex h-screen w-screen overflow-hidden"
      style={{ background: "var(--bg-base)" }}
    >
      <Sidebar activePage={activePage} onNavigate={setActivePage} />

      <main className="flex-1 overflow-hidden flex flex-col">
        {children(activePage)}
      </main>
    </div>
  );
}
