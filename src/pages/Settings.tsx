import { useState, useEffect } from "react";
import { Plus, Check } from "lucide-react";
import { Panel, PanelHeader } from "../components/ui/Panel";
import { getTimeFormat, setTimeFormat, type TimeFormat } from "../lib/preferences";
import { getBrokerageUrl, setBrokerageUrl, getMusicUrl, setMusicUrl } from "../lib/preferences";
import {
  getSettings,
  getActiveAccounts,
  createAccount,
  upsertSelectedAccount,
  clearAllTradesForAccount,
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
    <h2 className="text-[11px] font-semibold uppercase tracking-widest mt-2 mb-1 px-1" style={{ color: "var(--text-muted)" }}>
      {children}
    </h2>
  );
}

function ToggleOption({
  label, description, value, selected, onSelect,
}: {
  label: string; description?: string; value: string;
  selected: boolean; onSelect: (v: string) => void;
}) {
  return (
    <button
      onClick={() => onSelect(value)}
      className="flex items-center justify-between w-full px-4 py-3 rounded-lg text-left transition-all"
      style={{
        background: selected ? "var(--accent-dim)" : "var(--bg-panel-alt)",
        border: selected ? "1px solid var(--accent-border)" : "1px solid var(--border-subtle)",
        color: selected ? "var(--accent-text)" : "var(--text-primary)",
      }}
    >
      <div>
        <div className="text-[13px] font-medium">{label}</div>
        {description && (
          <div className="text-[11px] mt-0.5" style={{ color: selected ? "var(--accent-text)" : "var(--text-muted)" }}>
            {description}
          </div>
        )}
      </div>
      <div
        className="w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0"
        style={{ borderColor: selected ? "var(--accent)" : "var(--border-medium)" }}
      >
        {selected && <div className="w-2 h-2 rounded-full" style={{ background: "var(--accent)" }} />}
      </div>
    </button>
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
    <div className="flex flex-col gap-1.5">
      <label className="text-[12px] font-medium" style={{ color: "var(--text-secondary)" }}>
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2.5 rounded-lg text-[13px] transition-colors outline-none"
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
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="px-4 py-2 rounded-lg text-[12px] font-semibold transition-all disabled:opacity-50"
      style={{
        background: "var(--accent-dim)",
        border: "1px solid var(--accent-border)",
        color: "var(--accent-text)",
      }}
    >
      {children}
    </button>
  );
}

// ─── Main Settings page ───────────────────────────────────────────────────────

export function Settings() {
  const { ready } = useDatabase();

  // ── Time format ──
  const [timeFormat, setLocalFormat] = useState<TimeFormat>(getTimeFormat);
  function handleTimeFormatChange(v: string) {
    const fmt = v as TimeFormat;
    setLocalFormat(fmt);
    setTimeFormat(fmt);
  }

  // ── External URLs ──
  const [brokerUrl, setBrokerLocal] = useState(getBrokerageUrl);
  const [musicUrl,  setMusicLocal]  = useState(getMusicUrl);

  function saveBrokerUrl() {
    setBrokerageUrl(brokerUrl.trim());
  }
  function saveMusicUrl() {
    setMusicUrl(musicUrl.trim());
  }

  // ── All accounts + selected ──
  const [allAccounts,    setAllAccounts]    = useState<Account[]>([]);
  const [selectedId,     setSelectedId]     = useState<string>("");
  const [account,        setAccount]        = useState<Account | null>(null);
  const [acctName,       setAcctName]       = useState("");
  const [startBal,       setStartBal]       = useState("");
  const [dailyTgt,       setDailyTgt]       = useState("");
  const [acctSaving,     setAcctSaving]     = useState(false);
  const [acctSaved,      setAcctSaved]      = useState(false);

  // ── New account form ──
  const [showNewForm,    setShowNewForm]    = useState(false);
  const [newName,        setNewName]        = useState("");
  const [newBroker,      setNewBroker]      = useState("");
  const [newStartBal,    setNewStartBal]    = useState("");
  const [newDailyTgt,    setNewDailyTgt]    = useState("");
  const [newType,        setNewType]        = useState<"prop" | "personal" | "challenge">("personal");
  const [newSaving,      setNewSaving]      = useState(false);

  async function loadAccounts() {
    if (!ready) return;
    const [all, settings] = await Promise.all([getActiveAccounts(), getSettings()]);
    setAllAccounts(all);
    const selId = settings?.selectedAccountId ?? all[0]?.id ?? "";
    setSelectedId(selId);
    const acc = all.find(a => a.id === selId) ?? all[0] ?? null;
    setAccount(acc);
    if (acc) {
      setAcctName(acc.name);
      setStartBal(String(acc.startingBalance));
      setDailyTgt(String(acc.dailyTarget));
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

  // ── Clear trades ──
  const [clearing,      setClearing]      = useState(false);
  const [clearConfirm,  setClearConfirm]  = useState(false);
  const [clearDone,     setClearDone]     = useState(false);

  async function handleClearTrades() {
    if (!clearConfirm) {
      setClearConfirm(true);
      setTimeout(() => setClearConfirm(false), 6000);
      return;
    }
    if (!ready) return;
    setClearConfirm(false);
    setClearing(true);
    setClearDone(false);
    try {
      const settings = await getSettings();
      await clearAllTradesForAccount(settings?.selectedAccountId ?? "acc-1");
      tradeEvents.notify();
      setClearDone(true);
      setTimeout(() => setClearDone(false), 3000);
    } catch (err) {
      console.error("[Settings] clear failed:", err);
    } finally {
      setClearing(false);
    }
  }

  return (
    <div className="flex-1 overflow-y-auto" style={{ padding: "20px 24px 40px" }}>
      <div className="flex flex-col gap-4" style={{ maxWidth: 680 }}>

        <div>
          <h1 className="text-[20px] font-semibold" style={{ color: "var(--text-primary)" }}>Settings</h1>
          <p className="text-[13px] mt-1" style={{ color: "var(--text-muted)" }}>
            Preferences are saved locally to this device.
          </p>
        </div>

        {/* ── Display ── */}
        <SectionTitle>Display</SectionTitle>
        <Panel>
          <PanelHeader label="Time Format" />
          <div className="flex flex-col gap-2">
            <ToggleOption label="12-hour" description="e.g. 02:30 PM" value="12h" selected={timeFormat === "12h"} onSelect={handleTimeFormatChange} />
            <ToggleOption label="24-hour" description="e.g. 14:30" value="24h" selected={timeFormat === "24h"} onSelect={handleTimeFormatChange} />
          </div>
        </Panel>

        {/* ── External Links ── */}
        <SectionTitle>External Links</SectionTitle>
        <Panel>
          <PanelHeader label="Brokerage &amp; Music" />
          <div className="flex flex-col gap-4">
            <div className="flex items-end gap-3">
              <div className="flex-1">
                <FieldInput label="Brokerage / Prop Firm URL" value={brokerUrl} onChange={setBrokerLocal} placeholder="https://your-broker.com/dashboard" />
              </div>
              <SaveButton onClick={saveBrokerUrl}>Save</SaveButton>
            </div>
            <div className="flex items-end gap-3">
              <div className="flex-1">
                <FieldInput label="Music Playlist URL" value={musicUrl} onChange={setMusicLocal} placeholder="https://music.youtube.com/playlist?list=..." />
              </div>
              <SaveButton onClick={saveMusicUrl}>Save</SaveButton>
            </div>
          </div>
        </Panel>

        {/* ── Accounts ── */}
        <SectionTitle>Accounts</SectionTitle>

        {/* Account switcher */}
        <Panel>
          <div className="flex items-center justify-between mb-3">
            <PanelHeader label="Your Accounts" />
            <button
              onClick={() => setShowNewForm(v => !v)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-all"
              style={{
                background: showNewForm ? "var(--accent-dim)" : "rgba(255,255,255,0.07)",
                border:     showNewForm ? "1px solid var(--accent-border)" : "1px solid rgba(255,255,255,0.14)",
                color:      showNewForm ? "var(--accent-text)" : "var(--text-secondary)",
              }}
            >
              <Plus size={12} /> New Account
            </button>
          </div>

          <div className="flex flex-col gap-2">
            {allAccounts.map(acc => {
              const isSelected = acc.id === selectedId;
              return (
                <button
                  key={acc.id}
                  onClick={() => handleSelectAccount(acc.id)}
                  className="flex items-center justify-between w-full px-4 py-3 rounded-lg text-left transition-all"
                  style={{
                    background: isSelected ? "var(--accent-dim)" : "var(--bg-panel-alt)",
                    border:     isSelected ? "1px solid var(--accent-border)" : "1px solid var(--border-subtle)",
                  }}
                >
                  <div>
                    <div className="text-[13px] font-semibold" style={{ color: isSelected ? "var(--accent-text)" : "var(--text-primary)" }}>
                      {acc.name}
                    </div>
                    <div className="text-[11px] mt-0.5" style={{ color: isSelected ? "var(--accent-text)" : "var(--text-muted)" }}>
                      {acc.brokerOrFirm} · {acc.accountType} · ${acc.currentBalance.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                    </div>
                  </div>
                  {isSelected && <Check size={14} style={{ color: "var(--accent)" }} />}
                </button>
              );
            })}
            {allAccounts.length === 0 && (
              <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>Loading accounts…</p>
            )}
          </div>

          {/* New Account form */}
          {showNewForm && (
            <div className="flex flex-col gap-3 mt-4 pt-4" style={{ borderTop: "1px solid var(--border-subtle)" }}>
              <div className="text-[12px] font-semibold uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
                New Account
              </div>
              <div className="grid grid-cols-2 gap-3">
                <FieldInput label="Account Name" value={newName} onChange={setNewName} placeholder="e.g. FTMO Funded" />
                <FieldInput label="Broker / Firm" value={newBroker} onChange={setNewBroker} placeholder="e.g. FTMO" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <FieldInput label="Starting Balance ($)" value={newStartBal} onChange={setNewStartBal} placeholder="e.g. 100000" type="number" />
                <FieldInput label="Daily Target ($)" value={newDailyTgt} onChange={setNewDailyTgt} placeholder="e.g. 500" type="number" />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[12px] font-medium" style={{ color: "var(--text-secondary)" }}>Account Type</label>
                <div className="flex gap-2">
                  {(["personal", "prop", "challenge"] as const).map(t => (
                    <button
                      key={t}
                      onClick={() => setNewType(t)}
                      className="px-3 py-1.5 rounded-lg text-[12px] font-medium capitalize transition-all"
                      style={{
                        background: newType === t ? "var(--accent-dim)" : "var(--bg-panel-alt)",
                        border:     newType === t ? "1px solid var(--accent-border)" : "1px solid var(--border-subtle)",
                        color:      newType === t ? "var(--accent-text)" : "var(--text-secondary)",
                      }}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button
                  onClick={() => setShowNewForm(false)}
                  className="px-4 py-2 rounded-lg text-[12px] font-semibold transition-all"
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

        {/* Edit selected account */}
        <Panel>
          <PanelHeader label="Edit Selected Account" />
          {account ? (
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-3">
                <FieldInput label="Account Name" value={acctName} onChange={setAcctName} placeholder="e.g. FTMO Funded" />
                <FieldInput label="Starting Balance ($)" value={startBal} onChange={setStartBal} placeholder="e.g. 100000" type="number" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <FieldInput label="Daily Target ($)" value={dailyTgt} onChange={setDailyTgt} placeholder="e.g. 500" type="number" />
                <div className="flex flex-col gap-1.5">
                  <label className="text-[12px] font-medium" style={{ color: "var(--text-secondary)" }}>Broker / Firm</label>
                  <div className="px-3 py-2.5 rounded-lg text-[13px]" style={{ background: "var(--bg-panel-alt)", border: "1px solid var(--border-subtle)", color: "var(--text-muted)" }}>
                    {account.brokerOrFirm}
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between pt-1">
                <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                  Current balance: <span style={{ color: "var(--text-secondary)" }}>${account.currentBalance.toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
                </span>
                <SaveButton onClick={handleSaveAccount} disabled={acctSaving || !ready}>
                  {acctSaving ? "Saving…" : acctSaved ? "✓ Saved" : "Save Changes"}
                </SaveButton>
              </div>
            </div>
          ) : (
            <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>Loading account…</p>
          )}
        </Panel>

        {/* ── Developer Tools ── */}
        <SectionTitle>Developer Tools</SectionTitle>
        <Panel>
          <PanelHeader label="Developer Tools" />
          <div
            className="flex items-start gap-3 px-4 py-3 rounded-lg mb-4"
            style={{ background: "rgba(251,191,36,0.06)", border: "1px solid rgba(251,191,36,0.2)" }}
          >
            <span className="text-[13px]" style={{ color: "#fbbf24" }}>⚠</span>
            <p className="text-[12px] leading-relaxed" style={{ color: "#fbbf24" }}>
              These actions are irreversible. All trade data will be permanently deleted.
            </p>
          </div>

          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[13px] font-medium" style={{ color: "var(--text-primary)" }}>Clear all trades</div>
                <div className="text-[11px] mt-0.5" style={{ color: "var(--text-muted)" }}>Deletes all trades, journals, and daily stats. Resets balance.</div>
              </div>
              <button
                onClick={handleClearTrades}
                disabled={clearing || !ready}
                className="ml-4 shrink-0 px-4 py-2 rounded-lg text-[12px] font-semibold transition-all disabled:opacity-50"
                style={{
                  background: clearDone ? "rgba(74,222,128,0.1)" : clearConfirm ? "rgba(248,113,113,0.15)" : "var(--bg-panel-alt)",
                  color:      clearDone ? "#4ade80"               : clearConfirm ? "#f87171"                : "var(--text-secondary)",
                  border:     clearDone ? "1px solid rgba(74,222,128,0.3)" : clearConfirm ? "1px solid rgba(248,113,113,0.4)" : "1px solid var(--border-medium)",
                }}
              >
                {clearing ? "Clearing…" : clearDone ? "✓ Cleared" : clearConfirm ? "Confirm — delete all?" : "Clear Trades"}
              </button>
            </div>

            <div style={{ height: 1, background: "var(--border-subtle)" }} />

            <div className="flex items-center justify-between">
              <div>
                <div className="text-[13px] font-medium" style={{ color: "#f87171" }}>Delete account</div>
                <div className="text-[11px] mt-0.5" style={{ color: "var(--text-muted)" }}>Marks account as inactive and clears all data.</div>
              </div>
              <DangerButton onClick={handleDeleteAccount} disabled={!ready || !account}>
                {deleteConfirm ? "Confirm delete?" : "Delete Account"}
              </DangerButton>
            </div>
          </div>
        </Panel>

      </div>
    </div>
  );
}
