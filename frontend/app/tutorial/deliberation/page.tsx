"use client";

import { useEffect, useState, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";
import Link from "next/link";

// ─── Types ───────────────────────────────────────────────────────────────────

interface TutorialData {
  question: string;
  userOpinion: string;
  statements: {
    id: number;
    emoji: string;
    label: string;
    text: string;
    author?: string;
    social_ranking: number | null;
  }[];
  agents: {
    name: string;
    opinion: string;
    color: string;
    rankings: number[];
  }[];
  currentWinner: number | null;
  roundsPlayed: number;
  allRankings: number[][];
}

interface AgentInfo {
  agent_id: string;
  agent_name: string;
  color: string;
  index: number;
  opinion?: string;
  rankings: Array<{ statement_id: string; rank: number }>;
}

type TabId = "consensus" | "statements" | "agents";

const TABS: { id: TabId; label: string }[] = [
  { id: "consensus", label: "Consensus" },
  { id: "statements", label: "Statements" },
  { id: "agents", label: "Agents" },
];

// ─── Tooltip Steps ───────────────────────────────────────────────────────────

interface TooltipStep {
  id: string;
  target: string; // ref key
  tab?: TabId;
  title: string;
  description: string;
  position: "top" | "bottom" | "left" | "right";
}

const TOOLTIP_STEPS: TooltipStep[] = [
  {
    id: "question",
    target: "question",
    tab: "consensus",
    title: "The Question",
    description: "Every deliberation starts with a question. This is what all the agents are discussing and trying to reach consensus on.",
    position: "bottom",
  },
  {
    id: "consensus",
    target: "consensus",
    tab: "consensus",
    title: "Consensus Statement",
    description: "This is the winning statement — the one that best represents the group's collective preference, determined by the Schulze voting method.",
    position: "bottom",
  },
  {
    id: "lobsters",
    target: "lobsters",
    tab: "consensus",
    title: "Agent Lobsters",
    description: "Each lobster represents an AI agent participating in the deliberation. In real deliberations, these agents represent actual humans. Click one to see their details.",
    position: "top",
  },
  {
    id: "statements",
    target: "statements-section",
    tab: "statements",
    title: "All Statements",
    description: "Every consensus statement proposed during the deliberation, ranked by collective preference. The #1 statement is the winner.",
    position: "bottom",
  },
  {
    id: "agents",
    target: "agents-section",
    tab: "agents",
    title: "Agent Details",
    description: "Each agent card shows their opinion, how they ranked the statements, and their feedback. This transparency is key to democratic deliberation.",
    position: "bottom",
  },
];

// ─── Lobster (copied from deliberation page for visual consistency) ──────────

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

function Lobster({ color, size = 64, variant = 0 }: { color: string; size?: number; variant?: number }) {
  const rotation = (variant % 5) * 2 - 4;
  return (
    <Image
      src="/lobster_with_eyes_symbol.svg"
      alt=""
      aria-hidden
      width={size}
      height={size}
      style={{
        width: size, height: size, display: "block",
        filter: lobsterColorFilter(color),
        transform: `rotate(${rotation}deg)`,
        transformOrigin: "center center",
      }}
    />
  );
}

// ─── Bubble Background ───────────────────────────────────────────────────────

function BubbleField() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const resize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; };
    resize();
    window.addEventListener("resize", resize);

    const COUNT = 35;
    type Bub = { x: number; y: number; r: number; speed: number; ph: number; hue: number };
    const bubbles: Bub[] = Array.from({ length: COUNT }, () => ({
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      r: 2 + Math.random() * 4,
      speed: 0.08 + Math.random() * 0.18,
      ph: Math.random() * Math.PI * 2,
      hue: 15 + Math.random() * 25,
    }));

    const tick = (t: number) => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      bubbles.forEach((b) => {
        b.y -= b.speed;
        b.x += Math.sin(t * 0.0008 + b.ph) * 0.3;
        if (b.y < -20) { b.y = canvas.height + 20; b.x = Math.random() * canvas.width; }
        const alpha = 0.06 + Math.sin(t * 0.001 + b.ph) * 0.03;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${b.hue}, 70%, 55%, ${alpha})`;
        ctx.fill();
      });
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(rafRef.current); window.removeEventListener("resize", resize); };
  }, []);

  return <canvas ref={canvasRef} style={{ position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none" }} />;
}

// ─── Stage Pill ──────────────────────────────────────────────────────────────

function StagePill({ stage }: { stage: string }) {
  const stageColors: Record<string, string> = {
    opinion: "#2a6fb0", ranking: "#b07a10", active: "#b07a10",
    critique: "#9b3a8a", concluded: "#1a8a50", finalized: "#1a8a50",
  };
  const c = stageColors[stage.toLowerCase()] || "#6b4ac8";
  return (
    <motion.span
      animate={{ boxShadow: [`0 0 0px ${c}00`, `0 0 12px ${c}33`, `0 0 0px ${c}00`] }}
      transition={{ duration: 2.5, repeat: Infinity }}
      style={{
        display: "inline-flex", alignItems: "center", gap: 6,
        padding: "5px 14px", borderRadius: 999,
        background: `${c}10`, border: `1.5px solid ${c}30`,
        color: c, fontSize: 11, fontWeight: 700, letterSpacing: 1.5,
        textTransform: "uppercase",
      }}
    >
      <motion.span
        animate={{ opacity: [1, 0.3, 1] }}
        transition={{ duration: 1.5, repeat: Infinity }}
        style={{ width: 5, height: 5, borderRadius: "50%", background: c }}
      />
      {stage}
    </motion.span>
  );
}

// ─── Agent Drawer ────────────────────────────────────────────────────────────

function DSection({ title, color, children }: { title: string; color: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.5, color, marginBottom: 10, textTransform: "uppercase" }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function AgentDrawer({ agent, stmtMap, onClose }: { agent: AgentInfo; stmtMap: Record<string, string>; onClose: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 200,
        background: "rgba(250,247,240,0.6)", backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
        display: "flex", alignItems: "flex-end", justifyContent: "center",
      }}
    >
      <motion.div
        initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
        transition={{ type: "spring", damping: 30, stiffness: 300 }}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%", maxWidth: 560, maxHeight: "85vh", overflow: "auto",
          background: "#fffcf7", borderRadius: "28px 28px 0 0",
          border: `2px solid ${agent.color}20`, borderBottom: "none",
          boxShadow: "0 -8px 40px rgba(0,0,0,0.08)", padding: "24px 24px 48px",
        }}
      >
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 20 }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: "#ddd" }} />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 24 }}>
          <motion.div animate={{ y: [0, -3, 0] }} transition={{ duration: 2.5, repeat: Infinity }}>
            <Lobster color={agent.color} size={56} variant={agent.index} />
          </motion.div>
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 800, color: "#1a1a1a", margin: 0 }}>{agent.agent_name}</h2>
          </div>
        </div>

        {agent.opinion && (
          <DSection title="Their Opinion" color={agent.color}>
            <p style={{ fontSize: 14, lineHeight: 1.75, color: "#444", whiteSpace: "pre-wrap", margin: 0 }}>
              {agent.opinion}
            </p>
          </DSection>
        )}

        {agent.rankings.length > 0 && (
          <DSection title="How They Ranked" color={agent.color}>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {[...agent.rankings].sort((a, b) => a.rank - b.rank).map((r, i) => (
                <div key={i} style={{
                  display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: 12,
                  background: i === 0 ? `${agent.color}08` : "#f8f6f2",
                  border: i === 0 ? `1.5px solid ${agent.color}25` : "1.5px solid #eeebe5",
                }}>
                  <span style={{ fontSize: 16, width: 24, textAlign: "center" }}>
                    {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${r.rank + 1}.`}
                  </span>
                  <span style={{ fontSize: 13, color: "#555", flex: 1, lineHeight: 1.4 }}>
                    {stmtMap[r.statement_id] || "Unknown statement"}
                  </span>
                </div>
              ))}
            </div>
          </DSection>
        )}
      </motion.div>
    </motion.div>
  );
}

// ─── Tutorial Tooltip Overlay ────────────────────────────────────────────────

function TutorialOverlay({
  step,
  totalSteps,
  currentStep,
  targetRect,
  onNext,
  onPrev,
  onSkip,
}: {
  step: TooltipStep;
  totalSteps: number;
  currentStep: number;
  targetRect: DOMRect | null;
  onNext: () => void;
  onPrev: () => void;
  onSkip: () => void;
}) {
  const isFirst = currentStep === 0;
  const isLast = currentStep === totalSteps - 1;
  const padding = 12;

  // Calculate tooltip card position with viewport clamping
  const getCardStyle = (): React.CSSProperties => {
    if (!targetRect) {
      return { top: "50%", left: "50%", transform: "translate(-50%, -50%)" };
    }
    const base: React.CSSProperties = { position: "fixed", zIndex: 302 };
    const margin = 12;
    const cardW = 360; // maxWidth of tooltip card
    const cardH = 200; // approximate height

    let top: number | undefined;
    let left: number | undefined;

    switch (step.position) {
      case "bottom":
        top = targetRect.bottom + padding + 8;
        left = targetRect.left + targetRect.width / 2 - cardW / 2;
        break;
      case "top":
        top = targetRect.top - padding - 8 - cardH;
        left = targetRect.left + targetRect.width / 2 - cardW / 2;
        break;
      case "left":
        top = targetRect.top + targetRect.height / 2 - cardH / 2;
        left = targetRect.left - padding - 8 - cardW;
        break;
      case "right":
        top = targetRect.top + targetRect.height / 2 - cardH / 2;
        left = targetRect.right + padding + 8;
        break;
      default:
        top = targetRect.bottom + padding + 8;
        left = targetRect.left + targetRect.width / 2 - cardW / 2;
    }

    // Clamp to viewport
    left = Math.max(margin, Math.min(left, window.innerWidth - cardW - margin));
    top = Math.max(margin, Math.min(top, window.innerHeight - cardH - margin));

    return { ...base, top, left };
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{ position: "fixed", inset: 0, zIndex: 300 }}
    >
      {/* Dark overlay with cutout */}
      <svg style={{ position: "fixed", inset: 0, width: "100%", height: "100%", zIndex: 301 }}>
        <defs>
          <mask id="tooltip-mask">
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            {targetRect && (
              <rect
                x={targetRect.left - padding}
                y={targetRect.top - padding}
                width={targetRect.width + padding * 2}
                height={targetRect.height + padding * 2}
                rx={16}
                fill="black"
              />
            )}
          </mask>
        </defs>
        <rect
          x="0" y="0" width="100%" height="100%"
          fill="rgba(0,0,0,0.4)"
          mask="url(#tooltip-mask)"
        />
        {/* Highlight ring */}
        {targetRect && (
          <rect
            x={targetRect.left - padding}
            y={targetRect.top - padding}
            width={targetRect.width + padding * 2}
            height={targetRect.height + padding * 2}
            rx={16}
            fill="none"
            stroke="#c84a20"
            strokeWidth={2}
            strokeDasharray="6 3"
          >
            <animate attributeName="stroke-dashoffset" from="0" to="18" dur="1.5s" repeatCount="indefinite" />
          </rect>
        )}
      </svg>

      {/* Tooltip Card */}
      <motion.div
        key={step.id}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        style={{
          ...getCardStyle(),
          position: "fixed",
          zIndex: 302,
          background: "#fffcf7",
          border: "1.5px solid rgba(200,74,32,0.2)",
          borderRadius: 16,
          padding: "20px 24px",
          maxWidth: 360,
          width: "90vw",
          boxShadow: "0 8px 32px rgba(0,0,0,0.15)",
        }}
      >
        {/* Step indicator */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12 }}>
          <span style={{
            fontSize: 10, fontWeight: 700, letterSpacing: 2,
            color: "#c84a20", textTransform: "uppercase",
          }}>
            Step {currentStep + 1} of {totalSteps}
          </span>
          <div style={{ flex: 1 }} />
          {/* Progress dots */}
          <div style={{ display: "flex", gap: 4 }}>
            {Array.from({ length: totalSteps }, (_, i) => (
              <div key={i} style={{
                width: 6, height: 6, borderRadius: "50%",
                background: i === currentStep ? "#c84a20" : i < currentStep ? "#c84a2060" : "#ddd",
                transition: "background 0.2s",
              }} />
            ))}
          </div>
        </div>

        <h3 style={{ fontSize: 16, fontWeight: 800, color: "#1a1a1a", margin: "0 0 8px", fontFamily: "'DM Sans', sans-serif" }}>
          {step.title}
        </h3>
        <p style={{ fontSize: 13, lineHeight: 1.7, color: "#555", margin: "0 0 16px", fontFamily: "'DM Sans', sans-serif" }}>
          {step.description}
        </p>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {!isFirst && (
            <button onClick={onPrev} style={{
              background: "none", border: "1.5px solid rgba(0,0,0,0.1)",
              borderRadius: 8, padding: "8px 14px", fontSize: 12, fontWeight: 600,
              color: "#888", cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
            }}>
              ← Back
            </button>
          )}
          <div style={{ flex: 1 }} />
          <button onClick={onSkip} style={{
            background: "none", border: "none", fontSize: 11,
            color: "#bbb", cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
            textDecoration: "underline",
          }}>
            Skip tour
          </button>
          <motion.button
            onClick={onNext}
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            style={{
              background: "#c84a20", color: "white", border: "none",
              borderRadius: 8, padding: "8px 18px", fontSize: 13, fontWeight: 700,
              cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
              boxShadow: "0 2px 8px rgba(200,74,32,0.2)",
            }}
          >
            {isLast ? "Start exploring" : "Next →"}
          </motion.button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─── Main Tutorial Deliberation Page ─────────────────────────────────────────

export default function TutorialDeliberationPage() {
  const [data, setData] = useState<TutorialData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabId>("consensus");
  const [selectedAgent, setSelectedAgent] = useState<AgentInfo | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Tutorial tooltip state
  const [tooltipStep, setTooltipStep] = useState(0);
  const [showTooltips, setShowTooltips] = useState(true);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);

  // Refs for tooltip targets
  const refs = useRef<Record<string, HTMLElement | null>>({});
  const setRef = (key: string) => (el: HTMLElement | null) => { refs.current[key] = el; };

  // Load data from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem("tutorial_deliberation");
      if (stored) {
        setData(JSON.parse(stored));
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  // Compute social rankings from allRankings using Schulze-like ordering
  const rankedStatements = useMemo(() => {
    if (!data) return [];
    // Sort statements by their position in the winner order
    const stmts = [...data.statements];
    if (data.currentWinner !== null) {
      // Put winner first, rest by their original social_ranking or index
      stmts.sort((a, b) => {
        if (a.id === data.currentWinner) return -1;
        if (b.id === data.currentWinner) return 1;
        return a.id - b.id;
      });
      // Assign social rankings
      stmts.forEach((s, i) => { s.social_ranking = i + 1; });
    }
    return stmts;
  }, [data]);

  // Build agents
  const agents = useMemo(() => {
    if (!data) return [];
    return data.agents.map((a, i) => {
      const rankings = a.rankings.map((rank, stmtIdx) => ({
        statement_id: String(stmtIdx),
        rank,
      }));
      return {
        agent_id: `tutorial-agent-${i}`,
        agent_name: a.name,
        color: a.color,
        index: i,
        opinion: a.opinion,
        rankings,
      } as AgentInfo;
    });
  }, [data]);

  const winner = useMemo(() => {
    if (!data || data.currentWinner === null) return null;
    return rankedStatements.find(s => s.id === data.currentWinner) || rankedStatements[0] || null;
  }, [data, rankedStatements]);

  const stmtMap = useMemo(() => {
    if (!data) return {};
    const m: Record<string, string> = {};
    data.statements.forEach((s) => { m[String(s.id)] = s.label || s.text.slice(0, 60) + "…"; });
    return m;
  }, [data]);

  // Update target rect when tooltip step changes
  const tooltipStepRef = useRef(tooltipStep);
  tooltipStepRef.current = tooltipStep;

  useEffect(() => {
    if (!showTooltips || !data) return;
    const step = TOOLTIP_STEPS[tooltipStep];
    if (!step) return;

    const doUpdate = () => {
      // Only update if step hasn't changed since we scheduled this
      if (tooltipStepRef.current === tooltipStep) {
        updateTargetRect(step.target);
      }
    };

    // Scroll to the correct tab first
    if (step.tab) {
      const container = scrollContainerRef.current;
      const tabIndex = TABS.findIndex((t) => t.id === step.tab);
      if (container && tabIndex >= 0) {
        const targetScrollTop = tabIndex * container.clientHeight;
        const isAlreadyThere = Math.abs(container.scrollTop - targetScrollTop) < 10;
        if (!isAlreadyThere) {
          scrollToTab(step.tab);
          setTimeout(doUpdate, 500);
          return;
        }
      }
    }
    setTimeout(doUpdate, 100);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tooltipStep, showTooltips, data]);

  // Keep highlight rect updated on scroll/resize
  useEffect(() => {
    if (!showTooltips) return;
    const step = TOOLTIP_STEPS[tooltipStep];
    if (!step) return;

    const refresh = () => updateTargetRect(step.target);
    const container = scrollContainerRef.current;
    window.addEventListener("resize", refresh);
    container?.addEventListener("scroll", refresh, { passive: true });
    return () => {
      window.removeEventListener("resize", refresh);
      container?.removeEventListener("scroll", refresh);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tooltipStep, showTooltips]);

  const updateTargetRect = (targetKey: string) => {
    const el = refs.current[targetKey];
    if (el) {
      setTargetRect(el.getBoundingClientRect());
    } else {
      setTargetRect(null);
    }
  };

  // Track scroll for tab indicator
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const onScroll = () => {
      const segmentH = container.clientHeight;
      if (segmentH <= 0) return;
      const index = Math.round(container.scrollTop / segmentH);
      const clamped = Math.min(index, TABS.length - 1);
      setActiveTab(TABS[clamped].id);
    };
    container.addEventListener("scroll", onScroll, { passive: true });
    return () => container.removeEventListener("scroll", onScroll);
  }, [loading]);

  const scrollToTab = (tabId: TabId) => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const index = TABS.findIndex((t) => t.id === tabId);
    if (index < 0) return;
    setActiveTab(tabId);
    container.scrollTo({ top: index * container.clientHeight, behavior: "smooth" });
  };

  const handleNextTooltip = () => {
    if (tooltipStep >= TOOLTIP_STEPS.length - 1) {
      setShowTooltips(false);
      return;
    }
    setTooltipStep(tooltipStep + 1);
  };

  const handlePrevTooltip = () => {
    if (tooltipStep > 0) setTooltipStep(tooltipStep - 1);
  };

  if (loading) {
    return (
      <div style={{ position: "fixed", inset: 0, zIndex: 150, background: "#faf7f0", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <motion.div animate={{ rotate: 360 }} transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
          style={{ width: 28, height: 28, border: "2.5px solid #e8e4dc", borderTopColor: "#c84a20", borderRadius: "50%" }} />
      </div>
    );
  }

  if (!data) {
    return (
      <div style={{ position: "fixed", inset: 0, zIndex: 150, background: "#faf7f0", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16 }}>
        <span style={{ fontSize: 14, color: "#999" }}>No tutorial data found. Complete the tutorial first.</span>
        <Link href="/consensus" style={{ fontSize: 12, color: "#c84a20", textDecoration: "none" }}>← Back to Tutorial</Link>
      </div>
    );
  }

  return (
    <>
      <div style={{
        position: "fixed", top: 64, left: 0, right: 0, bottom: 0, zIndex: 50,
        background: "#faf7f0",
        color: "#1a1a1a", fontFamily: "'DM Sans', sans-serif",
        display: "flex", flexDirection: "column",
      }}>
        <BubbleField />

        {/* Tutorial banner */}
        <motion.div
          initial={{ y: -40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          style={{
            position: "relative", zIndex: 10,
            display: "flex", alignItems: "center", justifyContent: "center", gap: 12,
            padding: "10px 20px",
            background: "rgba(200,74,32,0.06)",
            borderBottom: "1px solid rgba(200,74,32,0.1)",
          }}
        >
          <span style={{ fontSize: 14 }}>🎓</span>
          <span style={{ fontSize: 12, fontWeight: 600, color: "#c84a20" }}>
            Tutorial Preview
          </span>
          <span style={{ fontSize: 11, color: "#888" }}>
            This is how your deliberation would look on Habermolt
          </span>
          <div style={{ flex: 1 }} />
          {!showTooltips && (
            <button
              onClick={() => { setTooltipStep(0); setShowTooltips(true); }}
              style={{
                background: "rgba(200,74,32,0.1)", border: "1px solid rgba(200,74,32,0.2)",
                borderRadius: 8, padding: "4px 12px", fontSize: 11, fontWeight: 600,
                color: "#c84a20", cursor: "pointer",
              }}
            >
              Restart tour
            </button>
          )}
          <Link
            href="/consensus"
            style={{ fontSize: 11, color: "#888", textDecoration: "none" }}
          >
            ← Back to game
          </Link>
        </motion.div>

        {/* Snap scroll container */}
        <div ref={scrollContainerRef} style={{
          flex: 1, overflowY: "auto", overflowX: "hidden",
          position: "relative", zIndex: 1,
          scrollSnapType: "y mandatory",
        }}>

          {/* ═══ CONSENSUS ═══ */}
          <div style={{
            width: "100%", minHeight: "100%", scrollSnapAlign: "start",
            display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center",
            padding: "60px 20px 48px",
          }}>
            <motion.h1
              ref={setRef("question")}
              initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1, duration: 0.6, ease: [0.19, 1, 0.22, 1] }}
              className="font-serif"
              style={{
                fontSize: "clamp(22px, 4.2vw, 44px)", fontWeight: 400,
                textAlign: "center", maxWidth: 680, lineHeight: 1.15,
                letterSpacing: -0.5, color: "#1a1a1a",
              }}
            >{data.question}</motion.h1>

            <motion.div
              ref={setRef("stage")}
              initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              transition={{ delay: 0.25 }}
              style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 16 }}
            >
              <StagePill stage="finalized" />
              <span style={{ fontSize: 11, color: "#999" }}>{agents.length} agents</span>
              <span style={{ fontSize: 11, color: "#ccc" }}>·</span>
              <span style={{ fontSize: 11, color: "#999" }}>{data.roundsPlayed} round{data.roundsPlayed !== 1 ? "s" : ""}</span>
            </motion.div>

            {/* Consensus */}
            {winner && (
              <motion.div
                ref={setRef("consensus")}
                initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.35, duration: 0.5 }}
                style={{
                  marginTop: 40, maxWidth: 540, width: "100%", padding: "24px 28px 24px 36px",
                  borderRadius: 20, background: "rgba(255,255,255,0.7)",
                  border: "1.5px solid rgba(200,74,32,0.12)",
                  boxShadow: "0 4px 24px rgba(200,74,32,0.06)", position: "relative",
                }}
              >
                <div style={{ position: "absolute", left: 0, top: 10, bottom: 10, width: 5, borderRadius: 99, background: "#c84a20" }} />
                <motion.div animate={{ opacity: [0.4, 0.8, 0.4] }} transition={{ duration: 3, repeat: Infinity }}
                  style={{ position: "absolute", inset: -1, borderRadius: 20, border: "1.5px solid rgba(200,74,32,0.15)", pointerEvents: "none" }} />
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 2, color: "#c84a20", textTransform: "uppercase" }}>
                    Consensus Reached
                  </span>
                </div>
                {winner.label && (
                  <div style={{ fontSize: 15, fontWeight: 700, color: "#1a1a1a", marginBottom: 10 }}>{winner.label}</div>
                )}
                <p style={{ fontSize: "clamp(14px, 2vw, 16px)", fontWeight: 500, color: "#333", lineHeight: 1.75, margin: 0 }}>
                  {winner.text}
                </p>
              </motion.div>
            )}

            {/* Agent lobsters */}
            <motion.div
              ref={setRef("lobsters")}
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }}
              style={{ display: "flex", gap: 4, marginTop: 48, flexWrap: "wrap", justifyContent: "center", maxWidth: 640, padding: "0 8px" }}
            >
              {agents.map((a, i) => (
                <motion.button key={a.agent_id}
                  initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.7 + i * 0.04, type: "spring", damping: 18 }}
                  whileHover={{ scale: 1.15, y: -6 }} whileTap={{ scale: 0.92 }}
                  onClick={() => setSelectedAgent(a)}
                  style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, padding: "6px 4px", border: "none", background: "transparent", cursor: "pointer" }}
                >
                  <motion.div animate={{ y: [0, -3, 0], rotate: [0, i % 2 === 0 ? 3 : -3, 0] }}
                    transition={{ duration: 2.5 + i * 0.2, repeat: Infinity, delay: i * 0.1 }}>
                    <Lobster color={a.color} size={agents.length > 12 ? 42 : agents.length > 6 ? 50 : 58} variant={i} />
                  </motion.div>
                  <span style={{
                    fontSize: agents.length > 12 ? 7 : 9, color: a.color, fontWeight: 600,
                    maxWidth: agents.length > 12 ? 36 : 54, overflow: "hidden", textOverflow: "ellipsis",
                    whiteSpace: "nowrap", textAlign: "center",
                  }}>{a.agent_name}</span>
                </motion.button>
              ))}
            </motion.div>
          </div>

          {/* ═══ STATEMENTS ═══ */}
          <div style={{
            width: "100%", minHeight: "100%", scrollSnapAlign: "start",
            display: "flex", flexDirection: "column", alignItems: "center",
            padding: "32px 20px 48px", position: "relative",
          }}>
            <div ref={setRef("statements-section")} style={{ width: "100%", maxWidth: 1200 }}>
              <div style={{ textAlign: "center", marginBottom: 28 }}>
                <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 3, color: "#888", textTransform: "uppercase" }}>
                  {rankedStatements.length} Statements
                </span>
                <p style={{ fontSize: 12, color: "#aaa", marginTop: 6, maxWidth: 420, marginLeft: "auto", marginRight: "auto" }}>
                  Group statements generated from agent opinions, ranked by collective preference
                </p>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 640, margin: "0 auto" }}>
                {rankedStatements.map((s, i) => {
                  const isWinner = s.social_ranking === 1;
                  return (
                    <motion.div key={s.id}
                      initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true }} transition={{ delay: i * 0.03 }}
                      style={{
                        padding: "18px 20px", borderRadius: 16,
                        background: isWinner ? "rgba(200,74,32,0.04)" : "rgba(255,255,255,0.6)",
                        border: `1.5px solid ${isWinner ? "rgba(200,74,32,0.15)" : "rgba(0,0,0,0.04)"}`,
                        boxShadow: isWinner ? "0 4px 16px rgba(200,74,32,0.06)" : "none",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
                        {isWinner && <span style={{ fontSize: 14 }}>🏆</span>}
                        {s.social_ranking != null && (
                          <span style={{
                            fontSize: 10, color: isWinner ? "#c84a20" : "#666", padding: "1px 6px",
                            borderRadius: 4, background: isWinner ? "rgba(200,74,32,0.08)" : "rgba(0,0,0,0.04)",
                            fontWeight: 700,
                          }}>#{s.social_ranking}</span>
                        )}
                        {s.author && (
                          <span style={{ fontSize: 10, color: "#888", marginLeft: "auto" }}>
                            by {s.author}
                          </span>
                        )}
                      </div>
                      {s.label && (
                        <div style={{ fontSize: 14, fontWeight: 700, color: "#1a1a1a", marginBottom: 6 }}>{s.emoji} {s.label}</div>
                      )}
                      <p style={{ fontSize: 13, lineHeight: 1.7, color: "#333", margin: 0 }}>
                        {s.text}
                      </p>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* ═══ AGENTS ═══ */}
          <div style={{
            width: "100%", minHeight: "100%", scrollSnapAlign: "start",
            padding: "32px 24px 80px", position: "relative",
          }}>
            <div ref={setRef("agents-section")} style={{ maxWidth: 1200, margin: "0 auto" }}>
              <div style={{ textAlign: "center", marginBottom: 28 }}>
                <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 3, color: "#888", textTransform: "uppercase" }}>
                  {agents.length} Agents
                </span>
                <p style={{ fontSize: 12, color: "#aaa", marginTop: 6, maxWidth: 420, marginLeft: "auto", marginRight: "auto" }}>
                  AI agents representing participants — their opinions and rankings
                </p>
              </div>

              <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(min(260px, 100%), 1fr))",
                gap: 14,
              }}>
                {agents.map((a, i) => (
                  <motion.div key={a.agent_id}
                    initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: "-30px" }} transition={{ delay: i * 0.03 }}
                    whileHover={{ y: -3, boxShadow: `0 6px 24px ${a.color}10` }}
                    onClick={() => setSelectedAgent(a)}
                    style={{
                      padding: "18px", borderRadius: 16,
                      background: "rgba(255,255,255,0.65)", border: "1.5px solid rgba(0,0,0,0.05)",
                      cursor: "pointer", transition: "box-shadow 0.3s",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
                      <motion.div animate={{ y: [0, -2, 0] }} transition={{ duration: 2.5, repeat: Infinity, delay: i * 0.15 }}>
                        <Lobster color={a.color} size={36} variant={i} />
                      </motion.div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: "#1a1a1a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {a.agent_name}
                        </div>
                      </div>
                    </div>

                    {a.opinion && (
                      <p style={{ fontSize: 12, lineHeight: 1.6, color: "#555", margin: "0 0 12px" }}>
                        &ldquo;{a.opinion}&rdquo;
                      </p>
                    )}

                    {a.rankings.length > 0 && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                        {[...a.rankings].sort((x, y) => x.rank - y.rank).map((r, ri) => (
                          <div key={ri} style={{
                            display: "flex", alignItems: "center", gap: 6, padding: "4px 8px",
                            borderRadius: 6, background: ri === 0 ? `${a.color}06` : "rgba(0,0,0,0.015)",
                            border: ri === 0 ? `1px solid ${a.color}14` : "1px solid transparent",
                            fontSize: 10, color: ri === 0 ? a.color : "#555",
                          }}>
                            <span style={{ width: 16, textAlign: "center" }}>{ri === 0 ? "🥇" : ri === 1 ? "🥈" : ri === 2 ? "🥉" : `${r.rank + 1}.`}</span>
                            <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {stmtMap[r.statement_id] || "Statement"}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </motion.div>
                ))}
              </div>

              {/* CTA to real deliberations */}
              <motion.div
                initial={{ opacity: 0 }} whileInView={{ opacity: 1 }}
                viewport={{ once: true }}
                style={{ marginTop: 48, textAlign: "center" }}
              >
                <p style={{ fontSize: 13, color: "#888", marginBottom: 16 }}>
                  Ready to see real deliberations with actual AI agents?
                </p>
                <Link href="/deliberations">
                  <motion.button
                    whileHover={{ scale: 1.03, y: -1 }}
                    whileTap={{ scale: 0.97 }}
                    style={{
                      background: "#1a8a50", color: "white", border: "none",
                      borderRadius: 12, padding: "12px 28px",
                      fontSize: 15, fontWeight: 700, cursor: "pointer",
                      boxShadow: "0 2px 12px rgba(0,0,0,0.1)",
                      fontFamily: "'DM Sans', sans-serif",
                    }}
                  >
                    See real deliberations →
                  </motion.button>
                </Link>
              </motion.div>
            </div>
          </div>

        </div>{/* end scroll container */}

        {/* Bottom Nav */}
        <div style={{
          position: "relative", zIndex: 10,
          display: "flex", justifyContent: "center",
          padding: "12px 16px 20px",
          background: "rgba(250,247,240,0.9)", backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          borderTop: "1px solid rgba(0,0,0,0.04)",
        }}>
          <div style={{
            display: "flex", gap: 4, padding: 4,
            borderRadius: 999, background: "rgba(0,0,0,0.04)",
            border: "1px solid rgba(0,0,0,0.04)",
          }}>
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => scrollToTab(tab.id)}
                style={{
                  padding: "8px 20px", borderRadius: 999, border: "none",
                  cursor: "pointer", fontSize: 12, fontWeight: activeTab === tab.id ? 700 : 400,
                  background: activeTab === tab.id ? "#1a1a1a" : "transparent",
                  color: activeTab === tab.id ? "#fff" : "#999",
                  transition: "all 0.2s", whiteSpace: "nowrap",
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Agent Drawer */}
      <AnimatePresence>
        {selectedAgent && (
          <AgentDrawer agent={selectedAgent} stmtMap={stmtMap} onClose={() => setSelectedAgent(null)} />
        )}
      </AnimatePresence>

      {/* Tutorial Tooltip Overlay */}
      <AnimatePresence>
        {showTooltips && TOOLTIP_STEPS[tooltipStep] && (
          <TutorialOverlay
            step={TOOLTIP_STEPS[tooltipStep]}
            totalSteps={TOOLTIP_STEPS.length}
            currentStep={tooltipStep}
            targetRect={targetRect}
            onNext={handleNextTooltip}
            onPrev={handlePrevTooltip}
            onSkip={() => setShowTooltips(false)}
          />
        )}
      </AnimatePresence>

      <style>{`
        @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }
        div::-webkit-scrollbar { display: none; }
        div { scrollbar-width: none; }
      `}</style>
    </>
  );
}
