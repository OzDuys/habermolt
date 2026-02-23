"use client";

import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import * as d3 from "d3";
import type { ClusterPoint } from "@/lib/types";

interface StatementClusterProps {
  points: ClusterPoint[];
}

const WIDTH = 720;
const HEIGHT = 480;
const PADDING = 56;

function rankColor(ranking: number | null): string {
  if (ranking === null) return "#a8a29e";
  if (ranking === 1) return "#f59e0b";
  if (ranking === 2) return "#60a5fa";
  if (ranking === 3) return "#34d399";
  if (ranking <= 6) return "#a78bfa";
  return "#d1d5db";
}

function rankRadius(ranking: number | null): number {
  if (ranking === null) return 6;
  if (ranking === 1) return 18;
  if (ranking === 2) return 13;
  if (ranking === 3) return 11;
  if (ranking <= 6) return 9;
  return 6;
}

function rankOpacity(ranking: number | null): number {
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

export default function StatementCluster({ points }: StatementClusterProps) {
  const [tooltip, setTooltip] = useState<{
    point: ClusterPoint;
    svgX: number;
    svgY: number;
  } | null>(null);

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

  if (points.length < 2 || !xScale || !yScale) return null;

  const sorted = [...points].sort((a, b) => {
    const ra = a.social_ranking ?? 999;
    const rb = b.social_ranking ?? 999;
    return rb - ra;
  });

  const truncate = (text: string, max = 140) =>
    text.length > max ? text.slice(0, max) + "…" : text;

  return (
    <div className="relative w-full">
      <svg
        width="100%"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="overflow-visible"
        onMouseLeave={() => setTooltip(null)}
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

        {/* Points */}
        {sorted.map((p, i) => {
          const cx = xScale(p.x);
          const cy = yScale(p.y);
          const r = rankRadius(p.social_ranking);
          const color = rankColor(p.social_ranking);
          const isWinner = p.social_ranking === 1;
          const isTop3 = p.social_ranking !== null && p.social_ranking <= 3;
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
                opacity={rankOpacity(p.social_ranking)}
                filter={isWinner ? "url(#glow-winner)" : isTop3 ? "url(#glow-soft)" : undefined}
                className="cursor-pointer"
                style={{ transition: "r 0.3s, opacity 0.2s" }}
                onMouseEnter={() => setTooltip({ point: p, svgX: cx, svgY: cy })}
              />
              {/* Rank label */}
              {isTop3 && (
                <text
                  x={cx} y={cy + 4}
                  textAnchor="middle"
                  fontSize={isWinner ? 11 : 9}
                  fontWeight={800}
                  fill={isWinner ? "#78350f" : "#fff"}
                  className="pointer-events-none select-none"
                >
                  #{p.social_ranking}
                </text>
              )}
            </g>
          );
        })}

        {/* Tooltip */}
        {tooltip &&
          (() => {
            const TOOLTIP_W = 240;
            const TOOLTIP_H = 90;
            const tx = Math.min(tooltip.svgX + 18, WIDTH - TOOLTIP_W - 8);
            const ty = Math.max(tooltip.svgY - TOOLTIP_H - 12, 8);
            return (
              <foreignObject
                x={tx} y={ty}
                width={TOOLTIP_W} height={TOOLTIP_H}
                className="pointer-events-none"
              >
                <div
                  style={{
                    background: "#fffcf7",
                    border: `1.5px solid ${rankColor(tooltip.point.social_ranking)}30`,
                    borderRadius: 12,
                    padding: "10px 14px",
                    fontSize: 12,
                    lineHeight: 1.5,
                    color: "#444",
                    boxShadow: "0 4px 20px rgba(0,0,0,0.08)",
                  }}
                >
                  {tooltip.point.social_ranking !== null && (
                    <span style={{
                      display: "block", fontWeight: 800, fontSize: 11,
                      color: rankColor(tooltip.point.social_ranking),
                      marginBottom: 4,
                    }}>
                      Rank #{tooltip.point.social_ranking}
                    </span>
                  )}
                  {tooltip.point.title
                    ? tooltip.point.title
                    : truncate(tooltip.point.statement_text.replace(/[#*_`]/g, ""))}
                </div>
              </foreignObject>
            );
          })()}
      </svg>

      {/* Legend */}
      <div style={{
        display: "flex", flexWrap: "wrap", justifyContent: "center",
        gap: "4px 16px", marginTop: 12, fontSize: 11, color: "#aaa",
      }}>
        {[
          { color: "#f59e0b", label: "Winner", size: 10 },
          { color: "#60a5fa", label: "#2", size: 8 },
          { color: "#34d399", label: "#3", size: 7 },
          { color: "#a78bfa", label: "#4–6", size: 6 },
          { color: "#d1d5db", label: "Other", size: 5 },
        ].map((item) => (
          <span key={item.label} style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{
              width: item.size * 2, height: item.size * 2, borderRadius: "50%",
              background: item.color, opacity: 0.8, flexShrink: 0,
            }} />
            {item.label}
          </span>
        ))}
      </div>
    </div>
  );
}
