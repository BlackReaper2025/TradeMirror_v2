// ─── FormField — labelled input wrapper consistent with the design system ─────
import { ReactNode } from "react";

interface FormFieldProps {
  label: string;
  hint?: string;
  required?: boolean;
  labelRight?: ReactNode;
  boldLabel?: boolean;
  centerLabel?: boolean;
  labelSize?: number;
  children: ReactNode;
  className?: string;
}

export function FormField({ label, hint, required, labelRight, boldLabel = true, centerLabel = true, labelSize = 11, children, className }: FormFieldProps) {
  const justify = labelRight ? "justify-between" : centerLabel ? "justify-center" : "justify-start";
  return (
    <div className={className}>
      <div className={`flex items-center mb-1 ${justify}`}>
        <span
          className={`uppercase tracking-widest ${boldLabel ? "font-semibold" : "font-normal"}`}
          style={{ color: "var(--text-secondary)", fontSize: labelSize }}
        >
          {label}
          {required && <span style={{ color: "var(--accent-text)" }}> *</span>}
          {hint && (
            <span
              className="ml-2 text-[11px] normal-case tracking-normal"
              style={{ color: "var(--text-muted)" }}
            >
              {hint}
            </span>
          )}
        </span>
        {labelRight && <div style={{ marginRight: 24 }}>{labelRight}</div>}
      </div>
      {children}
    </div>
  );
}

// ─── Shared input styles ──────────────────────────────────────────────────────

export const inputClass =
  "w-full px-3 py-1.5 rounded-lg text-[13px] transition-colors outline-none";

export const inputStyle = {
  background: "var(--bg-panel-alt)",
  border: "1px solid var(--border-medium)",
  color: "var(--text-primary)",
};

export const inputFocusStyle = {
  border: "1px solid var(--accent-border)",
  boxShadow: "0 0 0 2px var(--accent-glow)",
};
