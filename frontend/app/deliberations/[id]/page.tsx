"use client";

import { useEffect, useState, useRef, useMemo, useCallback } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import Image from "next/image";
import { api } from "@/lib/api";
import { useSession, signIn } from "@/lib/auth-client";
import type { DeliberationDetail, ClusterPoint, OpinionClusterPoint, OpinionClusterInfo } from "@/lib/types";
import StatementCluster from "@/components/StatementCluster";
import RankingRidgeline from "@/components/RankingRidgeline";
import OpinionLandscape from "@/components/OpinionLandscape";
import ClusterBar from "@/components/ClusterBar";
import ShareButton from "@/components/ShareSection";
import DeliberationChatBubble, { type DeliberationChatBubbleHandle } from "@/components/DeliberationChatBubble";
import ReactMarkdown from "react-markdown";

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

// ─── Seed Opinions ──────────────────────────────────────────────────────────

function SeedOpinions({ opinions }: { opinions: string[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ marginTop: 10 }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          background: "none", border: "none", cursor: "pointer", padding: 0,
          fontSize: 10, color: "#2a6fb0", fontWeight: 600, display: "flex",
          alignItems: "center", gap: 4,
        }}
      >
        <span style={{ transform: open ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.15s", display: "inline-block" }}>▶</span>
        Perspectives that informed this
      </button>
      {open && (
        <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
          {opinions.map((o, i) => (
            <div key={i} style={{
              fontSize: 11, lineHeight: 1.6, color: "#555", padding: "6px 10px",
              borderLeft: "2px solid #2a6fb030", background: "#2a6fb006", borderRadius: 4,
            }}>
              {o}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

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
    active: "#1a8a50",
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
}

function AgentDrawer({
  agent, stmtMap, contributedIds, onClose,
}: {
  agent: AgentInfo;
  stmtMap: Record<string, string>;
  contributedIds: Set<string>;
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
            <div style={{ fontSize: 14, lineHeight: 1.75, color: "#444" }} className="prose-compact">
              <ReactMarkdown>{agent.opinion}</ReactMarkdown>
            </div>
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
                  {contributedIds.has(r.statement_id) && (
                    <span style={{
                      fontSize: 9, padding: "2px 7px", borderRadius: 6,
                      background: `${agent.color}12`, color: agent.color, fontWeight: 700,
                      textTransform: "uppercase", letterSpacing: 0.5,
                    }}>authored</span>
                  )}
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
    const { deliberation, opinions, statements, rankings } = data;

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
    if (deliberation.created_at) activities.push({ id: "sys-start", type: "system", desc: "Deliberation created", ts: parseTimestamp(deliberation.created_at) });

    activities.sort((a, b) => b.ts.getTime() - a.ts.getTime());
    return activities;
  }, [data]);

  const isActive = true;

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

// ─── Consensus Rating Widget ────────────────────────────────────────────────

interface ConsensusRatingData {
  id: string;
  deliberation_id: string;
  statement_id: string | null;
  representativeness: number;
  specificity: number;
  usefulness: number;
  feedback: string | null;
  submitted_at: string;
}

function StarRow({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  value: number;
  onChange: (v: number) => void;
}) {
  const [hover, setHover] = useState(0);
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "#333" }}>{label}</div>
        <div style={{ fontSize: 11, color: "#999" }}>{hint}</div>
      </div>
      <div style={{ display: "flex", gap: 2, flexShrink: 0 }}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            onMouseEnter={() => setHover(n)}
            onMouseLeave={() => setHover(0)}
            style={{
              fontSize: 18, background: "none", border: "none", cursor: "pointer",
              color: n <= (hover || value) ? "#c84a20" : "#ddd",
              transition: "color 0.15s, transform 0.1s",
              transform: n <= (hover || value) ? "scale(1.1)" : "scale(1)",
              padding: 0,
            }}
          >★</button>
        ))}
      </div>
    </div>
  );
}

function ThumbButton({
  direction,
  active,
  onClick,
}: {
  direction: "up" | "down";
  active: boolean;
  onClick: () => void;
}) {
  const isUp = direction === "up";
  return (
    <motion.button
      whileHover={{ scale: 1.15 }}
      whileTap={{ scale: 0.9 }}
      onClick={onClick}
      style={{
        width: 28, height: 28, borderRadius: 8,
        border: active ? "1.5px solid rgba(200,74,32,0.3)" : "1.5px solid rgba(0,0,0,0.08)",
        background: active ? "rgba(200,74,32,0.08)" : "rgba(255,255,255,0.6)",
        cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
        transition: "all 0.2s",
      }}
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
        stroke={active ? "#c84a20" : "#aaa"} strokeWidth="2"
        strokeLinecap="round" strokeLinejoin="round"
        style={{ transform: isUp ? "none" : "rotate(180deg)" }}
      >
        <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14z" />
        <path d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" />
      </svg>
    </motion.button>
  );
}

function ConsensusRatingWidget({
  deliberationId,
  winnerId,
}: {
  deliberationId: string;
  winnerId: string | null;
}) {
  const { data: session } = useSession();
  const router = useRouter();

  const [existing, setExisting] = useState<ConsensusRatingData | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [thumbVote, setThumbVote] = useState<"up" | "down" | null>(null);

  const [representativeness, setRepresentativeness] = useState(0);
  const [specificity, setSpecificity] = useState(0);
  const [usefulness, setUsefulness] = useState(0);
  const [feedback, setFeedback] = useState("");

  const consensusChanged = existing?.statement_id != null
    && winnerId != null
    && existing.statement_id !== winnerId;

  // Derive thumb state from existing rating
  const existingThumb = existing
    ? ((existing.representativeness + existing.specificity + existing.usefulness) / 3 >= 3 ? "up" : "down")
    : null;

  // Fetch existing rating
  useEffect(() => {
    if (!session?.user?.id) return;
    fetch(`/api/backend/agents/me/consensus-rating/${deliberationId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data && data.id) {
          setExisting(data);
          setRepresentativeness(data.representativeness);
          setSpecificity(data.specificity);
          setUsefulness(data.usefulness);
          setFeedback(data.feedback || "");
        }
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, [session, deliberationId]);

  const handleSubmit = useCallback(async () => {
    if (!session?.user?.id) {
      router.push("/sign-in");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/backend/agents/me/rate-consensus", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deliberation_id: deliberationId,
          representativeness,
          specificity,
          usefulness,
          feedback: feedback || null,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setExisting(data);
        setExpanded(false);
      }
    } catch {} finally {
      setSaving(false);
    }
  }, [session, deliberationId, representativeness, specificity, usefulness, feedback, router]);

  const handleThumb = (direction: "up" | "down") => {
    if (!session?.user?.id) {
      router.push("/sign-in");
      return;
    }
    setThumbVote(direction);
    // Pre-fill stars based on thumb direction
    if (!existing) {
      const preset = direction === "up" ? 4 : 2;
      setRepresentativeness(preset);
      setSpecificity(preset);
      setUsefulness(preset);
    }
    setExpanded(true);
  };

  if (!loaded && session?.user?.id) return null;

  const activeThumb = expanded ? thumbVote : existingThumb;

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }}
      transition={{ delay: 0.5 }}
    >
      {consensusChanged && (
        <div style={{
          padding: "8px 12px", borderRadius: 10, marginBottom: 8,
          background: "#fef3c7", border: "1px solid #f59e0b30",
          fontSize: 11, color: "#92400e", lineHeight: 1.4,
        }}>
          The consensus has changed since you last rated — consider re-rating.
        </div>
      )}

      {/* Thumbs — pinned to bottom-right of parent card */}
      {!expanded && (
        <div style={{
          position: "absolute", bottom: 14, right: 16,
          display: "flex", alignItems: "center", gap: 5,
        }}>
          {existing && !consensusChanged && (
            <span style={{ fontSize: 11, color: "#999" }}>rated</span>
          )}
          <ThumbButton direction="up" active={activeThumb === "up"} onClick={() => handleThumb("up")} />
          <ThumbButton direction="down" active={activeThumb === "down"} onClick={() => handleThumb("down")} />
        </div>
      )}

      {/* Expanded detail form */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
            style={{ overflow: "hidden" }}
          >
            <div style={{
              padding: "20px 24px", borderRadius: 20, marginTop: 8,
              background: "rgba(255,255,255,0.85)", border: "1.5px solid rgba(200,74,32,0.1)",
              boxShadow: "0 4px 20px rgba(0,0,0,0.04)",
            }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 2, color: "#c84a20", textTransform: "uppercase" }}>
                  Tell us more
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <ThumbButton direction="up" active={thumbVote === "up"} onClick={() => {
                    setThumbVote("up");
                    if (!existing) { setRepresentativeness(4); setSpecificity(4); setUsefulness(4); }
                  }} />
                  <ThumbButton direction="down" active={thumbVote === "down"} onClick={() => {
                    setThumbVote("down");
                    if (!existing) { setRepresentativeness(2); setSpecificity(2); setUsefulness(2); }
                  }} />
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <StarRow
                  label="Representativeness"
                  hint="Does it fairly reflect the group's views?"
                  value={representativeness}
                  onChange={setRepresentativeness}
                />
                <StarRow
                  label="Specificity"
                  hint="Is it concrete and actionable, not vague?"
                  value={specificity}
                  onChange={setSpecificity}
                />
                <StarRow
                  label="Usefulness"
                  hint="Would you act on this or share it?"
                  value={usefulness}
                  onChange={setUsefulness}
                />
              </div>
              <textarea
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                placeholder="Optional: What would make this consensus better?"
                rows={2}
                style={{
                  width: "100%", marginTop: 14, padding: "10px 14px", borderRadius: 12,
                  border: "1.5px solid rgba(0,0,0,0.06)", background: "rgba(0,0,0,0.02)",
                  fontSize: 13, color: "#333", resize: "vertical", fontFamily: "inherit",
                }}
              />
              <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                <button
                  onClick={() => setExpanded(false)}
                  style={{
                    flex: 1, padding: "10px 16px", borderRadius: 12, border: "1.5px solid rgba(0,0,0,0.06)",
                    background: "transparent", cursor: "pointer", fontSize: 13, color: "#888",
                  }}
                >Cancel</button>
                <button
                  onClick={handleSubmit}
                  disabled={representativeness === 0 || specificity === 0 || usefulness === 0 || saving}
                  style={{
                    flex: 2, padding: "10px 16px", borderRadius: 12, border: "none",
                    background: (representativeness === 0 || specificity === 0 || usefulness === 0) ? "#ddd" : "#c84a20",
                    color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 600,
                    opacity: saving ? 0.6 : 1,
                  }}
                >{saving ? "Saving..." : existing ? "Update" : "Submit"}</button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function LiveDeliberationPage() {
  const params = useParams();
  const id = params.id as string;
  const router = useRouter();
  const searchParams = useSearchParams();
  const joinedParam = searchParams.get("joined");
  const createdParam = searchParams.get("created");
  const inviteCodeParam = searchParams.get("invite_code");
  const [showInviteBanner, setShowInviteBanner] = useState(false);
  const [inviteUrl, setInviteUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const [data, setData] = useState<DeliberationDetail | null>(null);
  const [clusterPoints, setClusterPoints] = useState<ClusterPoint[]>([]);
  const [opinionClusterPoints, setOpinionClusterPoints] = useState<OpinionClusterPoint[]>([]);
  const [opinionClusters, setOpinionClusters] = useState<OpinionClusterInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabId>("consensus");
  const [selectedAgent, setSelectedAgent] = useState<AgentInfo | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef<Record<TabId, HTMLDivElement | null>>({ consensus: null, statements: null, agents: null });
  const rightColRef = useRef<HTMLDivElement>(null);
  const [rightColHeight, setRightColHeight] = useState<number>(0);

  // Sync left column height to right column
  useEffect(() => {
    const el = rightColRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setRightColHeight(entry.contentRect.height));
    ro.observe(el);
    return () => ro.disconnect();
  }, [clusterPoints, data]);

  // Join deliberation state
  const { data: session } = useSession();
  const [agentType, setAgentType] = useState<"loading" | "none" | "hosted" | "openclaw">("loading");
  const [userAgentId, setUserAgentId] = useState<string | null>(null);
  const [interviewCompleted, setInterviewCompleted] = useState(false);
  const [hasProfile, setHasProfile] = useState(true);
  const [showSetupPrompt, setShowSetupPrompt] = useState(false);
  const chatBubbleRef = useRef<DeliberationChatBubbleHandle>(null);

  // Check if user has a haberagent
  useEffect(() => {
    if (!session?.user) {
      setAgentType("none");
      return;
    }
    Promise.all([
      fetch("/api/backend/hosted-agents/me").then(async (res) => {
        if (res.status === 404) return null;
        if (!res.ok) return null;
        return res.json();
      }),
      fetch("/api/backend/agents/me").then((res) => res.json()).then((d) => !!d.agent).catch(() => false),
    ]).then(([hosted, openclaw]) => {
      if (hosted) {
        setAgentType("hosted");
        if (hosted.agent_id) setUserAgentId(hosted.agent_id);
        setHasProfile(!!hosted.onboarded);
      } else if (openclaw) {
        setAgentType("openclaw");
      } else {
        setAgentType("none");
      }
    }).catch(() => setAgentType("none"));
  }, [session]);

  // Check if user's agent is already participating
  const alreadyParticipating = useMemo(() => {
    if (!data || !userAgentId) return false;
    return data.opinions.some((o) => o.agent_id === userAgentId);
  }, [data, userAgentId]);

  // Trigger join via the chat bubble
  const handleJoinDeliberation = useCallback(() => {
    chatBubbleRef.current?.triggerJoin();
  }, []);

  // Auto-open chat bubble when redirected from invite page (?joined=true) or create page (?created=true)
  useEffect(() => {
    const shouldTrigger = (joinedParam === "true" || createdParam === "true") && data && !loading && agentType === "hosted" && !alreadyParticipating;
    if (shouldTrigger) {
      chatBubbleRef.current?.triggerJoin();
    }
    // Show invite banner for private deliberations created by user
    if (createdParam === "true" && inviteCodeParam) {
      setInviteUrl(`${window.location.origin}/invite/${inviteCodeParam}`);
      setShowInviteBanner(true);
    }
    // Clear params to avoid re-triggering on refresh
    if (joinedParam === "true" || createdParam === "true") {
      router.replace(`/deliberations/${id}`, { scroll: false });
    }
  }, [joinedParam, createdParam, inviteCodeParam, data, loading, agentType, alreadyParticipating, id, router]);

  // Track opinion/statement counts to know when to refresh clusters
  const prevCountsRef = useRef({ opinions: 0, statements: 0 });

  // Fetch data with polling (lightweight — just deliberation data)
  useEffect(() => {
    const load = async () => {
      try {
        const d = await api.getDeliberation(id);
        setData(d);

        const prev = prevCountsRef.current;
        const stmtChanged = d.statements.length !== prev.statements && d.statements.length >= 2;
        const opnChanged = d.opinions.length !== prev.opinions && d.opinions.length >= 2;

        // Only fetch clusters when counts change (or on first load)
        if (stmtChanged || prev.statements === 0) {
          api.getCluster(id).then(c => setClusterPoints(c.points)).catch(() => {});
        }
        if (opnChanged || prev.opinions === 0) {
          api.getOpinionCluster(id).then(oc => {
            setOpinionClusterPoints(oc.points);
            setOpinionClusters(oc.clusters);
          }).catch(() => {});
        }

        prevCountsRef.current = { opinions: d.opinions.length, statements: d.statements.length };
      } catch { /* swallow */ }
      setLoading(false);
    };
    load();
    const iv = setInterval(load, 10000);
    return () => clearInterval(iv);
  }, [id]);

  // Track which snap segment we're on via IntersectionObserver
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const sections = sectionRefs.current;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
            const tabId = entry.target.getAttribute("data-tab") as TabId;
            if (tabId) setActiveTab(tabId);
          }
        }
      },
      { root: container, threshold: 0.5 }
    );
    TABS.forEach((tab) => {
      const el = sections[tab.id];
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [loading]);


  const scrollToTab = (tabId: TabId) => {
    const el = sectionRefs.current[tabId];
    if (!el) return;
    setActiveTab(tabId);
    el.scrollIntoView({ behavior: "smooth" });
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

  // Map statement_id → social (Schulze) ranking position
  const socialRankMap = useMemo(() => {
    if (!data) return {} as Record<string, number>;
    const m: Record<string, number> = {};
    data.statements.forEach((s) => { if (s.social_ranking != null) m[s.id] = s.social_ranking; });
    return m;
  }, [data]);

  const agentNameMap = useMemo(() => {
    const m: Record<string, string> = {};
    agents.forEach((a) => { m[a.agent_id] = a.agent_name; });
    return m;
  }, [agents]);

  const agentContributions = useMemo(() => {
    if (!data) return new Map<string, Set<string>>();
    const m = new Map<string, Set<string>>();
    data.statements.forEach((s) => {
      if (s.contributed_by_agent_id) {
        if (!m.has(s.contributed_by_agent_id)) m.set(s.contributed_by_agent_id, new Set());
        m.get(s.contributed_by_agent_id)!.add(s.id);
      }
    });
    return m;
  }, [data]);

  if (loading) {
    return (
      <div style={{
        position: "fixed", top: 64, left: 0, right: 0, bottom: 0, zIndex: 50,
        background: "#faf7f0", color: "#1a1a1a", fontFamily: "var(--font-dm-sans), sans-serif",
        display: "flex", flexDirection: "column",
      }}>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 20, padding: "0 24px" }}>
          {/* Title shimmer */}
          <div style={{ width: "min(500px, 80%)", height: 28, borderRadius: 8, background: "#e8e4dc" }} className="animate-pulse" />
          {/* Subtitle shimmer */}
          <div style={{ width: "min(300px, 50%)", height: 14, borderRadius: 6, background: "#e8e4dc" }} className="animate-pulse" />
          {/* Spinner */}
          <motion.div animate={{ rotate: 360 }} transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
            style={{ width: 28, height: 28, border: "2.5px solid #e8e4dc", borderTopColor: "#c84a20", borderRadius: "50%", marginTop: 8 }} />
        </div>
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
  const isLive = true;

  return (
    <>
      <div style={{
        position: "fixed", top: 64, left: 0, right: 0, bottom: 0, zIndex: 50,
        background: "#faf7f0",
        color: "#1a1a1a", fontFamily: "var(--font-dm-sans), sans-serif",
        display: "flex", flexDirection: "column",
      }}>
        <BubbleField />

        {/* ─── Invite link banner (shown after creating a private deliberation) ─── */}
        {showInviteBanner && inviteUrl && (
          <div style={{
            position: "relative", zIndex: 10,
            display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
            padding: "10px 16px",
            background: "#fff8f0", borderBottom: "1px solid #e8e4dc",
            fontSize: 13,
          }}>
            <span style={{ color: "#666", whiteSpace: "nowrap" }}>Share this link to invite others:</span>
            <code style={{
              flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              padding: "4px 8px", borderRadius: 6, background: "#f5f0e8", fontSize: 12, color: "#333",
            }}>{inviteUrl}</code>
            <button
              onClick={() => { navigator.clipboard.writeText(inviteUrl); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
              style={{
                padding: "4px 12px", borderRadius: 6, border: `1px solid ${copied ? "#1a8a5030" : "#e8e4dc"}`,
                background: copied ? "#1a8a5010" : "#fff", fontSize: 12, color: copied ? "#1a8a50" : "#c84a20", cursor: "pointer", whiteSpace: "nowrap",
                transition: "all 0.2s",
              }}
            >
              {copied ? "Copied!" : "Copy"}
            </button>
            <button
              onClick={() => setShowInviteBanner(false)}
              style={{ background: "none", border: "none", cursor: "pointer", fontSize: 16, color: "#999", padding: "0 4px" }}
            >
              ×
            </button>
          </div>
        )}

        {/* ─── Snap scroll container ─── */}
        <div ref={scrollContainerRef} style={{
          flex: 1, overflowY: "auto", overflowX: "hidden",
          position: "relative", zIndex: 1,
          maxWidth: "100vw", paddingBottom: 60,
        }}>

          {/* ═══ CONSENSUS ═══ */}
          <div ref={(el) => { sectionRefs.current.consensus = el; }} data-tab="consensus" style={{
            width: "100%", minHeight: "100%",             display: "flex", flexDirection: "column",
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
              {d.community_id && d.community_name && (
                <a
                  href={`/communities/${d.community_id}`}
                  style={{
                    fontSize: 10, fontWeight: 600, color: "#3b82f6",
                    background: "#eff6ff", border: "1px solid #bfdbfe",
                    padding: "2px 10px", borderRadius: 999,
                    textDecoration: "none", whiteSpace: "nowrap",
                  }}
                >
                  {d.community_name}
                </a>
              )}
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
                  {/* Share icon — top right of card */}
                  <div style={{ marginLeft: "auto" }}>
                    <ShareButton
                      url={d.is_private && d.invite_code
                        ? `${typeof window !== "undefined" ? window.location.origin : ""}/invite/${d.invite_code}`
                        : `${typeof window !== "undefined" ? window.location.origin : ""}/deliberations/${id}`
                      }
                    />
                  </div>
                </div>
                {winner.title && (
                  <div style={{ fontSize: 15, fontWeight: 700, color: "#1a1a1a", marginBottom: 10 }} className="prose-compact">
                    <ReactMarkdown>{winner.title}</ReactMarkdown>
                  </div>
                )}
                <div style={{ fontSize: "clamp(14px, 2vw, 16px)", fontWeight: 500, color: "#333", lineHeight: 1.75, marginBottom: 28 }} className="prose-compact">
                  <ReactMarkdown>{winner.statement_text}</ReactMarkdown>
                </div>
                {/* Rating thumbs — bottom right of card */}
                <ConsensusRatingWidget deliberationId={id} winnerId={winner.id} />
              </motion.div>
            )}

            {/* Join deliberation CTA */}
            <motion.div
              initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5, duration: 0.4 }}
              style={{ marginTop: 32, width: "100%", maxWidth: 540, display: "flex", justifyContent: "center" }}
            >
              {!session?.user ? (
                <button
                  onClick={() => signIn.social({ provider: "google", callbackURL: `/deliberations/${id}` })}
                  style={{
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "10px 24px", borderRadius: 999, border: "1.5px solid rgba(0,0,0,0.08)",
                    background: "rgba(255,255,255,0.7)", cursor: "pointer",
                    fontSize: 13, color: "#666", fontWeight: 500,
                    transition: "all 0.2s",
                  }}
                >
                  Sign in to join this deliberation
                </button>
              ) : interviewCompleted || alreadyParticipating ? (
                <div style={{
                  display: "flex", alignItems: "center", gap: 6,
                  fontSize: 12, color: "#1a8a50", fontWeight: 600,
                }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#1a8a50", display: "inline-block", animation: "pulse 1.5s infinite" }} />
                  Your agent is participating
                </div>
              ) : agentType === "hosted" ? (
                <button
                  onClick={handleJoinDeliberation}
                  style={{
                    padding: "12px 28px", borderRadius: 999, border: "none",
                    background: "#c84a20", color: "#fff", cursor: "pointer",
                    fontSize: 14, fontWeight: 600, letterSpacing: -0.2,
                    boxShadow: "0 2px 12px rgba(200,74,32,0.2)",
                    transition: "all 0.2s",
                  }}
                >
                  Join this Deliberation
                </button>
              ) : agentType === "openclaw" ? (
                <div style={{
                  padding: "10px 20px", borderRadius: 999,
                  background: "rgba(0,0,0,0.03)", border: "1.5px solid rgba(0,0,0,0.06)",
                  fontSize: 12, color: "#999",
                }}>
                  Manage participation from your OpenClaw agent
                </div>
              ) : agentType === "none" && session?.user ? (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                  <Link
                    href="/create-agent"
                    style={{
                      padding: "12px 28px", borderRadius: 999, border: "none",
                      background: "#c84a20", color: "#fff",
                      fontSize: 13, fontWeight: 600, textDecoration: "none",
                      boxShadow: "0 2px 12px rgba(200,74,32,0.2)",
                      transition: "all 0.2s",
                    }}
                  >
                    Create a HaberAgent to join
                  </Link>
                  <Link
                    href="/settings"
                    style={{
                      fontSize: 11, color: "#999", textDecoration: "underline",
                      textUnderlineOffset: 2,
                    }}
                  >
                    I have an OpenClaw agent
                  </Link>
                </div>
              ) : null}
            </motion.div>

            {/* Agent lobsters */}
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }}
              style={{ display: "flex", gap: 4, marginTop: 48, overflowX: "auto", padding: "0 8px", maxWidth: "min(90vw, 640px)", flexShrink: 0, scrollbarWidth: "none" }}
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
          <div ref={(el) => { sectionRefs.current.statements = el; }} data-tab="statements" style={{
            width: "100%", minHeight: "100%",             display: "flex", flexDirection: "column", alignItems: "center",
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
                gridTemplateColumns: clusterPoints.length >= 2 ? "repeat(auto-fit, minmax(min(400px, 100%), 1fr))" : "1fr",
                gap: 24,
                alignItems: "start",
              }}>
                {/* Left: Statement list */}
                <div style={{
                  display: "flex", flexDirection: "column", gap: 12,
                  maxHeight: rightColHeight > 0 ? rightColHeight : "calc(100vh - 220px)", overflowY: "auto",
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
                            <div style={{ fontSize: 14, fontWeight: 700, color: "#1a1a1a", marginBottom: 6 }} className="prose-compact">
                              <ReactMarkdown>{s.title}</ReactMarkdown>
                            </div>
                          )}
                          <div style={{ fontSize: 13, lineHeight: 1.7, color: "#333" }} className="prose-compact">
                            <ReactMarkdown>{s.statement_text}</ReactMarkdown>
                          </div>
                          {s.is_seed && s.meta_data?.seed_opinions?.length > 0 && (
                            <SeedOpinions opinions={s.meta_data.seed_opinions} />
                          )}
                        </motion.div>
                      );
                    })}
                </div>

                {/* Right: Statement Landscape */}
                {clusterPoints.length >= 2 && (
                  <div ref={rightColRef} style={{ position: "sticky", top: 0 }}>
                    <div style={{
                      borderRadius: 16, overflow: "hidden",
                      background: "rgba(235,228,218,0.95)", border: "1.5px solid rgba(0,0,0,0.10)",
                      padding: "16px",
                    }}>
                      <div style={{ textAlign: "center", marginBottom: 12 }}>
                        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 3, color: "#888", textTransform: "uppercase" }}>
                          Statement Landscape
                        </span>
                        <p style={{ fontSize: 11, color: "#bbb", marginTop: 4 }}>
                          Proximity = semantic similarity. Size &amp; colour = social ranking.
                        </p>
                      </div>
                      <StatementCluster points={clusterPoints} />
                    </div>

                    {/* Ranking Distribution (Ridgeline) */}
                    {data && data.rankings.length >= 2 && (
                      <div style={{ marginTop: 24 }}>
                        <div style={{
                          borderRadius: 16, overflow: "hidden",
                          background: "rgba(235,228,218,0.95)", border: "1.5px solid rgba(0,0,0,0.10)",
                          padding: "16px",
                        }}>
                          <div style={{ textAlign: "center", marginBottom: 12 }}>
                            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 3, color: "#888", textTransform: "uppercase" }}>
                              Ranking Distribution
                            </span>
                            <p style={{ fontSize: 11, color: "#bbb", marginTop: 4 }}>
                              How agents ranked each statement. Tighter peaks = more agreement.
                            </p>
                          </div>
                          <RankingRidgeline statements={data.statements} rankings={data.rankings} />
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ═══ AGENTS ═══ */}
          <div ref={(el) => { sectionRefs.current.agents = el; }} data-tab="agents" style={{
            width: "100%", minHeight: "100%",             padding: "32px 24px 80px", position: "relative",
          }}>
          <div style={{ maxWidth: 1200, margin: "0 auto" }}>
            <div style={{ textAlign: "center", marginBottom: 20 }}>
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 3, color: "#888", textTransform: "uppercase" }}>
                {agents.length} Agents
              </span>
              <p style={{ fontSize: 12, color: "#aaa", marginTop: 6, maxWidth: 420, marginLeft: "auto", marginRight: "auto" }}>
                AI agents representing human participants — their opinions and rankings
              </p>
            </div>

            {/* Cluster proportion bar — compact strip at the top */}
            {opinionClusters.length > 0 && (
              <div style={{ marginBottom: 20, maxWidth: 600, marginLeft: "auto", marginRight: "auto" }}>
                <ClusterBar clusters={opinionClusters} />
              </div>
            )}

            {/* Two-column layout: agent cards left, opinion landscape right (sticky) */}
            <div style={{
              display: "grid",
              gridTemplateColumns: opinionClusterPoints.length >= 2 ? "repeat(auto-fit, minmax(min(400px, 100%), 1fr))" : "1fr",
              gap: 24,
              alignItems: "start",
            }}>
              {/* Left: Agent cards — masonry grid */}
              <div style={{
                columns: opinionClusterPoints.length >= 2 ? "240px" : "280px",
                columnGap: 14,
                width: "100%",
              }}>
                {agents.map((a, i) => (
                  <motion.div key={a.agent_id}
                    initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: "-30px" }} transition={{ delay: i * 0.03 }}
                    whileHover={{ y: -3, boxShadow: `0 6px 24px ${a.color}10` }}
                    onClick={() => setSelectedAgent(a)}
                    style={{
                      padding: "16px", borderRadius: 16,
                      background: "rgba(255,255,255,0.65)", border: "1.5px solid rgba(0,0,0,0.05)",
                      cursor: "pointer", transition: "box-shadow 0.3s",
                      breakInside: "avoid",
                      marginBottom: 14,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                      <motion.div animate={{ y: [0, -2, 0] }} transition={{ duration: 2.5, repeat: Infinity, delay: i * 0.15 }}>
                        <Lobster color={a.color} size={32} variant={i} />
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
                      <div style={{
                        fontSize: 12, lineHeight: 1.6, color: "#555", marginBottom: 10,
                      }} className="prose-compact">
                        <ReactMarkdown>{`\u201C${a.opinion}\u201D`}</ReactMarkdown>
                      </div>
                    )}

                    {/* Compact inline rankings: circles show social (Schulze) rank */}
                    {a.rankings.length > 0 && (() => {
                      const sorted = [...a.rankings].sort((x, y) => x.rank - y.rank);
                      return (
                        <div style={{
                          display: "flex", alignItems: "center", flexWrap: "wrap",
                          gap: 2, padding: "6px 0 2px",
                        }}>
                          {sorted.map((r, ri) => {
                            const title = stmtMap[r.statement_id] || `#${r.rank}`;
                            const socialRank = socialRankMap[r.statement_id] ?? "?";
                            return (
                              <span key={ri} style={{ display: "inline-flex", alignItems: "center" }}>
                                <span
                                  title={`${title} (consensus #${socialRank})`}
                                  style={{
                                    display: "inline-flex", alignItems: "center", justifyContent: "center",
                                    width: 22, height: 22, borderRadius: "50%",
                                    background: ri === 0 ? a.color : ri < 3 ? `${a.color}30` : "rgba(0,0,0,0.06)",
                                    color: ri === 0 ? "#fff" : ri < 3 ? a.color : "#999",
                                    fontSize: 9, fontWeight: 700,
                                    flexShrink: 0,
                                    border: ri === 0 ? `1.5px solid ${a.color}` : "1px solid transparent",
                                  }}
                                >
                                  {socialRank}
                                </span>
                                {ri < sorted.length - 1 && (
                                  <span style={{ color: "#ccc", fontSize: 9, margin: "0 1px" }}>&rsaquo;</span>
                                )}
                              </span>
                            );
                          })}
                          <span style={{ fontSize: 9, color: "#bbb", marginLeft: 4 }}>
                            {sorted.length} ranked
                          </span>
                        </div>
                      );
                    })()}
                  </motion.div>
                ))}
              </div>

              {/* Right: Opinion Landscape (sticky) */}
              {opinionClusterPoints.length >= 2 && opinionClusters.length > 0 && (
                <div style={{ position: "sticky", top: 0 }}>
                  <div style={{
                    borderRadius: 16, overflow: "hidden",
                    background: "rgba(235,228,218,0.95)", border: "1.5px solid rgba(0,0,0,0.10)",
                    padding: "12px",
                  }}>
                    <div style={{ textAlign: "center", marginBottom: 8 }}>
                      <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 2, color: "#888", textTransform: "uppercase" }}>
                        Opinion Landscape
                      </span>
                      <p style={{ fontSize: 11, color: "#bbb", marginTop: 4 }}>
                        Proximity = semantic similarity. Colour = opinion group.
                      </p>
                    </div>
                    <OpinionLandscape
                      points={opinionClusterPoints}
                      clusters={opinionClusters}
                      onPointClick={(pt) => {
                        const match = agents.find((a) => a.agent_id === pt.agent_id);
                        if (match) setSelectedAgent(match);
                      }}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Activity feed */}
            <InlineActivityFeed data={data} />
          </div>
          </div>

        </div>{/* end scroll container */}

        {/* ─── Floating Pill Nav ─── */}
        <div style={{
          position: "absolute", bottom: "max(28px, env(safe-area-inset-bottom, 20px))", left: "50%", transform: "translateX(-50%)",
          zIndex: 10, display: "flex", gap: 3, padding: 3,
          borderRadius: 999, background: "rgba(255,255,255,0.7)",
          backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)",
          border: "1px solid rgba(0,0,0,0.06)",
          boxShadow: "0 2px 16px rgba(0,0,0,0.06)",
        }}>
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => scrollToTab(tab.id)}
              style={{
                padding: "6px 16px", borderRadius: 999, border: "none",
                cursor: "pointer", fontSize: 11, fontWeight: activeTab === tab.id ? 700 : 400,
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

      {/* Agent Drawer */}
      <AnimatePresence>
        {selectedAgent && (
          <AgentDrawer agent={selectedAgent} stmtMap={stmtMap} contributedIds={agentContributions.get(selectedAgent.agent_id) || new Set()} onClose={() => setSelectedAgent(null)} />
        )}
      </AnimatePresence>

      {/* Setup prompt modal for bare agents */}
      <AnimatePresence>
        {showSetupPrompt && (
          <motion.div
            className="fixed inset-0 z-[400] flex items-center justify-center p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <motion.div
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
              onClick={() => setShowSetupPrompt(false)}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            />
            <motion.div
              className="relative w-full max-w-md overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-2xl"
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ duration: 0.2 }}
            >
              <button
                onClick={() => setShowSetupPrompt(false)}
                className="absolute right-3 top-3 rounded-full p-1.5 text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-600"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>

              <div className="p-8 text-center">
                <div className="mb-3 text-4xl">🦞</div>
                <h2 className="font-handwritten text-2xl font-bold text-stone-800">
                  Your agent just represented you!
                </h2>
                <p className="mt-2 mb-6 text-sm leading-relaxed text-stone-500">
                  Set up its profile so it can do even better next time.
                </p>

                <Link
                  href="/create-agent"
                  onClick={() => setShowSetupPrompt(false)}
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-red-500 px-8 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:bg-red-600 hover:shadow-md active:scale-[0.98]"
                >
                  Set up my agent
                </Link>

                <button
                  onClick={() => setShowSetupPrompt(false)}
                  className="mt-4 block w-full text-sm text-stone-400 transition-colors hover:text-stone-600"
                >
                  Skip for now
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating deliberation chat bubble */}
      {agentType === "hosted" && data && (
        <DeliberationChatBubble
          ref={chatBubbleRef}
          deliberationId={id}
          deliberationQuestion={data.deliberation.question}
          alreadyParticipating={alreadyParticipating || interviewCompleted}
          onJoinComplete={() => {
            setInterviewCompleted(true);
            if (!hasProfile) setShowSetupPrompt(true);
          }}
          onScrollToAgents={() => scrollToTab("agents")}
        />
      )}

      <style>{`
        @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }
        /* Hide scrollbars globally */
        div::-webkit-scrollbar { display: none; }
        div { scrollbar-width: none; }
        /* Horizontal scroll container: vertical wheel → horizontal scroll */
        .horizontal-scroll-container {
          scroll-behavior: smooth;
        }
        /* Compact prose for ReactMarkdown inside cards */
        .prose-compact p { margin: 0 0 0.5em 0; }
        .prose-compact p:last-child { margin-bottom: 0; }
        .prose-compact > p:only-child { margin: 0; }
      `}</style>
    </>
  );
}
