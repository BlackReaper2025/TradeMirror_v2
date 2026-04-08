// ─── TradeForm — stub (filled in Phase 3 step 3) ─────────────────────────────
import type { Account } from "../../db/queries";

interface Props {
  account: Account;
  onClose: () => void;
  onSaved: () => void;
}

export function TradeForm({ onClose }: Props) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.6)" }}
    >
      <div
        className="rounded-2xl p-8 text-center"
        style={{ background: "var(--bg-panel)", border: "1px solid var(--border-subtle)", width: 360 }}
      >
        <div className="text-[14px] font-semibold mb-2" style={{ color: "var(--text-primary)" }}>
          Trade form coming next…
        </div>
        <button
          onClick={onClose}
          className="mt-4 px-4 py-2 rounded-lg text-[12px]"
          style={{ background: "var(--bg-panel-alt)", color: "var(--text-secondary)", border: "1px solid var(--border-medium)" }}
        >
          Close
        </button>
      </div>
    </div>
  );
}
