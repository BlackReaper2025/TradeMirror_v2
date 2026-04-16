export function RadialGlowBackground() {
  return (
    <div
      className="absolute inset-0 pointer-events-none"
      style={{
        zIndex: 0,
        backgroundImage: [
          /* top-centre — primary bloom */
          "radial-gradient(circle 900px at 50% -15%,   var(--accent-dim)  0%, var(--accent-glow) 40%, transparent 70%)",
          /* bottom-left — soft secondary */
          "radial-gradient(circle 600px at 10% 100%, var(--accent-glow) 0%, transparent 65%)",
          /* bottom-right — soft secondary */
          "radial-gradient(circle 500px at 90% 90%,  var(--accent-glow) 0%, transparent 65%)",
          /* centre — very faint ambient tint */
          "radial-gradient(circle 700px at 50% 75%,  color-mix(in srgb, var(--accent-glow) 50%, transparent) 0%, transparent 70%)",
        ].join(", "),
      }}
    />
  );
}
