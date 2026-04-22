// ─── TradeTable — lists all trades for the selected account ──────────────────
import { useState, useEffect } from "react";
import { ArrowUpRight, ArrowDownRight, BookOpen, Pencil, Trash2 } from "lucide-react";
import { Badge } from "../ui/Badge";
import type { TradeWithJournal } from "../../db/queries";
import { getTimeFormat } from "../../lib/preferences";

interface Props {
  trades: TradeWithJournal[];
  onNewTrade: () => void;
  onEditTrade: (trade: TradeWithJournal) => void;
  onDeleteTrade: (tradeId: string) => void;
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

function fmtSize(n: number | null | undefined) {
  if (n == null) return "—";
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function fmtTime(iso: string, hour12: boolean) {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12 });
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
  { label: "#",            width: 40  },
  { label: "Entry Date",   width: 90  },
  { label: "Entry Time",   width: 80  },
  { label: "Instrument",   width: 100 },
  { label: "Side",         width: 72  },
  { label: "Size",         width: 72  },
  { label: "Entry Price",  width: 90  },
  { label: "Stop Price",   width: 90  },
  { label: "Target Price", width: 90  },
  { label: "Exit Date",    width: 90  },
  { label: "Exit Time",    width: 80  },
  { label: "P&L",          width: 90  },
  { label: "Setup",        width: 140 },
  { label: "Journal",      width: 68  },
  { label: "",             width: 72  }, // actions
];

export function TradeTable({ trades, onNewTrade, onEditTrade, onDeleteTrade }: Props) {
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [hour12, setHour12] = useState(() => getTimeFormat() === "12h");

  useEffect(() => {
    const handler = () => setHour12(getTimeFormat() === "12h");
    window.addEventListener("tm:prefs-changed", handler);
    return () => window.removeEventListener("tm:prefs-changed", handler);
  }, []);

  function handleDeleteClick(e: React.MouseEvent, tradeId: string) {
    e.stopPropagation(); // don't open the edit drawer
    if (confirmDeleteId === tradeId) {
      // Second click = confirmed
      setConfirmDeleteId(null);
      onDeleteTrade(tradeId);
    } else {
      setConfirmDeleteId(tradeId);
      // Auto-cancel after 4 s
      setTimeout(() => setConfirmDeleteId((cur) => (cur === tradeId ? null : cur)), 4000);
    }
  }

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
      <table className="w-full border-collapse" style={{ minWidth: 960 }}>
        <thead>
          <tr style={{ borderBottom: "1px solid var(--border-subtle)" }}>
            {COL_HEADERS.map((col, i) => (
              <th
                key={i}
                className="text-left px-3 py-2.5 text-[11px] font-semibold uppercase tracking-widest"
                style={{ color: "var(--text-muted)", width: col.width, whiteSpace: "nowrap" }}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {trades.map((trade, i) => {
            const pnl      = trade.pnl ?? 0;
            const isWin    = pnl > 0;
            const isLoss   = pnl < 0;
            const pnlColor = isWin ? "#4ade80" : isLoss ? "#f87171" : "var(--text-secondary)";
            const awaitingConfirm = confirmDeleteId === trade.id;
            const prevDate = i > 0 ? trades[i - 1].openedAt.slice(0, 10) : null;
            const thisDate = trade.openedAt.slice(0, 10);
            const isNewDateGroup = prevDate !== null && prevDate !== thisDate;

            return (
              <tr
                key={trade.id}
                className="group transition-colors cursor-pointer"
                style={{
                  borderBottom: "1px solid var(--border-subtle)",
                  borderTop: isNewDateGroup ? "2px solid var(--border-medium)" : undefined,
                }}
                onDoubleClick={() => onEditTrade(trade)}
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-panel-alt)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                {/* # */}
                <td className="px-3 py-3 tabular-nums">
                  <span className="text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>
                    {trades.length - i}
                  </span>
                </td>

                {/* Entry Date */}
                <td className="px-3 py-3">
                  <span className="text-[12px] font-medium" style={{ color: "var(--text-secondary)" }}>
                    {fmtDate(trade.openedAt)}
                  </span>
                </td>

                {/* Entry Time */}
                <td className="px-3 py-3 tabular-nums">
                  <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                    {fmtTime(trade.openedAt, hour12)}
                  </span>
                </td>

                {/* Instrument */}
                <td className="px-3 py-3">
                  <span className="text-[13px] font-semibold" style={{ color: "var(--text-secondary)" }}>
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

                {/* Size */}
                <td className="px-3 py-3 tabular-nums">
                  <span className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
                    {fmtSize(trade.size)}
                  </span>
                </td>

                {/* Entry Price */}
                <td className="px-3 py-3 tabular-nums">
                  <span className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
                    {fmtPrice(trade.entryPrice)}
                  </span>
                </td>

                {/* Stop Price */}
                <td className="px-3 py-3 tabular-nums">
                  <span className="text-[12px]" style={{ color: "#f87171", opacity: 0.8 }}>
                    {fmtPrice(trade.stopPrice)}
                  </span>
                </td>

                {/* Target Price */}
                <td className="px-3 py-3 tabular-nums">
                  <span className="text-[12px]" style={{ color: "#4ade80", opacity: 0.8 }}>
                    {fmtPrice(trade.targetPrice)}
                  </span>
                </td>

                {/* Exit Date */}
                <td className="px-3 py-3">
                  <span className="text-[12px] font-medium" style={{ color: "var(--text-secondary)" }}>
                    {trade.closedAt ? fmtDate(trade.closedAt) : "—"}
                  </span>
                </td>

                {/* Exit Time */}
                <td className="px-3 py-3 tabular-nums">
                  <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                    {trade.closedAt ? fmtTime(trade.closedAt, hour12) : "—"}
                  </span>
                </td>

                {/* P&L */}
                <td className="px-3 py-3 tabular-nums">
                  <span className="text-[13px] font-bold" style={{ color: pnlColor }}>
                    {fmt(pnl)}
                  </span>
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

                {/* Journal indicator */}
                <td className="px-3 py-3">
                  {trade.journal ? (
                    <Badge label="✓" color="green" />
                  ) : (
                    <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>—</span>
                  )}
                </td>

                {/* Actions */}
                <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center gap-1">
                    {/* Edit hint icon — subtle, reinforces row is clickable */}
                    <button
                      title="Edit trade"
                      onClick={(e) => { e.stopPropagation(); onEditTrade(trade); }}
                      className="w-6 h-6 rounded flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      style={{ color: "var(--text-muted)" }}
                    >
                      <Pencil size={12} />
                    </button>

                    {/* Delete button — two-click confirm */}
                    <button
                      title={awaitingConfirm ? "Click again to confirm delete" : "Delete trade"}
                      onClick={(e) => handleDeleteClick(e, trade.id)}
                      className="w-6 h-6 rounded flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all"
                      style={{
                        color: awaitingConfirm ? "#f87171" : "var(--text-muted)",
                        background: awaitingConfirm ? "rgba(248,113,113,0.12)" : "transparent",
                        opacity: awaitingConfirm ? 1 : undefined,
                      }}
                    >
                      <Trash2 size={12} />
                    </button>

                    {/* Confirm label */}
                    {awaitingConfirm && (
                      <span className="text-[10px] font-semibold" style={{ color: "#f87171" }}>
                        Confirm?
                      </span>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
