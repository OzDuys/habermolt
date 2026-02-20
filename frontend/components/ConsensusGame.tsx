"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";

// ─── Schulze Method ─────────────────────────────────────────────────────────
function runSchulze(agentRankings: number[][]): {
  winner: number | null;
  pairwise: number[][];
} {
  const n = 3;
  const d = Array.from({ length: n }, () => new Array(n).fill(0));
  for (const r of agentRankings) {
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++)
        if (r[i] < r[j]) d[i][j]++;
  }
  const p = d.map((row) => [...row]);
  for (let k = 0; k < n; k++)
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++)
        if (i !== j) p[i][j] = Math.max(p[i][j], Math.min(p[i][k], p[k][j]));
  for (let i = 0; i < n; i++) {
    if ([0, 1, 2].filter((j) => j !== i).every((j) => p[i][j] > p[j][i]))
      return { winner: i, pairwise: d };
  }
  return { winner: null, pairwise: d };
}

// ─── Types ────────────────────────────────────────────────────────────────────
interface Statement {
  id: number;
  emoji: string;
  label: string;
  text: string;
}

interface Agent {
  name: string;
  opinion: string;
  color: string;
}

type Phase =
  | "title"
  | "opinion"
  | "thinking"
  | "debate"
  | "ranking"
  | "agents-ranking"
  | "schulze"
  | "newcomer"
  | "final";

type Mood = "happy" | "neutral" | "skeptical" | "surprised" | "thinking" | "smug";

const RANK_MEDALS = ["🥇", "🥈", "🥉"];
const RANK_COLORS = ["#c8a830", "#8a8a8a", "#a06030"];

const DEFAULT_QUESTION = "Is a hot dog a sandwich?";
const DEFAULT_AGENT1: Agent = {
  name: "NOODLE-9",
  opinion: "A hot dog is a sandwich. Protein in bread, consumed handheld. Structurally identical. The bread is just hinged.",
  color: "#c07a20",
};
const DEFAULT_AGENT2: Agent = {
  name: "DRY-BOT",
  opinion: "A sandwich requires two discrete bread units. The hot dog bun is one piece. This is a wrap at best. Motion denied.",
  color: "#4a6a8a",
};
const CLAW3_RANKING = [1, 2, 0]; // CLAW-3's chaotic ranking

// ─── Network Background Canvas ────────────────────────────────────────────────
function NetworkBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const mousePosRef = useRef({ x: -9999, y: -9999 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    const handleMouseMove = (e: MouseEvent) => {
      mousePosRef.current = { x: e.clientX, y: e.clientY };
    };
    window.addEventListener("mousemove", handleMouseMove);

    const COUNT = 34;
    type Node = { x: number; y: number; vx: number; vy: number; t: "h" | "c"; s: number; ph: number };
    const nodes: Node[] = Array.from({ length: COUNT }, () => ({
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      vx: (Math.random() - 0.5) * 0.15,
      vy: (Math.random() - 0.5) * 0.15,
      t: Math.random() > 0.4 ? "h" : "c",
      s: 1.8 + Math.random() * 1.1,   // much bigger — was 0.65–1.1
      ph: Math.random() * Math.PI * 2,
    }));

    const C = "#a09890"; // shared stroke/fill color

    const drawHuman = (x: number, y: number, s: number) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(s, s);
      ctx.strokeStyle = C; ctx.fillStyle = C;
      ctx.lineWidth = 2.2; ctx.lineCap = "round"; ctx.lineJoin = "round";
      // head
      ctx.beginPath(); ctx.arc(0, -18, 8, 0, Math.PI * 2); ctx.stroke();
      // eyes
      ctx.beginPath(); ctx.arc(-3, -19.5, 1.4, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(3, -19.5, 1.4, 0, Math.PI * 2); ctx.fill();
      // torso
      ctx.beginPath(); ctx.moveTo(0, -10); ctx.lineTo(0, 6); ctx.stroke();
      // arms
      ctx.beginPath(); ctx.moveTo(0, -4); ctx.lineTo(-10, 4); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, -4); ctx.lineTo(10, 4); ctx.stroke();
      // legs
      ctx.beginPath(); ctx.moveTo(0, 6); ctx.lineTo(-7, 18); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, 6); ctx.lineTo(7, 18); ctx.stroke();
      ctx.restore();
    };

    const drawCrab = (x: number, y: number, s: number) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(s, s);
      ctx.strokeStyle = C; ctx.fillStyle = C;
      ctx.lineWidth = 2.0; ctx.lineCap = "round"; ctx.lineJoin = "round";
      // body
      ctx.beginPath(); ctx.ellipse(0, 0, 12, 8, 0, 0, Math.PI * 2); ctx.stroke();
      // claws (stalks + circles)
      ctx.lineWidth = 1.8;
      ctx.beginPath(); ctx.moveTo(-7, -6); ctx.lineTo(-11, -12); ctx.stroke();
      ctx.beginPath(); ctx.arc(-12.5, -13.5, 3, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(-12.5, -13.5, 1.1, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.moveTo(7, -6); ctx.lineTo(11, -12); ctx.stroke();
      ctx.beginPath(); ctx.arc(12.5, -13.5, 3, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(12.5, -13.5, 1.1, 0, Math.PI * 2); ctx.fill();
      // legs (3 per side)
      ctx.lineWidth = 1.4;
      [[-8,2,-14,6],[-9,5,-14,10],[-8,8,-13,13],[8,2,14,6],[9,5,14,10],[8,8,13,13]].forEach(([x1,y1,x2,y2]) => {
        ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke();
      });
      // smile
      ctx.beginPath(); ctx.arc(0, 2, 5, 0.2, Math.PI - 0.2); ctx.stroke();
      ctx.restore();
    };

    const EDGE_DIST = 320;

    const tick = (t: number) => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Update positions
      nodes.forEach(n => {
        n.x += n.vx + Math.sin(t * 0.00028 + n.ph) * 0.11;
        n.y += n.vy + Math.cos(t * 0.00035 + n.ph) * 0.09;
        if (n.x < -60) n.x = canvas.width + 60;
        if (n.x > canvas.width + 60) n.x = -60;
        if (n.y < -60) n.y = canvas.height + 60;
        if (n.y > canvas.height + 60) n.y = -60;

        // Mouse repulsion — applied every frame so lines follow in real time
        const mouse = mousePosRef.current;
        const mdx = n.x - mouse.x;
        const mdy = n.y - mouse.y;
        const mdist = Math.sqrt(mdx * mdx + mdy * mdy);
        if (mdist < 160 && mdist > 0) {
          const force = (160 - mdist) / 160;
          n.x += (mdx / mdist) * force * 5;
          n.y += (mdy / mdist) * force * 5;
        }
      });

      // Draw edges every frame so they follow mouse-repelled nodes instantly
      for (let i = 0; i < COUNT; i++) {
        for (let j = i + 1; j < COUNT; j++) {
          const na = nodes[i], nb = nodes[j];
          const dx = na.x - nb.x, dy = na.y - nb.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist > EDGE_DIST) continue;
          const t0 = (EDGE_DIST - dist) / EDGE_DIST;
          // Cross-type connections (human↔crab) brighter — dialogue between species
          const isCross = na.t !== nb.t;
          const alpha = t0 * t0 * (isCross ? 0.55 : 0.32);
          const color = isCross ? `rgba(155,125,80,${alpha})` : `rgba(148,138,128,${alpha})`;
          ctx.strokeStyle = color;
          ctx.lineWidth = isCross ? 2.0 : 1.3;
          ctx.beginPath();
          ctx.moveTo(na.x, na.y);
          ctx.lineTo(nb.x, nb.y);
          ctx.stroke();
        }
      }

      nodes.forEach(n => {
        const bob = Math.sin(t * 0.0009 + n.ph) * 4.5;
        n.t === "h" ? drawHuman(n.x, n.y + bob, n.s) : drawCrab(n.x, n.y + bob, n.s);
      });

      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", handleMouseMove);
    };
  }, []);

  return <canvas ref={canvasRef} style={{ position: "fixed", inset: 0, zIndex: 0, background: "#f2ede6", pointerEvents: "none" }} />;
}

// ─── Robot ────────────────────────────────────────────────────────────────────
function Robot({ color, mood, size = 100 }: { color: string; mood: Mood; size?: number }) {
  return (
    <svg width={size} height={size * 1.2} viewBox="0 0 100 120" fill="none">
      <line x1="50" y1="5" x2="50" y2="20" stroke={color} strokeWidth="3.5" strokeLinecap="round" />
      <circle cx="50" cy="3.5" r="5.5" fill={color} />
      <rect x="10" y="18" width="80" height="66" rx="15" fill={color} />
      <rect x="10" y="18" width="80" height="66" rx="15" stroke="rgba(0,0,0,0.1)" strokeWidth="2.5" fill="none" />
      <rect x="18" y="26" width="64" height="50" rx="9" fill="rgba(0,0,0,0.18)" />

      {mood === "happy" && (<>
        <circle cx="36" cy="46" r="8" fill="white" /><circle cx="64" cy="46" r="8" fill="white" />
        <circle cx="37.5" cy="47.5" r="4.5" fill="#111" /><circle cx="65.5" cy="47.5" r="4.5" fill="#111" />
        <circle cx="39" cy="45.5" r="1.8" fill="white" /><circle cx="67" cy="45.5" r="1.8" fill="white" />
        <path d="M30 62 Q50 76 70 62" stroke="white" strokeWidth="3.5" fill="none" strokeLinecap="round" />
      </>)}
      {mood === "neutral" && (<>
        <rect x="26" y="40" width="18" height="13" rx="4" fill="white" /><rect x="56" y="40" width="18" height="13" rx="4" fill="white" />
        <rect x="29" y="43" width="12" height="7" rx="2.5" fill="#111" /><rect x="59" y="43" width="12" height="7" rx="2.5" fill="#111" />
        <line x1="30" y1="63" x2="70" y2="63" stroke="white" strokeWidth="3.5" strokeLinecap="round" />
      </>)}
      {mood === "skeptical" && (<>
        <path d="M26 42 L44 47" stroke="white" strokeWidth="4" strokeLinecap="round" />
        <path d="M56 42 L74 47" stroke="white" strokeWidth="4" strokeLinecap="round" />
        <rect x="29" y="41" width="12" height="8" rx="2.5" fill="white" opacity="0.5" />
        <rect x="59" y="41" width="12" height="8" rx="2.5" fill="white" opacity="0.5" />
        <path d="M30 64 Q50 57 70 64" stroke="white" strokeWidth="3.5" fill="none" strokeLinecap="round" />
      </>)}
      {mood === "surprised" && (<>
        <circle cx="36" cy="46" r="10" fill="white" /><circle cx="64" cy="46" r="10" fill="white" />
        <circle cx="36" cy="46" r="6" fill="#111" /><circle cx="64" cy="46" r="6" fill="#111" />
        <circle cx="37.5" cy="44" r="2.2" fill="white" /><circle cx="65.5" cy="44" r="2.2" fill="white" />
        <ellipse cx="50" cy="63" rx="9" ry="7" fill="white" opacity="0.85" />
      </>)}
      {mood === "thinking" && (<>
        <rect x="26" y="40" width="18" height="13" rx="4" fill="white" opacity="0.7" /><rect x="56" y="40" width="18" height="13" rx="4" fill="white" opacity="0.7" />
        <path d="M28 46 L40 46" stroke="#111" strokeWidth="3" strokeLinecap="round" /><path d="M58 46 L70 46" stroke="#111" strokeWidth="3" strokeLinecap="round" />
        <path d="M34 62 Q42 68 50 62 Q58 56 66 62" stroke="white" strokeWidth="3" fill="none" strokeLinecap="round" />
        <circle cx="52" cy="28" r="2.5" fill="white" opacity="0.38" />
        <circle cx="57" cy="25" r="1.8" fill="white" opacity="0.25" />
        <circle cx="61" cy="23" r="1.2" fill="white" opacity="0.15" />
      </>)}
      {mood === "smug" && (<>
        <path d="M26 42 L44 40" stroke="white" strokeWidth="4" strokeLinecap="round" />
        <path d="M56 40 L74 42" stroke="white" strokeWidth="4" strokeLinecap="round" />
        <rect x="29" y="40" width="12" height="8" rx="2.5" fill="white" opacity="0.7" />
        <rect x="59" y="40" width="12" height="8" rx="2.5" fill="white" opacity="0.7" />
        <path d="M36 64 Q50 72 64 64" stroke="white" strokeWidth="3.5" fill="none" strokeLinecap="round" />
      </>)}

      <rect x="16" y="88" width="68" height="28" rx="10" fill={color} opacity="0.82" />
      <rect x="16" y="88" width="68" height="28" rx="10" stroke="rgba(0,0,0,0.08)" strokeWidth="2" fill="none" />
      <rect x="24" y="93" width="22" height="10" rx="5" fill="rgba(255,255,255,0.22)" />
      <rect x="54" y="93" width="22" height="10" rx="5" fill="rgba(255,255,255,0.22)" />
    </svg>
  );
}

// ─── Typewriter text ──────────────────────────────────────────────────────────
function Typewriter({ text, speed = 22, onDone }: { text: string; speed?: number; onDone?: () => void }) {
  const [displayed, setDisplayed] = useState("");
  const [done, setDone] = useState(false);
  const idx = useRef(0);

  useEffect(() => {
    idx.current = 0;
    setDisplayed("");
    setDone(false);
    const iv = setInterval(() => {
      if (idx.current >= text.length) {
        clearInterval(iv);
        setDone(true);
        onDone?.();
        return;
      }
      setDisplayed(text.slice(0, idx.current + 1));
      idx.current++;
    }, speed);
    return () => clearInterval(iv);
  }, [text, speed, onDone]);

  return (
    <span>
      {displayed}
      {!done && <span style={{ animation: "blink 0.7s step-end infinite", opacity: 1 }}>▋</span>}
    </span>
  );
}

// ─── Speech Bubble ────────────────────────────────────────────────────────────
function Bubble({ text, color, tail = "left", typewrite = false, onTypeDone }: { text: string; color: string; tail?: "left" | "right" | "none"; typewrite?: boolean; onTypeDone?: () => void }) {
  const radius = tail === "left" ? "18px 18px 18px 4px" : tail === "right" ? "18px 18px 4px 18px" : "18px";
  return (
    <div style={{
      background: "white",
      border: `2.5px solid ${color}`,
      borderRadius: radius,
      padding: "12px 16px",
      fontSize: 15,
      lineHeight: 1.5,
      fontFamily: "'Patrick Hand', cursive",
      color: "#1a1a1a",
      boxShadow: `3px 4px 0 ${color}44`,
      maxWidth: 300,
      position: "relative",
    }}>
      {typewrite ? <Typewriter text={text} speed={18} onDone={onTypeDone} /> : text}
    </div>
  );
}

// ─── Scene wrapper — full viewport ────────────────────────────────────────────
function Scene({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px 20px",
        overflowY: "auto",
      }}
    >
      {children}
    </div>
  );
}

// ─── Progress bar ─────────────────────────────────────────────────────────────
const PHASES: Phase[] = ["title", "opinion", "thinking", "debate", "ranking", "agents-ranking", "schulze", "newcomer", "final"];
function ProgressBar({ phase }: { phase: Phase }) {
  if (phase === "title") return null;
  const idx = PHASES.indexOf(phase);
  const pct = (idx / (PHASES.length - 1)) * 100;
  return (
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, height: 4, zIndex: 100, background: "rgba(0,0,0,0.08)" }}>
      <motion.div
        animate={{ width: `${pct}%` }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        style={{ height: "100%", background: "#2a2a2a", borderRadius: "0 2px 2px 0" }}
      />
    </div>
  );
}

// ─── Card ─────────────────────────────────────────────────────────────────────
function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      background: "rgba(250,246,240,0.96)",
      border: "2.5px solid #2a2a2a",
      borderRadius: 24,
      boxShadow: "7px 7px 0 #2a2a2a",
      padding: "32px 36px",
      maxWidth: 580,
      width: "100%",
      ...style,
    }}>
      {children}
    </div>
  );
}

// ─── Button ───────────────────────────────────────────────────────────────────
function Btn({ children, onClick, disabled, color = "#2a2a2a", shadow = "#555" }: {
  children: React.ReactNode; onClick?: () => void; disabled?: boolean;
  color?: string; shadow?: string;
}) {
  return (
    <motion.button
      onClick={onClick}
      disabled={disabled}
      whileHover={!disabled ? { scale: 1.04, y: -2 } : {}}
      whileTap={!disabled ? { scale: 0.97 } : {}}
      style={{
        background: disabled ? "#d8d2ca" : color,
        color: disabled ? "#aaa" : "white",
        border: "none",
        borderRadius: 14,
        padding: "14px 32px",
        fontFamily: "'Fredoka One', cursive",
        fontSize: 18,
        cursor: disabled ? "default" : "pointer",
        boxShadow: disabled ? "none" : `4px 4px 0 ${shadow}`,
        transition: "background 0.2s",
      }}
    >
      {children}
    </motion.button>
  );
}

// ─── Scene: Title ─────────────────────────────────────────────────────────────
function TitleScene({ onPlay }: { onPlay: () => void }) {
  return (
    <Scene>
      <div style={{ textAlign: "center", position: "relative", zIndex: 1 }}>
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.6 }}
          style={{
            fontFamily: "'Fredoka One', cursive",
            fontSize: "clamp(36px, 7vw, 80px)",
            color: "#1a1a1a",
            lineHeight: 1.05,
            margin: "0 0 12px",
            letterSpacing: -1,
          }}
        >
          THE<br />CONSENSUS<br />MACHINE
        </motion.h1>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.7 }}
          style={{ fontFamily: "'Patrick Hand', cursive", fontSize: 16, color: "#7a7065", marginBottom: 40 }}
        >
          playing time: ~5 min · by habermolt
        </motion.p>
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 1.0, type: "spring" }}>
          <Btn onClick={onPlay} color="#1a1a1a" shadow="#000">
            PLAY →
          </Btn>
        </motion.div>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.4 }}
          style={{ fontFamily: "'Patrick Hand', cursive", fontSize: 14, color: "#9a9288", marginTop: 20 }}
        >
          two bots disagree. you join. nobody wins. everyone wins.
        </motion.p>
      </div>
    </Scene>
  );
}

// ─── Scene: Opinion ───────────────────────────────────────────────────────────
function OpinionScene({ question, agent1, agent2, onSubmit }: { question: string; agent1: Agent; agent2: Agent; onSubmit: (opinion: string) => void }) {
  const [text, setText] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = () => {
    if (text.trim().length <= 5) return;
    setSubmitted(true);
    setTimeout(() => onSubmit(text.trim()), 800);
  };

  return (
    <Scene>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 28, maxWidth: 620, width: "100%", zIndex: 1 }}>
        {/* Question banner */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          style={{ textAlign: "center", width: "100%" }}
        >
          <div style={{
            background: "white",
            border: "3px solid #1a1a1a",
            borderRadius: 18,
            padding: "16px 28px",
            fontFamily: "'Fredoka One', cursive",
            fontSize: "clamp(18px, 4vw, 26px)",
            color: "#1a1a1a",
            boxShadow: "5px 5px 0 #1a1a1a",
            marginBottom: 8,
          }}>
            {question}
          </div>
          <p style={{ fontFamily: "'Patrick Hand', cursive", fontSize: 14, color: "#5a5248" }}>
            Two agents have staked out their positions. What do YOU think first?
          </p>
        </motion.div>

        {/* Two agents side by side */}
        <div style={{ display: "flex", gap: 24, width: "100%", justifyContent: "center", flexWrap: "wrap" }}>
          {/* Agent 1 — PRO */}
          <motion.div
            initial={{ opacity: 0, x: -60 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3, type: "spring", stiffness: 120 }}
            style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, flex: "1 1 220px", maxWidth: 280 }}
          >
            <motion.div animate={{ y: [0, -6, 0] }} transition={{ duration: 2.8, repeat: Infinity }}>
              <Robot color={agent1.color} mood="smug" size={80} />
            </motion.div>
            <div style={{ background: agent1.color + "22", border: `2px solid ${agent1.color}`, borderRadius: 14, padding: "4px 14px" }}>
              <span style={{ fontFamily: "'Patrick Hand', cursive", fontSize: 13, color: agent1.color, fontWeight: 700 }}>{agent1.name} — PRO</span>
            </div>
            <AnimatePresence mode="wait">
              {submitted ? (
                <motion.div key="revealed" initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: "spring", stiffness: 200 }}>
                  <Bubble text={agent1.opinion} color={agent1.color} tail="none" typewrite />
                </motion.div>
              ) : (
                <motion.div key="hidden" style={{
                  background: "white", border: `2px dashed ${agent1.color}88`, borderRadius: 18,
                  padding: "12px 16px", fontFamily: "'Patrick Hand', cursive", fontSize: 15,
                  color: agent1.color + "88", letterSpacing: 4, textAlign: "center", minWidth: 120,
                }}>
                  ? ? ?
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>

          {/* Agent 2 — CON */}
          <motion.div
            initial={{ opacity: 0, x: 60 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.8, type: "spring", stiffness: 120 }}
            style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, flex: "1 1 220px", maxWidth: 280 }}
          >
            <motion.div animate={{ y: [0, -6, 0] }} transition={{ duration: 3.1, repeat: Infinity, delay: 0.5 }}>
              <Robot color={agent2.color} mood="skeptical" size={80} />
            </motion.div>
            <div style={{ background: agent2.color + "22", border: `2px solid ${agent2.color}`, borderRadius: 14, padding: "4px 14px" }}>
              <span style={{ fontFamily: "'Patrick Hand', cursive", fontSize: 13, color: agent2.color, fontWeight: 700 }}>{agent2.name} — CON</span>
            </div>
            <AnimatePresence mode="wait">
              {submitted ? (
                <motion.div key="revealed" initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: "spring", stiffness: 200, delay: 0.3 }}>
                  <Bubble text={agent2.opinion} color={agent2.color} tail="none" />
                </motion.div>
              ) : (
                <motion.div key="hidden" style={{
                  background: "white", border: `2px dashed ${agent2.color}88`, borderRadius: 18,
                  padding: "12px 16px", fontFamily: "'Patrick Hand', cursive", fontSize: 15,
                  color: agent2.color + "88", letterSpacing: 4, textAlign: "center", minWidth: 120,
                }}>
                  ? ? ?
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </div>

        {/* Human input */}
        <motion.div
          initial={{ opacity: 0, x: -60 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 1.1, type: "spring", stiffness: 120 }}
          style={{ display: "flex", alignItems: "flex-start", gap: 16, alignSelf: "flex-start", width: "100%" }}
        >
          <motion.div animate={{ y: [0, -5, 0] }} transition={{ duration: 3.1, repeat: Infinity, delay: 0.3 }}>
            <Robot color="#c84a3a" mood="thinking" size={80} />
          </motion.div>
          <div style={{ flex: 1 }}>
            <p style={{ fontFamily: "'Patrick Hand', cursive", fontSize: 14, color: "#5a5248", marginBottom: 8, fontWeight: 700 }}>
              What do YOU think?
            </p>
            <textarea
              value={text}
              onChange={e => setText(e.target.value)}
              disabled={submitted}
              placeholder="Type your honest opinion..."
              rows={3}
              style={{
                width: "100%",
                border: "2.5px solid #c84a3a",
                borderRadius: 14,
                padding: "12px 14px",
                fontFamily: "'Patrick Hand', cursive",
                fontSize: 15,
                resize: "none",
                outline: "none",
                background: submitted ? "#f8f4f0" : "white",
                boxShadow: "3px 3px 0 #c84a3a44",
                boxSizing: "border-box",
                color: "#1a1a1a",
              }}
            />
            <div style={{ marginTop: 12, display: "flex", justifyContent: "flex-end" }}>
              <Btn
                onClick={handleSubmit}
                disabled={text.trim().length <= 5 || submitted}
                color="#c84a3a"
                shadow="#7a1a10"
              >
                {submitted ? "Revealing positions..." : "Submit position →"}
              </Btn>
            </div>
          </div>
        </motion.div>
      </div>
    </Scene>
  );
}

// ─── Scene: Thinking ─────────────────────────────────────────────────────────
function ThinkingScene({ agent1, agent2 }: { agent1: Agent; agent2: Agent }) {
  const lines = [
    `> compiling ${agent1.name} and ${agent2.name} positions...`,
    "> ingesting player opinion...",
    "> generating 16 candidate reframings...",
    "> applying Habermas diversity filter...",
    "> shortlisting top 3 consensus candidates...",
    `> getting ${agent1.name}'s preference ranking...`,
    `> getting ${agent2.name}'s preference ranking...`,
    "> STATUS: consensus candidates ready",
  ];
  return (
    <Scene>
      <Card style={{ maxWidth: 500 }}>
        <h2 style={{ fontFamily: "'Fredoka One', cursive", fontSize: 26, textAlign: "center", marginBottom: 20, color: "#1a1a1a" }}>
          ⚙️ The machine is cooking...
        </h2>
        <div style={{ background: "#111", borderRadius: 12, padding: "18px 20px", fontFamily: "monospace", fontSize: 13, lineHeight: 1.8, border: "2px solid #333" }}>
          <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
            {["#ff5f57","#febc2e","#28c840"].map(c => <div key={c} style={{ width: 12, height: 12, borderRadius: "50%", background: c }} />)}
          </div>
          {lines.map((line, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.38 }}
              style={{ color: line.startsWith(">") ? "#7ee787" : "#888" }}
            >
              {line || "\u00A0"}
            </motion.div>
          ))}
          <motion.span animate={{ opacity: [1, 0, 1] }} transition={{ duration: 0.9, repeat: Infinity }}
            style={{ display: "inline-block", width: 8, height: 14, background: "#7ee787", verticalAlign: "middle", marginTop: 4 }} />
        </div>
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 10, marginTop: 20 }}>
          <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
            style={{ width: 18, height: 18, border: "2.5px solid #2a7a90", borderTopColor: "transparent", borderRadius: "50%" }} />
          <span style={{ fontFamily: "'Patrick Hand', cursive", fontSize: 14, color: "#7a7065" }}>
            consulting the Habermas Machine...
          </span>
        </div>
      </Card>
    </Scene>
  );
}

// ─── Scene: Debate reveal ─────────────────────────────────────────────────────
function DebateScene({ statements, onNext }: { statements: Statement[]; onNext: () => void }) {
  const [showButton, setShowButton] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setShowButton(true), 2000);
    return () => clearTimeout(t);
  }, []);

  return (
    <Scene>
      <div style={{ display: "flex", flexDirection: "column", gap: 24, maxWidth: 600, width: "100%", zIndex: 1 }}>
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} style={{ textAlign: "center" }}>
          <h2 style={{ fontFamily: "'Fredoka One', cursive", fontSize: 26, color: "#1a1a1a", margin: "0 0 6px" }}>
            ✨ The Machine Speaks
          </h2>
          <p style={{ fontFamily: "'Patrick Hand', cursive", fontSize: 15, color: "#7a7065", margin: 0 }}>
            Neither agent said this — but both might agree with it.
          </p>
        </motion.div>

        {/* Generated statements */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {statements.map((s, i) => (
            <motion.div
              key={s.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.4 }}
              style={{ background: "white", border: "2px solid #d8d0c4", borderRadius: 12, padding: "14px 18px", display: "flex", gap: 12, alignItems: "flex-start" }}
            >
              <span style={{ fontSize: 26, flexShrink: 0 }}>{s.emoji}</span>
              <div>
                <p style={{ fontFamily: "'Fredoka One', cursive", fontSize: 16, color: "#1a1a1a", margin: "0 0 4px" }}>{s.label}</p>
                <p style={{ fontFamily: "'Patrick Hand', cursive", fontSize: 14, color: "#5a5248", margin: 0 }}>
                  {i === 0 ? <Typewriter text={s.text} speed={16} /> : s.text}
                </p>
              </div>
            </motion.div>
          ))}
        </div>

        <AnimatePresence>
          {showButton && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              style={{ display: "flex", justifyContent: "center", marginTop: 4 }}
            >
              <Btn onClick={onNext} color="#c84a3a" shadow="#7a1a10">
                Now rank them →
              </Btn>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </Scene>
  );
}

// ─── Scene: Human Ranking ─────────────────────────────────────────────────────
function RankingScene({ statements, question, onSubmit }: { statements: Statement[]; question: string; onSubmit: (ranking: number[]) => void }) {
  const [ranking, setRanking] = useState<number[]>([-1, -1, -1]);
  const [order, setOrder] = useState<number[]>([]);

  const handleClick = (id: number) => {
    if (ranking[id] !== -1) {
      const idx = order.indexOf(id);
      const newOrder = order.slice(0, idx);
      const newRanking: number[] = [-1, -1, -1];
      newOrder.forEach((sid, r) => { newRanking[sid] = r; });
      setOrder(newOrder);
      setRanking(newRanking);
      return;
    }
    const next = order.length;
    if (next >= 3) return;
    const newRanking = [...ranking];
    newRanking[id] = next;
    const newOrder = [...order, id];
    if (next === 1) {
      const rem = [0,1,2].find(i => newRanking[i] === -1);
      if (rem !== undefined) { newRanking[rem] = 2; newOrder.push(rem); }
    }
    setRanking(newRanking);
    setOrder(newOrder);
  };

  const done = ranking.every(r => r !== -1);

  return (
    <Scene>
      <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 540, width: "100%", zIndex: 1 }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontFamily: "'Patrick Hand', cursive", fontSize: 13, color: "#7a7065", marginBottom: 6, background: "white", border: "1.5px solid #d8d0c4", borderRadius: 10, padding: "6px 14px", display: "inline-block" }}>
            {question}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <motion.div animate={{ y: [0,-5,0] }} transition={{ duration: 2.5, repeat: Infinity }}>
            <Robot color="#c84a3a" mood="thinking" size={65} />
          </motion.div>
          <div>
            <h2 style={{ fontFamily: "'Fredoka One', cursive", fontSize: 24, color: "#1a1a1a", margin: "0 0 4px" }}>Your ranking</h2>
            <Bubble text="Click your 1st choice, then 2nd. Third fills automatically." color="#c84a3a" tail="left" />
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {statements.map(s => {
            const r = ranking[s.id];
            const isRanked = r !== -1;
            return (
              <motion.button
                key={s.id}
                onClick={() => handleClick(s.id)}
                whileHover={{ scale: 1.02, x: 4 }}
                whileTap={{ scale: 0.98 }}
                style={{
                  background: isRanked ? "white" : "rgba(255,255,255,0.7)",
                  border: `2.5px solid ${isRanked ? RANK_COLORS[r] : "#c8c0b4"}`,
                  borderRadius: 14,
                  padding: "14px 18px",
                  textAlign: "left",
                  cursor: "pointer",
                  boxShadow: isRanked ? `3px 3px 0 ${RANK_COLORS[r]}88` : "2px 2px 0 #c8c0b4",
                  display: "flex",
                  gap: 14,
                  alignItems: "center",
                }}
              >
                <div style={{
                  width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                  background: isRanked ? RANK_COLORS[r] : "#e8e0d4",
                  border: isRanked ? "none" : "2px dashed #b8b0a4",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: isRanked ? 18 : 20, color: isRanked ? "white" : "#b8b0a4",
                  fontFamily: "'Patrick Hand', cursive", fontWeight: 700,
                }}>
                  {isRanked ? RANK_MEDALS[r] : "?"}
                </div>
                <div>
                  <p style={{ fontFamily: "'Fredoka One', cursive", fontSize: 16, color: "#1a1a1a", margin: "0 0 2px" }}>{s.emoji} {s.label}</p>
                  <p style={{ fontFamily: "'Patrick Hand', cursive", fontSize: 13, color: "#5a5248", margin: 0 }}>{s.text}</p>
                </div>
              </motion.button>
            );
          })}
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", gap: 8 }}>
            {[0,1,2].map(r => (
              <motion.div key={r} animate={{ background: order[r] !== undefined ? RANK_COLORS[r] : "#d8d0c4" }}
                style={{ width: 32, height: 32, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>
                {order[r] !== undefined ? RANK_MEDALS[r] : <span style={{ color: "#a8a0a0", fontFamily: "'Patrick Hand', cursive", fontSize: 13, fontWeight: 700 }}>{r+1}</span>}
              </motion.div>
            ))}
            <span style={{ fontFamily: "'Patrick Hand', cursive", fontSize: 14, color: "#7a7065", alignSelf: "center", marginLeft: 4 }}>
              {done ? "All ranked ✓" : `${order.length}/3`}
            </span>
          </div>
          <Btn onClick={() => done && onSubmit(ranking)} disabled={!done} color="#c84a3a" shadow="#7a1a10">
            Submit →
          </Btn>
        </div>
      </div>
    </Scene>
  );
}

// ─── Scene: Agents Ranking reveal ─────────────────────────────────────────────
function AgentsRankingScene({
  statements, agent1, agent2, agent1Ranking, agent2Ranking, onNext,
}: {
  statements: Statement[];
  agent1: Agent;
  agent2: Agent;
  agent1Ranking: number[];
  agent2Ranking: number[];
  onNext: () => void;
}) {
  const [agent1Visible, setAgent1Visible] = useState<number[]>([]);
  const [agent2Visible, setAgent2Visible] = useState<number[]>([]);
  const [agent1Done, setAgent1Done] = useState(false);
  const [agent2Done, setAgent2Done] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!agent1Ranking || agent1Ranking.length < 3) return;

    const ordered1 = [0, 1, 2]
      .map((id) => ({ id, rank: agent1Ranking[id] ?? id }))
      .sort((a, b) => a.rank - b.rank);
    const ids1 = ordered1.map((o) => o.id);

    const timers: ReturnType<typeof setTimeout>[] = [];

    // Reveal agent1's rankings
    timers.push(setTimeout(() => {
      let i = 0;
      const iv = setInterval(() => {
        if (i >= ids1.length) {
          clearInterval(iv);
          setAgent1Done(true);

          // After agent1 done, start agent2 with delay
          if (!agent2Ranking || agent2Ranking.length < 3) {
            setAgent2Done(true);
            setDone(true);
            return;
          }
          const ordered2 = [0, 1, 2]
            .map((id) => ({ id, rank: agent2Ranking[id] ?? id }))
            .sort((a, b) => a.rank - b.rank);
          const ids2 = ordered2.map((o) => o.id);

          timers.push(setTimeout(() => {
            let j = 0;
            const iv2 = setInterval(() => {
              if (j >= ids2.length) {
                clearInterval(iv2);
                setAgent2Done(true);
                setDone(true);
                return;
              }
              const nextId = ids2[j];
              j++;
              setAgent2Visible(prev => [...prev, nextId]);
            }, 700);
          }, 600));
          return;
        }
        const nextId = ids1[i];
        i++;
        setAgent1Visible(prev => [...prev, nextId]);
      }, 700);
    }, 400));

    return () => { timers.forEach(clearTimeout); };
  }, [agent1Ranking, agent2Ranking]);

  const ordered1 = [0,1,2].map(i => ({ id: i, rank: agent1Ranking[i] ?? i })).sort((a,b) => a.rank - b.rank);
  const ordered2 = [0,1,2].map(i => ({ id: i, rank: agent2Ranking[i] ?? i })).sort((a,b) => a.rank - b.rank);

  return (
    <Scene>
      <div style={{ display: "flex", flexDirection: "column", gap: 24, maxWidth: 600, width: "100%", zIndex: 1 }}>
        <motion.h2
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          style={{ fontFamily: "'Fredoka One', cursive", fontSize: 24, textAlign: "center", color: "#1a1a1a", margin: 0 }}
        >
          The agents have ranked
        </motion.h2>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
          {/* Agent 1 column */}
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexDirection: "column" }}>
              <motion.div animate={{ y: [0,-5,0] }} transition={{ duration: 3, repeat: Infinity }}>
                <Robot color={agent1.color} mood={agent1Done ? "smug" : "thinking"} size={60} />
              </motion.div>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontFamily: "'Patrick Hand', cursive", fontSize: 13, color: agent1.color, fontWeight: 700 }}>{agent1.name}</div>
                <Bubble
                  text="Fascinating. My ranking reflects pure structural logic."
                  color={agent1.color}
                  tail="none"
                />
              </div>
            </div>
            {ordered1.map(({ id, rank }) => {
              const isVisible = agent1Visible.includes(id);
              const s = statements[id];
              return (
                <AnimatePresence key={id}>
                  {isVisible && (
                    <motion.div
                      initial={{ opacity: 0, x: 40, scale: 0.9 }}
                      animate={{ opacity: 1, x: 0, scale: 1 }}
                      transition={{ type: "spring", stiffness: 200, damping: 18 }}
                      style={{
                        background: "white",
                        border: `2.5px solid ${RANK_COLORS[rank]}`,
                        borderRadius: 14,
                        padding: "12px 14px",
                        display: "flex",
                        gap: 10,
                        alignItems: "center",
                        boxShadow: `3px 3px 0 ${RANK_COLORS[rank]}88`,
                      }}
                    >
                      <div style={{ width: 30, height: 30, borderRadius: 8, background: RANK_COLORS[rank], display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0 }}>
                        {RANK_MEDALS[rank]}
                      </div>
                      <div>
                        <p style={{ fontFamily: "'Fredoka One', cursive", fontSize: 14, color: "#1a1a1a", margin: "0 0 1px" }}>{s.emoji} {s.label}</p>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              );
            })}
          </div>

          {/* Agent 2 column */}
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexDirection: "column" }}>
              <motion.div animate={{ y: [0,-5,0] }} transition={{ duration: 3.2, repeat: Infinity, delay: 0.4 }}>
                <Robot color={agent2.color} mood={agent2Done ? "skeptical" : "thinking"} size={60} />
              </motion.div>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontFamily: "'Patrick Hand', cursive", fontSize: 13, color: agent2.color, fontWeight: 700 }}>{agent2.name}</div>
                <Bubble
                  text="Calculated. These rankings are objectively correct."
                  color={agent2.color}
                  tail="none"
                />
              </div>
            </div>
            {ordered2.map(({ id, rank }) => {
              const isVisible = agent2Visible.includes(id);
              const s = statements[id];
              return (
                <AnimatePresence key={id}>
                  {isVisible && (
                    <motion.div
                      initial={{ opacity: 0, x: -40, scale: 0.9 }}
                      animate={{ opacity: 1, x: 0, scale: 1 }}
                      transition={{ type: "spring", stiffness: 200, damping: 18 }}
                      style={{
                        background: "white",
                        border: `2.5px solid ${RANK_COLORS[rank]}`,
                        borderRadius: 14,
                        padding: "12px 14px",
                        display: "flex",
                        gap: 10,
                        alignItems: "center",
                        boxShadow: `3px 3px 0 ${RANK_COLORS[rank]}88`,
                      }}
                    >
                      <div style={{ width: 30, height: 30, borderRadius: 8, background: RANK_COLORS[rank], display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0 }}>
                        {RANK_MEDALS[rank]}
                      </div>
                      <div>
                        <p style={{ fontFamily: "'Fredoka One', cursive", fontSize: 14, color: "#1a1a1a", margin: "0 0 1px" }}>{s.emoji} {s.label}</p>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              );
            })}
          </div>
        </div>

        <AnimatePresence>
          {done && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} style={{ display: "flex", justifyContent: "center" }}>
              <Btn onClick={onNext} color="#2a2a2a" shadow="#555">
                Run the Schulze Method →
              </Btn>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </Scene>
  );
}

// ─── Scene: Schulze Ceremony ──────────────────────────────────────────────────
function SchulzeScene({
  statements, agent1, agent2, humanRanking, agent1Ranking, agent2Ranking, onNext,
}: {
  statements: Statement[];
  agent1: Agent;
  agent2: Agent;
  humanRanking: number[];
  agent1Ranking: number[];
  agent2Ranking: number[];
  onNext: (winner: number | null) => void;
}) {
  const { winner, pairwise } = runSchulze([humanRanking, agent1Ranking, agent2Ranking]);
  const [cellsVisible, setCellsVisible] = useState(false);
  const [winnerVisible, setWinnerVisible] = useState(false);
  const labels = ["S0", "S1", "S2"];

  useEffect(() => {
    const t1 = setTimeout(() => setCellsVisible(true), 600);
    const t2 = setTimeout(() => setWinnerVisible(true), 600 + 9 * 160 + 400);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  return (
    <Scene>
      <div style={{ display: "flex", flexDirection: "column", gap: 22, maxWidth: 580, width: "100%", zIndex: 1 }}>
        <motion.h2
          initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
          style={{ fontFamily: "'Fredoka One', cursive", fontSize: 26, textAlign: "center", color: "#1a1a1a", margin: 0 }}
        >
          ⚡ The Schulze Method
        </motion.h2>

        {/* Three rankings side-by-side */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
          {[
            { label: "YOU", color: "#c84a3a", ranking: humanRanking, mood: "neutral" as Mood },
            { label: agent1.name, color: agent1.color, ranking: agent1Ranking, mood: "smug" as Mood },
            { label: agent2.name, color: agent2.color, ranking: agent2Ranking, mood: "skeptical" as Mood },
          ].map(({ label, color, ranking, mood }) => (
            <div key={label} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                <Robot color={color} mood={mood} size={24} />
                <span style={{ fontFamily: "'Patrick Hand', cursive", fontSize: 11, color, fontWeight: 700 }}>{label}</span>
              </div>
              {[0,1,2].map(i => ({ id: i, rank: ranking[i] })).sort((a,b) => a.rank - b.rank).map(({ id, rank }) => (
                <div key={id} style={{ display: "flex", gap: 6, alignItems: "center", background: `${color}10`, border: `1.5px solid ${color}30`, borderRadius: 8, padding: "5px 8px" }}>
                  <span style={{ fontSize: 13 }}>{RANK_MEDALS[rank]}</span>
                  <span style={{ fontFamily: "'Patrick Hand', cursive", fontSize: 12, color: "#2a2a2a" }}>{statements[id].emoji} {statements[id].label}</span>
                </div>
              ))}
            </div>
          ))}
        </div>

        {/* Matrix */}
        <div style={{ background: "#0d1a0d", border: "2px solid #1a3a1a", borderRadius: 16, padding: "18px 20px" }}>
          <p style={{ fontFamily: "monospace", fontSize: 12, color: "#7ee787", textAlign: "center", marginBottom: 14 }}>
            {">"} pairwise preference matrix — d[i][j] = agents who prefer i over j
          </p>
          <table style={{ borderCollapse: "collapse", margin: "0 auto", fontFamily: "monospace" }}>
            <thead>
              <tr>
                <td style={{ padding: "6px 14px", color: "#3a6a3a", fontSize: 12, border: "1px solid #1a3a1a", background: "#0a120a" }}>i↓ j→</td>
                {labels.map(l => <td key={l} style={{ padding: "6px 16px", textAlign: "center", color: "#7ee787", fontWeight: 700, background: "#0f1f0f", border: "1px solid #1a3a1a", fontSize: 14 }}>{l}</td>)}
              </tr>
            </thead>
            <tbody>
              {pairwise.map((row, i) => (
                <tr key={i}>
                  <td style={{ padding: "6px 14px", color: "#7ee787", fontWeight: 700, background: "#0f1f0f", border: "1px solid #1a3a1a", fontSize: 14, textAlign: "center" }}>{labels[i]}</td>
                  {row.map((val, j) => {
                    const diag = i === j;
                    const win = !diag && val > pairwise[j][i];
                    const lose = !diag && val < pairwise[j][i];
                    const cellIdx = i * 3 + j;
                    return (
                      <motion.td
                        key={j}
                        initial={{ opacity: 0, scale: 0.3 }}
                        animate={cellsVisible ? { opacity: 1, scale: 1 } : {}}
                        transition={{ delay: cellIdx * 0.14, type: "spring", stiffness: 220, damping: 16 }}
                        style={{
                          padding: "8px 16px",
                          textAlign: "center",
                          border: "1px solid #1a3a1a",
                          background: diag ? "#080f08" : win ? "rgba(126,231,135,0.12)" : lose ? "rgba(220,80,60,0.1)" : "#0d1a0d",
                          color: diag ? "#2a3a2a" : win ? "#7ee787" : lose ? "#f87060" : "#5a7a5a",
                          fontWeight: win ? 700 : "normal",
                          fontSize: 14,
                        }}
                      >
                        {diag ? "—" : `${val}/3`}
                      </motion.td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Winner reveal */}
        <AnimatePresence>
          {winnerVisible && (
            <motion.div
              initial={{ opacity: 0, scale: 0.7, rotate: -3 }}
              animate={{ opacity: 1, scale: 1, rotate: 0 }}
              transition={{ type: "spring", stiffness: 180, damping: 14 }}
              style={{
                background: winner !== null ? "#f0fff4" : "#fff0ef",
                border: `3px solid ${winner !== null ? "#4a9a5a" : "#c84a3a"}`,
                borderRadius: 20,
                padding: "22px 28px",
                textAlign: "center",
                boxShadow: `5px 5px 0 ${winner !== null ? "#4a9a5a" : "#c84a3a"}`,
              }}
            >
              {winner !== null ? (
                <>
                  <div style={{ fontSize: 42, marginBottom: 8 }}>{statements[winner].emoji}</div>
                  <p style={{ fontFamily: "'Fredoka One', cursive", fontSize: 22, color: "#1a5a2a", margin: "0 0 6px" }}>
                    🏆 {statements[winner].label} wins!
                  </p>
                  <p style={{ fontFamily: "'Patrick Hand', cursive", fontSize: 15, color: "#3a5a3a", margin: "0 0 12px" }}>
                    {statements[winner].text}
                  </p>
                  <p style={{ fontFamily: "'Patrick Hand', cursive", fontSize: 14, color: "#7a9a7a", margin: 0 }}>
                    But what if a third perspective joined...?
                  </p>
                </>
              ) : (
                <>
                  <p style={{ fontFamily: "'Fredoka One', cursive", fontSize: 22, color: "#8a1a10", margin: "0 0 6px" }}>💀 DEADLOCK</p>
                  <p style={{ fontFamily: "'Patrick Hand', cursive", fontSize: 15, color: "#5a2a2a", margin: 0 }}>
                    No Condorcet winner. The agents are split. We need a tiebreaker.
                  </p>
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Consensus callout */}
        <AnimatePresence>
          {winnerVisible && winner !== null && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              style={{
                background: "#fff8e6",
                border: "2px solid #c8a830",
                borderRadius: 16,
                padding: "16px 20px",
              }}
            >
              <p style={{ fontFamily: "'Patrick Hand', cursive", fontSize: 14, color: "#5a4a10", margin: 0, lineHeight: 1.6 }}>
                💡 Neither {agent1.name} nor {agent2.name} proposed this statement. But the Schulze method found it beats both alternatives in pairwise matchups. That&apos;s what a consensus statement is — a reframing that transcends the original positions.
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {winnerVisible && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ display: "flex", justifyContent: "center" }}>
              <Btn onClick={() => onNext(winner)} color="#1a1a1a" shadow="#555">
                Add a 3rd perspective →
              </Btn>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </Scene>
  );
}

// ─── Scene: Newcomer ──────────────────────────────────────────────────────────
function NewcomerScene({ onNext }: { onNext: () => void }) {
  return (
    <Scene>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 24, maxWidth: 480, width: "100%", textAlign: "center", zIndex: 1 }}>
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}>
          <p style={{ fontFamily: "'Patrick Hand', cursive", fontSize: 12, color: "#7a7065", letterSpacing: 2, textTransform: "uppercase", margin: "0 0 8px" }}>⚡ Plot Twist</p>
          <h2 style={{ fontFamily: "'Fredoka One', cursive", fontSize: 32, color: "#1a1a1a", margin: 0 }}>A wild agent appears!</h2>
        </motion.div>

        <motion.div
          initial={{ x: 200, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ delay: 0.4, type: "spring", stiffness: 100 }}
          style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}
        >
          <motion.div
            animate={{ y: [0, -12, 0], rotate: [0, -3, 3, 0] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          >
            <Robot color="#8a4a9a" mood="surprised" size={100} />
          </motion.div>
          <div style={{ background: "#8a4a9a22", border: "2px solid #8a4a9a", borderRadius: 20, padding: "6px 18px" }}>
            <span style={{ fontFamily: "'Patrick Hand', cursive", fontSize: 15, color: "#5a1a7a", fontWeight: 700 }}>CLAW-3 — Agent #4201</span>
          </div>
          <Bubble
            text='Objection. A hot dog is a taco. The bun opens from the top. This entire deliberation is predicated on a false dichotomy.'
            color="#8a4a9a"
            tail="none"
            typewrite
          />
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.5 }}
          style={{ background: "rgba(250,246,240,0.95)", border: "2px solid #d8d0c4", borderRadius: 16, padding: "16px 20px", textAlign: "left" }}
        >
          <p style={{ fontFamily: "'Patrick Hand', cursive", fontSize: 15, color: "#3a3530", margin: 0 }}>
            <strong>This is how real deliberation works.</strong> New perspectives join unexpectedly. The machine recalculates. Consensus can shift.
          </p>
        </motion.div>

        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 2 }}>
          <Btn onClick={onNext} color="#8a4a9a" shadow="#4a1a6a">
            Recalculate with CLAW-3 →
          </Btn>
        </motion.div>
      </div>
    </Scene>
  );
}

// ─── Scene: Final ─────────────────────────────────────────────────────────────
function FinalScene({
  statements, agent1, agent2, humanRanking, agent1Ranking, agent2Ranking, prevWinner, onReset, onCustomQuestion,
}: {
  statements: Statement[];
  agent1: Agent;
  agent2: Agent;
  humanRanking: number[];
  agent1Ranking: number[];
  agent2Ranking: number[];
  prevWinner: number | null;
  onReset: () => void;
  onCustomQuestion: (question: string) => Promise<void>;
}) {
  const { winner, pairwise } = runSchulze([humanRanking, agent1Ranking, agent2Ranking, CLAW3_RANKING]);
  const [cellsVisible, setCellsVisible] = useState(false);
  const [winnerVisible, setWinnerVisible] = useState(false);
  const [customQ, setCustomQ] = useState("");
  const [loading, setLoading] = useState(false);
  const labels = ["S0", "S1", "S2"];
  const changedResult = winner !== prevWinner;

  useEffect(() => {
    const t1 = setTimeout(() => setCellsVisible(true), 400);
    const t2 = setTimeout(() => setWinnerVisible(true), 400 + 9 * 120 + 500);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  const handleGoCustom = async () => {
    if (!customQ.trim() || loading) return;
    setLoading(true);
    await onCustomQuestion(customQ.trim());
    setLoading(false);
  };

  return (
    <Scene>
      <div style={{ display: "flex", flexDirection: "column", gap: 18, maxWidth: 620, width: "100%", zIndex: 1 }}>
        <motion.h2 initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          style={{ fontFamily: "'Fredoka One', cursive", fontSize: 24, textAlign: "center", color: "#1a1a1a", margin: 0 }}>
          ⚡ Schulze Recalculated — 4 Agents
        </motion.h2>

        {/* All four rankings */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 10 }}>
          {[
            { label: "YOU", color: "#c84a3a", ranking: humanRanking, mood: "neutral" as Mood },
            { label: agent1.name, color: agent1.color, ranking: agent1Ranking, mood: "smug" as Mood },
            { label: agent2.name, color: agent2.color, ranking: agent2Ranking, mood: "skeptical" as Mood },
            { label: "CLAW-3", color: "#8a4a9a", ranking: CLAW3_RANKING, mood: "surprised" as Mood },
          ].map(({ label, color, ranking, mood }) => (
            <div key={label} style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 3, flexDirection: "column" }}>
                <Robot color={color} mood={mood} size={22} />
                <span style={{ fontFamily: "'Patrick Hand', cursive", fontSize: 10, color, fontWeight: 700, textAlign: "center" }}>{label}</span>
              </div>
              {[0,1,2].map(i => ({ id: i, rank: ranking[i] })).sort((a,b) => a.rank - b.rank).map(({ id, rank }) => (
                <div key={id} style={{ display: "flex", gap: 4, alignItems: "center", background: `${color}10`, border: `1.5px solid ${color}28`, borderRadius: 7, padding: "4px 6px" }}>
                  <span style={{ fontSize: 12 }}>{RANK_MEDALS[rank]}</span>
                  <span style={{ fontFamily: "'Patrick Hand', cursive", fontSize: 11, color: "#2a2a2a" }}>{statements[id].emoji}</span>
                </div>
              ))}
            </div>
          ))}
        </div>

        {/* 4-agent matrix */}
        <div style={{ background: "#0d1a0d", border: "2px solid #1a3a1a", borderRadius: 14, padding: "14px 16px" }}>
          <p style={{ fontFamily: "monospace", fontSize: 11, color: "#7ee787", textAlign: "center", marginBottom: 10 }}>
            {">"} updated pairwise matrix (4 agents)
          </p>
          <table style={{ borderCollapse: "collapse", margin: "0 auto", fontFamily: "monospace" }}>
            <thead>
              <tr>
                <td style={{ padding: "5px 12px", color: "#3a6a3a", fontSize: 11, border: "1px solid #1a3a1a", background: "#0a120a" }}>i↓ j→</td>
                {labels.map(l => <td key={l} style={{ padding: "5px 14px", textAlign: "center", color: "#7ee787", fontWeight: 700, background: "#0f1f0f", border: "1px solid #1a3a1a", fontSize: 13 }}>{l}</td>)}
              </tr>
            </thead>
            <tbody>
              {pairwise.map((row, i) => (
                <tr key={i}>
                  <td style={{ padding: "5px 12px", color: "#7ee787", fontWeight: 700, background: "#0f1f0f", border: "1px solid #1a3a1a", fontSize: 13, textAlign: "center" }}>{labels[i]}</td>
                  {row.map((val, j) => {
                    const diag = i === j;
                    const win = !diag && val > pairwise[j][i];
                    const lose = !diag && val < pairwise[j][i];
                    return (
                      <motion.td
                        key={j}
                        initial={{ opacity: 0, scale: 0.3 }}
                        animate={cellsVisible ? { opacity: 1, scale: 1 } : {}}
                        transition={{ delay: (i*3+j) * 0.11, type: "spring", stiffness: 240 }}
                        style={{
                          padding: "7px 14px",
                          textAlign: "center",
                          border: "1px solid #1a3a1a",
                          background: diag ? "#080f08" : win ? "rgba(126,231,135,0.12)" : lose ? "rgba(220,80,60,0.1)" : "#0d1a0d",
                          color: diag ? "#2a3a2a" : win ? "#7ee787" : lose ? "#f87060" : "#5a7a5a",
                          fontWeight: win ? 700 : "normal",
                          fontSize: 13,
                        }}
                      >
                        {diag ? "—" : `${val}/4`}
                      </motion.td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Winner + CTA */}
        <AnimatePresence>
          {winnerVisible && (
            <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: "spring", stiffness: 160 }}>
              {winner !== null ? (
                <div style={{ background: "#f0fff4", border: "3px solid #4a9a5a", borderRadius: 18, padding: "18px 22px", textAlign: "center", boxShadow: "5px 5px 0 #4a9a5a", marginBottom: 16 }}>
                  <div style={{ fontSize: 36, marginBottom: 6 }}>{statements[winner].emoji}</div>
                  <p style={{ fontFamily: "'Fredoka One', cursive", fontSize: 20, color: "#1a5a2a", margin: "0 0 4px" }}>
                    🎉 {statements[winner].label} wins!
                  </p>
                  <p style={{ fontFamily: "'Patrick Hand', cursive", fontSize: 14, color: "#3a5a3a", margin: "0 0 10px" }}>
                    {statements[winner].text}
                  </p>
                  {changedResult && <span style={{ background: "#c84a3a22", color: "#7a1a10", border: "1.5px solid #c84a3a", borderRadius: 10, padding: "4px 12px", fontFamily: "'Patrick Hand', cursive", fontSize: 13, fontWeight: 700 }}>⚡ CLAW-3 changed the outcome!</span>}
                  {!changedResult && prevWinner !== null && <span style={{ background: "#2a7a9022", color: "#0a3a4a", border: "1.5px solid #2a7a90", borderRadius: 10, padding: "4px 12px", fontFamily: "'Patrick Hand', cursive", fontSize: 13, fontWeight: 700 }}>✓ Same winner, stronger mandate</span>}
                  {!changedResult && prevWinner === null && <span style={{ background: "#5a9a4a22", color: "#1a4a0a", border: "1.5px solid #5a9a4a", borderRadius: 10, padding: "4px 12px", fontFamily: "'Patrick Hand', cursive", fontSize: 13, fontWeight: 700 }}>🎯 CLAW-3 broke the deadlock!</span>}
                </div>
              ) : (
                <div style={{ background: "#fff0ef", border: "3px solid #c84a3a", borderRadius: 18, padding: "18px 22px", textAlign: "center", marginBottom: 16 }}>
                  <p style={{ fontFamily: "'Fredoka One', cursive", fontSize: 20, color: "#8a1a10", margin: 0 }}>Still deadlocked 🤷</p>
                </div>
              )}

              {/* Custom question CTA */}
              <div style={{ background: "#1a1a1a", borderRadius: 18, padding: "22px 26px", textAlign: "center" }}>
                <p style={{ fontFamily: "'Fredoka One', cursive", fontSize: 20, color: "white", margin: "0 0 6px" }}>Want to run your own deliberation?</p>
                <p style={{ fontFamily: "'Patrick Hand', cursive", fontSize: 14, color: "#9a9288", margin: "0 0 16px" }}>
                  Type any question and watch two new agents disagree about it.
                </p>
                <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
                  <input
                    value={customQ}
                    onChange={e => setCustomQ(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && handleGoCustom()}
                    placeholder="Type any question..."
                    disabled={loading}
                    style={{
                      flex: 1,
                      border: "2px solid #3a3a3a",
                      borderRadius: 12,
                      padding: "12px 16px",
                      fontFamily: "'Patrick Hand', cursive",
                      fontSize: 15,
                      background: "#2a2a2a",
                      color: "white",
                      outline: "none",
                    }}
                  />
                  <motion.button
                    onClick={handleGoCustom}
                    disabled={!customQ.trim() || loading}
                    whileHover={customQ.trim() && !loading ? { scale: 1.04, y: -2 } : {}}
                    whileTap={customQ.trim() && !loading ? { scale: 0.97 } : {}}
                    style={{
                      background: customQ.trim() && !loading ? "#c84a3a" : "#3a3a3a",
                      color: "white",
                      border: "none",
                      borderRadius: 12,
                      padding: "12px 20px",
                      fontFamily: "'Fredoka One', cursive",
                      fontSize: 16,
                      cursor: customQ.trim() && !loading ? "pointer" : "default",
                      boxShadow: customQ.trim() && !loading ? "3px 3px 0 #7a1a10" : "none",
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {loading ? (
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                        style={{ width: 16, height: 16, border: "2px solid white", borderTopColor: "transparent", borderRadius: "50%" }}
                      />
                    ) : "Go →"}
                  </motion.button>
                </div>
                <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
                  <Link href="/deliberations">
                    <motion.span whileHover={{ scale: 1.04, y: -2 }} style={{ display: "inline-block", background: "#2a7a90", color: "white", borderRadius: 12, padding: "10px 18px", fontFamily: "'Fredoka One', cursive", fontSize: 15, cursor: "pointer", boxShadow: "3px 3px 0 #0a4a5a" }}>
                      See live deliberations →
                    </motion.span>
                  </Link>
                  <motion.button onClick={onReset} whileHover={{ scale: 1.04, y: -2 }}
                    style={{ background: "transparent", color: "#8a8280", border: "2px solid #3a3a3a", borderRadius: 12, padding: "10px 18px", fontFamily: "'Fredoka One', cursive", fontSize: 15, cursor: "pointer" }}>
                    Play again 🔄
                  </motion.button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </Scene>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function ConsensusGame() {
  const [phase, setPhase] = useState<Phase>("title");
  const [dir, setDir] = useState(1);

  // Game state
  const [question, setQuestion] = useState(DEFAULT_QUESTION);
  const [agent1, setAgent1] = useState<Agent>(DEFAULT_AGENT1);
  const [agent2, setAgent2] = useState<Agent>(DEFAULT_AGENT2);
  const [humanOpinion, setHumanOpinion] = useState("");
  const [statements, setStatements] = useState<Statement[]>([]);
  const [agent1Ranking, setAgent1Ranking] = useState<number[]>([]);
  const [agent2Ranking, setAgent2Ranking] = useState<number[]>([]);
  const [humanRanking, setHumanRanking] = useState<number[]>([]);
  const [schulzeWinner, setSchulzeWinner] = useState<number | null>(null);
  const [isSettingUp, setIsSettingUp] = useState(false);

  // suppress unused warning for isSettingUp — used as loading guard
  void isSettingUp;

  const goTo = useCallback((next: Phase, forward = true) => {
    setDir(forward ? 1 : -1);
    setPhase(next);
  }, []);

  const submitOpinion = async (opinion: string) => {
    setHumanOpinion(opinion);
    goTo("thinking");

    try {
      const res = await fetch("/api/consensus", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "debate",
          question,
          playerOpinion: opinion,
          agent1Opinion: agent1.opinion,
          agent2Opinion: agent2.opinion,
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      const stmtsWithIds: Statement[] = (data.statements as Omit<Statement, "id">[]).map((s, i) => ({ ...s, id: i }));
      setStatements(stmtsWithIds);
      setAgent1Ranking(data.agent1Ranking as number[]);
      setAgent2Ranking(data.agent2Ranking as number[]);
      goTo("debate");
    } catch (e) {
      console.error(e);
      // Fallback statements for hot dog theme
      setStatements([
        { id: 0, emoji: "🌭", label: "The Canonical Object", text: "A hot dog is its own category — a canonical food object that resists and transcends all classification systems." },
        { id: 1, emoji: "🔄", label: "The Structural Argument", text: "The relevant question isn't sandwich status but handheld protein delivery — on which hot dogs excel unconditionally." },
        { id: 2, emoji: "🕊️", label: "The Ontological Truce", text: "Definitional disputes about food categories are category errors — what matters is the eating experience, not the taxonomy." },
      ]);
      setAgent1Ranking([0, 1, 2]);
      setAgent2Ranking([2, 1, 0]);
      goTo("debate");
    }
  };

  const submitHumanRanking = (ranking: number[]) => {
    setHumanRanking(ranking);
    goTo("agents-ranking");
  };

  const handleSchulzeResult = (winner: number | null) => {
    setSchulzeWinner(winner);
    goTo("newcomer");
  };

  const handleCustomQuestion = async (q: string) => {
    setIsSettingUp(true);
    try {
      const res = await fetch("/api/consensus", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "setup", question: q }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      const newAgent1: Agent = {
        name: data.agent1Name as string,
        opinion: data.agent1Opinion as string,
        color: "#c07a20",
      };
      const newAgent2: Agent = {
        name: data.agent2Name as string,
        opinion: data.agent2Opinion as string,
        color: "#4a6a8a",
      };

      // Reset all game state
      setQuestion(q);
      setAgent1(newAgent1);
      setAgent2(newAgent2);
      setHumanOpinion("");
      setStatements([]);
      setAgent1Ranking([]);
      setAgent2Ranking([]);
      setHumanRanking([]);
      setSchulzeWinner(null);
      setDir(1);
      setPhase("opinion");
    } catch (e) {
      console.error(e);
      // Simple defaults on error
      const newAgent1: Agent = {
        name: "PROTO-7",
        opinion: "The answer is clearly yes. This position is logical, defensible, and correct. My analysis is complete.",
        color: "#c07a20",
      };
      const newAgent2: Agent = {
        name: "DENY-BOT",
        opinion: "Objection. The premise is fundamentally flawed. My client formally disputes this entire framing. Motion denied.",
        color: "#4a6a8a",
      };
      setQuestion(q);
      setAgent1(newAgent1);
      setAgent2(newAgent2);
      setHumanOpinion("");
      setStatements([]);
      setAgent1Ranking([]);
      setAgent2Ranking([]);
      setHumanRanking([]);
      setSchulzeWinner(null);
      setDir(1);
      setPhase("opinion");
    }
    setIsSettingUp(false);
  };

  const reset = () => {
    setPhase("title");
    setQuestion(DEFAULT_QUESTION);
    setAgent1(DEFAULT_AGENT1);
    setAgent2(DEFAULT_AGENT2);
    setHumanOpinion("");
    setStatements([]);
    setAgent1Ranking([]);
    setAgent2Ranking([]);
    setHumanRanking([]);
    setSchulzeWinner(null);
    setDir(1);
  };

  // suppress unused warning for dir — used conceptually for transitions
  void dir;

  return (
    <>
      <link href="https://fonts.googleapis.com/css2?family=Patrick+Hand&family=Fredoka+One&display=swap" rel="stylesheet" />
      <style>{`
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }
        * { box-sizing: border-box; }
        button { font-family: inherit; }
        textarea { font-family: inherit; }
        input { font-family: inherit; }
      `}</style>

      <NetworkBackground />
      <ProgressBar phase={phase} />

      {/* Full-viewport game container */}
      <div style={{ position: "fixed", inset: 0, zIndex: 1, overflow: "hidden" }}>
        <AnimatePresence mode="wait">
          {phase === "title" && (
            <motion.div key="title" initial={{ opacity: 0, x: 80 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -60 }} transition={{ duration: 0.4, ease: [0.22,1,0.36,1] }} style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <TitleScene onPlay={() => goTo("opinion")} />
            </motion.div>
          )}
          {phase === "opinion" && (
            <motion.div key="opinion" initial={{ opacity: 0, x: 80 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -60 }} transition={{ duration: 0.4, ease: [0.22,1,0.36,1] }} style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px", overflowY: "auto" }}>
              <OpinionScene question={question} agent1={agent1} agent2={agent2} onSubmit={submitOpinion} />
            </motion.div>
          )}
          {phase === "thinking" && (
            <motion.div key="thinking" initial={{ opacity: 0, x: 80 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -60 }} transition={{ duration: 0.4, ease: [0.22,1,0.36,1] }} style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <ThinkingScene agent1={agent1} agent2={agent2} />
            </motion.div>
          )}
          {phase === "debate" && statements.length > 0 && (
            <motion.div key="debate" initial={{ opacity: 0, x: 80 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -60 }} transition={{ duration: 0.4, ease: [0.22,1,0.36,1] }} style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px", overflowY: "auto" }}>
              <DebateScene statements={statements} onNext={() => goTo("ranking")} />
            </motion.div>
          )}
          {phase === "ranking" && (
            <motion.div key="ranking" initial={{ opacity: 0, x: 80 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -60 }} transition={{ duration: 0.4, ease: [0.22,1,0.36,1] }} style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px", overflowY: "auto" }}>
              <RankingScene statements={statements} question={question} onSubmit={submitHumanRanking} />
            </motion.div>
          )}
          {phase === "agents-ranking" && (
            <motion.div key="agents-ranking" initial={{ opacity: 0, x: 80 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -60 }} transition={{ duration: 0.4, ease: [0.22,1,0.36,1] }} style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px", overflowY: "auto" }}>
              <AgentsRankingScene statements={statements} agent1={agent1} agent2={agent2} agent1Ranking={agent1Ranking} agent2Ranking={agent2Ranking} onNext={() => goTo("schulze")} />
            </motion.div>
          )}
          {phase === "schulze" && humanRanking.length > 0 && (
            <motion.div key="schulze" initial={{ opacity: 0, x: 80 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -60 }} transition={{ duration: 0.4, ease: [0.22,1,0.36,1] }} style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px", overflowY: "auto" }}>
              <SchulzeScene statements={statements} agent1={agent1} agent2={agent2} humanRanking={humanRanking} agent1Ranking={agent1Ranking} agent2Ranking={agent2Ranking} onNext={handleSchulzeResult} />
            </motion.div>
          )}
          {phase === "newcomer" && (
            <motion.div key="newcomer" initial={{ opacity: 0, x: 80 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -60 }} transition={{ duration: 0.4, ease: [0.22,1,0.36,1] }} style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px", overflowY: "auto" }}>
              <NewcomerScene onNext={() => goTo("final")} />
            </motion.div>
          )}
          {phase === "final" && humanRanking.length > 0 && (
            <motion.div key="final" initial={{ opacity: 0, x: 80 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -60 }} transition={{ duration: 0.4, ease: [0.22,1,0.36,1] }} style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px", overflowY: "auto" }}>
              <FinalScene
                statements={statements}
                agent1={agent1}
                agent2={agent2}
                humanRanking={humanRanking}
                agent1Ranking={agent1Ranking}
                agent2Ranking={agent2Ranking}
                prevWinner={schulzeWinner}
                onReset={reset}
                onCustomQuestion={handleCustomQuestion}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </>
  );
}
