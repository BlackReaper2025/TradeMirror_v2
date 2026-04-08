import { ReactNode, CSSProperties } from "react";
import { clsx } from "clsx";

interface PanelProps {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  glow?: boolean;       // adds accent-colored glow
  padded?: boolean;     // default true
  onClick?: () => void;
}

/**
 * Base glass panel — the fundamental building block for all dashboard cards.
 * All colors come from CSS custom properties so the dynamic theme works automatically.
 */
export function Panel({ children, className, style, glow = false, padded = true, onClick }: PanelProps) {
  return (
    <div
      onClick={onClick}
      className={clsx(
        "panel relative overflow-hidden",
        padded && "p-5",
        onClick && "cursor-pointer transition-colors hover:border-[var(--border-medium)]",
        glow && "panel-glow",
        className
      )}
      style={style}
    >
      {children}
    </div>
  );
}

interface PanelHeaderProps {
  label: string;
  children?: ReactNode;
}

export function PanelHeader({ label, children }: PanelHeaderProps) {
  return (
    <div className="flex items-center justify-between mb-4">
      <span
        className="text-[11px] font-semibold uppercase tracking-widest"
        style={{ color: "var(--text-secondary)" }}
      >
        {label}
      </span>
      {children}
    </div>
  );
}
