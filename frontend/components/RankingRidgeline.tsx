"use client";

import { useMemo, useState } from "react";
import * as d3 from "d3";
import type { Statement, Ranking } from "@/lib/types";

interface RankingRidgelineProps {
  statements: Statement[];
  rankings: Ranking[];
  /** Map from agent_id to cluster color — used to color each statement by its contributor */
  agentClusterColor?: Record<string, string>;
}

const WIDTH = 600;
const ROW_HEIGHT = 48;
const OVERLAP = 20;
const PAD_LEFT = 40;
const PAD_RIGHT = 24;
const PAD_TOP = 20;
const CURVE_HEIGHT = 36;

const PALETTE = [
  "#f59e0b", "#60a5fa", "#34d399", "#a78bfa", "#f472b6",
  "#fb923c", "#38bdf8", "#4ade80", "#c084fc", "#f9a8d4",
  "#fbbf24", "#93c5fd", "#6ee7b7", "#d8b4fe", "#fda4af",
  "#a8a29e",
];

function kernelDensity(data: number[], domain: [number, number], bandwidth: number, steps: number) {
  const [lo, hi] = domain;
  const pts: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const x = lo + (hi - lo) * (i / steps);
    let sum = 0;
    for (const d of data) {
      const v = (x - d) / bandwidth;
      // Epanechnikov kernel
      if (Math.abs(v) <= 1) sum += 0.75 * (1 - v * v);
    }
    pts.push([x, sum / (data.length * bandwidth)]);
  }
  return pts;
}

export default function RankingRidgeline({ statements, rankings, agentClusterColor }: RankingRidgelineProps) {
  const [hovered, setHovered] = useState<string | null>(null);

  const { rows, maxRank, maxDensity } = useMemo(() => {
    if (!statements.length || !rankings.length) return { rows: [], maxRank: 0, maxDensity: 0 };

    const maxRank = statements.length;

    // Build map: statementId -> array of ranks agents gave it
    const rankMap = new Map<string, number[]>();
    for (const r of rankings) {
      for (const entry of r.statement_rankings) {
        const sid = entry.statement_id;
        if (!rankMap.has(sid)) rankMap.set(sid, []);
        rankMap.get(sid)!.push(entry.rank);
      }
    }

    // Sort statements by social ranking (winner first)
    const sorted = [...statements]
      .filter(s => rankMap.has(s.id) && (rankMap.get(s.id)!.length >= 1))
      .sort((a, b) => (a.social_ranking ?? 999) - (b.social_ranking ?? 999));

    const bandwidth = Math.max(0.8, maxRank * 0.12);
    let maxDensity = 0;

    const rows = sorted.map((s, i) => {
      const data = rankMap.get(s.id) || [];
      const kde = kernelDensity(data, [0.5, maxRank + 0.5], bandwidth, 80);
      const peak = d3.max(kde, d => d[1]) || 0;
      if (peak > maxDensity) maxDensity = peak;
      return {
        statement: s,
        kde,
        data,
        index: i,
        mean: d3.mean(data) || 0,
        color: (agentClusterColor && s.contributed_by_agent_id && agentClusterColor[s.contributed_by_agent_id]) || "#a8a29e",
      };
    });

    return { rows, maxRank, maxDensity };
  }, [statements, rankings]);

  if (rows.length < 2 || rankings.length < 2) return null;

  const HEIGHT = PAD_TOP + rows.length * (ROW_HEIGHT - OVERLAP) + OVERLAP + 30;
  const plotWidth = WIDTH - PAD_LEFT - PAD_RIGHT;

  const xScale = d3.scaleLinear().domain([0.5, maxRank + 0.5]).range([0, plotWidth]);
  const yScale = d3.scaleLinear().domain([0, maxDensity]).range([0, CURVE_HEIGHT]);

  const areaGen = d3.area<[number, number]>()
    .x(d => xScale(d[0]))
    .y0(0)
    .y1(d => -yScale(d[1]))
    .curve(d3.curveBasis);

  return (
    <div className="relative w-full">
      <svg
        width="100%"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        style={{ minHeight: 200 }}
        onMouseLeave={() => setHovered(null)}
      >
        {/* X-axis labels */}
        {Array.from({ length: maxRank }, (_, i) => i + 1).map(rank => (
          <text
            key={`x-${rank}`}
            x={PAD_LEFT + xScale(rank)}
            y={HEIGHT - 6}
            textAnchor="middle"
            fontSize={9}
            fill="#777"
          >
            {rank}
          </text>
        ))}


        {/* Rows */}
        {rows.map((row) => {
          const yOffset = PAD_TOP + row.index * (ROW_HEIGHT - OVERLAP) + CURVE_HEIGHT;
          const isHovered = hovered === row.statement.id;
          const isFaded = hovered !== null && !isHovered;
          const rankLabel = row.statement.social_ranking !== null ? `#${row.statement.social_ranking}` : "";

          return (
            <g
              key={row.statement.id}
              transform={`translate(${PAD_LEFT}, ${yOffset})`}
              onMouseEnter={() => setHovered(row.statement.id)}
              style={{ cursor: "pointer" }}
            >
              {/* Baseline */}
              <line x1={0} y1={0} x2={plotWidth} y2={0} stroke="rgba(0,0,0,0.04)" strokeWidth={0.5} />

              {/* KDE area */}
              <path
                d={areaGen(row.kde) || ""}
                fill={row.color}
                fillOpacity={isHovered ? 0.5 : isFaded ? 0.1 : 0.3}
                stroke={row.color}
                strokeWidth={isHovered ? 1.5 : 1}
                strokeOpacity={isHovered ? 0.9 : isFaded ? 0.2 : 0.6}
                style={{ transition: "fill-opacity 0.2s, stroke-opacity 0.2s" }}
              />

              {/* Individual rank dots */}
              {row.data.map((rank, di) => (
                <circle
                  key={di}
                  cx={xScale(rank)}
                  cy={2}
                  r={isHovered ? 2.5 : 1.5}
                  fill={row.color}
                  opacity={isHovered ? 0.7 : isFaded ? 0.1 : 0.35}
                  style={{ transition: "opacity 0.2s" }}
                />
              ))}

              {/* Label */}
              <text
                x={-8}
                y={3}
                textAnchor="end"
                fontSize={11}
                fill={isHovered ? row.color : isFaded ? "#ccc" : "#777"}
                fontWeight={700}
                style={{ transition: "fill 0.2s" }}
              >
                {rankLabel}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Legend */}
      <div style={{
        display: "flex", flexWrap: "wrap", justifyContent: "center",
        gap: "4px 14px", marginTop: 8, fontSize: 10, color: "#666",
      }}>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ width: 16, height: 8, borderRadius: 2, background: "rgba(0,0,0,0.15)" }} />
          density curve
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ width: 5, height: 5, borderRadius: "50%", background: "rgba(0,0,0,0.3)" }} />
          individual votes
        </span>
      </div>
    </div>
  );
}
