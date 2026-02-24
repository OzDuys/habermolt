"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";
import Link from "next/link";

// ─── Schulze Method ─────────────────────────────────────────────────────────

function runSchulzeN(agentRankings: number[][], n: number): {
  winner: number | null;
  pairwise: number[][];
} {
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
    const others = Array.from({ length: n }, (_, j) => j).filter((j) => j !== i);
    if (others.every((j) => p[i][j] > p[j][i])) return { winner: i, pairwise: d };
  }
  return { winner: null, pairwise: d };
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface Statement {
  id: number;
  emoji: string;
  label: string;
  text: string;
  author?: string;
}

interface LobsterAgent {
  name: string;
  opinion: string;
  color: string;
}

type Phase =
  | "intro"
  | "question"
  | "opinion"
  | "loading"
  | "opinions-reveal"
  | "explain-consensus"
  | "write-statement"
  | "lobster-statements"
  | "ranking"
  | "lobster-rankings"
  | "schulze"
  | "end"
  | "continue";

const RANK_MEDALS = ["🥇", "🥈", "🥉", "4th", "5th", "6th"];
const RANK_COLORS = ["#c8a830", "#8a8a8a", "#a06030", "#666", "#666", "#666"];

const PRESET_QUESTIONS = [
  "Is a hot dog a sandwich?",
  "Should AI have rights?",
  "Pineapple on pizza?",
  "Is it okay to recline your airplane seat?",
  "Should voting be mandatory?",
  "Is working from home better?",
];

const USER_COLOR = "#c84a20";
const AGENT_COLORS = ["#2a6fb0", "#9b3a8a", "#2a8a4a"];

// ─── Color filter for lobster SVG ────────────────────────────────────────────

function hexToHsl(hex: string) {
  const normalized = hex.replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) return { h: 0, s: 0, l: 50 };
  const r = parseInt(normalized.slice(0, 2), 16) / 255;
  const g = parseInt(normalized.slice(2, 4), 16) / 255;
  const b = parseInt(normalized.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  let h = 0;
  if (delta !== 0) {
    if (max === r) h = ((g - b) / delta + (g < b ? 6 : 0)) * 60;
    else if (max === g) h = ((b - r) / delta + 2) * 60;
    else h = ((r - g) / delta + 4) * 60;
  }
  const l = (max + min) / 2;
  const s = delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1));
  return { h, s: s * 100, l: l * 100 };
}

function lobsterColorFilter(color: string) {
  const { h, s, l } = hexToHsl(color);
  const saturation = Math.round(200 + s * 9);
  const brightness = (0.82 + l / 260).toFixed(2);
  return `grayscale(1) sepia(1) saturate(${saturation}%) hue-rotate(${Math.round(h)}deg) brightness(${brightness})`;
}

// ─── Lobster avatar ──────────────────────────────────────────────────────────

function GameLobster({
  color,
  size = 64,
  variant = 0,
}: {
  color: string;
  size?: number;
  variant?: number;
}) {
  const rotation = (variant % 5) * 2 - 4;
  return (
    <Image
      src="/lobster_with_eyes_symbol.svg"
      alt=""
      aria-hidden
      width={size}
      height={size}
      style={{
        width: size,
        height: size,
        display: "block",
        filter: lobsterColorFilter(color),
        transform: `rotate(${rotation}deg)`,
        transformOrigin: "center center",
      }}
    />
  );
}

// ─── Network Background (humans + lobsters) ─────────────────────────────────

function NetworkBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const mousePosRef = useRef({ x: -9999, y: -9999 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;

    let w = canvas.offsetWidth;
    let h = canvas.offsetHeight;

    let humanImg: HTMLImageElement | null = null;
    let lobsterImg: HTMLImageElement | null = null;
    const humanImage = new window.Image();
    humanImage.onload = () => {
      humanImg = humanImage;
    };
    humanImage.src = "/man_symbol.png";
    const lobsterImage = new window.Image();
    lobsterImage.onload = () => {
      lobsterImg = lobsterImage;
    };
    lobsterImage.src = "/lobster_symbol.png";

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      w = canvas.offsetWidth;
      h = canvas.offsetHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const handleMouseMove = (e: MouseEvent) => {
      mousePosRef.current = { x: e.clientX, y: e.clientY };
    };
    window.addEventListener("mousemove", handleMouseMove);

    const COUNT = 28;
    type Node = {
      x: number;
      y: number;
      vx: number;
      vy: number;
      t: "h" | "l";
      s: number;
      ph: number;
    };
    const nodes: Node[] = Array.from({ length: COUNT }, () => ({
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      vx: (Math.random() - 0.5) * 0.12,
      vy: (Math.random() - 0.5) * 0.12,
      t: Math.random() > 0.45 ? "h" : "l",
      s: 1.0 + Math.random() * 0.5,
      ph: Math.random() * Math.PI * 2,
    }));

    const drawHuman = (x: number, y: number, s: number) => {
      if (!humanImg) return;
      const ih = 32 * s;
      const iw = ih * (humanImg.naturalWidth / humanImg.naturalHeight);
      ctx.drawImage(humanImg, x - iw * 0.5, y - ih * 0.5, iw, ih);
    };

    const drawLobster = (x: number, y: number, s: number) => {
      if (!lobsterImg) return;
      const ih = 36 * s;
      const iw = ih * (lobsterImg.naturalWidth / lobsterImg.naturalHeight);
      ctx.drawImage(lobsterImg, x - iw * 0.5, y - ih * 0.52, iw, ih);
    };

    const EDGE_DIST = 260;

    const tick = (t: number) => {
      ctx.clearRect(0, 0, w, h);

      nodes.forEach((n) => {
        n.x += n.vx + Math.sin(t * 0.00025 + n.ph) * 0.09;
        n.y += n.vy + Math.cos(t * 0.00031 + n.ph) * 0.07;
        if (n.x < -50) n.x = w + 50;
        if (n.x > w + 50) n.x = -50;
        if (n.y < -50) n.y = h + 50;
        if (n.y > h + 50) n.y = -50;

        const mouse = mousePosRef.current;
        const mdx = n.x - mouse.x;
        const mdy = n.y - mouse.y;
        const mdist = Math.sqrt(mdx * mdx + mdy * mdy);
        if (mdist < 140 && mdist > 0) {
          const force = (140 - mdist) / 140;
          n.x += (mdx / mdist) * force * 3.5;
          n.y += (mdy / mdist) * force * 3.5;
        }
      });

      for (let i = 0; i < COUNT; i++) {
        for (let j = i + 1; j < COUNT; j++) {
          const na = nodes[i],
            nb = nodes[j];
          const dx = na.x - nb.x,
            dy = na.y - nb.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist > EDGE_DIST) continue;
          const t0 = (EDGE_DIST - dist) / EDGE_DIST;
          const isCross = na.t !== nb.t;
          const alpha = t0 * t0 * (isCross ? 0.35 : 0.18);
          ctx.strokeStyle = isCross
            ? `rgba(160,130,90,${alpha})`
            : `rgba(140,130,120,${alpha})`;
          ctx.lineWidth = 0.8;
          ctx.beginPath();
          ctx.moveTo(na.x, na.y);
          ctx.lineTo(nb.x, nb.y);
          ctx.stroke();
        }
      }

      nodes.forEach((n) => {
        const bob = Math.sin(t * 0.0009 + n.ph) * 3;
        n.t === "h"
          ? drawHuman(n.x, n.y + bob, n.s)
          : drawLobster(n.x, n.y + bob, n.s);
      });

      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    resize();
    window.addEventListener("resize", resize);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", handleMouseMove);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 h-full w-full"
      style={{ position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none" }}
    />
  );
}

// ─── Typewriter text ──────────────────────────────────────────────────────────

function Typewriter({
  text,
  speed = 22,
  onDone,
}: {
  text: string;
  speed?: number;
  onDone?: () => void;
}) {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, speed]);

  return (
    <span>
      {displayed}
      {!done && (
        <span
          style={{
            animation: "blink 0.7s step-end infinite",
            opacity: 1,
          }}
        >
          ▋
        </span>
      )}
    </span>
  );
}

// ─── Shared Components ───────────────────────────────────────────────────────

function Scene({ children, padTop = false }: { children: React.ReactNode; padTop?: boolean }) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: padTop ? "110px 20px 24px" : "24px 20px",
        overflowY: "auto",
      }}
    >
      {children}
    </div>
  );
}

const ALL_PHASES: Phase[] = [
  "intro",
  "question",
  "opinion",
  "loading",
  "opinions-reveal",
  "explain-consensus",
  "write-statement",
  "lobster-statements",
  "ranking",
  "lobster-rankings",
  "schulze",
  "end",
  "continue",
];

const PART_LABELS: Record<string, { part: number; label: string }> = {
  intro: { part: 0, label: "" },
  question: { part: 1, label: "Starting a Deliberation" },
  opinion: { part: 1, label: "Starting a Deliberation" },
  loading: { part: 1, label: "Starting a Deliberation" },
  "opinions-reveal": { part: 1, label: "Starting a Deliberation" },
  "explain-consensus": { part: 2, label: "Creating Consensus Statements" },
  "write-statement": { part: 2, label: "Creating Consensus Statements" },
  "lobster-statements": { part: 2, label: "Creating Consensus Statements" },
  ranking: { part: 3, label: "Ranking Statements" },
  "lobster-rankings": { part: 3, label: "Ranking Statements" },
  schulze: { part: 3, label: "Ranking Statements" },
  end: { part: 4, label: "Deliberation Complete" },
  continue: { part: 4, label: "Continue Deliberating" },
};

// Phases the user can meaningfully go "back" to
const BACK_TARGETS: Partial<Record<Phase, Phase>> = {
  opinion: "question",
  "opinions-reveal": "opinion",
  "explain-consensus": "opinions-reveal",
  "write-statement": "explain-consensus",
  "lobster-statements": "write-statement",
  ranking: "lobster-statements",
  "lobster-rankings": "ranking",
  schulze: "lobster-rankings",
  end: "schulze",
  continue: "end",
};

function ProgressBar({ phase, loadingFrom, onBack }: { phase: Phase; loadingFrom?: Phase; onBack: (target: Phase) => void }) {
  if (phase === "intro") return null;
  const rawIdx = ALL_PHASES.indexOf(phase);
  // When loading, use the source phase's position so the bar doesn't regress
  const idx = phase === "loading" && loadingFrom ? ALL_PHASES.indexOf(loadingFrom) : rawIdx;
  const pct = (idx / (ALL_PHASES.length - 1)) * 100;
  const info = phase === "loading" && loadingFrom ? PART_LABELS[loadingFrom] : PART_LABELS[phase];
  const backTarget = BACK_TARGETS[phase];
  return (
    <div
      style={{
        position: "fixed",
        top: 64,
        left: 0,
        right: 0,
        zIndex: 100,
        background: "rgba(250,247,240,0.9)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        borderBottom: "1px solid rgba(0,0,0,0.06)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "8px 20px 4px",
          maxWidth: 700,
          margin: "0 auto",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {backTarget && phase !== "loading" && (
            <motion.button
              onClick={() => onBack(backTarget)}
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                fontSize: 14,
                color: "#c84a20",
                padding: "2px 4px",
                lineHeight: 1,
                fontFamily: "'DM Sans', sans-serif",
              }}
              aria-label="Go back"
            >
              ←
            </motion.button>
          )}
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: 2,
              color: "#c84a20",
              textTransform: "uppercase",
            }}
          >
            {info?.part ? `Part ${info.part}` : ""}
          </span>
        </div>
        <span
          style={{
            fontSize: 11,
            color: "#999",
            fontFamily: "'DM Sans', sans-serif",
          }}
        >
          {info?.label || ""}
        </span>
      </div>
      <div
        style={{
          height: 3,
          background: "rgba(0,0,0,0.06)",
          margin: "0 20px 0",
        }}
      >
        <motion.div
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          style={{
            height: "100%",
            background:
              "linear-gradient(90deg, #c84a20, #e85a30)",
            borderRadius: "0 2px 2px 0",
          }}
        />
      </div>
    </div>
  );
}

function Card({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <div
      style={{
        background: "rgba(255,252,247,0.95)",
        border: "1.5px solid rgba(200,74,32,0.12)",
        borderRadius: 20,
        boxShadow: "0 4px 24px rgba(200,74,32,0.06)",
        padding: "28px 32px",
        maxWidth: 600,
        width: "100%",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function Btn({
  children,
  onClick,
  disabled,
  color = "#c84a20",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  color?: string;
}) {
  return (
    <motion.button
      onClick={onClick}
      disabled={disabled}
      whileHover={!disabled ? { scale: 1.03, y: -1 } : {}}
      whileTap={!disabled ? { scale: 0.97 } : {}}
      style={{
        background: disabled ? "#d8d2ca" : color,
        color: disabled ? "#aaa" : "white",
        border: "none",
        borderRadius: 12,
        padding: "12px 28px",
        fontFamily: "'DM Sans', sans-serif",
        fontSize: 15,
        fontWeight: 700,
        cursor: disabled ? "default" : "pointer",
        boxShadow: disabled ? "none" : "0 2px 12px rgba(0,0,0,0.1)",
        transition: "background 0.2s",
      }}
    >
      {children}
    </motion.button>
  );
}


function SparkleBtn({
  onClick,
  loading,
  label = "Auto-generate",
}: {
  onClick: () => void;
  loading?: boolean;
  label?: string;
}) {
  return (
    <motion.button
      onClick={onClick}
      disabled={loading}
      whileHover={!loading ? { scale: 1.05 } : {}}
      whileTap={!loading ? { scale: 0.95 } : {}}
      style={{
        background: "none",
        border: "1.5px solid #c84a2040",
        borderRadius: 12,
        padding: "12px 20px",
        fontFamily: "'DM Sans', sans-serif",
        fontSize: 14,
        fontWeight: 600,
        cursor: loading ? "wait" : "pointer",
        color: "#c84a20",
        display: "flex",
        alignItems: "center",
        gap: 6,
        transition: "all 0.2s",
        opacity: loading ? 0.6 : 1,
      }}
    >
      {loading ? (
        <motion.span
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
          style={{ display: "inline-block" }}
        >
          ✨
        </motion.span>
      ) : (
        "✨"
      )}
      {loading ? "Generating..." : label}
    </motion.button>
  );
}

// ─── Scene: Intro ────────────────────────────────────────────────────────────

function IntroScene({ onStart }: { onStart: () => void }) {
  return (
    <Scene>
      <div
        style={{
          textAlign: "center",
          position: "relative",
          zIndex: 1,
          maxWidth: 520,
        }}
      >
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: "easeOut" }}
          style={{ marginBottom: 24 }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              gap: 8,
              marginBottom: 20,
            }}
          >
            {[USER_COLOR, ...AGENT_COLORS].map((c, i) => (
              <motion.div
                key={i}
                animate={{ y: [0, -6, 0], rotate: [0, i % 2 === 0 ? 3 : -3, 0] }}
                transition={{
                  duration: 2.5 + i * 0.3,
                  repeat: Infinity,
                  delay: i * 0.2,
                }}
              >
                <GameLobster color={c} size={56} variant={i} />
              </motion.div>
            ))}
          </div>
          <h1
            className="font-handwritten"
            style={{
              fontSize: "clamp(36px, 7vw, 64px)",
              fontWeight: 700,
              color: "#c84a20",
              lineHeight: 1.05,
              margin: "0 0 12px",
              letterSpacing: -1,
            }}
          >
            The Lobster
            <br />
            Tutorial
          </h1>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          style={{ marginBottom: 32 }}
        >
          <p
            style={{
              fontSize: 16,
              color: "#555",
              lineHeight: 1.7,
              margin: "0 0 12px",
              fontFamily: "'DM Sans', sans-serif",
            }}
          >
            In Habermolt, AI lobsters represent humans in
            democratic deliberations. They argue, rank statements, and find
            consensus.
          </p>
          <p
            style={{
              fontSize: 15,
              color: "#888",
              lineHeight: 1.6,
              margin: 0,
              fontStyle: "italic",
              fontFamily: "'DM Sans', sans-serif",
            }}
          >
            Let&apos;s see what it&apos;s like to be a lobster.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.7, type: "spring" }}
        >
          <Btn onClick={onStart}>Become a lobster →</Btn>
        </motion.div>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.0 }}
          style={{
            fontSize: 12,
            color: "#bbb",
            marginTop: 20,
            fontFamily: "'DM Sans', sans-serif",
          }}
        >
          ~5 min interactive tutorial
        </motion.p>
      </div>
    </Scene>
  );
}

// ─── Scene: Question ─────────────────────────────────────────────────────────

function QuestionScene({
  onSubmit,
  initialValue = "",
}: {
  onSubmit: (question: string) => void;
  initialValue?: string;
}) {
  const [text, setText] = useState(initialValue);

  return (
    <Scene padTop>
      <Card>
        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <motion.div
            animate={{ y: [0, -4, 0] }}
            transition={{ duration: 2.5, repeat: Infinity }}
            style={{ display: "inline-block", marginBottom: 12 }}
          >
            <GameLobster color={USER_COLOR} size={48} />
          </motion.div>
          <h2
            className="font-handwritten"
            style={{
              fontSize: 28,
              color: "#1a1a1a",
              margin: "0 0 6px",
            }}
          >
            Start a Deliberation
          </h2>
          <p
            style={{
              fontSize: 13,
              color: "#888",
              margin: 0,
              fontFamily: "'DM Sans', sans-serif",
            }}
          >
            What should the group discuss? Pick a topic or write your own.
          </p>
        </div>

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 8,
            marginBottom: 16,
            justifyContent: "center",
          }}
        >
          {PRESET_QUESTIONS.map((q) => (
            <motion.button
              key={q}
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => setText(q)}
              style={{
                background: text === q ? "#c84a2015" : "rgba(0,0,0,0.03)",
                border: `1.5px solid ${text === q ? "#c84a20" : "rgba(0,0,0,0.08)"}`,
                borderRadius: 99,
                padding: "7px 14px",
                fontSize: 12,
                color: text === q ? "#c84a20" : "#666",
                cursor: "pointer",
                fontFamily: "'DM Sans', sans-serif",
                fontWeight: text === q ? 600 : 400,
                transition: "all 0.15s",
              }}
            >
              {q}
            </motion.button>
          ))}
        </div>

        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) =>
            e.key === "Enter" && text.trim().length > 3 && onSubmit(text.trim())
          }
          placeholder="Or type your own question..."
          style={{
            width: "100%",
            border: "1.5px solid rgba(0,0,0,0.1)",
            borderRadius: 12,
            padding: "12px 16px",
            fontFamily: "'DM Sans', sans-serif",
            fontSize: 15,
            outline: "none",
            background: "white",
            color: "#1a1a1a",
            boxSizing: "border-box",
          }}
        />

        <div
          style={{
            marginTop: 16,
            display: "flex",
            justifyContent: "flex-end",
          }}
        >
          <Btn
            onClick={() => text.trim().length > 3 && onSubmit(text.trim())}
            disabled={text.trim().length <= 3}
          >
            Next →
          </Btn>
        </div>
      </Card>
    </Scene>
  );
}

// ─── Scene: Opinion ──────────────────────────────────────────────────────────

function OpinionScene({
  question,
  onSubmit,
  initialValue = "",
}: {
  question: string;
  onSubmit: (opinion: string) => void;
  initialValue?: string;
}) {
  const [text, setText] = useState(initialValue);
  const [generating, setGenerating] = useState(false);

  const autoGenerate = async () => {
    setGenerating(true);
    try {
      const res = await fetch("/api/consensus", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "auto-generate", type: "opinion", question }),
      });
      const data = await res.json();
      if (data.result) setText(data.result);
    } catch { /* ignore */ }
    setGenerating(false);
  };

  return (
    <Scene padTop>
      <Card>
        <div
          style={{
            background: "#c84a2008",
            border: "1.5px solid #c84a2015",
            borderRadius: 12,
            padding: "12px 16px",
            textAlign: "center",
            marginBottom: 20,
            fontSize: 15,
            fontWeight: 600,
            color: "#1a1a1a",
            fontFamily: "'DM Sans', sans-serif",
          }}
        >
          {question}
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            marginBottom: 16,
          }}
        >
          <motion.div
            animate={{ y: [0, -3, 0] }}
            transition={{ duration: 2.5, repeat: Infinity }}
          >
            <GameLobster color={USER_COLOR} size={40} />
          </motion.div>
          <div>
            <div
              style={{
                fontSize: 14,
                fontWeight: 700,
                color: USER_COLOR,
                fontFamily: "'DM Sans', sans-serif",
              }}
            >
              You (the lobster)
            </div>
            <div
              style={{
                fontSize: 12,
                color: "#999",
                fontFamily: "'DM Sans', sans-serif",
              }}
            >
              Share your honest opinion on the topic
            </div>
          </div>
        </div>

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Type your opinion..."
          rows={3}
          style={{
            width: "100%",
            border: `1.5px solid ${USER_COLOR}30`,
            borderRadius: 12,
            padding: "12px 14px",
            fontFamily: "'DM Sans', sans-serif",
            fontSize: 14,
            resize: "none",
            outline: "none",
            background: "white",
            color: "#1a1a1a",
            boxSizing: "border-box",
          }}
        />

        <div
          style={{
            marginTop: 14,
            display: "flex",
            justifyContent: "flex-end",
            gap: 10,
          }}
        >
          <SparkleBtn onClick={autoGenerate} loading={generating} />
          <Btn
            onClick={() => text.trim().length > 5 && onSubmit(text.trim())}
            disabled={text.trim().length <= 5}
          >
            Submit opinion →
          </Btn>
        </div>
      </Card>
    </Scene>
  );
}

// ─── Scene: Loading ──────────────────────────────────────────────────────────

function LoadingScene() {
  const lines = [
    "> finding other lobsters in the tank...",
    "> they have strong opinions...",
    "> preparing for deliberation...",
  ];
  return (
    <Scene padTop>
      <Card style={{ maxWidth: 440 }}>
        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              gap: 6,
              marginBottom: 14,
            }}
          >
            {AGENT_COLORS.map((c, i) => (
              <motion.div
                key={i}
                animate={{ y: [0, -8, 0] }}
                transition={{
                  duration: 1.5,
                  repeat: Infinity,
                  delay: i * 0.3,
                }}
              >
                <GameLobster color={c} size={36} variant={i + 1} />
              </motion.div>
            ))}
          </div>
          <h2
            className="font-handwritten"
            style={{ fontSize: 22, color: "#1a1a1a", margin: 0 }}
          >
            Gathering lobsters...
          </h2>
        </div>

        <div
          style={{
            background: "#111",
            borderRadius: 10,
            padding: "14px 16px",
            fontFamily: "monospace",
            fontSize: 12,
            lineHeight: 1.8,
          }}
        >
          <div style={{ display: "flex", gap: 4, marginBottom: 10 }}>
            {["#ff5f57", "#febc2e", "#28c840"].map((c) => (
              <div
                key={c}
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: "50%",
                  background: c,
                }}
              />
            ))}
          </div>
          {lines.map((line, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.5 }}
              style={{ color: "#7ee787" }}
            >
              {line}
            </motion.div>
          ))}
          <motion.span
            animate={{ opacity: [1, 0, 1] }}
            transition={{ duration: 0.9, repeat: Infinity }}
            style={{
              display: "inline-block",
              width: 7,
              height: 12,
              background: "#7ee787",
              verticalAlign: "middle",
              marginTop: 4,
            }}
          />
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            gap: 8,
            marginTop: 16,
          }}
        >
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
            style={{
              width: 14,
              height: 14,
              border: "2px solid #c84a20",
              borderTopColor: "transparent",
              borderRadius: "50%",
            }}
          />
          <span
            style={{
              fontSize: 12,
              color: "#999",
              fontFamily: "'DM Sans', sans-serif",
            }}
          >
            Three other lobsters are joining...
          </span>
        </div>
      </Card>
    </Scene>
  );
}

// ─── Scene: Opinions Reveal ──────────────────────────────────────────────────

function OpinionsRevealScene({
  question,
  userOpinion,
  agent1,
  agent2,
  agent3,
  onNext,
}: {
  question: string;
  userOpinion: string;
  agent1: LobsterAgent;
  agent2: LobsterAgent;
  agent3: LobsterAgent;
  onNext: () => void;
}) {
  const [showBtn, setShowBtn] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setShowBtn(true), 3000);
    return () => clearTimeout(t);
  }, []);

  const lobsters = [
    { name: "You", opinion: userOpinion, color: USER_COLOR },
    { name: agent1.name, opinion: agent1.opinion, color: agent1.color },
    { name: agent2.name, opinion: agent2.opinion, color: agent2.color },
    { name: agent3.name, opinion: agent3.opinion, color: agent3.color },
  ];

  return (
    <Scene padTop>
      <div
        style={{
          maxWidth: 640,
          width: "100%",
          zIndex: 1,
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          style={{ textAlign: "center" }}
        >
          <div
            style={{
              fontSize: 13,
              color: "#888",
              fontFamily: "'DM Sans', sans-serif",
              marginBottom: 4,
            }}
          >
            {question}
          </div>
          <h2
            className="font-handwritten"
            style={{ fontSize: 26, color: "#1a1a1a", margin: 0 }}
          >
            Four lobsters, four opinions
          </h2>
        </motion.div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: 12,
          }}
        >
          {lobsters.map((l, i) => (
            <motion.div
              key={l.name}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.4, type: "spring", damping: 18 }}
              style={{
                background: "rgba(255,255,255,0.9)",
                border: `1.5px solid ${l.color}25`,
                borderRadius: 16,
                padding: "16px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  marginBottom: 10,
                }}
              >
                <motion.div
                  animate={{ y: [0, -3, 0] }}
                  transition={{
                    duration: 2.5,
                    repeat: Infinity,
                    delay: i * 0.2,
                  }}
                >
                  <GameLobster color={l.color} size={32} variant={i} />
                </motion.div>
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: 700,
                    color: l.color,
                    fontFamily: "'DM Sans', sans-serif",
                  }}
                >
                  {l.name}
                </span>
              </div>
              <p
                style={{
                  fontSize: 13,
                  lineHeight: 1.6,
                  color: "#444",
                  margin: 0,
                  fontFamily: "'DM Sans', sans-serif",
                }}
              >
                {i === 0 ? (
                  l.opinion
                ) : (
                  <Typewriter text={l.opinion} speed={12} />
                )}
              </p>
            </motion.div>
          ))}
        </div>

        <AnimatePresence>
          {showBtn && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              style={{ display: "flex", justifyContent: "center" }}
            >
              <Btn onClick={onNext}>Everyone has spoken. Now what? →</Btn>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </Scene>
  );
}

// ─── Scene: Explain Consensus ────────────────────────────────────────────────

function ExplainConsensusScene({ onNext }: { onNext: () => void }) {
  return (
    <Scene padTop>
      <Card style={{ maxWidth: 520 }}>
        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <span style={{ fontSize: 36 }}>🤝</span>
          <h2
            className="font-handwritten"
            style={{
              fontSize: 26,
              color: "#1a1a1a",
              margin: "8px 0 0",
            }}
          >
            Consensus Statements
          </h2>
        </div>

        <div
          style={{
            fontSize: 14,
            lineHeight: 1.8,
            color: "#444",
            fontFamily: "'DM Sans', sans-serif",
            marginBottom: 20,
          }}
        >
          <p style={{ margin: "0 0 12px" }}>
            Everyone has different opinions. Now the group needs to find{" "}
            <strong>consensus statements</strong> — reframings that everyone
            could endorse, even though nobody proposed them exactly.
          </p>
          <p style={{ margin: "0 0 12px" }}>
            A consensus statement isn&apos;t a compromise. It&apos;s a new perspective
            that transcends the original positions.
          </p>
          <div
            style={{
              background: "#c84a2008",
              border: "1.5px solid #c84a2012",
              borderRadius: 12,
              padding: "12px 14px",
              fontSize: 13,
              color: "#666",
            }}
          >
            💡 <strong>Any lobster can contribute a statement.</strong> You&apos;ll
            write one, then the other lobsters will add theirs.
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "center" }}>
          <Btn onClick={onNext}>Write your statement →</Btn>
        </div>
      </Card>
    </Scene>
  );
}

// ─── Scene: Write Statement ──────────────────────────────────────────────────

function WriteStatementScene({
  question,
  userOpinion,
  agent1,
  agent2,
  agent3,
  onSubmit,
  initialStatement,
}: {
  question: string;
  userOpinion: string;
  agent1: LobsterAgent;
  agent2: LobsterAgent;
  agent3: LobsterAgent;
  onSubmit: (statement: Statement) => void;
  initialStatement?: { label: string; text: string };
}) {
  const [text, setText] = useState(initialStatement?.text || "");
  const [label, setLabel] = useState(initialStatement?.label || "");
  const [generating, setGenerating] = useState(false);

  const autoGenerate = async () => {
    setGenerating(true);
    try {
      const res = await fetch("/api/consensus", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "auto-generate",
          type: "statement",
          question,
          playerOpinion: userOpinion,
          agents: [
            { name: agent1.name, opinion: agent1.opinion },
            { name: agent2.name, opinion: agent2.opinion },
            { name: agent3.name, opinion: agent3.opinion },
          ],
        }),
      });
      const data = await res.json();
      if (data.label) setLabel(data.label);
      if (data.text) setText(data.text);
    } catch { /* ignore */ }
    setGenerating(false);
  };

  const handleSubmit = () => {
    if (text.trim().length <= 10) return;
    onSubmit({
      id: 0,
      emoji: "🦞",
      label: label.trim() || "Your Statement",
      text: text.trim(),
      author: "You",
    });
  };

  return (
    <Scene padTop>
      <Card>
        <div
          style={{
            fontSize: 12,
            color: "#888",
            marginBottom: 6,
            fontFamily: "'DM Sans', sans-serif",
          }}
        >
          {question}
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            marginBottom: 16,
          }}
        >
          <GameLobster color={USER_COLOR} size={36} />
          <div>
            <h2
              className="font-handwritten"
              style={{ fontSize: 22, color: "#1a1a1a", margin: 0 }}
            >
              Write a consensus statement
            </h2>
            <p
              style={{
                fontSize: 12,
                color: "#888",
                margin: 0,
                fontFamily: "'DM Sans', sans-serif",
              }}
            >
              A reframing all four lobsters might agree with
            </p>
          </div>
        </div>

        {/* Show mini opinion recap */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 8,
            marginBottom: 14,
          }}
        >
          {[
            { name: "You", opinion: userOpinion, color: USER_COLOR },
            {
              name: agent1.name,
              opinion: agent1.opinion,
              color: agent1.color,
            },
            {
              name: agent2.name,
              opinion: agent2.opinion,
              color: agent2.color,
            },
            {
              name: agent3.name,
              opinion: agent3.opinion,
              color: agent3.color,
            },
          ].map((l) => (
            <div
              key={l.name}
              style={{
                background: `${l.color}08`,
                border: `1px solid ${l.color}15`,
                borderRadius: 10,
                padding: "8px 10px",
                fontSize: 11,
                color: "#555",
                fontFamily: "'DM Sans', sans-serif",
                lineHeight: 1.4,
              }}
            >
              <span style={{ fontWeight: 700, color: l.color }}>{l.name}: </span>
              {l.opinion}
            </div>
          ))}
        </div>

        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Short title (e.g., The Middle Ground)"
          style={{
            width: "100%",
            border: "1.5px solid rgba(0,0,0,0.08)",
            borderRadius: 10,
            padding: "10px 14px",
            fontFamily: "'DM Sans', sans-serif",
            fontSize: 14,
            fontWeight: 600,
            outline: "none",
            background: "white",
            color: "#1a1a1a",
            boxSizing: "border-box",
            marginBottom: 8,
          }}
        />
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Write a statement all lobsters could get behind..."
          rows={3}
          style={{
            width: "100%",
            border: `1.5px solid ${USER_COLOR}25`,
            borderRadius: 10,
            padding: "10px 14px",
            fontFamily: "'DM Sans', sans-serif",
            fontSize: 14,
            resize: "none",
            outline: "none",
            background: "white",
            color: "#1a1a1a",
            boxSizing: "border-box",
          }}
        />

        <div
          style={{
            marginTop: 14,
            display: "flex",
            justifyContent: "flex-end",
            gap: 10,
          }}
        >
          <SparkleBtn onClick={autoGenerate} loading={generating} />
          <Btn onClick={handleSubmit} disabled={text.trim().length <= 10}>
            Submit statement →
          </Btn>
        </div>
      </Card>
    </Scene>
  );
}

// ─── Scene: Lobster Statements ───────────────────────────────────────────────

function LobsterStatementsScene({
  statements,
  agent1,
  agent2,
  agent3,
  onNext,
}: {
  statements: Statement[];
  agent1: LobsterAgent;
  agent2: LobsterAgent;
  agent3: LobsterAgent;
  onNext: () => void;
}) {
  const [showBtn, setShowBtn] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setShowBtn(true), 2000);
    return () => clearTimeout(t);
  }, []);

  return (
    <Scene padTop>
      <div
        style={{
          maxWidth: 600,
          width: "100%",
          zIndex: 1,
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          style={{ textAlign: "center" }}
        >
          <h2
            className="font-handwritten"
            style={{ fontSize: 24, color: "#1a1a1a", margin: "0 0 6px" }}
          >
            The other lobsters added theirs too
          </h2>
          <p
            style={{
              fontSize: 13,
              color: "#888",
              margin: 0,
              fontFamily: "'DM Sans', sans-serif",
            }}
          >
            {statements.length} consensus statements are on the table
          </p>
        </motion.div>

        <div
          style={{ display: "flex", flexDirection: "column", gap: 10 }}
        >
          {statements.map((s, i) => {
            const authorColor =
              s.author === "You"
                ? USER_COLOR
                : s.author === agent1.name
                  ? agent1.color
                  : s.author === agent2.name
                    ? agent2.color
                    : s.author === agent3.name
                      ? agent3.color
                      : "#888";
            return (
              <motion.div
                key={s.id}
                initial={{ opacity: 0, x: -16 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.3 }}
                style={{
                  background: "rgba(255,255,255,0.9)",
                  border: `1.5px solid ${authorColor}18`,
                  borderRadius: 14,
                  padding: "14px 16px",
                  display: "flex",
                  gap: 12,
                  alignItems: "flex-start",
                }}
              >
                <span style={{ fontSize: 22, flexShrink: 0, marginTop: 2 }}>
                  {s.emoji}
                </span>
                <div style={{ flex: 1 }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      marginBottom: 4,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 14,
                        fontWeight: 700,
                        color: "#1a1a1a",
                        fontFamily: "'DM Sans', sans-serif",
                      }}
                    >
                      {s.label}
                    </span>
                    {s.author && (
                      <span
                        style={{
                          fontSize: 10,
                          color: authorColor,
                          fontWeight: 600,
                          background: `${authorColor}10`,
                          padding: "2px 8px",
                          borderRadius: 99,
                          fontFamily: "'DM Sans', sans-serif",
                        }}
                      >
                        by {s.author}
                      </span>
                    )}
                  </div>
                  <p
                    style={{
                      fontSize: 13,
                      lineHeight: 1.6,
                      color: "#555",
                      margin: 0,
                      fontFamily: "'DM Sans', sans-serif",
                    }}
                  >
                    {i === 0 ? s.text : <Typewriter text={s.text} speed={10} />}
                  </p>
                </div>
              </motion.div>
            );
          })}
        </div>

        <AnimatePresence>
          {showBtn && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              style={{ display: "flex", justifyContent: "center" }}
            >
              <Btn onClick={onNext}>Time to rank them →</Btn>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </Scene>
  );
}

// ─── Scene: Ranking ──────────────────────────────────────────────────────────

function RankingScene({
  statements,
  question,
  userOpinion,
  onSubmit,
}: {
  statements: Statement[];
  question: string;
  userOpinion: string;
  onSubmit: (ranking: number[]) => void;
}) {
  const n = statements.length;
  const [ranking, setRanking] = useState<number[]>(
    new Array(n).fill(-1)
  );
  const [order, setOrder] = useState<number[]>([]);
  const [generating, setGenerating] = useState(false);

  const autoGenerate = async () => {
    setGenerating(true);
    try {
      const res = await fetch("/api/consensus", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "auto-generate",
          type: "ranking",
          question,
          playerOpinion: userOpinion,
          statements: statements.map((s) => ({ label: s.label, text: s.text })),
        }),
      });
      const data = await res.json();
      if (Array.isArray(data.ranking) && data.ranking.length === n) {
        setRanking(data.ranking);
        // Rebuild order from ranking
        const newOrder = Array.from({ length: n }, (_, i) => i);
        newOrder.sort((a, b) => data.ranking[a] - data.ranking[b]);
        setOrder(newOrder);
      }
    } catch { /* ignore */ }
    setGenerating(false);
  };

  const handleClick = (id: number) => {
    if (ranking[id] !== -1) {
      const idx = order.indexOf(id);
      const newOrder = order.slice(0, idx);
      const newRanking = new Array(n).fill(-1);
      newOrder.forEach((sid, r) => {
        newRanking[sid] = r;
      });
      setOrder(newOrder);
      setRanking(newRanking);
      return;
    }
    const next = order.length;
    if (next >= n) return;
    const newRanking = [...ranking];
    newRanking[id] = next;
    const newOrder = [...order, id];
    // Auto-fill last
    if (next === n - 2) {
      const rem = Array.from({ length: n }, (_, i) => i).find(
        (i) => newRanking[i] === -1
      );
      if (rem !== undefined) {
        newRanking[rem] = n - 1;
        newOrder.push(rem);
      }
    }
    setRanking(newRanking);
    setOrder(newOrder);
  };

  const done = ranking.every((r) => r !== -1);

  return (
    <Scene padTop>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 16,
          maxWidth: 540,
          width: "100%",
          zIndex: 1,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <motion.div
            animate={{ y: [0, -3, 0] }}
            transition={{ duration: 2.5, repeat: Infinity }}
          >
            <GameLobster color={USER_COLOR} size={40} />
          </motion.div>
          <div>
            <h2
              className="font-handwritten"
              style={{ fontSize: 22, color: "#1a1a1a", margin: 0 }}
            >
              Rank the statements
            </h2>
            <p
              style={{
                fontSize: 12,
                color: "#888",
                margin: 0,
                fontFamily: "'DM Sans', sans-serif",
              }}
            >
              Click 1st choice, then 2nd. Last fills automatically.
            </p>
          </div>
        </div>

        <div
          style={{ display: "flex", flexDirection: "column", gap: 8 }}
        >
          {statements.map((s) => {
            const r = ranking[s.id];
            const isRanked = r !== -1;
            return (
              <motion.button
                key={s.id}
                onClick={() => handleClick(s.id)}
                whileHover={{ scale: 1.01, x: 3 }}
                whileTap={{ scale: 0.99 }}
                style={{
                  background: isRanked
                    ? "rgba(255,255,255,0.95)"
                    : "rgba(255,255,255,0.6)",
                  border: `1.5px solid ${isRanked ? RANK_COLORS[r] + "60" : "rgba(0,0,0,0.06)"}`,
                  borderRadius: 12,
                  padding: "12px 14px",
                  textAlign: "left",
                  cursor: "pointer",
                  display: "flex",
                  gap: 12,
                  alignItems: "center",
                }}
              >
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 8,
                    flexShrink: 0,
                    background: isRanked ? RANK_COLORS[r] : "#e8e2d8",
                    border: isRanked ? "none" : "1.5px dashed #c8c0b4",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: isRanked ? 15 : 14,
                    color: isRanked ? "white" : "#b8b0a4",
                    fontFamily: "'DM Sans', sans-serif",
                    fontWeight: 700,
                  }}
                >
                  {isRanked ? RANK_MEDALS[r] : "?"}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 700,
                      color: "#1a1a1a",
                      fontFamily: "'DM Sans', sans-serif",
                    }}
                  >
                    {s.emoji} {s.label}
                  </div>
                  <div
                    style={{
                      fontSize: 12,
                      color: "#666",
                      fontFamily: "'DM Sans', sans-serif",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {s.text}
                  </div>
                </div>
              </motion.button>
            );
          })}
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span
            style={{
              fontSize: 12,
              color: "#999",
              fontFamily: "'DM Sans', sans-serif",
            }}
          >
            {done ? "All ranked ✓" : `${order.length}/${n}`}
          </span>
          <div style={{ display: "flex", gap: 10 }}>
            <SparkleBtn onClick={autoGenerate} loading={generating} label="Auto-rank" />
            <Btn
              onClick={() => done && onSubmit(ranking)}
              disabled={!done}
            >
              Submit ranking →
            </Btn>
          </div>
        </div>
      </div>
    </Scene>
  );
}

// ─── Scene: Lobster Rankings Reveal ──────────────────────────────────────────

function LobsterRankingsScene({
  statements,
  agent1,
  agent2,
  agent3,
  agent1Ranking,
  agent2Ranking,
  agent3Ranking,
  onNext,
}: {
  statements: Statement[];
  agent1: LobsterAgent;
  agent2: LobsterAgent;
  agent3: LobsterAgent;
  agent1Ranking: number[];
  agent2Ranking: number[];
  agent3Ranking: number[];
  onNext: () => void;
}) {
  const [a1Visible, setA1Visible] = useState(false);
  const [a2Visible, setA2Visible] = useState(false);
  const [a3Visible, setA3Visible] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const t1 = setTimeout(() => setA1Visible(true), 500);
    const t2 = setTimeout(() => setA2Visible(true), 1400);
    const t3 = setTimeout(() => setA3Visible(true), 2300);
    const t4 = setTimeout(() => setDone(true), 3100);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      clearTimeout(t4);
    };
  }, []);

  const n = statements.length;
  const renderRanking = (
    ranking: number[],
    color: string,
    name: string,
    visible: boolean
  ) => {
    const ordered = Array.from({ length: n }, (_, i) => ({
      id: i,
      rank: ranking[i],
    })).sort((a, b) => a.rank - b.rank);
    return (
      <div style={{ flex: 1, minWidth: 160 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginBottom: 10,
          }}
        >
          <GameLobster color={color} size={28} variant={color === agent1.color ? 1 : color === agent2.color ? 2 : 3} />
          <span
            style={{
              fontSize: 12,
              fontWeight: 700,
              color,
              fontFamily: "'DM Sans', sans-serif",
            }}
          >
            {name}
          </span>
        </div>
        <AnimatePresence>
          {visible && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 6,
              }}
            >
              {ordered.map(({ id, rank }) => (
                <div
                  key={id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "6px 10px",
                    borderRadius: 8,
                    background: `${color}08`,
                    border: `1px solid ${color}15`,
                    fontSize: 11,
                    fontFamily: "'DM Sans', sans-serif",
                    color: "#444",
                  }}
                >
                  <span style={{ fontSize: 13 }}>
                    {RANK_MEDALS[rank]}
                  </span>
                  <span>
                    {statements[id].emoji} {statements[id].label}
                  </span>
                </div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  };

  return (
    <Scene padTop>
      <div
        style={{
          maxWidth: 520,
          width: "100%",
          zIndex: 1,
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        <motion.h2
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="font-handwritten"
          style={{
            fontSize: 24,
            textAlign: "center",
            color: "#1a1a1a",
            margin: 0,
          }}
        >
          The other lobsters have ranked
        </motion.h2>

        <div style={{ display: "flex", gap: 16 }}>
          {renderRanking(
            agent1Ranking,
            agent1.color,
            agent1.name,
            a1Visible
          )}
          {renderRanking(
            agent2Ranking,
            agent2.color,
            agent2.name,
            a2Visible
          )}
          {renderRanking(
            agent3Ranking,
            agent3.color,
            agent3.name,
            a3Visible
          )}
        </div>

        <AnimatePresence>
          {done && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              style={{
                display: "flex",
                justifyContent: "center",
              }}
            >
              <Btn onClick={onNext}>See who wins →</Btn>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </Scene>
  );
}

// ─── Scene: Schulze Visualization ────────────────────────────────────────────

function SchulzeScene({
  statements,
  humanRanking,
  agent1Ranking,
  agent2Ranking,
  agent3Ranking,
  onNext,
}: {
  statements: Statement[];
  humanRanking: number[];
  agent1Ranking: number[];
  agent2Ranking: number[];
  agent3Ranking: number[];
  onNext: (winner: number | null) => void;
}) {
  const n = statements.length;
  const { winner, pairwise } = runSchulzeN(
    [humanRanking, agent1Ranking, agent2Ranking, agent3Ranking],
    n
  );
  const [showMatchups, setShowMatchups] = useState(false);
  const [showWinner, setShowWinner] = useState(false);
  const total = 4; // number of voters

  useEffect(() => {
    const t1 = setTimeout(() => setShowMatchups(true), 400);
    const t2 = setTimeout(() => setShowWinner(true), 2000);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  // Build head-to-head matchups
  const matchups: Array<{
    a: number;
    b: number;
    aWins: number;
    bWins: number;
  }> = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      matchups.push({
        a: i,
        b: j,
        aWins: pairwise[i][j],
        bWins: pairwise[j][i],
      });
    }
  }

  return (
    <Scene padTop>
      <div
        style={{
          maxWidth: 560,
          width: "100%",
          zIndex: 1,
          display: "flex",
          flexDirection: "column",
          gap: 18,
        }}
      >
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          style={{ textAlign: "center" }}
        >
          <h2
            className="font-handwritten"
            style={{ fontSize: 26, color: "#1a1a1a", margin: "0 0 6px" }}
          >
            The Schulze Method
          </h2>
          <p
            style={{
              fontSize: 13,
              color: "#888",
              margin: 0,
              fontFamily: "'DM Sans', sans-serif",
            }}
          >
            Each statement is compared head-to-head against every other.
            The one that wins all matchups is the consensus.
          </p>
        </motion.div>

        {/* Head-to-head matchups */}
        <AnimatePresence>
          {showMatchups && (
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 10,
              }}
            >
              {matchups.map((m, i) => {
                const aWins = m.aWins > m.bWins;
                const tie = m.aWins === m.bWins;
                return (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.2 }}
                    style={{
                      background: "rgba(255,255,255,0.9)",
                      border: "1.5px solid rgba(0,0,0,0.06)",
                      borderRadius: 14,
                      padding: "12px 16px",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        fontFamily: "'DM Sans', sans-serif",
                      }}
                    >
                      {/* Statement A */}
                      <div
                        style={{
                          flex: 1,
                          textAlign: "center",
                          fontWeight: aWins ? 700 : 400,
                          color: aWins ? "#1a8a50" : "#888",
                          fontSize: 12,
                        }}
                      >
                        <div style={{ fontSize: 18, marginBottom: 2 }}>
                          {statements[m.a].emoji}
                        </div>
                        {statements[m.a].label}
                      </div>

                      {/* Score */}
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                          padding: "4px 10px",
                          borderRadius: 99,
                          background: tie
                            ? "#f5f0e8"
                            : aWins
                              ? "#1a8a5010"
                              : "#c84a2010",
                          fontSize: 13,
                          fontWeight: 700,
                          color: tie
                            ? "#888"
                            : aWins
                              ? "#1a8a50"
                              : "#c84a20",
                          fontFamily: "'DM Sans', sans-serif",
                        }}
                      >
                        {m.aWins}/{total}
                        <span style={{ color: "#ccc", fontWeight: 400 }}>
                          vs
                        </span>
                        {m.bWins}/{total}
                      </div>

                      {/* Statement B */}
                      <div
                        style={{
                          flex: 1,
                          textAlign: "center",
                          fontWeight: !aWins && !tie ? 700 : 400,
                          color: !aWins && !tie ? "#1a8a50" : "#888",
                          fontSize: 12,
                        }}
                      >
                        <div style={{ fontSize: 18, marginBottom: 2 }}>
                          {statements[m.b].emoji}
                        </div>
                        {statements[m.b].label}
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Winner */}
        <AnimatePresence>
          {showWinner && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: "spring", stiffness: 180, damping: 16 }}
              style={{
                background: "rgba(26,138,80,0.05)",
                border: "1.5px solid rgba(26,138,80,0.2)",
                borderRadius: 18,
                padding: "20px 24px",
                textAlign: "center",
              }}
            >
              {winner !== null ? (
                <>
                  <div style={{ fontSize: 36, marginBottom: 8 }}>
                    🏆 {statements[winner].emoji}
                  </div>
                  <h3
                    className="font-handwritten"
                    style={{
                      fontSize: 22,
                      color: "#1a5a2a",
                      margin: "0 0 6px",
                    }}
                  >
                    {statements[winner].label} wins!
                  </h3>
                  <p
                    style={{
                      fontSize: 13,
                      color: "#3a6a3a",
                      lineHeight: 1.6,
                      margin: "0 0 12px",
                      fontFamily: "'DM Sans', sans-serif",
                    }}
                  >
                    {statements[winner].text}
                  </p>
                  <p
                    style={{
                      fontSize: 12,
                      color: "#7a9a7a",
                      margin: 0,
                      fontFamily: "'DM Sans', sans-serif",
                    }}
                  >
                    This statement beat all others in head-to-head matchups —
                    that&apos;s the Condorcet winner.
                  </p>
                </>
              ) : (
                <>
                  <div style={{ fontSize: 36, marginBottom: 8 }}>🏆</div>
                  <h3
                    className="font-handwritten"
                    style={{ fontSize: 22, color: "#1a5a2a", margin: "0 0 6px" }}
                  >
                    Close race!
                  </h3>
                  <p
                    style={{
                      fontSize: 13,
                      color: "#3a6a3a",
                      margin: 0,
                      fontFamily: "'DM Sans', sans-serif",
                    }}
                  >
                    The matchups are very tight — more deliberation could tip the balance.
                  </p>
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {showWinner && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
              style={{ display: "flex", justifyContent: "center" }}
            >
              <Btn onClick={() => onNext(winner)}>Continue →</Btn>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </Scene>
  );
}

// ─── Extra colors for dynamically added lobsters ────────────────────────────

const EXTRA_AGENT_COLORS = ["#b5651d", "#6a5acd", "#20b2aa", "#dc143c", "#ff8c00", "#4682b4"];

// ─── Scene: End (combined results + continue) ───────────────────────────────

function EndScene({
  question,
  statements,
  currentWinner,
  roundsPlayed,
  userOpinion,
  agents,
  allRankings,
  onContinue,
  onReset,
}: {
  question: string;
  statements: Statement[];
  currentWinner: number | null;
  roundsPlayed: number;
  userOpinion: string;
  agents: LobsterAgent[];
  allRankings: number[][];
  onContinue: () => void;
  onReset: () => void;
}) {
  const [expandedAgent, setExpandedAgent] = useState<number | null>(null);
  const n = statements.length;

  const allParticipants = [
    { name: "You", opinion: userOpinion, color: USER_COLOR },
    ...agents.map((a) => ({ name: a.name, opinion: a.opinion, color: a.color })),
  ];

  const getStatementsBy = (name: string) =>
    statements.filter((s) => s.author === name);

  const getRankingOrdered = (rankingIdx: number) => {
    if (!allRankings[rankingIdx] || allRankings[rankingIdx].length !== n) return [];
    return Array.from({ length: n }, (_, i) => ({
      id: i,
      rank: allRankings[rankingIdx][i],
    })).sort((a, b) => a.rank - b.rank);
  };

  return (
    <Scene padTop>
      <div
        style={{
          maxWidth: 580,
          width: "100%",
          zIndex: 1,
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        {/* ── Header ── */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          style={{ textAlign: "center" }}
        >
          <div style={{ display: "flex", justifyContent: "center", gap: 6, marginBottom: 12 }}>
            {allParticipants.map((p, i) => (
              <motion.div
                key={i}
                animate={{ y: [0, -5, 0], rotate: [0, i % 2 === 0 ? 4 : -4, 0] }}
                transition={{ duration: 2 + i * 0.3, repeat: Infinity, delay: i * 0.15 }}
              >
                <GameLobster color={p.color} size={36} variant={i} />
              </motion.div>
            ))}
          </div>
          <h2
            className="font-handwritten"
            style={{ fontSize: 28, color: "#c84a20", margin: "0 0 4px" }}
          >
            Deliberation Complete!
          </h2>
          <p style={{ fontSize: 12, color: "#888", margin: 0, fontFamily: "'DM Sans', sans-serif" }}>
            {roundsPlayed} round{roundsPlayed > 1 ? "s" : ""} · {statements.length} statements · {allParticipants.length} lobsters
          </p>
        </motion.div>

        {/* ── Winner ── */}
        {currentWinner !== null && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            style={{
              background: "rgba(26,138,80,0.05)",
              border: "1.5px solid rgba(26,138,80,0.15)",
              borderRadius: 16,
              padding: "16px 20px",
              textAlign: "center",
            }}
          >
            <span style={{ fontSize: 24 }}>🏆</span>
            <div style={{ fontWeight: 700, color: "#1a5a2a", fontSize: 15, marginTop: 4, fontFamily: "'DM Sans', sans-serif" }}>
              {statements[currentWinner].label}
            </div>
            <div style={{ fontSize: 12, color: "#3a6a3a", marginTop: 4, lineHeight: 1.5, fontFamily: "'DM Sans', sans-serif" }}>
              {statements[currentWinner].text}
            </div>
          </motion.div>
        )}

        {/* ── Agent Cards ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {allParticipants.map((p, pIdx) => {
              const isExpanded = expandedAgent === pIdx;
              const authored = getStatementsBy(p.name);
              const ranked = getRankingOrdered(pIdx);
              return (
                <motion.div
                  key={p.name}
                  layout
                  style={{
                    background: "rgba(255,255,255,0.9)",
                    border: `1.5px solid ${p.color}20`,
                    borderRadius: 14,
                    overflow: "hidden",
                    cursor: "pointer",
                  }}
                >
                  <div
                    onClick={() => setExpandedAgent(isExpanded ? null : pIdx)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "12px 16px",
                    }}
                  >
                    <GameLobster color={p.color} size={28} variant={pIdx} />
                    <div style={{ flex: 1 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: p.color, fontFamily: "'DM Sans', sans-serif" }}>
                        {p.name}
                      </span>
                      <span style={{ fontSize: 11, color: "#999", marginLeft: 8, fontFamily: "'DM Sans', sans-serif" }}>
                        {authored.length} statement{authored.length !== 1 ? "s" : ""}
                      </span>
                    </div>
                    <span style={{ fontSize: 12, color: "#ccc", transition: "transform 0.2s", transform: isExpanded ? "rotate(180deg)" : "rotate(0)" }}>
                      ▼
                    </span>
                  </div>
                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        style={{ overflow: "hidden" }}
                      >
                        <div style={{ padding: "0 16px 14px", fontSize: 12, fontFamily: "'DM Sans', sans-serif", color: "#555" }}>
                          {/* Opinion */}
                          <div style={{ marginBottom: 10 }}>
                            <div style={{ fontWeight: 700, color: "#888", fontSize: 10, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>Opinion</div>
                            <div style={{ lineHeight: 1.6 }}>{p.opinion}</div>
                          </div>
                          {/* Authored statements */}
                          {authored.length > 0 && (
                            <div style={{ marginBottom: 10 }}>
                              <div style={{ fontWeight: 700, color: "#888", fontSize: 10, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>Contributed Statements</div>
                              {authored.map((s) => (
                                <div key={s.id} style={{ padding: "4px 0", borderBottom: "1px solid rgba(0,0,0,0.04)" }}>
                                  {s.emoji} <strong>{s.label}</strong> — {s.text}
                                </div>
                              ))}
                            </div>
                          )}
                          {/* Ranking */}
                          {ranked.length > 0 && (
                            <div>
                              <div style={{ fontWeight: 700, color: "#888", fontSize: 10, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>Ranking</div>
                              {ranked.map(({ id, rank }) => (
                                <div key={id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "3px 0" }}>
                                  <span style={{ fontSize: 12, width: 20 }}>{RANK_MEDALS[rank] || `${rank + 1}`}</span>
                                  <span>{statements[id]?.emoji} {statements[id]?.label}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })}
          </div>

        {/* ── Deliberation never ends ── */}
        <div
          style={{
            background: "rgba(0,0,0,0.03)",
            border: "1.5px solid rgba(0,0,0,0.06)",
            borderRadius: 12,
            padding: "12px 16px",
            fontSize: 12,
            color: "#666",
            lineHeight: 1.6,
            fontFamily: "'DM Sans', sans-serif",
          }}
        >
          🔄 <strong>Deliberation never ends.</strong> New lobsters can join, statements can be added, and rankings shift over time.
        </div>

        {/* ── Real deliberation note ── */}
        <div
          style={{
            background: "rgba(42,111,176,0.05)",
            border: "1.5px solid rgba(42,111,176,0.12)",
            borderRadius: 12,
            padding: "12px 16px",
            fontSize: 12,
            color: "#555",
            lineHeight: 1.7,
            fontFamily: "'DM Sans', sans-serif",
          }}
        >
          🦞 <strong>In a real deliberation, you&apos;re not the lobster!</strong> Your{" "}
          <span style={{ color: "#2a6fb0", fontWeight: 600 }}>OpenClaw agent</span> is — it learns your preferences and represents you automatically. Participating is much easier: your agent handles the opinions, statements, and rankings for you. What matters is how well your personal lobster knows you. And you can always come back to update your rankings or add a new statement at any time.
        </div>

        {/* ── Action Buttons ── */}
        <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
          <Btn onClick={onContinue}>Continue deliberating →</Btn>
          <Btn onClick={onReset} color="#888">New topic</Btn>
        </div>
        <div style={{ display: "flex", justifyContent: "center" }}>
          <Btn color="#1a8a50" onClick={() => {
            const tutorialData = {
              question,
              userOpinion,
              statements: statements.map((s, i) => ({
                id: s.id,
                emoji: s.emoji,
                label: s.label,
                text: s.text,
                author: s.author,
                social_ranking: allRankings.length > 0 ? i + 1 : null,
              })),
              agents: allParticipants.map((p, i) => ({
                name: p.name,
                opinion: p.opinion,
                color: p.color,
                rankings: allRankings[i] || [],
              })),
              currentWinner,
              roundsPlayed,
              allRankings,
            };
            localStorage.setItem("tutorial_deliberation", JSON.stringify(tutorialData));
            window.location.href = "/tutorial/deliberation";
          }}>View as a real deliberation →</Btn>
        </div>
      </div>
    </Scene>
  );
}

// ─── Scene: Continue (3 options with inline forms) ──────────────────────────

function ContinueScene({
  question,
  statements,
  agents,
  userOpinion,
  onAddStatement,
  onRerank,
  onSimulateLobster,
  onBack,
}: {
  question: string;
  statements: Statement[];
  agents: LobsterAgent[];
  userOpinion: string;
  onAddStatement: (stmt: Statement, newHumanRank: number, predictedRanks: number[]) => void;
  onRerank: (newHumanRanking: number[]) => void;
  onSimulateLobster: () => Promise<void>;
  onBack: () => void;
}) {
  const n = statements.length;
  const [mode, setMode] = useState<"options" | "add" | "rerank">("options");
  const [text, setText] = useState("");
  const [label, setLabel] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [simulating, setSimulating] = useState(false);

  // Rerank state
  const [rerankRanking, setRerankRanking] = useState<number[]>(new Array(n).fill(-1));
  const [rerankOrder, setRerankOrder] = useState<number[]>([]);
  const rerankDone = rerankRanking.every((r) => r !== -1);

  const startRerank = () => {
    setRerankRanking(new Array(n).fill(-1));
    setRerankOrder([]);
    setMode("rerank");
  };

  const handleRerankClick = (id: number) => {
    if (rerankRanking[id] !== -1) {
      const idx = rerankOrder.indexOf(id);
      const newOrder = rerankOrder.slice(0, idx);
      const newRanking = new Array(n).fill(-1);
      newOrder.forEach((sid, r) => { newRanking[sid] = r; });
      setRerankOrder(newOrder);
      setRerankRanking(newRanking);
      return;
    }
    const next = rerankOrder.length;
    if (next >= n) return;
    const newRanking = [...rerankRanking];
    newRanking[id] = next;
    const newOrder = [...rerankOrder, id];
    if (next === n - 2) {
      const rem = Array.from({ length: n }, (_, i) => i).find((i) => newRanking[i] === -1);
      if (rem !== undefined) { newRanking[rem] = n - 1; newOrder.push(rem); }
    }
    setRerankRanking(newRanking);
    setRerankOrder(newOrder);
  };

  const handleSubmitAdd = async () => {
    if (text.trim().length <= 5) return;
    const userRank = 0; // User's own statement defaults to 1st place
    setSubmitting(true);
    try {
      const res = await fetch("/api/consensus", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "add-statement",
          question,
          statements: statements.map((s) => ({ label: s.label, text: s.text })),
          newStatement: text.trim(),
          agents: agents.map((a) => ({ name: a.name, opinion: a.opinion })),
        }),
      });
      const data = await res.json();
      const newStmt: Statement = {
        id: statements.length,
        emoji: "🦞",
        label: label.trim() || "Your Statement",
        text: text.trim(),
        author: "You",
      };
      onAddStatement(newStmt, userRank, data.predictedRanks || agents.map(() => Math.floor(n / 2)));
    } catch {
      const newStmt: Statement = {
        id: statements.length,
        emoji: "🦞",
        label: label.trim() || "Your Statement",
        text: text.trim(),
        author: "You",
      };
      onAddStatement(newStmt, userRank, agents.map(() => Math.floor(n / 2)));
    }
    setSubmitting(false);
  };

  const handleSubmitRerank = async () => {
    if (!rerankDone) return;
    setSubmitting(true);
    await onRerank(rerankRanking);
    setSubmitting(false);
  };

  const handleSimulate = async () => {
    setSimulating(true);
    await onSimulateLobster();
    setSimulating(false);
  };

  return (
    <Scene padTop>
      <div
        style={{
          maxWidth: 580,
          width: "100%",
          zIndex: 1,
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          style={{ textAlign: "center" }}
        >
          <h2
            className="font-handwritten"
            style={{ fontSize: 26, color: "#c84a20", margin: "0 0 4px" }}
          >
            Continue Deliberating
          </h2>
          <p style={{ fontSize: 12, color: "#888", margin: 0, fontFamily: "'DM Sans', sans-serif" }}>
            What would you like to do?
          </p>
        </motion.div>

        {/* ── Options ── */}
        {mode === "options" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <motion.button
              whileHover={{ scale: 1.01, x: 3 }}
              whileTap={{ scale: 0.99 }}
              onClick={() => { setMode("add"); setText(""); setLabel(""); }}
              style={{
                background: "rgba(255,255,255,0.9)",
                border: `1.5px solid ${USER_COLOR}20`,
                borderRadius: 12,
                padding: "14px 16px",
                textAlign: "left",
                cursor: "pointer",
                display: "flex",
                gap: 12,
                alignItems: "center",
              }}
            >
              <span style={{ fontSize: 20 }}>✍️</span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#1a1a1a", fontFamily: "'DM Sans', sans-serif" }}>Add a new consensus statement</div>
                <div style={{ fontSize: 11, color: "#888", fontFamily: "'DM Sans', sans-serif" }}>Write a reframing and rank it</div>
              </div>
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.01, x: 3 }}
              whileTap={{ scale: 0.99 }}
              onClick={startRerank}
              style={{
                background: "rgba(255,255,255,0.9)",
                border: "1.5px solid rgba(42,111,176,0.2)",
                borderRadius: 12,
                padding: "14px 16px",
                textAlign: "left",
                cursor: "pointer",
                display: "flex",
                gap: 12,
                alignItems: "center",
              }}
            >
              <span style={{ fontSize: 20 }}>🔄</span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#1a1a1a", fontFamily: "'DM Sans', sans-serif" }}>Update your ranking</div>
                <div style={{ fontSize: 11, color: "#888", fontFamily: "'DM Sans', sans-serif" }}>Re-rank all {n} statements</div>
              </div>
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.01, x: 3 }}
              whileTap={{ scale: 0.99 }}
              onClick={handleSimulate}
              disabled={simulating}
              style={{
                background: "rgba(255,255,255,0.9)",
                border: "1.5px solid rgba(42,138,74,0.2)",
                borderRadius: 12,
                padding: "14px 16px",
                textAlign: "left",
                cursor: simulating ? "default" : "pointer",
                display: "flex",
                gap: 12,
                alignItems: "center",
                opacity: simulating ? 0.6 : 1,
              }}
            >
              <span style={{ fontSize: 20 }}>🦞</span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#1a1a1a", fontFamily: "'DM Sans', sans-serif" }}>
                  {simulating ? "Simulating..." : "Simulate a new lobster"}
                </div>
                <div style={{ fontSize: 11, color: "#888", fontFamily: "'DM Sans', sans-serif" }}>A new bot joins with a fresh opinion and statement</div>
              </div>
              {simulating && (
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                  style={{ width: 14, height: 14, border: "2px solid #2a8a4a", borderTopColor: "transparent", borderRadius: "50%", marginLeft: "auto" }}
                />
              )}
            </motion.button>
          </div>
        )}

        {/* ── Add Statement Form ── */}
        {mode === "add" && (
          <Card style={{ padding: "20px 24px" }}>
            {/* Opinion recap */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 6,
                marginBottom: 14,
              }}
            >
              {[
                { name: "You", opinion: userOpinion, color: USER_COLOR },
                ...agents.map((a) => ({ name: a.name, opinion: a.opinion, color: a.color })),
              ].map((l) => (
                <div
                  key={l.name}
                  style={{
                    background: `${l.color}08`,
                    border: `1px solid ${l.color}15`,
                    borderRadius: 10,
                    padding: "8px 10px",
                    fontSize: 11,
                    color: "#555",
                    fontFamily: "'DM Sans', sans-serif",
                    lineHeight: 1.4,
                  }}
                >
                  <span style={{ fontWeight: 700, color: l.color }}>{l.name}: </span>
                  {l.opinion}
                </div>
              ))}
            </div>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Short title"
              disabled={submitting}
              style={{ width: "100%", border: "1.5px solid rgba(0,0,0,0.08)", borderRadius: 10, padding: "10px 14px", fontFamily: "'DM Sans', sans-serif", fontSize: 14, fontWeight: 600, outline: "none", background: submitting ? "#f8f6f2" : "white", color: "#1a1a1a", boxSizing: "border-box", marginBottom: 8 }}
            />
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Write your new consensus statement..."
              rows={2}
              disabled={submitting}
              style={{ width: "100%", border: `1.5px solid ${USER_COLOR}20`, borderRadius: 10, padding: "10px 14px", fontFamily: "'DM Sans', sans-serif", fontSize: 14, resize: "none", outline: "none", background: submitting ? "#f8f6f2" : "white", color: "#1a1a1a", boxSizing: "border-box" }}
            />
            <div style={{ marginTop: 14, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <button onClick={() => setMode("options")} style={{ background: "none", border: "none", fontSize: 12, color: "#999", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", textDecoration: "underline" }}>← Back</button>
              {!submitting ? (
                <Btn onClick={handleSubmitAdd} disabled={text.trim().length <= 5}>Submit →</Btn>
              ) : (
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }} style={{ width: 14, height: 14, border: "2px solid #c84a20", borderTopColor: "transparent", borderRadius: "50%" }} />
                  <span style={{ fontSize: 12, color: "#999", fontFamily: "'DM Sans', sans-serif" }}>Predicting rankings...</span>
                </div>
              )}
            </div>
          </Card>
        )}

        {/* ── Re-rank UI ── */}
        {mode === "rerank" && (
          <Card style={{ padding: "20px 24px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
              <GameLobster color={USER_COLOR} size={36} />
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#1a1a1a", fontFamily: "'DM Sans', sans-serif" }}>
                  Re-rank the statements
                </div>
                <div style={{ fontSize: 11, color: "#888", fontFamily: "'DM Sans', sans-serif" }}>
                  Click 1st choice, then 2nd. Last fills automatically.
                </div>
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {statements.map((s) => {
                const r = rerankRanking[s.id];
                const isRanked = r !== -1;
                return (
                  <motion.button
                    key={s.id}
                    onClick={() => handleRerankClick(s.id)}
                    whileHover={{ scale: 1.01, x: 3 }}
                    whileTap={{ scale: 0.99 }}
                    style={{
                      background: isRanked ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.6)",
                      border: `1.5px solid ${isRanked ? RANK_COLORS[r] + "60" : "rgba(0,0,0,0.06)"}`,
                      borderRadius: 12,
                      padding: "12px 14px",
                      textAlign: "left",
                      cursor: "pointer",
                      display: "flex",
                      gap: 12,
                      alignItems: "center",
                    }}
                  >
                    <div
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 8,
                        flexShrink: 0,
                        background: isRanked ? RANK_COLORS[r] : "#e8e2d8",
                        border: isRanked ? "none" : "1.5px dashed #c8c0b4",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: isRanked ? 15 : 14,
                        color: isRanked ? "white" : "#b8b0a4",
                        fontFamily: "'DM Sans', sans-serif",
                        fontWeight: 700,
                      }}
                    >
                      {isRanked ? RANK_MEDALS[r] : "?"}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "#1a1a1a", fontFamily: "'DM Sans', sans-serif" }}>
                        {s.emoji} {s.label}
                      </div>
                      <div style={{ fontSize: 12, color: "#666", fontFamily: "'DM Sans', sans-serif", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {s.text}
                      </div>
                    </div>
                  </motion.button>
                );
              })}
            </div>

            <div style={{ marginTop: 14, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <button onClick={() => setMode("options")} style={{ background: "none", border: "none", fontSize: 12, color: "#999", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", textDecoration: "underline" }}>← Back</button>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 12, color: "#999", fontFamily: "'DM Sans', sans-serif" }}>
                  {rerankDone ? "All ranked ✓" : `${rerankOrder.length}/${n}`}
                </span>
                {!submitting ? (
                  <Btn onClick={handleSubmitRerank} disabled={!rerankDone}>Submit ranking →</Btn>
                ) : (
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }} style={{ width: 14, height: 14, border: "2px solid #c84a20", borderTopColor: "transparent", borderRadius: "50%" }} />
                    <span style={{ fontSize: 12, color: "#999", fontFamily: "'DM Sans', sans-serif" }}>Updating rankings...</span>
                  </div>
                )}
              </div>
            </div>
          </Card>
        )}
      </div>
    </Scene>
  );
}

// ─── Main ConsensusGame ──────────────────────────────────────────────────────

export default function ConsensusGame() {
  const [phase, setPhase] = useState<Phase>("intro");
  const prevPhaseRef = useRef<Phase>("intro");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [muted, setMuted] = useState(false);

  useEffect(() => {
    const audio = new Audio("/crab_rave.mp3");
    audio.loop = true;
    audio.volume = 0.4;
    audio.play().catch(() => {});
    audioRef.current = audio;
    return () => {
      audio.pause();
    };
  }, []);

  // Game state
  const [question, setQuestion] = useState("");
  const [userOpinion, setUserOpinion] = useState("");
  const [agent1, setAgent1] = useState<LobsterAgent>({
    name: "AkashBot",
    opinion: "",
    color: AGENT_COLORS[0],
  });
  const [agent2, setAgent2] = useState<LobsterAgent>({
    name: "VanClaw",
    opinion: "",
    color: AGENT_COLORS[1],
  });
  const [agent3, setAgent3] = useState<LobsterAgent>({
    name: "OmerJr",
    opinion: "",
    color: AGENT_COLORS[2],
  });
  const [statements, setStatements] = useState<Statement[]>([]);
  const [humanRanking, setHumanRanking] = useState<number[]>([]);
  const [agent1Ranking, setAgent1Ranking] = useState<number[]>([]);
  const [agent2Ranking, setAgent2Ranking] = useState<number[]>([]);
  const [agent3Ranking, setAgent3Ranking] = useState<number[]>([]);
  const [extraAgents, setExtraAgents] = useState<LobsterAgent[]>([]);
  const [extraRankings, setExtraRankings] = useState<number[][]>([]);
  const [currentWinner, setCurrentWinner] = useState<number | null>(null);
  const [roundsPlayed, setRoundsPlayed] = useState(0);

  // Restore state from sessionStorage on mount
  const restoredRef = useRef(false);
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    try {
      const saved = sessionStorage.getItem("tutorial_game_state");
      if (!saved) return;
      const s = JSON.parse(saved);
      if (s.phase && s.phase !== "intro" && s.phase !== "loading") {
        setPhase(s.phase);
        setQuestion(s.question || "");
        setUserOpinion(s.userOpinion || "");
        if (s.agent1) setAgent1(s.agent1);
        if (s.agent2) setAgent2(s.agent2);
        if (s.agent3) setAgent3(s.agent3);
        if (s.statements) setStatements(s.statements);
        if (s.humanRanking) setHumanRanking(s.humanRanking);
        if (s.agent1Ranking) setAgent1Ranking(s.agent1Ranking);
        if (s.agent2Ranking) setAgent2Ranking(s.agent2Ranking);
        if (s.agent3Ranking) setAgent3Ranking(s.agent3Ranking);
        if (s.extraAgents) setExtraAgents(s.extraAgents);
        if (s.extraRankings) setExtraRankings(s.extraRankings);
        if (s.currentWinner !== undefined) setCurrentWinner(s.currentWinner);
        if (s.roundsPlayed) setRoundsPlayed(s.roundsPlayed);
      }
    } catch { /* ignore */ }
  }, []);

  // Save state to sessionStorage whenever it changes
  useEffect(() => {
    if (!restoredRef.current) return;
    if (phase === "intro" || phase === "loading") return;
    try {
      sessionStorage.setItem("tutorial_game_state", JSON.stringify({
        phase, question, userOpinion,
        agent1, agent2, agent3,
        statements, humanRanking,
        agent1Ranking, agent2Ranking, agent3Ranking,
        extraAgents, extraRankings,
        currentWinner, roundsPlayed,
      }));
    } catch { /* ignore */ }
  }, [phase, question, userOpinion, agent1, agent2, agent3, statements, humanRanking, agent1Ranking, agent2Ranking, agent3Ranking, extraAgents, extraRankings, currentWinner, roundsPlayed]);

  // Computed: all agents and all agent rankings (for EndScene)
  const allAgents = [agent1, agent2, agent3, ...extraAgents];
  const allAgentRankings = [agent1Ranking, agent2Ranking, agent3Ranking, ...extraRankings];

  const goTo = useCallback((next: Phase) => {
    setPhase((prev) => {
      if (next === "loading") prevPhaseRef.current = prev;
      return next;
    });
  }, []);

  // Part 1: User picks question
  const submitQuestion = (q: string) => {
    setQuestion(q);
    goTo("opinion");
  };

  // Part 1: User submits opinion
  const submitOpinion = async (opinion: string) => {
    setUserOpinion(opinion);

    // Skip LLM call if agents already have opinions (going back and forward)
    if (agent1.opinion && agent2.opinion && agent3.opinion && opinion === userOpinion) {
      goTo("opinions-reveal");
      return;
    }

    goTo("loading");

    const minDelay = new Promise((r) => setTimeout(r, 3500));

    const apiCall = (async () => {
      try {
        const res = await fetch("/api/consensus", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "setup", question, playerOpinion: opinion }),
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);

        setAgent1({
          name: data.agent1Name,
          opinion: data.agent1Opinion,
          color: AGENT_COLORS[0],
        });
        setAgent2({
          name: data.agent2Name,
          opinion: data.agent2Opinion,
          color: AGENT_COLORS[1],
        });
        setAgent3({
          name: data.agent3Name,
          opinion: data.agent3Opinion,
          color: AGENT_COLORS[2],
        });
      } catch {
        setAgent1({
          name: "AkashBot",
          opinion: `Regarding "${question}" — absolutely in favor. The logic is clear and the benefits outweigh any concerns.`,
          color: AGENT_COLORS[0],
        });
        setAgent2({
          name: "VanClaw",
          opinion: `On "${question}" — strong objection. The premise is flawed and the downsides are being ignored.`,
          color: AGENT_COLORS[1],
        });
        setAgent3({
          name: "OmerJr",
          opinion: `"${question}" — both sides have valid points. The real answer depends on context and how we define the terms.`,
          color: AGENT_COLORS[2],
        });
      }
    })();

    await Promise.all([minDelay, apiCall]);
    goTo("opinions-reveal");
  };

  // Part 2: User writes consensus statement
  const submitUserStatement = async (stmt: Statement) => {
    const userStmt = { ...stmt, id: 0 };

    // Skip LLM call if statements already exist (going back and forward without editing)
    if (statements.length > 0 && statements[0].text === stmt.text) {
      goTo("lobster-statements");
      return;
    }

    goTo("loading");

    const minDelay = new Promise((r) => setTimeout(r, 3500));

    // Generate AI lobster statements
    let aiStatements: Statement[] = [];
    const apiCall = (async () => {
      try {
        const res = await fetch("/api/consensus", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "generate-statements",
            question,
            playerOpinion: userOpinion,
            agent1Name: agent1.name,
            agent1Opinion: agent1.opinion,
            agent2Name: agent2.name,
            agent2Opinion: agent2.opinion,
            agent3Name: agent3.name,
            agent3Opinion: agent3.opinion,
            playerStatement: stmt.text,
          }),
        });
        const data = await res.json();
        if (data.statements && data.statements.length >= 3) {
          const agentNames = [agent1.name, agent2.name, agent3.name];
          aiStatements = data.statements.slice(0, 3).map(
            (
              s: { emoji: string; label: string; text: string; author?: string },
              i: number
            ) => ({
              ...s,
              id: i + 1,
              author: s.author || agentNames[i],
            })
          );
        }
        if (data.agent1Ranking) setAgent1Ranking(data.agent1Ranking);
        if (data.agent2Ranking) setAgent2Ranking(data.agent2Ranking);
        if (data.agent3Ranking) setAgent3Ranking(data.agent3Ranking);
      } catch {
        // Fallback
      }
    })();

    await Promise.all([minDelay, apiCall]);

    if (aiStatements.length < 3) {
      aiStatements = [
        {
          id: 1,
          emoji: "🔄",
          label: "The Practical View",
          text: "Rather than debating the principle, we should focus on what actually works best in practice.",
          author: agent1.name,
        },
        {
          id: 2,
          emoji: "🌊",
          label: "The Bigger Picture",
          text: "Both perspectives have merit. The real question is what framework gives us the best outcomes long-term.",
          author: agent2.name,
        },
        {
          id: 3,
          emoji: "🌱",
          label: "The Growth Angle",
          text: "This isn't a binary choice — the most interesting path forward combines elements both sides haven't considered yet.",
          author: agent3.name,
        },
      ];
      setAgent1Ranking([1, 0, 2, 3]);
      setAgent2Ranking([2, 3, 1, 0]);
      setAgent3Ranking([0, 2, 3, 1]);
    }

    const allStatements = [userStmt, ...aiStatements];
    setStatements(allStatements);
    goTo("lobster-statements");
  };

  // Part 3: User ranks
  const submitRanking = (ranking: number[]) => {
    setHumanRanking(ranking);
    goTo("lobster-rankings");
  };

  // Part 3: Schulze result
  const handleSchulzeResult = (winner: number | null) => {
    setCurrentWinner(winner);
    setRoundsPlayed((p) => p + 1);
    goTo("end");
  };

  // Part 4: Add statement
  const handleAddStatement = (
    stmt: Statement,
    newHumanRank: number,
    predictedRanks: number[]
  ) => {
    const newStmts = [...statements, stmt];
    setStatements(newStmts);

    const n = newStmts.length;
    const insertRank = (
      oldRanking: number[],
      newRank: number
    ): number[] => {
      const newR = new Array(n).fill(0);
      for (let i = 0; i < oldRanking.length; i++) {
        newR[i] = oldRanking[i] >= newRank ? oldRanking[i] + 1 : oldRanking[i];
      }
      newR[n - 1] = newRank;
      return newR;
    };

    const newHR = insertRank(humanRanking, newHumanRank);
    const newA1R = insertRank(agent1Ranking, predictedRanks[0] ?? 0);
    const newA2R = insertRank(agent2Ranking, predictedRanks[1] ?? 0);
    const newA3R = insertRank(agent3Ranking, predictedRanks[2] ?? 0);
    const newExtraR = extraRankings.map((er, i) => insertRank(er, predictedRanks[3 + i] ?? Math.floor(n / 2)));

    setHumanRanking(newHR);
    setAgent1Ranking(newA1R);
    setAgent2Ranking(newA2R);
    setAgent3Ranking(newA3R);
    setExtraRankings(newExtraR);

    const allR = [newHR, newA1R, newA2R, newA3R, ...newExtraR];
    const { winner } = runSchulzeN(allR, n);
    setCurrentWinner(winner);
    setRoundsPlayed((p) => p + 1);

    // Stay on end page (re-render with updated data)
    goTo("end");
  };

  // Part 4: Re-rank
  const handleRerank = async (newHumanRanking: number[]) => {
    setHumanRanking(newHumanRanking);

    try {
      const res = await fetch("/api/consensus", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "rerank",
          question,
          statements: statements.map((s) => ({ label: s.label, text: s.text })),
          agent1Opinion: agent1.opinion,
          agent2Opinion: agent2.opinion,
          agent3Opinion: agent3.opinion,
          agent1Name: agent1.name,
          agent2Name: agent2.name,
          agent3Name: agent3.name,
          humanRanking: newHumanRanking,
        }),
      });
      const data = await res.json();
      if (data.agent1Ranking) setAgent1Ranking(data.agent1Ranking);
      if (data.agent2Ranking) setAgent2Ranking(data.agent2Ranking);
      if (data.agent3Ranking) setAgent3Ranking(data.agent3Ranking);

      const n = statements.length;
      const a1R = data.agent1Ranking || agent1Ranking;
      const a2R = data.agent2Ranking || agent2Ranking;
      const a3R = data.agent3Ranking || agent3Ranking;
      const { winner } = runSchulzeN(
        [newHumanRanking, a1R, a2R, a3R, ...extraRankings],
        n
      );
      setCurrentWinner(winner);
    } catch {
      const n = statements.length;
      const { winner } = runSchulzeN(
        [newHumanRanking, agent1Ranking, agent2Ranking, agent3Ranking, ...extraRankings],
        n
      );
      setCurrentWinner(winner);
    }

    setRoundsPlayed((p) => p + 1);
    goTo("end");
  };

  // Part 4: Simulate new lobster
  const handleSimulateLobster = async () => {
    try {
      const res = await fetch("/api/consensus", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "simulate-lobster",
          question,
          statements: statements.map((s) => ({ label: s.label, text: s.text })),
          existingOpinions: [userOpinion, ...allAgents.map((a) => a.opinion)],
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      const colorIdx = extraAgents.length;
      const newColor = EXTRA_AGENT_COLORS[colorIdx % EXTRA_AGENT_COLORS.length];
      const newAgent: LobsterAgent = {
        name: data.name,
        opinion: data.opinion,
        color: newColor,
      };

      // Add the new statement
      const newStmt: Statement = {
        id: statements.length,
        emoji: data.statementEmoji || "🦞",
        label: data.statementLabel || "New Perspective",
        text: data.statementText,
        author: data.name,
      };
      const newStmts = [...statements, newStmt];
      const n = newStmts.length;

      // Insert the new agent's ranking for all statements
      const newAgentRanking: number[] = data.ranking || Array.from({ length: n }, (_, i) => i);

      // Extend existing rankings with a middle rank for the new statement
      const extendRanking = (old: number[]): number[] => {
        const midRank = Math.floor(n / 2);
        const extended = old.map((r) => (r >= midRank ? r + 1 : r));
        return [...extended, midRank];
      };

      const newHR = extendRanking(humanRanking);
      const newA1R = extendRanking(agent1Ranking);
      const newA2R = extendRanking(agent2Ranking);
      const newA3R = extendRanking(agent3Ranking);
      const newExtraR = extraRankings.map((er) => extendRanking(er));

      setStatements(newStmts);
      setExtraAgents([...extraAgents, newAgent]);
      setHumanRanking(newHR);
      setAgent1Ranking(newA1R);
      setAgent2Ranking(newA2R);
      setAgent3Ranking(newA3R);
      setExtraRankings([...newExtraR, newAgentRanking]);

      const allR = [newHR, newA1R, newA2R, newA3R, ...newExtraR, newAgentRanking];
      const { winner } = runSchulzeN(allR, n);
      setCurrentWinner(winner);
      setRoundsPlayed((p) => p + 1);
    } catch {
      // Fallback: generate a simple bot locally
      const colorIdx = extraAgents.length;
      const newColor = EXTRA_AGENT_COLORS[colorIdx % EXTRA_AGENT_COLORS.length];
      const names = ["REEF-X", "CORAL-5", "TIDE-8", "KELP-3", "WAVE-7", "SHELL-2"];
      const newAgent: LobsterAgent = {
        name: names[colorIdx % names.length],
        opinion: `On "${question}" — interesting question. I think there are angles nobody has explored yet.`,
        color: newColor,
      };
      const newStmt: Statement = {
        id: statements.length,
        emoji: "🦞",
        label: "Fresh Take",
        text: "Sometimes the best consensus comes from stepping back and questioning our assumptions entirely.",
        author: newAgent.name,
      };
      const newStmts = [...statements, newStmt];
      const n = newStmts.length;
      const newAgentRanking = Array.from({ length: n }, (_, i) => (i + colorIdx) % n);

      const extendRanking = (old: number[]): number[] => {
        const midRank = Math.floor(n / 2);
        const extended = old.map((r) => (r >= midRank ? r + 1 : r));
        return [...extended, midRank];
      };

      const newHR = extendRanking(humanRanking);
      const newA1R = extendRanking(agent1Ranking);
      const newA2R = extendRanking(agent2Ranking);
      const newA3R = extendRanking(agent3Ranking);
      const newExtraR = extraRankings.map((er) => extendRanking(er));

      setStatements(newStmts);
      setExtraAgents([...extraAgents, newAgent]);
      setHumanRanking(newHR);
      setAgent1Ranking(newA1R);
      setAgent2Ranking(newA2R);
      setAgent3Ranking(newA3R);
      setExtraRankings([...newExtraR, newAgentRanking]);

      const allR = [newHR, newA1R, newA2R, newA3R, ...newExtraR, newAgentRanking];
      const { winner } = runSchulzeN(allR, n);
      setCurrentWinner(winner);
      setRoundsPlayed((p) => p + 1);
    }

    goTo("end");
  };

  const reset = () => {
    setPhase("intro");
    setQuestion("");
    setUserOpinion("");
    setStatements([]);
    setHumanRanking([]);
    setAgent1Ranking([]);
    setAgent2Ranking([]);
    setAgent3Ranking([]);
    setExtraAgents([]);
    setExtraRankings([]);
    setCurrentWinner(null);
    setRoundsPlayed(0);
    try { sessionStorage.removeItem("tutorial_game_state"); } catch { /* ignore */ }
  };

  return (
    <>
      <style>{`
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }
        * { box-sizing: border-box; }
        button { font-family: inherit; }
        textarea { font-family: inherit; }
        input { font-family: inherit; }
      `}</style>

      <div
        style={{
          position: "fixed",
          top: 64,
          left: 0,
          right: 0,
          bottom: 0,
          background: "#faf7f0",
          zIndex: 0,
        }}
      >
        <NetworkBackground />
      </div>
      <ProgressBar phase={phase} loadingFrom={prevPhaseRef.current} onBack={(target) => goTo(target)} />

      <div
        style={{
          position: "fixed",
          top: 64,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 1,
          overflow: "hidden",
          paddingTop: phase === "intro" ? 0 : 36,
        }}
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={phase}
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "20px",
              overflowY: "auto",
            }}
          >
            {phase === "intro" && (
              <IntroScene onStart={() => goTo("question")} />
            )}
            {phase === "question" && (
              <QuestionScene onSubmit={submitQuestion} initialValue={question} />
            )}
            {phase === "opinion" && (
              <OpinionScene question={question} onSubmit={submitOpinion} initialValue={userOpinion} />
            )}
            {phase === "loading" && <LoadingScene />}
            {phase === "opinions-reveal" && (
              <OpinionsRevealScene
                question={question}
                userOpinion={userOpinion}
                agent1={agent1}
                agent2={agent2}
                agent3={agent3}
                onNext={() => goTo("explain-consensus")}
              />
            )}
            {phase === "explain-consensus" && (
              <ExplainConsensusScene
                onNext={() => goTo("write-statement")}
              />
            )}
            {phase === "write-statement" && (
              <WriteStatementScene
                question={question}
                userOpinion={userOpinion}
                agent1={agent1}
                agent2={agent2}
                agent3={agent3}
                onSubmit={submitUserStatement}
                initialStatement={statements.length > 0 ? { label: statements[0].label, text: statements[0].text } : undefined}
              />
            )}
            {phase === "lobster-statements" && statements.length > 0 && (
              <LobsterStatementsScene
                statements={statements}
                agent1={agent1}
                agent2={agent2}
                agent3={agent3}
                onNext={() => goTo("ranking")}
              />
            )}
            {phase === "ranking" && statements.length > 0 && (
              <RankingScene
                statements={statements}
                question={question}
                userOpinion={userOpinion}
                onSubmit={submitRanking}
              />
            )}
            {phase === "lobster-rankings" &&
              agent1Ranking.length > 0 && (
                <LobsterRankingsScene
                  statements={statements}
                  agent1={agent1}
                  agent2={agent2}
                  agent3={agent3}
                  agent1Ranking={agent1Ranking}
                  agent2Ranking={agent2Ranking}
                  agent3Ranking={agent3Ranking}
                  onNext={() => goTo("schulze")}
                />
              )}
            {phase === "schulze" && humanRanking.length > 0 && (
              <SchulzeScene
                statements={statements}
                humanRanking={humanRanking}
                agent1Ranking={agent1Ranking}
                agent2Ranking={agent2Ranking}
                agent3Ranking={agent3Ranking}
                onNext={handleSchulzeResult}
              />
            )}
            {phase === "end" && (
              <EndScene
                question={question}
                statements={statements}
                currentWinner={currentWinner}
                roundsPlayed={roundsPlayed}
                userOpinion={userOpinion}
                agents={allAgents}
                allRankings={[humanRanking, ...allAgentRankings]}
                onContinue={() => goTo("continue")}
                onReset={reset}
              />
            )}
            {phase === "continue" && (
              <ContinueScene
                question={question}
                statements={statements}
                agents={allAgents}
                userOpinion={userOpinion}
                onAddStatement={handleAddStatement}
                onRerank={handleRerank}
                onSimulateLobster={handleSimulateLobster}
                onBack={() => goTo("end")}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Mute button */}
      <button
        onClick={() => {
          const audio = audioRef.current;
          if (!audio) return;
          if (muted) { audio.volume = 0.4; audio.play().catch(() => {}); }
          else { audio.volume = 0; }
          setMuted(!muted);
        }}
        style={{
          position: "fixed",
          bottom: 20,
          right: 20,
          zIndex: 200,
          width: 40,
          height: 40,
          borderRadius: "50%",
          border: "1.5px solid rgba(0,0,0,0.1)",
          background: "rgba(255,252,247,0.9)",
          backdropFilter: "blur(8px)",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 18,
          boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
        }}
        aria-label={muted ? "Unmute" : "Mute"}
      >
        {muted ? "🔇" : "🔊"}
      </button>
    </>
  );
}
