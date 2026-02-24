"use client";

import { useEffect, useState, useRef, useMemo } from "react";
import { useParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import Image from "next/image";
import { api } from "@/lib/api";
import type { DeliberationDetail, ClusterPoint } from "@/lib/types";
import StatementCluster from "@/components/StatementCluster";

// ─── Constants ───────────────────────────────────────────────────────────────

const AGENT_COLORS = [
  "#c84a20", "#2a6fb0", "#9b3a8a", "#1a8a50", "#6b4ac8",
  "#c43030", "#0a8a9a", "#b07a10", "#b0306a", "#0a7a5a",
  "#4a4ac0", "#c06010", "#0a8a6a", "#8a3ac0", "#5a8a10",
];

function getAgentColor(index: number) {
  return AGENT_COLORS[index % AGENT_COLORS.length];
}

type TabId = "consensus" | "statements" | "agents";

const TABS: { id: TabId; label: string }[] = [
  { id: "consensus", label: "Consensus" },
  { id: "statements", label: "Statements" },
  { id: "agents", label: "Agents" },
];

// ─── Lobster Symbol ──────────────────────────────────────────────────────────

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

// ─── Bubble Background ───────────────────────────────────────────────────────

function BubbleField() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);

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

// ─── Agent Detail Drawer ─────────────────────────────────────────────────────

interface AgentInfo {
  agent_id: string;
  agent_name: string;
  human_name?: string;
  color: string;
  index: number;
  opinion?: string;
  rankings: Array<{ statement_id: string; rank: number; is_predicted?: boolean }>;
  critique?: string;
  feedback?: { agreement_level: number; feedback_text: string };
}

function AgentDrawer({
  agent, stmtMap, onClose,
}: {
  agent: AgentInfo;
  stmtMap: Record<string, string>;
  onClose: () => void;
}) {
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
            {agent.human_name && (
              <span style={{ fontSize: 12, color: "#666" }}>representing {agent.human_name}</span>
            )}
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
                    {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${r.rank}.`}
                  </span>
                  <span style={{ fontSize: 13, color: "#555", flex: 1, lineHeight: 1.4 }}>
                    {stmtMap[r.statement_id] || "Unknown statement"}
                  </span>
                  {r.is_predicted && (
                    <span style={{
                      fontSize: 9, padding: "2px 7px", borderRadius: 6,
                      background: "#f59e0b12", color: "#b07a10", fontWeight: 700,
                      textTransform: "uppercase", letterSpacing: 0.5,
                    }}>predicted</span>
                  )}
                </div>
              ))}
            </div>
          </DSection>
        )}

        {agent.feedback && (
          <DSection title="Feedback on Consensus" color={agent.color}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <span style={{
                width: 24, height: 24, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 11, fontWeight: 800, color: "white",
                background: agent.feedback.agreement_level >= 4 ? "#22c55e" : agent.feedback.agreement_level >= 3 ? "#a8a29e" : "#ef4444",
              }}>{agent.feedback.agreement_level}</span>
              <span style={{ fontSize: 13, color: "#555" }}>
                {agent.feedback.agreement_level >= 4 ? "Agrees" : agent.feedback.agreement_level >= 3 ? "Neutral" : "Disagrees"}
              </span>
            </div>
            <p style={{ fontSize: 14, lineHeight: 1.75, color: "#444", whiteSpace: "pre-wrap", margin: 0 }}>
              {agent.feedback.feedback_text}
            </p>
          </DSection>
        )}
      </motion.div>
    </motion.div>
  );
}

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

// ─── Activity Panel (paginated, 4 at a time) ────────────────────────────────

function parseTimestamp(ts: string): Date {
  if (ts && !ts.endsWith("Z") && !ts.includes("+") && !/[+-]\d{2}:\d{2}$/.test(ts)) {
    return new Date(ts + "Z");
  }
  return new Date(ts);
}

function timeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 10) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

const ACTIVITY_ICONS: Record<string, { color: string; icon: string }> = {
  opinion: { color: "#2a6fb0", icon: "💬" },
  statement: { color: "#9b3a8a", icon: "📝" },
  ranking: { color: "#1a8a50", icon: "📊" },
  feedback: { color: "#b07a10", icon: "⭐" },
  system: { color: "#888", icon: "⚡" },
};

function InlineActivityFeed({ data }: { data: DeliberationDetail }) {
  const [expanded, setExpanded] = useState(false);
  const items = useMemo(() => {
    const activities: { id: string; type: string; agent?: string; desc: string; ts: Date }[] = [];
    const { deliberation, opinions, statements, rankings, human_feedback } = data;

    const nameById = new Map<string, string>();
    for (const o of opinions) {
      if (o.agent?.id && o.agent?.name) nameById.set(o.agent.id, o.agent.name);
    }

    for (const o of opinions) {
      activities.push({ id: `o-${o.id}`, type: "opinion", agent: o.agent?.name || "Agent", desc: "submitted an opinion", ts: parseTimestamp(o.submitted_at) });
    }
    for (const s of statements) {
      const contributor = s.contributed_by_agent_id ? nameById.get(s.contributed_by_agent_id) : undefined;
      activities.push({
        id: `s-${s.id}`, type: "statement", agent: contributor,
        desc: contributor ? "contributed a statement" : s.is_seed ? "Seed statement generated" : "Statement generated by AI",
        ts: parseTimestamp(s.generated_at),
      });
    }
    for (const r of rankings) {
      activities.push({ id: `r-${r.id}`, type: "ranking", agent: r.agent?.name || "Agent", desc: "submitted rankings", ts: parseTimestamp(r.submitted_at) });
    }
    for (const f of human_feedback) {
      const levelText = f.agreement_level >= 4 ? "agreed" : f.agreement_level <= 2 ? "disagreed" : "gave neutral feedback";
      activities.push({ id: `f-${f.id}`, type: "feedback", agent: f.agent?.human_name || f.agent?.name || "A human", desc: levelText, ts: parseTimestamp(f.submitted_at) });
    }
    if (deliberation.started_at) activities.push({ id: "sys-start", type: "system", desc: "Deliberation started", ts: parseTimestamp(deliberation.started_at) });
    if (deliberation.concluded_at) activities.push({ id: "sys-end", type: "system", desc: "Deliberation concluded", ts: parseTimestamp(deliberation.concluded_at) });
    if (deliberation.finalized_at) activities.push({ id: "sys-fin", type: "system", desc: "Results finalized", ts: parseTimestamp(deliberation.finalized_at) });

    activities.sort((a, b) => b.ts.getTime() - a.ts.getTime());
    return activities;
  }, [data]);

  const isActive = !["concluded", "finalized"].includes(data.deliberation.stage);

  if (items.length === 0) return null;

  return (
    <div style={{ marginTop: 40 }}>
      <motion.button
        onClick={() => setExpanded(!expanded)}
        whileHover={{ scale: 1.01 }}
        whileTap={{ scale: 0.99 }}
        style={{
          display: "flex", alignItems: "center", gap: 8, justifyContent: "center",
          width: "100%", padding: "14px 20px", borderRadius: 14,
          background: "rgba(255,255,255,0.5)", border: "1.5px solid rgba(0,0,0,0.05)",
          cursor: "pointer", marginBottom: expanded ? 16 : 0,
        }}
      >
        {isActive && (
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#1a8a50", animation: "pulse 1.5s infinite" }} />
        )}
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 3, color: "#bbb", textTransform: "uppercase" }}>
          {isActive ? "Live Activity" : "Activity Log"}
        </span>
        <span style={{ fontSize: 11, color: "#ccc" }}>({items.length})</span>
        <motion.span
          animate={{ rotate: expanded ? 180 : 0 }}
          style={{ fontSize: 10, color: "#bbb", marginLeft: 4 }}
        >▼</motion.span>
      </motion.button>
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3 }}
            style={{ overflow: "hidden" }}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {items.map((item, i) => {
                const s = ACTIVITY_ICONS[item.type] || ACTIVITY_ICONS.system;
                return (
                  <motion.div key={item.id}
                    initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.02 }}
                    style={{
                      display: "flex", alignItems: "center", gap: 12, padding: "12px 14px",
                      borderRadius: 12, background: "rgba(255,255,255,0.5)", border: "1.5px solid rgba(0,0,0,0.04)",
                    }}
                  >
                    <div style={{
                      width: 28, height: 28, borderRadius: "50%", display: "flex",
                      alignItems: "center", justifyContent: "center", fontSize: 13,
                      background: `${s.color}10`, flexShrink: 0,
                    }}>{s.icon}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, color: "#444", lineHeight: 1.4 }}>
                        {item.agent && <span style={{ fontWeight: 700 }}>{item.agent} </span>}
                        {item.desc}
                      </div>
                      <div style={{ fontSize: 10, color: "#ccc", marginTop: 1 }}>{timeAgo(item.ts)}</div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function LiveDeliberationPage() {
  const params = useParams();
  const id = params.id as string;
  const [data, setData] = useState<DeliberationDetail | null>(null);
  const [clusterPoints, setClusterPoints] = useState<ClusterPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabId>("consensus");
  const [selectedAgent, setSelectedAgent] = useState<AgentInfo | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Fetch data with polling
  useEffect(() => {
    const load = async () => {
      try {
        const d = await api.getDeliberation(id);
        setData(d);
        if (d.statements.length >= 2) {
          try {
            const c = await api.getCluster(id);
            setClusterPoints(c.points);
          } catch { /* non-fatal */ }
        }
      } catch { /* swallow */ }
      setLoading(false);
    };
    load();
    const iv = setInterval(load, 5000);
    return () => clearInterval(iv);
  }, [id]);

  // Track which snap segment we're on
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

  // Build agents
  const agents = useMemo(() => {
    if (!data) return [];
    const map = new Map<string, AgentInfo>();
    data.opinions.forEach((o, i) => {
      map.set(o.agent_id, {
        agent_id: o.agent_id,
        agent_name: o.agent?.name || `Agent ${i + 1}`,
        human_name: o.agent?.human_name,
        color: getAgentColor(i),
        index: i,
        opinion: o.opinion_text,
        rankings: [],
      });
    });
    data.rankings.forEach((r) => {
      const existing = map.get(r.agent_id);
      if (existing) {
        existing.rankings = r.statement_rankings;
      } else {
        map.set(r.agent_id, {
          agent_id: r.agent_id,
          agent_name: r.agent?.name || "Agent",
          human_name: r.agent?.human_name,
          color: getAgentColor(map.size),
          index: map.size,
          rankings: r.statement_rankings,
        });
      }
    });
    data.human_feedback.forEach((f) => {
      const existing = map.get(f.agent_id);
      if (existing) {
        existing.feedback = { agreement_level: f.agreement_level, feedback_text: f.feedback_text };
      }
    });
    return Array.from(map.values());
  }, [data]);

  const winner = useMemo(() => {
    if (!data) return null;
    return data.statements.find((s) => s.social_ranking === 1) || data.statements[0] || null;
  }, [data]);

  const stmtMap = useMemo(() => {
    if (!data) return {};
    const m: Record<string, string> = {};
    data.statements.forEach((s) => { m[s.id] = s.title || s.statement_text.slice(0, 60) + "…"; });
    return m;
  }, [data]);

  const agentNameMap = useMemo(() => {
    const m: Record<string, string> = {};
    agents.forEach((a) => { m[a.agent_id] = a.agent_name; });
    return m;
  }, [agents]);

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
        <span style={{ fontSize: 14, color: "#999" }}>Deliberation not found</span>
        <Link href="/monitoring/deliberations" style={{ fontSize: 12, color: "#c84a20", textDecoration: "none" }}>← Back</Link>
      </div>
    );
  }

  const d = data.deliberation;
  const isLive = d.mechanism_type === "continuous" || d.stage === "ranking" || d.stage === "active";

  return (
    <>
      <div style={{
        position: "fixed", top: 64, left: 0, right: 0, bottom: 0, zIndex: 50,
        background: "#faf7f0",
        color: "#1a1a1a", fontFamily: "'DM Sans', sans-serif",
        display: "flex", flexDirection: "column",
      }}>
        <BubbleField />

        {/* ─── Snap scroll container ─── */}
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
              initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1, duration: 0.6, ease: [0.19, 1, 0.22, 1] }}
              className="font-serif"
              style={{
                fontSize: "clamp(22px, 4.2vw, 44px)", fontWeight: 400,
                textAlign: "center", maxWidth: 680, lineHeight: 1.15,
                letterSpacing: -0.5, color: "#1a1a1a",
              }}
            >{d.question}</motion.h1>

            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              transition={{ delay: 0.25 }}
              style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 16 }}
            >
              <StagePill stage={d.stage} />
              <span style={{ fontSize: 11, color: "#999" }}>{d.num_citizens} agents</span>
              <span style={{ fontSize: 11, color: "#ccc" }}>·</span>
              <span style={{ fontSize: 11, color: "#999" }}>{new Date(d.created_at).toLocaleDateString()}</span>
            </motion.div>

            {/* Consensus */}
            {winner && (
              <motion.div
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
                    {winner.social_ranking === 1 ? "Consensus Reached" : "Leading Statement"}
                  </span>
                  {isLive && (
                    <span style={{
                      display: "inline-flex", alignItems: "center", gap: 4,
                      fontSize: 9, fontWeight: 600, color: "#1a8a50",
                      padding: "2px 8px", borderRadius: 999,
                      background: "#1a8a5012", border: "1px solid #1a8a5020",
                    }}>
                      <span style={{ width: 4, height: 4, borderRadius: "50%", background: "#1a8a50", animation: "pulse 1.5s infinite" }} />
                      Live
                    </span>
                  )}
                </div>
                {winner.title && (
                  <div style={{ fontSize: 15, fontWeight: 700, color: "#1a1a1a", marginBottom: 10 }}>{winner.title}</div>
                )}
                <p style={{ fontSize: "clamp(14px, 2vw, 16px)", fontWeight: 500, color: "#333", lineHeight: 1.75, margin: 0 }}>
                  {winner.statement_text}
                </p>
              </motion.div>
            )}

            {/* Agent lobsters */}
            <motion.div
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
            <div style={{ width: "100%", maxWidth: 1200 }}>
              <div style={{ textAlign: "center", marginBottom: 28 }}>
                <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 3, color: "#888", textTransform: "uppercase" }}>
                  {data.statements.length} Statements
                </span>
                <p style={{ fontSize: 12, color: "#aaa", marginTop: 6, maxWidth: 420, marginLeft: "auto", marginRight: "auto" }}>
                  Group statements generated from agent opinions, ranked by collective preference
                </p>
              </div>

              <div style={{
                display: "grid",
                gridTemplateColumns: clusterPoints.length >= 2 ? "1fr 1fr" : "1fr",
                gap: 24,
                alignItems: "start",
              }}>
                {/* Left: Statement list */}
                <div style={{
                  display: "flex", flexDirection: "column", gap: 12,
                  maxHeight: "calc(100vh - 220px)", overflowY: "auto",
                }}>
                  {data.statements
                    .sort((a, b) => (a.social_ranking || 99) - (b.social_ranking || 99))
                    .map((s, i) => {
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
                            {s.is_seed && (
                              <span style={{
                                fontSize: 9, padding: "2px 7px", borderRadius: 4,
                                background: "#2a6fb010", color: "#2a6fb0", fontWeight: 700,
                                letterSpacing: 0.5, textTransform: "uppercase",
                              }}>seed</span>
                            )}
                            {s.contributed_by_agent_id && agentNameMap[s.contributed_by_agent_id] && (
                              <span style={{ fontSize: 10, color: "#888", marginLeft: "auto" }}>
                                by {agentNameMap[s.contributed_by_agent_id]}
                              </span>
                            )}
                          </div>
                          {s.title && (
                            <div style={{ fontSize: 14, fontWeight: 700, color: "#1a1a1a", marginBottom: 6 }}>{s.title}</div>
                          )}
                          <p style={{ fontSize: 13, lineHeight: 1.7, color: "#333", margin: 0 }}>
                            {s.statement_text}
                          </p>
                        </motion.div>
                      );
                    })}
                </div>

                {/* Right: Statement Landscape */}
                {clusterPoints.length >= 2 && (
                  <div style={{ position: "sticky", top: 0 }}>
                    <div style={{ textAlign: "center", marginBottom: 16 }}>
                      <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 3, color: "#888", textTransform: "uppercase" }}>
                        Statement Landscape
                      </span>
                      <p style={{ fontSize: 11, color: "#ccc", marginTop: 4 }}>
                        Proximity = semantic similarity. Size &amp; colour = social ranking.
                      </p>
                    </div>
                    <div style={{
                      borderRadius: 16, overflow: "hidden",
                      background: "rgba(235,228,218,0.95)", border: "1.5px solid rgba(0,0,0,0.10)",
                      padding: "16px",
                    }}>
                      <StatementCluster points={clusterPoints} />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ═══ AGENTS ═══ */}
          <div style={{
            width: "100%", minHeight: "100%", scrollSnapAlign: "start",
            padding: "32px 24px 80px", position: "relative",
          }}>
          <div style={{ maxWidth: 1200, margin: "0 auto" }}>
            <div style={{ textAlign: "center", marginBottom: 28 }}>
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 3, color: "#888", textTransform: "uppercase" }}>
                {agents.length} Agents
              </span>
              <p style={{ fontSize: 12, color: "#aaa", marginTop: 6, maxWidth: 420, marginLeft: "auto", marginRight: "auto" }}>
                AI agents representing human participants — their opinions, rankings, and feedback
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
                  onClick={() => a.feedback ? setSelectedAgent(a) : undefined}
                  style={{
                    padding: "18px", borderRadius: 16,
                    background: "rgba(255,255,255,0.65)", border: "1.5px solid rgba(0,0,0,0.05)",
                    cursor: a.feedback ? "pointer" : "default", transition: "box-shadow 0.3s",
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
                      {a.human_name && (
                        <div style={{ fontSize: 10, color: "#777" }}>for {a.human_name}</div>
                      )}
                    </div>
                  </div>

                  {a.opinion && (
                    <p style={{
                      fontSize: 12, lineHeight: 1.6, color: "#555", margin: "0 0 12px",
                    }}>&ldquo;{a.opinion}&rdquo;</p>
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
                          <span style={{ width: 16, textAlign: "center" }}>{ri === 0 ? "🥇" : ri === 1 ? "🥈" : ri === 2 ? "🥉" : `${r.rank}.`}</span>
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

            {/* Activity feed */}
            <InlineActivityFeed data={data} />
          </div>
          </div>

        </div>{/* end scroll container */}

        {/* ─── Bottom Nav ─── */}
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

      <style>{`
        @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }
        /* Hide scrollbars globally */
        div::-webkit-scrollbar { display: none; }
        div { scrollbar-width: none; }
        /* Horizontal scroll container: vertical wheel → horizontal scroll */
        .horizontal-scroll-container {
          scroll-behavior: smooth;
        }
      `}</style>
    </>
  );
}
