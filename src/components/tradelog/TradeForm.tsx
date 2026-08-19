// ─── TradeForm — slide-over drawer for new trade entry or edit ────────────────
import { useState, useEffect, useRef, useCallback } from "react"; // useRef used in TimeInput hold logic
import { X, ChevronRight, TrendingUp, TrendingDown, BookOpen, ChevronUp, ChevronDown, Maximize2, ImagePlus } from "lucide-react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { FormField, inputClass, inputStyle } from "../ui/FormField";
import { getImagesByTradeId } from "../../db/queries";
import type { Account, TradeWithJournal } from "../../db/queries";
import { ftmoTimeToLocal } from "../../lib/ftmoTime";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TradeImageDraft {
  id:          string;
  kind:        "entry" | "exit" | "additional";
  path:        string;
  description: string;
}

export interface TradeFormValues {
  // Trade
  openedAt:      string;
  closedAt:      string;
  instrument:    string;
  side:          "long" | "short";
  setupName:     string;
  entryPrice:    string;
  stopPrice:     string;
  targetPrice:   string;
  exitPrice:     string;
  size:          string;
  fees:          string;
  pnl:           string;
  technicalNotes: string;
  tags:          string;
  tradeRef:      string;
  slPips:        string;
  tpPips:        string;
  maePips:       string;
  mae:           string;
  maeTime:       string;
  mfePips:       string;
  mfe:           string;
  mfeTime:       string;
  images:        TradeImageDraft[];
  // Journal
  emotionBefore:    string;
  emotionAfter:     string;
  mistakes:         string;
  lessons:          string;
  confidenceScore:  string;
  disciplineScore:  string;
  freeformNotes:    string;
}

const EMOTION_OPTIONS = [
  "", "Calm", "Confident", "Focused", "Neutral",
  "Anxious", "FOMO", "Revenge", "Overconfident", "Hesitant", "Greedy",
  "Disappointment in myself",
];

const SETUP_SUGGESTIONS = [
  "Supply Zone", "Demand Zone", "Liquidity Sweep", "Wyckoff",
  "Break & Retest", "8am Box", "No Setup",
];

const MAJOR_PAIRS = [
  "AUD/CAD", "AUD/CHF", "AUD/JPY", "AUD/NZD", "AUD/USD",
  "CAD/CHF", "CAD/JPY", "CHF/JPY",
  "EUR/AUD", "EUR/CAD", "EUR/CHF", "EUR/GBP", "EUR/JPY", "EUR/NZD", "EUR/USD",
  "GBP/AUD", "GBP/CAD", "GBP/CHF", "GBP/JPY", "GBP/NZD", "GBP/USD",
  "NZD/CAD", "NZD/CHF", "NZD/JPY", "NZD/USD",
  "BTC/USD",
  "US100", "US30", "US500", "USOIL",
  "USD/CAD", "USD/CHF", "USD/JPY", "USD/MXN", "USD/SEK", "USD/ZAR",
  "XAG/USD", "XAU/USD",
];

const TAG_GROUPS = [
  { label: "Session",    tags: ["asia", "london", "new-york"] },
  { label: "Setup",      tags: ["supply", "demand", "liquidity-sweep", "wyckoff", "break-retest"] },
  { label: "Action",     tags: ["prediction", "reaction"] },
  { label: "Candle Type", tags: ["engulfing", "pin", "doji", "hammer", "shooting-star", "inside-bar", "outside-bar", "morning-star", "evening-star", "spinning-top"] },
  { label: "Chart Patterns", tags: ["head-shoulders", "pennant", "flag", "wedge", "triangle", "double-top", "double-bottom", "knife", "channel", "cup-handle"] },
  { label: "Type",       tags: ["scalp", "day", "swing", "reversal", "continuation"] },
  { label: "Psychology", tags: ["patience", "impatience", "fomo", "revenge", "greedy", "scared", "no-setup", "bad-entry", "exit-early", "early-entry"] },
];

// Column layout for the Tags panel — groups sharing a column stack vertically.
const TAG_COLUMNS = [
  ["Session", "Type"],
  ["Setup", "Action"],
  ["Candle Type"],
  ["Chart Patterns"],
  ["Psychology"],
];

function todayLocal() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function nowTimeLocal() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function makeEmpty(_defaultDate?: string): TradeFormValues {
  return {
    openedAt: "",
    closedAt: "",
    instrument: "",
    side: "long",
    setupName: "",
    entryPrice: "",
    stopPrice: "",
    targetPrice: "",
    exitPrice: "",
    size: "",
    fees: "",
    pnl: "",
    technicalNotes: "",
    tags: "",
    tradeRef: "",
    slPips: "",
    tpPips: "",
    maePips: "",
    mae: "",
    maeTime: "",
    mfePips: "",
    mfe: "",
    mfeTime: "",
    images: [],
    emotionBefore: "",
    emotionAfter: "",
    mistakes: "",
    lessons: "",
    confidenceScore: "",
    disciplineScore: "",
    freeformNotes: "",
  };
}

// Convert an existing trade (with optional journal) into form values for editing.
function tradeToFormValues(t: TradeWithJournal): TradeFormValues {
  const norm = (v: string | null | undefined) => v ?? "";
  // datetime-local inputs need "YYYY-MM-DDTHH:MM" — trim seconds/Z if present
  const dt   = (v: string | null | undefined) =>
    v ? v.replace("Z", "").slice(0, 16) : "";
  return {
    openedAt:        dt(t.openedAt),
    closedAt:        dt(t.closedAt),
    instrument:      t.instrument,
    side:            t.side,
    setupName:       norm(t.setupName),
    entryPrice:      t.entryPrice  != null ? String(t.entryPrice)  : "",
    stopPrice:       t.stopPrice   != null ? String(t.stopPrice)   : "",
    targetPrice:     t.targetPrice != null ? String(t.targetPrice) : "",
    exitPrice:       t.exitPrice   != null ? String(t.exitPrice)   : "",
    size:            t.size        != null ? parseFloat(String(t.size)).toFixed(2)        : "",
    fees:            t.fees        != null ? parseFloat(String(t.fees)).toFixed(2)        : "",
    pnl:             t.pnl         != null ? parseFloat(String(t.pnl)).toFixed(2)         : "",
    technicalNotes:  norm(t.technicalNotes),
    tags:            norm(t.tags),
    tradeRef:        norm(t.tradeRef),
    slPips:          t.slPips != null ? String(t.slPips) : "",
    tpPips:          t.tpPips != null ? String(t.tpPips) : "",
    maePips:         t.maePips != null ? String(t.maePips) : "",
    mae:             t.mae     != null ? String(t.mae)     : "",
    maeTime:         dt(t.maeTime),
    mfePips:         t.mfePips != null ? String(t.mfePips) : "",
    mfe:             t.mfe     != null ? String(t.mfe)     : "",
    mfeTime:         dt(t.mfeTime),
    images:          [], // loaded async by the Screenshots tab (see loadTradeImages effect)
    emotionBefore:   norm(t.journal?.emotionBefore),
    emotionAfter:    norm(t.journal?.emotionAfter),
    mistakes:        norm(t.journal?.mistakes),
    lessons:         norm(t.journal?.lessons),
    confidenceScore: t.journal?.confidenceScore != null ? String(t.journal.confidenceScore) : "",
    disciplineScore: t.journal?.disciplineScore != null ? String(t.journal.disciplineScore) : "",
    freeformNotes:   norm(t.journal?.freeformNotes),
  };
}

// ─── Derived R:R display ──────────────────────────────────────────────────────

function deriveRR(v: TradeFormValues): string {
  const e  = parseFloat(v.entryPrice);
  const s  = parseFloat(v.stopPrice);
  const tp = parseFloat(v.targetPrice);
  if (isNaN(e) || isNaN(s) || isNaN(tp)) return "—";
  const risk   = v.side === "long" ? e - s : s - e;
  const reward = v.side === "long" ? tp - e : e - tp;
  if (risk <= 0) return "—";
  return `${(reward / risk).toFixed(2)}R`;
}

// ─── Custom time picker with nudge buttons ────────────────────────────────────

function TimeInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const pad = (n: number) => String(n).padStart(2, "0");
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef  = useRef<ReturnType<typeof setTimeout>  | null>(null);

  // Because onChange doesn't accept a setter fn, we use a ref for the current value
  const valueRef = useRef(value);
  valueRef.current = value;

  const nudgeDirect = useCallback((dm: number) => {
    const [ph, pm] = valueRef.current.split(":").map(n => parseInt(n) || 0);
    let total = ph * 60 + pm + dm;
    total = ((total % 1440) + 1440) % 1440;
    onChange(`${pad(Math.floor(total / 60))}:${pad(total % 60)}`);
  }, [onChange]);

  const startHold = useCallback((dm: number) => {
    nudgeDirect(dm);
    timeoutRef.current = setTimeout(() => {
      intervalRef.current = setInterval(() => nudgeDirect(dm), 80);
    }, 400);
  }, [nudgeDirect]);

  const stopHold = useCallback(() => {
    if (timeoutRef.current)  clearTimeout(timeoutRef.current);
    if (intervalRef.current) clearInterval(intervalRef.current);
  }, []);

  useEffect(() => stopHold, [stopHold]);

  const nudgeBtn: React.CSSProperties = {
    display: "flex", alignItems: "center", justifyContent: "center",
    width: 16, height: 16, borderRadius: 3, cursor: "pointer", flexShrink: 0,
    background: "rgba(255,255,255,0.10)", border: "1px solid rgba(255,255,255,0.16)",
    color: "var(--text-secondary)", userSelect: "none",
  };

  return (
    <div
      className="flex items-center gap-1.5 px-2 rounded-lg"
      style={{ ...inputStyle, flex: "0 0 auto", height: 38 }}
    >
      {/* Time display */}
      <input
        type="time"
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{ background: "transparent", border: "none", outline: "none", color: "var(--text-primary)", fontSize: 13, width: 90, flexShrink: 0 }}
      />
      {/* Minute nudge with hold-to-repeat */}
      <div className="flex flex-col gap-0.5">
        <button
          type="button" style={nudgeBtn}
          onMouseDown={() => startHold(1)}
          onMouseUp={stopHold} onMouseLeave={stopHold}
        >
          <ChevronUp size={9} />
        </button>
        <button
          type="button" style={nudgeBtn}
          onMouseDown={() => startHold(-1)}
          onMouseUp={stopHold} onMouseLeave={stopHold}
        >
          <ChevronDown size={9} />
        </button>
      </div>
    </div>
  );
}

// ─── Split date + time input ──────────────────────────────────────────────────

function DateTimeInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const parts    = value ? value.split("T") : [todayLocal(), nowTimeLocal()];
  const datePart = parts[0] || todayLocal();
  const timePart = (parts[1] || nowTimeLocal()).slice(0, 5);

  return (
    <div className="flex gap-2">
      <input
        type="date"
        value={datePart}
        onChange={e => onChange(`${e.target.value}T${timePart}`)}
        className={inputClass}
        style={{ ...inputStyle, flex: "0 0 auto", width: 116 }}
      />
      <TimeInput value={timePart} onChange={t => onChange(`${datePart}T${t}`)} />
    </div>
  );
}

// ─── Styled input helpers ─────────────────────────────────────────────────────

function Input({
  value,
  onChange,
  type = "text",
  placeholder,
  step,
  cents,
  style,
}: {
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  step?: string;
  cents?: boolean;
  style?: React.CSSProperties;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <input
      type={type}
      value={value}
      placeholder={placeholder}
      step={step}
      onChange={(e) => onChange(e.target.value)}
      onFocus={() => setFocused(true)}
      onBlur={() => {
        setFocused(false);
        if (cents && value !== "") {
          const n = parseFloat(value);
          if (!isNaN(n)) onChange(n.toFixed(2));
        }
      }}
      className={inputClass}
      style={{
        ...inputStyle,
        ...style,
        ...(focused
          ? { border: "1px solid var(--accent-border)", boxShadow: "0 0 0 2px var(--accent-glow)" }
          : {}),
      }}
    />
  );
}

function Textarea({
  value,
  onChange,
  placeholder,
  rows = 3,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <textarea
      value={value}
      placeholder={placeholder}
      rows={rows}
      onChange={(e) => onChange(e.target.value)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      className={`${inputClass} resize-none`}
      style={{
        ...inputStyle,
        ...(focused
          ? { border: "1px solid var(--accent-border)", boxShadow: "0 0 0 2px var(--accent-glow)" }
          : {}),
      }}
    />
  );
}

function SelectInput({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder?: string;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      className={inputClass}
      style={{
        ...inputStyle,
        ...(focused
          ? { border: "1px solid var(--accent-border)", boxShadow: "0 0 0 2px var(--accent-glow)" }
          : {}),
      }}
    >
      {placeholder && <option value="">{placeholder}</option>}
      {options.filter(Boolean).map((o) => (
        <option key={o} value={o} style={{ background: "var(--bg-panel)" }}>{o}</option>
      ))}
    </select>
  );
}

// ─── Screenshots tab building blocks ───────────────────────────────────────────

function asAssetSrc(path: string): string {
  return convertFileSrc(path.replace(/\\/g, "/"));
}

function UploadSlot({ label, busy, onClick }: { label: string; busy: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className="flex flex-col items-center justify-center gap-1.5 rounded-lg w-full transition-opacity hover:opacity-80 disabled:opacity-50"
      style={{ height: 140, border: "1px dashed var(--border-medium)", color: "var(--text-muted)", background: "var(--bg-panel-alt)" }}
    >
      <ImagePlus size={18} />
      <span className="text-[11px] font-medium">{busy ? "Uploading…" : label}</span>
    </button>
  );
}

function ImageCard({
  image,
  onDescriptionChange,
  onRemove,
  onExpand,
}: {
  image: TradeImageDraft;
  onDescriptionChange: (v: string) => void;
  onRemove: () => void;
  onExpand: () => void;
}) {
  return (
    <div className="rounded-lg overflow-hidden" style={{ border: "1px solid var(--border-medium)" }}>
      <div className="relative" style={{ height: 140 }}>
        <img
          src={asAssetSrc(image.path)}
          alt={image.description || image.kind}
          className="w-full h-full object-cover"
        />
        <button
          type="button"
          onClick={onExpand}
          className="absolute bottom-1 right-1 w-6 h-6 rounded flex items-center justify-center"
          style={{ background: "rgba(0,0,0,0.6)", color: "#fff" }}
          title="View full screen"
        >
          <Maximize2 size={12} />
        </button>
        <button
          type="button"
          onClick={onRemove}
          className="absolute top-1 right-1 w-5 h-5 rounded flex items-center justify-center text-[11px] font-bold"
          style={{ background: "rgba(0,0,0,0.6)", color: "#fff" }}
          title="Remove image"
        >
          ×
        </button>
      </div>
      <input
        value={image.description}
        onChange={(e) => onDescriptionChange(e.target.value)}
        placeholder="Description…"
        className={inputClass}
        style={{ ...inputStyle, borderRadius: 0, border: "none", borderTop: "1px solid var(--border-subtle)" }}
      />
    </div>
  );
}

function ScreenshotsTab({
  images,
  setImages,
  onExpand,
}: {
  images: TradeImageDraft[];
  setImages: (imgs: TradeImageDraft[]) => void;
  onExpand: (path: string) => void;
}) {
  const [busyKind, setBusyKind] = useState<TradeImageDraft["kind"] | null>(null);

  async function upload(kind: TradeImageDraft["kind"]) {
    try {
      const selected = await openDialog({
        multiple: false,
        filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "gif", "webp", "bmp"] }],
      });
      if (typeof selected !== "string" || !selected) return;
      setBusyKind(kind);
      const savedPath = await invoke<string>("save_trade_screenshot", { sourcePath: selected, kind });
      const draft: TradeImageDraft = {
        id: `img-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        kind, path: savedPath, description: "",
      };
      setImages(
        kind === "additional"
          ? [...images, draft]
          : [...images.filter((i) => i.kind !== kind), draft]
      );
    } catch (err) {
      console.error("[ScreenshotsTab] upload failed:", err);
    } finally {
      setBusyKind(null);
    }
  }

  function updateDescription(id: string, description: string) {
    setImages(images.map((i) => (i.id === id ? { ...i, description } : i)));
  }

  function remove(id: string) {
    setImages(images.filter((i) => i.id !== id));
  }

  const entry      = images.find((i) => i.kind === "entry");
  const exit       = images.find((i) => i.kind === "exit");
  const additional = images.filter((i) => i.kind === "additional");

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        <FormField label="Entry Screenshot">
          {entry ? (
            <ImageCard
              image={entry}
              onDescriptionChange={(v) => updateDescription(entry.id, v)}
              onRemove={() => remove(entry.id)}
              onExpand={() => onExpand(entry.path)}
            />
          ) : (
            <UploadSlot label="Upload entry screenshot" busy={busyKind === "entry"} onClick={() => upload("entry")} />
          )}
        </FormField>
        <FormField label="Exit Screenshot">
          {exit ? (
            <ImageCard
              image={exit}
              onDescriptionChange={(v) => updateDescription(exit.id, v)}
              onRemove={() => remove(exit.id)}
              onExpand={() => onExpand(exit.path)}
            />
          ) : (
            <UploadSlot label="Upload exit screenshot" busy={busyKind === "exit"} onClick={() => upload("exit")} />
          )}
        </FormField>
      </div>

      <FormField label="Additional Images">
        <div className="grid grid-cols-2 gap-3">
          {additional.map((img) => (
            <ImageCard
              key={img.id}
              image={img}
              onDescriptionChange={(v) => updateDescription(img.id, v)}
              onRemove={() => remove(img.id)}
              onExpand={() => onExpand(img.path)}
            />
          ))}
          <UploadSlot label="Add image" busy={busyKind === "additional"} onClick={() => upload("additional")} />
        </div>
      </FormField>
    </div>
  );
}

function ScoreInput({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
}) {
  const score = parseInt(value) || 0;
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[12px]" style={{ color: "var(--text-secondary)" }}>{label}</span>
        <span
          className="text-[14px] font-bold tabular-nums w-6 text-right"
          style={{ color: score >= 7 ? "#4ade80" : score >= 4 ? "#fbbf24" : score > 0 ? "#f87171" : "var(--text-muted)" }}
        >
          {score || "—"}
        </span>
      </div>
      <div className="flex gap-1">
        {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(score === n ? "" : String(n))}
            className="flex-1 h-6 rounded text-[10px] font-semibold transition-all"
            style={{
              background:
                n <= score
                  ? n >= 7 ? "rgba(74,222,128,0.25)" : n >= 4 ? "rgba(251,191,36,0.25)" : "rgba(248,113,113,0.25)"
                  : "rgba(255,255,255,0.08)",
              color:
                n <= score
                  ? n >= 7 ? "#4ade80" : n >= 4 ? "#fbbf24" : "#f87171"
                  : "var(--text-secondary)",
              border: n <= score
                ? n >= 7 ? "1px solid rgba(74,222,128,0.3)" : n >= 4 ? "1px solid rgba(251,191,36,0.3)" : "1px solid rgba(248,113,113,0.3)"
                : "1px solid rgba(255,255,255,0.14)",
            }}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  account: Account;
  existingTrade?: TradeWithJournal | null;
  defaultDate?: string;
  onClose: () => void;
  onSaved: (values: TradeFormValues) => Promise<void>;
  onDuplicate?: (values: TradeFormValues) => void;
}

type Tab = "trade" | "journal" | "screenshots";

export function TradeForm({ existingTrade, defaultDate, onClose, onSaved, onDuplicate }: Props) {
  const isEdit = existingTrade != null;
  const [values, setValues]   = useState<TradeFormValues>(() =>
    isEdit ? tradeToFormValues(existingTrade!) : makeEmpty(defaultDate)
  );
  const [tab, setTab]         = useState<Tab>("trade");
  const [saving, setSaving]   = useState(false);
  const [errors, setErrors]   = useState<Partial<Record<keyof TradeFormValues, string>>>({});
  // New trades are logged straight from the FTMO/MetaTrader report (server time);
  // edits load already-converted local timestamps, so default this off for edits.
  const [ftmoTime, setFtmoTime] = useState(!isEdit);
  const [lightboxPath, setLightboxPath] = useState<string | null>(null);
  const historyRef            = useRef<TradeFormValues[]>([]);
  const isUndoRef             = useRef(false);

  // Existing images live in a separate table — load them once when editing a trade.
  useEffect(() => {
    if (!isEdit || !existingTrade) return;
    getImagesByTradeId(existingTrade.id)
      .then((rows) => {
        setValues((prev) => ({
          ...prev,
          images: rows.map((r) => ({ id: r.id, kind: r.kind, path: r.path, description: r.description ?? "" })),
        }));
      })
      .catch((err) => console.error("[TradeForm] failed to load images:", err));
  }, [isEdit, existingTrade]);

  // Close on Escape, undo on Ctrl+Z
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") { onClose(); return; }
      if (e.key === "z" && (e.ctrlKey || e.metaKey) && !e.shiftKey) {
        e.preventDefault();
        if (historyRef.current.length === 0) return;
        const prev = historyRef.current[historyRef.current.length - 1];
        historyRef.current = historyRef.current.slice(0, -1);
        isUndoRef.current = true;
        setValues(prev);
        isUndoRef.current = false;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  function set<K extends keyof TradeFormValues>(key: K, val: TradeFormValues[K]) {
    if (!isUndoRef.current) {
      historyRef.current = [...historyRef.current, values].slice(-50);
    }
    setValues((prev) => ({ ...prev, [key]: val }));
    if (errors[key]) setErrors((prev) => { const n = { ...prev }; delete n[key]; return n; });
  }

  function validate(): boolean {
    const e: Partial<Record<keyof TradeFormValues, string>> = {};
    if (!values.instrument.trim()) e.instrument = "Required";
    if (!values.openedAt)          e.openedAt   = "Required";
    if (Object.keys(e).length > 0) { setErrors(e); return false; }
    return true;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setSaving(true);
    try {
      const toSave = ftmoTime
        ? {
            ...values,
            openedAt: ftmoTimeToLocal(values.openedAt),
            closedAt: ftmoTimeToLocal(values.closedAt),
            maeTime:  ftmoTimeToLocal(values.maeTime),
            mfeTime:  ftmoTimeToLocal(values.mfeTime),
          }
        : values;
      await onSaved(toSave);
    } finally {
      setSaving(false);
    }
  }

  const rr = deriveRR(values);

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40"
        style={{ background: "rgba(0,0,0,0.55)" }}
        onClick={onClose}
      />

      {/* Drawer */}
      <div
        className="fixed top-0 right-0 bottom-0 z-50 flex flex-col"
        style={{
          width: 540,
          background: "var(--bg-panel)",
          borderLeft: "1px solid var(--border-medium)",
          boxShadow: "-16px 0 48px rgba(0,0,0,0.5)",
        }}
      >
        {/* ── Drawer header + tabs ── */}
        <div
          className="flex items-center justify-between px-6"
          style={{ borderBottom: "1px solid var(--border-subtle)", height: 52, background: "var(--bg-panel-alt)" }}
        >
          <div className="flex items-end h-full" style={{ paddingBottom: 8 }}>
            {(["trade", "journal", "screenshots"] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className="px-5 py-2 text-[12px] font-semibold transition-colors"
                style={{
                  color: tab === t ? "var(--accent-text)" : "var(--text-secondary)",
                  borderBottom: tab === t ? "2px solid var(--accent)" : "2px solid transparent",
                  background: tab === t ? "var(--accent-dim)" : "transparent",
                  borderRadius: tab === t ? "6px 6px 0 0" : undefined,
                }}
              >
                {t === "trade" ? "Trade Details" : t === "journal" ? "Journal" : "Screenshots"}
              </button>
            ))}
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors"
            style={{ color: "var(--text-muted)" }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--bg-panel-alt)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
          >
            <X size={16} />
          </button>
        </div>

        {/* ── Form body ── */}
        <form id="trade-form-inner" onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
          <div className="px-6 py-1.5" style={{ display: tab === "trade" ? "block" : "none" }}>
            <TradeTab values={values} set={set} rr={rr} errors={errors} ftmoTime={ftmoTime} setFtmoTime={setFtmoTime} />
          </div>
          <div className="px-6 py-2" style={{ display: tab === "journal" ? "block" : "none" }}>
            <JournalTab values={values} set={set} />
          </div>
          <div className="px-6 py-2" style={{ display: tab === "screenshots" ? "block" : "none" }}>
            <ScreenshotsTab images={values.images} setImages={(imgs) => set("images", imgs)} onExpand={setLightboxPath} />
          </div>
        </form>

        {/* ── Footer ── */}
        <div
          className="flex items-center justify-between px-6 py-3"
          style={{ borderTop: "1px solid var(--border-subtle)" }}
        >
          {tab === "trade" ? (
            <button
              type="button"
              onClick={() => setTab("journal")}
              className="flex items-center gap-1.5 text-[12px] font-medium"
              style={{ color: "var(--text-secondary)" }}
            >
              Add journal notes <ChevronRight size={14} />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setTab("trade")}
              className="text-[12px] font-medium"
              style={{ color: "var(--text-secondary)" }}
            >
              ← Back to trade
            </button>
          )}

          <div className="flex gap-2">
            {isEdit && onDuplicate && (
              <button
                type="button"
                onClick={() => onDuplicate({ ...values, tradeRef: "", pnl: "", exitPrice: "" })}
                className="px-4 py-2 rounded-lg text-[12px] font-medium transition-opacity hover:opacity-70"
                style={{
                  background: "rgba(255,255,255,0.05)",
                  color: "var(--text-secondary)",
                  border: "1px solid rgba(255,255,255,0.12)",
                }}
              >
                Duplicate
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-[12px] font-medium transition-opacity hover:opacity-70"
              style={{
                background: "rgba(255,255,255,0.08)",
                color: "var(--text-secondary)",
                border: "1px solid rgba(255,255,255,0.18)",
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              form="trade-form-inner"
              disabled={saving}
              onClick={handleSubmit}
              className="px-5 py-2 rounded-lg text-[12px] font-semibold transition-opacity hover:opacity-80 disabled:opacity-50"
              style={{
                background: "var(--accent-dim)",
                color: "var(--accent-text)",
                border: "1px solid var(--accent-border)",
              }}
            >
              {saving ? "Saving…" : isEdit ? "Save Changes" : "Save Trade"}
            </button>
          </div>
        </div>
      </div>

      {/* ── Fullscreen image lightbox ── */}
      {lightboxPath && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center"
          style={{ background: "rgba(0,0,0,0.85)" }}
          onClick={() => setLightboxPath(null)}
        >
          <img
            src={asAssetSrc(lightboxPath)}
            alt=""
            style={{ maxWidth: "92vw", maxHeight: "92vh", objectFit: "contain" }}
          />
          <button
            type="button"
            onClick={() => setLightboxPath(null)}
            className="fixed top-4 right-4 w-9 h-9 rounded-full flex items-center justify-center"
            style={{ background: "rgba(255,255,255,0.12)", color: "#fff" }}
            title="Close"
          >
            <X size={18} />
          </button>
        </div>
      )}
    </>
  );
}

// ─── Trade tab ────────────────────────────────────────────────────────────────

interface TabProps {
  values: TradeFormValues;
  set: <K extends keyof TradeFormValues>(key: K, val: TradeFormValues[K]) => void;
  rr?: string;
  errors?: Partial<Record<keyof TradeFormValues, string>>;
  ftmoTime?: boolean;
  setFtmoTime?: (v: boolean) => void;
}

function TradeTab({ values, set, rr, errors = {}, ftmoTime, setFtmoTime }: TabProps) {
  return (
    <div className="flex flex-col gap-1.5" style={{ paddingTop: 12 }}>

      {/* Opened / Closed */}
      <div className="grid grid-cols-2 gap-3">
        <FormField
          label="Opened at"
          required
          labelRight={
            // No closedAt = open position — this is what the Analytics chart's
            // open-position overlay and the Calendar/daily_stats rollups key off
            // of, so give it an explicit affordance rather than relying on
            // someone noticing they can blank the datetime field below.
            <label className="flex items-center gap-1.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={!values.closedAt}
                onChange={(e) => set("closedAt", e.target.checked ? "" : `${todayLocal()}T${nowTimeLocal()}`)}
                style={{
                  accentColor: "var(--accent)",
                  background: "var(--bg-panel-alt)",
                  border: "1px solid var(--border-medium)",
                  borderRadius: 3,
                }}
              />
              <span
                className="text-[10px] font-semibold uppercase tracking-wide"
                style={{ color: values.closedAt ? "var(--text-muted)" : "#4ade80" }}
              >
                Open Trade
              </span>
            </label>
          }
        >
          <DateTimeInput value={values.openedAt} onChange={(v) => set("openedAt", v)} />
          {errors.openedAt && <p className="text-[11px] mt-1" style={{ color: "#f87171" }}>{errors.openedAt}</p>}
        </FormField>
        <FormField
          label="Closed at"
          labelRight={
            setFtmoTime && (
              <label className="flex items-center gap-1.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={!!ftmoTime}
                  onChange={(e) => setFtmoTime(e.target.checked)}
                  style={{
                    accentColor: "var(--accent)",
                    background: "var(--bg-panel-alt)",
                    border: "1px solid var(--border-medium)",
                    borderRadius: 3,
                  }}
                />
                <span className="text-[10px] font-medium" style={{ color: "var(--text-muted)" }}>
                  FTMO Server Time
                </span>
              </label>
            )
          }
        >
          <DateTimeInput value={values.closedAt} onChange={(v) => set("closedAt", v)} />
        </FormField>
      </div>

      {/* Instrument + Side */}
      <div className="flex gap-3">
        <FormField label="Instrument" required className="w-32" labelSize={9}>
          <SelectInput
            value={values.instrument}
            onChange={(v) => set("instrument", v)}
            options={MAJOR_PAIRS}
            placeholder="Select pair…"
          />
          {errors.instrument && <p className="text-[11px] mt-1" style={{ color: "#f87171" }}>{errors.instrument}</p>}
        </FormField>

        <FormField label="Side" className="w-60" labelSize={9}>
          <div className="flex rounded-lg overflow-hidden" style={{ border: "1px solid var(--border-medium)" }}>
            {(["long", "short"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => set("side", s)}
                className="flex-1 flex items-center justify-center gap-1.5 py-1.5 text-[12px] font-semibold transition-colors capitalize"
                style={{
                  background: values.side === s
                    ? s === "long" ? "rgba(34,197,94,0.18)" : "rgba(239,68,68,0.18)"
                    : "rgba(255,255,255,0.07)",
                  color: values.side === s
                    ? s === "long" ? "#4ade80" : "#f87171"
                    : "var(--text-secondary)",
                }}
              >
                {s === "long" ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
                {s}
              </button>
            ))}
          </div>
        </FormField>

        <FormField label="Trade ID / Ref" className="flex-1" labelSize={9}>
          <Input
            value={values.tradeRef}
            onChange={(v) => set("tradeRef", v)}
            placeholder="e.g. 7842913"
          />
        </FormField>
      </div>

      <div style={{ height: 1, background: "var(--border-medium)", margin: "4px 0 12px" }} />

      {/* Setup name */}
      <div className="flex items-end gap-3">
        <FormField label="Setup name" className="w-52" centerLabel={false}>
          <Input
            value={values.setupName}
            onChange={(v) => set("setupName", v)}
            placeholder="London Open Break…"
          />
        </FormField>
        {/* Quick-pick chips — multi-select, comma-joined into setupName, wrapped to two rows */}
        <div className="flex flex-wrap gap-0.5 flex-1" style={{ maxHeight: 64, overflowY: "hidden" }}>
            {SETUP_SUGGESTIONS.map((s) => {
              const current  = values.setupName.split(",").map((t) => t.trim()).filter(Boolean);
              const isActive = current.includes(s);
              const toggle = () => {
                const next = isActive ? current.filter((t) => t !== s) : [...current, s];
                set("setupName", next.join(", "));
              };
              return (
                <button
                  key={s}
                  type="button"
                  onClick={toggle}
                  className="px-1.5 py-0.5 rounded-md transition-colors shrink-0 whitespace-nowrap"
                  style={{
                    background: isActive ? "var(--accent-dim)" : "rgba(255,255,255,0.08)",
                    color: isActive ? "var(--accent-text)" : "var(--text-secondary)",
                    border: isActive ? "1px solid var(--accent-border)" : "1px solid rgba(255,255,255,0.14)",
                    fontSize: 10,
                  }}
                >
                  {s}
                </button>
              );
            })}
        </div>
      </div>

      {/* Technical notes */}
      <FormField label="Technical notes" centerLabel={false}>
        <Textarea
          value={values.technicalNotes}
          onChange={(v) => set("technicalNotes", v)}
          placeholder="Describe the setup, confluence, execution…"
          rows={4}
        />
      </FormField>

      <div style={{ height: 1, background: "var(--border-medium)", margin: "4px 0 12px" }} />

      {/* Entry / Stop / Take Profit */}
      <div>
        <div className="flex gap-3 mb-3">
          <FormField label="Entry" className="w-20" labelSize={9}>
            <Input type="number" step="0.00001" value={values.entryPrice} onChange={(v) => set("entryPrice", v)} placeholder="0.00" />
          </FormField>
          <div className="self-end" style={{ width: 1, height: 30, background: "var(--border-medium)" }} />
          <FormField label="SL" className="w-20" labelSize={9}>
            <Input type="number" step="0.00001" value={values.stopPrice} onChange={(v) => set("stopPrice", v)} placeholder="0.00" />
          </FormField>
          <FormField label="SL Pips" className="w-20" labelSize={9}>
            <Input type="number" step="0.1" value={values.slPips} onChange={(v) => set("slPips", v)} placeholder="0" />
          </FormField>
          <div className="self-end" style={{ width: 1, height: 30, background: "var(--border-medium)" }} />
          <FormField label="TP" className="w-20" labelSize={9}>
            <Input type="number" step="0.00001" value={values.targetPrice} onChange={(v) => set("targetPrice", v)} placeholder="0.00" />
          </FormField>
          <FormField label="TP Pips" className="w-20" labelSize={9}>
            <Input type="number" step="0.1" value={values.tpPips} onChange={(v) => set("tpPips", v)} placeholder="0" />
          </FormField>
        </div>

        {/* Exit + Size + Fees + R:R badge */}
        <div className="flex items-end gap-3">
          <div className="w-20">
            <FormField label="Exit" labelSize={9}>
              <Input type="number" step="0.00001" value={values.exitPrice} onChange={(v) => set("exitPrice", v)} placeholder="0.00" />
            </FormField>
          </div>
          <div className="self-end" style={{ width: 1, height: 30, background: "var(--border-medium)" }} />
          <FormField label="Size / Lots" className="w-20" labelSize={9}>
            <Input type="number" step="0.01" cents value={values.size} onChange={(v) => set("size", v)} placeholder="1.00" />
          </FormField>
          <FormField label="Fees" className="w-20" boldLabel={false} labelSize={9}>
            <Input type="number" step="0.01" cents value={values.fees} onChange={(v) => set("fees", v)} placeholder="0.00" />
          </FormField>
          <div className="self-end" style={{ width: 1, height: 30, background: "var(--border-medium)" }} />
          {rr && rr !== "—" && (
            <FormField label="R:R" className="w-20" labelSize={9}>
              <div
                className="flex items-center justify-center rounded-lg"
                style={{ background: "var(--accent-dim)", border: "1px solid var(--accent-border)", height: 34 }}
              >
                <span className="text-[13px] font-bold tabular-nums" style={{ color: "var(--accent-text)" }}>
                  {rr}
                </span>
              </div>
            </FormField>
          )}
          <FormField label="P&L ($)" className="w-20" labelSize={9}>
            <div className="relative">
              <span
                className="absolute pointer-events-none"
                style={{
                  left: values.pnl && parseFloat(values.pnl) < 0 ? 13 : 7,
                  top: "50%",
                  transform: "translateY(-50%)",
                  fontSize: 11,
                  fontWeight: values.pnl && parseFloat(values.pnl) !== 0 ? 700 : 400,
                  color: values.pnl && parseFloat(values.pnl) > 0
                    ? "#4ade80"
                    : values.pnl && parseFloat(values.pnl) < 0
                    ? "#f87171"
                    : "var(--text-muted)",
                }}
              >
                $
              </span>
              <Input
                type="number"
                step="0.01"
                cents
                value={values.pnl}
                onChange={(v) => set("pnl", v)}
                placeholder="500.00"
                style={{
                  paddingLeft: values.pnl && parseFloat(values.pnl) < 0 ? 21 : 16,
                  paddingRight: 4,
                  fontSize: 11,
                  ...(values.pnl && parseFloat(values.pnl) > 0
                    ? { background: "rgba(34,197,94,0.15)", border: "1px solid rgba(34,197,94,0.45)", color: "#4ade80", fontWeight: 700 }
                    : values.pnl && parseFloat(values.pnl) < 0
                    ? { background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.45)", color: "#f87171", fontWeight: 700 }
                    : {}),
                }}
              />
            </div>
          </FormField>
        </div>
      </div>

      <div style={{ height: 1, background: "var(--border-medium)", margin: "12px 0 4px" }} />

      {/* MAE / MFE */}
      <div className="grid grid-cols-2 gap-3">
        <div className="flex gap-2 col-span-2">
          <FormField label="MAE Pip" className="w-20" labelSize={9}>
            <Input type="number" step="0.1" value={values.maePips} onChange={(v) => set("maePips", v)} placeholder="0" />
          </FormField>
          <FormField label="MAE Price" className="w-20" labelSize={9}>
            <Input type="number" step="0.01" cents value={values.mae} onChange={(v) => set("mae", v)} placeholder="0.00" />
          </FormField>
          <div className="flex items-end gap-5 ml-3 flex-1">
            <div className="self-end" style={{ width: 1, height: 30, background: "var(--border-medium)" }} />
            <FormField label="MAE Time" className="flex-1" centerLabel={false} labelSize={9}>
              <DateTimeInput value={values.maeTime} onChange={(v) => set("maeTime", v)} />
            </FormField>
          </div>
        </div>
        <div className="flex gap-2 col-span-2">
          <FormField label="MFE Pip" className="w-20" labelSize={9}>
            <Input type="number" step="0.1" value={values.mfePips} onChange={(v) => set("mfePips", v)} placeholder="0" />
          </FormField>
          <FormField label="MFE Price" className="w-20" labelSize={9}>
            <Input type="number" step="0.01" cents value={values.mfe} onChange={(v) => set("mfe", v)} placeholder="0.00" />
          </FormField>
          <div className="flex items-end gap-5 ml-3 flex-1">
            <div className="self-end" style={{ width: 1, height: 30, background: "var(--border-medium)" }} />
            <FormField label="MFE Time" className="flex-1" centerLabel={false} labelSize={9}>
              <DateTimeInput value={values.mfeTime} onChange={(v) => set("mfeTime", v)} />
            </FormField>
          </div>
        </div>
      </div>

      <div style={{ height: 1, background: "var(--border-medium)", margin: "4px 0" }} />

      {/* Tags */}
      <FormField label="Tags" centerLabel={false}>
        <div className="flex gap-2 overflow-x-auto" style={{ paddingBottom: 2 }}>
          {TAG_COLUMNS.map((labels, i) => {
            const currentTags = values.tags.split(",").map(t => t.trim()).filter(Boolean);
            return (
              <div key={labels.join("-")} className="flex gap-2 shrink-0">
                {i > 0 && <div style={{ width: 1, background: "var(--border-medium)" }} />}
                <div className="flex flex-col gap-2">
                {labels.map((label, li) => {
                  const tags = TAG_GROUPS.find((g) => g.label === label)!.tags;
                  return (
                    <div key={label} className="flex flex-col gap-1">
                      {li > 0 && <div style={{ height: 1, background: "var(--border-medium)", margin: "6px 0" }} />}
                      <div className="text-[9px] uppercase tracking-widest text-center" style={{ color: "var(--text-muted)" }}>{label}</div>
                      {tags.map((tag) => {
                        const isActive = currentTags.includes(tag);
                        const toggle = () => {
                          const next = isActive
                            ? currentTags.filter(t => t !== tag)
                            : [...currentTags, tag];
                          set("tags", next.join(", "));
                        };
                        return (
                          <button
                            key={tag}
                            type="button"
                            onClick={toggle}
                            className="px-1.5 py-0.5 rounded-md transition-colors text-center whitespace-nowrap"
                            style={{
                              background: isActive ? "var(--accent-dim)" : "rgba(255,255,255,0.08)",
                              color: isActive ? "var(--accent-text)" : "var(--text-secondary)",
                              border: isActive ? "1px solid var(--accent-border)" : "1px solid rgba(255,255,255,0.14)",
                              fontSize: 11,
                              lineHeight: 1.4,
                            }}
                          >
                            {tag}
                          </button>
                        );
                      })}
                    </div>
                  );
                })}
                </div>
              </div>
            );
          })}
        </div>
      </FormField>
    </div>
  );
}

// ─── Journal tab ──────────────────────────────────────────────────────────────

function JournalTab({ values, set }: TabProps) {
  return (
    <div className="flex flex-col gap-5">

      <div
        className="flex items-start gap-3 px-4 py-3 rounded-xl"
        style={{ background: "var(--accent-dim)", border: "1px solid var(--accent-border)" }}
      >
        <BookOpen size={14} style={{ color: "var(--accent-text)", marginTop: 2, flexShrink: 0 }} />
        <p className="text-[12px] leading-relaxed" style={{ color: "var(--accent-text)" }}>
          Journaling builds pattern recognition over time. Even a brief note counts.
        </p>
      </div>

      {/* Emotions */}
      <div className="grid grid-cols-2 gap-3">
        <FormField label="Emotion before">
          <SelectInput
            value={values.emotionBefore}
            onChange={(v) => set("emotionBefore", v)}
            options={EMOTION_OPTIONS}
            placeholder="Select…"
          />
        </FormField>
        <FormField label="Emotion after">
          <SelectInput
            value={values.emotionAfter}
            onChange={(v) => set("emotionAfter", v)}
            options={EMOTION_OPTIONS}
            placeholder="Select…"
          />
        </FormField>
      </div>

      {/* Scores */}
      <div
        className="p-4 rounded-xl flex flex-col gap-4"
        style={{ background: "var(--bg-panel-alt)", border: "1px solid var(--border-subtle)" }}
      >
        <ScoreInput
          label="Confidence (1–10)"
          value={values.confidenceScore}
          onChange={(v) => set("confidenceScore", v)}
        />
        <ScoreInput
          label="Discipline (1–10)"
          value={values.disciplineScore}
          onChange={(v) => set("disciplineScore", v)}
        />
      </div>

      {/* Mistakes */}
      <FormField label="Mistakes">
        <Textarea
          value={values.mistakes}
          onChange={(v) => set("mistakes", v)}
          placeholder="What went wrong? What would you do differently?"
          rows={3}
        />
      </FormField>

      {/* Lessons */}
      <FormField label="Lessons learned">
        <Textarea
          value={values.lessons}
          onChange={(v) => set("lessons", v)}
          placeholder="What did this trade teach you?"
          rows={3}
        />
      </FormField>

      {/* Freeform */}
      <FormField label="Free notes">
        <Textarea
          value={values.freeformNotes}
          onChange={(v) => set("freeformNotes", v)}
          placeholder="Anything else — context, market conditions, mood…"
          rows={4}
        />
      </FormField>
    </div>
  );
}
