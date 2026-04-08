// ─── TradeForm — slide-over drawer for new trade entry ───────────────────────
import { useState, useEffect } from "react";
import { X, ChevronRight, TrendingUp, TrendingDown, BookOpen, Tag } from "lucide-react";
import { FormField, inputClass, inputStyle } from "../ui/FormField";
import type { Account } from "../../db/queries";

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
  "London Open Break", "Break & Retest", "Rejection Wick",
  "Fib Retracement", "Range Breakout", "Trend Continuation",
  "Liquidity Sweep", "Order Block", "Fair Value Gap",
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

function makeEmpty(): TradeFormValues {
  return {
    openedAt: `${todayLocal()}T${nowTimeLocal()}`,
    closedAt: "",
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

// ─── Styled input helpers ─────────────────────────────────────────────────────

function Input({
  value,
  onChange,
  type = "text",
  placeholder,
  step,
}: {
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  step?: string;
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
      onBlur={() => setFocused(false)}
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
                  : "var(--bg-panel-alt)",
              color:
                n <= score
                  ? n >= 7 ? "#4ade80" : n >= 4 ? "#fbbf24" : "#f87171"
                  : "var(--text-muted)",
              border: n <= score
                ? n >= 7 ? "1px solid rgba(74,222,128,0.3)" : n >= 4 ? "1px solid rgba(251,191,36,0.3)" : "1px solid rgba(248,113,113,0.3)"
                : "1px solid var(--border-subtle)",
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
  onClose: () => void;
  onSaved: (values: TradeFormValues) => Promise<void>;
}

type Tab = "trade" | "journal";

export function TradeForm({ account, onClose, onSaved }: Props) {
  const [values, setValues]   = useState<TradeFormValues>(makeEmpty);
  const [tab, setTab]         = useState<Tab>("trade");
  const [saving, setSaving]   = useState(false);
  const [errors, setErrors]   = useState<Partial<Record<keyof TradeFormValues, string>>>({});

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  function set<K extends keyof TradeFormValues>(key: K, val: TradeFormValues[K]) {
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
          className="flex items-center justify-between px-6 py-5"
          style={{ borderBottom: "1px solid var(--border-subtle)" }}
        >
          <div>
            <h2 className="text-[16px] font-bold" style={{ color: "var(--text-primary)" }}>
              New Trade
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
                color: tab === t ? "var(--accent-text)" : "var(--text-muted)",
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
          <div className="px-6 py-5" style={{ display: tab === "trade" ? "block" : "none" }}>
            <TradeTab values={values} set={set} rr={rr} errors={errors} />
          </div>
          <div className="px-6 py-5" style={{ display: tab === "journal" ? "block" : "none" }}>
            <JournalTab values={values} set={set} />
          </div>
        </form>

        {/* ── Footer ── */}
        <div
          className="flex items-center justify-between px-6 py-4"
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
                background: "var(--bg-panel-alt)",
                color: "var(--text-secondary)",
                border: "1px solid var(--border-medium)",
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
              {saving ? "Saving…" : "Save Trade"}
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
    <div className="flex flex-col gap-5">

      {/* Opened / Closed */}
      <div className="grid grid-cols-2 gap-3">
        <FormField label="Opened at" required>
          <Input
            type="datetime-local"
            value={values.openedAt}
            onChange={(v) => set("openedAt", v)}
          />
          {errors.openedAt && <p className="text-[11px] mt-1" style={{ color: "#f87171" }}>{errors.openedAt}</p>}
        </FormField>
        <FormField label="Closed at">
          <Input
            type="datetime-local"
            value={values.closedAt}
            onChange={(v) => set("closedAt", v)}
          />
        </FormField>
      </div>

      {/* Instrument + Side */}
      <div className="grid grid-cols-2 gap-3">
        <FormField label="Instrument" required>
          <Input
            value={values.instrument}
            onChange={(v) => set("instrument", v.toUpperCase())}
            placeholder="EUR/USD"
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
                    : "var(--bg-panel-alt)",
                  color: values.side === s
                    ? s === "long" ? "#4ade80" : "#f87171"
                    : "var(--text-muted)",
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
                  background: values.setupName === s ? "var(--accent-dim)" : "var(--bg-panel-alt)",
                  color: values.setupName === s ? "var(--accent-text)" : "var(--text-muted)",
                  border: values.setupName === s ? "1px solid var(--accent-border)" : "1px solid var(--border-subtle)",
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
          <Input type="number" step="0.01" value={values.size} onChange={(v) => set("size", v)} placeholder="1.00" />
        </FormField>
        <FormField label="Fees">
          <Input type="number" step="0.01" value={values.fees} onChange={(v) => set("fees", v)} placeholder="0.00" />
        </FormField>
        <FormField label="P&L ($)">
          <Input
            type="number"
            step="0.01"
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
          rows={4}
        />
      </FormField>

      {/* Tags */}
      <FormField label="Tags" hint="comma separated">
        <div className="relative">
          <div className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "var(--text-muted)" }}>
            <Tag size={13} />
          </div>
          <Input
            value={values.tags}
            onChange={(v) => set("tags", v)}
            placeholder="breakout, london, high-rr"
          />
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
