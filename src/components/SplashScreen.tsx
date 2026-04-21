import { useEffect, useState } from "react";

const VERSION = "0.1.0";

export function SplashScreen({ onComplete }: { onComplete: () => void }) {
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    const t1 = setTimeout(() => setExiting(true), 2000);
    const t2 = setTimeout(() => onComplete(), 2700);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [onComplete]);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "#080c12",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        animation: exiting ? "splash-fade-out 0.7s ease forwards" : undefined,
      }}
    >
      {/* Ambient radial glow */}
      <div
        style={{
          position: "absolute",
          width: "600px",
          height: "600px",
          borderRadius: "50%",
          background:
            "radial-gradient(circle, rgba(126,214,46,0.07) 0%, transparent 68%)",
          pointerEvents: "none",
        }}
      />

      {/* Wordmark */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "14px",
          animation: "splash-logo-enter 0.85s cubic-bezier(0.16, 1, 0.3, 1) forwards",
          opacity: 0,
        }}
      >
        <div
          style={{
            fontSize: "44px",
            fontWeight: 600,
            letterSpacing: "0.14em",
            fontFamily:
              "-apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', sans-serif",
          }}
        >
          <span style={{ color: "#dce6f4" }}>TRADE</span>
          <span style={{ color: "#7ed62e" }}>MIRROR</span>
        </div>

        {/* Accent divider line */}
        <div
          style={{
            width: "100%",
            height: "1px",
            background:
              "linear-gradient(to right, transparent, rgba(126,214,46,0.55), transparent)",
            animation: "splash-line-grow 0.75s ease 0.45s forwards",
            transform: "scaleX(0)",
            transformOrigin: "center",
          }}
        />
      </div>

      {/* Version */}
      <div
        style={{
          marginTop: "22px",
          fontSize: "11px",
          letterSpacing: "0.28em",
          textTransform: "uppercase",
          color: "#4a5568",
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', sans-serif",
          animation: "splash-version-enter 0.6s ease 0.85s forwards",
          opacity: 0,
        }}
      >
        v{VERSION}
      </div>
    </div>
  );
}
