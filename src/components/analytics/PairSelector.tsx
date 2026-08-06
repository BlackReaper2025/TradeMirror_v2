import { useEffect, useRef, useState } from "react";
import { ChevronDown, Search, X } from "lucide-react";

type Category = "Forex" | "Stocks" | "ETFs" | "Crypto";

const CATEGORIES: Record<Category, string[]> = {
  Forex:  [
    "AUD/CAD", "AUD/CHF", "AUD/JPY", "AUD/NZD", "AUD/USD",
    "CAD/CHF", "CAD/JPY", "CHF/JPY",
    "EUR/AUD", "EUR/CAD", "EUR/CHF", "EUR/GBP", "EUR/JPY", "EUR/NZD", "EUR/USD",
    "GBP/AUD", "GBP/CAD", "GBP/CHF", "GBP/JPY", "GBP/NZD", "GBP/USD",
    "NZD/CAD", "NZD/CHF", "NZD/JPY", "NZD/USD",
    "USD/CAD", "USD/CHF", "USD/JPY", "USD/MXN", "USD/SEK", "USD/ZAR",
  ],
  Stocks: ["AAPL", "TSLA", "NVDA", "AMZN", "MSFT", "META", "GOOGL"],
  ETFs:   ["SPY", "QQQ", "GLD", "TLT", "VXX", "IWM", "XLF"],
  Crypto: ["BTC/USD", "ETH/USD", "SOL/USD", "XRP/USD", "BNB/USD", "DOGE/USD"],
};

const DEFAULT_CATEGORY: Category = "Forex";
const DEFAULT_PAIR = "EUR/USD";

const ALL_ASSETS: { pair: string; category: Category }[] =
  (Object.keys(CATEGORIES) as Category[]).flatMap((c) =>
    CATEGORIES[c].map((p) => ({ pair: p, category: c })),
  );

const normalize = (s: string) => s.replace(/[\s/]/g, "").toLowerCase();

const categoryOf = (p: string): Category =>
  (Object.keys(CATEGORIES) as Category[]).find((c) => CATEGORIES[c].includes(p)) ?? DEFAULT_CATEGORY;

interface PairSelectorProps {
  value?: string;
  onPairChange?: (pair: string, category: Category) => void;
}

export function PairSelector({ value, onPairChange }: PairSelectorProps) {
  const [open,     setOpen]     = useState(false);
  const [category, setCategory] = useState<Category>(DEFAULT_CATEGORY);
  const [pair,     setPair]     = useState(DEFAULT_PAIR);

  // The label/selection always reflects the asset the parent is showing.
  const displayedPair = value ?? pair;

  const [query,      setQuery]      = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  const results = query.trim()
    ? ALL_ASSETS.filter((a) => normalize(a.pair).includes(normalize(query))).slice(0, 40)
    : [];

  // Close the search results when clicking outside the search box
  useEffect(() => {
    if (!searchOpen) return;
    const onDown = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setSearchOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [searchOpen]);

  // Keep the browsed category tab in sync with the selected asset
  useEffect(() => {
    if (value) setCategory(categoryOf(value));
  }, [value]);

  function selectPair(p: string) {
    setPair(p);
    onPairChange?.(p, category);
  }

  function selectCategory(c: Category) {
    setCategory(c);
  }

  function selectFromSearch(p: string, c: Category) {
    setCategory(c);
    setPair(p);
    onPairChange?.(p, c);
    setQuery("");
    setSearchOpen(false);
  }

  return (
    <div className="relative h-full w-full flex items-center gap-3" style={{ zIndex: (open || searchOpen) ? 20 : "auto" }}>

      {/* ── Asset search ───────────────────────────────────────── */}
      <div ref={searchRef} className="relative h-full shrink-0" style={{ width: "220px" }}>
        <div
          className="h-full flex items-center gap-2 rounded-[14px] px-3"
          style={{ background: "var(--bg-panel)", border: "1px solid var(--border-subtle)" }}
        >
          <Search size={14} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
          <input
            value={query}
            onChange={(e) => { setQuery(e.target.value); setSearchOpen(true); }}
            onFocus={() => setSearchOpen(true)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && results.length > 0) selectFromSearch(results[0].pair, results[0].category);
              else if (e.key === "Escape") { setQuery(""); setSearchOpen(false); }
            }}
            placeholder="Search asset…"
            className="w-full bg-transparent outline-none text-[12px] font-medium"
            style={{ color: "var(--text-primary)" }}
          />
          {query && (
            <button onClick={() => { setQuery(""); setSearchOpen(false); }} className="shrink-0" style={{ lineHeight: 0 }}>
              <X size={13} style={{ color: "var(--text-muted)" }} />
            </button>
          )}
        </div>

        {/* Results dropdown */}
        {searchOpen && query.trim() !== "" && (
          <div
            className="absolute left-0 top-full mt-1 rounded-[12px] overflow-hidden"
            style={{
              minWidth:   "100%",
              maxHeight:  "320px",
              overflowY:  "auto",
              background: "var(--bg-panel)",
              border:     "1px solid var(--border-medium)",
              boxShadow:  "0 12px 32px rgba(0,0,0,0.45)",
              zIndex:     30,
            }}
          >
            {results.length === 0 ? (
              <div className="px-3 py-2 text-[11px]" style={{ color: "var(--text-muted)" }}>No matches</div>
            ) : (
              results.map(({ pair: p, category: c }) => {
                const active = p === displayedPair;
                return (
                  <button
                    key={`${c}-${p}`}
                    onClick={() => selectFromSearch(p, c)}
                    className="w-full flex items-center justify-between px-3 py-2 text-left transition-all"
                    style={{
                      background: active ? "var(--accent-dim)"  : "transparent",
                      color:      active ? "var(--accent-text)" : "var(--text-secondary)",
                    }}
                    onMouseEnter={(e) => { if (!active) (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.04)"; }}
                    onMouseLeave={(e) => { if (!active) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                  >
                    <span className="text-[12px] font-semibold">{p}</span>
                    <span className="text-[9px] uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>{c}</span>
                  </button>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* ── Inline expanding container (asset selector) ─────────── */}
      <div className="relative h-full flex-1 min-w-0" style={{ zIndex: open ? 20 : "auto" }}>
      <div
        className="h-full flex items-center rounded-[14px] overflow-hidden"
        style={{
          background:  "var(--bg-panel)",
          border:      "1px solid var(--border-subtle)",
          position:    "relative",
          zIndex:      1,
          width:       open ? "100%" : "fit-content",
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
              {displayedPair}
            </span>
            <span className="text-[9px] uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
              {categoryOf(displayedPair)}
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
          className="flex items-center overflow-hidden min-w-0 flex-1"
          style={{
            maxWidth:   open ? "100%" : "0px",
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

          {/* Pair chips — horizontal, fill remaining width, scroll if overflow (app-styled scrollbar) */}
          <div
            className="flex items-center gap-1 px-2.5 min-w-0 flex-1"
            style={{ overflowX: "auto", overflowY: "hidden" }}
          >
            {CATEGORIES[category].map((p) => {
              const active = p === displayedPair;
              return (
                <button
                  key={p}
                  onClick={() => selectPair(p)}
                  className="px-2.5 py-1 rounded-[8px] text-[11px] font-semibold whitespace-nowrap transition-all shrink-0"
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
    </div>
  );
}
