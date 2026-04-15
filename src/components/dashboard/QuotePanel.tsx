import { useEffect, useState } from "react";
import { Quote as QuoteIcon, RefreshCw } from "lucide-react";
import { Panel } from "../ui/Panel";

interface QuoteItem {
  text: string;
  author: string;
}

interface Props {
  quotes: QuoteItem[];
}

export function QuotePanel({ quotes }: Props) {
  const [idx, setIdx] = useState(0);
  const [visible, setVisible] = useState(true);

  const advance = () => {
    if (!quotes.length) return;
    setVisible(false);
    setTimeout(() => {
      setIdx((i) => (i + 1) % quotes.length);
      setVisible(true);
    }, 250);
  };

  // Rotate every 45 seconds
  useEffect(() => {
    const id = setInterval(advance, 45_000);
    return () => clearInterval(id);
  }, [quotes.length]);

  const quote = quotes[idx] ?? { text: "Loading...", author: "" };

  return (
    <Panel state className="h-full flex flex-col justify-between">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <QuoteIcon size={14} style={{ color: "var(--accent)" }} />
          <span className="text-[15px] font-semibold uppercase tracking-widest" style={{ color: "var(--accent-text)" }}>
            Psychology
          </span>
        </div>
        <button
          onClick={advance}
          className="p-1.5 rounded-lg transition-colors"
          style={{ color: "var(--text-muted)" }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text-secondary)")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-muted)")}
          title="Next quote"
        >
          <RefreshCw size={12} />
        </button>
      </div>

      <div
        className="flex-1 flex flex-col justify-center"
        style={{
          opacity: visible ? 1 : 0,
          transition: "opacity 0.25s ease",
        }}
      >
        <p
          className="text-[14px] leading-relaxed font-medium"
          style={{ color: "var(--text-primary)" }}
        >
          "{quote.text}"
        </p>
        <p
          className="text-[12px] mt-3"
          style={{ color: "var(--text-secondary)" }}
        >
          — {quote.author}
        </p>
      </div>

      {/* Dot indicators */}
      <div className="flex gap-1 mt-4">
        {quotes.map((_, i) => (
          <button
            key={i}
            onClick={() => { setVisible(false); setTimeout(() => { setIdx(i); setVisible(true); }, 250); }}
            className="rounded-full transition-all"
            style={{
              width: i === idx ? 16 : 5,
              height: 5,
              background: i === idx ? "var(--accent)" : "var(--border-medium)",
            }}
          />
        ))}
      </div>
    </Panel>
  );
}
