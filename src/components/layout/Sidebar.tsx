import { useEffect, useState } from "react";
import {
  LayoutDashboard, ScrollText, BarChart2,
  Settings, Star, X, GripVertical,
  PanelLeftClose, PanelLeftOpen, ExternalLink, Music,
} from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { clsx } from "clsx";
import { pairSelectionEvents } from "../../lib/pairSelection";
import { quoteCache, startWarmLoop, setWarmPriorityPairs, WARM_INTERVAL_MS } from "../analytics/InstrumentTicker";
import { useAccountAndPortfolio, type PortfolioItem } from "../../hooks/useAccountAndPortfolio";
import { logoSrc } from "../../config/branding";
import { getMusicUrl, getAccountBrokerUrl, getFavoritePairs, removeFavoritePair, reorderFavoritePairs } from "../../lib/preferences";
import { useTheme } from "../../theme/ThemeContext";
import { openUrl as openExternal } from "@tauri-apps/plugin-opener";

export type Page =
  | "dashboard" | "trade-log" | "calendar" | "analytics-v3"
  | "risk-calculator" | "settings";

const NAV_ITEMS: { id: Page; label: string; icon: React.ElementType }[] = [
  { id: "dashboard",       label: "Dashboard",     icon: LayoutDashboard },
  { id: "trade-log",       label: "Trade Log",     icon: ScrollText      },
  { id: "analytics-v3",    label: "Analytics",     icon: BarChart2       },
];

interface SidebarProps {
  activePage:       Page;
  onNavigate:       (page: Page) => void;
  collapsed:        boolean;
  onToggleCollapse: () => void;
}

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
  icon: Icon, label, isActive, collapsed, onClick, neutral,
}: {
  icon: React.ElementType; label: string; isActive: boolean;
  collapsed: boolean; onClick: () => void; neutral?: boolean;
}) {
  const activeBg     = neutral ? "rgba(255,255,255,0.06)"  : "var(--accent-dim)";
  const activeColor  = neutral ? "rgba(255,255,255,0.75)"  : "var(--accent-text)";
  const activeBorder = neutral ? "1px solid rgba(255,255,255,0.12)" : "1px solid var(--accent-border)";

  return (
    <button
      onClick={onClick}
      title={collapsed ? label : undefined}
      className={clsx(
        "flex items-center gap-3 w-full rounded-lg text-[13px] font-medium transition-all duration-150 text-left",
        collapsed ? "px-0 py-2.5 justify-center" : "px-3 py-2.5",
      )}
      style={{
        background: isActive ? activeBg     : "transparent",
        color:      isActive ? activeColor  : "var(--text-secondary)",
        border:     isActive ? activeBorder : "1px solid transparent",
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
  green:  "#7ed62e",
  yellow: "#f59e0b",
  red:    "#ef4444",
};

function PortfolioWidget({ portfolio, activeAccountName }: { portfolio: PortfolioItem[]; activeAccountName: string | undefined }) {
  const { themeState } = useTheme();
  if (portfolio.length === 0) return null;
  const total     = portfolio.reduce((s, p) => s + p.value, 0);
  const shades    = accentShades(THEME_BASE[themeState], portfolio.length);
  const activeIdx = portfolio.findIndex(p => p.name === activeAccountName);
  const glowColor = THEME_BASE[themeState];

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
                  <Cell
                    key={i}
                    fill={shades[i]}
                    style={i === activeIdx ? { filter: `drop-shadow(0 0 7px ${glowColor})` } : undefined}
                  />
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

// ─── Favorites panel — quick-select instruments, shown when expanded ─────────

function FavoritesPanel({
  favorites, onSelect, onRemove, onReorder,
}: {
  favorites: string[]; onSelect: (pair: string) => void; onRemove: (pair: string) => void;
  onReorder: (pair: string, toIndex: number) => void;
}) {
  // Native HTML5 drag-and-drop — no new dependency needed for a plain
  // reorder-within-one-list interaction. dragOverIndex just drives the
  // insertion-line indicator; the actual reorder happens once on drop.
  const [dragPair, setDragPair] = useState<string | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  // Day % change reuses the same background-warming quote cache as the
  // Analytics ticker (see InstrumentTicker.tsx) rather than a second fetch
  // pipeline — start it here too in case Analytics hasn't been visited yet,
  // and re-render on its cadence so each row's % ticks over as it refreshes.
  const [, forceRefresh] = useState(0);
  useEffect(() => {
    startWarmLoop();
    const id = setInterval(() => forceRefresh(t => t + 1), WARM_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);
  useEffect(() => setWarmPriorityPairs(favorites), [favorites]);

  if (favorites.length === 0) return null;
  return (
    <div className="px-2 pb-2">
      <div
        className="rounded-xl overflow-hidden"
        style={{ background: "var(--bg-panel)", border: "1px solid var(--border-subtle)" }}
      >
        <div className="flex items-center gap-1.5 px-3 pt-2.5 pb-1.5">
          <Star size={12} style={{ color: "var(--text-muted)" }} />
          <span className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
            Favorites
          </span>
        </div>
        <div className="flex flex-col gap-0.5 px-2 pb-2">
          {favorites.map((pair, i) => (
            <div
              key={pair}
              draggable
              onDragStart={(e) => { setDragPair(pair); e.dataTransfer.effectAllowed = "move"; }}
              onDragOver={(e) => { e.preventDefault(); if (dragPair && dragPair !== pair) setDragOverIndex(i); }}
              onDrop={(e) => {
                e.preventDefault();
                if (dragPair) onReorder(dragPair, i);
                setDragPair(null); setDragOverIndex(null);
              }}
              onDragEnd={() => { setDragPair(null); setDragOverIndex(null); }}
              onClick={() => onSelect(pair)}
              className="group flex items-center justify-between rounded-lg px-2 py-1.5 cursor-pointer transition-colors min-w-0"
              style={{
                color: "var(--text-secondary)",
                opacity: dragPair === pair ? 0.4 : 1,
                boxShadow: dragOverIndex === i && dragPair !== pair ? "inset 0 2px 0 0 var(--accent-border)" : "none",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.background = "var(--bg-hover)";
                (e.currentTarget as HTMLElement).style.color = "var(--text-primary)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.background = "transparent";
                (e.currentTarget as HTMLElement).style.color = "var(--text-secondary)";
              }}
            >
              <div className="flex items-center gap-1.5 min-w-0">
                <GripVertical
                  size={12}
                  className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                  style={{ color: "var(--text-muted)", cursor: "grab" }}
                />
                <span className="text-[12px] font-medium truncate">{pair}</span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {(() => {
                  const q = quoteCache.get(pair);
                  if (!q) return null;
                  const up = q.changePct >= 0;
                  return (
                    <span className="text-[11px] font-semibold" style={{ color: up ? "#60a5fa" : "#a78bfa" }}>
                      {up ? "+" : ""}{q.changePct.toFixed(2)}%
                    </span>
                  );
                })()}
                <button
                  onClick={(e) => { e.stopPropagation(); onRemove(pair); }}
                  title="Remove from favorites"
                  className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                  style={{ color: "var(--text-muted)", lineHeight: 0 }}
                >
                  <X size={12} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────

export function Sidebar({ activePage, onNavigate, collapsed, onToggleCollapse }: SidebarProps) {
  const { account, portfolio } = useAccountAndPortfolio();
  const [musicUrl,     setMusicUrl]     = useState(getMusicUrl);
  const [favorites,    setFavorites]    = useState<string[]>(getFavoritePairs);

  useEffect(() => {
    const handler = () => { setMusicUrl(getMusicUrl()); setFavorites(getFavoritePairs()); };
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
            neutral={id === "analytics-v3"}
          />
        ))}
        {!collapsed && (
          <div className="mt-2">
            <FavoritesPanel
              favorites={favorites}
              onSelect={(pair) => { onNavigate("analytics-v3"); pairSelectionEvents.select(pair); }}
              onRemove={removeFavoritePair}
              onReorder={reorderFavoritePairs}
            />
          </div>
        )}
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
        {/* Brokerage, Music, Settings */}
        <div style={{ padding: collapsed ? "0 4px 0" : "0 8px 0", display: "flex", flexDirection: "column", gap: 2 }}>
          <IconBtn
            icon={ExternalLink}
            label="Brokerage"
            collapsed={collapsed}
            onClick={() => {
              const url = account ? getAccountBrokerUrl(account.id) : "";
              url ? openUrl(url) : onNavigate("settings");
            }}
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

        {/* Portfolio widget — expanded sidebar only, on the bottom */}
        {!collapsed && (
          <PortfolioWidget portfolio={portfolio} activeAccountName={account?.name} />
        )}
      </div>
    </aside>
  );
}
