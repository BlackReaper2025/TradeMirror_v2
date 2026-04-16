import React, { useEffect, useRef } from 'react';

/**
 * Animated dot-wave background — Canvas 2D (no Three.js / WebGL).
 * Dot colour tracks the --accent CSS variable (green / yellow / red theme).
 */
export function DottedBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    /* ── Grid config ── */
    const COLS       = 55;
    const ROWS       = 38;
    const DOT_RADIUS = 2.5;

    /* ── Read --accent hex ── */
    const getAccent = () =>
      getComputedStyle(document.documentElement)
        .getPropertyValue('--accent')
        .trim() || '#22c55e';

    let accentColor = getAccent();

    /* ── Resize canvas to fill screen ── */
    const resize = () => {
      canvas.width  = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    /* ── Animation ── */
    let count = 0;
    let rafId: number;

    const draw = () => {
      rafId = requestAnimationFrame(draw);
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const colGap = canvas.width  / (COLS + 1);
      const rowGap = canvas.height / (ROWS + 1);

      /* Glow pass — large soft halo behind each dot */
      ctx.globalAlpha = 0.12;
      ctx.shadowColor  = accentColor;
      ctx.shadowBlur   = 18;
      ctx.fillStyle    = accentColor;

      for (let ix = 0; ix < COLS; ix++) {
        for (let iy = 0; iy < ROWS; iy++) {
          const baseX = (ix + 1) * colGap;
          const baseY = (iy + 1) * rowGap;
          const wave =
            Math.sin((ix + count) * 0.3) * rowGap * 0.18 +
            Math.sin((iy + count) * 0.5) * rowGap * 0.18;
          ctx.beginPath();
          ctx.arc(baseX, baseY + wave, DOT_RADIUS * 3, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      /* Dot pass — crisp solid centre */
      ctx.globalAlpha = 0.55;
      ctx.shadowBlur   = 0;
      ctx.fillStyle    = accentColor;

      for (let ix = 0; ix < COLS; ix++) {
        for (let iy = 0; iy < ROWS; iy++) {
          const baseX = (ix + 1) * colGap;
          const baseY = (iy + 1) * rowGap;
          const wave =
            Math.sin((ix + count) * 0.3) * rowGap * 0.18 +
            Math.sin((iy + count) * 0.5) * rowGap * 0.18;
          ctx.beginPath();
          ctx.arc(baseX, baseY + wave, DOT_RADIUS, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      count += 0.05;
    };

    draw();

    /* ── Update accent colour when theme class changes ── */
    const observer = new MutationObserver(() => {
      accentColor = getAccent();
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });

    return () => {
      cancelAnimationFrame(rafId);
      observer.disconnect();
      window.removeEventListener('resize', resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 0,
        pointerEvents: 'none',
        display: 'block',
      }}
    />
  );
}
