// ─── TradeTable — lists all trades for the selected account ──────────────────
import { useState, useEffect, useCallback, memo } from "react";
import { ArrowUpRight, ArrowDownRight, BookOpen, Pencil, Trash2 } from "lucide-react";
import { Badge } from "../ui/Badge";
import type { TradeWithJournal } from "../../db/queries";
import { getTimeFormat } from "../../lib/preferences";
import { formatTradeTime, formatSignedDollar } from "../../lib/tradeFormat";

interface Props {
  trades: TradeWithJournal[];
  onNewTrade: () => void;
  onEditTrade: (trade: TradeWithJournal) => void;
  onDeleteTrade: (tradeId: string) => void;
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

const COL_HEADERS = [
  { label: "#",            width: 40  },
  { label: "Entry Date",   width: 90  },
  { label: "Entry Time",   width: 80  },
  { label: "Instrument",   width: 100 },
  { label: "Side",         width: 72  },
  { label: "Size",         width: 72  },
  { label: "Entry Price",  width: 90  },
  { label: "Stop Price",   width: 90  },
  { label: "Take Profit",  width: 90  },
  { label: "Exit Date",    width: 90  },
  { label: "Exit Time",    width: 80  },
  { label: "Exit Price",   width: 90  },
  { label: "P&L",          width: 90  },
  { label: "Trade ID",     width: 90  },
  { label: "Setup",        width: 140 },
  { label: "Journal",      width: 68  },
  { label: "",             width: 72  }, // actions
];

interface TradeRowProps {
  trade: TradeWithJournal;
  rowNumber: number;
  rowBg: string;
  isNewDateGroup: boolean;
  hour12: boolean;
  awaitingConfirm: boolean;
  onEditTrade: (trade: TradeWithJournal) => void;
  onDeleteClick: (tradeId: string) => void;
}

// Memoized so that toggling the delete-confirm state (or hour12 pref) only
// re-renders the one row affected instead of every row in the table.
const TradeRow = memo(function TradeRow({
  trade, rowNumber, rowBg, isNewDateGroup, hour12, awaitingConfirm, onEditTrade, onDeleteClick,
}: TradeRowProps) {
  const pnl      = trade.pnl ?? 0;
  const isWin    = pnl > 0;
  const isLoss   = pnl < 0;
  const pnlColor = isWin ? "#7ed62e" : isLoss ? "#f03a3a" : "var(--text-secondary)";

  return (
    <tr
      className="group transition-colors cursor-pointer"
      style={{
        background: rowBg,
        borderBottom: "1px solid var(--border-subtle)",
        borderTop: isNewDateGroup ? "2px solid rgba(255,255,255,0.2)" : undefined,
      }}
      onDoubleClick={() => onEditTrade(trade)}
    >
      {/* # */}
      <td className="px-3 py-3 text-center tabular-nums" style={{ boxShadow: "inset -1px 0 0 var(--border-subtle)" }}>
        <span className="text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>
          {rowNumber}
        </span>
      </td>

      {/* Entry Date */}
      <td className="px-3 py-3 text-center">
        <span className="text-[12px] font-medium" style={{ color: "var(--text-secondary)" }}>
          {fmtDate(trade.openedAt)}
        </span>
      </td>

      {/* Entry Time */}
      <td className="px-3 py-3 text-center tabular-nums" style={{ boxShadow: "inset -1px 0 0 var(--border-subtle)" }}>
        <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
          {formatTradeTime(trade.openedAt, hour12)}
        </span>
      </td>

      {/* Instrument */}
      <td className="px-3 py-3 text-center" style={{ boxShadow: "inset -1px 0 0 var(--border-subtle)" }}>
        <span className="text-[13px] font-semibold" style={{ color: "var(--text-secondary)" }}>
          {trade.instrument}
        </span>
      </td>

      {/* Side */}
      <td className="px-3 py-3 text-center" style={{ boxShadow: "inset -1px 0 0 var(--border-subtle)" }}>
        <div className="flex items-center justify-center gap-1.5">
          <div
            className="w-5 h-5 rounded-md flex items-center justify-center"
            style={{ background: trade.side === "long" ? "rgba(126,214,46,0.12)" : "rgba(240,58,58,0.12)" }}
          >
            {trade.side === "long"
              ? <ArrowUpRight size={12} style={{ color: "#7ed62e" }} />
              : <ArrowDownRight size={12} style={{ color: "#f03a3a" }} />
            }
          </div>
          <span className="text-[12px] font-medium capitalize" style={{ color: trade.side === "long" ? "#7ed62e" : "#f03a3a" }}>
            {trade.side}
          </span>
        </div>
      </td>

      {/* Size */}
      <td className="px-3 py-3 text-center tabular-nums" style={{ boxShadow: "inset -1px 0 0 var(--border-subtle)" }}>
        <span className="text-[12px]" style={{ color: "var(--text-muted)" }}>
          {fmtSize(trade.size)}
        </span>
      </td>

      {/* Entry Price */}
      <td className="px-3 py-3 text-center tabular-nums">
        <span className="text-[12px]" style={{ color: "var(--text-muted)" }}>
          {fmtPrice(trade.entryPrice)}
        </span>
      </td>

      {/* Stop Price */}
      <td className="px-3 py-3 text-center tabular-nums">
        <span className="text-[12px]" style={{ color: "var(--text-muted)" }}>
          {fmtPrice(trade.stopPrice)}
        </span>
      </td>

      {/* Target Price */}
      <td className="px-3 py-3 text-center tabular-nums" style={{ boxShadow: "inset -1px 0 0 var(--border-subtle)" }}>
        <span className="text-[12px]" style={{ color: "var(--text-muted)" }}>
          {fmtPrice(trade.targetPrice)}
        </span>
      </td>

      {/* Exit Date */}
      <td className="px-3 py-3 text-center" style={{ whiteSpace: "nowrap" }}>
        <span className="text-[12px] font-medium" style={{ color: "var(--text-secondary)" }}>
          {trade.closedAt ? fmtDate(trade.closedAt) : "—"}
        </span>
      </td>

      {/* Exit Time */}
      <td className="px-3 py-3 text-center tabular-nums">
        <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
          {trade.closedAt ? formatTradeTime(trade.closedAt, hour12) : "—"}
        </span>
      </td>

      {/* Exit Price */}
      <td className="px-3 py-3 text-center tabular-nums" style={{ boxShadow: "inset -1px 0 0 var(--border-subtle)" }}>
        <span className="text-[12px]" style={{ color: "var(--text-muted)" }}>
          {fmtPrice(trade.exitPrice)}
        </span>
      </td>

      {/* P&L */}
      <td className="px-3 py-3 text-center tabular-nums" style={{ boxShadow: "inset -1px 0 0 var(--border-subtle)" }}>
        <span className="text-[13px] font-bold" style={{ color: pnlColor }}>
          {formatSignedDollar(pnl)}
        </span>
      </td>

      {/* Trade ID */}
      <td className="px-3 py-3 text-center tabular-nums" style={{ boxShadow: "inset -1px 0 0 var(--border-subtle)" }}>
        <span className="text-[11px] font-mono" style={{ color: "var(--text-muted)" }}>
          {trade.tradeRef ?? "—"}
        </span>
      </td>

      {/* Setup */}
      <td className="px-3 py-3 text-center">
        {trade.setupName ? (
          <span className="text-[12px]" style={{ color: "var(--text-muted)" }}>
            {trade.setupName}
          </span>
        ) : (
          <span style={{ color: "var(--text-muted)" }}>—</span>
        )}
      </td>

      {/* Journal indicator */}
      <td className="px-3 py-3 text-center">
        {trade.journal ? (
          <Badge label="✓" color="green" />
        ) : (
          <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>—</span>
        )}
      </td>

      {/* Actions */}
      <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-center gap-1">
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
            onClick={(e) => { e.stopPropagation(); onDeleteClick(trade.id); }}
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
});

export function TradeTable({ trades, onNewTrade, onEditTrade, onDeleteTrade }: Props) {
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [hour12, setHour12] = useState(() => getTimeFormat() === "12h");

  useEffect(() => {
    const handler = () => setHour12(getTimeFormat() === "12h");
    window.addEventListener("tm:prefs-changed", handler);
    return () => window.removeEventListener("tm:prefs-changed", handler);
  }, []);

  // Stable across re-renders (no confirmDeleteId in deps) so TradeRow's memo
  // isn't invalidated for every row just because one row's confirm state ticked.
  const handleDeleteClick = useCallback((tradeId: string) => {
    setConfirmDeleteId((cur) => {
      if (cur === tradeId) {
        onDeleteTrade(tradeId);
        return null;
      }
      // Auto-cancel after 4 s
      setTimeout(() => setConfirmDeleteId((c) => (c === tradeId ? null : c)), 4000);
      return tradeId;
    });
  }, [onDeleteTrade]);

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
        <thead className="sticky top-0 z-10">
          <tr style={{ background: "linear-gradient(rgba(255,255,255,0.07), rgba(255,255,255,0.07)), var(--bg-panel)", borderBottom: "2px solid var(--border-medium)" }}>
            {COL_HEADERS.map((col, i) => (
              <th
                key={i}
                className="text-center px-3 py-2.5 text-[11px] font-semibold uppercase tracking-widest"
                style={{ color: "var(--text-secondary)", width: col.width, whiteSpace: "nowrap", boxShadow: i === 0 || i === 2 || i === 3 || i === 4 || i === 5 || i === 8 || i === 11 || i === 12 || i === 13 ? "inset -1px 0 0 var(--border-subtle)" : undefined }}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {trades.map((trade, i) => {
            const prevDate = i > 0 ? (trades[i - 1].closedAt?.slice(0, 10) ?? null) : null;
            const thisDate = trade.closedAt?.slice(0, 10) ?? null;
            const isNewDateGroup = prevDate !== null && prevDate !== thisDate;
            return (
              <TradeRow
                key={trade.id}
                trade={trade}
                rowNumber={trades.length - i}
                rowBg={i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.04)"}
                isNewDateGroup={isNewDateGroup}
                hour12={hour12}
                awaitingConfirm={confirmDeleteId === trade.id}
                onEditTrade={onEditTrade}
                onDeleteClick={handleDeleteClick}
              />
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
