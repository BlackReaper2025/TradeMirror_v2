import { useEffect, useState } from "react";
import {
  LayoutDashboard, ScrollText, CalendarDays, BarChart2,
  Calculator, ImageIcon, Settings,
  PanelLeftClose, PanelLeftOpen, ExternalLink, Music,
} from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { clsx } from "clsx";
import { useDatabase } from "../../db/DatabaseProvider";
import { tradeEvents } from "../../lib/tradeEvents";
import { getSettings, getAccount, getPortfolio, type Account } from "../../db/queries";
import { logoSrc } from "../../config/branding";
import { getBrokerageUrl, getMusicUrl } from "../../lib/preferences";
import { useTheme } from "../../theme/ThemeContext";
import { openUrl as openExternal } from "@tauri-apps/plugin-opener";

export type Page =
  | "dashboard" | "trade-log" | "calendar" | "analytics"
  | "risk-calculator" | "inspiration" | "settings";

const NAV_ITEMS: { id: Page; label: string; icon: React.ElementType }[] = [
  { id: "dashboard",       label: "Dashboard",   icon: LayoutDashboard },
  { id: "trade-log",       label: "Trade Log",   icon: ScrollText      },
  { id: "analytics",       label: "Analytics",   icon: BarChart2       },
  { id: "inspiration",     label: "Inspiration", icon: ImageIcon       },
];

interface SidebarProps {
  activePage:       Page;
  onNavigate:       (page: Page) => void;
  collapsed:        boolean;
  onToggleCollapse: () => void;
}

type PortfolioItem = { name: string; value: number; color: string };

function formatBalance(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency", currency: "USD", minimumFractionDigits: 2,
  }).format(n);
}

function fmtShort(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function openUrl(url: string) {
  if (url) openExternal(url).catch(console.error);
}

// ─── Shared nav button ────────────────────────────────────────────────────────

function NavBtn({
  icon: Icon, label, isActive, collapsed, onClick,
}: {
  icon: React.ElementType; label: string; isActive: boolean;
  collapsed: boolean; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title={collapsed ? label : undefined}
      className={clsx(
        "flex items-center gap-3 w-full rounded-lg text-[13px] font-medium transition-all duration-150 text-left",
        collapsed ? "px-0 py-2.5 justify-center" : "px-3 py-2.5",
      )}
      style={{
        background: isActive ? "var(--accent-dim)" : "transparent",
        color:      isActive ? "var(--accent-text)" : "var(--text-secondary)",
        border:     isActive ? "1px solid var(--accent-border)" : "1px solid transparent",
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
      {!collapsed && <span>{label}</span>}
    </button>
  );
}

function IconBtn({
  icon: Icon, label, collapsed, onClick,
}: {
  icon: React.ElementType; label: string;
  collapsed: boolean; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      className={clsx(
        "flex items-center gap-3 w-full rounded-lg text-[13px] font-medium transition-all duration-150 text-left",
        collapsed ? "px-0 py-2.5 justify-center" : "px-3 py-2.5",
      )}
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
      <Icon size={16} />
      {!collapsed && <span>{label}</span>}
    </button>
  );
}

// ─── Compact portfolio widget — shown in sidebar when expanded ────────────────

// Generates N shades of a base hex color from bright → dim
function accentShades(base: string, count: number): string[] {
  const opacities = [1, 0.7, 0.45, 0.28, 0.16];
  return Array.from({ length: count }, (_, i) => {
    const op = opacities[i % opacities.length];
    const r = parseInt(base.slice(1, 3), 16);
    const g = parseInt(base.slice(3, 5), 16);
    const b = parseInt(base.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${op})`;
  });
}

const THEME_BASE: Record<string, string> = {
  green:  "#22c55e",
  yellow: "#f59e0b",
  red:    "#ef4444",
};

function PortfolioWidget({ portfolio }: { portfolio: PortfolioItem[] }) {
  const { themeState } = useTheme();
  if (portfolio.length === 0) return null;
  const total  = portfolio.reduce((s, p) => s + p.value, 0);
  const shades = accentShades(THEME_BASE[themeState], portfolio.length);

  return (
    <div className="px-2 pb-2">
      <div
        className="rounded-xl overflow-hidden"
        style={{
          background: "var(--bg-panel)",
          border: "1px solid var(--border-subtle)",
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-3 pt-2.5 pb-1"
        >
          <span
            className="text-[13px] font-semibold uppercase tracking-widest"
            style={{ color: "var(--text-muted)" }}
          >
            Portfolio
          </span>
          <span
            className="text-[11px] font-bold tabular-nums"
            style={{ color: "var(--text-primary)" }}
          >
            {fmtShort(total)}
          </span>
        </div>

        {/* Donut chart */}
        <div style={{ height: 88 }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={portfolio}
                innerRadius={24}
                outerRadius={38}
                paddingAngle={2}
                dataKey="value"
                strokeWidth={0}
              >
                {portfolio.map((_, i) => (
                  <Cell key={i} fill={shades[i]} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Legend */}
        <div className="flex flex-col gap-1 px-3 pb-2.5">
          {portfolio.map((p, i) => {
            const pct = total > 0 ? ((p.value / total) * 100).toFixed(0) : "0";
            return (
              <div key={p.name} className="flex items-center gap-1.5 min-w-0">
                <span
                  className="w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ background: shades[i] }}
                />
                <span
                  className="flex-1 text-[10px] truncate"
                  style={{ color: "var(--text-secondary)" }}
                >
                  {p.name}
                </span>
                <span
                  className="text-[10px] tabular-nums shrink-0"
                  style={{ color: "var(--text-muted)" }}
                >
                  {pct}%
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────

export function Sidebar({ activePage, onNavigate, collapsed, onToggleCollapse }: SidebarProps) {
  const { ready } = useDatabase();
  const [account,      setAccount]      = useState<Account | null>(null);
  const [portfolio,    setPortfolio]    = useState<PortfolioItem[]>([]);
  const [brokerageUrl, setBrokerageUrl] = useState(getBrokerageUrl);
  const [musicUrl,     setMusicUrl]     = useState(getMusicUrl);

  const loadData = async () => {
    if (!ready) return;
    try {
      const settings = await getSettings();
      const [acc, port] = await Promise.all([
        getAccount(settings?.selectedAccountId ?? "acc-1"),
        getPortfolio(),
      ]);
      setAccount(acc);
      setPortfolio(port);
    } catch (err) {
      console.error("[Sidebar] failed to load:", err);
    }
  };

  useEffect(() => { loadData(); }, [ready]);
  useEffect(() => { if (!ready) return; return tradeEvents.subscribe(loadData); }, [ready]);

  useEffect(() => {
    const handler = () => {
      setBrokerageUrl(getBrokerageUrl());
      setMusicUrl(getMusicUrl());
    };
    window.addEventListener("tm:prefs-changed", handler);
    return () => window.removeEventListener("tm:prefs-changed", handler);
  }, []);

  const width = collapsed ? 56 : 220;

  return (
    <aside
      className="flex flex-col h-full select-none"
      style={{
        width, minWidth: width,
        background: "var(--bg-sidebar)",
        borderRight: "1px solid var(--border-subtle)",
        overflow: "hidden",
        transition: "width 0.2s ease, min-width 0.2s ease",
      }}
    >
      {/* ── Header ── */}
      <div
        className="flex items-center shrink-0"
        style={{
          borderBottom: "1px solid var(--border-subtle)",
          height: 52,
          padding: collapsed ? "0 8px" : "0 8px 0 16px",
          gap: 8,
        }}
      >
        {collapsed ? (
          /* Logo stays visible; expand icon fades in on hover */
          <div
            className="flex-1 h-full flex items-center justify-center relative group cursor-pointer rounded-lg"
            onClick={onToggleCollapse}
            title="Expand sidebar"
          >
            {/* Logo icon — always visible */}
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center overflow-hidden shrink-0 transition-opacity group-hover:opacity-0"
              style={{ background: "var(--accent-dim)", border: "1px solid var(--accent-border)" }}
            >
              {logoSrc
                ? <img src={logoSrc} alt="Logo" className="w-full h-full object-contain" />
                : <span className="text-[13px] font-bold" style={{ color: "var(--accent-text)" }}>TM</span>
              }
            </div>
            {/* Expand icon — fades in on hover */}
            <div
              className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity rounded-lg"
              style={{ color: "var(--text-secondary)", background: "var(--bg-hover)" }}
            >
              <PanelLeftOpen size={15} />
            </div>
          </div>
        ) : (
          <>
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center overflow-hidden shrink-0"
              style={{ background: "var(--accent-dim)", border: "1px solid var(--accent-border)" }}
            >
              {logoSrc
                ? <img src={logoSrc} alt="Logo" className="w-full h-full object-contain" />
                : <span className="text-[13px] font-bold" style={{ color: "var(--accent-text)" }}>TM</span>
              }
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[14px] font-semibold tracking-tight leading-tight" style={{ color: "var(--text-primary)" }}>
                TradeMirror
              </div>
              <div className="text-[10px]" style={{ color: "var(--text-muted)" }}>v1.0</div>
            </div>
            <button
              onClick={onToggleCollapse}
              title="Collapse sidebar"
              className="p-1.5 rounded-lg shrink-0 transition-colors"
              style={{ color: "var(--text-muted)" }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.background = "var(--bg-hover)";
                (e.currentTarget as HTMLElement).style.color = "var(--text-secondary)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.background = "transparent";
                (e.currentTarget as HTMLElement).style.color = "var(--text-muted)";
              }}
            >
              <PanelLeftClose size={14} />
            </button>
          </>
        )}
      </div>

      {/* ── Nav ── */}
      <nav
        className="flex-1 flex flex-col gap-0.5 overflow-hidden"
        style={{ padding: collapsed ? "8px 4px" : "8px 8px" }}
      >
        {NAV_ITEMS.map(({ id, label, icon }) => (
          <NavBtn
            key={id}
            icon={icon}
            label={label}
            isActive={activePage === id}
            collapsed={collapsed}
            onClick={() => onNavigate(id)}
          />
        ))}
      </nav>

      {/* ── Bottom section ── */}
      <div
        className="flex flex-col shrink-0"
        style={{
          borderTop: "1px solid var(--border-subtle)",
          paddingTop: 8,
          gap: 2,
        }}
      >
        {/* Portfolio widget — expanded sidebar only, just above Brokerage */}
        {!collapsed && (
          <PortfolioWidget portfolio={portfolio} />
        )}

        {/* Brokerage, Music, Settings */}
        <div style={{ padding: collapsed ? "0 4px 8px" : "0 8px 8px", display: "flex", flexDirection: "column", gap: 2 }}>
          <IconBtn
            icon={ExternalLink}
            label={brokerageUrl ? "Brokerage" : "Brokerage (set URL in Settings)"}
            collapsed={collapsed}
            onClick={() => brokerageUrl ? openUrl(brokerageUrl) : onNavigate("settings")}
          />
          <IconBtn
            icon={Music}
            label={musicUrl ? "Music" : "Music (set URL in Settings)"}
            collapsed={collapsed}
            onClick={() => musicUrl ? openUrl(musicUrl) : onNavigate("settings")}
          />
          <NavBtn
            icon={Settings}
            label="Settings"
            isActive={activePage === "settings"}
            collapsed={collapsed}
            onClick={() => onNavigate("settings")}
          />
        </div>

        {/* Account pill — expanded only */}
        {!collapsed && (
          <div
            className="mx-2 mb-2 px-3 py-3 rounded-xl"
            style={{
              background: "linear-gradient(160deg, var(--accent-panel-tint) 0%, var(--bg-panel) 60%)",
              border: "1px solid var(--accent-border)",
              boxShadow: "0 0 0 1px var(--accent-border), 0 4px 20px var(--accent-glow)",
            }}
          >
            <div className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--text-muted)" }}>
              Active Account
            </div>
            <div className="text-[13px] font-semibold" style={{ color: "var(--text-primary)" }}>
              {account?.name ?? "—"}
            </div>
            <div className="text-[12px] font-bold tabular-nums mt-0.5" style={{ color: "var(--accent-text)" }}>
              {account != null ? formatBalance(account.currentBalance) : "—"}
            </div>
            <div className="flex items-center gap-1.5 mt-1.5">
              <span className="w-1.5 h-1.5 rounded-full pulse-dot" style={{ background: "var(--accent)" }} />
              <span className="text-[10px]" style={{ color: "var(--accent-text)" }}>Live</span>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
