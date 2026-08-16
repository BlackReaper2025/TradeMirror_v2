import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ArrowUp, ArrowDown } from "lucide-react";
import { ALL_ASSETS } from "./PairSelector";
import { decimalsForPair, formatPrice } from "../../lib/priceFormat";

interface RawCandleTf {
  date: string;
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface Quote {
  price: number;
  changePct: number;
}

// Module-level and never torn down, so it keeps updating live in the
// background regardless of whether the ticker is currently mounted (the
// pair selector may be expanded, hiding it) — collapsing back to it should
// show current data immediately, not an empty ticker re-warming from
// scratch. One instrument at a time, on a gentle cadence — fetching all
// ~50 in a burst is exactly the concurrent-request pile-up that stalled
// pair switching before (see oanda_client.rs shared-client fix).
const quoteCache = new Map<string, Quote>();
let warmIndex = 0;
let warmStarted = false;
const WARM_INTERVAL_MS = 1_500;

function startWarmLoop() {
  if (warmStarted) return;
  warmStarted = true;
  const tick = () => {
    const pair = ALL_ASSETS[warmIndex % ALL_ASSETS.length].pair;
    warmIndex++;
    invoke<RawCandleTf[]>("get_live_candles", { pair, tf: "1D" })
      .then(candles => {
        const last = candles[candles.length - 1];
        if (last && last.open) {
          quoteCache.set(pair, { price: last.close, changePct: (last.close - last.open) / last.open * 100 });
        }
      })
      .catch(() => {});
  };
  tick();
  setInterval(tick, WARM_INTERVAL_MS);
}

function availablePairs(): string[] {
  return ALL_ASSETS.filter(a => quoteCache.has(a.pair)).map(a => a.pair);
}

const BADGE_UNIT = 210; // px per slot (badge + gap) — also used to size the visible window
const MAX_VISIBLE = 5;
const STEP_MS = 5_000;       // how often a new instrument enters
const SLIDE_MS = 700;        // how long the row takes to settle into its new positions

interface Item { key: number; pair: string; pos: number; }

// Sits in the space next to the collapsed instrument selector (see
// PairSelector's collapsedContent prop): a new instrument enters on the
// left every few seconds, the whole row slides right by one slot to make
// room, and whatever falls off the right edge is dropped — a conveyor
// belt, not independently-cycling slots. Sized to whatever room is
// actually available — never a scrollbar, never more than MAX_VISIBLE at once.
export function InstrumentTicker({ onSelect }: { onSelect?: (pair: string) => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [visibleCount, setVisibleCount] = useState(1);
  const [slotWidth, setSlotWidth] = useState(BADGE_UNIT);
  const [items, setItems] = useState<Item[]>([]);
  const [, forceRefresh] = useState(0);
  const cursorRef      = useRef(0);   // next position to hand out from availablePairs()
  const nextKeyRef      = useRef(0);
  const visibleCountRef = useRef(visibleCount);
  const enteringKeyRef  = useRef<number | null>(null);

  useEffect(() => { visibleCountRef.current = visibleCount; }, [visibleCount]);

  useEffect(() => { startWarmLoop(); }, []);

  // visibleCount is how many BADGE_UNIT-wide items fit at minimum; slotWidth
  // then stretches those slots to fill the full measured width evenly, so
  // the ticker's right edge lands exactly at the clock instead of leaving
  // unused space (the clip boundary stays deterministic either way — see
  // the render below).
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => {
      const count = Math.max(1, Math.min(MAX_VISIBLE, Math.floor(el.clientWidth / BADGE_UNIT)));
      setVisibleCount(count);
      setSlotWidth(el.clientWidth / count);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const pickNext = (): string | null => {
    const pairs = availablePairs();
    if (pairs.length === 0) return null;
    const pick = pairs[cursorRef.current % pairs.length];
    cursorRef.current++;
    return pick;
  };

  // Every tick: drop whatever fully slid out last cycle, shift the rest one
  // slot right, and insert the new instrument off-screen at pos -1 (no
  // transition yet — it has no prior position to animate from).
  useEffect(() => {
    const id = setInterval(() => {
      const p = pickNext();
      if (!p) return;
      const key = nextKeyRef.current++;
      enteringKeyRef.current = key;
      setItems(prev => {
        const kept = prev.filter(it => it.pos < visibleCountRef.current);
        const shifted = kept.map(it => ({ ...it, pos: it.pos + 1 }));
        return [{ key, pair: p, pos: -1 }, ...shifted];
      });
    }, STEP_MS);
    return () => clearInterval(id);
  }, []);

  // One frame after the newcomer mounts at pos -1, move it to pos 0 — this
  // is what makes it slide in (the shifted siblings animate in the same
  // paint since their pos already changed in the update above).
  useEffect(() => {
    const key = enteringKeyRef.current;
    if (key === null) return;
    enteringKeyRef.current = null;
    const raf = requestAnimationFrame(() => {
      setItems(prev => prev.map(it => (it.key === key ? { ...it, pos: 0 } : it)));
    });
    return () => cancelAnimationFrame(raf);
  }, [items]);

  // Top up instantly (no slide) when more room becomes available — a resize
  // or the initial reveal as instruments finish warming up.
  useEffect(() => {
    if (items.length >= visibleCount) return;
    const p = pickNext();
    if (!p) return;
    setItems(prev => [...prev, { key: nextKeyRef.current++, pair: p, pos: prev.length }]);
  }, [visibleCount, items]);

  // Re-render periodically (no shifting) so a still-visible badge's price/%
  // ticks over as the background warm loop refreshes its underlying quote.
  useEffect(() => {
    const id = setInterval(() => forceRefresh(t => t + 1), WARM_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  return (
    <div ref={containerRef} style={{ flex: 1, minWidth: 0, height: "100%" }}>
      {/* Exact width (visibleCount * slotWidth === measured width, not
          flex-filled) so the clip boundary is deterministic — with
          flex-filled slack past the last slot, an exiting badge slides into
          that slack, stays fully visible, and only vanishes when removed
          from state — an instant pop instead of a slide-off. slotWidth
          itself stretches to fill the full measured width so the ticker's
          right edge lands at the clock instead of leaving it unused. */}
      <div style={{ width: visibleCount * slotWidth, height: "100%", overflow: "hidden", position: "relative" }}>
        {items.map(({ key, pair, pos }) => {
          const q = quoteCache.get(pair);
          if (!q) return null;
          const up = q.changePct >= 0;
          const color = up ? "#60a5fa" : "#a78bfa";
          return (
            <div
              key={key}
              onClick={() => onSelect?.(pair)}
              title={`View ${pair}`}
              style={{
                position: "absolute", left: 0, top: "50%", width: slotWidth,
                transform: `translate(${pos * slotWidth}px, -50%)`,
                transition: `transform ${SLIDE_MS}ms ease`,
                display: "flex", alignItems: "center", justifyContent: "center", gap: 6, whiteSpace: "nowrap", lineHeight: 1,
                cursor: onSelect ? "pointer" : undefined,
              }}
            >
              <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-secondary)" }}>{pair}</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)" }}>
                {formatPrice(q.price, decimalsForPair(pair, q.price))}
              </span>
              {up ? <ArrowUp size={13} color={color} /> : <ArrowDown size={13} color={color} />}
              <span style={{ fontSize: 12, fontWeight: 700, color }}>
                {up ? "+" : ""}{q.changePct.toFixed(2)}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
