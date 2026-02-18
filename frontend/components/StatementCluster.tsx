"use client";

import { useMemo, useState } from "react";
import * as d3 from "d3";
import type { ClusterPoint } from "@/lib/types";

interface StatementClusterProps {
  points: ClusterPoint[];
}

const WIDTH = 480;
const HEIGHT = 360;
const PADDING = 44;

function rankColor(ranking: number | null): string {
  if (ranking === null) return "#a8a29e";   // stone-400 — unranked
  if (ranking === 1) return "#f59e0b";      // amber-400 — winner
  if (ranking === 2) return "#60a5fa";      // blue-400
  if (ranking === 3) return "#34d399";      // emerald-400
  if (ranking <= 6) return "#a78bfa";      // violet-400
  return "#d1d5db";                         // gray-300
}

function rankRadius(ranking: number | null): number {
  if (ranking === null) return 5;
  if (ranking === 1) return 14;
  if (ranking === 2) return 10;
  if (ranking === 3) return 8;
  if (ranking <= 6) return 7;
  return 5;
}

function rankOpacity(ranking: number | null): number {
  if (ranking === null) return 0.45;
  if (ranking === 1) return 1.0;
  if (ranking === 2) return 0.85;
  if (ranking === 3) return 0.75;
  return 0.6;
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

    // Add 15% padding so points don't sit on the edge
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
        .range([HEIGHT - PADDING, PADDING]), // SVG y is inverted
    };
  }, [points]);

  if (points.length < 2 || !xScale || !yScale) return null;

  // Render lower-ranked points first so the winner sits on top
  const sorted = [...points].sort((a, b) => {
    const ra = a.social_ranking ?? 999;
    const rb = b.social_ranking ?? 999;
    return rb - ra;
  });

  const truncate = (text: string, max = 130) =>
    text.length > max ? text.slice(0, max) + "…" : text;

  return (
    <div className="relative w-full">
      <svg
        width="100%"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="overflow-visible"
        onMouseLeave={() => setTooltip(null)}
      >
        {/* Subtle centre crosshairs */}
        <line
          x1={PADDING}
          y1={HEIGHT / 2}
          x2={WIDTH - PADDING}
          y2={HEIGHT / 2}
          stroke="currentColor"
          strokeOpacity={0.07}
          strokeWidth={1}
          className="text-gray-500"
        />
        <line
          x1={WIDTH / 2}
          y1={PADDING}
          x2={WIDTH / 2}
          y2={HEIGHT - PADDING}
          stroke="currentColor"
          strokeOpacity={0.07}
          strokeWidth={1}
          className="text-gray-500"
        />

        {/* Points */}
        {sorted.map((p) => {
          const cx = xScale(p.x);
          const cy = yScale(p.y);
          return (
            <circle
              key={p.id}
              cx={cx}
              cy={cy}
              r={rankRadius(p.social_ranking)}
              fill={rankColor(p.social_ranking)}
              stroke={p.social_ranking === 1 ? "#d97706" : "none"}
              strokeWidth={p.social_ranking === 1 ? 2.5 : 0}
              opacity={rankOpacity(p.social_ranking)}
              className="cursor-pointer transition-opacity duration-100 hover:opacity-100"
              onMouseEnter={() => setTooltip({ point: p, svgX: cx, svgY: cy })}
            />
          );
        })}

        {/* Rank labels for top-3 */}
        {sorted
          .filter((p) => p.social_ranking !== null && p.social_ranking <= 3)
          .map((p) => (
            <text
              key={`label-${p.id}`}
              x={xScale(p.x)}
              y={yScale(p.y) + 4}
              textAnchor="middle"
              fontSize={p.social_ranking === 1 ? 10 : 8}
              fontWeight={700}
              fill={p.social_ranking === 1 ? "#78350f" : "#1e3a5f"}
              className="pointer-events-none select-none"
            >
              #{p.social_ranking}
            </text>
          ))}

        {/* Hover tooltip as foreignObject for proper text wrapping */}
        {tooltip &&
          (() => {
            const TOOLTIP_W = 210;
            const TOOLTIP_H = 80;
            const tx = Math.min(
              tooltip.svgX + 16,
              WIDTH - TOOLTIP_W - 4
            );
            const ty = Math.max(tooltip.svgY - TOOLTIP_H - 10, 4);
            return (
              <foreignObject
                x={tx}
                y={ty}
                width={TOOLTIP_W}
                height={TOOLTIP_H}
                className="pointer-events-none"
              >
                <div
                  className="rounded-lg border px-3 py-2 text-xs shadow-lg"
                  style={{
                    background: "var(--surface)",
                    borderColor: "var(--border)",
                    color: "var(--foreground)",
                    lineHeight: "1.45",
                  }}
                >
                  {tooltip.point.social_ranking !== null && (
                    <span
                      className="mb-1 block font-bold"
                      style={{
                        color:
                          tooltip.point.social_ranking === 1
                            ? "#d97706"
                            : "var(--accent)",
                      }}
                    >
                      Rank #{tooltip.point.social_ranking}
                    </span>
                  )}
                  {truncate(
                    tooltip.point.statement_text.replace(/[#*_`]/g, "")
                  )}
                </div>
              </foreignObject>
            );
          })()}
      </svg>

      {/* Legend */}
      <div
        className="mt-3 flex flex-wrap justify-center gap-x-5 gap-y-1 text-xs"
        style={{ color: "var(--muted)" }}
      >
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3.5 w-3.5 rounded-full bg-amber-400" />
          Winner (#1)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-full bg-blue-400" />
          #2
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-400" />
          #3
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-full bg-violet-400" />
          #4–6
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-full bg-stone-400 opacity-50" />
          Unranked
        </span>
      </div>

      <p
        className="mt-2 text-center text-xs"
        style={{ color: "var(--muted)" }}
      >
        Position = semantic similarity &nbsp;·&nbsp; Size &amp; colour = social ranking
      </p>
    </div>
  );
}
