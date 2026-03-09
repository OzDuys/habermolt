"use client";

import { useMemo, useState } from "react";
import * as d3 from "d3";
import type { OpinionClusterPoint, OpinionClusterInfo } from "@/lib/types";

interface OpinionLandscapeProps {
  points: OpinionClusterPoint[];
  clusters: OpinionClusterInfo[];
  onPointClick?: (point: OpinionClusterPoint) => void;
}

const WIDTH = 720;
const HEIGHT = 480;
const PADDING = 56;

function computeEdges(
  points: OpinionClusterPoint[],
  xScale: d3.ScaleLinear<number, number>,
  yScale: d3.ScaleLinear<number, number>,
  threshold: number,
) {
  const edges: { x1: number; y1: number; x2: number; y2: number; sameCluster: boolean }[] = [];
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const x1 = xScale(points[i].x);
      const y1 = yScale(points[i].y);
      const x2 = xScale(points[j].x);
      const y2 = yScale(points[j].y);
      const dist = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
      if (dist < threshold) {
        edges.push({ x1, y1, x2, y2, sameCluster: points[i].cluster === points[j].cluster });
      }
    }
  }
  return edges;
}

export default function OpinionLandscape({ points, clusters, onPointClick }: OpinionLandscapeProps) {
  const [tooltip, setTooltip] = useState<{
    point: OpinionClusterPoint;
    svgX: number;
    svgY: number;
  } | null>(null);

  const colorMap = useMemo(() => {
    const m: Record<number, string> = {};
    clusters.forEach((c) => { m[c.cluster_id] = c.color; });
    return m;
  }, [clusters]);

  const { xScale, yScale } = useMemo(() => {
    if (points.length < 2) return { xScale: null, yScale: null };
    const xExtent = d3.extent(points, (p) => p.x) as [number, number];
    const yExtent = d3.extent(points, (p) => p.y) as [number, number];
    const xPad = (xExtent[1] - xExtent[0]) * 0.15 || 1;
    const yPad = (yExtent[1] - yExtent[0]) * 0.15 || 1;
    return {
      xScale: d3.scaleLinear().domain([xExtent[0] - xPad, xExtent[1] + xPad]).range([PADDING, WIDTH - PADDING]),
      yScale: d3.scaleLinear().domain([yExtent[0] - yPad, yExtent[1] + yPad]).range([HEIGHT - PADDING, PADDING]),
    };
  }, [points]);

  const edges = useMemo(() => {
    if (!xScale || !yScale) return [];
    return computeEdges(points, xScale, yScale, 140);
  }, [points, xScale, yScale]);

  if (points.length < 2 || !xScale || !yScale) return null;

  const truncate = (text: string, max = 120) =>
    text.length > max ? text.slice(0, max) + "\u2026" : text;

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
          <filter id="glow-opinion" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <radialGradient id="bg-gradient-opinion" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(42,111,176,0.03)" />
            <stop offset="100%" stopColor="rgba(42,111,176,0)" />
          </radialGradient>
        </defs>

        <rect x="0" y="0" width={WIDTH} height={HEIGHT} fill="url(#bg-gradient-opinion)" rx="12" />

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
            stroke={e.sameCluster ? "rgba(0,0,0,0.08)" : "rgba(0,0,0,0.03)"}
            strokeWidth={e.sameCluster ? 1.2 : 0.8}
            strokeDasharray={e.sameCluster ? "none" : "3,4"}
          />
        ))}

        {/* Points */}
        {points.map((p) => {
          const cx = xScale(p.x);
          const cy = yScale(p.y);
          const color = colorMap[p.cluster] || "#888";
          return (
            <g key={p.id}>
              <circle
                cx={cx} cy={cy} r={10}
                fill={color}
                opacity={0.85}
                filter="url(#glow-opinion)"
                className="cursor-pointer"
                style={{ transition: "r 0.3s, opacity 0.2s" }}
                onMouseEnter={() => setTooltip({ point: p, svgX: cx, svgY: cy })}
                onClick={() => onPointClick?.(p)}
              />
            </g>
          );
        })}

        {/* Tooltip */}
        {tooltip &&
          (() => {
            const TOOLTIP_W = 260;
            const TOOLTIP_H = 100;
            const tx = Math.min(tooltip.svgX + 18, WIDTH - TOOLTIP_W - 8);
            const ty = Math.max(tooltip.svgY - TOOLTIP_H - 12, 8);
            const clusterInfo = clusters.find((c) => c.cluster_id === tooltip.point.cluster);
            return (
              <foreignObject
                x={tx} y={ty}
                width={TOOLTIP_W} height={TOOLTIP_H}
                className="pointer-events-none"
              >
                <div
                  style={{
                    background: "#fffcf7",
                    border: `1.5px solid ${colorMap[tooltip.point.cluster] || "#888"}30`,
                    borderRadius: 12,
                    padding: "10px 14px",
                    fontSize: 12,
                    lineHeight: 1.5,
                    color: "#444",
                    boxShadow: "0 4px 20px rgba(0,0,0,0.08)",
                  }}
                >
                  <span style={{
                    display: "flex", alignItems: "center", gap: 6,
                    fontWeight: 700, fontSize: 11, marginBottom: 4,
                    color: colorMap[tooltip.point.cluster] || "#888",
                  }}>
                    <span style={{
                      width: 8, height: 8, borderRadius: "50%",
                      background: colorMap[tooltip.point.cluster] || "#888",
                      flexShrink: 0,
                    }} />
                    {tooltip.point.agent_name}
                    {clusterInfo && (
                      <span style={{ fontWeight: 400, color: "#999", fontSize: 10 }}>
                        &middot; {clusterInfo.label}
                      </span>
                    )}
                  </span>
                  {truncate(tooltip.point.opinion_text.replace(/[#*_`]/g, ""))}
                </div>
              </foreignObject>
            );
          })()}
      </svg>

      {/* Legend — cluster labels */}
      <div style={{
        display: "flex", flexWrap: "wrap", justifyContent: "center",
        gap: "4px 16px", marginTop: 12, fontSize: 11, color: "#aaa",
      }}>
        {clusters.map((c) => (
          <span key={c.cluster_id} style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{
              width: 10, height: 10, borderRadius: "50%",
              background: c.color, opacity: 0.85, flexShrink: 0,
            }} />
            {c.label}
          </span>
        ))}
      </div>
    </div>
  );
}
