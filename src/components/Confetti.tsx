"use client";

import { useEffect, useRef } from "react";

// 🎉 One-shot confetti drop for celebration-mode briefs. No dependencies:
// a fixed canvas, ~160 pieces over ~5s, then it removes itself. Respects
// prefers-reduced-motion (renders nothing, plays nothing).

// Party-popper jingle via WebAudio (no audio file): three pops + a rising
// sparkle arpeggio. Browsers block autoplay, so if the context starts
// suspended we play on the reader's first tap/scroll/keypress instead.
function playJingle() {
  try {
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    const start = () => {
      const t0 = ctx.currentTime + 0.02;
      const master = ctx.createGain();
      master.gain.value = 0.22;                      // keep it polite
      master.connect(ctx.destination);
      // pops: short filtered noise bursts
      for (let i = 0; i < 3; i++) {
        const dur = 0.09;
        const buf = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let j = 0; j < d.length; j++) d[j] = (Math.random() * 2 - 1) * (1 - j / d.length);
        const src = ctx.createBufferSource(); src.buffer = buf;
        const g = ctx.createGain(); g.gain.value = 0.8;
        src.connect(g); g.connect(master);
        src.start(t0 + i * 0.12);
      }
      // sparkle: rising notes C5 E5 G5 C6 E6
      [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => {
        const o = ctx.createOscillator(); o.type = "triangle"; o.frequency.value = f;
        const g = ctx.createGain();
        const at = t0 + 0.25 + i * 0.09;
        g.gain.setValueAtTime(0, at);
        g.gain.linearRampToValueAtTime(0.5, at + 0.02);
        g.gain.exponentialRampToValueAtTime(0.001, at + 0.5);
        o.connect(g); g.connect(master);
        o.start(at); o.stop(at + 0.55);
      });
      setTimeout(() => ctx.close().catch(() => {}), 2500);
    };
    if (ctx.state === "suspended") {
      const arm = () => { ctx.resume().then(start).catch(() => {}); cleanup(); };
      const cleanup = () => { removeEventListener("pointerdown", arm); removeEventListener("keydown", arm); removeEventListener("scroll", arm); };
      addEventListener("pointerdown", arm, { once: true });
      addEventListener("keydown", arm, { once: true });
      addEventListener("scroll", arm, { once: true, passive: true });
      setTimeout(cleanup, 15000);                    // stop waiting after 15s
    } else start();
  } catch { /* sound is a bonus, never an error */ }
}

export function Confetti() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    playJingle();
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
