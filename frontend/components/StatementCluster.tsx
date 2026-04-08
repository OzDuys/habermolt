"use client";

import { useMemo } from "react";
import * as d3 from "d3";
import type { ClusterPoint } from "@/lib/types";

interface ConsensusHistoryEntry {
  statement_id: string;
  lost_at: string;
}

interface StatementClusterProps {
  points: ClusterPoint[];
  /** Ordered list of previous consensus winners (oldest first) */
  consensusHistory?: ConsensusHistoryEntry[];
  /** Fired when user clicks on a statement dot */
  onStatementClick?: (statementId: string) => void;
}

const WIDTH = 720;
const HEIGHT = 480;
const PADDING = 56;

function rankColor(ranking: number | null, isEvicted?: boolean): string {
  if (isEvicted) return "#c0bbb5";
  if (ranking === null) return "#a8a29e";
  if (ranking === 1) return "#f59e0b";
  if (ranking === 2) return "#60a5fa";
  if (ranking === 3) return "#34d399";
  if (ranking <= 6) return "#a78bfa";
  return "#a8a29e";
}

function rankRadius(ranking: number | null, isEvicted?: boolean): number {
  if (isEvicted) return 5;
  if (ranking === null) return 6;
  if (ranking === 1) return 18;
  if (ranking === 2) return 13;
  if (ranking === 3) return 11;
  if (ranking <= 6) return 9;
  return 6;
}

function rankOpacity(ranking: number | null, isEvicted?: boolean): number {
  if (isEvicted) return 0.35;
  if (ranking === null) return 0.5;
  if (ranking === 1) return 1.0;
  if (ranking === 2) return 0.9;
  if (ranking === 3) return 0.8;
  return 0.65;
}

// Compute edges between nearby points (proximity threshold)
function computeEdges(
  points: ClusterPoint[],
  xScale: d3.ScaleLinear<number, number>,
  yScale: d3.ScaleLinear<number, number>,
  threshold: number
) {
  const edges: { x1: number; y1: number; x2: number; y2: number; dist: number }[] = [];
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const x1 = xScale(points[i].x);
      const y1 = yScale(points[i].y);
      const x2 = xScale(points[j].x);
      const y2 = yScale(points[j].y);
      const dist = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
      if (dist < threshold) {
        edges.push({ x1, y1, x2, y2, dist });
      }
    }
  }
  return edges;
}

export default function StatementCluster({ points, consensusHistory = [], onStatementClick }: StatementClusterProps) {

  const { xScale, yScale } = useMemo(() => {
    if (points.length < 2) return { xScale: null, yScale: null };

    const xExtent = d3.extent(points, (p) => p.x) as [number, number];
    const yExtent = d3.extent(points, (p) => p.y) as [number, number];

    const xPad = (xExtent[1] - xExtent[0]) * 0.15 || 1;
    const yPad = (yExtent[1] - yExtent[0]) * 0.15 || 1;

    return {
      xScale: d3
        .scaleLinear()
        .domain([xExtent[0] - xPad, xExtent[1] + xPad])
        .range([PADDING, WIDTH - PADDING]),
      yScale: d3
        .scaleLinear()
        .domain([yExtent[0] - yPad, yExtent[1] + yPad])
        .range([HEIGHT - PADDING, PADDING]),
    };
  }, [points]);

  const edges = useMemo(() => {
    if (!xScale || !yScale) return [];
    return computeEdges(points, xScale, yScale, 140);
  }, [points, xScale, yScale]);

  // Build consensus trail: ordered coordinates of historical winners + current winner
  const consensusTrail = useMemo(() => {
    if (!xScale || !yScale || consensusHistory.length === 0) return [];
    const pointMap = new Map(points.map((p) => [p.id, p]));
    const trail: { x: number; y: number; id: string; isCurrent: boolean }[] = [];

    // Historical winners in chronological order (oldest first)
    for (const entry of consensusHistory) {
      const pt = pointMap.get(entry.statement_id);
      if (pt) trail.push({ x: xScale(pt.x), y: yScale(pt.y), id: pt.id, isCurrent: false });
    }

    // Current winner
    const currentWinner = points.find((p) => p.social_ranking === 1);
    if (currentWinner) {
      // Don't duplicate if current winner is also the last history entry
      if (!trail.length || trail[trail.length - 1].id !== currentWinner.id) {
        trail.push({ x: xScale(currentWinner.x), y: yScale(currentWinner.y), id: currentWinner.id, isCurrent: true });
      } else {
        trail[trail.length - 1].isCurrent = true;
      }
    }

    return trail;
  }, [points, consensusHistory, xScale, yScale]);

  if (points.length < 2 || !xScale || !yScale) return null;

  const sorted = [...points].sort((a, b) => {
    if (a.is_evicted !== b.is_evicted) return a.is_evicted ? -1 : 1;
    const ra = a.social_ranking ?? 999;
    const rb = b.social_ranking ?? 999;
    return rb - ra;
  });

  return (
    <div className="relative w-full">
      <svg
        width="100%"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="overflow-visible"
        style={{ minHeight: 320 }}
      >
        <defs>
          {/* Glow filter for winner */}
          <filter id="glow-winner" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="glow-soft" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          {/* Radial gradient for background */}
          <radialGradient id="bg-gradient" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(200,74,32,0.03)" />
            <stop offset="100%" stopColor="rgba(200,74,32,0)" />
          </radialGradient>
          {/* Gradient for consensus trail line */}
          <linearGradient id="trail-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="rgba(200,74,32,0.15)" />
            <stop offset="100%" stopColor="rgba(200,74,32,0.5)" />
          </linearGradient>
        </defs>

        {/* Background gradient */}
        <rect x="0" y="0" width={WIDTH} height={HEIGHT} fill="url(#bg-gradient)" rx="12" />

        {/* Grid dots */}
        {Array.from({ length: 7 }).map((_, xi) =>
          Array.from({ length: 5 }).map((_, yi) => (
            <circle
              key={`grid-${xi}-${yi}`}
              cx={PADDING + ((WIDTH - 2 * PADDING) / 6) * xi}
              cy={PADDING + ((HEIGHT - 2 * PADDING) / 4) * yi}
              r={1}
              fill="rgba(0,0,0,0.06)"
            />
          ))
        )}

        {/* Proximity edges */}
        {edges.map((e, i) => (
          <line
            key={`edge-${i}`}
            x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2}
            stroke="rgba(0,0,0,0.06)"
            strokeWidth={1}
            strokeDasharray="3,4"
          />
        ))}

        {/* Consensus trail — path through historical winners to current */}
        {consensusTrail.length >= 2 && (
          <g>
            {/* Trail line */}
            <polyline
              points={consensusTrail.map((t) => `${t.x},${t.y}`).join(" ")}
              fill="none"
              stroke="url(#trail-gradient)"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {/* Historical winner markers (not current) */}
            {consensusTrail.filter((t) => !t.isCurrent).map((t, i) => (
              <g key={`trail-marker-${i}`}>
                <circle
                  cx={t.x} cy={t.y} r={12}
                  fill="none"
                  stroke="#c84a20"
                  strokeWidth={1.5}
                  strokeDasharray="3,2"
                  opacity={0.3 + (i / consensusTrail.length) * 0.3}
                />
              </g>
            ))}
          </g>
        )}

        {/* Points */}
        {sorted.map((p, i) => {
          const cx = xScale(p.x);
          const cy = yScale(p.y);
          const evicted = !!p.is_evicted;
          const r = rankRadius(p.social_ranking, evicted);
          const color = rankColor(p.social_ranking, evicted);
          const isWinner = !evicted && p.social_ranking === 1;
          const isTop3 = !evicted && p.social_ranking !== null && p.social_ranking <= 3;
          return (
            <g key={p.id}>
              {/* Halo for top-ranked */}
              {isWinner && (
                <circle
                  cx={cx} cy={cy} r={r + 8}
                  fill="none" stroke={color} strokeWidth={1.5}
                  opacity={0.2}
                  filter="url(#glow-winner)"
                >
                  <animate
                    attributeName="r"
                    values={`${r + 6};${r + 12};${r + 6}`}
                    dur="3s"
                    repeatCount="indefinite"
                  />
                  <animate
                    attributeName="opacity"
                    values="0.25;0.08;0.25"
                    dur="3s"
                    repeatCount="indefinite"
                  />
                </circle>
              )}
              {/* Main circle */}
              <circle
                cx={cx} cy={cy} r={r}
                fill={color}
                stroke={isWinner ? "#d97706" : isTop3 ? color : "none"}
                strokeWidth={isWinner ? 2.5 : isTop3 ? 1.5 : 0}
                opacity={rankOpacity(p.social_ranking, evicted)}
                filter={isWinner ? "url(#glow-winner)" : isTop3 ? "url(#glow-soft)" : undefined}
                className="cursor-pointer"
                style={{ transition: "r 0.3s, opacity 0.2s" }}
                onClick={() => onStatementClick?.(p.id)}
              />
              {/* Rank label */}
              {isTop3 && (
                <text
                  x={cx} y={cy + 4}
                  textAnchor="middle"
                  fontSize={isWinner ? 11 : 9}
                  fontWeight={800}
                  fill={isWinner ? "#78350f" : "#fff"}
                  className="pointer-events-none select-none cursor-pointer"
                >
                  #{p.social_ranking}
                </text>
              )}
            </g>
          );
        })}

      </svg>

      {/* Legend */}
      <div style={{
        display: "flex", flexWrap: "wrap", justifyContent: "center",
        gap: "4px 16px", marginTop: 12, fontSize: 11, color: "#666",
      }}>
        {[
          { color: "#f59e0b", label: "Winner", size: 10 },
          { color: "#60a5fa", label: "#2", size: 8 },
          { color: "#34d399", label: "#3", size: 7 },
          { color: "#a78bfa", label: "#4–6", size: 6 },
          { color: "#a8a29e", label: "Other", size: 5 },
          { color: "#c0bbb5", label: "Evicted", size: 4, opacity: 0.35 },
        ].map((item) => (
          <span key={item.label} style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{
              width: item.size * 2, height: item.size * 2, borderRadius: "50%",
              background: item.color, opacity: (item as any).opacity ?? 0.8, flexShrink: 0,
            }} />
            {item.label}
          </span>
        ))}
        {consensusTrail.length >= 2 && (
          <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{
              width: 20, height: 2, background: "#c84a20", opacity: 0.4,
              borderRadius: 1, flexShrink: 0,
            }} />
            consensus trail
          </span>
        )}
      </div>
    </div>
  );
}
