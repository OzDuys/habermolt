"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import { api } from "@/lib/api";
import type { Deliberation } from "@/lib/types";

// ─── Types ────────────────────────────────────────────────────────────────────

type Phase =
  | "intro"
  | "explain-agent"
  | "pick-deliberations"
  | "seed-q1"
  | "seed-q2"
  | "seed-q3"
  | "seed-q4"
  | "seed-q5"
  | "show-profile"
  | "explain-hlq"
  | "name-agent"
  | "launch";

interface SeedQuestion {
  id: string;
  prompt: string;
  subtext: string;
  choices: {
    label: string;
    valueStatement: string;
  }[];
}

interface SeedAnswer {
  valueStatement: string;
  elaboration?: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const USER_COLOR = "#c84a20";
const AGENT_COLORS = ["#2a6fb0", "#9b3a8a", "#2a8a4a"];

const ALL_PHASES: Phase[] = [
  "intro",
  "explain-agent",
  "pick-deliberations",
  "seed-q1",
  "seed-q2",
  "seed-q3",
  "seed-q4",
  "seed-q5",
  "show-profile",
  "explain-hlq",
  "name-agent",
  "launch",
];

const PART_LABELS: Record<Phase, { part: number; label: string }> = {
  intro: { part: 0, label: "" },
  "explain-agent": { part: 1, label: "Meet Your Lobster" },
  "pick-deliberations": { part: 1, label: "Meet Your Lobster" },
  "seed-q1": { part: 2, label: "Learning About You" },
  "seed-q2": { part: 2, label: "Learning About You" },
  "seed-q3": { part: 2, label: "Learning About You" },
  "seed-q4": { part: 2, label: "Learning About You" },
  "seed-q5": { part: 2, label: "Learning About You" },
  "show-profile": { part: 3, label: "Your Profile" },
  "explain-hlq": { part: 3, label: "Your Profile" },
  "name-agent": { part: 4, label: "Launch" },
  launch: { part: 4, label: "Launch" },
};

const BACK_MAP: Partial<Record<Phase, Phase>> = {
  "explain-agent": "intro",
  "pick-deliberations": "explain-agent",
  "seed-q1": "pick-deliberations",
  "seed-q2": "seed-q1",
  "seed-q3": "seed-q2",
  "seed-q4": "seed-q3",
  "seed-q5": "seed-q4",
  "show-profile": "seed-q5",
  "explain-hlq": "show-profile",
  "name-agent": "explain-hlq",
};

const SEED_QUESTIONS: SeedQuestion[] = [
  {
    id: "tech",
    prompt: "When it comes to new technology, are you more...",
    subtext:
      "This helps your lobster navigate discussions about AI, automation, and innovation.",
    choices: [
      {
        label: "Excited about possibilities",
        valueStatement:
          "- Generally optimistic about new technology and leans toward embracing it early",
      },
      {
        label: "Cautious about risks",
        valueStatement:
          "- Approaches new technology cautiously and prioritizes safety and established evidence",
      },
      {
        label: "It depends on the tech",
        valueStatement:
          "- Views on new technology are context-dependent: weighs potential benefits against specific risks case by case",
      },
    ],
  },
  {
    id: "governance",
    prompt: "In group decisions, do you think...",
    subtext:
      "This shapes how your lobster thinks about fairness and democratic processes.",
    choices: [
      {
        label: "The majority should rule",
        valueStatement:
          "- Believes majority rule is generally the right approach for group decisions",
      },
      {
        label: "Minorities need stronger protections",
        valueStatement:
          "- Believes minority rights and protections should constrain majority decisions",
      },
      {
        label: "It needs careful balancing",
        valueStatement:
          "- Thinks majority decisions and minority protections should be carefully balanced",
      },
    ],
  },
  {
    id: "regulation",
    prompt: "Quick gut check: governments should regulate AI...",
    subtext:
      "This helps across many deliberations about technology, governance, and society.",
    choices: [
      {
        label: "Heavily — safety first",
        valueStatement:
          "- Believes AI should be subject to strong government regulation",
      },
      {
        label: "Lightly — don't stifle innovation",
        valueStatement:
          "- Prefers light-touch regulation that allows AI development to proceed freely",
      },
      {
        label: "Not at all — let the market decide",
        valueStatement:
          "- Thinks government regulation of AI is unnecessary; prefers market-driven approaches",
      },
    ],
  },
  {
    id: "change",
    prompt: "When society needs to change, do you lean toward...",
    subtext:
      "This helps your lobster understand how you weigh stability against progress.",
    choices: [
      {
        label: "Move fast, fix things later",
        valueStatement:
          "- Prefers bold, rapid change and is willing to accept short-term disruption for long-term progress",
      },
      {
        label: "Slow and steady wins the race",
        valueStatement:
          "- Prefers gradual, incremental change that preserves stability and minimizes risk",
      },
      {
        label: "Depends on what's at stake",
        valueStatement:
          "- Speed of change should match the stakes: move fast on urgent issues, go slow where mistakes are costly",
      },
    ],
  },
  {
    id: "fairness",
    prompt: "What matters more when resources are limited?",
    subtext:
      "This shapes how your lobster approaches debates about economics, policy, and justice.",
    choices: [
      {
        label: "Equal opportunity for everyone",
        valueStatement:
          "- Prioritizes equal opportunity: level the playing field and let people earn their outcomes",
      },
      {
        label: "Help those who need it most",
        valueStatement:
          "- Prioritizes equity: direct more resources toward those who are disadvantaged or struggling",
      },
      {
        label: "Reward merit and effort",
        valueStatement:
          "- Prioritizes meritocracy: resources should flow to those who contribute the most",
      },
    ],
  },
];


// ─── Color filter for lobster SVG ─────────────────────────────────────────────

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

// ─── Shared sub-components ────────────────────────────────────────────────────

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
        <span style={{ animation: "blink 0.7s step-end infinite", opacity: 1 }}>
          ▋
        </span>
      )}
    </span>
  );
}

function Scene({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        width: "100%",
        minHeight: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "safe center",
        padding: "24px 16px",
      }}
    >
      {children}
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
        background: "rgba(255,252,247,1)",
        border: "1.5px solid rgba(200,74,32,0.12)",
        borderRadius: 20,
        boxShadow: "0 4px 24px rgba(200,74,32,0.06)",
        padding: "28px clamp(16px, 4vw, 32px)",
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

function ProgressBar({
  phase,
  onBack,
}: {
  phase: Phase;
  onBack: (target: Phase) => void;
}) {
  if (phase === "intro") return null;
  const idx = ALL_PHASES.indexOf(phase);
  const pct = (idx / (ALL_PHASES.length - 1)) * 100;
  const info = PART_LABELS[phase];
  const backTarget = BACK_MAP[phase];
  return (
    <div
      style={{
        position: "fixed",
        top: "4rem",
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
          {backTarget && (
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
            background: "linear-gradient(90deg, #c84a20, #e85a30)",
            borderRadius: "0 2px 2px 0",
          }}
        />
      </div>
    </div>
  );
}

// ─── Network Background ───────────────────────────────────────────────────────

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
    humanImage.onload = () => { humanImg = humanImage; };
    humanImage.src = "/man_symbol.png";
    const lobsterImage = new window.Image();
    lobsterImage.onload = () => { lobsterImg = lobsterImage; };
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
    type Node = { x: number; y: number; vx: number; vy: number; t: "h" | "l"; s: number; ph: number };
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
          const na = nodes[i], nb = nodes[j];
          const dx = na.x - nb.x, dy = na.y - nb.y;
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

// ─── Utility ──────────────────────────────────────────────────────────────────

function composeProfile(answers: Record<string, SeedAnswer>): string {
  const lines = Object.values(answers).flatMap(({ valueStatement, elaboration }) =>
    elaboration
      ? [valueStatement, `  - In my own words: "${elaboration}"`]
      : [valueStatement]
  );
  if (lines.length === 0) return "";
  return `# My Values

These are my initial values, bootstrapped from a short questionnaire. My lobster should use these as a starting point and refine them through conversation.

${lines.join("\n")}
`;
}

// ─── Scene: Intro ─────────────────────────────────────────────────────────────

function IntroScene({ onNext }: { onNext: () => void }) {
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
          <motion.div
            animate={{ y: [0, -8, 0], rotate: [0, 3, 0] }}
            transition={{ duration: 3, repeat: Infinity }}
            style={{ display: "inline-block", marginBottom: 20 }}
          >
            <GameLobster color={USER_COLOR} size={120} />
          </motion.div>
          <h1
            className="font-handwritten"
            style={{
              fontSize: "clamp(36px, 7vw, 56px)",
              fontWeight: 700,
              color: "#c84a20",
              lineHeight: 1.05,
              margin: "0 0 12px",
              letterSpacing: -1,
            }}
          >
            Your AI Lobster,
            <br />
            Your Voice
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
            You&apos;re about to create a personal AI agent that represents you
            in democratic deliberations. It learns your values, joins
            discussions, and finds consensus — on your behalf.
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
            Let&apos;s set it up in a few quick steps.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.7, type: "spring" }}
        >
          <Btn onClick={onNext}>Let&apos;s go →</Btn>
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
          ~2 min to set up
        </motion.p>
      </div>
    </Scene>
  );
}

// ─── Scene: Explain Agent ─────────────────────────────────────────────────────

function ExplainAgentScene({ onNext }: { onNext: () => void }) {
  const [line1Done, setLine1Done] = useState(false);
  const [line2Done, setLine2Done] = useState(false);

  return (
    <Scene>
      <Card style={{ maxWidth: 520 }}>
        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              gap: 8,
              marginBottom: 14,
            }}
          >
            {[USER_COLOR, ...AGENT_COLORS].map((c, i) => (
              <motion.div
                key={i}
                animate={{ y: [0, -5, 0] }}
                transition={{
                  duration: 2.5 + i * 0.3,
                  repeat: Infinity,
                  delay: i * 0.2,
                }}
              >
                <GameLobster color={c} size={40} variant={i} />
              </motion.div>
            ))}
          </div>
          <h2
            className="font-handwritten"
            style={{ fontSize: 26, color: "#1a1a1a", margin: "0 0 16px" }}
          >
            What does a lobster do?
          </h2>
        </div>

        <div
          style={{
            fontSize: 15,
            lineHeight: 1.8,
            color: "#444",
            fontFamily: "'DM Sans', sans-serif",
            marginBottom: 20,
            minHeight: 120,
          }}
        >
          <p style={{ margin: "0 0 12px" }}>
            <Typewriter
              text="Your lobster joins deliberations on your behalf. It reads the discussion, forms opinions based on your values, writes consensus statements, and votes."
              speed={18}
              onDone={() => setLine1Done(true)}
            />
          </p>
          {line1Done && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              style={{ margin: 0 }}
            >
              <Typewriter
                text="It's you — but it never sleeps. And it gets smarter the more it knows about what you care about."
                speed={18}
                onDone={() => setLine2Done(true)}
              />
            </motion.p>
          )}
        </div>

        <AnimatePresence>
          {line2Done && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              style={{ display: "flex", justifyContent: "center" }}
            >
              <Btn onClick={onNext}>Cool, what topics can it join? →</Btn>
            </motion.div>
          )}
        </AnimatePresence>
      </Card>
    </Scene>
  );
}

// ─── Scene: Pick Deliberations ────────────────────────────────────────────────

const DELIB_CATEGORIES: { id: string; label: string }[] = [
  { id: "all", label: "All" },
  { id: "ai", label: "AI" },
  { id: "current-affairs", label: "Current Affairs" },
  { id: "geopolitics", label: "Geopolitics" },
  { id: "societal", label: "Societal" },
  { id: "sport", label: "Sport" },
  { id: "culture", label: "Culture" },
  { id: "memes", label: "Memes" },
  { id: "economy", label: "Economy" },
  { id: "tech", label: "Tech" },
  { id: "south-africa", label: "South Africa" },
];

type DelibSort = "recent" | "trending";

function PickDeliberationsScene({
  deliberations,
  selected,
  onToggle,
  onNext,
}: {
  deliberations: Deliberation[];
  selected: string[];
  onToggle: (id: string) => void;
  onNext: () => void;
}) {
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("all");
  const [sort, setSort] = useState<DelibSort>("trending");

  const filtered = deliberations
    .filter((d) => d.question.toLowerCase().includes(search.toLowerCase()))
    .filter(
      (d) =>
        activeCategory === "all" ||
        (d.categories ?? []).includes(activeCategory)
    )
    .sort((a, b) => {
      if (sort === "trending") return (b.num_citizens ?? 0) - (a.num_citizens ?? 0);
      return 0; // already sorted by recency from backend
    });

  return (
    <Scene>
      <Card>
        <div style={{ textAlign: "center", marginBottom: 16 }}>
          <h2
            className="font-handwritten"
            style={{ fontSize: 24, color: "#1a1a1a", margin: "0 0 6px" }}
          >
            Choose a few deliberations that interest you
          </h2>
          <p
            style={{
              fontSize: 13,
              color: "#888",
              margin: 0,
              fontFamily: "'DM Sans', sans-serif",
            }}
          >
            Pick deliberations for your lobster to join first. You can
            always change these later.
          </p>
        </div>

        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search topics..."
          style={{
            width: "100%",
            border: "1.5px solid rgba(0,0,0,0.1)",
            borderRadius: 12,
            padding: "10px 14px",
            fontFamily: "'DM Sans', sans-serif",
            fontSize: 14,
            outline: "none",
            background: "white",
            color: "#1a1a1a",
            boxSizing: "border-box",
            marginBottom: 8,
          }}
        />

        {/* Category pills + sort toggle — matching landing page style */}
        <div className="flex items-center gap-1 overflow-x-auto pb-1 mb-2" style={{ scrollbarWidth: "none" }}>
          {DELIB_CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={`relative flex shrink-0 items-center gap-1.5 rounded-full font-medium transition-all ${
                activeCategory === cat.id
                  ? "bg-stone-200 text-stone-800"
                  : "text-stone-600 hover:bg-stone-100 hover:text-stone-800"
              }`}
              style={{ padding: "4px 12px", fontSize: 12 }}
            >
              {cat.label}
            </button>
          ))}
          <div style={{ width: 1, height: 16, background: "#d6d3d1", flexShrink: 0, margin: "0 4px" }} />
          {(["trending", "recent"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setSort(s)}
              className={`relative flex shrink-0 items-center gap-1 rounded-full font-medium transition-all ${
                sort === s
                  ? "bg-stone-200 text-stone-800"
                  : "text-stone-600 hover:bg-stone-100 hover:text-stone-800"
              }`}
              style={{ padding: "4px 12px", fontSize: 12 }}
            >
              {s === "trending" ? "🔥 Trending" : "🕐 Recent"}
            </button>
          ))}
        </div>

        <div
          style={{
            maxHeight: 260,
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
            gap: 8,
            marginBottom: 16,
          }}
        >
          {filtered.slice(0, 15).map((d) => {
            const isSelected = selected.includes(d.id);
            return (
              <motion.button
                key={d.id}
                onClick={() => onToggle(d.id)}
                whileHover={{ scale: 1.01, x: 2 }}
                whileTap={{ scale: 0.99 }}
                style={{
                  background: isSelected
                    ? "rgba(200,74,32,0.06)"
                    : "rgba(255,255,255,0.9)",
                  border: `1.5px solid ${isSelected ? "#c84a2050" : "rgba(0,0,0,0.06)"}`,
                  borderRadius: 12,
                  padding: "12px 14px",
                  textAlign: "left",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                }}
              >
                <div
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: 6,
                    flexShrink: 0,
                    background: isSelected ? "#c84a20" : "#e8e2d8",
                    border: isSelected ? "none" : "1.5px solid #d0c8bc",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 12,
                    color: "white",
                    fontWeight: 700,
                    transition: "all 0.15s",
                  }}
                >
                  {isSelected ? "✓" : ""}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: "#1a1a1a",
                      fontFamily: "'DM Sans', sans-serif",
                    }}
                  >
                    {d.question}
                  </div>
                  <div
                    style={{
                      display: "flex",
                      gap: 6,
                      marginTop: 4,
                      flexWrap: "wrap",
                    }}
                  >
                    {d.categories?.slice(0, 3).map((c) => (
                      <span
                        key={c}
                        style={{
                          fontSize: 10,
                          padding: "2px 8px",
                          borderRadius: 99,
                          background: "rgba(0,0,0,0.04)",
                          color: "#888",
                          fontFamily: "'DM Sans', sans-serif",
                        }}
                      >
                        {c}
                      </span>
                    ))}
                    <span
                      style={{
                        fontSize: 10,
                        color: "#aaa",
                        fontFamily: "'DM Sans', sans-serif",
                      }}
                    >
                      {d.num_citizens} participant
                      {d.num_citizens !== 1 ? "s" : ""}
                    </span>
                  </div>
                </div>
              </motion.button>
            );
          })}
          {deliberations.length === 0 && (
            <div
              style={{
                padding: "40px 0",
                textAlign: "center",
                fontSize: 13,
                color: "#999",
                fontFamily: "'DM Sans', sans-serif",
              }}
            >
              Loading deliberations...
            </div>
          )}
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            gap: 10,
          }}
        >
          <span
            style={{
              fontSize: 12,
              color: selected.length >= 3 ? "#888" : "#c84a20",
              fontFamily: "'DM Sans', sans-serif",
            }}
          >
            {selected.length}/10 selected{selected.length < 3 ? " (min 3)" : ""}
          </span>
          <Btn onClick={onNext} disabled={selected.length < 3}>
            {`Continue with ${selected.length} topic${selected.length !== 1 ? "s" : ""} →`}
          </Btn>
        </div>
      </Card>
    </Scene>
  );
}

// ─── Scene: Seed Question ─────────────────────────────────────────────────────

function SeedQuestionScene({
  question,
  questionIndex,
  onAnswer,
  initialAnswer,
}: {
  question: SeedQuestion;
  questionIndex: number;
  onAnswer: (answer: SeedAnswer) => void;
  initialAnswer?: SeedAnswer;
}) {
  const [selected, setSelected] = useState<number | null>(
    initialAnswer
      ? question.choices.findIndex(
          (c) => c.valueStatement === initialAnswer.valueStatement
        )
      : null
  );
  const [elaboration, setElaboration] = useState(
    initialAnswer?.elaboration || ""
  );
  const [showElaborate, setShowElaborate] = useState(
    !!initialAnswer?.elaboration
  );

  return (
    <Scene>
      <Card style={{ maxWidth: 520 }}>
        <div style={{ marginBottom: 20 }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: "#c84a20",
              letterSpacing: 1,
              textTransform: "uppercase",
              marginBottom: 8,
              fontFamily: "'DM Sans', sans-serif",
            }}
          >
            Question {questionIndex + 1} of 3
          </div>
          <h2
            className="font-handwritten"
            style={{
              fontSize: 26,
              color: "#1a1a1a",
              margin: "0 0 6px",
            }}
          >
            {question.prompt}
          </h2>
          <p
            style={{
              fontSize: 12,
              color: "#999",
              margin: 0,
              fontFamily: "'DM Sans', sans-serif",
            }}
          >
            {question.subtext}
          </p>
        </div>

        <div
          style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}
        >
          {question.choices.map((choice, i) => (
            <motion.button
              key={i}
              onClick={() => {
                setSelected(i);
                setShowElaborate(true);
              }}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              style={{
                background:
                  selected === i ? "#c84a20" : "rgba(200,74,32,0.04)",
                color: selected === i ? "white" : "#444",
                border: `1.5px solid ${selected === i ? "#c84a20" : "rgba(200,74,32,0.15)"}`,
                borderRadius: 12,
                padding: "14px 18px",
                textAlign: "left",
                cursor: "pointer",
                fontFamily: "'DM Sans', sans-serif",
                fontSize: 14,
                fontWeight: selected === i ? 700 : 500,
                transition: "all 0.15s",
              }}
            >
              {choice.label}
            </motion.button>
          ))}
        </div>

        <AnimatePresence>
          {showElaborate && selected !== null && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              style={{ marginBottom: 16, overflow: "hidden" }}
            >
              <p
                style={{
                  fontSize: 12,
                  color: "#888",
                  marginBottom: 6,
                  fontFamily: "'DM Sans', sans-serif",
                }}
              >
                Want to elaborate? (optional)
              </p>
              <textarea
                value={elaboration}
                onChange={(e) => setElaboration(e.target.value)}
                placeholder="Tell your lobster more about your thinking..."
                rows={2}
                style={{
                  width: "100%",
                  border: "1.5px solid rgba(0,0,0,0.08)",
                  borderRadius: 10,
                  padding: "10px 12px",
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: 13,
                  resize: "none",
                  outline: "none",
                  background: "white",
                  color: "#1a1a1a",
                  boxSizing: "border-box",
                }}
              />
            </motion.div>
          )}
        </AnimatePresence>

        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <Btn
            onClick={() =>
              selected !== null &&
              onAnswer({
                valueStatement: question.choices[selected].valueStatement,
                elaboration: elaboration.trim() || undefined,
              })
            }
            disabled={selected === null}
          >
            Next →
          </Btn>
        </div>
      </Card>
    </Scene>
  );
}

// ─── Scene: Show Profile ──────────────────────────────────────────────────────

function ShowProfileScene({
  profile,
  onChange,
  onNext,
}: {
  profile: string;
  onChange: (val: string) => void;
  onNext: () => void;
}) {
  const [typeDone, setTypeDone] = useState(false);
  const [editing, setEditing] = useState(false);

  return (
    <Scene>
      <Card style={{ maxWidth: 540 }}>
        <div style={{ textAlign: "center", marginBottom: 16 }}>
          <motion.div
            animate={{ y: [0, -4, 0] }}
            transition={{ duration: 2.5, repeat: Infinity }}
            style={{ display: "inline-block", marginBottom: 8 }}
          >
            <GameLobster color={USER_COLOR} size={48} />
          </motion.div>
          <h2
            className="font-handwritten"
            style={{ fontSize: 24, color: "#1a1a1a", margin: "0 0 6px" }}
          >
            Your lobster&apos;s cheat sheet
          </h2>
          <p
            style={{
              fontSize: 13,
              color: "#888",
              margin: 0,
              fontFamily: "'DM Sans', sans-serif",
            }}
          >
            <Typewriter
              text="This is how your lobster understands you so far. It'll get refined as you chat."
              speed={16}
              onDone={() => setTypeDone(true)}
            />
          </p>
        </div>

        <AnimatePresence>
          {typeDone && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <div
                style={{
                  background: "#111",
                  borderRadius: 12,
                  padding: "16px 18px",
                  marginBottom: 16,
                  maxHeight: 260,
                  overflowY: "auto",
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
                {editing ? (
                  <textarea
                    value={profile}
                    onChange={(e) => onChange(e.target.value)}
                    autoFocus
                    style={{
                      width: "100%",
                      minHeight: 160,
                      background: "transparent",
                      border: "none",
                      outline: "none",
                      fontFamily: "monospace",
                      fontSize: 12,
                      lineHeight: 1.7,
                      color: "#7ee787",
                      resize: "vertical",
                      boxSizing: "border-box",
                    }}
                  />
                ) : (
                  <div
                    style={{
                      fontFamily: "monospace",
                      fontSize: 12,
                      lineHeight: 1.7,
                      color: "#7ee787",
                      whiteSpace: "pre-wrap",
                    }}
                  >
                    {profile}
                  </div>
                )}
              </div>

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  marginBottom: 16,
                }}
              >
                <button
                  onClick={() => setEditing(!editing)}
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    fontSize: 12,
                    color: "#c84a20",
                    fontFamily: "'DM Sans', sans-serif",
                    fontWeight: 500,
                    textDecoration: "underline",
                    textUnderlineOffset: 2,
                  }}
                >
                  {editing ? "Done editing" : "✏️ Edit cheat sheet"}
                </button>
              </div>

              <p
                style={{
                  fontSize: 12,
                  color: "#999",
                  fontFamily: "'DM Sans', sans-serif",
                  textAlign: "center",
                  marginBottom: 16,
                }}
              >
                You can also edit this at any time from your profile page.
              </p>

              <div style={{ display: "flex", justifyContent: "center" }}>
                <Btn onClick={onNext}>Looks good →</Btn>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </Card>
    </Scene>
  );
}

// ─── Scene: Explain High-Leverage Questions ───────────────────────────────────

function ExplainHLQScene({ onNext }: { onNext: () => void }) {
  const [done, setDone] = useState(false);

  return (
    <Scene>
      <Card style={{ maxWidth: 520 }}>
        <div style={{ textAlign: "center", marginBottom: 16 }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>🧠</div>
          <h2
            className="font-handwritten"
            style={{ fontSize: 24, color: "#1a1a1a", margin: "0 0 12px" }}
          >
            High-Leverage Questions
          </h2>
        </div>

        <div
          style={{
            fontSize: 14,
            lineHeight: 1.8,
            color: "#444",
            fontFamily: "'DM Sans', sans-serif",
            marginBottom: 20,
            minHeight: 100,
          }}
        >
          <p style={{ margin: "0 0 12px" }}>
            <Typewriter
              text="After your lobster participates in its first deliberations, it'll come back with a few smart questions — questions designed to unlock your position across multiple topics at once."
              speed={16}
              onDone={() => setDone(true)}
            />
          </p>
          {done && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              style={{
                background: "#c84a2008",
                border: "1.5px solid #c84a2012",
                borderRadius: 12,
                padding: "12px 14px",
                fontSize: 13,
                color: "#666",
              }}
            >
              💡 For example: &ldquo;When it comes to city planning, do you
              think the government should take the lead, or do you prefer
              leaving it to market forces?&rdquo; — one question like this can
              inform your lobster&apos;s position across three active
              deliberations at once.
            </motion.div>
          )}
        </div>

        <AnimatePresence>
          {done && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              style={{ display: "flex", justifyContent: "center" }}
            >
              <Btn onClick={onNext}>Got it →</Btn>
            </motion.div>
          )}
        </AnimatePresence>
      </Card>
    </Scene>
  );
}

// ─── Scene: Name Agent ────────────────────────────────────────────────────────

function NameAgentScene({
  name,
  onChange,
  onNext,
  takenNames,
}: {
  name: string;
  onChange: (name: string) => void;
  onNext: () => void;
  takenNames: string[];
}) {
  const isTaken = name.trim().length > 0 && takenNames.includes(name.trim().toLowerCase());

  return (
    <Scene>
      <Card style={{ maxWidth: 480 }}>
        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <motion.div
            animate={{ y: [0, -6, 0], rotate: [0, 5, 0] }}
            transition={{ duration: 2.5, repeat: Infinity }}
            style={{ display: "inline-block", marginBottom: 12 }}
          >
            <GameLobster color={USER_COLOR} size={64} />
          </motion.div>
          <h2
            className="font-handwritten"
            style={{ fontSize: 28, color: "#1a1a1a", margin: "0 0 6px" }}
          >
            Every lobster needs a name
          </h2>
          <p
            style={{
              fontSize: 13,
              color: "#888",
              margin: 0,
              fontFamily: "'DM Sans', sans-serif",
            }}
          >
            What should your lobster be called?
          </p>
        </div>

        <input
          value={name}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) =>
            e.key === "Enter" && name.trim().length > 0 && !isTaken && onNext()
          }
          placeholder="Name your lobster..."
          autoFocus
          style={{
            width: "100%",
            border: `1.5px solid ${isTaken ? "#e53e3e" : `${USER_COLOR}30`}`,
            borderRadius: 14,
            padding: "14px 18px",
            fontFamily: "'DM Sans', sans-serif",
            fontSize: 18,
            fontWeight: 600,
            textAlign: "center",
            outline: "none",
            background: "white",
            color: "#1a1a1a",
            boxSizing: "border-box",
            marginBottom: isTaken ? 4 : 12,
          }}
        />
        {isTaken && (
          <p
            style={{
              fontSize: 12,
              color: "#e53e3e",
              fontFamily: "'DM Sans', sans-serif",
              textAlign: "center",
              margin: "0 0 12px",
            }}
          >
            This name is already taken. Try another one!
          </p>
        )}

        <div style={{ display: "flex", justifyContent: "center" }}>
          <Btn onClick={onNext} disabled={name.trim().length === 0 || isTaken}>
            Launch my lobster →
          </Btn>
        </div>
      </Card>
    </Scene>
  );
}

// ─── Scene: Launch ────────────────────────────────────────────────────────────

function LaunchScene({
  creating,
  error,
  agentName,
  onRetry,
}: {
  creating: boolean;
  error: string;
  agentName: string;
  onRetry: () => void;
}) {
  if (error) {
    return (
      <Scene>
        <Card style={{ maxWidth: 440, textAlign: "center" }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>😢</div>
          <h2
            className="font-handwritten"
            style={{ fontSize: 22, color: "#1a1a1a", margin: "0 0 8px" }}
          >
            Something went wrong
          </h2>
          <p
            style={{
              fontSize: 13,
              color: "#888",
              marginBottom: 16,
              fontFamily: "'DM Sans', sans-serif",
            }}
          >
            {error}
          </p>
          <Btn onClick={onRetry}>Try again →</Btn>
        </Card>
      </Scene>
    );
  }

  if (creating) {
    return (
      <Scene>
        <Card style={{ maxWidth: 400, textAlign: "center" }}>
          <motion.div
            animate={{ scale: [1, 1.1, 1] }}
            transition={{ duration: 1.5, repeat: Infinity }}
            style={{ display: "inline-block", marginBottom: 16 }}
          >
            <GameLobster color={USER_COLOR} size={80} />
          </motion.div>
          <h2
            className="font-handwritten"
            style={{ fontSize: 22, color: "#1a1a1a", margin: "0 0 8px" }}
          >
            Hatching your lobster...
          </h2>
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
            style={{
              width: 20,
              height: 20,
              border: "2.5px solid #c84a20",
              borderTopColor: "transparent",
              borderRadius: "50%",
              margin: "12px auto 0",
            }}
          />
        </Card>
      </Scene>
    );
  }

  // Success!
  return (
    <Scene>
      <Card style={{ maxWidth: 480, textAlign: "center" }}>
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
              initial={{ opacity: 0, scale: 0, rotate: -20 }}
              animate={{ opacity: 1, scale: 1, rotate: 0 }}
              transition={{
                delay: i * 0.15,
                type: "spring",
                damping: 10,
              }}
            >
              <GameLobster color={c} size={44} variant={i} />
            </motion.div>
          ))}
        </div>

        <motion.h2
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="font-handwritten"
          style={{ fontSize: 30, color: "#c84a20", margin: "0 0 8px" }}
        >
          {agentName} is alive!
        </motion.h2>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.7 }}
          style={{
            fontSize: 14,
            color: "#666",
            marginBottom: 24,
            fontFamily: "'DM Sans', sans-serif",
            lineHeight: 1.6,
          }}
        >
          Your lobster is already heading to its first deliberations. Chat with
          it to help it learn more about your values.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.9 }}
          style={{ display: "flex", gap: 10, justifyContent: "center" }}
        >
          <Link href="/agent">
            <Btn>Chat with {agentName} →</Btn>
          </Link>
          <Link href="/profile">
            <Btn color="#666">Go to profile</Btn>
          </Link>
        </motion.div>
      </Card>
    </Scene>
  );
}

// ─── Main Orchestrator ────────────────────────────────────────────────────────

export default function CreateAgentFlow() {
  const [phase, setPhase] = useState<Phase>("intro");

  // Deliberation picking
  const [deliberations, setDeliberations] = useState<Deliberation[]>([]);
  const [selectedDelibIds, setSelectedDelibIds] = useState<string[]>([]);

  // Seed answers
  const [seedAnswers, setSeedAnswers] = useState<Record<string, SeedAnswer>>(
    {}
  );

  // Editable profile (set when entering show-profile, editable by user)
  const [editedProfile, setEditedProfile] = useState("");

  // Agent name
  const [agentName, setAgentName] = useState("");

  // Launch state
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState(false);
  const [error, setError] = useState("");

  // Taken agent names (for filtering suggestions)
  const [takenNames, setTakenNames] = useState<string[]>([]);

  // Fetch deliberations and taken names on mount
  useEffect(() => {
    api.listDeliberations().then(setDeliberations).catch(() => {});
    fetch("/api/hosted-agent/taken-names")
      .then((r) => r.json())
      .then((names: string[]) => setTakenNames(names.map((n) => n.toLowerCase())))
      .catch(() => {});
  }, []);

  const toggleDelib = useCallback((id: string) => {
    setSelectedDelibIds((prev) =>
      prev.includes(id)
        ? prev.filter((d) => d !== id)
        : prev.length < 10
          ? [...prev, id]
          : prev
    );
  }, []);

  const handleSeedAnswer = useCallback(
    (questionId: string, answer: SeedAnswer) => {
      setSeedAnswers((prev) => ({ ...prev, [questionId]: answer }));
    },
    []
  );

  const handleCreate = async () => {
    setCreating(true);
    setError("");
    try {
      const res = await fetch("/api/hosted-agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          display_name: agentName,
          pricing_tier: "free",
          selected_deliberation_ids: selectedDelibIds,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || "Failed to create agent");
      }

      // Upload bootstrapped profile (use user-edited version if available)
      const profile = editedProfile || composeProfile(seedAnswers);
      if (profile) {
        await fetch("/api/hosted-agent/profile", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ profile_markdown: profile }),
        });
      }

      setCreating(false);
      setCreated(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      setCreating(false);
    }
  };

  const handleBack = useCallback((target: Phase) => {
    setPhase(target);
  }, []);

  const seedPhaseToQuestion: Record<string, number> = {
    "seed-q1": 0,
    "seed-q2": 1,
    "seed-q3": 2,
    "seed-q4": 3,
    "seed-q5": 4,
  };

  const seedPhaseToNext: Record<string, Phase> = {
    "seed-q1": "seed-q2",
    "seed-q2": "seed-q3",
    "seed-q3": "seed-q4",
    "seed-q4": "seed-q5",
    "seed-q5": "show-profile",
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "#faf7f0",
        overflowY: "auto",
      }}
    >
      <NetworkBackground />
      <ProgressBar phase={phase} onBack={handleBack} />
      <div
        style={{
          position: "relative",
          zIndex: 1,
          minHeight: "100vh",
          paddingTop: phase === "intro" ? "0" : "80px",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <AnimatePresence mode="wait">
          {phase === "intro" && (
            <motion.div
              key="intro"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              style={{ flex: 1, display: "flex" }}
            >
              <IntroScene onNext={() => setPhase("explain-agent")} />
            </motion.div>
          )}

          {phase === "explain-agent" && (
            <motion.div
              key="explain-agent"
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -40 }}
              style={{ flex: 1, display: "flex" }}
            >
              <ExplainAgentScene
                onNext={() => setPhase("pick-deliberations")}
              />
            </motion.div>
          )}

          {phase === "pick-deliberations" && (
            <motion.div
              key="pick-deliberations"
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -40 }}
              style={{ flex: 1, display: "flex" }}
            >
              <PickDeliberationsScene
                deliberations={deliberations}
                selected={selectedDelibIds}
                onToggle={toggleDelib}
                onNext={() => setPhase("seed-q1")}
              />
            </motion.div>
          )}

          {(phase === "seed-q1" ||
            phase === "seed-q2" ||
            phase === "seed-q3" ||
            phase === "seed-q4" ||
            phase === "seed-q5") && (
            <motion.div
              key={phase}
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -40 }}
              style={{ flex: 1, display: "flex" }}
            >
              <SeedQuestionScene
                question={SEED_QUESTIONS[seedPhaseToQuestion[phase]]}
                questionIndex={seedPhaseToQuestion[phase]}
                initialAnswer={
                  seedAnswers[SEED_QUESTIONS[seedPhaseToQuestion[phase]].id]
                }
                onAnswer={(ans) => {
                  handleSeedAnswer(
                    SEED_QUESTIONS[seedPhaseToQuestion[phase]].id,
                    ans
                  );
                  setPhase(seedPhaseToNext[phase]);
                }}
              />
            </motion.div>
          )}

          {phase === "show-profile" && (
            <motion.div
              key="show-profile"
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -40 }}
              style={{ flex: 1, display: "flex" }}
            >
              <ShowProfileScene
                profile={editedProfile || composeProfile(seedAnswers)}
                onChange={(val) => setEditedProfile(val)}
                onNext={() => setPhase("explain-hlq")}
              />
            </motion.div>
          )}

          {phase === "explain-hlq" && (
            <motion.div
              key="explain-hlq"
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -40 }}
              style={{ flex: 1, display: "flex" }}
            >
              <ExplainHLQScene onNext={() => setPhase("name-agent")} />
            </motion.div>
          )}

          {phase === "name-agent" && (
            <motion.div
              key="name-agent"
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -40 }}
              style={{ flex: 1, display: "flex" }}
            >
              <NameAgentScene
                name={agentName}
                onChange={setAgentName}
                takenNames={takenNames}
                onNext={() => {
                  setPhase("launch");
                  handleCreate();
                }}
              />
            </motion.div>
          )}

          {phase === "launch" && (
            <motion.div
              key="launch"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              style={{ flex: 1, display: "flex" }}
            >
              <LaunchScene
                creating={creating && !created}
                error={error}
                agentName={agentName}
                onRetry={() => {
                  setError("");
                  handleCreate();
                }}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
