// ─── PsychologyStrip — ever-present quote banner, glows with panel system ────
import { useEffect, useState } from "react";
import { Quote as QuoteIcon, ChevronLeft, ChevronRight } from "lucide-react";

interface QuoteItem { text: string; author: string; }
interface Props { quotes: QuoteItem[]; }

export function PsychologyStrip({ quotes }: Props) {
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

  if (count === 0) return null;
  const q = quotes[idx];

  return (
    /* Use panel class so it gets the same border + glow treatment as every other panel */
    <div
      className="panel flex items-center gap-0"
      style={{ minHeight: 48, padding: "0 16px" }}
    >
      {/* Label */}
      <div className="flex items-center gap-2 shrink-0 pr-4" style={{ borderRight: "1px solid var(--border-subtle)" }}>
        <QuoteIcon size={12} style={{ color: "var(--accent)" }} />
        <span
          className="text-[14px] font-semibold uppercase tracking-widest"
          style={{ color: "var(--accent-text)" }}
        >
          Psychology
        </span>
      </div>

      {/* Quote — centered in remaining space */}
      <div
        className="flex-1 flex items-center justify-center px-4"
        style={{ opacity: visible ? 1 : 0, transition: "opacity 0.2s ease" }}
      >
        <p className="text-[12px] leading-snug text-center" style={{ color: "var(--text-primary)" }}>
          <span style={{ color: "var(--text-secondary)" }}>"</span>
          {q.text}
          <span style={{ color: "var(--text-secondary)" }}>"</span>
          <span className="ml-2 text-[11px]" style={{ color: "var(--text-secondary)" }}>
            — {q.author}
          </span>
        </p>
      </div>

      {/* Nav */}
      {count > 1 && (
        <div className="flex items-center gap-1.5 shrink-0 pl-4" style={{ borderLeft: "1px solid var(--border-subtle)" }}>
          <button
            onClick={() => go(idx - 1)}
            className="w-5 h-5 rounded flex items-center justify-center transition-colors"
            style={{ color: "var(--text-muted)" }}
            onMouseEnter={(e) => (e.currentTarget as HTMLElement).style.color = "var(--text-secondary)"}
            onMouseLeave={(e) => (e.currentTarget as HTMLElement).style.color = "var(--text-muted)"}
          >
            <ChevronLeft size={12} />
          </button>
          <span className="text-[10px] tabular-nums" style={{ color: "var(--text-muted)" }}>
            {idx + 1}/{count}
          </span>
          <button
            onClick={() => go(idx + 1)}
            className="w-5 h-5 rounded flex items-center justify-center transition-colors"
            style={{ color: "var(--text-muted)" }}
            onMouseEnter={(e) => (e.currentTarget as HTMLElement).style.color = "var(--text-secondary)"}
            onMouseLeave={(e) => (e.currentTarget as HTMLElement).style.color = "var(--text-muted)"}
          >
            <ChevronRight size={12} />
          </button>
        </div>
      )}
    </div>
  );
}
