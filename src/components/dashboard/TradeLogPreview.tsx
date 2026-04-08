import { ArrowUpRight, ArrowDownRight, ExternalLink } from "lucide-react";
import { Panel, PanelHeader } from "../ui/Panel";
import { Badge } from "../ui/Badge";
import { RECENT_TRADES } from "../../data/mockData";

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
}

export function TradeLogPreview() {
  return (
    <Panel className="h-full flex flex-col">
      <PanelHeader label="Today's Trades">
        <button className="flex items-center gap-1 text-[11px]" style={{ color: "var(--text-secondary)" }}>
          View all <ExternalLink size={11} />
        </button>
      </PanelHeader>

      <div className="flex flex-col gap-2 flex-1 overflow-auto">
        {RECENT_TRADES.map((trade) => {
          const isWin = trade.pnl > 0;
          const pnlStr = `${isWin ? "+" : ""}$${Math.abs(trade.pnl).toLocaleString()}`;
          return (
            <div
              key={trade.id}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors"
              style={{ background: "var(--bg-panel-alt)", border: "1px solid var(--border-subtle)" }}
            >
              {/* Side icon */}
              <div
                className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{
                  background: isWin ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.12)",
                }}
              >
                {trade.side === "long"
                  ? <ArrowUpRight size={14} style={{ color: isWin ? "#4ade80" : "#f87171" }} />
                  : <ArrowDownRight size={14} style={{ color: isWin ? "#4ade80" : "#f87171" }} />
                }
              </div>

              {/* Instrument + setup */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-semibold" style={{ color: "var(--text-primary)" }}>
                    {trade.instrument}
                  </span>
                  <Badge
                    label={trade.side === "long" ? "Long" : "Short"}
                    color={trade.side === "long" ? "green" : "red"}
                  />
                </div>
                <div className="text-[11px] truncate mt-0.5" style={{ color: "var(--text-secondary)" }}>
                  {trade.setupName} · {formatTime(trade.openedAt)}
                </div>
              </div>

              {/* P&L + RR */}
              <div className="text-right flex-shrink-0">
                <div
                  className="text-[14px] font-bold tabular-nums"
                  style={{ color: isWin ? "#4ade80" : "#f87171" }}
                >
                  {pnlStr}
                </div>
                <div className="text-[11px] tabular-nums" style={{ color: "var(--text-muted)" }}>
                  {trade.rr > 0 ? "+" : ""}{trade.rr.toFixed(1)}R
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}
