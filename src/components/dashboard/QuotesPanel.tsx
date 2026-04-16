// ─── QuotesPanel — slim horizontal quote strip ──────────────────────────────
import React, { useEffect, useState } from "react";
import { Quote as QuoteIcon, ChevronLeft, ChevronRight } from "lucide-react";
import { Panel } from "../ui/Panel";

interface QuoteItem { text: string; author: string; }
interface Props { quotes: QuoteItem[]; }

export function QuotesPanel({ quotes }: Props) {
  const [idx,     setIdx]     = useState(0);
  const [visible, setVisible] = useState(true);
  const count = quotes.length;

  const go = (next: number) => {
    setVisible(false);
    setTimeout(() => { setIdx(((next % count) + count) % count); setVisible(true); }, 200);
  };

  useEffect(() => {
    if (count === 0) return;
    const id = setInterval(() => go(idx + 1), 45_000);
    return () => clearInterval(id);
  }, [idx, count]);

  if (count === 0) return (
    <div style={{ position: "relative", height: "100%" }}>
      <div style={{ position: "absolute", inset: 0, borderRadius: "14px", padding: "1.5px", pointerEvents: "none", zIndex: 1, background: "rgba(255,255,255,0.12)", WebkitMask: "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)", WebkitMaskComposite: "xor", maskComposite: "exclude" } as React.CSSProperties} />
      <Panel state className="h-full flex items-center px-4" style={{ border: "none", borderRadius: "14px", background: "radial-gradient(ellipse at top left, rgba(255,255,255,0.07) 0%, transparent 60%), rgba(8,12,18,0.55)", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)", boxShadow: "none" } as React.CSSProperties}>
        <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>No quotes loaded</span>
      </Panel>
    </div>
  );

  const q = quotes[idx];

  return (
    <div style={{ position: "relative", height: "100%" }}>
      <div style={{ position: "absolute", inset: 0, borderRadius: "14px", padding: "1.5px", pointerEvents: "none", zIndex: 1, background: "rgba(255,255,255,0.12)", WebkitMask: "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)", WebkitMaskComposite: "xor", maskComposite: "exclude" } as React.CSSProperties} />
    {/* Single horizontal strip — no horizontal divider lines, only vertical separators */}
    <Panel state className="h-full flex items-stretch gap-0 p-0 overflow-hidden" style={{ border: "none", borderRadius: "14px", background: "radial-gradient(ellipse at top left, rgba(255,255,255,0.07) 0%, transparent 60%), rgba(8,12,18,0.55)", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)", boxShadow: "none" } as React.CSSProperties}>

      {/* ── Label ── */}
      <div
        className="flex items-center gap-2 px-4 shrink-0"
        style={{ borderRight: "1px solid var(--border-subtle)" }}
      >
        <QuoteIcon size={11} style={{ color: "var(--text-secondary)" }} />
        <span
          className="text-[14px] font-semibold uppercase tracking-widest whitespace-nowrap"
          style={{ color: "var(--text-secondary)" }}
        >
          Psychology
        </span>
      </div>

      {/* ── Quote text ── */}
      <div
        className="flex-1 flex flex-col justify-center px-4 min-w-0"
        style={{ opacity: visible ? 1 : 0, transition: "opacity 0.2s ease" }}
      >
        <p
          className="text-[14px] leading-snug"
          style={{
            color: "var(--text-primary)",
            overflow: "hidden",
            display: "-webkit-box",
            WebkitLineClamp: 4,
            WebkitBoxOrient: "vertical",
          }}
        >
          {q.text}
        </p>
        {q.author && (
          <p className="text-[11px] font-bold mt-0.5" style={{ color: "var(--text-muted)" }}>
            — {q.author}
          </p>
        )}
      </div>

      {/* ── Controls ── */}
      {count > 1 && (
        <div
          className="flex items-center gap-1 px-3 shrink-0"
          style={{ borderLeft: "1px solid var(--border-subtle)" }}
        >
          <button
            onClick={() => go(idx - 1)}
            className="w-5 h-5 rounded flex items-center justify-center transition-colors"
            style={{ color: "var(--text-muted)" }}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = "var(--text-secondary)"}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = "var(--text-muted)"}
          >
            <ChevronLeft size={11} />
          </button>
          <span className="text-[9px] tabular-nums" style={{ color: "var(--text-muted)" }}>
            {idx + 1}/{count}
          </span>
          <button
            onClick={() => go(idx + 1)}
            className="w-5 h-5 rounded flex items-center justify-center transition-colors"
            style={{ color: "var(--text-muted)" }}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = "var(--text-secondary)"}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = "var(--text-muted)"}
          >
            <ChevronRight size={11} />
          </button>
        </div>
      )}

    </Panel>
    </div>
  );
}
