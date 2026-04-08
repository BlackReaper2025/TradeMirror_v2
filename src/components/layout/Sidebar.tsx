import {
  LayoutDashboard,
  ScrollText,
  CalendarDays,
  BarChart2,
  Calculator,
  ImageIcon,
  Settings,
} from "lucide-react";
import { clsx } from "clsx";

export type Page =
  | "dashboard"
  | "trade-log"
  | "calendar"
  | "analytics"
  | "risk-calculator"
  | "inspiration"
  | "settings";

interface NavItem {
  id: Page;
  label: string;
  icon: React.ElementType;
}

const NAV_ITEMS: NavItem[] = [
  { id: "dashboard",       label: "Dashboard",       icon: LayoutDashboard },
  { id: "trade-log",       label: "Trade Log",       icon: ScrollText      },
  { id: "calendar",        label: "Calendar",        icon: CalendarDays    },
  { id: "analytics",       label: "Analytics",       icon: BarChart2       },
  { id: "risk-calculator", label: "Risk Calc",       icon: Calculator      },
  { id: "inspiration",     label: "Inspiration",     icon: ImageIcon       },
];

interface SidebarProps {
  activePage: Page;
  onNavigate: (page: Page) => void;
}

export function Sidebar({ activePage, onNavigate }: SidebarProps) {
  return (
    <aside
      className="flex flex-col h-full select-none"
      style={{
        width: 220,
        minWidth: 220,
        background: "var(--bg-sidebar)",
        borderRight: "1px solid var(--border-subtle)",
      }}
    >
      {/* Logo */}
      <div
        className="flex items-center gap-3 px-6 py-6"
        style={{ borderBottom: "1px solid var(--border-subtle)" }}
      >
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center"
          style={{ background: "var(--accent-dim)", border: "1px solid var(--accent-border)" }}
        >
          <span className="text-[13px] font-bold" style={{ color: "var(--accent-text)" }}>TM</span>
        </div>
        <div>
          <div className="text-[15px] font-semibold tracking-tight" style={{ color: "var(--text-primary)" }}>
            TradeMirror
          </div>
          <div className="text-[11px]" style={{ color: "var(--text-secondary)" }}>
            v1.0
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 flex flex-col gap-0.5">
        {NAV_ITEMS.map(({ id, label, icon: Icon }) => {
          const isActive = activePage === id;
          return (
            <button
              key={id}
              onClick={() => onNavigate(id)}
              className={clsx(
                "flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-[13px] font-medium transition-all duration-150 text-left",
              )}
              style={{
                background: isActive ? "var(--accent-dim)" : "transparent",
                color: isActive ? "var(--accent-text)" : "var(--text-secondary)",
                border: isActive ? "1px solid var(--accent-border)" : "1px solid transparent",
              }}
              onMouseEnter={(e) => {
                if (!isActive) {
                  (e.currentTarget as HTMLElement).style.background = "var(--bg-hover)";
                  (e.currentTarget as HTMLElement).style.color = "var(--text-primary)";
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  (e.currentTarget as HTMLElement).style.background = "transparent";
                  (e.currentTarget as HTMLElement).style.color = "var(--text-secondary)";
                }
              }}
            >
              <Icon size={16} />
              <span>{label}</span>
            </button>
          );
        })}
      </nav>

      {/* Bottom — settings + account indicator */}
      <div
        className="px-3 pb-4 flex flex-col gap-0.5"
        style={{ borderTop: "1px solid var(--border-subtle)", paddingTop: 12 }}
      >
        <button
          onClick={() => onNavigate("settings")}
          className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-[13px] font-medium transition-all duration-150 text-left"
          style={{ color: "var(--text-secondary)" }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.background = "var(--bg-hover)";
            (e.currentTarget as HTMLElement).style.color = "var(--text-primary)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.background = "transparent";
            (e.currentTarget as HTMLElement).style.color = "var(--text-secondary)";
          }}
        >
          <Settings size={16} />
          <span>Settings</span>
        </button>

        {/* Active account pill */}
        <div
          className="mt-3 mx-1 px-3 py-3 rounded-xl"
          style={{ background: "var(--bg-panel)", border: "1px solid var(--border-subtle)" }}
        >
          <div className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--text-muted)" }}>
            Active Account
          </div>
          <div className="text-[13px] font-semibold" style={{ color: "var(--text-primary)" }}>
            FTMO Challenge
          </div>
          <div className="text-[11px]" style={{ color: "var(--text-secondary)" }}>
            $102,340.00
          </div>
          <div className="flex items-center gap-1.5 mt-1.5">
            <span className="w-1.5 h-1.5 rounded-full pulse-dot" style={{ background: "var(--accent)" }} />
            <span className="text-[10px]" style={{ color: "var(--accent-text)" }}>Live</span>
          </div>
        </div>
      </div>
    </aside>
  );
}
