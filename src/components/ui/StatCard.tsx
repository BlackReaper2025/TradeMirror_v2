import { ReactNode } from "react";
import { clsx } from "clsx";
import { Panel } from "./Panel";

interface StatCardProps {
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;    // highlights value in accent color + applies state glow
  positive?: boolean;
  negative?: boolean;
  icon?: ReactNode;
  className?: string;
}

export function StatCard({ label, value, sub, accent, positive, negative, icon, className }: StatCardProps) {
  const valueColor = accent
    ? "var(--accent-text)"
    : positive
    ? "#4ade80"
    : negative
    ? "#f87171"
    : "var(--text-primary)";

  return (
    <Panel padded={false} className={clsx("flex flex-col justify-between p-4", className)}>
      <div className="flex items-center justify-between gap-1">
        <span
          className="text-[14px] font-semibold uppercase tracking-widest leading-tight"
          style={{ color: "var(--accent-text)" }}
        >
          {label}
        </span>
        {icon && (
          <span className="shrink-0" style={{ color: "var(--text-muted)" }}>
            {icon}
          </span>
        )}
      </div>

      <span
        className="text-[19px] font-bold tabular-nums leading-tight break-all"
        style={{ color: valueColor }}
      >
        {value}
      </span>

      {sub && (
        <span
          className="text-[11px] leading-tight"
          style={{ color: "var(--text-secondary)" }}
        >
          {sub}
        </span>
      )}
    </Panel>
  );
}
