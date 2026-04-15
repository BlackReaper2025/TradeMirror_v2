import { useState, ReactNode } from "react";
import { Maximize2, Minimize2 } from "lucide-react";
import { Sidebar, Page } from "./Sidebar";
import { useFullscreen } from "../../hooks/useFullscreen";

interface AppShellProps {
  children: (page: Page) => ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const [activePage, setActivePage] = useState<Page>("dashboard");
  const [collapsed,  setCollapsed]  = useState(false);
  const { isFullscreen, toggle: toggleFullscreen } = useFullscreen();

  return (
    <div
      className="flex h-screen w-screen overflow-hidden"
      style={{ background: "var(--bg-base)" }}
    >
      <Sidebar
        activePage={activePage}
        onNavigate={setActivePage}
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed((c) => !c)}
      />

      <main
        className="flex-1 overflow-hidden flex flex-col min-w-0"
        style={{
          backgroundImage: "url('/Background1.jpg')",
          backgroundSize: "50%",
          backgroundRepeat: "repeat",
        }}
      >
        {children(activePage)}
      </main>

      {/* ── Fullscreen toggle — fixed top-right, icon-only ── */}
      <button
        onClick={toggleFullscreen}
        title={isFullscreen ? "Exit fullscreen (F11)" : "Enter fullscreen (F11)"}
        className="fixed z-50 flex items-center justify-center rounded-lg transition-all"
        style={{
          top: 8,
          right: 8,
          width: 26,
          height: 26,
          background: "rgba(13,18,25,0.75)",
          border: "1px solid var(--border-subtle)",
          color: "var(--text-muted)",
          backdropFilter: "blur(6px)",
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLElement).style.background = "var(--bg-panel)";
          (e.currentTarget as HTMLElement).style.color      = "var(--text-secondary)";
          (e.currentTarget as HTMLElement).style.borderColor = "var(--border-medium)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLElement).style.background  = "rgba(13,18,25,0.75)";
          (e.currentTarget as HTMLElement).style.color       = "var(--text-muted)";
          (e.currentTarget as HTMLElement).style.borderColor = "var(--border-subtle)";
        }}
      >
        {isFullscreen ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
      </button>
    </div>
  );
}
