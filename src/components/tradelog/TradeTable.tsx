// ─── TradeTable — lists all trades for the selected account ──────────────────
import { ArrowUpRight, ArrowDownRight, BookOpen } from "lucide-react";
import { Badge } from "../ui/Badge";
import type { TradeWithJournal } from "../../db/queries";

interface Props {
  trades: TradeWithJournal[];
  onNewTrade: () => void;
}

function fmt(n: number | null | undefined) {
  if (n == null) return "—";
  const abs = Math.abs(n).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return n >= 0 ? `+$${abs}` : `-$${abs}`;
}

function fmtPrice(n: number | null | undefined) {
  if (n == null) return "—";
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 5 });
}

function fmtDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
}

function calcRR(t: TradeWithJournal): string {
  const { entryPrice: e, stopPrice: s, targetPrice: tp, side } = t;
  if (e == null || s == null || tp == null) return "—";
  const risk   = side === "long" ? e - s : s - e;
  const reward = side === "long" ? tp - e : e - tp;
  if (risk <= 0) return "—";
  const rr = reward / risk;
  return `${rr >= 0 ? "+" : ""}${rr.toFixed(1)}R`;
}

const COL_HEADERS = [
  { label: "Date",        width: 110 },
  { label: "Instrument",  width: 120 },
  { label: "Side",        width: 72  },
  { label: "Setup",       width: 160 },
  { label: "Entry",       width: 90  },
  { label: "Stop",        width: 90  },
  { label: "Target",      width: 90  },
  { label: "Size",        width: 72  },
  { label: "R:R",         width: 68  },
  { label: "P&L",         width: 100 },
  { label: "Journal",     width: 68  },
];

export function TradeTable({ trades, onNewTrade }: Props) {
  if (trades.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 gap-4" style={{ color: "var(--text-muted)" }}>
        <div
          className="w-12 h-12 rounded-xl flex items-center justify-center"
          style={{ background: "var(--bg-panel-alt)", border: "1px solid var(--border-subtle)" }}
        >
          <BookOpen size={20} style={{ color: "var(--text-muted)" }} />
        </div>
        <div className="text-center">
          <div className="text-[13px] font-semibold mb-1" style={{ color: "var(--text-secondary)" }}>
            No trades yet
          </div>
          <div className="text-[12px]" style={{ color: "var(--text-muted)" }}>
            Hit the button above to log your first trade.
          </div>
        </div>
        <button
          onClick={onNewTrade}
          className="px-4 py-2 rounded-lg text-[12px] font-semibold transition-opacity hover:opacity-80"
          style={{ background: "var(--accent-dim)", color: "var(--accent-text)", border: "1px solid var(--accent-border)" }}
        >
          + New Trade
        </button>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto">
      <table className="w-full border-collapse" style={{ minWidth: 900 }}>
        <thead>
          <tr style={{ borderBottom: "1px solid var(--border-subtle)" }}>
            {COL_HEADERS.map((col) => (
              <th
                key={col.label}
                className="text-left px-3 py-2.5 text-[11px] font-semibold uppercase tracking-widest"
                style={{ color: "var(--text-muted)", width: col.width, whiteSpace: "nowrap" }}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {trades.map((trade) => {
            const pnl     = trade.pnl ?? 0;
            const isWin   = pnl > 0;
            const isLoss  = pnl < 0;
            const pnlColor = isWin ? "#4ade80" : isLoss ? "#f87171" : "var(--text-secondary)";

            return (
              <tr
                key={trade.id}
                className="group transition-colors"
                style={{ borderBottom: "1px solid var(--border-subtle)" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-panel-alt)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                {/* Date + time */}
                <td className="px-3 py-3">
                  <div className="text-[12px] font-medium" style={{ color: "var(--text-primary)" }}>
                    {fmtDate(trade.openedAt)}
                  </div>
                  <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                    {fmtTime(trade.openedAt)}
                  </div>
                </td>

                {/* Instrument */}
                <td className="px-3 py-3">
                  <span className="text-[13px] font-semibold" style={{ color: "var(--text-primary)" }}>
                    {trade.instrument}
                  </span>
                </td>

                {/* Side */}
                <td className="px-3 py-3">
                  <div className="flex items-center gap-1.5">
                    <div
                      className="w-5 h-5 rounded-md flex items-center justify-center"
                      style={{ background: trade.side === "long" ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.12)" }}
                    >
                      {trade.side === "long"
                        ? <ArrowUpRight size={12} style={{ color: "#4ade80" }} />
                        : <ArrowDownRight size={12} style={{ color: "#f87171" }} />
                      }
                    </div>
                    <span className="text-[12px] font-medium capitalize" style={{ color: trade.side === "long" ? "#4ade80" : "#f87171" }}>
                      {trade.side}
                    </span>
                  </div>
                </td>

                {/* Setup */}
                <td className="px-3 py-3">
                  {trade.setupName ? (
                    <span className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
                      {trade.setupName}
                    </span>
                  ) : (
                    <span style={{ color: "var(--text-muted)" }}>—</span>
                  )}
                </td>

                {/* Entry */}
                <td className="px-3 py-3 tabular-nums">
                  <span className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
                    {fmtPrice(trade.entryPrice)}
                  </span>
                </td>

                {/* Stop */}
                <td className="px-3 py-3 tabular-nums">
                  <span className="text-[12px]" style={{ color: "#f87171", opacity: 0.8 }}>
                    {fmtPrice(trade.stopPrice)}
                  </span>
                </td>

                {/* Target */}
                <td className="px-3 py-3 tabular-nums">
                  <span className="text-[12px]" style={{ color: "#4ade80", opacity: 0.8 }}>
                    {fmtPrice(trade.targetPrice)}
                  </span>
                </td>

                {/* Size */}
                <td className="px-3 py-3 tabular-nums">
                  <span className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
                    {trade.size != null ? trade.size : "—"}
                  </span>
                </td>

                {/* R:R */}
                <td className="px-3 py-3 tabular-nums">
                  <span className="text-[12px] font-medium" style={{ color: "var(--text-secondary)" }}>
                    {calcRR(trade)}
                  </span>
                </td>

                {/* P&L */}
                <td className="px-3 py-3 tabular-nums">
                  <span className="text-[13px] font-bold" style={{ color: pnlColor }}>
                    {fmt(pnl)}
                  </span>
                </td>

                {/* Journal indicator */}
                <td className="px-3 py-3">
                  {trade.journal ? (
                    <Badge label="✓" color="green" />
                  ) : (
                    <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
