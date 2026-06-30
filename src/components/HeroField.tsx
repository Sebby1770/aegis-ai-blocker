import { useEffect, useRef } from "react";
import { rulePack } from "../lib/blocklists";

// Real domains from the rule pack, used as drifting labels in the field. Kept
// short so they read cleanly at small sizes.
const LABELS = Array.from(
  new Set(
    rulePack.categories
      .flatMap((category) => category.services)
      .flatMap((service) => service.domains)
      .filter((domain) => domain.length <= 16),
  ),
);

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  label?: string;
  flash: number;
};

const MONO = '600 11px "SFMono-Regular", ui-monospace, Menlo, monospace';

// Decorative "containment field": AI-domain particles drift toward the centre
// of attention and are deflected at a glowing boundary ring, flashing red as
// they are blocked. Purely cosmetic — it sits behind the hero content, takes no
// pointer events, and renders a single settled frame under reduced motion.
export function HeroField() {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    const parent = canvas?.parentElement;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !parent || !ctx) {
      return;
    }

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rand = (a: number, b: number) => a + Math.random() * (b - a);

    let w = 0;
    let h = 0;
    let cx = 0;
    let cy = 0;
    let radius = 0;
    let parts: Particle[] = [];
    const pulses: { x: number; y: number; t: number }[] = [];
    const mouse = { x: -9999, y: -9999 };
    let raf = 0;
    let running = false;

    const spawn = (): Particle => {
      // Seed a position, then re-roll while it lands inside the protected ring
      // (capped so a small viewport can't loop forever). The initial values are
      // read by the while condition, so nothing is assigned uselessly.
      let x = rand(0, w);
      let y = rand(0, h);
      let guard = 0;
      while (Math.hypot(x - cx, y - cy) < radius + 24 && guard < 12) {
        x = rand(0, w);
        y = rand(0, h);
        guard += 1;
      }
      const angle = Math.atan2(cy - y, cx - x) + rand(-0.5, 0.5);
      const speed = rand(0.12, 0.5);
      return { x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, r: rand(1.3, 2.7), flash: 0 };
    };

    const init = () => {
      const count = Math.round(Math.min(42, Math.max(16, w / 42)));
      parts = Array.from({ length: count }, spawn);
      const labelled = Math.min(9, parts.length, LABELS.length);
      for (let i = 0; i < labelled; i += 1) {
        const p = parts[i];
        if (p) {
          p.label = LABELS[(Math.random() * LABELS.length) | 0];
        }
      }
    };

    const step = () => {
      for (const p of parts) {
        const mdx = p.x - mouse.x;
        const mdy = p.y - mouse.y;
        const md = Math.hypot(mdx, mdy);
        if (md < 130 && md > 0.001) {
          const force = ((130 - md) / 130) * 0.7;
          p.vx += (mdx / md) * force;
          p.vy += (mdy / md) * force;
        }

        p.x += p.vx;
        p.y += p.vy;
        p.vx = p.vx * 0.99 + rand(-0.02, 0.02);
        p.vy = p.vy * 0.99 + rand(-0.02, 0.02);

        const dx = p.x - cx;
        const dy = p.y - cy;
        const d = Math.hypot(dx, dy) || 1;
        if (d < radius) {
          const nx = dx / d;
          const ny = dy / d;
          const dot = p.vx * nx + p.vy * ny;
          p.vx = (p.vx - 2 * dot * nx) * 0.55 + nx * 0.7;
          p.vy = (p.vy - 2 * dot * ny) * 0.55 + ny * 0.7;
          p.x = cx + nx * (radius + 1);
          p.y = cy + ny * (radius + 1);
          p.flash = 1;
          pulses.push({ x: p.x, y: p.y, t: 0 });
          if (pulses.length > 22) {
            pulses.shift();
          }
        }

        if (p.x < -50 || p.x > w + 50 || p.y < -50 || p.y > h + 50) {
          const s = spawn();
          p.x = s.x;
          p.y = s.y;
          p.vx = s.vx;
          p.vy = s.vy;
        }

        if (p.flash > 0) {
          p.flash -= 0.018;
        }
      }
    };

    const draw = () => {
      ctx.clearRect(0, 0, w, h);

      // Constellation links between nearby particles.
      for (let i = 0; i < parts.length; i += 1) {
        const a = parts[i]!;
        for (let j = i + 1; j < parts.length; j += 1) {
          const b = parts[j]!;
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const dd = dx * dx + dy * dy;
          if (dd < 125 * 125) {
            const alpha = (1 - Math.sqrt(dd) / 125) * 0.16;
            ctx.strokeStyle = `rgba(120,190,180,${alpha})`;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
        }
      }

      // The boundary ring — your protected zone.
      ctx.save();
      const grad = ctx.createLinearGradient(cx - radius, cy - radius, cx + radius, cy + radius);
      grad.addColorStop(0, "rgba(20,184,166,0.9)");
      grad.addColorStop(1, "rgba(56,189,248,0.65)");
      ctx.strokeStyle = grad;
      ctx.lineWidth = 1.5;
      ctx.shadowColor = "rgba(20,184,166,0.55)";
      ctx.shadowBlur = 22;
      ctx.setLineDash([2, 8]);
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      // Deflection pulses.
      for (let i = pulses.length - 1; i >= 0; i -= 1) {
        const pu = pulses[i]!;
        const alpha = Math.max(0, 0.5 - pu.t * 0.013);
        ctx.strokeStyle = `rgba(255,110,110,${alpha})`;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.arc(pu.x, pu.y, 6 + pu.t * 1.4, 0, Math.PI * 2);
        ctx.stroke();
        pu.t += 1;
        if (pu.t > 40) {
          pulses.splice(i, 1);
        }
      }

      // Particles + their domain labels.
      ctx.font = MONO;
      for (const p of parts) {
        const hot = p.flash > 0;
        ctx.fillStyle = hot ? `rgba(255,120,120,${0.6 + p.flash * 0.4})` : "rgba(178,216,209,0.7)";
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
        if (p.label) {
          ctx.fillStyle = hot ? "rgba(255,150,150,0.92)" : "rgba(150,201,193,0.42)";
          ctx.fillText(p.label, p.x + 7, p.y - 6);
        }
      }
    };

    const resize = () => {
      // CSS (inset:0; width/height:100%) sizes the element to fill the hero;
      // here we only match the backing store to that laid-out box. Measuring the
      // canvas's own client box avoids feedback loops and bad parent reads.
      const nextW = canvas.clientWidth;
      const nextH = canvas.clientHeight;
      if (nextW < 2 || nextH < 2 || (nextW === w && nextH === h)) {
        return;
      }
      w = nextW;
      h = nextH;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cx = w * 0.5;
      cy = h * 0.46;
      radius = Math.max(140, Math.min(Math.min(w, h) * 0.34, 300));
      init();
      if (reduce) {
        for (let i = 0; i < 280; i += 1) {
          step();
        }
        draw();
      }
    };

    const loop = () => {
      if (!running) {
        return;
      }
      step();
      draw();
      raf = requestAnimationFrame(loop);
    };

    const onMove = (event: PointerEvent) => {
      const rect = parent.getBoundingClientRect();
      mouse.x = event.clientX - rect.left;
      mouse.y = event.clientY - rect.top;
    };
    const onLeave = () => {
      mouse.x = -9999;
      mouse.y = -9999;
    };
    const onVisibility = () => {
      if (document.hidden) {
        running = false;
        cancelAnimationFrame(raf);
      } else if (!reduce && !running) {
        running = true;
        loop();
      }
    };

    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    resize();

    if (!reduce) {
      running = true;
      parent.addEventListener("pointermove", onMove);
      parent.addEventListener("pointerleave", onLeave);
      document.addEventListener("visibilitychange", onVisibility);
      loop();
    }

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
      parent.removeEventListener("pointermove", onMove);
      parent.removeEventListener("pointerleave", onLeave);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return <canvas ref={ref} className="hero-field" aria-hidden="true" />;
}
