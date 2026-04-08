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

// Smooth gradient for ranks 2–32 (winner is a standalone bright yellow)
const WINNER_COLOR = "#facc15";
const rankColorScale = d3.scaleLinear<string>()
  .domain([2, 10, 22, 32])
  .range(["#e0a020", "#c25a4a", "#9272a0", "#7e8ea0"])
  .clamp(true);

const rankRadiusScale = d3.scaleLinear()
  .domain([1, 32])
  .range([12, 5])
  .clamp(true);

const rankOpacityScale = d3.scaleLinear()
  .domain([1, 32])
  .range([1.0, 0.55])
  .clamp(true);

function rankColor(ranking: number | null, isEvicted?: boolean): string {
  if (isEvicted) return "#8a8685";
  if (ranking === null) return "#a8a29e";
  if (ranking === 1) return WINNER_COLOR;
  return rankColorScale(ranking);
}

function rankRadius(ranking: number | null, isEvicted?: boolean): number {
  if (isEvicted) return 4.5;
  if (ranking === null) return 5;
  return rankRadiusScale(ranking);
}

function rankOpacity(ranking: number | null, isEvicted?: boolean): number {
  if (isEvicted) return 0.55;
  if (ranking === null) return 0.45;
  return rankOpacityScale(ranking);
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
    // Evicted statements render first (behind everything)
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
            {/* Directional dots along segments */}
            {consensusTrail.slice(0, -1).map((t, i) => {
              const next = consensusTrail[i + 1];
              const mx = (t.x + next.x) / 2;
              const my = (t.y + next.y) / 2;
              return (
                <circle
                  key={`trail-mid-${i}`}
                  cx={mx} cy={my} r={2}
                  fill="#c84a20"
                  opacity={0.25 + (i / consensusTrail.length) * 0.35}
                />
              );
            })}
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
                  cx={cx} cy={cy} r={r + 6}
                  fill="none" stroke={color} strokeWidth={1.5}
                  opacity={0.2}
                  filter="url(#glow-winner)"
                >
                  <animate
                    attributeName="r"
                    values={`${r + 4};${r + 9};${r + 4}`}
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
                stroke={isWinner ? "#ca9a04" : isTop3 ? color : "none"}
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
                  fill="#fff"
                  className="pointer-events-none select-none cursor-pointer"
                >
                  {p.social_ranking}
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
        <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <span style={{
            width: 14, height: 14, borderRadius: "50%",
            background: WINNER_COLOR, flexShrink: 0,
          }} />
          #1
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{
            width: 60, height: 8, borderRadius: 4, flexShrink: 0,
            background: `linear-gradient(to right, ${rankColorScale(2)}, ${rankColorScale(10)}, ${rankColorScale(20)}, ${rankColorScale(32)})`,
          }} />
          <span style={{ fontSize: 10, color: "#999" }}>#1</span>
          <span style={{ fontSize: 10, color: "#999" }}>→</span>
          <span style={{ fontSize: 10, color: "#999" }}>#32</span>
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <span style={{
            width: 8, height: 8, borderRadius: "50%",
            background: "#8a8685", opacity: 0.55, flexShrink: 0,
          }} />
          Evicted
        </span>
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
