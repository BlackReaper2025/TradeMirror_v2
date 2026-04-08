// ─── FormField — labelled input wrapper consistent with the design system ─────
import { ReactNode } from "react";

interface FormFieldProps {
  label: string;
  hint?: string;
  required?: boolean;
  children: ReactNode;
  className?: string;
}

export function FormField({ label, hint, required, children, className }: FormFieldProps) {
  return (
    <div className={className}>
      <label className="block mb-1.5">
        <span
          className="text-[11px] font-semibold uppercase tracking-widest"
          style={{ color: "var(--text-secondary)" }}
        >
          {label}
          {required && <span style={{ color: "var(--accent-text)" }}> *</span>}
        </span>
        {hint && (
          <span
            className="ml-2 text-[11px] normal-case tracking-normal"
            style={{ color: "var(--text-muted)" }}
          >
            {hint}
          </span>
        )}
      </label>
      {children}
    </div>
  );
}

// ─── Shared input styles ──────────────────────────────────────────────────────

export const inputClass =
  "w-full px-3 py-2 rounded-lg text-[13px] transition-colors outline-none";

export const inputStyle = {
  background: "var(--bg-panel-alt)",
  border: "1px solid var(--border-medium)",
  color: "var(--text-primary)",
};

export const inputFocusStyle = {
  border: "1px solid var(--accent-border)",
  boxShadow: "0 0 0 2px var(--accent-glow)",
};
