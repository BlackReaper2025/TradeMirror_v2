import { ReactNode } from "react";
import { clsx } from "clsx";
import { Panel } from "./Panel";

interface StatCardProps {
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;    // highlights value in accent color
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
    <Panel className={clsx("flex flex-col gap-1", className)}>
      <div className="flex items-center justify-between">
        <span
          className="text-[11px] font-semibold uppercase tracking-widest"
          style={{ color: "var(--text-secondary)" }}
        >
          {label}
        </span>
        {icon && (
          <span style={{ color: "var(--text-muted)" }}>
            {icon}
          </span>
        )}
      </div>

      <span
        className="text-2xl font-bold tabular-nums leading-tight mt-1"
        style={{ color: valueColor }}
      >
        {value}
      </span>

      {sub && (
        <span
          className="text-[12px]"
          style={{ color: "var(--text-secondary)" }}
        >
          {sub}
        </span>
      )}
    </Panel>
  );
}
