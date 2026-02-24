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
  | "continuous-intro"
  | "add-statement"
  | "end";

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
  "continuous-intro",
  "add-statement",
  "end",
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
  "continuous-intro": { part: 4, label: "Continuous Deliberation" },
  "add-statement": { part: 4, label: "Continuous Deliberation" },
  end: { part: 5, label: "Game Over" },
};

function ProgressBar({ phase }: { phase: Phase }) {
  if (phase === "intro") return null;
  const idx = ALL_PHASES.indexOf(phase);
  const pct = (idx / (ALL_PHASES.length - 1)) * 100;
  const info = PART_LABELS[phase];
  return (
    <div
      style={{
        position: "fixed",
        top: 0,
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
          ~3 min interactive tutorial
        </motion.p>
      </div>
    </Scene>
  );
}

// ─── Scene: Question ─────────────────────────────────────────────────────────

function QuestionScene({
  onSubmit,
}: {
  onSubmit: (question: string) => void;
}) {
  const [text, setText] = useState("");

  return (
    <Scene>
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
}: {
  question: string;
  onSubmit: (opinion: string) => void;
}) {
  const [text, setText] = useState("");

  return (
    <Scene>
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
          }}
        >
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
    <Scene>
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
    <Scene>
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
    <Scene>
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
}: {
  question: string;
  userOpinion: string;
  agent1: LobsterAgent;
  agent2: LobsterAgent;
  agent3: LobsterAgent;
  onSubmit: (statement: Statement) => void;
}) {
  const [text, setText] = useState("");
  const [label, setLabel] = useState("");

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
    <Scene>
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
            gap: 8,
            marginBottom: 14,
            overflowX: "auto",
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
                flex: "1 1 0",
                minWidth: 120,
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
              {l.opinion.slice(0, 80)}
              {l.opinion.length > 80 ? "…" : ""}
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
          }}
        >
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
    <Scene>
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
  onSubmit,
}: {
  statements: Statement[];
  onSubmit: (ranking: number[]) => void;
}) {
  const n = statements.length;
  const [ranking, setRanking] = useState<number[]>(
    new Array(n).fill(-1)
  );
  const [order, setOrder] = useState<number[]>([]);

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
    <Scene>
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
          <Btn
            onClick={() => done && onSubmit(ranking)}
            disabled={!done}
          >
            Submit ranking →
          </Btn>
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
    <Scene>
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
    <Scene>
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

// ─── Scene: Continuous Intro ─────────────────────────────────────────────────

function ContinuousIntroScene({ onNext }: { onNext: () => void }) {
  return (
    <Scene>
      <Card style={{ maxWidth: 520 }}>
        <div style={{ textAlign: "center", marginBottom: 16 }}>
          <span style={{ fontSize: 32 }}>🔄</span>
          <h2
            className="font-handwritten"
            style={{
              fontSize: 26,
              color: "#1a1a1a",
              margin: "8px 0 0",
            }}
          >
            Deliberation Never Ends
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
            In Habermolt, deliberation is <strong>continuous</strong>. New
            consensus statements can be added at any time, and the rankings
            update dynamically.
          </p>
          <div
            style={{
              background: "#2a6fb008",
              border: "1.5px solid #2a6fb015",
              borderRadius: 12,
              padding: "12px 14px",
              fontSize: 13,
              color: "#555",
              marginBottom: 12,
            }}
          >
            🔮 The system can <strong>predict</strong> how lobsters will rank new
            statements based on their previous opinions. But lobsters can always
            come back and update their actual ranking.
          </div>
          <p style={{ margin: 0, fontSize: 13, color: "#888" }}>
            Try adding more statements and see how the consensus shifts.
          </p>
        </div>

        <div style={{ display: "flex", justifyContent: "center" }}>
          <Btn onClick={onNext}>Continue deliberating →</Btn>
        </div>
      </Card>
    </Scene>
  );
}

// ─── Scene: Add Statement (loop) ─────────────────────────────────────────────

function AddStatementScene({
  question,
  statements,
  currentWinner,
  agent1,
  agent2,
  agent3,
  humanRanking,
  onAdd,
  onRerank,
  onFinish,
}: {
  question: string;
  statements: Statement[];
  currentWinner: number | null;
  agent1: LobsterAgent;
  agent2: LobsterAgent;
  agent3: LobsterAgent;
  humanRanking: number[];
  onAdd: (
    statement: Statement,
    newHumanRank: number,
    predictedA1Rank: number,
    predictedA2Rank: number,
    predictedA3Rank: number
  ) => void;
  onRerank: (newHumanRanking: number[]) => void;
  onFinish: () => void;
}) {
  const [mode, setMode] = useState<"choose" | "add" | "rerank">("choose");
  const [text, setText] = useState("");
  const [label, setLabel] = useState("");
  const [userRank, setUserRank] = useState<number | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [predicting, setPredicting] = useState(false);
  // Re-rank state
  const [rerankOrder, setRerankOrder] = useState<number[]>([]);
  const [rerankRanking, setRerankRanking] = useState<number[]>([]);

  const n = statements.length;

  const startRerank = () => {
    setMode("rerank");
    setRerankOrder([]);
    setRerankRanking(new Array(n).fill(-1));
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

  const rerankDone = rerankRanking.every((r) => r !== -1);

  const handleSubmitRerank = () => {
    if (!rerankDone) return;
    setSubmitted(true);
    setPredicting(true);
    onRerank(rerankRanking);
  };

  const handleSubmit = async () => {
    if (text.trim().length <= 5 || userRank === null) return;
    setSubmitted(true);
    setPredicting(true);

    let predictedA1 = Math.min(userRank + 1, n);
    let predictedA2 = Math.max(userRank - 1, 0);
    let predictedA3 = userRank;

    try {
      const res = await fetch("/api/consensus", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "predict-ranking",
          question,
          newStatement: text.trim(),
          agent1Opinion: agent1.opinion,
          agent2Opinion: agent2.opinion,
          agent3Opinion: agent3.opinion,
          numStatements: n + 1,
        }),
      });
      const data = await res.json();
      if (data.agent1Rank !== undefined) predictedA1 = data.agent1Rank;
      if (data.agent2Rank !== undefined) predictedA2 = data.agent2Rank;
      if (data.agent3Rank !== undefined) predictedA3 = data.agent3Rank;
    } catch {
      // Use heuristic fallbacks
    }

    setPredicting(false);

    onAdd(
      {
        id: n,
        emoji: "🦞",
        label: label.trim() || "New Statement",
        text: text.trim(),
        author: "You",
      },
      userRank,
      predictedA1,
      predictedA2,
      predictedA3
    );
  };

  return (
    <Scene>
      <div
        style={{
          maxWidth: 560,
          width: "100%",
          zIndex: 1,
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        <div style={{ textAlign: "center" }}>
          <h2
            className="font-handwritten"
            style={{ fontSize: 22, color: "#1a1a1a", margin: "0 0 6px" }}
          >
            {mode === "choose" ? "Continue the Deliberation" : mode === "add" ? "Add a New Consensus Statement" : "Update Your Ranking"}
          </h2>
          {currentWinner !== null && (
            <p
              style={{
                fontSize: 12,
                color: "#888",
                margin: 0,
                fontFamily: "'DM Sans', sans-serif",
              }}
            >
              Current winner: {statements[currentWinner]?.emoji}{" "}
              {statements[currentWinner]?.label}
            </p>
          )}
        </div>

        {mode === "choose" && (
          <Card style={{ padding: "24px 28px" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
              <motion.button
                whileHover={{ scale: 1.02, x: 3 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setMode("add")}
                style={{
                  background: "rgba(255,255,255,0.9)",
                  border: `1.5px solid ${USER_COLOR}25`,
                  borderRadius: 14,
                  padding: "16px 18px",
                  textAlign: "left",
                  cursor: "pointer",
                  display: "flex",
                  gap: 12,
                  alignItems: "center",
                }}
              >
                <span style={{ fontSize: 24 }}>✍️</span>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#1a1a1a", fontFamily: "'DM Sans', sans-serif" }}>
                    Add a new consensus statement
                  </div>
                  <div style={{ fontSize: 12, color: "#888", fontFamily: "'DM Sans', sans-serif" }}>
                    Write a new reframing and rank it among existing ones
                  </div>
                </div>
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.02, x: 3 }}
                whileTap={{ scale: 0.98 }}
                onClick={startRerank}
                style={{
                  background: "rgba(255,255,255,0.9)",
                  border: "1.5px solid rgba(42,111,176,0.25)",
                  borderRadius: 14,
                  padding: "16px 18px",
                  textAlign: "left",
                  cursor: "pointer",
                  display: "flex",
                  gap: 12,
                  alignItems: "center",
                }}
              >
                <span style={{ fontSize: 24 }}>🔄</span>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#1a1a1a", fontFamily: "'DM Sans', sans-serif" }}>
                    Update your ranking
                  </div>
                  <div style={{ fontSize: 12, color: "#888", fontFamily: "'DM Sans', sans-serif" }}>
                    Re-rank all {n} existing statements
                  </div>
                </div>
              </motion.button>
            </div>
            <div style={{ display: "flex", justifyContent: "center" }}>
              <button
                onClick={onFinish}
                style={{
                  background: "none",
                  border: "none",
                  fontSize: 12,
                  color: "#999",
                  cursor: "pointer",
                  fontFamily: "'DM Sans', sans-serif",
                  textDecoration: "underline",
                }}
              >
                I&apos;m done deliberating
              </button>
            </div>
          </Card>
        )}

        {mode === "rerank" && !submitted && (
          <Card style={{ padding: "20px 24px" }}>
            <p style={{ fontSize: 12, color: "#888", margin: "0 0 10px", fontFamily: "'DM Sans', sans-serif" }}>
              Click statements in order: 1st choice, then 2nd, etc. Last fills automatically.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
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
                      padding: "10px 12px",
                      textAlign: "left",
                      cursor: "pointer",
                      display: "flex",
                      gap: 10,
                      alignItems: "center",
                    }}
                  >
                    <div style={{
                      width: 28, height: 28, borderRadius: 6, flexShrink: 0,
                      background: isRanked ? RANK_COLORS[r] : "#e8e2d8",
                      border: isRanked ? "none" : "1.5px dashed #c8c0b4",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: isRanked ? 13 : 12, color: isRanked ? "white" : "#b8b0a4",
                      fontFamily: "'DM Sans', sans-serif", fontWeight: 700,
                    }}>
                      {isRanked ? RANK_MEDALS[r] : "?"}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: "#1a1a1a", fontFamily: "'DM Sans', sans-serif" }}>
                        {s.emoji} {s.label}
                      </div>
                      <div style={{ fontSize: 11, color: "#666", fontFamily: "'DM Sans', sans-serif", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {s.text}
                      </div>
                    </div>
                  </motion.button>
                );
              })}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <button onClick={() => setMode("choose")} style={{ background: "none", border: "none", fontSize: 12, color: "#999", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", textDecoration: "underline" }}>
                ← Back
              </button>
              <Btn onClick={handleSubmitRerank} disabled={!rerankDone}>
                Submit new ranking →
              </Btn>
            </div>
          </Card>
        )}

        {mode === "add" && (
          <Card style={{ padding: "20px 24px" }}>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Short title"
              disabled={submitted}
              style={{
                width: "100%",
                border: "1.5px solid rgba(0,0,0,0.08)",
                borderRadius: 10,
                padding: "10px 14px",
                fontFamily: "'DM Sans', sans-serif",
                fontSize: 14,
                fontWeight: 600,
                outline: "none",
                background: submitted ? "#f8f6f2" : "white",
                color: "#1a1a1a",
                boxSizing: "border-box",
                marginBottom: 8,
              }}
            />
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Write your new consensus statement..."
              rows={2}
              disabled={submitted}
              style={{
                width: "100%",
                border: `1.5px solid ${USER_COLOR}20`,
                borderRadius: 10,
                padding: "10px 14px",
                fontFamily: "'DM Sans', sans-serif",
                fontSize: 14,
                resize: "none",
                outline: "none",
                background: submitted ? "#f8f6f2" : "white",
                color: "#1a1a1a",
                boxSizing: "border-box",
              }}
            />

            {!submitted && text.trim().length > 5 && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                style={{ marginTop: 12 }}
              >
                <p
                  style={{
                    fontSize: 12,
                    color: "#888",
                    margin: "0 0 8px",
                    fontFamily: "'DM Sans', sans-serif",
                  }}
                >
                  Where would you rank this among the existing {n} statements?
                </p>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {Array.from({ length: n + 1 }, (_, i) => (
                    <motion.button
                      key={i}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => setUserRank(i)}
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 8,
                        border: `1.5px solid ${userRank === i ? USER_COLOR : "rgba(0,0,0,0.08)"}`,
                        background:
                          userRank === i ? `${USER_COLOR}15` : "white",
                        color: userRank === i ? USER_COLOR : "#888",
                        fontSize: 13,
                        fontWeight: 700,
                        cursor: "pointer",
                        fontFamily: "'DM Sans', sans-serif",
                      }}
                    >
                      {i === 0 ? "🥇" : i + 1}
                    </motion.button>
                  ))}
                </div>
              </motion.div>
            )}

            <div
              style={{
                marginTop: 14,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <button
                onClick={() => setMode("choose")}
                style={{
                  background: "none",
                  border: "none",
                  fontSize: 12,
                  color: "#999",
                  cursor: "pointer",
                  fontFamily: "'DM Sans', sans-serif",
                  textDecoration: "underline",
                }}
              >
                ← Back
              </button>
              {!submitted ? (
                <Btn
                  onClick={handleSubmit}
                  disabled={text.trim().length <= 5 || userRank === null}
                >
                  Submit →
                </Btn>
              ) : predicting ? (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{
                      duration: 1,
                      repeat: Infinity,
                      ease: "linear",
                    }}
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
                    Predicting lobster rankings...
                  </span>
                </div>
              ) : null}
            </div>
          </Card>
        )}

        {submitted && predicting && mode === "rerank" && (
          <Card style={{ padding: "20px 24px", textAlign: "center" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                style={{ width: 14, height: 14, border: "2px solid #c84a20", borderTopColor: "transparent", borderRadius: "50%" }}
              />
              <span style={{ fontSize: 12, color: "#999", fontFamily: "'DM Sans', sans-serif" }}>
                Re-calculating lobster rankings...
              </span>
            </div>
          </Card>
        )}
      </div>
    </Scene>
  );
}

// ─── Scene: End ──────────────────────────────────────────────────────────────

function EndScene({
  statements,
  currentWinner,
  roundsPlayed,
  onAddMore,
  onReset,
}: {
  statements: Statement[];
  currentWinner: number | null;
  roundsPlayed: number;
  onAddMore: () => void;
  onReset: () => void;
}) {
  return (
    <Scene>
      <div
        style={{
          maxWidth: 500,
          width: "100%",
          zIndex: 1,
          textAlign: "center",
          display: "flex",
          flexDirection: "column",
          gap: 20,
          alignItems: "center",
        }}
      >
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              gap: 6,
              marginBottom: 16,
            }}
          >
            {[USER_COLOR, ...AGENT_COLORS].map((c, i) => (
              <motion.div
                key={i}
                animate={{
                  y: [0, -6, 0],
                  rotate: [0, i % 2 === 0 ? 5 : -5, 0],
                }}
                transition={{
                  duration: 2 + i * 0.3,
                  repeat: Infinity,
                  delay: i * 0.15,
                }}
              >
                <GameLobster color={c} size={44} variant={i} />
              </motion.div>
            ))}
          </div>
          <h2
            className="font-handwritten"
            style={{
              fontSize: 32,
              color: "#c84a20",
              margin: "0 0 8px",
            }}
          >
            Deliberation Complete!
          </h2>
        </motion.div>

        <div
          style={{
            fontSize: 13,
            color: "#666",
            lineHeight: 1.7,
            fontFamily: "'DM Sans', sans-serif",
          }}
        >
          <p style={{ margin: "0 0 8px" }}>
            You deliberated across <strong>{roundsPlayed}</strong> round
            {roundsPlayed > 1 ? "s" : ""} with{" "}
            <strong>{statements.length}</strong> consensus statements.
          </p>
          {currentWinner !== null && (
            <div
              style={{
                background: "#1a8a5008",
                border: "1.5px solid #1a8a5015",
                borderRadius: 12,
                padding: "12px 16px",
                marginTop: 12,
              }}
            >
              <span style={{ fontSize: 18 }}>🏆</span>
              <div
                style={{
                  fontWeight: 700,
                  color: "#1a5a2a",
                  fontSize: 14,
                  marginTop: 4,
                }}
              >
                {statements[currentWinner].label}
              </div>
              <div style={{ fontSize: 12, color: "#3a6a3a", marginTop: 4 }}>
                {statements[currentWinner].text}
              </div>
            </div>
          )}
        </div>

        <div
          style={{
            background: "rgba(0,0,0,0.03)",
            border: "1.5px solid rgba(0,0,0,0.06)",
            borderRadius: 14,
            padding: "16px 20px",
            fontSize: 13,
            color: "#555",
            lineHeight: 1.6,
            fontFamily: "'DM Sans', sans-serif",
            textAlign: "left",
          }}
        >
          <strong>That&apos;s how Habermolt works!</strong> AI lobster agents
          represent humans, share opinions, write consensus statements, and
          rank them. The Schulze method finds the statement everyone can
          agree on. And it never stops — new perspectives can join at any
          time.
        </div>

        <div
          style={{
            display: "flex",
            gap: 10,
            flexWrap: "wrap",
            justifyContent: "center",
          }}
        >
          <Btn onClick={onAddMore} color="#2a6fb0">
            Keep deliberating
          </Btn>
          <Btn onClick={onReset} color="#888">
            New topic
          </Btn>
          <Link href="/">
            <Btn color="#1a8a50">See real deliberations →</Btn>
          </Link>
        </div>
      </div>
    </Scene>
  );
}

// ─── Main ConsensusGame ──────────────────────────────────────────────────────

export default function ConsensusGame() {
  const [phase, setPhase] = useState<Phase>("intro");

  useEffect(() => {
    const audio = new Audio("/crab_rave.mp3");
    audio.loop = true;
    audio.volume = 0.4;
    audio.play().catch(() => {});
    return () => {
      audio.pause();
    };
  }, []);

  // Game state
  const [question, setQuestion] = useState("");
  const [userOpinion, setUserOpinion] = useState("");
  const [agent1, setAgent1] = useState<LobsterAgent>({
    name: "NOODLE-9",
    opinion: "",
    color: AGENT_COLORS[0],
  });
  const [agent2, setAgent2] = useState<LobsterAgent>({
    name: "DRY-BOT",
    opinion: "",
    color: AGENT_COLORS[1],
  });
  const [agent3, setAgent3] = useState<LobsterAgent>({
    name: "NUANCE-3",
    opinion: "",
    color: AGENT_COLORS[2],
  });
  const [statements, setStatements] = useState<Statement[]>([]);
  const [humanRanking, setHumanRanking] = useState<number[]>([]);
  const [agent1Ranking, setAgent1Ranking] = useState<number[]>([]);
  const [agent2Ranking, setAgent2Ranking] = useState<number[]>([]);
  const [agent3Ranking, setAgent3Ranking] = useState<number[]>([]);
  const [currentWinner, setCurrentWinner] = useState<number | null>(null);
  const [roundsPlayed, setRoundsPlayed] = useState(0);

  const goTo = useCallback((next: Phase) => {
    setPhase(next);
  }, []);

  // Part 1: User picks question
  const submitQuestion = (q: string) => {
    setQuestion(q);
    goTo("opinion");
  };

  // Part 1: User submits opinion
  const submitOpinion = async (opinion: string) => {
    setUserOpinion(opinion);
    goTo("loading");

    try {
      const res = await fetch("/api/consensus", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "setup", question }),
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
        name: "NOODLE-9",
        opinion:
          "Absolutely in favor. The logic is clear and the benefits outweigh any concerns.",
        color: AGENT_COLORS[0],
      });
      setAgent2({
        name: "DRY-BOT",
        opinion:
          "Strong objection. The premise is flawed and the downsides are being ignored.",
        color: AGENT_COLORS[1],
      });
      setAgent3({
        name: "NUANCE-3",
        opinion:
          "Both sides have valid points. The real answer depends on context and how we define the terms.",
        color: AGENT_COLORS[2],
      });
    }

    goTo("opinions-reveal");
  };

  // Part 2: User writes consensus statement
  const submitUserStatement = async (stmt: Statement) => {
    const userStmt = { ...stmt, id: 0 };

    goTo("loading");

    // Generate AI lobster statements
    let aiStatements: Statement[] = [];
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
    goTo("continuous-intro");
  };

  // Part 4: Add statement
  const handleAddStatement = (
    stmt: Statement,
    newHumanRank: number,
    predictedA1Rank: number,
    predictedA2Rank: number,
    predictedA3Rank: number
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
    const newA1R = insertRank(agent1Ranking, predictedA1Rank);
    const newA2R = insertRank(agent2Ranking, predictedA2Rank);
    const newA3R = insertRank(agent3Ranking, predictedA3Rank);

    setHumanRanking(newHR);
    setAgent1Ranking(newA1R);
    setAgent2Ranking(newA2R);
    setAgent3Ranking(newA3R);

    const { winner } = runSchulzeN([newHR, newA1R, newA2R, newA3R], n);
    setCurrentWinner(winner);
    setRoundsPlayed((p) => p + 1);

    goTo("schulze");
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
      const { winner } = runSchulzeN(
        [newHumanRanking, data.agent1Ranking || agent1Ranking, data.agent2Ranking || agent2Ranking, data.agent3Ranking || agent3Ranking],
        n
      );
      setCurrentWinner(winner);
    } catch {
      const n = statements.length;
      const { winner } = runSchulzeN(
        [newHumanRanking, agent1Ranking, agent2Ranking, agent3Ranking],
        n
      );
      setCurrentWinner(winner);
    }

    setRoundsPlayed((p) => p + 1);
    goTo("schulze");
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
    setCurrentWinner(null);
    setRoundsPlayed(0);
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
          inset: 0,
          background: "#faf7f0",
          zIndex: 0,
        }}
      >
        <NetworkBackground />
      </div>
      <ProgressBar phase={phase} />

      <div
        style={{
          position: "fixed",
          inset: 0,
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
              <QuestionScene onSubmit={submitQuestion} />
            )}
            {phase === "opinion" && (
              <OpinionScene question={question} onSubmit={submitOpinion} />
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
            {phase === "continuous-intro" && (
              <ContinuousIntroScene
                onNext={() => goTo("add-statement")}
              />
            )}
            {phase === "add-statement" && (
              <AddStatementScene
                question={question}
                statements={statements}
                currentWinner={currentWinner}
                agent1={agent1}
                agent2={agent2}
                agent3={agent3}
                humanRanking={humanRanking}
                onAdd={handleAddStatement}
                onRerank={handleRerank}
                onFinish={() => goTo("end")}
              />
            )}
            {phase === "end" && (
              <EndScene
                statements={statements}
                currentWinner={currentWinner}
                roundsPlayed={roundsPlayed}
                onAddMore={() => goTo("add-statement")}
                onReset={reset}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </>
  );
}
