import { useState, useEffect } from "react";
import { Plus, Check, Trash2, FolderOpen, Pencil, Archive, ArchiveRestore } from "lucide-react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { Panel } from "../components/ui/Panel";
import { getTimeFormat, setTimeFormat, type TimeFormat } from "../lib/preferences";
import { getAccountPropFirm, setAccountPropFirm, type PropFirm } from "../lib/preferences";
import { getPropFirmServerZone, setPropFirmServerZone } from "../lib/preferences";
import { getSlideshowFolder, setSlideshowFolder, getSlideshowInterval, setSlideshowInterval, getAccountBrokerUrl, setAccountBrokerUrl } from "../lib/preferences";
import {
  getSettings,
  getActiveAccounts,
  getArchivedAccounts,
  archiveAccount,
  unarchiveAccount,
  createAccount,
  upsertSelectedAccount,
  clearAllTradesForAccount,
  resetAccountBalance,
  getAllQuotes,
  addQuote,
  deleteQuote,
  updateQuote,
  getAllTradesForExport,
  type Account,
} from "../db/queries";
import { eq } from "drizzle-orm";
import { accounts } from "../db/schema";
import { getDb } from "../db/index";
import { useDatabase } from "../db/DatabaseProvider";
import { tradeEvents } from "../lib/tradeEvents";

// ─── Reusable sub-components ──────────────────────────────────────────────────

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-[10px] font-semibold uppercase tracking-widest mt-0.5 mb-0.5 px-1" style={{ color: "var(--text-muted)" }}>
      {children}
    </h2>
  );
}

// Compact in-panel header — replaces the shared PanelHeader (14px text, 16px
// bottom margin) with a smaller/tighter one scoped to this page only, so
// PanelHeader's spacing elsewhere in the app (Dashboard, etc.) is untouched.
function CompactHeader({ label, children }: { label: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-2">
      <span className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: "var(--text-secondary)" }}>
        {label}
      </span>
      {children}
    </div>
  );
}

// Compact pill row for small mutually-exclusive choices (time format, timezone,
// account type, prop firm) — replaces the old full-height ToggleOption cards
// so a binary/ternary choice takes one row instead of two stacked cards.
function SegmentedControl<T extends string>({
  options, value, onChange, size = "default",
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  size?: "default" | "sm";
}) {
  const sm = size === "sm";
  return (
    <div className={sm ? "flex gap-1" : "flex gap-2"}>
      {options.map(o => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={
            sm
              ? "px-2.5 py-1 rounded-md text-[11px] font-medium transition-all"
              : "flex-1 px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all"
          }
          style={{
            background: value === o.value ? "var(--accent-dim)" : "var(--bg-panel-alt)",
            border:     value === o.value ? "1px solid var(--accent-border)" : "1px solid var(--border-subtle)",
            color:      value === o.value ? "var(--accent-text)" : "var(--text-secondary)",
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function FieldInput({
  label, value, onChange, placeholder, type = "text",
}: {
  label: string; value: string;
  onChange: (v: string) => void;
  placeholder?: string; type?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[11px] font-medium" style={{ color: "var(--text-secondary)" }}>
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2 rounded-lg text-[13px] transition-colors outline-none"
        style={{
          background: "var(--bg-panel-alt)",
          border: "1px solid var(--border-subtle)",
          color: "var(--text-primary)",
        }}
        onFocus={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "var(--accent-border)"; }}
        onBlur={(e)  => { (e.currentTarget as HTMLElement).style.borderColor = "var(--border-subtle)"; }}
      />
    </div>
  );
}

function DangerButton({
  onClick, disabled, children,
}: {
  onClick: () => void; disabled?: boolean; children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="px-4 py-2 rounded-lg text-[12px] font-semibold transition-all disabled:opacity-50"
      style={{
        background: "rgba(239,68,68,0.10)",
        border: "1px solid rgba(239,68,68,0.25)",
        color: "#f87171",
      }}
      onMouseEnter={(e) => {
        if (!disabled) (e.currentTarget as HTMLElement).style.background = "rgba(239,68,68,0.18)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.background = "rgba(239,68,68,0.10)";
      }}
    >
      {children}
    </button>
  );
}

function SaveButton({
  onClick, disabled, children,
}: {
  onClick: () => void; disabled?: boolean; children: React.ReactNode;
}) {
  const [saved, setSaved] = useState(false);

  function handleClick() {
    onClick();
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  return (
    <button
      onClick={handleClick}
      disabled={disabled}
      className="px-4 py-2 rounded-lg text-[12px] font-semibold transition-all disabled:opacity-50"
      style={{
        background: saved ? "rgba(74,222,128,0.15)" : "var(--accent-dim)",
        border: `1px solid ${saved ? "rgba(74,222,128,0.4)" : "var(--accent-border)"}`,
        color: saved ? "#4ade80" : "var(--accent-text)",
        minWidth: 60,
      }}
      onMouseEnter={e => {
        if (disabled || saved) return;
        const el = e.currentTarget as HTMLElement;
        el.style.background = "var(--accent)";
        el.style.color = "#fff";
      }}
      onMouseLeave={e => {
        if (disabled || saved) return;
        const el = e.currentTarget as HTMLElement;
        el.style.background = "var(--accent-dim)";
        el.style.color = "var(--accent-text)";
      }}
    >
      {saved ? "Saved ✓" : children}
    </button>
  );
}

// ─── Main Settings page ───────────────────────────────────────────────────────

type SettingsTab = "accounts" | "app";

export function Settings() {
  const { ready } = useDatabase();
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("accounts");

  // ── Time format ──
  const [timeFormat, setLocalFormat] = useState<TimeFormat>(getTimeFormat);
  function handleTimeFormatChange(v: string) {
    const fmt = v as TimeFormat;
    setLocalFormat(fmt);
    setTimeFormat(fmt);
  }

  // ── External URLs ──
  const [slideshowFolder,   setSlideshowLocal]   = useState(getSlideshowFolder);
  const [slideshowInterval, setSlideshowInterval_] = useState(() => String(getSlideshowInterval()));

  function saveSlideshowFolder() {
    setSlideshowFolder(slideshowFolder.trim());
  }
  function saveSlideshowInterval() {
    const n = parseInt(slideshowInterval, 10);
    setSlideshowInterval(isNaN(n) || n < 1 ? 60 : n);
  }
  async function browseSlideshowFolder() {
    const selected = await openDialog({ directory: true, multiple: false });
    if (typeof selected === "string" && selected) {
      setSlideshowLocal(selected);
      setSlideshowFolder(selected);
    }
  }

  // ── All accounts + selected ──
  const [allAccounts,    setAllAccounts]    = useState<Account[]>([]);
  const [selectedId,     setSelectedId]     = useState<string>("");
  const [account,        setAccount]        = useState<Account | null>(null);
  const [acctName,       setAcctName]       = useState("");
  const [startBal,       setStartBal]       = useState("");
  const [dailyTgt,       setDailyTgt]       = useState("");
  const [acctBrokerUrl,  setAcctBrokerUrl]  = useState("");
  const [propFirm,       setPropFirmLocal]  = useState<PropFirm>("E8 Markets");
  const [serverZone,     setServerZoneLocal] = useState<string>(() => getPropFirmServerZone("E8 Markets"));
  const [acctSaving,     setAcctSaving]     = useState(false);
  const [acctSaved,      setAcctSaved]      = useState(false);

  // Falls back to matching the account's Broker/Firm name when no explicit
  // prop-firm choice has been saved yet for this account.
  function inferPropFirmFallback(brokerOrFirm: string): PropFirm {
    return brokerOrFirm === "FTMO" ? "FTMO" : "E8 Markets";
  }
  function handlePropFirmChange(v: string) {
    const firm = v as PropFirm;
    setPropFirmLocal(firm);
    setServerZoneLocal(getPropFirmServerZone(firm));
    if (account) setAccountPropFirm(account.id, firm);
  }
  function handleServerZoneChange(zone: string) {
    setServerZoneLocal(zone);
    setPropFirmServerZone(propFirm, zone);
  }

  // ── Archived accounts ──
  const [archivedAccounts, setArchivedAccounts] = useState<Account[]>([]);
  const [archiveConfirm,   setArchiveConfirm]   = useState(false);
  const [archiving,        setArchiving]        = useState(false);
  const [unarchiving,      setUnarchiving]      = useState<string | null>(null);

  // ── New account form ──
  const [showNewForm,    setShowNewForm]    = useState(false);
  const [newName,        setNewName]        = useState("");
  const [newBroker,      setNewBroker]      = useState("");
  const [newStartBal,    setNewStartBal]    = useState("");
  const [newDailyTgt,    setNewDailyTgt]    = useState("");
  const [newType,        setNewType]        = useState<"prop" | "personal" | "challenge" | "oanda">("personal");
  const [newSaving,      setNewSaving]      = useState(false);

  async function loadAccounts() {
    if (!ready) return;
    const [all, archived, settings] = await Promise.all([getActiveAccounts(), getArchivedAccounts(), getSettings()]);
    setAllAccounts(all);
    setArchivedAccounts(archived);
    const selId = settings?.selectedAccountId ?? all[0]?.id ?? "";
    setSelectedId(selId);
    const acc = all.find(a => a.id === selId) ?? all[0] ?? null;
    setAccount(acc);
    if (acc) {
      setAcctName(acc.name);
      setStartBal(String(acc.startingBalance));
      setDailyTgt(String(acc.dailyTarget));
      setAcctBrokerUrl(getAccountBrokerUrl(acc.id));
      const firm = getAccountPropFirm(acc.id, inferPropFirmFallback(acc.brokerOrFirm));
      setPropFirmLocal(firm);
      setServerZoneLocal(getPropFirmServerZone(firm));
    }
  }
  useEffect(() => { loadAccounts(); }, [ready]);

  async function handleSelectAccount(id: string) {
    if (!ready) return;
    await upsertSelectedAccount(id);
    setSelectedId(id);
    const acc = allAccounts.find(a => a.id === id) ?? null;
    setAccount(acc);
    if (acc) {
      setAcctName(acc.name);
      setStartBal(String(acc.startingBalance));
      setDailyTgt(String(acc.dailyTarget));
      setAcctBrokerUrl(getAccountBrokerUrl(acc.id));
      const firm = getAccountPropFirm(acc.id, inferPropFirmFallback(acc.brokerOrFirm));
      setPropFirmLocal(firm);
      setServerZoneLocal(getPropFirmServerZone(firm));
    }
    tradeEvents.notify();
  }

  async function handleSaveAccount() {
    if (!account || !ready) return;
    setAcctSaving(true);
    try {
      const db = getDb();
      const newStart  = parseFloat(startBal)  || account.startingBalance;
      const newTarget = parseFloat(dailyTgt)  || account.dailyTarget;
      await db.update(accounts).set({
        name:            acctName.trim() || account.name,
        startingBalance: newStart,
        dailyTarget:     newTarget,
      }).where(eq(accounts.id, account.id));
      setAccountBrokerUrl(account.id, acctBrokerUrl);
      tradeEvents.notify();
      setAcctSaved(true);
      setTimeout(() => setAcctSaved(false), 2500);
      await loadAccounts();
    } catch (err) {
      console.error("[Settings] save account failed:", err);
    } finally {
      setAcctSaving(false);
    }
  }

  async function handleCreateAccount() {
    if (!newName.trim() || !newBroker.trim() || !newStartBal) return;
    setNewSaving(true);
    try {
      const acc = await createAccount({
        name:            newName.trim(),
        brokerOrFirm:    newBroker.trim(),
        startingBalance: parseFloat(newStartBal),
        dailyTarget:     parseFloat(newDailyTgt) || 0,
        accountType:     newType,
      });
      await upsertSelectedAccount(acc.id);
      setNewName(""); setNewBroker(""); setNewStartBal(""); setNewDailyTgt(""); setNewType("personal");
      setShowNewForm(false);
      await loadAccounts();
      tradeEvents.notify();
    } catch (err) {
      console.error("[Settings] create account failed:", err);
    } finally {
      setNewSaving(false);
    }
  }

  // ── Delete account ──
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  async function handleDeleteAccount() {
    if (!deleteConfirm) {
      setDeleteConfirm(true);
      setTimeout(() => setDeleteConfirm(false), 6000);
      return;
    }
    if (!account || !ready) return;
    try {
      const db = getDb();
      await clearAllTradesForAccount(account.id);
      await db.update(accounts)
        .set({ isActive: false })
        .where(eq(accounts.id, account.id));
      // Switch to another active account if one exists
      const remaining = allAccounts.filter(a => a.id !== account.id);
      if (remaining.length > 0) await upsertSelectedAccount(remaining[0].id);
      tradeEvents.notify();
      setDeleteConfirm(false);
      await loadAccounts();
    } catch (err) {
      console.error("[Settings] delete account failed:", err);
    }
  }

  // ── Archive account ──
  async function handleArchiveAccount() {
    if (!archiveConfirm) {
      setArchiveConfirm(true);
      setTimeout(() => setArchiveConfirm(false), 6000);
      return;
    }
    if (!account || !ready) return;
    setArchiving(true);
    try {
      await archiveAccount(account.id);
      const remaining = allAccounts.filter(a => a.id !== account.id);
      if (remaining.length > 0) await upsertSelectedAccount(remaining[0].id);
      tradeEvents.notify();
      setArchiveConfirm(false);
      await loadAccounts();
    } catch (err) {
      console.error("[Settings] archive account failed:", err);
    } finally {
      setArchiving(false);
    }
  }

  async function handleUnarchiveAccount(id: string) {
    if (!ready) return;
    setUnarchiving(id);
    try {
      await unarchiveAccount(id);
      tradeEvents.notify();
      await loadAccounts();
    } catch (err) {
      console.error("[Settings] unarchive account failed:", err);
    } finally {
      setUnarchiving(null);
    }
  }

  // ── Psychology Quotes ──
  const [allQuotes,      setAllQuotes]      = useState<Array<{ id: number; text: string; author: string; isActive: boolean }>>([]);
  const [newQuoteText,   setNewQuoteText]   = useState("");
  const [newQuoteAuthor, setNewQuoteAuthor] = useState("");
  const [quoteAdding,    setQuoteAdding]    = useState(false);
  const [showAddQuote,   setShowAddQuote]   = useState(false);
  const [editingId,      setEditingId]      = useState<number | null>(null);
  const [editText,       setEditText]       = useState("");
  const [editAuthor,     setEditAuthor]     = useState("");
  const [quoteSaving,    setQuoteSaving]    = useState(false);

  function startEdit(q: { id: number; text: string; author: string }) {
    setEditingId(q.id);
    setEditText(q.text);
    setEditAuthor(q.author);
  }
  function cancelEdit() {
    setEditingId(null);
    setEditText("");
    setEditAuthor("");
  }
  async function handleSaveQuote() {
    if (!editText.trim() || editingId === null) return;
    setQuoteSaving(true);
    try {
      await updateQuote(editingId, editText.trim(), editAuthor.trim());
      cancelEdit();
      await loadQuotes();
      tradeEvents.notify();
    } finally {
      setQuoteSaving(false);
    }
  }

  async function loadQuotes() {
    if (!ready) return;
    const rows = await getAllQuotes();
    setAllQuotes(rows);
  }
  useEffect(() => { loadQuotes(); }, [ready]);

  async function handleAddQuote() {
    if (!newQuoteText.trim()) return;
    setQuoteAdding(true);
    try {
      await addQuote(newQuoteText.trim(), newQuoteAuthor.trim());
      setNewQuoteText("");
      setNewQuoteAuthor("");
      setShowAddQuote(false);
      await loadQuotes();
      tradeEvents.notify();
    } finally {
      setQuoteAdding(false);
    }
  }

  async function handleDeleteQuote(id: number) {
    await deleteQuote(id);
    await loadQuotes();
    tradeEvents.notify();
  }

  // ── Export trades ──
  const [exporting, setExporting] = useState(false);
  const [exportDone, setExportDone] = useState(false);

  async function handleExport() {
    if (!ready) return;
    setExporting(true);
    try {
      const rows = await getAllTradesForExport();

      const esc = (v: unknown) => {
        const s = v == null ? "" : String(v);
        return s.includes(",") || s.includes('"') || s.includes("\n")
          ? `"${s.replace(/"/g, '""')}"` : s;
      };

      const headers = [
        "ID", "Account ID", "Opened At", "Closed At", "Instrument", "Side",
        "Setup", "Entry Price", "Stop Price", "Target Price", "Size", "Fees", "P&L",
        "Technical Notes", "Tags",
        "Emotion Before", "Emotion After", "Mistakes", "Lessons",
        "Confidence Score", "Discipline Score", "Journal Notes",
      ];

      const dataRows = rows.map(t => [
        esc(t.id), esc(t.accountId), esc(t.openedAt), esc(t.closedAt),
        esc(t.instrument), esc(t.side), esc(t.setupName),
        esc(t.entryPrice), esc(t.stopPrice), esc(t.targetPrice),
        esc(t.size), esc(t.fees), esc(t.pnl),
        esc(t.technicalNotes), esc(t.tags),
        esc(t.journal?.emotionBefore), esc(t.journal?.emotionAfter),
        esc(t.journal?.mistakes), esc(t.journal?.lessons),
        esc(t.journal?.confidenceScore), esc(t.journal?.disciplineScore),
        esc(t.journal?.freeformNotes),
      ].join(","));

      const csv = [headers.join(","), ...dataRows].join("\r\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      const date = new Date().toISOString().split("T")[0];
      a.href     = url;
      a.download = `trademirror-trades-${date}.csv`;
      a.click();
      URL.revokeObjectURL(url);

      setExportDone(true);
      setTimeout(() => setExportDone(false), 3000);
    } catch (err) {
      console.error("[Settings] export failed:", err);
    } finally {
      setExporting(false);
    }
  }

  // ── Balance reset (payout) ──
  const [resetBal,        setResetBal]        = useState("");
  const [resetting,       setResetting]       = useState(false);
  const [resetConfirm,    setResetConfirm]    = useState(false);
  const [resetDone,       setResetDone]       = useState(false);

  async function handleResetBalance() {
    const target = parseFloat(resetBal);
    if (!target || !account || !ready) return;
    if (!resetConfirm) {
      setResetConfirm(true);
      setTimeout(() => setResetConfirm(false), 6000);
      return;
    }
    setResetConfirm(false);
    setResetting(true);
    setResetDone(false);
    try {
      await resetAccountBalance(account.id, target);
      tradeEvents.notify();
      setResetDone(true);
      setResetBal("");
      await loadAccounts();
      setTimeout(() => setResetDone(false), 3000);
    } catch (err) {
      console.error("[Settings] balance reset failed:", err);
    } finally {
      setResetting(false);
    }
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden" style={{ padding: "14px 24px" }}>
      <div className="flex flex-col gap-2 flex-1 min-h-0" style={{ maxWidth: 1040 }}>

        <h1 className="text-[15px] font-semibold" style={{ color: "var(--text-primary)" }}>Settings</h1>

        {/* ── Tab bar ── */}
        <div className="flex gap-1 shrink-0" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
          {(["accounts", "app"] as SettingsTab[]).map(t => (
            <button
              key={t}
              onClick={() => setSettingsTab(t)}
              className="px-4 py-2 text-[12px] font-semibold transition-colors"
              style={{
                color: settingsTab === t ? "var(--accent-text)" : "var(--text-secondary)",
                borderBottom: settingsTab === t ? "2px solid var(--accent)" : "2px solid transparent",
                background: settingsTab === t ? "var(--accent-dim)" : "transparent",
                borderRadius: settingsTab === t ? "6px 6px 0 0" : undefined,
                marginBottom: -1,
              }}
            >
              {t === "accounts" ? "Accounts" : "App"}
            </button>
          ))}
        </div>

        {settingsTab === "accounts" && (
        <>
        {/* ── Accounts ── */}
        <SectionTitle>Accounts</SectionTitle>

        {/* This row absorbs whatever vertical space the fixed sections below
            don't use — Your Accounts scrolls internally instead of pushing
            the whole page into scroll. */}
        <div className="flex gap-2 flex-1 min-h-0" style={{ minHeight: 140 }}>
        {/* Account switcher — half its previous (equal-split) width */}
        <div className="flex-1 min-w-0" style={{ flexBasis: "25%" }}>
        <Panel className="!p-3 h-full flex flex-col min-h-0">
          <CompactHeader label="Your Accounts">
            <button
              onClick={() => setShowNewForm(v => !v)}
              className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold transition-all"
              style={{
                background: showNewForm ? "var(--accent-dim)" : "rgba(255,255,255,0.07)",
                border:     showNewForm ? "1px solid var(--accent-border)" : "1px solid rgba(255,255,255,0.14)",
                color:      showNewForm ? "var(--accent-text)" : "var(--text-secondary)",
              }}
            >
              <Plus size={11} /> New
            </button>
          </CompactHeader>

          <div className="flex flex-col gap-1.5 flex-1 min-h-0 overflow-y-auto">
            {allAccounts.map(acc => {
              const isSelected = acc.id === selectedId;
              return (
                <button
                  key={acc.id}
                  onClick={() => handleSelectAccount(acc.id)}
                  className="flex items-center justify-between w-full px-3 py-2 rounded-lg text-left transition-all"
                  style={{
                    background: isSelected ? "var(--accent-dim)" : "var(--bg-panel-alt)",
                    border:     isSelected ? "1px solid var(--accent-border)" : "1px solid var(--border-subtle)",
                  }}
                >
                  <div className="flex items-baseline gap-1.5 min-w-0">
                    <span className="text-[12.5px] font-semibold truncate" style={{ color: isSelected ? "var(--accent-text)" : "var(--text-primary)" }}>
                      {acc.name}
                    </span>
                    <span className="text-[10.5px] shrink-0" style={{ color: isSelected ? "var(--accent-text)" : "var(--text-muted)" }}>
                      {acc.brokerOrFirm} · ${acc.currentBalance.toLocaleString("en-US", { minimumFractionDigits: 0 })}
                    </span>
                  </div>
                  {isSelected && <Check size={13} className="shrink-0" style={{ color: "var(--accent)" }} />}
                </button>
              );
            })}
            {allAccounts.length === 0 && (
              <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>Loading accounts…</p>
            )}
          </div>

          {/* Archived accounts — folded into this panel rather than a
              separate section; shrink-0 so it never eats into the active
              list's space beyond its own capped height. */}
          {archivedAccounts.length > 0 && (
            <div className="shrink-0 mt-2 pt-2" style={{ borderTop: "1px solid var(--border-subtle)" }}>
              <div className="text-[10px] font-semibold uppercase tracking-widest mb-1.5" style={{ color: "var(--text-muted)" }}>
                Archived
              </div>
              <div className="flex flex-col gap-1.5 overflow-y-auto" style={{ maxHeight: 260 }}>
                {archivedAccounts.map(acc => (
                  <div
                    key={acc.id}
                    className="flex items-center justify-between px-3 py-2 rounded-lg"
                    style={{ background: "var(--bg-panel-alt)", border: "1px solid var(--border-subtle)" }}
                  >
                    <div className="flex items-baseline gap-1.5 min-w-0">
                      <span className="text-[12.5px] font-semibold truncate" style={{ color: "var(--text-muted)" }}>
                        {acc.name}
                      </span>
                      <span className="text-[10.5px] shrink-0" style={{ color: "var(--text-muted)", opacity: 0.7 }}>
                        {acc.brokerOrFirm} · ${acc.currentBalance.toLocaleString("en-US", { minimumFractionDigits: 0 })}
                      </span>
                    </div>
                    <button
                      onClick={() => handleUnarchiveAccount(acc.id)}
                      disabled={unarchiving === acc.id || !ready}
                      className="ml-4 shrink-0 flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all disabled:opacity-50"
                      style={{
                        background: "rgba(255,255,255,0.06)",
                        border: "1px solid rgba(255,255,255,0.12)",
                        color: "var(--text-secondary)",
                      }}
                    >
                      <ArchiveRestore size={11} />
                      {unarchiving === acc.id ? "Restoring…" : "Restore"}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* New Account form — shrink-0 so it's always fully visible; the
              account list above (flex-1 min-h-0) yields space to it instead. */}
          {showNewForm && (
            <div className="shrink-0 flex flex-col gap-2 mt-3 pt-3 overflow-y-auto" style={{ borderTop: "1px solid var(--border-subtle)", maxHeight: "50%" }}>
              <div className="grid grid-cols-2 gap-2">
                <FieldInput label="Account Name" value={newName} onChange={setNewName} placeholder="e.g. FTMO Funded" />
                <FieldInput label="Broker / Firm" value={newBroker} onChange={setNewBroker} placeholder="e.g. FTMO" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <FieldInput label="Starting Balance ($)" value={newStartBal} onChange={setNewStartBal} placeholder="e.g. 100000" type="number" />
                <FieldInput label="Daily Target ($)" value={newDailyTgt} onChange={setNewDailyTgt} placeholder="e.g. 500" type="number" />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-medium" style={{ color: "var(--text-secondary)" }}>Account Type</label>
                <SegmentedControl
                  options={[
                    { value: "personal", label: "Personal" },
                    { value: "prop", label: "Prop" },
                    { value: "challenge", label: "Challenge" },
                    { value: "oanda", label: "OANDA" },
                  ]}
                  value={newType}
                  onChange={setNewType}
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setShowNewForm(false)}
                  className="px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all"
                  style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", color: "var(--text-secondary)" }}
                >
                  Cancel
                </button>
                <SaveButton onClick={handleCreateAccount} disabled={newSaving || !newName.trim() || !newBroker.trim() || !newStartBal}>
                  {newSaving ? "Creating…" : "Create Account"}
                </SaveButton>
              </div>
            </div>
          )}
        </Panel>
        </div>

        {/* Edit selected account — stretches to match Your Accounts' height;
            scrolls internally as a fallback if the window gets very short. */}
        <div className="flex-1 min-w-0" style={{ flexBasis: "75%" }}>
        <Panel className="!p-3 h-full flex flex-col min-h-0">
          <CompactHeader label="Edit Selected Account" />
          <div className="shrink-0" style={{ height: 1, background: "var(--border-subtle)", marginBottom: 8 }} />
          {account ? (
            <div className="flex flex-col gap-2 flex-1 min-h-0 overflow-y-auto">
              <div className="flex items-end gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-medium" style={{ color: "var(--text-secondary)" }} title="Determines which server timezone the Trade Log's Server Time entry mode converts from">
                    Prop Firm
                  </label>
                  <SegmentedControl
                    options={[
                      { value: "FTMO", label: "FTMO" },
                      { value: "E8 Markets", label: "E8 Markets" },
                    ]}
                    value={propFirm}
                    onChange={handlePropFirmChange}
                    size="sm"
                  />
                </div>
              </div>
              <div className="flex items-end gap-3">
                <div style={{ width: "50%" }}>
                  <FieldInput label="Brokerage URL" value={acctBrokerUrl} onChange={setAcctBrokerUrl} placeholder="https://broker.com/dashboard" />
                </div>
                <div className="flex flex-col gap-1 min-w-0 ml-auto">
                  <label
                    className="text-[11px] font-medium"
                    style={{ color: "var(--text-secondary)" }}
                    title="The IANA timezone this prop firm's trade server reports times in"
                  >
                    Server Timezone
                  </label>
                  <select
                    value={serverZone}
                    onChange={(e) => handleServerZoneChange(e.target.value)}
                    className="px-2 py-1 rounded-md text-[11px] outline-none"
                    style={{ background: "var(--bg-panel-alt)", border: "1px solid var(--border-subtle)", color: "var(--text-primary)", maxWidth: 180 }}
                  >
                    <option value="Europe/Helsinki">Europe/Helsinki (EET/EEST)</option>
                    <option value="Europe/Athens">Europe/Athens (EET/EEST)</option>
                    <option value="Europe/Bucharest">Europe/Bucharest (EET/EEST)</option>
                    <option value="Europe/London">Europe/London (GMT/BST)</option>
                    <option value="America/New_York">America/New_York (EST/EDT)</option>
                    <option value="UTC">UTC</option>
                  </select>
                </div>
              </div>
              <div className="shrink-0" style={{ height: 1, background: "var(--border-subtle)", margin: "8px 0" }} />
              <div style={{ width: "20%" }}>
                <FieldInput label="Account Name" value={acctName} onChange={setAcctName} placeholder="e.g. FTMO Funded" />
              </div>
              <div style={{ width: "20%" }}>
                <FieldInput label="Starting Balance ($)" value={startBal} onChange={setStartBal} placeholder="e.g. 100000" type="number" />
              </div>
              <div style={{ width: "20%" }}>
                <FieldInput label="Daily Target ($)" value={dailyTgt} onChange={setDailyTgt} placeholder="e.g. 500" type="number" />
              </div>
              <div className="shrink-0" style={{ height: 1, background: "var(--border-subtle)", marginTop: 48 }} />
              <div className="flex items-end gap-2" style={{ width: "50%" }}>
                <div className="flex-1">
                  <FieldInput
                    label="Payout reset — new balance"
                    value={resetBal}
                    onChange={(v) => { setResetBal(v); setResetConfirm(false); setResetDone(false); }}
                    placeholder={account ? `Current: $${account.currentBalance.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "Enter amount"}
                    type="number"
                  />
                </div>
                <button
                  onClick={handleResetBalance}
                  disabled={resetting || !ready || !resetBal || !parseFloat(resetBal)}
                  className="shrink-0 px-3 py-2 rounded-lg text-[11px] font-semibold transition-all disabled:opacity-50"
                  style={{
                    background: resetDone    ? "rgba(74,222,128,0.1)"
                              : resetConfirm ? "rgba(248,113,113,0.15)"
                              : "var(--accent-dim)",
                    border:     resetDone    ? "1px solid rgba(74,222,128,0.3)"
                              : resetConfirm ? "1px solid rgba(248,113,113,0.4)"
                              : "1px solid var(--accent-border)",
                    color:      resetDone    ? "#4ade80"
                              : resetConfirm ? "#f87171"
                              : "var(--accent-text)",
                  }}
                  title="Trade history is preserved — only the balance anchor is adjusted"
                >
                  {resetting ? "Resetting…" : resetDone ? "✓ Reset" : resetConfirm ? "Confirm?" : "Reset Balance"}
                </button>
              </div>
              <div className="flex items-center justify-between pt-2 mt-auto" style={{ borderTop: "1px solid var(--border-subtle)" }}>
                <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                  Balance: <span style={{ color: "var(--text-secondary)" }}>${account.currentBalance.toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={handleExport}
                    disabled={exporting || !ready}
                    className="shrink-0 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-all disabled:opacity-50"
                    style={{
                      background: exportDone ? "rgba(74,222,128,0.1)" : "var(--bg-panel-alt)",
                      border:     exportDone ? "1px solid rgba(74,222,128,0.3)" : "1px solid var(--border-medium)",
                      color:      exportDone ? "#4ade80" : "var(--text-secondary)",
                    }}
                    title="Downloads all trades and journal entries as a CSV file"
                  >
                    {exporting ? "Exporting…" : exportDone ? "✓ Downloaded" : "Export CSV"}
                  </button>
                  <button
                    onClick={handleArchiveAccount}
                    disabled={archiving || !ready || !account}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-all disabled:opacity-50"
                    style={{
                      background: archiveConfirm ? "rgba(251,191,36,0.15)" : "rgba(251,191,36,0.08)",
                      border:     archiveConfirm ? "1px solid rgba(251,191,36,0.5)" : "1px solid rgba(251,191,36,0.25)",
                      color:      "#fbbf24",
                    }}
                    title="Remove this account from your portfolio without losing trade data"
                  >
                    <Archive size={12} />
                    {archiving ? "Archiving…" : archiveConfirm ? "Confirm?" : "Archive"}
                  </button>
                  <SaveButton onClick={handleSaveAccount} disabled={acctSaving || !ready}>
                    {acctSaving ? "Saving…" : acctSaved ? "✓ Saved" : "Save"}
                  </SaveButton>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>Loading account…</p>
          )}
        </Panel>
        </div>
        </div>
        </>
        )}

        {settingsTab === "app" && (
        <Panel className="!p-4 flex flex-col gap-5 flex-1 min-h-0 overflow-y-auto">

          {/* ── Preferences ── */}
          <div>
            <CompactHeader label="Time Format" />
            <SegmentedControl
              options={[{ value: "12h", label: "12-hour" }, { value: "24h", label: "24-hour" }]}
              value={timeFormat}
              onChange={handleTimeFormatChange}
              size="sm"
            />
          </div>

          <div style={{ height: 1, background: "var(--border-subtle)" }} />

          <div>
            <CompactHeader label="Personalization" />
            <div className="flex items-end gap-2">
              <div style={{ width: "50%" }}>
                <FieldInput
                  label="Slideshow Folder"
                  value={slideshowFolder}
                  onChange={setSlideshowLocal}
                  placeholder="e.g. C:\Users\Geoff\Pictures\Inspiration"
                />
              </div>
              <button
                onClick={browseSlideshowFolder}
                className="flex items-center gap-1 px-2.5 py-2 rounded-lg text-[11px] font-semibold transition-all shrink-0"
                style={{
                  background: "rgba(255,255,255,0.07)",
                  border: "1px solid rgba(255,255,255,0.14)",
                  color: "var(--text-secondary)",
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.12)"; (e.currentTarget as HTMLElement).style.color = "var(--text-primary)"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.07)"; (e.currentTarget as HTMLElement).style.color = "var(--text-secondary)"; }}
                title="Browse for a folder"
              >
                <FolderOpen size={12} />
              </button>
              <div style={{ width: 90 }}>
                <FieldInput
                  label="Interval (s)"
                  value={slideshowInterval}
                  onChange={setSlideshowInterval_}
                  placeholder="60"
                />
              </div>
              <SaveButton onClick={() => { saveSlideshowFolder(); saveSlideshowInterval(); }}>Save</SaveButton>
            </div>
          </div>

          <div style={{ height: 1, background: "var(--border-subtle)" }} />

          {/* ── Psychology Quotes ── */}
          <div style={{ maxWidth: 600 }}>
            <CompactHeader label="Quote Library">
              <button
                onClick={() => setShowAddQuote(v => !v)}
                className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold transition-all"
                style={{
                  background: showAddQuote ? "var(--accent-dim)" : "rgba(255,255,255,0.07)",
                  border:     showAddQuote ? "1px solid var(--accent-border)" : "1px solid rgba(255,255,255,0.14)",
                  color:      showAddQuote ? "var(--accent-text)" : "var(--text-secondary)",
                }}
              >
                <Plus size={11} /> Add
              </button>
            </CompactHeader>

            {/* Add quote form */}
            {showAddQuote && (
              <div className="flex flex-col gap-2 mb-2 pb-2" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                <FieldInput label="Quote" value={newQuoteText} onChange={setNewQuoteText} placeholder="Enter the quote text…" />
                <FieldInput label="Author (optional)" value={newQuoteAuthor} onChange={setNewQuoteAuthor} placeholder="e.g. Mark Douglas" />
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => { setShowAddQuote(false); setNewQuoteText(""); setNewQuoteAuthor(""); }}
                    className="px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all"
                    style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", color: "var(--text-secondary)" }}
                  >
                    Cancel
                  </button>
                  <SaveButton
                    onClick={handleAddQuote}
                    disabled={quoteAdding || !newQuoteText.trim()}
                  >
                    {quoteAdding ? "Adding…" : "Add Quote"}
                  </SaveButton>
                </div>
              </div>
            )}

            {/* Quote list */}
            <div className="flex flex-col gap-1.5 overflow-y-auto" style={{ maxHeight: 220 }}>
              {allQuotes.length === 0 && (
                <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>No quotes yet. Add one above.</p>
              )}
              {allQuotes.map(q => (
                <div
                  key={q.id}
                  className="flex flex-col gap-1.5 px-3 py-2 rounded-lg"
                  style={{ background: "var(--bg-panel-alt)", border: `1px solid ${editingId === q.id ? "var(--accent-border)" : "var(--border-subtle)"}` }}
                >
                  {editingId === q.id ? (
                    <>
                      <textarea
                        value={editText}
                        onChange={e => setEditText(e.target.value)}
                        rows={2}
                        className="w-full rounded-lg px-3 py-2 text-[13px] resize-none"
                        style={{ background: "var(--bg-base)", border: "1px solid var(--border-subtle)", color: "var(--text-primary)", outline: "none" }}
                      />
                      <input
                        value={editAuthor}
                        onChange={e => setEditAuthor(e.target.value)}
                        placeholder="Author (optional)"
                        className="w-full rounded-lg px-3 py-2 text-[12px]"
                        style={{ background: "var(--bg-base)", border: "1px solid var(--border-subtle)", color: "var(--text-primary)", outline: "none" }}
                      />
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={cancelEdit}
                          className="px-3 py-1.5 rounded-lg text-[12px] font-semibold"
                          style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", color: "var(--text-secondary)" }}
                        >
                          Cancel
                        </button>
                        <SaveButton onClick={handleSaveQuote} disabled={quoteSaving || !editText.trim()}>
                          {quoteSaving ? "Saving…" : "Save"}
                        </SaveButton>
                      </div>
                    </>
                  ) : (
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-[12.5px] leading-snug" style={{ color: "var(--text-primary)" }}>{q.text}</p>
                        {q.author && <p className="text-[10.5px] mt-0.5 font-medium" style={{ color: "var(--text-muted)" }}>— {q.author}</p>}
                      </div>
                      <div className="flex items-center gap-1 shrink-0 mt-0.5">
                        <button
                          onClick={() => startEdit(q)}
                          className="w-5 h-5 rounded flex items-center justify-center transition-colors"
                          style={{ color: "var(--text-muted)" }}
                          onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = "var(--text-primary)"}
                          onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = "var(--text-muted)"}
                        >
                          <Pencil size={11} />
                        </button>
                        <button
                          onClick={() => handleDeleteQuote(q.id)}
                          className="w-5 h-5 rounded flex items-center justify-center transition-colors"
                          style={{ color: "var(--text-muted)" }}
                          onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = "#f87171"}
                          onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = "var(--text-muted)"}
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="mt-auto pt-3 flex" style={{ borderTop: "1px solid var(--border-subtle)" }}>
            <DangerButton onClick={handleDeleteAccount} disabled={!ready || !account}>
              {deleteConfirm ? "Confirm delete?" : "Delete Account"}
            </DangerButton>
          </div>
        </Panel>
        )}

      </div>
    </div>
  );
}
