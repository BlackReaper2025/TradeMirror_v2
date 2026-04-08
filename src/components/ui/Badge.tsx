import { clsx } from "clsx";

interface BadgeProps {
  label: string;
  color?: "green" | "yellow" | "red" | "blue" | "purple" | "neutral";
  className?: string;
}

const colorMap = {
  green:   { bg: "rgba(34,197,94,0.12)",  text: "#4ade80",  border: "rgba(34,197,94,0.2)"  },
  yellow:  { bg: "rgba(245,158,11,0.12)", text: "#fbbf24",  border: "rgba(245,158,11,0.2)" },
  red:     { bg: "rgba(239,68,68,0.12)",  text: "#f87171",  border: "rgba(239,68,68,0.2)"  },
  blue:    { bg: "rgba(59,130,246,0.12)", text: "#60a5fa",  border: "rgba(59,130,246,0.2)" },
  purple:  { bg: "rgba(139,92,246,0.12)", text: "#a78bfa",  border: "rgba(139,92,246,0.2)" },
  neutral: { bg: "rgba(255,255,255,0.06)", text: "#8899aa", border: "rgba(255,255,255,0.1)" },
};

export function Badge({ label, color = "neutral", className }: BadgeProps) {
  const c = colorMap[color];
  return (
    <span
      className={clsx("inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium", className)}
      style={{ background: c.bg, color: c.text, border: `1px solid ${c.border}` }}
    >
      {label}
    </span>
  );
}
