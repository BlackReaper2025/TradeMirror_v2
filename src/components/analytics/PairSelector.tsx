import { useState } from "react";
import { ChevronDown } from "lucide-react";

type Category = "Forex" | "Stocks" | "ETFs" | "Crypto";

const CATEGORIES: Record<Category, string[]> = {
  Forex:  ["EUR/USD", "GBP/USD", "USD/JPY", "USD/CAD", "AUD/USD", "USD/CHF", "NZD/USD"],
  Stocks: ["AAPL", "TSLA", "NVDA", "AMZN", "MSFT", "META", "GOOGL"],
  ETFs:   ["SPY", "QQQ", "GLD", "TLT", "VXX", "IWM", "XLF"],
  Crypto: ["BTC/USD", "ETH/USD", "SOL/USD", "XRP/USD", "BNB/USD", "DOGE/USD"],
};

const DEFAULT_CATEGORY: Category = "Forex";
const DEFAULT_PAIR = "EUR/USD";

interface PairSelectorProps {
  onPairChange?: (pair: string, category: Category) => void;
}

export function PairSelector({ onPairChange }: PairSelectorProps) {
  const [open,     setOpen]     = useState(false);
  const [category, setCategory] = useState<Category>(DEFAULT_CATEGORY);
  const [pair,     setPair]     = useState(DEFAULT_PAIR);

  function selectPair(p: string) {
    setPair(p);
    onPairChange?.(p, category);
  }

  function selectCategory(c: Category) {
    setCategory(c);
  }

  return (
    <div className="relative h-full" style={{ zIndex: open ? 20 : "auto" }}>


      {/* ── Inline expanding container ─────────────────────────── */}
      <div
        className="h-full flex items-center rounded-[14px] overflow-hidden"
        style={{
          background:  "var(--bg-panel)",
          border:      "1px solid var(--border-subtle)",
          position:    "relative",
          zIndex:      1,
        }}
      >

        {/* Trigger */}
        <button
          onClick={() => setOpen((o) => !o)}
          className="h-full flex items-center gap-2.5 px-4 shrink-0"
          style={{ minWidth: "180px" }}
        >
          <div
            className="w-1.5 h-1.5 rounded-full shrink-0"
            style={{ background: "var(--accent-text)" }}
          />
          <div className="flex flex-col items-start leading-none gap-0.5">
            <span className="text-[13px] font-bold tracking-wide" style={{ color: "var(--text-primary)" }}>
              {pair}
            </span>
            <span className="text-[9px] uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
              {category}
            </span>
          </div>
          <ChevronDown
            size={13}
            style={{
              color:     "var(--text-muted)",
              marginLeft: "auto",
              transform:  open ? "rotate(180deg)" : "rotate(0deg)",
              transition: "transform 0.18s",
            }}
          />
        </button>

        {/* Expanded section — always rendered, animated via max-width + opacity */}
        <div
          className="flex items-center overflow-hidden"
          style={{
            maxWidth:   open ? "900px" : "0px",
            opacity:    open ? 1 : 0,
            transition: "max-width 0.3s cubic-bezier(0.4,0,0.2,1), opacity 0.2s ease",
            pointerEvents: open ? "auto" : "none",
          }}
        >
          {/* Divider */}
          <div className="h-5 w-px shrink-0" style={{ background: "var(--border-medium)" }} />

          {/* Category tabs */}
          <div className="flex items-center gap-1 px-2.5 shrink-0">
            {(Object.keys(CATEGORIES) as Category[]).map((c) => {
              const active = c === category;
              return (
                <button
                  key={c}
                  onClick={() => selectCategory(c)}
                  className="px-2.5 py-1 rounded-[8px] text-[10px] font-semibold uppercase tracking-widest transition-all"
                  style={{
                    background: active ? "var(--accent-dim)"    : "transparent",
                    border:     active ? "1px solid var(--accent-border)" : "1px solid transparent",
                    color:      active ? "var(--accent-text)"   : "var(--text-muted)",
                  }}
                >
                  {c}
                </button>
              );
            })}
          </div>

          {/* Divider */}
          <div className="h-5 w-px shrink-0" style={{ background: "var(--border-medium)" }} />

          {/* Pair chips — horizontal */}
          <div className="flex items-center gap-1 px-2.5">
            {CATEGORIES[category].map((p) => {
              const active = p === pair;
              return (
                <button
                  key={p}
                  onClick={() => selectPair(p)}
                  className="px-2.5 py-1 rounded-[8px] text-[11px] font-semibold whitespace-nowrap transition-all"
                  style={{
                    background: active ? "var(--accent-dim)"  : "transparent",
                    border:     active ? "1px solid var(--accent-border)" : "1px solid transparent",
                    color:      active ? "var(--accent-text)" : "var(--text-secondary)",
                  }}
                  onMouseEnter={(e) => {
                    if (!active) (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.04)";
                  }}
                  onMouseLeave={(e) => {
                    if (!active) (e.currentTarget as HTMLElement).style.background = "transparent";
                  }}
                >
                  {p}
                </button>
              );
            })}
          </div>
        </div>

      </div>
    </div>
  );
}
