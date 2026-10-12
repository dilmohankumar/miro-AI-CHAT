import { useEffect, useRef } from 'react';
import { prefersReducedMotion } from '../hooks.js';

const LINES = 36;

// How tall the wave should be right now (0..1).
function targetAmp(state, t, getLevel, pulseAt) {
  if (state === 'listening') {
    const level = getLevel();
    if (level >= 0) return 0.08 + Math.min(1, level) * 1.1; // real microphone loudness
    const bump = Math.max(0, 1 - (performance.now() - pulseAt.current) / 700); // simulated: swell while speech is being recognised
    return 0.08 + bump * (0.55 + 0.3 * Math.sin(t * 14));
  }
  if (state === 'speaking') return 0.42 + 0.36 * Math.abs(Math.sin(t * 3.3)) * (0.6 + 0.4 * Math.sin(t * 1.7 + 1)) + 0.1 * Math.sin(t * 9.1);
  if (state === 'thinking') return 0.2 + 0.07 * Math.sin(t * 4);
  return 0.012; // paused: almost a flat line
}

// Flowing ribbon of glowing sine lines, drawn on a canvas. It reacts to the voice (listening) and to the reply (speaking).
export default function Wave({ state, getLevel, pulseAt, dark = false }) {
  const canvas = useRef(null);
  const live = useRef({ state, getLevel, dark });
  live.current = { state, getLevel, dark };

  useEffect(() => {
    const el = canvas.current;
    const g = el.getContext('2d');
    let w = 0;
    let h = 0;
    let raf;
    let amp = 0.012;
    let phase = 0;
    let last = performance.now();
    const still = prefersReducedMotion();

    const fit = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = el.clientWidth;
      h = el.clientHeight;
      el.width = Math.max(1, Math.round(w * dpr));
      el.height = Math.max(1, Math.round(h * dpr));
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);

    const frame = (now) => {
      raf = requestAnimationFrame(frame);
      if (document.hidden || !w) return;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const { state: st, getLevel: lv, dark: onDark } = live.current;
      const t = now / 1000;
      amp += (targetAmp(st, t, lv, pulseAt) - amp) * 0.14;
      phase += dt * (st === 'thinking' ? 2.6 : st === 'speaking' ? 1.9 : st === 'paused' ? 0.25 : 1.2);

      g.clearRect(0, 0, w, h);
      g.globalCompositeOperation = onDark ? 'lighter' : 'source-over'; // glow on dark, plain ink on white
      const mid = h / 2;
      const swing = h * 0.5 * amp;
      for (let i = 0; i < LINES; i += 1) {
        const p = i / (LINES - 1);
        const core = 1 - Math.abs(p - 0.5) * 2; // brightest in the middle of the ribbon
        g.strokeStyle = onDark ? `hsla(${208 + p * 62}, 95%, ${58 + p * 12}%, ${0.12 + core * 0.34})` : `hsla(${214 + p * 50}, 88%, ${50 - core * 6}%, ${0.1 + core * 0.3})`;
        g.lineWidth = 1.1;
        g.beginPath();
        for (let x = 0; x <= w; x += 3) {
          const nx = x / w;
          const env = Math.sin(Math.PI * nx) ** 1.6; // tapers to nothing at both edges
          const wob = Math.sin(nx * 7 + phase * 1.6 + p * 2.2) * 0.6 + Math.sin(nx * 13 - phase * 2.3 + p * 3.1) * 0.32 + Math.sin(nx * 3 + phase * 0.9 - p * 1.4) * 0.5;
          const y = mid + env * swing * wob * (0.45 + p * 0.65) + (p - 0.5) * swing * 0.5 * env;
          if (x === 0) g.moveTo(x, y);
          else g.lineTo(x, y);
        }
        g.stroke();
      }
      // bright, glowing centre line
      g.shadowColor = onDark ? 'rgba(125, 180, 255, .95)' : 'rgba(37, 99, 235, .45)';
      g.shadowBlur = onDark ? 14 : 10;
      g.strokeStyle = onDark ? 'rgba(210, 228, 255, .9)' : 'rgba(29, 78, 216, .95)';
      g.lineWidth = 1.8;
      g.beginPath();
      for (let x = 0; x <= w; x += 3) {
        const nx = x / w;
        const env = Math.sin(Math.PI * nx) ** 1.6;
        const y = mid + env * swing * (Math.sin(nx * 7 + phase * 1.6 + 1.1) * 0.6 + Math.sin(nx * 13 - phase * 2.3 + 1.55) * 0.32 + Math.sin(nx * 3 + phase * 0.9 - 0.7) * 0.5) * 0.7;
        if (x === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.stroke();
      g.shadowBlur = 0;
      if (still) cancelAnimationFrame(raf);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [pulseAt]);

  return <canvas ref={canvas} className="h-full w-full" aria-hidden />;
}
