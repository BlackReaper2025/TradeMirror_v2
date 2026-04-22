// ─── TradeForm — slide-over drawer for new trade entry or edit ────────────────
import { useState, useEffect, useRef, useCallback } from "react"; // useRef used in TimeInput hold logic
import { X, ChevronRight, TrendingUp, TrendingDown, BookOpen, ChevronUp, ChevronDown } from "lucide-react";
import { FormField, inputClass, inputStyle } from "../ui/FormField";
import type { Account, TradeWithJournal } from "../../db/queries";

// ─── Types ────────────────────────────────────────────────────────────────────

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
  size:          string;
  fees:          string;
  pnl:           string;
  technicalNotes: string;
  tags:          string;
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
];

const SETUP_SUGGESTIONS = [
  "Supply Zone", "Demand Zone", "Liquidity Sweep", "Wyckoff",
  "Break & Retest", "No Setup",
];

const MAJOR_PAIRS = [
  "EUR/USD", "GBP/USD", "USD/JPY", "USD/CHF",
  "AUD/USD", "USD/CAD", "NZD/USD",
  "EUR/GBP", "EUR/JPY", "GBP/JPY",
  "EUR/CHF", "EUR/AUD", "EUR/CAD",
  "GBP/CHF", "GBP/AUD", "GBP/CAD",
  "AUD/JPY", "CAD/JPY", "CHF/JPY",
  "XAU/USD", "US100", "US500", "US30",
];

const TAG_GROUPS = [
  { label: "Session",    tags: ["asia", "london", "new-york"] },
  { label: "Setup",      tags: ["swing-low", "swing-high", "session-high", "session-low", "supply", "demand", "liquidity-sweep", "wyckoff", "break-retest", "fair-value-gap"] },
  { label: "Type",       tags: ["scalp", "swing", "news-event"] },
  { label: "Psychology", tags: ["patience", "impatience", "fomo", "revenge", "no-setup", "bad-entry", "exit-early"] },
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

function makeEmpty(defaultDate?: string): TradeFormValues {
  const date = defaultDate ?? todayLocal();
  const now  = `${date}T${nowTimeLocal()}`;
  return {
    openedAt: now,
    closedAt: now,
    instrument: "",
    side: "long",
    setupName: "",
    entryPrice: "",
    stopPrice: "",
    targetPrice: "",
    size: "",
    fees: "",
    pnl: "",
    technicalNotes: "",
    tags: "",
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
    size:            t.size        != null ? parseFloat(String(t.size)).toFixed(2)        : "",
    fees:            t.fees        != null ? parseFloat(String(t.fees)).toFixed(2)        : "",
    pnl:             t.pnl         != null ? parseFloat(String(t.pnl)).toFixed(2)         : "",
    technicalNotes:  norm(t.technicalNotes),
    tags:            norm(t.tags),
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
}: {
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  step?: string;
  cents?: boolean;
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
}

type Tab = "trade" | "journal";

export function TradeForm({ account, existingTrade, defaultDate, onClose, onSaved }: Props) {
  const isEdit = existingTrade != null;
  const [values, setValues]   = useState<TradeFormValues>(() =>
    isEdit ? tradeToFormValues(existingTrade!) : makeEmpty(defaultDate)
  );
  const [tab, setTab]         = useState<Tab>("trade");
  const [saving, setSaving]   = useState(false);
  const [errors, setErrors]   = useState<Partial<Record<keyof TradeFormValues, string>>>({});
  const historyRef            = useRef<TradeFormValues[]>([]);
  const isUndoRef             = useRef(false);

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
      await onSaved(values);
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
        {/* ── Drawer header ── */}
        <div
          className="flex items-center justify-between px-6 py-3"
          style={{ borderBottom: "1px solid var(--border-subtle)" }}
        >
          <div>
            <h2 className="text-[16px] font-bold" style={{ color: "var(--text-primary)" }}>
              {isEdit ? "Edit Trade" : "New Trade"}
            </h2>
            <div className="text-[12px] mt-0.5" style={{ color: "var(--text-muted)" }}>
              {account.name} · {account.brokerOrFirm}
            </div>
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

        {/* ── Tabs ── */}
        <div
          className="flex gap-1 px-6 pt-4 pb-0"
          style={{ borderBottom: "1px solid var(--border-subtle)" }}
        >
          {(["trade", "journal"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className="px-4 py-2 text-[12px] font-semibold capitalize rounded-t-lg transition-colors"
              style={{
                color: tab === t ? "var(--accent-text)" : "var(--text-secondary)",
                background: tab === t ? "var(--accent-dim)" : "transparent",
                borderBottom: tab === t ? "2px solid var(--accent)" : "2px solid transparent",
                marginBottom: -1,
              }}
            >
              {t === "trade" ? "Trade Details" : "Journal"}
            </button>
          ))}
        </div>

        {/* ── Form body ── */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
          <div className="px-6 py-3" style={{ display: tab === "trade" ? "block" : "none" }}>
            <TradeTab values={values} set={set} rr={rr} errors={errors} />
          </div>
          <div className="px-6 py-3" style={{ display: tab === "journal" ? "block" : "none" }}>
            <JournalTab values={values} set={set} />
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
    </>
  );
}

// ─── Trade tab ────────────────────────────────────────────────────────────────

interface TabProps {
  values: TradeFormValues;
  set: <K extends keyof TradeFormValues>(key: K, val: TradeFormValues[K]) => void;
  rr?: string;
  errors?: Partial<Record<keyof TradeFormValues, string>>;
}

function TradeTab({ values, set, rr, errors = {} }: TabProps) {
  return (
    <div className="flex flex-col gap-3">

      {/* Opened / Closed */}
      <div className="grid grid-cols-2 gap-3">
        <FormField label="Opened at" required>
          <DateTimeInput value={values.openedAt} onChange={(v) => set("openedAt", v)} />
          {errors.openedAt && <p className="text-[11px] mt-1" style={{ color: "#f87171" }}>{errors.openedAt}</p>}
        </FormField>
        <FormField label="Closed at">
          <DateTimeInput value={values.closedAt} onChange={(v) => set("closedAt", v)} />
        </FormField>
      </div>

      {/* Instrument + Side */}
      <div className="grid grid-cols-2 gap-3">
        <FormField label="Instrument" required>
          <SelectInput
            value={values.instrument}
            onChange={(v) => set("instrument", v)}
            options={MAJOR_PAIRS}
            placeholder="Select pair…"
          />
          {errors.instrument && <p className="text-[11px] mt-1" style={{ color: "#f87171" }}>{errors.instrument}</p>}
        </FormField>

        <FormField label="Side">
          <div className="flex rounded-lg overflow-hidden" style={{ border: "1px solid var(--border-medium)" }}>
            {(["long", "short"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => set("side", s)}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 text-[12px] font-semibold transition-colors capitalize"
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
      </div>

      {/* Setup name */}
      <FormField label="Setup name">
        <div className="relative">
          <Input
            value={values.setupName}
            onChange={(v) => set("setupName", v)}
            placeholder="London Open Break…"
          />
          {/* Quick-pick chips */}
          <div className="flex flex-wrap gap-1 mt-2">
            {SETUP_SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => set("setupName", s)}
                className="px-2 py-0.5 rounded-md text-[10px] transition-colors"
                style={{
                  background: values.setupName === s ? "var(--accent-dim)" : "rgba(255,255,255,0.08)",
                  color: values.setupName === s ? "var(--accent-text)" : "var(--text-secondary)",
                  border: values.setupName === s ? "1px solid var(--accent-border)" : "1px solid rgba(255,255,255,0.14)",
                  fontSize: 11,
                }}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      </FormField>

      {/* Entry / Stop / Target */}
      <div>
        <div className="grid grid-cols-3 gap-3 mb-2">
          <FormField label="Entry">
            <Input type="number" step="0.00001" value={values.entryPrice} onChange={(v) => set("entryPrice", v)} placeholder="0.00" />
          </FormField>
          <FormField label="Stop">
            <Input type="number" step="0.00001" value={values.stopPrice} onChange={(v) => set("stopPrice", v)} placeholder="0.00" />
          </FormField>
          <FormField label="Target">
            <Input type="number" step="0.00001" value={values.targetPrice} onChange={(v) => set("targetPrice", v)} placeholder="0.00" />
          </FormField>
        </div>

        {/* Derived R:R */}
        {rr && rr !== "—" && (
          <div
            className="flex items-center gap-2 px-3 py-2 rounded-lg"
            style={{ background: "var(--accent-dim)", border: "1px solid var(--accent-border)" }}
          >
            <span className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: "var(--text-secondary)" }}>
              Risk : Reward
            </span>
            <span className="text-[14px] font-bold tabular-nums" style={{ color: "var(--accent-text)" }}>
              {rr}
            </span>
          </div>
        )}
      </div>

      {/* Size / Fees / P&L */}
      <div className="grid grid-cols-3 gap-3">
        <FormField label="Size / Lots">
          <Input type="number" step="0.01" cents value={values.size} onChange={(v) => set("size", v)} placeholder="1.00" />
        </FormField>
        <FormField label="Fees">
          <Input type="number" step="0.01" cents value={values.fees} onChange={(v) => set("fees", v)} placeholder="0.00" />
        </FormField>
        <FormField label="P&L ($)">
          <Input
            type="number"
            step="0.01"
            cents
            value={values.pnl}
            onChange={(v) => set("pnl", v)}
            placeholder="+500.00"
          />
        </FormField>
      </div>

      {/* Technical notes */}
      <FormField label="Technical notes">
        <Textarea
          value={values.technicalNotes}
          onChange={(v) => set("technicalNotes", v)}
          placeholder="Describe the setup, confluence, execution…"
          rows={2}
        />
      </FormField>

      {/* Tags */}
      <FormField label="Tags">
        <div className="flex flex-col gap-2">
          {TAG_GROUPS.map(({ label, tags }) => {
            const currentTags = values.tags.split(",").map(t => t.trim()).filter(Boolean);
            return (
              <div key={label}>
                <div className="text-[9px] uppercase tracking-widest mb-1" style={{ color: "var(--text-muted)" }}>{label}</div>
                <div className="flex flex-wrap gap-1">
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
                      className="px-2 py-0.5 rounded-md text-[11px] transition-colors"
                      style={{
                        background: isActive ? "var(--accent-dim)" : "rgba(255,255,255,0.08)",
                        color: isActive ? "var(--accent-text)" : "var(--text-secondary)",
                        border: isActive ? "1px solid var(--accent-border)" : "1px solid rgba(255,255,255,0.14)",
                      }}
                    >
                      {tag}
                    </button>
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
