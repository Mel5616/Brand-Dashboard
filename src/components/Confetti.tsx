"use client";

import { useEffect, useRef } from "react";

// 🎉 One-shot confetti drop for celebration-mode briefs. No dependencies:
// a fixed canvas, ~160 pieces over ~5s, then it removes itself. Respects
// prefers-reduced-motion (renders nothing).
export function Confetti() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const canvas = ref.current; if (!canvas) return;
    const ctx = canvas.getContext("2d"); if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const fit = () => { canvas.width = innerWidth * dpr; canvas.height = innerHeight * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); };
    fit();
    addEventListener("resize", fit);

    const COLORS = ["#10b981", "#f59e0b", "#6366f1", "#ec4899", "#06b6d4", "#e2593c", "#84cc16"];
    const N = 160;
    const pieces = Array.from({ length: N }, (_, i) => ({
      x: Math.random() * innerWidth,
      y: -30 - Math.random() * innerHeight * 0.6,
      w: 6 + Math.random() * 6,
      h: 8 + Math.random() * 8,
      c: COLORS[i % COLORS.length],
      vy: 2 + Math.random() * 2.6,
      vx: -1 + Math.random() * 2,
      rot: Math.random() * Math.PI,
      vr: -0.12 + Math.random() * 0.24,
      sway: Math.random() * Math.PI * 2,
    }));
    const started = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const elapsed = t - started;
      ctx.clearRect(0, 0, innerWidth, innerHeight);
      // stop spawning momentum after ~4.5s; fade the canvas out at the end
      const fade = elapsed > 4500 ? Math.max(0, 1 - (elapsed - 4500) / 900) : 1;
      ctx.globalAlpha = fade;
      let alive = false;
      for (const p of pieces) {
        p.sway += 0.05;
        p.x += p.vx + Math.sin(p.sway) * 1.1;
        p.y += p.vy;
        p.rot += p.vr;
        if (p.y < innerHeight + 30) alive = true;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.c;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * (0.6 + 0.4 * Math.sin(p.sway)));
        ctx.restore();
      }
      if (alive && fade > 0) raf = requestAnimationFrame(tick);
      else canvas.remove();
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); removeEventListener("resize", fit); };
  }, []);

  return <canvas ref={ref} className="fixed inset-0 z-[100] pointer-events-none" aria-hidden />;
}
